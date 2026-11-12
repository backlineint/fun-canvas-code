<?php

declare(strict_types=1);

namespace Drupal\fun_room\Controller;

use Drupal\Core\DependencyInjection\ContainerInjectionInterface;
use Drupal\Core\Entity\EntityTypeManagerInterface;
use Drupal\fun_room\RoomRecap;
use Drupal\node\NodeInterface;
use Symfony\Component\DependencyInjection\ContainerInterface;
use Symfony\Component\HttpFoundation\JsonResponse;

/**
 * A room's end-of-session recap. Public and read-only.
 */
final class RecapController implements ContainerInjectionInterface {

  public function __construct(
    private readonly EntityTypeManagerInterface $entityTypeManager,
    private readonly RoomRecap $recap,
  ) {}

  /**
   * {@inheritdoc}
   */
  public static function create(ContainerInterface $container): static {
    return new static(
      $container->get('entity_type.manager'),
      $container->get('fun_room.room_recap'),
    );
  }

  /**
   * The room's recap. Works for open rooms too (a rehearsal), with `status` saying
   * which; the clients only show it once the room is closed.
   */
  public function recap(string $code): JsonResponse {
    $rooms = $this->entityTypeManager->getStorage('node')->loadByProperties([
      'type' => 'room',
      'title' => strtoupper(trim($code)),
    ]);
    $room = reset($rooms);
    if (!$room instanceof NodeInterface) {
      $response = new JsonResponse(['error' => 'room_not_found'], 404);
      $response->headers->set('Cache-Control', 'no-store');
      return $response;
    }

    $response = new JsonResponse($this->recap->forRoom($room));
    $response->headers->set('Cache-Control', 'public, max-age=' . RoomRecap::cacheSeconds($room));
    return $response;
  }

}
