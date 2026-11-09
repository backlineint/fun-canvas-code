<?php

declare(strict_types=1);

namespace Drupal\fun_room;

use Drupal\Component\Datetime\TimeInterface;
use Drupal\Core\Entity\EntityTypeManagerInterface;
use Drupal\fun_room\Entity\FunComment;
use Drupal\fun_room\Entity\FunParticipant;
use Drupal\node\NodeInterface;

/**
 * Cleans and stores a comment against the slide the room is on.
 */
final class CommentRecorder {

  /**
   * An identical comment from the same attendee within this many seconds is the
   * same one (a double tap or a retry), not a new one.
   */
  public const REPEAT_SECONDS = 30;

  public function __construct(
    private readonly EntityTypeManagerInterface $entityTypeManager,
    private readonly TimeInterface $time,
  ) {}

  /**
   * Plain, single-line text: control characters become spaces, invisible format
   * characters (zero-width, right-to-left overrides) are dropped, whitespace is
   * collapsed and trimmed. Returns NULL for text that isn't valid UTF-8.
   */
  public static function normalize(string $text): ?string {
    $text = preg_replace('/\p{Cc}+/u', ' ', $text);
    if ($text === NULL) {
      return NULL;
    }
    $text = preg_replace('/\p{Cf}+/u', '', $text);
    $text = preg_replace('/\s+/u', ' ', (string) $text);
    return $text === NULL ? NULL : trim($text);
  }

  /**
   * Stores the (already normalized, valid) text and returns the comment.
   */
  public function record(NodeInterface $room, FunParticipant $participant, string $text): FunComment {
    $storage = $this->entityTypeManager->getStorage('fun_comment');
    $now = $this->time->getRequestTime();

    // A repeat of the attendee's latest comment returns that one.
    $ids = $storage->getQuery()
      ->accessCheck(FALSE)
      ->condition('participant', $participant->id())
      ->sort('id', 'DESC')
      ->range(0, 1)
      ->execute();
    $latest = $ids ? $storage->load(reset($ids)) : NULL;
    if ($latest instanceof FunComment
      && $latest->get('body')->value === $text
      && $now - (int) $latest->get('created')->value < self::REPEAT_SECONDS) {
      return $latest;
    }

    $comment = $storage->create([
      'participant' => $participant->id(),
      'room' => $room->id(),
      'slide' => (int) $room->get('field_current_slide')->value,
      'slide_title' => (string) $room->get('field_current_slide_title')->value,
      'body' => $text,
      'created' => $now,
    ]);
    $comment->save();
    return $comment;
  }

}
