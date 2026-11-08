<?php

declare(strict_types=1);

namespace Drupal\fun_room;

use Drupal\Component\Datetime\TimeInterface;
use Drupal\Core\Cache\CacheBackendInterface;
use Drupal\Core\Database\Connection;
use Drupal\node\NodeInterface;

/**
 * What the swarm shows: everyone's current fun level, and their median.
 *
 * The result is public, so it carries nothing that identifies a person: no names,
 * tokens or uuids. Each dot has an opaque id that stays the same between calls, and
 * a vertical position taken from that id so dots keep their place as others move.
 */
final class SwarmState {

  /**
   * Seconds a room's state is reused, so a room full of pollers costs one query.
   */
  public const CACHE_SECONDS = 1;

  /**
   * Medians below this are "low" (quiet), below MID_BELOW "mid", otherwise "high".
   */
  public const LOW_BELOW = 35;

  public const MID_BELOW = 65;

  public function __construct(
    private readonly Connection $database,
    private readonly CacheBackendInterface $cache,
    private readonly TimeInterface $time,
  ) {}

  /**
   * An opaque, stable id for a participant, safe to show to everyone.
   */
  public static function dotId(string $participant_uuid): string {
    return substr(hash('sha256', $participant_uuid), 0, 12);
  }

  /**
   * The mood tier for a median, or NULL when nobody has voted.
   */
  public static function tier(?int $median): ?string {
    if ($median === NULL) {
      return NULL;
    }
    return $median < self::LOW_BELOW ? 'low' : ($median < self::MID_BELOW ? 'mid' : 'high');
  }

  /**
   * The state for a room, reused for CACHE_SECONDS.
   *
   * @return array<string, mixed>
   *   The swarm state.
   */
  public function forRoom(NodeInterface $room): array {
    $cid = 'fun_room:state:' . $room->id();
    if ($cached = $this->cache->get($cid)) {
      return $cached->data;
    }
    $state = $this->build($room);
    $this->cache->set($cid, $state, $this->time->getRequestTime() + self::CACHE_SECONDS);
    return $state;
  }

  /**
   * Builds the state from the database.
   *
   * @return array<string, mixed>
   *   The swarm state.
   */
  private function build(NodeInterface $room): array {
    $rows = $this->database->select('fun_participant', 'p')
      ->fields('p', ['uuid', 'avatar', 'fun'])
      ->condition('p.room', $room->id())
      ->execute()
      ->fetchAll();

    $dots = [];
    $values = [];
    foreach ($rows as $row) {
      if ($row->fun === NULL) {
        continue;
      }
      $id = self::dotId($row->uuid);
      $dots[] = [
        'id' => $id,
        'x' => (int) $row->fun,
        // 8 to 92 percent from the top, fixed for this dot.
        'y' => round(8 + (crc32($id) % 8401) / 100, 1),
        'avatar' => (int) $row->avatar,
      ];
      $values[] = (int) $row->fun;
    }
    usort($dots, fn (array $a, array $b) => strcmp($a['id'], $b['id']));

    $median = NULL;
    if ($values) {
      sort($values);
      $middle = intdiv(count($values), 2);
      $median = count($values) % 2
        ? $values[$middle]
        : (int) round(($values[$middle - 1] + $values[$middle]) / 2);
    }

    return [
      'code' => $room->label(),
      'status' => $room->get('field_status')->value === 'closed' ? 'closed' : 'open',
      'slide' => (int) $room->get('field_current_slide')->value,
      'count' => count($rows),
      'voters' => count($values),
      'median' => $median,
      'tier' => self::tier($median),
      'dots' => $dots,
      'updated' => $this->time->getRequestTime(),
    ];
  }

}
