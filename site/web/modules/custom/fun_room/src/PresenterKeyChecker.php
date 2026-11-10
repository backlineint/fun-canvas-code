<?php

declare(strict_types=1);

namespace Drupal\fun_room;

use Drupal\Core\Flood\FloodInterface;
use Drupal\Core\Site\Settings;
use Symfony\Component\HttpFoundation\JsonResponse;
use Symfony\Component\HttpFoundation\Request;

/**
 * Checks the shared secret the slide deck sends as X-Presenter-Key.
 *
 * The deck runs in the presenter's browser, so there is no logged-in session. Only
 * wrong keys are counted and limited per IP; a correct key always gets through, so a
 * presenter on a shared venue address can't be locked out by other people's guesses.
 */
final class PresenterKeyChecker {

  /**
   * Wrong keys allowed per IP in the window before further wrong tries get a 429.
   */
  public const FLOOD_LIMIT = 30;

  public const FLOOD_WINDOW = 300;

  public const FLOOD_EVENT = 'fun_room.presenter_key';

  public function __construct(
    private readonly FloodInterface $flood,
  ) {}

  /**
   * Returns an error response when the request may not act as the presenter (503 with
   * no key configured, 429 after too many wrong keys, 403 for a wrong or missing
   * key), or NULL when the key is right.
   */
  public function check(Request $request): ?JsonResponse {
    $expected = $this->expectedKey();
    if ($expected === '') {
      // Fail closed: with no key configured nobody may act as the presenter.
      return $this->error('presenter_key_not_configured', 503);
    }

    if (hash_equals($expected, (string) $request->headers->get('X-Presenter-Key', ''))) {
      return NULL;
    }
    $ip = $request->getClientIp() ?? 'unknown';
    if (!$this->flood->isAllowed(self::FLOOD_EVENT, self::FLOOD_LIMIT, self::FLOOD_WINDOW, $ip)) {
      return $this->error('too_many_attempts', 429);
    }
    $this->flood->register(self::FLOOD_EVENT, self::FLOOD_WINDOW, $ip);
    return $this->error('forbidden', 403);
  }

  /**
   * The configured key: the setting if present (even empty), else the env var.
   */
  private function expectedKey(): string {
    $setting = Settings::get('fun_room_presenter_key');
    return trim((string) ($setting ?? getenv('FUN_ROOM_PRESENTER_KEY')));
  }

  private function error(string $error, int $status): JsonResponse {
    $response = new JsonResponse(['error' => $error], $status);
    $response->headers->set('Cache-Control', 'no-store');
    return $response;
  }

}
