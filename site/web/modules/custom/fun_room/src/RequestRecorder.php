<?php

declare(strict_types=1);

namespace Drupal\fun_room;

use Drupal\Component\Datetime\TimeInterface;
use Drupal\Core\Entity\EntityTypeManagerInterface;
use Drupal\Core\Lock\LockBackendInterface;
use Drupal\fun_room\Entity\FunParticipant;
use Drupal\fun_room\Entity\FunRequest;
use Drupal\node\NodeInterface;

/**
 * Creates requests and moves them from open to delivered or cancelled.
 */
final class RequestRecorder {

  public function __construct(
    private readonly EntityTypeManagerInterface $entityTypeManager,
    private readonly TimeInterface $time,
    private readonly LockBackendInterface $lock,
  ) {}

  /**
   * Makes a request, or returns the attendee's existing open request of that kind
   * (a double tap does nothing). The note is cleaned and may be empty.
   *
   * @return array{0: \Drupal\fun_room\Entity\FunRequest, 1: bool}
   *   The request and whether it was just created.
   */
  public function record(NodeInterface $room, FunParticipant $participant, string $kind, string $note): array {
    $name = sprintf('fun_room.request.%d.%s', $participant->id(), $kind);
    if (!$this->lock->acquire($name, 5.0)) {
      $this->lock->wait($name, 3);
      if (!$this->lock->acquire($name, 5.0)) {
        throw new \RuntimeException('Could not record the request right now.');
      }
    }
    try {
      $storage = $this->entityTypeManager->getStorage('fun_request');
      $ids = $storage->getQuery()
        ->accessCheck(FALSE)
        ->condition('participant', $participant->id())
        ->condition('kind', $kind)
        ->condition('status', FunRequest::OPEN)
        ->range(0, 1)
        ->execute();
      if ($ids) {
        $existing = $storage->load(reset($ids));
        if ($existing instanceof FunRequest) {
          return [$existing, FALSE];
        }
      }

      $request = $storage->create([
        'participant' => $participant->id(),
        'room' => $room->id(),
        'kind' => $kind,
        'note' => $note,
        'slide' => (int) $room->get('field_current_slide')->value,
        'status' => FunRequest::OPEN,
        'created' => $this->time->getRequestTime(),
      ]);
      $request->save();
      return [$request, TRUE];
    }
    finally {
      $this->lock->release($name);
    }
  }

  /**
   * Marks an open request delivered. Anything else is left as it is.
   */
  public function deliver(FunRequest $request): FunRequest {
    return $this->move($request, FunRequest::DELIVERED);
  }

  /**
   * Cancels an open request. Anything else is left as it is.
   */
  public function cancel(FunRequest $request): FunRequest {
    return $this->move($request, FunRequest::CANCELLED);
  }

  private function move(FunRequest $request, string $status): FunRequest {
    if ($request->get('status')->value === FunRequest::OPEN) {
      $request->set('status', $status)->save();
    }
    return $request;
  }

}
