<?php

declare(strict_types=1);

namespace Drupal\fun_room\EventSubscriber;

use Symfony\Component\EventDispatcher\EventSubscriberInterface;
use Symfony\Component\HttpKernel\Event\ResponseEvent;
use Symfony\Component\HttpKernel\KernelEvents;

/**
 * Lets a shared cache reuse the room page's status poll for a moment.
 *
 * Every phone on a room page asks for the same room (`GET /jsonapi/node/room/{uuid}`)
 * every couple of seconds. Core marks that response `no-cache, private`, so each poll
 * runs PHP. For an anonymous visitor the answer is the same for everyone, so this
 * marks it public for a couple of seconds and a cache in front (Upsun's router) can
 * answer a room full of phones from one PHP request.
 *
 * Only that single-room read is touched. The lookup by code (`/jsonapi/node/room?filter…`)
 * stays uncached, because joining must see a room that has just closed. Requests that
 * carry a session cookie or an Authorization header are left alone.
 */
final class RoomPollCacheSubscriber implements EventSubscriberInterface {

  /**
   * How long a shared cache may reuse a room status poll, in seconds.
   *
   * A room closing can show up this much late on the room page.
   */
  public const CACHE_SECONDS = 2;

  /**
   * {@inheritdoc}
   */
  public static function getSubscribedEvents(): array {
    // After core's FinishResponseSubscriber (priority 0) has set its own header.
    return [KernelEvents::RESPONSE => ['onResponse', -10]];
  }

  /**
   * Makes an anonymous room status poll publicly cacheable for a short time.
   */
  public function onResponse(ResponseEvent $event): void {
    $request = $event->getRequest();
    $response = $event->getResponse();
    if (!$event->isMainRequest() || !$request->isMethod('GET') || $response->getStatusCode() !== 200) {
      return;
    }
    // `/jsonapi/node/room/{uuid}` exactly: one more path segment, no collection.
    if (!preg_match('#^/jsonapi/node/room/[0-9a-f-]{36}$#', $request->getPathInfo())) {
      return;
    }
    if ($request->headers->has('Authorization')) {
      return;
    }
    foreach (array_keys($request->cookies->all()) as $name) {
      if (preg_match('/^SS?ESS/', (string) $name)) {
        return;
      }
    }
    $response->headers->set('Cache-Control', 'public, max-age=' . self::CACHE_SECONDS);
  }

}
