<?php

declare(strict_types=1);

namespace Drupal\Tests\fun_room\Functional;

use Drupal\fun_room\Controller\LiveController;
use Drupal\fun_room\Entity\FunParticipant;
use Drupal\fun_room\SwarmState;
use Drupal\node\Entity\Node;
use Drupal\node\NodeInterface;
use Drupal\Tests\BrowserTestBase;
use GuzzleHttp\RequestOptions;
use PHPUnit\Framework\Attributes\DataProvider;
use PHPUnit\Framework\Attributes\Group;
use Psr\Http\Message\ResponseInterface;

/**
 * Exercises the slider's vote endpoint and the swarm's state endpoint.
 */
#[Group('fun_room')]
final class LiveSwarmTest extends BrowserTestBase {

  private const TOKEN = 'token-for-alice-0123456789abcdef';

  /**
   * {@inheritdoc}
   */
  protected static $modules = ['fun_room', 'jsonapi'];

  /**
   * {@inheritdoc}
   */
  protected $defaultTheme = 'stark';

  private NodeInterface $room;

  /**
   * {@inheritdoc}
   */
  protected function setUp(): void {
    parent::setUp();
    user_role_grant_permissions('anonymous', ['access content']);
    $this->room = $this->createRoom('NED-4261');
  }

  private function createRoom(string $code, string $status = 'open', int $slide = 0): NodeInterface {
    $room = Node::create([
      'type' => 'room',
      'title' => $code,
      'status' => 1,
      'field_status' => $status,
      'field_current_slide' => $slide,
    ]);
    $room->save();
    return $room;
  }

  private function participant(NodeInterface $room, string $name, string $token, ?int $fun = NULL, int $avatar = 0): FunParticipant {
    $participant = FunParticipant::create(['room' => $room->id(), 'name' => $name, 'avatar' => $avatar, 'token' => $token]);
    if ($fun !== NULL) {
      $participant->set('fun', $fun);
    }
    $participant->save();
    return $participant;
  }

  /**
   * Drops the cached swarm state, which is otherwise reused for a second.
   */
  private function forgetState(): void {
    \Drupal::service('cache.default')->deleteAll();
  }

  /**
   * @param array<string, mixed>|string|null $body
   *   A JSON body (array), a raw body (string), or none.
   */
  private function post(string $path, array|string|null $body, ?string $token = self::TOKEN): ResponseInterface {
    $headers = ['Content-Type' => 'application/json', 'Accept' => 'application/json'];
    if ($token !== NULL) {
      $headers['X-Participant-Token'] = $token;
    }
    $options = [RequestOptions::HEADERS => $headers, RequestOptions::HTTP_ERRORS => FALSE];
    if ($body !== NULL) {
      $options[RequestOptions::BODY] = is_array($body) ? json_encode($body, JSON_THROW_ON_ERROR) : $body;
    }
    return $this->getHttpClient()->request('POST', $this->buildUrl($path), $options);
  }

  private function vote(array|string|null $body, ?string $token = self::TOKEN, string $code = 'NED-4261'): ResponseInterface {
    return $this->post('/api/fun/rooms/' . $code . '/vote', $body, $token);
  }

  /**
   * @return array<string, mixed>
   *   The decoded state.
   */
  private function state(string $code = 'NED-4261'): array {
    $response = $this->getHttpClient()->request('GET', $this->buildUrl('/api/fun/rooms/' . $code . '/state'), [RequestOptions::HTTP_ERRORS => FALSE]);
    $this->assertSame(200, $response->getStatusCode(), (string) $response->getBody());
    return json_decode((string) $response->getBody(), TRUE, 512, JSON_THROW_ON_ERROR);
  }

  private function voteCount(): int {
    return (int) \Drupal::entityTypeManager()->getStorage('fun_vote')->getQuery()->accessCheck(FALSE)->count()->execute();
  }

  private function funOf(FunParticipant $participant): ?int {
    \Drupal::entityTypeManager()->getStorage('fun_participant')->resetCache();
    $value = FunParticipant::load($participant->id())->get('fun')->value;
    return $value === NULL ? NULL : (int) $value;
  }

  /**
   * A vote sets the attendee's value, with one row per slide.
   */
  public function testVoteStoresValueWithOneRowPerSlide(): void {
    $alice = $this->participant($this->room, 'Alice', self::TOKEN);
    $this->room->set('field_current_slide', 2)->save();

    $response = $this->vote(['value' => 70]);
    $this->assertSame(200, $response->getStatusCode(), (string) $response->getBody());
    $body = json_decode((string) $response->getBody(), TRUE, 512, JSON_THROW_ON_ERROR);
    $this->assertSame(['id' => SwarmState::dotId((string) $alice->uuid()), 'value' => 70, 'slide' => 2], $body);
    $this->assertStringContainsString('no-store', $response->getHeaderLine('Cache-Control'));
    $this->assertSame(70, $this->funOf($alice));
    $this->assertSame(1, $this->voteCount());

    // Moving the slider again on the same slide updates that vote.
    $this->assertSame(200, $this->vote(['value' => 40])->getStatusCode());
    $this->assertSame(40, $this->funOf($alice));
    $this->assertSame(1, $this->voteCount());

    // The next slide starts a new vote, and the current value follows it.
    $this->room->set('field_current_slide', 3)->save();
    $this->assertSame(200, $this->vote(['value' => 90])->getStatusCode());
    $this->assertSame(90, $this->funOf($alice));
    $this->assertSame(2, $this->voteCount());

    $votes = \Drupal::entityTypeManager()->getStorage('fun_vote')->loadMultiple();
    $bySlide = [];
    foreach ($votes as $vote) {
      $bySlide[(int) $vote->get('slide')->value] = (int) $vote->get('value')->value;
    }
    $this->assertSame([2 => 40, 3 => 90], $bySlide);
  }

  /**
   * Values outside 0-100, or not whole numbers, are rejected and change nothing.
   *
   * @param array<string, mixed> $body
   *   The request body.
   */
  #[DataProvider('invalidValues')]
  public function testInvalidValueIsRejected(array $body): void {
    $alice = $this->participant($this->room, 'Alice', self::TOKEN);
    $response = $this->vote($body);
    $this->assertSame(422, $response->getStatusCode());
    $this->assertSame('invalid_value', json_decode((string) $response->getBody(), TRUE, 512, JSON_THROW_ON_ERROR)['error']);
    $this->assertNull($this->funOf($alice));
    $this->assertSame(0, $this->voteCount());
  }

  /**
   * Data provider for testInvalidValueIsRejected().
   *
   * @return array<string, array{0: array<string, mixed>}>
   *   Request bodies.
   */
  public static function invalidValues(): array {
    return [
      'negative' => [['value' => -1]],
      'over 100' => [['value' => 101]],
      'a string' => [['value' => '50']],
      'a float' => [['value' => 50.5]],
      'null' => [['value' => NULL]],
      'missing' => [[]],
    ];
  }

  /**
   * The ends of the scale are allowed.
   */
  public function testBoundaryValuesAreAccepted(): void {
    $alice = $this->participant($this->room, 'Alice', self::TOKEN);
    $this->assertSame(200, $this->vote(['value' => 0])->getStatusCode());
    $this->assertSame(0, $this->funOf($alice));
    $this->assertSame(200, $this->vote(['value' => 100])->getStatusCode());
    $this->assertSame(100, $this->funOf($alice));
  }

  /**
   * Only a token that belongs to a participant of this room may vote.
   */
  public function testVoteNeedsTheRightToken(): void {
    $this->participant($this->room, 'Alice', self::TOKEN);
    $other = $this->createRoom('OTHER-1');
    $this->participant($other, 'Bob', 'token-for-bob-0123456789abcdefgh');

    $this->assertSame(403, $this->vote(['value' => 50], NULL)->getStatusCode());
    $this->assertSame(403, $this->vote(['value' => 50], '')->getStatusCode());
    $this->assertSame(403, $this->vote(['value' => 50], 'not-a-real-token-0123456789abcdef')->getStatusCode());
    // Bob's valid token does not work in Alice's room.
    $this->assertSame(403, $this->vote(['value' => 50], 'token-for-bob-0123456789abcdefgh')->getStatusCode());
    $this->assertSame(0, $this->voteCount());
  }

  /**
   * A closed room takes no more votes, and unknown rooms and bad bodies are errors.
   */
  public function testClosedRoomMalformedBodyAndUnknownRoom(): void {
    $this->participant($this->room, 'Alice', self::TOKEN);
    $this->assertSame(400, $this->vote('not json')->getStatusCode());
    $this->assertSame(400, $this->vote('"just a string"')->getStatusCode());
    $this->assertSame(404, $this->vote(['value' => 5], self::TOKEN, 'NOPE-1')->getStatusCode());

    $this->room->set('field_status', 'closed')->save();
    $response = $this->vote(['value' => 50]);
    $this->assertSame(409, $response->getStatusCode());
    $this->assertSame('room_closed', json_decode((string) $response->getBody(), TRUE, 512, JSON_THROW_ON_ERROR)['error']);
    $this->assertSame(0, $this->voteCount());
  }

  /**
   * One attendee voting too fast is slowed down without affecting anyone else.
   */
  public function testVotesAreRateLimitedPerParticipant(): void {
    $this->participant($this->room, 'Alice', self::TOKEN);
    $this->participant($this->room, 'Bob', 'token-for-bob-0123456789abcdefgh');
    for ($i = 0; $i < LiveController::VOTE_LIMIT; $i++) {
      $this->assertSame(200, $this->vote(['value' => $i])->getStatusCode());
    }
    $this->assertSame(429, $this->vote(['value' => 50])->getStatusCode());
    $this->assertSame(200, $this->vote(['value' => 50], 'token-for-bob-0123456789abcdefgh')->getStatusCode());
  }

  /**
   * An empty room has no median, mood or dots.
   */
  public function testEmptyRoomState(): void {
    $state = $this->state();
    $this->assertSame('NED-4261', $state['code']);
    $this->assertSame('open', $state['status']);
    $this->assertSame(0, $state['count']);
    $this->assertSame(0, $state['voters']);
    $this->assertNull($state['median']);
    $this->assertNull($state['tier']);
    $this->assertSame([], $state['dots']);
  }

  /**
   * The median is the middle value, or the rounded average of the middle two.
   */
  public function testMedianForOddAndEvenCounts(): void {
    $this->participant($this->room, 'A', 'token-a-0123456789abcdefghijkl', 10);
    $this->participant($this->room, 'B', 'token-b-0123456789abcdefghijkl', 50);
    $this->participant($this->room, 'C', 'token-c-0123456789abcdefghijkl', 90);
    $state = $this->state();
    $this->assertSame(50, $state['median']);
    $this->assertSame('mid', $state['tier']);

    $this->participant($this->room, 'D', 'token-d-0123456789abcdefghijkl', 100);
    $this->forgetState();
    $state = $this->state();
    // Middle two are 50 and 90.
    $this->assertSame(70, $state['median']);
    $this->assertSame('high', $state['tier']);

    // An average that lands on a half rounds up: (10 + 15) / 2 = 12.5.
    $room = $this->createRoom('HALF-1');
    $this->participant($room, 'E', 'token-e-0123456789abcdefghijkl', 10);
    $this->participant($room, 'F', 'token-f-0123456789abcdefghijkl', 15);
    $state = $this->state('HALF-1');
    $this->assertSame(13, $state['median']);
    $this->assertSame('low', $state['tier']);
  }

  /**
   * People who haven't moved the slider are counted but not drawn.
   */
  public function testNonVotersAreCountedButNotDrawn(): void {
    $this->participant($this->room, 'A', 'token-a-0123456789abcdefghijkl', 20);
    $this->participant($this->room, 'B', 'token-b-0123456789abcdefghijkl');
    $this->participant($this->room, 'C', 'token-c-0123456789abcdefghijkl');
    $state = $this->state();
    $this->assertSame(3, $state['count']);
    $this->assertSame(1, $state['voters']);
    $this->assertCount(1, $state['dots']);
    $this->assertSame(20, $state['median']);
  }

  /**
   * The public state holds nothing that identifies a person.
   */
  public function testStateHasNoPersonalData(): void {
    $alice = $this->participant($this->room, 'Alice Anderson', self::TOKEN, 60, 3);
    $response = $this->getHttpClient()->request('GET', $this->buildUrl('/api/fun/rooms/NED-4261/state'));
    $body = (string) $response->getBody();
    foreach (['Alice', 'Anderson', self::TOKEN, hash('sha256', self::TOKEN), (string) $alice->uuid(), 'token'] as $secret) {
      $this->assertStringNotContainsString($secret, $body);
    }
    $cache_control = $response->getHeaderLine('Cache-Control');
    $this->assertStringContainsString('public', $cache_control);
    $this->assertStringContainsString('max-age=' . SwarmState::CACHE_SECONDS, $cache_control);
    $dot = json_decode($body, TRUE, 512, JSON_THROW_ON_ERROR)['dots'][0];
    $this->assertSame(['id', 'x', 'y', 'avatar'], array_keys($dot));
    $this->assertSame(3, $dot['avatar']);
  }

  /**
   * A dot keeps its id and its vertical place between calls, within the field.
   */
  public function testDotIdsAndPositionsAreStable(): void {
    $this->participant($this->room, 'A', 'token-a-0123456789abcdefghijkl', 10);
    $this->participant($this->room, 'B', 'token-b-0123456789abcdefghijkl', 80);
    $first = $this->state()['dots'];
    $this->forgetState();
    $second = $this->state()['dots'];
    $this->assertSame($first, $second);
    foreach ($first as $dot) {
      $this->assertMatchesRegularExpression('/^[0-9a-f]{12}$/', $dot['id']);
      $this->assertGreaterThanOrEqual(8, $dot['y']);
      $this->assertLessThanOrEqual(92, $dot['y']);
    }
    $this->assertNotSame($first[0]['id'], $first[1]['id']);
  }

  /**
   * The state of a closed room is still readable, and an unknown room is a 404.
   */
  public function testClosedRoomStateIsReadableAndUnknownRoomIs404(): void {
    $this->participant($this->room, 'A', 'token-a-0123456789abcdefghijkl', 30);
    $this->room->set('field_status', 'closed')->save();
    $state = $this->state();
    $this->assertSame('closed', $state['status']);
    $this->assertSame(30, $state['median']);

    $response = $this->getHttpClient()->request('GET', $this->buildUrl('/api/fun/rooms/NOPE-1/state'), [RequestOptions::HTTP_ERRORS => FALSE]);
    $this->assertSame(404, $response->getStatusCode());
  }

  /**
   * A vote shows up in the swarm, under the id the vote returned.
   */
  public function testVoteAppearsInTheSwarm(): void {
    $this->participant($this->room, 'Alice', self::TOKEN, NULL, 2);
    $id = json_decode((string) $this->vote(['value' => 65])->getBody(), TRUE, 512, JSON_THROW_ON_ERROR)['id'];
    $this->forgetState();
    $state = $this->state();
    $this->assertSame(65, $state['median']);
    $this->assertSame('high', $state['tier']);
    $this->assertSame([['id' => $id, 'x' => 65, 'y' => $state['dots'][0]['y'], 'avatar' => 2]], $state['dots']);
  }

  /**
   * Anonymous visitors cannot set a fun value through JSON:API when joining.
   */
  public function testFunCannotBeSetThroughJsonApi(): void {
    $response = $this->getHttpClient()->request('POST', $this->buildUrl('/jsonapi/fun_participant/fun_participant'), [
      RequestOptions::HEADERS => ['Content-Type' => 'application/vnd.api+json', 'Accept' => 'application/vnd.api+json'],
      RequestOptions::HTTP_ERRORS => FALSE,
      RequestOptions::BODY => json_encode(['data' => [
        'type' => 'fun_participant--fun_participant',
        'attributes' => ['name' => 'Sneaky', 'avatar' => 1, 'token' => self::TOKEN, 'fun' => 100],
        'relationships' => ['room' => ['data' => ['type' => 'node--room', 'id' => $this->room->uuid()]]],
      ]], JSON_THROW_ON_ERROR),
    ]);
    $this->assertSame(403, $response->getStatusCode(), (string) $response->getBody());
    $this->assertCount(0, \Drupal::entityTypeManager()->getStorage('fun_participant')->loadMultiple());
  }

}
