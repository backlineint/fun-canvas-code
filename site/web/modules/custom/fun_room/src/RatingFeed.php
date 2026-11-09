<?php

declare(strict_types=1);

namespace Drupal\fun_room;

use Drupal\Component\Datetime\TimeInterface;
use Drupal\Core\Cache\CacheBackendInterface;
use Drupal\Core\Entity\EntityTypeManagerInterface;
use Drupal\fun_room\Entity\FunParticipant;
use Drupal\fun_room\Entity\FunVote;
use Drupal\node\NodeInterface;

/**
 * A room's slide ratings as the public feed shows them.
 *
 * One entry per vote row, so per attendee per slide. A vote is only listed once it
 * has been unchanged for SETTLE_SECONDS, so someone dragging their slider shows up
 * once, with where they ended, not as a flicker of in-between values. The cursor is
 * the change time rather than the id, because a row keeps its id when its value
 * changes. Only what is safe to show: who (the display name and avatar they chose),
 * the slide and the value. No token, uuid or participant id.
 */
final class RatingFeed {

  public const DEFAULT_LIMIT = 30;

  public const MAX_LIMIT = 50;

  public const CACHE_SECONDS = 1;

  /**
   * How long a vote must be unchanged before it is listed.
   */
  public const SETTLE_SECONDS = 3;

  public function __construct(
    private readonly EntityTypeManagerInterface $entityTypeManager,
    private readonly CacheBackendInterface $cache,
    private readonly TimeInterface $time,
  ) {}

  /**
   * Ratings changed at or after $since, oldest change first. When more than $limit
   * match, the newest $limit are returned. Reused for a second per room, since and
   * limit, so a room full of pollers costs one query a second.
   *
   * @return list<array<string, mixed>>
   */
  public function items(NodeInterface $room, int $since, int $limit): array {
    $limit = max(1, min(self::MAX_LIMIT, $limit));
    $since = max(0, $since);
    $cid = sprintf('fun_room:ratings:%d:%d:%d', $room->id(), $since, $limit);
    if ($cached = $this->cache->get($cid)) {
      return $cached->data;
    }

    $now = $this->time->getRequestTime();
    $storage = $this->entityTypeManager->getStorage('fun_vote');
    $ids = $storage->getQuery()
      ->accessCheck(FALSE)
      ->condition('room', $room->id())
      ->condition('changed', $since, '>=')
      ->condition('changed', $now - self::SETTLE_SECONDS, '<=')
      ->sort('changed', 'DESC')
      ->sort('id', 'DESC')
      ->range(0, $limit)
      ->execute();
    $votes = array_reverse($storage->loadMultiple($ids), TRUE);

    $participants = $this->entityTypeManager->getStorage('fun_participant')->loadMultiple(
      array_unique(array_map(fn (FunVote $v) => (int) $v->get('participant')->target_id, $votes)),
    );

    $items = [];
    foreach ($votes as $vote) {
      $participant = $participants[(int) $vote->get('participant')->target_id] ?? NULL;
      $value = (int) $vote->get('value')->value;
      $changed = (int) $vote->get('changed')->value;
      $items[] = [
        'id' => (int) $vote->id(),
        'name' => $participant instanceof FunParticipant ? (string) $participant->get('name')->value : '',
        'avatar' => $participant instanceof FunParticipant ? (int) $participant->get('avatar')->value : 0,
        'slide' => (int) $vote->get('slide')->value,
        'value' => $value,
        'tier' => SwarmState::tier($value),
        'at' => gmdate('Y-m-d\TH:i:s\Z', $changed),
        'changed' => $changed,
      ];
    }

    $this->cache->set($cid, $items, $now + self::CACHE_SECONDS);
    return $items;
  }

}
