<?php

declare(strict_types=1);

namespace Drupal\fun_room\EventSubscriber;

use Drupal\Core\Flood\FloodInterface;
use Symfony\Component\EventDispatcher\EventSubscriberInterface;
use Symfony\Component\HttpKernel\Event\RequestEvent;
use Symfony\Component\HttpKernel\Exception\TooManyRequestsHttpException;
use Symfony\Component\HttpKernel\KernelEvents;

/**
 * Rate-limits participant creation per client IP.
 */
final class JoinFloodSubscriber implements EventSubscriberInterface {

  public const EVENT = 'fun_room.join';

  /**
   * Allowed joins per IP in the window. Generous so a shared venue network is
   * not blocked, while a script hammering the endpoint is.
   */
  public const LIMIT = 30;

  public const WINDOW = 300;

  public function __construct(private readonly FloodInterface $flood) {}

  /**
   * {@inheritdoc}
   */
  public static function getSubscribedEvents(): array {
    // After routing (priority 32), before access checks and the controller.
    return [KernelEvents::REQUEST => ['onRequest', 25]];
  }

  /**
   * Throws a 429 when a client joins too often.
   */
  public function onRequest(RequestEvent $event): void {
    $request = $event->getRequest();
    if (!$event->isMainRequest() || $request->getMethod() !== 'POST') {
      return;
    }
    if (!str_starts_with($request->getPathInfo(), '/jsonapi/fun_participant/fun_participant')) {
      return;
    }

    $identifier = $request->getClientIp() ?? 'unknown';
    if (!$this->flood->isAllowed(self::EVENT, self::LIMIT, self::WINDOW, $identifier)) {
      throw new TooManyRequestsHttpException(self::WINDOW, 'Too many join attempts. Try again in a few minutes.');
    }
    $this->flood->register(self::EVENT, self::WINDOW, $identifier);
  }

}
