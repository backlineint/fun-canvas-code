<?php

declare(strict_types=1);

namespace Drupal\fun_room;

use Drupal\Component\Datetime\TimeInterface;
use Drupal\Core\Cache\CacheBackendInterface;
use Drupal\Core\Database\Connection;
use Drupal\Core\Entity\EntityTypeManagerInterface;
use Drupal\fun_room\Entity\FunParticipant;
use Drupal\fun_room\Entity\FunRequest;
use Drupal\node\NodeInterface;

/**
 * The end-of-session recap for a room.
 *
 * Computed on read from the room's rows, so there is nothing to do when the room
 * closes. Ratings are one row per attendee per slide (the last value), so the
 * timeline is by slide, not by minute. Every rated slide is charted. To be ranked
 * (peak, top list, quietest) a slide needs MIN_VOTES votes, so one stray vote can't
 * make it the best or the quietest, except in a room of fewer than SMALL_ROOM voters,
 * where one vote is a large share of the room and the minimum would hide most slides.
 * Public: names and avatars appear only where the comment feed already shows them;
 * no token, uuid or participant id.
 */
final class RoomRecap {

  /**
   * Votes a slide needs before it is ranked.
   */
  public const MIN_VOTES = 2;

  /**
   * Rooms with fewer voters than this rank slides on any number of votes.
   */
  public const SMALL_ROOM = 5;

  /**
   * How many slides the top list holds.
   */
  public const TOP_SLIDES = 5;

  /**
   * Seconds a recap is reused while the room is open, and once it is closed.
   */
  public const CACHE_OPEN_SECONDS = 5;

  public const CACHE_CLOSED_SECONDS = 300;

  private const HEADLINES = [
    'high' => 'That was boatloads of fun',
    'mid' => 'That was a warm one',
    'low' => 'That was a sleepy one',
  ];

  public function __construct(
    private readonly Connection $database,
    private readonly EntityTypeManagerInterface $entityTypeManager,
    private readonly CacheBackendInterface $cache,
    private readonly TimeInterface $time,
  ) {}

  /**
   * How long forRoom() may be reused for this room, in seconds.
   */
  public static function cacheSeconds(NodeInterface $room): int {
    return $room->get('field_status')->value === 'closed' ? self::CACHE_CLOSED_SECONDS : self::CACHE_OPEN_SECONDS;
  }

  /**
   * The recap for a room.
   *
   * @return array<string, mixed>
   *   The recap, as the endpoint returns it.
   */
  public function forRoom(NodeInterface $room): array {
    $cid = 'fun_room:recap:' . $room->id();
    if ($cached = $this->cache->get($cid)) {
      return $cached->data;
    }
    $recap = $this->build($room);
    $this->cache->set($cid, $recap, $this->time->getRequestTime() + self::cacheSeconds($room));
    return $recap;
  }

  /**
   * Builds the recap from the database.
   *
   * @return array<string, mixed>
   *   The recap.
   */
  private function build(NodeInterface $room): array {
    $rid = $room->id();
    $log = SlideLog::read($room);

    $attendees = (int) $this->database->select('fun_participant', 'p')
      ->condition('p.room', $rid)
      ->countQuery()->execute()->fetchField();

    // Ratings: per slide, and overall.
    $votes = $this->database->select('fun_vote', 'v')
      ->fields('v', ['slide', 'value', 'participant', 'created', 'changed'])
      ->condition('v.room', $rid)
      ->execute()->fetchAll();
    $by_slide = [];
    $all_values = [];
    $voters = [];
    $first_vote = NULL;
    $last_activity = 0;
    foreach ($votes as $vote) {
      $by_slide[(int) $vote->slide][] = (int) $vote->value;
      $all_values[] = (int) $vote->value;
      $voters[(int) $vote->participant] = TRUE;
      $first_vote = $first_vote === NULL ? (int) $vote->created : min($first_vote, (int) $vote->created);
      $last_activity = max($last_activity, (int) $vote->changed);
    }

    // Comments, oldest first.
    $comments = $this->database->select('fun_comment', 'c')
      ->fields('c', ['id', 'participant', 'slide', 'slide_title', 'body', 'created'])
      ->condition('c.room', $rid)
      ->orderBy('c.id', 'ASC')
      ->execute()->fetchAll();
    $comment_titles = [];
    $comments_per_slide = [];
    foreach ($comments as $comment) {
      $slide = (int) $comment->slide;
      $comments_per_slide[$slide] = ($comments_per_slide[$slide] ?? 0) + 1;
      if ((string) $comment->slide_title !== '') {
        $comment_titles[$slide] = (string) $comment->slide_title;
      }
      $last_activity = max($last_activity, (int) $comment->created);
    }

    // Requests that were not cancelled.
    $requests = ['total' => 0, 'hat' => 0, 'noise' => 0, 'candy' => 0, 'delivered' => 0];
    $request_rows = $this->database->select('fun_request', 'r')
      ->fields('r', ['kind', 'status', 'changed'])
      ->condition('r.room', $rid)
      ->condition('r.status', FunRequest::CANCELLED, '<>')
      ->execute()->fetchAll();
    foreach ($request_rows as $request) {
      $requests['total']++;
      if (isset($requests[$request->kind])) {
        $requests[$request->kind]++;
      }
      if ($request->status === FunRequest::DELIVERED) {
        $requests['delivered']++;
      }
      $last_activity = max($last_activity, (int) $request->changed);
    }

    $title_of = function (int $slide) use ($log, $comment_titles): string {
      $title = $log[$slide]['title'] ?? '';
      if ($title === '') {
        $title = $comment_titles[$slide] ?? '';
      }
      return $title !== '' ? $title : 'Slide ' . ($slide + 1);
    };

    // Every rated slide, in slide order.
    ksort($by_slide);
    $timeline = [];
    foreach ($by_slide as $slide => $values) {
      $timeline[] = [
        'slide' => $slide,
        'title' => $title_of($slide),
        'median' => SwarmState::median($values),
        'votes' => count($values),
      ];
    }
    // Best first; ties go to the slide with more votes, then the earlier one.
    $min_votes = count($voters) < self::SMALL_ROOM ? 1 : self::MIN_VOTES;
    $timeline_ranked = array_values(array_filter($timeline, fn (array $t) => $t['votes'] >= $min_votes));
    $ranked = $timeline_ranked;
    usort($ranked, fn (array $a, array $b) => [$b['median'], $b['votes'], $a['slide']] <=> [$a['median'], $a['votes'], $b['slide']]);
    $peak = $ranked[0] ?? NULL;
    $quietest = NULL;
    if (count($ranked) > 1) {
      $worst = $timeline_ranked;
      usort($worst, fn (array $a, array $b) => [$a['median'], $a['slide']] <=> [$b['median'], $b['slide']]);
      $quietest = $worst[0];
    }

    $average = SwarmState::median($all_values);
    $tier = SwarmState::tier($average);

    // Duration: from the first slide the deck reported (else the first vote) to the
    // last vote, comment or request.
    $start = $log ? min(array_column($log, 'at')) : $first_vote;
    if ($start === 0) {
      $start = $first_vote;
    }
    $duration = ($start !== NULL && $last_activity > $start) ? $last_activity - $start : NULL;

    $busiest = NULL;
    if ($comments_per_slide) {
      // Most comments; ties go to the earlier slide.
      uksort($comments_per_slide, fn (int $a, int $b) => [$comments_per_slide[$b], $a] <=> [$comments_per_slide[$a], $b]);
      $slide = array_key_first($comments_per_slide);
      $busiest = ['slide' => $slide, 'title' => $title_of($slide), 'count' => $comments_per_slide[$slide]];
    }

    return [
      'code' => $room->label(),
      'status' => $room->get('field_status')->value === 'closed' ? 'closed' : 'open',
      'headline' => self::HEADLINES[$tier] ?? 'Thanks for joining',
      'attendees' => $attendees,
      'voters' => count($voters),
      'durationSeconds' => $duration,
      'averageFun' => $average,
      'tier' => $tier,
      'peak' => $peak,
      'timeline' => $timeline,
      'topSlides' => array_slice($ranked, 0, self::TOP_SLIDES),
      'quietest' => $quietest,
      'comments' => ['count' => count($comments), 'busiest' => $busiest],
      'requests' => $requests,
      'highlights' => $this->highlights($comments, $comments_per_slide, $busiest, $requests, $title_of),
      'updated' => $this->time->getRequestTime(),
    ];
  }

  /**
   * The highlight cards: deterministic picks, not a judgement of what was funny.
   *
   * @param object[] $comments
   *   Comment rows, oldest first.
   * @param array<int, int> $comments_per_slide
   *   Comment counts by slide.
   * @param array<string, mixed>|null $busiest
   *   The slide with the most comments.
   * @param array<string, int> $requests
   *   Request counts.
   * @param callable $title_of
   *   Maps a slide index to its title.
   *
   * @return array<int, array<string, mixed>>
   *   Cards, at most three.
   */
  private function highlights(array $comments, array $comments_per_slide, ?array $busiest, array $requests, callable $title_of): array {
    $cards = [];
    $card = function (string $tag, object $comment) use ($title_of): array {
      $participant = $this->entityTypeManager->getStorage('fun_participant')->load((int) $comment->participant);
      return [
        'type' => 'comment',
        'tag' => $tag,
        'text' => (string) $comment->body,
        'name' => $participant instanceof FunParticipant ? (string) $participant->get('name')->value : '',
        'avatar' => $participant instanceof FunParticipant ? (int) $participant->get('avatar')->value : 0,
        'slide' => (int) $comment->slide,
        'title' => $title_of((int) $comment->slide),
      ];
    };

    $first_on_busiest = NULL;
    if ($busiest) {
      foreach ($comments as $comment) {
        if ((int) $comment->slide === $busiest['slide']) {
          $first_on_busiest = $comment;
          break;
        }
      }
      if ($first_on_busiest) {
        $cards[] = $card('Most active slide', $first_on_busiest);
      }
    }
    $last = $comments ? end($comments) : NULL;
    if ($last && $last !== $first_on_busiest) {
      $cards[] = $card('Last word', $last);
    }

    // The most asked-for thing; ties go to the first in the list.
    $top = NULL;
    foreach (FunRequest::KINDS as $kind) {
      if ($requests[$kind] > 0 && ($top === NULL || $requests[$kind] > $requests[$top])) {
        $top = $kind;
      }
    }
    if ($top !== NULL) {
      $cards[] = [
        'type' => 'request',
        'tag' => 'Most asked for',
        'kind' => $top,
        'count' => $requests[$top],
      ];
    }
    return $cards;
  }

}
