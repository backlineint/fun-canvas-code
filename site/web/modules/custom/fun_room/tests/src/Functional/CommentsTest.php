<?php

declare(strict_types=1);

namespace Drupal\Tests\fun_room\Functional;

use Drupal\fun_room\Controller\CommentController;
use Drupal\fun_room\Entity\FunParticipant;
use Drupal\node\Entity\Node;
use Drupal\node\NodeInterface;
use Drupal\Tests\BrowserTestBase;
use GuzzleHttp\RequestOptions;
use PHPUnit\Framework\Attributes\DataProvider;
use PHPUnit\Framework\Attributes\Group;
use Psr\Http\Message\ResponseInterface;

/**
 * Exercises posting comments and the public comments feed.
 */
#[Group('fun_room')]
final class CommentsTest extends BrowserTestBase {

  private const TOKEN = 'token-for-alice-0123456789abcdef';

  private const OTHER_TOKEN = 'token-for-bob-0123456789abcdef012';

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
    $this->participant($this->room, 'Alice', self::TOKEN, 2);
  }

  private function createRoom(string $code, string $status = 'open', int $slide = 0, string $title = ''): NodeInterface {
    $room = Node::create([
      'type' => 'room',
      'title' => $code,
      'status' => 1,
      'field_status' => $status,
      'field_current_slide' => $slide,
      'field_current_slide_title' => $title,
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
   * Drops the cached feed, which is otherwise reused for a second.
   */
  private function forgetFeed(): void {
    \Drupal::service('cache.default')->deleteAll();
  }

  /**
   * @param array<string, mixed>|string|null $body
   *   A JSON body (array), a raw body (string), or none.
   */
  private function post(array|string|null $body, ?string $token = self::TOKEN, string $code = 'NED-4261'): ResponseInterface {
    $headers = ['Content-Type' => 'application/json', 'Accept' => 'application/json'];
    if ($token !== NULL) {
      $headers['X-Participant-Token'] = $token;
    }
    $options = [RequestOptions::HEADERS => $headers, RequestOptions::HTTP_ERRORS => FALSE];
    if ($body !== NULL) {
      $options[RequestOptions::BODY] = is_array($body) ? json_encode($body, JSON_THROW_ON_ERROR) : $body;
    }
    return $this->getHttpClient()->request('POST', $this->buildUrl('/api/fun/rooms/' . $code . '/comments'), $options);
  }

  private function say(string $text, ?string $token = self::TOKEN, string $code = 'NED-4261'): ResponseInterface {
    return $this->post(['text' => $text], $token, $code);
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
   *   The comments the feed returns.
   */
  private function feed(array $query = [], string $code = 'NED-4261'): array {
    $this->forgetFeed();
    $response = $this->getHttpClient()->request('GET', $this->buildUrl('/api/fun/rooms/' . $code . '/comments', ['query' => $query]), [RequestOptions::HTTP_ERRORS => FALSE]);
    $this->assertSame(200, $response->getStatusCode());
    return $this->json($response)['comments'];
  }

  private function reset(): void {
    \Drupal::database()->delete('flood')->execute();
  }

  /**
   * A comment is stored with the room's current slide and title, and is listed.
   */
  public function testCommentIsStoredWithTheSlideAndListed(): void {
    $this->room->set('field_current_slide', 3)->set('field_current_slide_title', 'Props are just JSON')->save();

    $response = $this->say('  Wait, that runs   in the browser?  ');
    $this->assertSame(201, $response->getStatusCode());
    $this->assertStringContainsString('no-store', $response->getHeaderLine('Cache-Control'));
    $comment = $this->json($response);
    $this->assertSame('Wait, that runs in the browser?', $comment['text']);
    $this->assertSame('Alice', $comment['name']);
    $this->assertSame(2, $comment['avatar']);
    $this->assertSame(3, $comment['slide']);
    $this->assertSame('Props are just JSON', $comment['slideTitle']);
    $this->assertMatchesRegularExpression('/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\dZ$/', $comment['at']);

    $feed = $this->feed();
    $this->assertCount(1, $feed);
    $this->assertSame($comment, $feed[0]);
  }

  /**
   * The slide is the one showing when the comment was posted, not later.
   */
  public function testEachCommentKeepsItsOwnSlide(): void {
    $this->say('first');
    $this->room->set('field_current_slide', 5)->set('field_current_slide_title', 'Later')->save();
    $this->say('second');
    $this->room->set('field_current_slide', 9)->save();

    $feed = $this->feed();
    $this->assertSame([0, 5], array_column($feed, 'slide'));
    $this->assertSame(['', 'Later'], array_column($feed, 'slideTitle'));
  }

  /**
   * Bad text is rejected with a 422 and stores nothing.
   *
   * @param array<string, mixed>|string $body
   *   The request body.
   */
  #[DataProvider('invalidTexts')]
  public function testInvalidTextIsRejected(array|string $body, string $error): void {
    $response = $this->post($body);
    $this->assertSame(422, $response->getStatusCode());
    $this->assertSame($error, $this->json($response)['error']);
    $this->assertSame([], $this->feed());
  }

  /**
   * @return array<string, array{0: array<string, mixed>|string, 1: string}>
   *   Bodies and the error each gets.
   */
  public static function invalidTexts(): array {
    return [
      'empty' => [['text' => ''], 'empty'],
      'only spaces' => [['text' => "   \t  "], 'empty'],
      'only control characters' => [['text' => "\x01\x02\n\r"], 'empty'],
      'only invisible characters' => [['text' => "\u{200B}\u{202E}"], 'empty'],
      'too long' => [['text' => str_repeat('a', 281)], 'too_long'],
      'a number' => [['text' => 5], 'invalid_text'],
      'an array' => [['text' => ['a']], 'invalid_text'],
      'null' => [['text' => NULL], 'invalid_text'],
      'missing' => [['other' => 'x'], 'invalid_text'],
    ];
  }

  /**
   * Boundary lengths are counted in characters, and newlines become spaces.
   */
  public function testLengthIsCountedInCharactersAndNewlinesBecomeSpaces(): void {
    $this->assertSame(201, $this->say(str_repeat('a', 280))->getStatusCode());
    // 280 emoji are 1120 bytes but 280 characters.
    $this->assertSame(201, $this->say(str_repeat("\u{1F389}", 280))->getStatusCode());
    $this->assertSame(422, $this->say(str_repeat("\u{1F389}", 281))->getStatusCode());
    $this->reset();
    $multi = $this->json($this->say("line one\nline two\r\n\tline three"));
    $this->assertSame('line one line two line three', $multi['text']);
    $hidden = $this->json($this->say("zero\u{200B}width"));
    $this->assertSame('zerowidth', $hidden['text']);
  }

  /**
   * Markup is stored and returned as plain text for the clients to escape.
   */
  public function testMarkupIsPlainText(): void {
    $text = '<script>alert(1)</script><img src=x onerror=alert(2)>';
    $this->assertSame(201, $this->say($text)->getStatusCode());
    $this->assertSame($text, $this->feed()[0]['text']);
  }

  /**
   * Missing, wrong and other-room tokens get a 403.
   */
  public function testTokenIsRequiredAndScopedToTheRoom(): void {
    $this->assertSame(403, $this->say('hi', NULL)->getStatusCode());
    $this->assertSame(403, $this->say('hi', 'not-a-real-token')->getStatusCode());

    $other = $this->createRoom('DEMO-1');
    $this->participant($other, 'Bob', self::OTHER_TOKEN);
    $this->assertSame(403, $this->say('hi', self::OTHER_TOKEN)->getStatusCode());
    $this->assertSame(201, $this->say('hi', self::OTHER_TOKEN, 'DEMO-1')->getStatusCode());
    $this->assertSame([], $this->feed());
  }

  /**
   * A closed room refuses new comments but still shows the old ones.
   */
  public function testClosedRoomRefusesCommentsButStillListsThem(): void {
    $this->say('before it closed');
    $this->room->set('field_status', 'closed')->save();
    $this->reset();
    $response = $this->say('too late');
    $this->assertSame(409, $response->getStatusCode());
    $this->assertSame('room_closed', $this->json($response)['error']);
    $this->assertSame(['before it closed'], array_column($this->feed(), 'text'));
  }

  /**
   * Bad JSON is a 400 and an unknown room a 404 for both verbs.
   */
  public function testBadJsonAndUnknownRoom(): void {
    $this->assertSame(400, $this->post('not json')->getStatusCode());
    // Text that isn't valid UTF-8 can't even be decoded as JSON.
    $this->assertSame(400, $this->post('{"text":"' . "\xB1\x31" . '"}')->getStatusCode());
    $this->assertSame(404, $this->say('hi', self::TOKEN, 'NOPE-0000')->getStatusCode());
    $response = $this->getHttpClient()->request('GET', $this->buildUrl('/api/fun/rooms/NOPE-0000/comments'), [RequestOptions::HTTP_ERRORS => FALSE]);
    $this->assertSame(404, $response->getStatusCode());
  }

  /**
   * Too many comments from one attendee get a 429, and others are unaffected.
   */
  public function testPerParticipantRateLimit(): void {
    $this->participant($this->room, 'Bob', self::OTHER_TOKEN);
    for ($i = 0; $i < CommentController::COMMENT_LIMIT; $i++) {
      $this->assertSame(201, $this->say("comment $i")->getStatusCode());
    }
    $limited = $this->say('one too many');
    $this->assertSame(429, $limited->getStatusCode());
    $this->assertSame('too_many_requests', $this->json($limited)['error']);
    $this->assertSame(201, $this->say('Bob can still talk', self::OTHER_TOKEN)->getStatusCode());
  }

  /**
   * Repeating the same comment right away returns the original, not a copy.
   */
  public function testRepeatReturnsTheOriginal(): void {
    $first = $this->json($this->say('same words'));
    $again = $this->json($this->say('same words'));
    $this->assertSame($first['id'], $again['id']);
    $this->assertCount(1, $this->feed());
    $next = $this->json($this->say('other words'));
    $this->assertNotSame($first['id'], $next['id']);
  }

  /**
   * The feed is oldest first; "after" returns only newer ones; "limit" is capped.
   */
  public function testAfterAndLimit(): void {
    $ids = [];
    for ($i = 1; $i <= 7; $i++) {
      $ids[] = $this->json($this->say("comment $i"))['id'];
      if ($i % 4 === 0) {
        $this->reset();
      }
    }
    $this->assertSame(range(1, 7), array_map(fn ($t) => (int) substr($t, 8), array_column($this->feed(), 'text')));
    $this->assertSame($ids, array_column($this->feed(), 'id'));

    // Without "after" the newest ones, still oldest first.
    $this->assertSame(['comment 6', 'comment 7'], array_column($this->feed(['limit' => '2']), 'text'));
    // With "after" only what is newer.
    $this->assertSame(['comment 6', 'comment 7'], array_column($this->feed(['after' => (string) $ids[4]]), 'text'));
    $this->assertSame([], $this->feed(['after' => (string) $ids[6]]));
    // With "after" and a limit, the next ones after it.
    $this->assertSame(['comment 3'], array_column($this->feed(['after' => (string) $ids[1], 'limit' => '1']), 'text'));
    // Junk values fall back to the defaults.
    $this->assertCount(7, $this->feed(['after' => 'abc', 'limit' => 'xyz']));
  }

  /**
   * The limit is capped at 50.
   */
  public function testLimitIsCapped(): void {
    $participant = FunParticipant::load(1);
    for ($i = 0; $i < 60; $i++) {
      \Drupal::entityTypeManager()->getStorage('fun_comment')->create([
        'participant' => $participant->id(),
        'room' => $this->room->id(),
        'slide' => 0,
        'body' => "bulk $i",
      ])->save();
    }
    $this->assertCount(50, $this->feed(['limit' => '500']));
    $this->assertCount(30, $this->feed());
  }

  /**
   * One room's feed holds only its own comments, and nothing that identifies anyone.
   */
  public function testFeedIsPerRoomAndLeaksNothing(): void {
    $other = $this->createRoom('DEMO-1');
    $this->participant($other, 'Bob', self::OTHER_TOKEN);
    $this->say('in the first room');
    $this->say('in the other room', self::OTHER_TOKEN, 'DEMO-1');

    $this->assertSame(['in the first room'], array_column($this->feed(), 'text'));
    $this->assertSame(['in the other room'], array_column($this->feed([], 'DEMO-1'), 'text'));

    $this->forgetFeed();
    $body = (string) $this->getHttpClient()->request('GET', $this->buildUrl('/api/fun/rooms/NED-4261/comments'))->getBody();
    $this->assertStringNotContainsString(self::TOKEN, $body);
    $this->assertStringNotContainsString(hash('sha256', self::TOKEN), $body);
    $item = $this->feed()[0];
    $keys = array_keys($item);
    sort($keys);
    $this->assertSame(['at', 'avatar', 'id', 'name', 'slide', 'slideTitle', 'text'], $keys);
  }

  /**
   * The feed is public and cacheable for a second.
   */
  public function testFeedHeaders(): void {
    $response = $this->getHttpClient()->request('GET', $this->buildUrl('/api/fun/rooms/NED-4261/comments'));
    $cache_control = $response->getHeaderLine('Cache-Control');
    $this->assertStringContainsString('public', $cache_control);
    $this->assertStringContainsString('max-age=1', $cache_control);
  }

  /**
   * Comments cannot be read or created through JSON:API by an anonymous visitor.
   */
  public function testCommentsAreNotExposedThroughJsonApi(): void {
    $this->say('hello');
    $response = $this->getHttpClient()->request('GET', $this->buildUrl('/jsonapi/fun_comment/fun_comment'), [RequestOptions::HTTP_ERRORS => FALSE]);
    // Either the resource isn't there, or every comment is filtered out as inaccessible.
    $this->assertContains($response->getStatusCode(), [200, 403, 404]);
    if ($response->getStatusCode() === 200) {
      $this->assertSame([], json_decode((string) $response->getBody(), TRUE)['data']);
    }
    $post = $this->getHttpClient()->request('POST', $this->buildUrl('/jsonapi/fun_comment/fun_comment'), [
      RequestOptions::HEADERS => ['Content-Type' => 'application/vnd.api+json'],
      RequestOptions::BODY => '{"data":{"type":"fun_comment--fun_comment","attributes":{"body":"hi","slide":0}}}',
      RequestOptions::HTTP_ERRORS => FALSE,
    ]);
    $this->assertContains($post->getStatusCode(), [403, 404, 405]);
  }

}
