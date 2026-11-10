<?php

declare(strict_types=1);

namespace Drupal\Tests\fun_room\Functional;

use Drupal\fun_room\Controller\RequestController;
use Drupal\fun_room\Entity\FunParticipant;
use Drupal\fun_room\Entity\FunRequest;
use Drupal\fun_room\PresenterKeyChecker;
use Drupal\node\Entity\Node;
use Drupal\node\NodeInterface;
use Drupal\Tests\BrowserTestBase;
use GuzzleHttp\RequestOptions;
use PHPUnit\Framework\Attributes\DataProvider;
use PHPUnit\Framework\Attributes\Group;
use Psr\Http\Message\ResponseInterface;

/**
 * Exercises requests: making, cancelling, delivering and the public feed.
 */
#[Group('fun_room')]
final class RequestsTest extends BrowserTestBase {

  private const TOKEN = 'token-for-alice-0123456789abcdef';

  private const OTHER_TOKEN = 'token-for-bob-0123456789abcdef012';

  private const KEY = 'a-long-presenter-key-for-tests-0123456789';

  /**
   * {@inheritdoc}
   */
  protected static $modules = ['fun_room', 'jsonapi'];

  /**
   * {@inheritdoc}
   */
  protected $defaultTheme = 'stark';

  private NodeInterface $room;

  private FunParticipant $alice;

  private FunParticipant $bob;

  /**
   * {@inheritdoc}
   */
  protected function setUp(): void {
    parent::setUp();
    user_role_grant_permissions('anonymous', ['access content']);
    $this->writeSettings([
      'settings' => ['fun_room_presenter_key' => (object) ['value' => self::KEY, 'required' => TRUE]],
    ]);
    $this->room = $this->createRoom('NED-4261');
    $this->alice = $this->participant($this->room, 'Alice', self::TOKEN, 2);
    $this->bob = $this->participant($this->room, 'Bob', self::OTHER_TOKEN, 4);
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

  private function participant(NodeInterface $room, string $name, string $token, int $avatar = 0): FunParticipant {
    $participant = FunParticipant::create(['room' => $room->id(), 'name' => $name, 'avatar' => $avatar, 'token' => $token]);
    $participant->save();
    return $participant;
  }

  /**
   * @param array<string, mixed>|string|null $body
   *   A JSON body (array), a raw body (string), or none.
   * @param array<string, string> $headers
   *   Extra headers.
   */
  private function post(string $path, array|string|null $body, array $headers = [], string $code = 'NED-4261'): ResponseInterface {
    $options = [
      RequestOptions::HEADERS => $headers + ['Content-Type' => 'application/json', 'Accept' => 'application/json'],
      RequestOptions::HTTP_ERRORS => FALSE,
    ];
    if ($body !== NULL) {
      $options[RequestOptions::BODY] = is_array($body) ? json_encode($body, JSON_THROW_ON_ERROR) : $body;
    }
    return $this->getHttpClient()->request('POST', $this->buildUrl('/api/fun/rooms/' . $code . '/' . $path), $options);
  }

  /**
   * Makes a request as Alice (by default).
   */
  private function ask(string $kind, string $note = '', string $token = self::TOKEN, string $code = 'NED-4261'): ResponseInterface {
    $body = ['kind' => $kind];
    if ($note !== '') {
      $body['note'] = $note;
    }
    return $this->post('requests', $body, ['X-Participant-Token' => $token], $code);
  }

  private function deliver(int $id, ?string $key = self::KEY, string $code = 'NED-4261'): ResponseInterface {
    return $this->post("requests/$id/deliver", NULL, $key === NULL ? [] : ['X-Presenter-Key' => $key], $code);
  }

  private function cancel(int $id, string $token = self::TOKEN): ResponseInterface {
    return $this->post("requests/$id/cancel", NULL, ['X-Participant-Token' => $token]);
  }

  /**
   * @return array<string, mixed>
   *   The decoded JSON of a response.
   */
  private function json(ResponseInterface $response): array {
    return json_decode((string) $response->getBody(), TRUE, 512, JSON_THROW_ON_ERROR);
  }

  /**
   * @param array<string, string> $query
   *   Query parameters.
   *
   * @return list<array<string, mixed>>
   *   The requests the feed returns.
   */
  private function feed(array $query = [], string $code = 'NED-4261'): array {
    \Drupal::service('cache.default')->deleteAll();
    $response = $this->request($query, $code);
    $this->assertSame(200, $response->getStatusCode());
    return $this->json($response)['requests'];
  }

  /**
   * @param array<string, string> $query
   *   Query parameters.
   */
  private function request(array $query = [], string $code = 'NED-4261'): ResponseInterface {
    return $this->getHttpClient()->request('GET', $this->buildUrl('/api/fun/rooms/' . $code . '/requests', ['query' => $query]), [RequestOptions::HTTP_ERRORS => FALSE]);
  }

  private function reset(): void {
    \Drupal::database()->delete('flood')->execute();
  }

  /**
   * Moves a request's change time, to control "since" in tests.
   */
  private function touch(int $id, int $changed): void {
    \Drupal::database()->update('fun_request')->fields(['changed' => $changed])->condition('id', $id)->execute();
    \Drupal::entityTypeManager()->getStorage('fun_request')->resetCache([$id]);
  }

  /**
   * A request is created open, with the slide showing, the note cleaned and who asked.
   */
  public function testRequestIsCreated(): void {
    $this->room->set('field_current_slide', 4)->save();
    $response = $this->ask('candy', "  back   left,\n aisle ");
    $this->assertSame(201, $response->getStatusCode());
    $this->assertStringContainsString('no-store', $response->getHeaderLine('Cache-Control'));
    $request = $this->json($response);
    $this->assertSame('candy', $request['kind']);
    $this->assertSame('back left, aisle', $request['note']);
    $this->assertSame('open', $request['status']);
    $this->assertSame('Alice', $request['name']);
    $this->assertSame(2, $request['avatar']);
    $this->assertSame(4, $request['slide']);
    $this->assertMatchesRegularExpression('/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\dZ$/', $request['at']);
    $this->assertSame([$request], $this->feed());
  }

  /**
   * Each kind is accepted and the note is optional.
   */
  public function testEveryKindAndNoNote(): void {
    foreach (FunRequest::KINDS as $kind) {
      $this->assertSame(201, $this->ask($kind)->getStatusCode());
    }
    $this->assertSame(['hat', 'noise', 'candy'], array_column($this->feed(), 'kind'));
    $this->assertSame(['', '', ''], array_column($this->feed(), 'note'));
  }

  /**
   * A bad kind, a bad or long note and bad JSON are rejected and store nothing.
   *
   * @param array<string, mixed>|string $body
   *   The request body.
   */
  #[DataProvider('invalidBodies')]
  public function testInvalidBodyIsRejected(array|string $body, int $status, string $error): void {
    $response = $this->post('requests', $body, ['X-Participant-Token' => self::TOKEN]);
    $this->assertSame($status, $response->getStatusCode());
    $this->assertSame($error, $this->json($response)['error']);
    $this->assertSame([], $this->feed());
  }

  /**
   * @return array<string, array{0: array<string, mixed>|string, 1: int, 2: string}>
   *   Bodies, the status and the error each gets.
   */
  public static function invalidBodies(): array {
    return [
      'missing kind' => [['note' => 'x'], 422, 'invalid_kind'],
      'unknown kind' => [['kind' => 'pizza'], 422, 'invalid_kind'],
      'kind is a number' => [['kind' => 1], 422, 'invalid_kind'],
      'kind in the wrong case' => [['kind' => 'Candy'], 422, 'invalid_kind'],
      'note too long' => [['kind' => 'hat', 'note' => str_repeat('a', 41)], 422, 'too_long'],
      'note is a number' => [['kind' => 'hat', 'note' => 5], 422, 'invalid_note'],
      'note is an array' => [['kind' => 'hat', 'note' => ['a']], 422, 'invalid_note'],
      'not json' => ['nope', 400, 'invalid_json'],
    ];
  }

  /**
   * A 40-character note (counted in characters) is accepted, and markup is plain text.
   */
  public function testNoteBoundaryAndMarkup(): void {
    $this->assertSame(201, $this->ask('hat', str_repeat("\u{1F389}", 40))->getStatusCode());
    $this->assertSame(422, $this->ask('noise', str_repeat("\u{1F389}", 41))->getStatusCode());
    $markup = $this->json($this->ask('candy', '<b>row 3</b>'));
    $this->assertSame('<b>row 3</b>', $markup['note']);
  }

  /**
   * Missing, wrong and other-room tokens get a 403.
   */
  public function testTokenIsRequiredAndScopedToTheRoom(): void {
    $this->assertSame(403, $this->post('requests', ['kind' => 'hat'])->getStatusCode());
    $this->assertSame(403, $this->ask('hat', '', 'not-a-real-token')->getStatusCode());
    $other = $this->createRoom('DEMO-1');
    $carol = $this->participant($other, 'Carol', 'token-for-carol-0123456789abcdef0');
    $this->assertSame(403, $this->ask('hat', '', 'token-for-carol-0123456789abcdef0')->getStatusCode());
    $this->assertSame(201, $this->ask('hat', '', 'token-for-carol-0123456789abcdef0', 'DEMO-1')->getStatusCode());
    $this->assertNotNull($carol->id());
    $this->assertSame([], $this->feed());
  }

  /**
   * A closed room takes no new requests but still lists its requests.
   */
  public function testClosedRoom(): void {
    $id = $this->json($this->ask('hat'))['id'];
    $this->room->set('field_status', 'closed')->save();
    $this->reset();
    $response = $this->ask('candy');
    $this->assertSame(409, $response->getStatusCode());
    $this->assertSame('room_closed', $this->json($response)['error']);
    $this->assertSame([$id], array_column($this->feed(), 'id'));
    // Volunteers can still finish up.
    $this->assertSame(200, $this->deliver($id)->getStatusCode());
    $this->assertSame(404, $this->ask('hat', '', self::TOKEN, 'NOPE-0000')->getStatusCode());
  }

  /**
   * Asking again for a kind that is still open returns the existing request.
   */
  public function testAskingAgainWhileOpenReturnsTheExisting(): void {
    $first = $this->ask('candy', 'row 2');
    $this->assertSame(201, $first->getStatusCode());
    $again = $this->ask('candy', 'a different note');
    $this->assertSame(200, $again->getStatusCode());
    $this->assertSame($this->json($first)['id'], $this->json($again)['id']);
    $this->assertSame('row 2', $this->json($again)['note']);
    $this->assertCount(1, $this->feed());
    // A different kind is a different request, and Bob's own is separate.
    $this->assertSame(201, $this->ask('hat')->getStatusCode());
    $this->assertSame(201, $this->ask('candy', '', self::OTHER_TOKEN)->getStatusCode());
    $this->assertCount(3, $this->feed());
  }

  /**
   * Once delivered or cancelled, the attendee can ask for that kind again.
   */
  public function testAskingAgainAfterDeliveredOrCancelled(): void {
    $first = $this->json($this->ask('candy'))['id'];
    $this->assertSame(200, $this->deliver($first)->getStatusCode());
    $second = $this->ask('candy');
    $this->assertSame(201, $second->getStatusCode());
    $this->assertNotSame($first, $this->json($second)['id']);
    $this->assertSame(200, $this->cancel($this->json($second)['id'])->getStatusCode());
    $this->assertSame(201, $this->ask('candy')->getStatusCode());
  }

  /**
   * Only the attendee who asked can cancel, and only while it is open.
   */
  public function testCancel(): void {
    $id = $this->json($this->ask('hat'))['id'];
    $this->assertSame(403, $this->cancel($id, self::OTHER_TOKEN)->getStatusCode());
    $this->assertSame(403, $this->post("requests/$id/cancel", NULL)->getStatusCode());
    $cancelled = $this->cancel($id);
    $this->assertSame(200, $cancelled->getStatusCode());
    $this->assertSame('cancelled', $this->json($cancelled)['status']);
    // Cancelling twice changes nothing; a delivered request can't be cancelled.
    $this->assertSame('cancelled', $this->json($this->cancel($id))['status']);
    $delivered = $this->json($this->ask('noise'))['id'];
    $this->deliver($delivered);
    $this->assertSame('delivered', $this->json($this->cancel($delivered))['status']);
    $this->assertSame(404, $this->cancel(99999)->getStatusCode());
  }

  /**
   * Cancelled requests are out of the plain feed but show in a "since" feed.
   */
  public function testCancelledIsHiddenUnlessSince(): void {
    $id = $this->json($this->ask('hat'))['id'];
    $keep = $this->json($this->ask('candy'))['id'];
    $this->touch($id, time() - 20);
    $this->cancel($id);
    $this->touch($id, time() - 10);
    $this->assertSame([$keep], array_column($this->feed(), 'id'));
    $since = array_column($this->feed(['since' => (string) (time() - 15)]), 'status', 'id');
    $this->assertSame('cancelled', $since[$id]);
    $this->assertArrayHasKey($keep, $since);
  }

  /**
   * The presenter key marks a request delivered, idempotently.
   */
  public function testDeliver(): void {
    $id = $this->json($this->ask('hat', 'row 9'))['id'];
    $response = $this->deliver($id);
    $this->assertSame(200, $response->getStatusCode());
    $item = $this->json($response);
    $this->assertSame('delivered', $item['status']);
    $this->assertSame('Alice', $item['name']);
    $this->assertSame('delivered', $this->json($this->deliver($id))['status']);
    $this->assertSame('delivered', $this->feed()[0]['status']);
  }

  /**
   * A wrong or missing key is a 403, no key configured is a 503, the right key is
   * never rate limited, and ids from another room are a 404.
   */
  public function testDeliverNeedsTheKey(): void {
    $id = $this->json($this->ask('hat'))['id'];
    $this->assertSame(403, $this->deliver($id, NULL)->getStatusCode());
    $this->assertSame(403, $this->deliver($id, 'nope')->getStatusCode());
    $this->assertSame('open', $this->feed()[0]['status']);

    for ($i = 0; $i < PresenterKeyChecker::FLOOD_LIMIT; $i++) {
      $this->deliver($id, 'nope');
    }
    $this->assertSame(429, $this->deliver($id, 'nope')->getStatusCode());
    $this->assertSame(200, $this->deliver($id)->getStatusCode());

    $other = $this->createRoom('DEMO-1');
    $this->assertNotNull($other->id());
    $this->assertSame(404, $this->deliver($id, self::KEY, 'DEMO-1')->getStatusCode());
    $this->assertSame(404, $this->deliver(99999)->getStatusCode());
    $this->assertSame(404, $this->deliver($id, self::KEY, 'NOPE-0000')->getStatusCode());
  }

  /**
   * With no presenter key configured nobody can deliver.
   */
  public function testDeliverIsRefusedWithoutAConfiguredKey(): void {
    $id = $this->json($this->ask('hat'))['id'];
    $this->writeSettings([
      'settings' => ['fun_room_presenter_key' => (object) ['value' => '', 'required' => TRUE]],
    ]);
    $this->assertSame(503, $this->deliver($id, '')->getStatusCode());
    $this->assertSame(503, $this->deliver($id)->getStatusCode());
  }

  /**
   * "since" is inclusive, the plain feed is the newest $limit, and the limit is capped.
   */
  public function testSinceAndLimit(): void {
    $ids = [];
    foreach (['hat', 'noise', 'candy'] as $i => $kind) {
      $ids[$kind] = $this->json($this->ask($kind))['id'];
      $this->touch($ids[$kind], time() - 30 + $i * 10);
    }
    $changed = array_column($this->feed(), 'changed', 'id');
    $this->assertSame(array_values($ids), array_keys($changed));
    $this->assertSame([$ids['noise'], $ids['candy']], array_column($this->feed(['since' => (string) $changed[$ids['noise']]]), 'id'));
    $this->assertSame([$ids['candy']], array_column($this->feed(['since' => (string) ($changed[$ids['noise']] + 1)]), 'id'));
    $this->assertSame([$ids['candy']], array_column($this->feed(['limit' => '1']), 'id'));
    $this->assertCount(3, $this->feed(['since' => 'abc', 'limit' => 'xyz']));
  }

  /**
   * A delivery moves the request to the end of the "changed" order.
   */
  public function testDeliveryChangesTheChangeTime(): void {
    $a = $this->json($this->ask('hat'))['id'];
    $b = $this->json($this->ask('noise'))['id'];
    $this->touch($a, time() - 30);
    $this->touch($b, time() - 20);
    $this->deliver($a);
    $this->assertSame([$b, $a], array_column($this->feed(), 'id'));
  }

  /**
   * "ids" returns exactly those requests, whatever their status, up to 20.
   */
  public function testIdsFilter(): void {
    $a = $this->json($this->ask('hat'))['id'];
    $b = $this->json($this->ask('noise'))['id'];
    $c = $this->json($this->ask('candy', '', self::OTHER_TOKEN))['id'];
    $this->cancel($a);
    $this->assertEqualsCanonicalizing([$a, $b], array_column($this->feed(['ids' => "$a,$b"]), 'id'));
    $this->assertSame([$c], array_column($this->feed(['ids' => (string) $c]), 'id'));
    $this->assertSame([], $this->feed(['ids' => '99999']));
    // Junk is ignored, and it can't reach into another room.
    $other = $this->createRoom('DEMO-1');
    $this->assertNotNull($other->id());
    $this->assertSame([], $this->feed(['ids' => "$a,$b,$c"], 'DEMO-1'));
    $this->assertEqualsCanonicalizing([$b], array_column($this->feed(['ids' => "x,$b,,-1"]), 'id'));
    $this->assertCount(3, $this->feed(['ids' => "$a,$b,$c," . implode(',', range(500, 530))]));
  }

  /**
   * One room's feed holds only its own requests.
   */
  public function testFeedIsPerRoom(): void {
    $other = $this->createRoom('DEMO-1');
    $carol = $this->participant($other, 'Carol', 'token-for-carol-0123456789abcdef0');
    $this->assertNotNull($carol->id());
    $this->ask('hat');
    $this->ask('candy', '', 'token-for-carol-0123456789abcdef0', 'DEMO-1');
    $this->assertSame(['hat'], array_column($this->feed(), 'kind'));
    $this->assertSame(['candy'], array_column($this->feed([], 'DEMO-1'), 'kind'));
    $this->assertSame(404, $this->request([], 'NOPE-0000')->getStatusCode());
  }

  /**
   * The feed shows only the safe fields and is public and cacheable for a second.
   */
  public function testNothingIdentifyingAndPublicHeaders(): void {
    $this->ask('hat', 'row 1');
    \Drupal::service('cache.default')->deleteAll();
    $response = $this->request();
    $body = (string) $response->getBody();
    $this->assertStringNotContainsString(self::TOKEN, $body);
    $this->assertStringNotContainsString(hash('sha256', self::TOKEN), $body);
    $this->assertStringNotContainsString((string) $this->alice->uuid(), $body);
    $keys = array_keys($this->json($response)['requests'][0]);
    sort($keys);
    $this->assertSame(['at', 'avatar', 'changed', 'id', 'kind', 'name', 'note', 'slide', 'status'], $keys);
    $cache_control = $response->getHeaderLine('Cache-Control');
    $this->assertStringContainsString('public', $cache_control);
    $this->assertStringContainsString('max-age=1', $cache_control);
  }

  /**
   * Too many requests from one attendee get a 429; others are unaffected.
   */
  public function testPerParticipantRateLimit(): void {
    $kinds = ['hat', 'noise', 'candy'];
    for ($i = 0; $i < RequestController::REQUEST_LIMIT; $i++) {
      $kind = $kinds[$i % 3];
      $response = $this->ask($kind);
      $this->assertContains($response->getStatusCode(), [200, 201]);
    }
    $limited = $this->ask('hat');
    $this->assertSame(429, $limited->getStatusCode());
    $this->assertSame('too_many_requests', $this->json($limited)['error']);
    $this->assertSame(201, $this->ask('hat', '', self::OTHER_TOKEN)->getStatusCode());
  }

  /**
   * Requests are not readable or creatable through JSON:API by an anonymous visitor.
   */
  public function testNotExposedThroughJsonApi(): void {
    $this->ask('hat');
    $response = $this->getHttpClient()->request('GET', $this->buildUrl('/jsonapi/fun_request/fun_request'), [RequestOptions::HTTP_ERRORS => FALSE]);
    $this->assertContains($response->getStatusCode(), [200, 403, 404]);
    if ($response->getStatusCode() === 200) {
      $this->assertSame([], json_decode((string) $response->getBody(), TRUE)['data']);
    }
    $post = $this->getHttpClient()->request('POST', $this->buildUrl('/jsonapi/fun_request/fun_request'), [
      RequestOptions::HEADERS => ['Content-Type' => 'application/vnd.api+json'],
      RequestOptions::BODY => '{"data":{"type":"fun_request--fun_request","attributes":{"kind":"hat","slide":0}}}',
      RequestOptions::HTTP_ERRORS => FALSE,
    ]);
    $this->assertContains($post->getStatusCode(), [403, 404, 405]);
  }

}
