<?php

declare(strict_types=1);

namespace Drupal\fun_room\Controller;

use Drupal\Core\DependencyInjection\ContainerInjectionInterface;
use Drupal\Core\Entity\EntityTypeManagerInterface;
use Drupal\Core\Flood\FloodInterface;
use Drupal\Core\Site\Settings;
use Drupal\node\NodeInterface;
use Symfony\Component\DependencyInjection\ContainerInterface;
use Symfony\Component\HttpFoundation\JsonResponse;
use Symfony\Component\HttpFoundation\Request;

/**
 * Lets the slide deck tell a room which slide is showing.
 *
 * The deck runs in the presenter's browser, so this is not a logged-in
 * session: the request carries a shared secret in X-Presenter-Key. Phones then
 * see the new slide the next time they poll the room.
 */
final class PresenterController implements ContainerInjectionInterface {

  /**
   * Wrong keys allowed per IP in the window before further tries get a 429.
   */
  public const FLOOD_LIMIT = 10;

  public const FLOOD_WINDOW = 300;

  public const FLOOD_EVENT = 'fun_room.presenter_key';

  public function __construct(
    private readonly EntityTypeManagerInterface $entityTypeManager,
    private readonly FloodInterface $flood,
  ) {}

  /**
   * {@inheritdoc}
   */
  public static function create(ContainerInterface $container): static {
    return new static(
      $container->get('entity_type.manager'),
      $container->get('flood'),
    );
  }

  /**
   * Sets a room's current slide: POST {index, id?, title?} with the presenter key.
   */
  public function slide(Request $request, string $code): JsonResponse {
    $expected = $this->expectedKey();
    if ($expected === '') {
      // Fail closed: with no key configured nobody may change a room.
      return $this->error('presenter_key_not_configured', 503);
    }

    $ip = $request->getClientIp() ?? 'unknown';
    if (!$this->flood->isAllowed(self::FLOOD_EVENT, self::FLOOD_LIMIT, self::FLOOD_WINDOW, $ip)) {
      return $this->error('too_many_attempts', 429);
    }
    if (!hash_equals($expected, (string) $request->headers->get('X-Presenter-Key', ''))) {
      $this->flood->register(self::FLOOD_EVENT, self::FLOOD_WINDOW, $ip);
      return $this->error('forbidden', 403);
    }

    $data = json_decode($request->getContent(), TRUE);
    if (!is_array($data)) {
      return $this->error('invalid_json', 400);
    }

    $index = $data['index'] ?? NULL;
    if (!is_int($index) || $index < 0 || $index > 999) {
      return $this->error('invalid_index', 422);
    }
    $id = $data['id'] ?? '';
    if ($id !== '' && (!is_string($id) || !preg_match('/^[a-z0-9][a-z0-9_-]{0,63}$/', $id))) {
      return $this->error('invalid_id', 422);
    }

    // The title is shown to attendees as plain text. Runs of whitespace (a
    // heading that wraps over several lines) collapse to one space.
    $title = $data['title'] ?? '';
    if (!is_string($title)) {
      return $this->error('invalid_title', 422);
    }
    $title = preg_replace('/\s+/u', ' ', $title);
    if ($title === NULL || preg_match('/[\x00-\x1F\x7F]/', $title) || mb_strlen($title) > 255) {
      return $this->error('invalid_title', 422);
    }
    $title = trim($title);

    $room = $this->loadRoom($code);
    if ($room === NULL) {
      return $this->error('room_not_found', 404);
    }

    // Closed rooms may still be updated; only joining is blocked when closed.
    if ((int) $room->get('field_current_slide')->value !== $index
      || (string) $room->get('field_current_slide_id')->value !== $id
      || (string) $room->get('field_current_slide_title')->value !== $title) {
      $room->set('field_current_slide', $index);
      $room->set('field_current_slide_id', $id);
      $room->set('field_current_slide_title', $title);
      $room->save();
    }

    $response = new JsonResponse(['code' => $room->label(), 'index' => $index, 'id' => $id, 'title' => $title]);
    $response->headers->set('Cache-Control', 'no-store');
    return $response;
  }

  /**
   * The configured key: the setting if present (even empty), else the env var.
   */
  private function expectedKey(): string {
    $setting = Settings::get('fun_room_presenter_key');
    return trim((string) ($setting ?? getenv('FUN_ROOM_PRESENTER_KEY')));
  }

  private function loadRoom(string $code): ?NodeInterface {
    $rooms = $this->entityTypeManager->getStorage('node')->loadByProperties([
      'type' => 'room',
      'title' => strtoupper(trim($code)),
    ]);
    $room = reset($rooms);
    return $room instanceof NodeInterface ? $room : NULL;
  }

  private function error(string $error, int $status): JsonResponse {
    $response = new JsonResponse(['error' => $error], $status);
    $response->headers->set('Cache-Control', 'no-store');
    return $response;
  }

}
