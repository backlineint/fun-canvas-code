<?php

declare(strict_types=1);

namespace Drupal\fun_room\Controller;

use Drupal\Core\DependencyInjection\ContainerInjectionInterface;
use Drupal\Core\Entity\EntityTypeManagerInterface;
use Drupal\Core\Flood\FloodInterface;
use Drupal\fun_room\CommentRecorder;
use Drupal\fun_room\Entity\FunParticipant;
use Drupal\fun_room\Entity\FunRequest;
use Drupal\fun_room\PresenterKeyChecker;
use Drupal\fun_room\RequestFeed;
use Drupal\fun_room\RequestRecorder;
use Drupal\node\NodeInterface;
use Symfony\Component\DependencyInjection\ContainerInterface;
use Symfony\Component\HttpFoundation\JsonResponse;
use Symfony\Component\HttpFoundation\Request;

/**
 * Requests for party hats, noise makers and candy.
 *
 * Anyone can read them. Attendees make and cancel their own with the secret they made
 * when they joined (X-Participant-Token, matched by its hash); volunteers mark them
 * delivered with the presenter key, the same shared secret the deck uses for slides.
 */
final class RequestController implements ContainerInjectionInterface {

  /**
   * Requests allowed per participant in the window before further ones get a 429.
   */
  public const REQUEST_LIMIT = 6;

  public const REQUEST_WINDOW = 60;

  /**
   * Requests allowed per IP address per minute. High, because a whole venue's phones
   * can share one public address; it only stops a flood.
   */
  public const IP_LIMIT = 600;

  public const IP_WINDOW = 60;

  public function __construct(
    private readonly EntityTypeManagerInterface $entityTypeManager,
    private readonly FloodInterface $flood,
    private readonly RequestFeed $feed,
    private readonly RequestRecorder $recorder,
    private readonly PresenterKeyChecker $keyChecker,
  ) {}

  /**
   * {@inheritdoc}
   */
  public static function create(ContainerInterface $container): static {
    return new static(
      $container->get('entity_type.manager'),
      $container->get('flood'),
      $container->get('fun_room.request_feed'),
      $container->get('fun_room.request_recorder'),
      $container->get('fun_room.presenter_key'),
    );
  }

  /**
   * The room's requests: GET ?since={unix time}&limit={n}&ids={a,b,c}. Public.
   */
  public function list(Request $request, string $code): JsonResponse {
    $room = $this->loadRoom($code);
    if ($room === NULL) {
      return $this->error('room_not_found', 404);
    }
    $since = $request->query->get('since', '0');
    $limit = $request->query->get('limit', (string) RequestFeed::DEFAULT_LIMIT);
    $ids = array_map('intval', array_filter(explode(',', (string) $request->query->get('ids', '')), 'is_numeric'));
    $response = new JsonResponse([
      'requests' => $this->feed->items(
        $room,
        is_numeric($since) ? (int) $since : 0,
        is_numeric($limit) ? (int) $limit : RequestFeed::DEFAULT_LIMIT,
        $ids,
      ),
    ]);
    $response->headers->set('Cache-Control', 'public, max-age=' . RequestFeed::CACHE_SECONDS);
    return $response;
  }

  /**
   * Makes a request: POST {kind, note?} with the attendee's token.
   */
  public function make(Request $request, string $code): JsonResponse {
    $room = $this->loadRoom($code);
    if ($room === NULL) {
      return $this->error('room_not_found', 404);
    }
    if (!$this->ipAllowed($request)) {
      return $this->error('too_many_requests', 429);
    }
    $participant = $this->loadParticipant($room, $request);
    if ($participant === NULL) {
      return $this->error('forbidden', 403);
    }
    if ($room->get('field_status')->value === 'closed') {
      return $this->error('room_closed', 409);
    }

    $participant_key = (string) $participant->id();
    if (!$this->flood->isAllowed('fun_room.request', self::REQUEST_LIMIT, self::REQUEST_WINDOW, $participant_key)) {
      return $this->error('too_many_requests', 429);
    }
    $this->flood->register('fun_room.request', self::REQUEST_WINDOW, $participant_key);

    $data = json_decode($request->getContent(), TRUE);
    if (!is_array($data)) {
      return $this->error('invalid_json', 400);
    }
    $kind = $data['kind'] ?? NULL;
    if (!is_string($kind) || !in_array($kind, FunRequest::KINDS, TRUE)) {
      return $this->error('invalid_kind', 422);
    }
    $note = $data['note'] ?? '';
    $note = is_string($note) ? CommentRecorder::normalize($note) : NULL;
    if ($note === NULL) {
      return $this->error('invalid_note', 422);
    }
    if (mb_strlen($note) > FunRequest::MAX_NOTE) {
      return $this->error('too_long', 422);
    }

    try {
      [$saved, $created] = $this->recorder->record($room, $participant, $kind, $note);
    }
    catch (\RuntimeException) {
      return $this->error('busy', 503);
    }
    return $this->json(RequestFeed::present($saved, $participant), $created ? 201 : 200);
  }

  /**
   * Cancels the attendee's own open request: POST with their token.
   */
  public function cancel(Request $request, string $code, string $id): JsonResponse {
    $room = $this->loadRoom($code);
    if ($room === NULL) {
      return $this->error('room_not_found', 404);
    }
    if (!$this->ipAllowed($request)) {
      return $this->error('too_many_requests', 429);
    }
    $participant = $this->loadParticipant($room, $request);
    if ($participant === NULL) {
      return $this->error('forbidden', 403);
    }
    $saved = $this->loadRequest($room, $id);
    if ($saved === NULL) {
      return $this->error('request_not_found', 404);
    }
    if ((int) $saved->get('participant')->target_id !== (int) $participant->id()) {
      return $this->error('forbidden', 403);
    }
    return $this->json(RequestFeed::present($this->recorder->cancel($saved), $participant));
  }

  /**
   * Marks a request delivered: POST with the presenter key. Also in a closed room.
   */
  public function deliver(Request $request, string $code, string $id): JsonResponse {
    if ($denied = $this->keyChecker->check($request)) {
      return $denied;
    }
    $room = $this->loadRoom($code);
    $saved = $room === NULL ? NULL : $this->loadRequest($room, $id);
    if ($saved === NULL) {
      return $this->error($room === NULL ? 'room_not_found' : 'request_not_found', 404);
    }
    $delivered = $this->recorder->deliver($saved);
    $participant = $this->entityTypeManager->getStorage('fun_participant')->load((int) $delivered->get('participant')->target_id);
    return $this->json(RequestFeed::present($delivered, $participant instanceof FunParticipant ? $participant : NULL));
  }

  private function ipAllowed(Request $request): bool {
    $ip = $request->getClientIp() ?? 'unknown';
    if (!$this->flood->isAllowed('fun_room.request_ip', self::IP_LIMIT, self::IP_WINDOW, $ip)) {
      return FALSE;
    }
    $this->flood->register('fun_room.request_ip', self::IP_WINDOW, $ip);
    return TRUE;
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
   * The request with this id, if it belongs to this room.
   */
  private function loadRequest(NodeInterface $room, string $id): ?FunRequest {
    $saved = $this->entityTypeManager->getStorage('fun_request')->load((int) $id);
    return $saved instanceof FunRequest && (int) $saved->get('room')->target_id === (int) $room->id() ? $saved : NULL;
  }

  /**
   * The participant in this room whose token hashes to the one sent, if any.
   */
  private function loadParticipant(NodeInterface $room, Request $request): ?FunParticipant {
    $token = (string) $request->headers->get('X-Participant-Token', '');
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

  /**
   * @param array<string, mixed> $data
   *   The body.
   */
  private function json(array $data, int $status = 200): JsonResponse {
    $response = new JsonResponse($data, $status);
    $response->headers->set('Cache-Control', 'no-store');
    return $response;
  }

  private function error(string $error, int $status): JsonResponse {
    return $this->json(['error' => $error], $status);
  }

}
