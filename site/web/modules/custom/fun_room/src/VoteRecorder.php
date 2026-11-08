<?php

declare(strict_types=1);

namespace Drupal\fun_room;

use Drupal\Component\Datetime\TimeInterface;
use Drupal\Core\Database\Connection;
use Drupal\Core\Entity\EntityTypeManagerInterface;
use Drupal\Core\Lock\LockBackendInterface;
use Drupal\fun_room\Entity\FunParticipant;
use Drupal\node\NodeInterface;

/**
 * Records an attendee's fun level.
 *
 * The value is stored as a vote for the slide the room is on (updating the
 * attendee's earlier vote for that slide, if any) and as the attendee's current
 * value, which the swarm reads.
 */
final class VoteRecorder {

  public function __construct(
    private readonly EntityTypeManagerInterface $entityTypeManager,
    private readonly Connection $database,
    private readonly LockBackendInterface $lock,
    private readonly TimeInterface $time,
  ) {}

  /**
   * Stores the value and returns the slide index it was recorded against.
   */
  public function record(NodeInterface $room, FunParticipant $participant, int $value): int {
    $slide = (int) $room->get('field_current_slide')->value;

    // Serialize one attendee's votes, so two quick sends can't both see "no vote
    // for this slide yet" and add a duplicate row.
    $name = 'fun_room.vote.' . $participant->id();
    if (!$this->lock->acquire($name, 5.0)) {
      $this->lock->wait($name, 3);
      if (!$this->lock->acquire($name, 5.0)) {
        throw new \RuntimeException('Could not record the vote right now.');
      }
    }

    $transaction = $this->database->startTransaction();
    try {
      $votes = $this->entityTypeManager->getStorage('fun_vote')->loadByProperties([
        'participant' => $participant->id(),
        'slide' => $slide,
      ]);
      $vote = reset($votes) ?: $this->entityTypeManager->getStorage('fun_vote')->create([
        'participant' => $participant->id(),
        'room' => $room->id(),
        'slide' => $slide,
      ]);
      $vote->set('value', $value)->save();

      $participant->set('fun', $value);
      $participant->set('fun_at', $this->time->getRequestTime());
      $participant->save();
    }
    catch (\Throwable $e) {
      $transaction->rollBack();
      throw $e;
    }
    finally {
      unset($transaction);
      $this->lock->release($name);
    }

    return $slide;
  }

}
