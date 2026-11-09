<?php

declare(strict_types=1);

namespace Drupal\fun_room;

use Drupal\Component\Datetime\TimeInterface;
use Drupal\Core\Cache\CacheBackendInterface;
use Drupal\Core\Entity\EntityTypeManagerInterface;
use Drupal\fun_room\Entity\FunComment;
use Drupal\fun_room\Entity\FunParticipant;
use Drupal\node\NodeInterface;

/**
 * A room's comments as the public feed shows them.
 *
 * Only what is safe to show: the comment, who posted it (the display name and
 * avatar they chose) and the slide. No token, uuid or participant id.
 */
final class CommentFeed {

  public const DEFAULT_LIMIT = 30;

  public const MAX_LIMIT = 50;

  public const CACHE_SECONDS = 1;

  public function __construct(
    private readonly EntityTypeManagerInterface $entityTypeManager,
    private readonly CacheBackendInterface $cache,
    private readonly TimeInterface $time,
  ) {}

  /**
   * Comments in ascending id order. With $after only those newer than that id;
   * otherwise the newest $limit. Reused for a second per room, after and limit,
   * so a room full of pollers costs one query a second.
   *
   * @return list<array<string, mixed>>
   */
  public function items(NodeInterface $room, int $after, int $limit): array {
    $limit = max(1, min(self::MAX_LIMIT, $limit));
    $after = max(0, $after);
    $cid = sprintf('fun_room:comments:%d:%d:%d', $room->id(), $after, $limit);
    if ($cached = $this->cache->get($cid)) {
      return $cached->data;
    }

    $storage = $this->entityTypeManager->getStorage('fun_comment');
    $query = $storage->getQuery()->accessCheck(FALSE)->condition('room', $room->id());
    if ($after > 0) {
      $ids = $query->condition('id', $after, '>')->sort('id', 'ASC')->range(0, $limit)->execute();
    }
    else {
      $ids = array_reverse($query->sort('id', 'DESC')->range(0, $limit)->execute(), TRUE);
    }
    $comments = $storage->loadMultiple($ids);
    $participants = $this->entityTypeManager->getStorage('fun_participant')->loadMultiple(
      array_unique(array_map(fn (FunComment $c) => (int) $c->get('participant')->target_id, $comments)),
    );

    $items = [];
    foreach ($comments as $comment) {
      $participant = $participants[(int) $comment->get('participant')->target_id] ?? NULL;
      $items[] = [
        'id' => (int) $comment->id(),
        'name' => $participant instanceof FunParticipant ? (string) $participant->get('name')->value : '',
        'avatar' => $participant instanceof FunParticipant ? (int) $participant->get('avatar')->value : 0,
        'slide' => (int) $comment->get('slide')->value,
        'slideTitle' => (string) $comment->get('slide_title')->value,
        'text' => (string) $comment->get('body')->value,
        'at' => gmdate('Y-m-d\TH:i:s\Z', (int) $comment->get('created')->value),
      ];
    }

    $this->cache->set($cid, $items, $this->time->getRequestTime() + self::CACHE_SECONDS);
    return $items;
  }

}
