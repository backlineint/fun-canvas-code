<?php

declare(strict_types=1);

namespace Drupal\fun_room\Controller;

use Drupal\Core\DependencyInjection\ContainerInjectionInterface;
use Drupal\Core\Entity\EntityTypeManagerInterface;
use Drupal\fun_room\RatingFeed;
use Drupal\node\NodeInterface;
use Symfony\Component\DependencyInjection\ContainerInterface;
use Symfony\Component\HttpFoundation\JsonResponse;
use Symfony\Component\HttpFoundation\Request;

/**
 * A room's slide ratings, for the deck's activity stream. Public and read-only.
 */
final class RatingController implements ContainerInjectionInterface {

  public function __construct(
    private readonly EntityTypeManagerInterface $entityTypeManager,
    private readonly RatingFeed $feed,
  ) {}

  /**
   * {@inheritdoc}
   */
  public static function create(ContainerInterface $container): static {
    return new static(
      $container->get('entity_type.manager'),
      $container->get('fun_room.rating_feed'),
    );
  }

  /**
   * The room's ratings: GET ?since={unix time}&limit={n}. Works for closed rooms.
   */
  public function list(Request $request, string $code): JsonResponse {
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

    $since = $request->query->get('since', '0');
    $limit = $request->query->get('limit', (string) RatingFeed::DEFAULT_LIMIT);
    $response = new JsonResponse([
      'ratings' => $this->feed->items(
        $room,
        is_numeric($since) ? (int) $since : 0,
        is_numeric($limit) ? (int) $limit : RatingFeed::DEFAULT_LIMIT,
      ),
    ]);
    $response->headers->set('Cache-Control', 'public, max-age=' . RatingFeed::CACHE_SECONDS);
    return $response;
  }

}
