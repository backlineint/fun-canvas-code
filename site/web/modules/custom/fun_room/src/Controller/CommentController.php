<?php

declare(strict_types=1);

namespace Drupal\fun_room\Controller;

use Drupal\Core\DependencyInjection\ContainerInjectionInterface;
use Drupal\Core\Entity\EntityTypeManagerInterface;
use Drupal\Core\Flood\FloodInterface;
use Drupal\fun_room\CommentFeed;
use Drupal\fun_room\CommentRecorder;
use Drupal\fun_room\Entity\FunComment;
use Drupal\fun_room\Entity\FunParticipant;
use Drupal\node\NodeInterface;
use Symfony\Component\DependencyInjection\ContainerInterface;
use Symfony\Component\HttpFoundation\JsonResponse;
use Symfony\Component\HttpFoundation\Request;

/**
 * A room's comments: anyone can read them, attendees can post.
 *
 * Posting works like voting: the attendee sends the secret they made when they
 * joined as X-Participant-Token, matched to their participant by its hash.
 */
final class CommentController implements ContainerInjectionInterface {

  /**
   * Comments allowed per participant in the window before further ones get a 429.
   */
  public const COMMENT_LIMIT = 5;

  public const COMMENT_WINDOW = 60;

  /**
   * Comments allowed per IP address per minute. High, because a whole venue's
   * phones can share one public address; it only stops a flood.
   */
  public const IP_LIMIT = 600;

  public const IP_WINDOW = 60;

  public function __construct(
    private readonly EntityTypeManagerInterface $entityTypeManager,
    private readonly FloodInterface $flood,
    private readonly CommentFeed $feed,
    private readonly CommentRecorder $recorder,
  ) {}

  /**
   * {@inheritdoc}
   */
  public static function create(ContainerInterface $container): static {
    return new static(
      $container->get('entity_type.manager'),
      $container->get('flood'),
      $container->get('fun_room.comment_feed'),
      $container->get('fun_room.comment_recorder'),
    );
  }

  /**
   * The room's comments, oldest first: GET ?after={id}&limit={n}. Public and
   * read-only, and it works for closed rooms (the final stream).
   */
  public function list(Request $request, string $code): JsonResponse {
    $room = $this->loadRoom($code);
    if ($room === NULL) {
      return $this->error('room_not_found', 404);
    }
    $after = $request->query->get('after', '0');
    $limit = $request->query->get('limit', (string) CommentFeed::DEFAULT_LIMIT);
    $response = new JsonResponse([
      'comments' => $this->feed->items(
        $room,
        is_numeric($after) ? (int) $after : 0,
        is_numeric($limit) ? (int) $limit : CommentFeed::DEFAULT_LIMIT,
      ),
    ]);
    $response->headers->set('Cache-Control', 'public, max-age=' . CommentFeed::CACHE_SECONDS);
    return $response;
  }

  /**
   * Posts a comment: POST {text} with the attendee's token.
   */
  public function post(Request $request, string $code): JsonResponse {
    $room = $this->loadRoom($code);
    if ($room === NULL) {
      return $this->error('room_not_found', 404);
    }

    $ip = $request->getClientIp() ?? 'unknown';
    if (!$this->flood->isAllowed('fun_room.comment_ip', self::IP_LIMIT, self::IP_WINDOW, $ip)) {
      return $this->error('too_many_requests', 429);
    }
    $this->flood->register('fun_room.comment_ip', self::IP_WINDOW, $ip);

    $participant = $this->loadParticipant($room, (string) $request->headers->get('X-Participant-Token', ''));
    if ($participant === NULL) {
      return $this->error('forbidden', 403);
    }

    if ($room->get('field_status')->value === 'closed') {
      return $this->error('room_closed', 409);
    }

    $participant_key = (string) $participant->id();
    if (!$this->flood->isAllowed('fun_room.comment', self::COMMENT_LIMIT, self::COMMENT_WINDOW, $participant_key)) {
      return $this->error('too_many_requests', 429);
    }
    $this->flood->register('fun_room.comment', self::COMMENT_WINDOW, $participant_key);

    $data = json_decode($request->getContent(), TRUE);
    if (!is_array($data)) {
      return $this->error('invalid_json', 400);
    }
    $text = $data['text'] ?? NULL;
    $text = is_string($text) ? CommentRecorder::normalize($text) : NULL;
    if ($text === NULL) {
      return $this->error('invalid_text', 422);
    }
    if ($text === '') {
      return $this->error('empty', 422);
    }
    if (mb_strlen($text) > FunComment::MAX_LENGTH) {
      return $this->error('too_long', 422);
    }

    $comment = $this->recorder->record($room, $participant, $text);
    $response = new JsonResponse([
      'id' => (int) $comment->id(),
      'name' => (string) $participant->get('name')->value,
      'avatar' => (int) $participant->get('avatar')->value,
      'slide' => (int) $comment->get('slide')->value,
      'slideTitle' => (string) $comment->get('slide_title')->value,
      'text' => (string) $comment->get('body')->value,
      'at' => gmdate('Y-m-d\TH:i:s\Z', (int) $comment->get('created')->value),
    ], 201);
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
