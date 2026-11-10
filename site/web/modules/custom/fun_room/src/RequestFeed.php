<?php

declare(strict_types=1);

namespace Drupal\fun_room;

use Drupal\Component\Datetime\TimeInterface;
use Drupal\Core\Cache\CacheBackendInterface;
use Drupal\Core\Entity\EntityTypeManagerInterface;
use Drupal\fun_room\Entity\FunParticipant;
use Drupal\fun_room\Entity\FunRequest;
use Drupal\node\NodeInterface;

/**
 * A room's requests as the public feed shows them.
 *
 * Only what is safe to show: what was asked for, who asked (the display name and avatar
 * they chose), their note and the status. No token, uuid or participant id. The cursor
 * is the change time, because a request keeps its id when it is delivered or cancelled.
 */
final class RequestFeed {

  public const DEFAULT_LIMIT = 30;

  public const MAX_LIMIT = 50;

  public const MAX_IDS = 20;

  public const CACHE_SECONDS = 1;

  public function __construct(
    private readonly EntityTypeManagerInterface $entityTypeManager,
    private readonly CacheBackendInterface $cache,
    private readonly TimeInterface $time,
  ) {}

  /**
   * Requests, oldest change first.
   *
   * With $ids, exactly those requests (up to MAX_IDS) whatever their status. Otherwise
   * with $since, requests changed at or after that time, including cancelled ones so a
   * client can drop them; with neither, the newest $limit that are not cancelled. When
   * more than $limit match, the newest $limit are returned. Reused for a second.
   *
   * @param list<int> $ids
   *   Request ids to look up, or none.
   *
   * @return list<array<string, mixed>>
   *   The requests.
   */
  public function items(NodeInterface $room, int $since, int $limit, array $ids = []): array {
    $limit = max(1, min(self::MAX_LIMIT, $limit));
    $since = max(0, $since);
    $ids = array_slice(array_values(array_unique(array_filter($ids, fn (int $id) => $id > 0))), 0, self::MAX_IDS);
    $cid = sprintf('fun_room:requests:%d:%d:%d:%s', $room->id(), $since, $limit, implode(',', $ids));
    if ($cached = $this->cache->get($cid)) {
      return $cached->data;
    }

    $storage = $this->entityTypeManager->getStorage('fun_request');
    $query = $storage->getQuery()->accessCheck(FALSE)->condition('room', $room->id());
    if ($ids) {
      $query->condition('id', $ids, 'IN');
    }
    elseif ($since > 0) {
      $query->condition('changed', $since, '>=');
    }
    else {
      $query->condition('status', FunRequest::CANCELLED, '<>');
    }
    $found = $query->sort('changed', 'DESC')->sort('id', 'DESC')->range(0, $limit)->execute();
    $requests = array_reverse($storage->loadMultiple($found), TRUE);

    $participants = $this->entityTypeManager->getStorage('fun_participant')->loadMultiple(
      array_unique(array_map(fn (FunRequest $r) => (int) $r->get('participant')->target_id, $requests)),
    );
    $items = [];
    foreach ($requests as $request) {
      $items[] = self::present($request, $participants[(int) $request->get('participant')->target_id] ?? NULL);
    }

    $this->cache->set($cid, $items, $this->time->getRequestTime() + self::CACHE_SECONDS);
    return $items;
  }

  /**
   * One request as the feed and the endpoints show it.
   *
   * @return array<string, mixed>
   *   The request.
   */
  public static function present(FunRequest $request, ?FunParticipant $participant): array {
    $changed = (int) $request->get('changed')->value;
    return [
      'id' => (int) $request->id(),
      'name' => $participant instanceof FunParticipant ? (string) $participant->get('name')->value : '',
      'avatar' => $participant instanceof FunParticipant ? (int) $participant->get('avatar')->value : 0,
      'kind' => (string) $request->get('kind')->value,
      'note' => (string) $request->get('note')->value,
      'slide' => (int) $request->get('slide')->value,
      'status' => (string) $request->get('status')->value,
      'at' => gmdate('Y-m-d\TH:i:s\Z', (int) $request->get('created')->value),
      'changed' => $changed,
    ];
  }

}
