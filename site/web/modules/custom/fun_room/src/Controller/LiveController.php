<?php

declare(strict_types=1);

namespace Drupal\fun_room\Controller;

use Drupal\Core\DependencyInjection\ContainerInjectionInterface;
use Drupal\Core\Entity\EntityTypeManagerInterface;
use Drupal\Core\Flood\FloodInterface;
use Drupal\fun_room\Entity\FunParticipant;
use Drupal\fun_room\Entity\FunVote;
use Drupal\fun_room\SwarmState;
use Drupal\fun_room\VoteRecorder;
use Drupal\node\NodeInterface;
use Symfony\Component\DependencyInjection\ContainerInterface;
use Symfony\Component\HttpFoundation\JsonResponse;
use Symfony\Component\HttpFoundation\Request;

/**
 * The live half of a room: the swarm everyone can read, and each attendee's vote.
 *
 * Attendees are not logged in. Reading the swarm is public (it holds nothing that
 * identifies anyone); voting needs the secret the attendee made when they joined,
 * sent as X-Participant-Token and matched to their participant by its hash.
 */
final class LiveController implements ContainerInjectionInterface {

  /**
   * Votes allowed per participant in the window before further ones get a 429.
   */
  public const VOTE_LIMIT = 20;

  public const VOTE_WINDOW = 10;

  /**
   * Votes allowed per IP address per minute. High, because a whole venue's phones
   * can share one public address; it only stops a flood.
   */
  public const IP_LIMIT = 3000;

  public const IP_WINDOW = 60;

  public function __construct(
    private readonly EntityTypeManagerInterface $entityTypeManager,
    private readonly FloodInterface $flood,
    private readonly SwarmState $swarmState,
    private readonly VoteRecorder $voteRecorder,
  ) {}

  /**
   * {@inheritdoc}
   */
  public static function create(ContainerInterface $container): static {
    return new static(
      $container->get('entity_type.manager'),
      $container->get('flood'),
      $container->get('fun_room.swarm_state'),
      $container->get('fun_room.vote_recorder'),
    );
  }

  /**
   * Everyone's current fun level, for the swarm. Public and read-only.
   */
  public function state(string $code): JsonResponse {
    $room = $this->loadRoom($code);
    if ($room === NULL) {
      return $this->error('room_not_found', 404);
    }
    $response = new JsonResponse($this->swarmState->forRoom($room));
    // Matches the 1 second the state is reused for on the server.
    $response->headers->set('Cache-Control', 'public, max-age=' . SwarmState::CACHE_SECONDS);
    return $response;
  }

  /**
   * Sets the calling attendee's fun level: POST {value} with their token.
   */
  public function vote(Request $request, string $code): JsonResponse {
    $room = $this->loadRoom($code);
    if ($room === NULL) {
      return $this->error('room_not_found', 404);
    }

    $ip = $request->getClientIp() ?? 'unknown';
    if (!$this->flood->isAllowed('fun_room.vote_ip', self::IP_LIMIT, self::IP_WINDOW, $ip)) {
      return $this->error('too_many_requests', 429);
    }
    $this->flood->register('fun_room.vote_ip', self::IP_WINDOW, $ip);

    $participant = $this->loadParticipant($room, (string) $request->headers->get('X-Participant-Token', ''));
    if ($participant === NULL) {
      return $this->error('forbidden', 403);
    }

    // Closed means the fun is over: existing attendees can no longer vote.
    if ($room->get('field_status')->value === 'closed') {
      return $this->error('room_closed', 409);
    }

    $participant_key = (string) $participant->id();
    if (!$this->flood->isAllowed('fun_room.vote', self::VOTE_LIMIT, self::VOTE_WINDOW, $participant_key)) {
      return $this->error('too_many_requests', 429);
    }
    $this->flood->register('fun_room.vote', self::VOTE_WINDOW, $participant_key);

    $data = json_decode($request->getContent(), TRUE);
    if (!is_array($data)) {
      return $this->error('invalid_json', 400);
    }
    $value = $data['value'] ?? NULL;
    if (!is_int($value) || $value < 0 || $value > FunVote::MAX_VALUE) {
      return $this->error('invalid_value', 422);
    }

    try {
      $slide = $this->voteRecorder->record($room, $participant, $value);
    }
    catch (\RuntimeException) {
      return $this->error('busy', 503);
    }

    $response = new JsonResponse([
      'id' => SwarmState::dotId((string) $participant->uuid()),
      'value' => $value,
      'slide' => $slide,
    ]);
    $response->headers->set('Cache-Control', 'no-store');
    return $response;
  }

  private function loadRoom(string $code): ?NodeInterface {
    $rooms = $this->entityTypeManager->getStorage('node')->loadByProperties([
      'type' => 'room',
      'title' => strtoupper(trim($code)),
    ]);
    $room = reset($rooms);
    return $room instanceof NodeInterface ? $room : NULL;
  }

  /**
   * The participant in this room whose token hashes to the one sent, if any.
   */
  private function loadParticipant(NodeInterface $room, string $token): ?FunParticipant {
    if ($token === '') {
      return NULL;
    }
    $participants = $this->entityTypeManager->getStorage('fun_participant')->loadByProperties([
      'token_hash' => hash('sha256', $token),
      'room' => $room->id(),
    ]);
    $participant = reset($participants);
    return $participant instanceof FunParticipant ? $participant : NULL;
  }

  private function error(string $error, int $status): JsonResponse {
    $response = new JsonResponse(['error' => $error], $status);
    $response->headers->set('Cache-Control', 'no-store');
    return $response;
  }

}
