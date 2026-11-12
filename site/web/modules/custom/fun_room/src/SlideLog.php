<?php

declare(strict_types=1);

namespace Drupal\fun_room;

use Drupal\node\NodeInterface;

/**
 * The slides a room has shown, kept so the recap can name them.
 *
 * A vote only knows its slide index, and the room only stores the slide it is on
 * now. So every time the deck reports a slide, the index, id, title and the first
 * time it was shown are kept in a JSON map on the room: {"3": {"id", "title", "at"}}.
 * Slides the deck never reported are simply absent (the recap falls back to
 * "Slide N").
 */
final class SlideLog {

  /**
   * The most slides kept per room.
   */
  public const MAX_ENTRIES = 200;

  /**
   * The room's log, keyed by slide index.
   *
   * @return array<int, array{id: string, title: string, at: int}>
   *   The entries; empty if nothing was logged or the stored value is damaged.
   */
  public static function read(NodeInterface $room): array {
    if (!$room->hasField('field_slide_log')) {
      return [];
    }
    $data = json_decode((string) $room->get('field_slide_log')->value, TRUE);
    if (!is_array($data)) {
      return [];
    }
    $log = [];
    foreach ($data as $index => $entry) {
      if (!is_array($entry) || !is_numeric($index)) {
        continue;
      }
      $log[(int) $index] = [
        'id' => (string) ($entry['id'] ?? ''),
        'title' => (string) ($entry['title'] ?? ''),
        'at' => (int) ($entry['at'] ?? 0),
      ];
    }
    ksort($log);
    return $log;
  }

  /**
   * Records a slide on the room (without saving it).
   *
   * An index already logged keeps the time it was first shown; its id and title
   * follow the deck. Returns TRUE if the stored log changed.
   */
  public static function record(NodeInterface $room, int $index, string $id, string $title, int $now): bool {
    if (!$room->hasField('field_slide_log')) {
      return FALSE;
    }
    $log = self::read($room);
    $before = $log[$index] ?? NULL;
    if ($before === NULL && count($log) >= self::MAX_ENTRIES) {
      return FALSE;
    }
    $entry = [
      'id' => $id,
      'title' => $title,
      'at' => $before['at'] ?? $now,
    ];
    if ($before === $entry) {
      return FALSE;
    }
    $log[$index] = $entry;
    ksort($log);
    $room->set('field_slide_log', json_encode($log, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES));
    return TRUE;
  }

}
