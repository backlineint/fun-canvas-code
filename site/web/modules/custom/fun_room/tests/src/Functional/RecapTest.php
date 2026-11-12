<?php

declare(strict_types=1);

namespace Drupal\Tests\fun_room\Functional;

use Drupal\fun_room\Entity\FunComment;
use Drupal\fun_room\Entity\FunParticipant;
use Drupal\fun_room\Entity\FunRequest;
use Drupal\fun_room\Entity\FunVote;
use Drupal\fun_room\RoomRecap;
use Drupal\fun_room\SlideLog;
use Drupal\node\Entity\Node;
use Drupal\node\NodeInterface;
use Drupal\Tests\BrowserTestBase;
use GuzzleHttp\RequestOptions;
use PHPUnit\Framework\Attributes\Group;
use Psr\Http\Message\ResponseInterface;

/**
 * Exercises the end-of-session recap and the slide log behind its slide titles.
 */
#[Group('fun_room')]
final class RecapTest extends BrowserTestBase {

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

  /**
   * @var \Drupal\fun_room\Entity\FunParticipant[]
   */
  private array $people = [];

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
    foreach (['Alice' => 2, 'Bob' => 4, 'Cleo' => 6, 'Dev' => 1] as $name => $avatar) {
      $this->people[$name] = $this->participant($this->room, $name, 'token-for-' . strtolower($name) . '-0123456789abcdef', $avatar);
    }
  }

  private function createRoom(string $code, string $status = 'open'): NodeInterface {
    $room = Node::create([
      'type' => 'room',
      'title' => $code,
      'status' => 1,
      'field_status' => $status,
      'field_current_slide' => 0,
    ]);
    $room->save();
    return $room;
  }

  private function participant(NodeInterface $room, string $name, string $token, int $avatar = 0): FunParticipant {
    $participant = FunParticipant::create(['room' => $room->id(), 'name' => $name, 'avatar' => $avatar, 'token' => $token]);
    $participant->save();
    return $participant;
  }

  private function vote(string $who, int $slide, int $value, ?NodeInterface $room = NULL): void {
    FunVote::create([
      'room' => ($room ?? $this->room)->id(),
      'participant' => $this->people[$who]->id(),
      'slide' => $slide,
      'value' => $value,
    ])->save();
  }

  private function comment(string $who, int $slide, string $text, string $slide_title = ''): void {
    FunComment::create([
      'room' => $this->room->id(),
      'participant' => $this->people[$who]->id(),
      'slide' => $slide,
      'slide_title' => $slide_title,
      'body' => $text,
    ])->save();
  }

  private function ask(string $who, string $kind, string $status = FunRequest::OPEN): void {
    FunRequest::create([
      'room' => $this->room->id(),
      'participant' => $this->people[$who]->id(),
      'kind' => $kind,
      'status' => $status,
      'slide' => 0,
    ])->save();
  }

  private function close(): void {
    $this->room->set('field_status', 'closed')->save();
  }

  /**
   * Reports a slide the way the deck does.
   */
  private function reportSlide(int $index, string $id, string $title, ?string $code = NULL): ResponseInterface {
    return $this->getHttpClient()->request('POST', $this->buildUrl('/api/fun/rooms/' . ($code ?? 'NED-4261') . '/slide'), [
      RequestOptions::HEADERS => ['Content-Type' => 'application/json', 'X-Presenter-Key' => self::KEY],
      RequestOptions::BODY => json_encode(['index' => $index, 'id' => $id, 'title' => $title]),
      RequestOptions::HTTP_ERRORS => FALSE,
    ]);
  }

  private function get(string $code = 'NED-4261'): ResponseInterface {
    \Drupal::service('cache.default')->deleteAll();
    return $this->getHttpClient()->request('GET', $this->buildUrl('/api/fun/rooms/' . $code . '/recap'), [
      RequestOptions::HEADERS => ['Accept' => 'application/json'],
      RequestOptions::HTTP_ERRORS => FALSE,
    ]);
  }

  /**
   * @return array<string, mixed>
   *   The recap.
   */
  private function recap(string $code = 'NED-4261'): array {
    $response = $this->get($code);
    $this->assertSame(200, $response->getStatusCode());
    return json_decode((string) $response->getBody(), TRUE, 512, JSON_THROW_ON_ERROR);
  }

  public function testUnknownRoom(): void {
    $response = $this->get('NOPE-0000');
    $this->assertSame(404, $response->getStatusCode());
    $this->assertSame('room_not_found', json_decode((string) $response->getBody(), TRUE)['error']);
    $this->assertStringContainsString('no-store', $response->getHeaderLine('Cache-Control'));
  }

  public function testRoomWithNothingInIt(): void {
    $this->createRoom('EMPTY-1');
    $recap = $this->recap('EMPTY-1');
    $this->assertSame('EMPTY-1', $recap['code']);
    $this->assertSame('Thanks for joining', $recap['headline']);
    $this->assertSame(0, $recap['attendees']);
    $this->assertSame(0, $recap['voters']);
    $this->assertNull($recap['averageFun']);
    $this->assertNull($recap['tier']);
    $this->assertNull($recap['peak']);
    $this->assertNull($recap['quietest']);
    $this->assertNull($recap['durationSeconds']);
    $this->assertSame([], $recap['timeline']);
    $this->assertSame([], $recap['topSlides']);
    $this->assertSame([], $recap['highlights']);
    $this->assertSame(['count' => 0, 'busiest' => NULL], $recap['comments']);
    $this->assertSame(['total' => 0, 'hat' => 0, 'noise' => 0, 'candy' => 0, 'delivered' => 0], $recap['requests']);
  }

  public function testSlideMediansRankingAndTheMinimum(): void {
    // Slide 0: 20, 30 -> 25. Slide 1: 90, 70, 80 -> 80. Slide 2: 60, 40 -> 50.
    // Slide 3 has one vote: charted, but not ranked (five people voted, so this is
    // not a small room).
    $this->vote('Alice', 0, 20);
    $this->vote('Bob', 0, 30);
    $this->vote('Alice', 1, 90);
    $this->vote('Bob', 1, 70);
    $this->vote('Cleo', 1, 80);
    $this->vote('Alice', 2, 60);
    $this->vote('Bob', 2, 40);
    $this->vote('Dev', 3, 100);
    $this->people['Eve'] = $this->participant($this->room, 'Eve', 'token-for-eve-0123456789abcdef', 3);
    $this->vote('Eve', 4, 10);

    $recap = $this->recap();
    $this->assertSame([0, 1, 2, 3, 4], array_column($recap['timeline'], 'slide'));
    $this->assertSame([25, 80, 50, 100, 10], array_column($recap['timeline'], 'median'));
    $this->assertSame([2, 3, 2, 1, 1], array_column($recap['timeline'], 'votes'));
    $this->assertSame([1, 2, 0], array_column($recap['topSlides'], 'slide'));
    $this->assertSame(['slide' => 1, 'title' => 'Slide 2', 'median' => 80, 'votes' => 3], $recap['peak']);
    $this->assertSame(0, $recap['quietest']['slide']);
    $this->assertSame(25, $recap['quietest']['median']);
    $this->assertSame(5, $recap['voters']);
    // The median of all nine votes: 10 20 30 40 60 70 80 90 100, so 60.
    $this->assertSame(60, $recap['averageFun']);
    $this->assertSame('mid', $recap['tier']);
    $this->assertSame('That was a warm one', $recap['headline']);
  }

  public function testSmallRoomsRankSlidesOnSingleVotes(): void {
    // Two people, most slides rated by only one of them: all of it counts.
    $this->vote('Alice', 0, 20);
    $this->vote('Alice', 1, 90);
    $this->vote('Alice', 2, 60);
    $this->vote('Bob', 2, 40);
    $recap = $this->recap();
    $this->assertSame([0, 1, 2], array_column($recap['timeline'], 'slide'));
    $this->assertSame([1, 2, 0], array_column($recap['topSlides'], 'slide'));
    $this->assertSame(1, $recap['peak']['slide']);
    $this->assertSame(0, $recap['quietest']['slide']);
  }

  public function testTopListIsCappedAndTiesGoToMoreVotes(): void {
    // Seven slides, all with two votes at the same value except the last.
    for ($slide = 0; $slide < 7; $slide++) {
      $this->vote('Alice', $slide, 50);
      $this->vote('Bob', $slide, 50);
    }
    // Slide 6 gets a third vote, so it wins the tie on 50 and then ties on median 50.
    $this->vote('Cleo', 6, 50);
    $recap = $this->recap();
    $this->assertCount(RoomRecap::TOP_SLIDES, $recap['topSlides']);
    $this->assertSame(6, $recap['topSlides'][0]['slide']);
    $this->assertSame([6, 0, 1, 2, 3], array_column($recap['topSlides'], 'slide'));
    $this->assertCount(7, $recap['timeline']);
    // Nothing is quieter than anything else: the earliest slide is reported.
    $this->assertSame(0, $recap['quietest']['slide']);
  }

  public function testOneRankedSlideHasNoQuietest(): void {
    $this->vote('Alice', 0, 30);
    $this->vote('Bob', 0, 31);
    $recap = $this->recap();
    $this->assertSame(0, $recap['peak']['slide']);
    $this->assertNull($recap['quietest']);
    $this->assertSame('low', $recap['tier']);
    $this->assertSame('That was a sleepy one', $recap['headline']);
  }

  public function testCountsForPeopleCommentsAndRequests(): void {
    $this->comment('Alice', 2, 'One');
    $this->comment('Bob', 2, 'Two');
    $this->comment('Cleo', 5, 'Three');
    $this->ask('Alice', 'candy', FunRequest::DELIVERED);
    $this->ask('Bob', 'candy');
    $this->ask('Cleo', 'hat');
    $this->ask('Dev', 'noise', FunRequest::CANCELLED);
    $this->ask('Dev', 'hat', FunRequest::CANCELLED);

    $recap = $this->recap();
    $this->assertSame(4, $recap['attendees']);
    $this->assertSame(3, $recap['comments']['count']);
    $this->assertSame(['slide' => 2, 'title' => 'Slide 3', 'count' => 2], $recap['comments']['busiest']);
    $this->assertSame(['total' => 3, 'hat' => 1, 'noise' => 0, 'candy' => 2, 'delivered' => 1], $recap['requests']);
  }

  public function testHighlightsAreDeterministic(): void {
    $this->comment('Alice', 4, 'First on the busy slide', 'Props are JSON');
    $this->comment('Bob', 9, 'A comment elsewhere');
    $this->comment('Cleo', 4, 'Second on the busy slide');
    $this->comment('Dev', 7, 'The last word');
    $this->ask('Alice', 'hat');
    $this->ask('Bob', 'noise');
    $this->ask('Cleo', 'noise');

    $cards = $this->recap()['highlights'];
    $this->assertSame(['Most active slide', 'Last word', 'Most asked for'], array_column($cards, 'tag'));
    $this->assertSame('comment', $cards[0]['type']);
    $this->assertSame('First on the busy slide', $cards[0]['text']);
    $this->assertSame('Alice', $cards[0]['name']);
    $this->assertSame(2, $cards[0]['avatar']);
    $this->assertSame(4, $cards[0]['slide']);
    $this->assertSame('Props are JSON', $cards[0]['title']);
    $this->assertSame('The last word', $cards[1]['text']);
    $this->assertSame('Dev', $cards[1]['name']);
    $this->assertSame('Slide 8', $cards[1]['title']);
    $this->assertSame(['type' => 'request', 'tag' => 'Most asked for', 'kind' => 'noise', 'count' => 2], $cards[2]);
  }

  public function testLastWordIsSkippedWhenItIsTheSameComment(): void {
    $this->comment('Alice', 1, 'Only comment');
    $cards = $this->recap()['highlights'];
    $this->assertSame(['Most active slide'], array_column($cards, 'tag'));
  }

  public function testTitlesComeFromTheSlideLogThenCommentsThenANumber(): void {
    $this->assertSame(200, $this->reportSlide(0, 'welcome', 'Welcome')->getStatusCode());
    $this->assertSame(200, $this->reportSlide(1, 'swarm', 'Live demo')->getStatusCode());
    $this->vote('Alice', 0, 40);
    $this->vote('Bob', 0, 42);
    $this->vote('Alice', 1, 90);
    $this->vote('Bob', 1, 92);
    // Slide 2 was never reported but a comment named it; slide 3 has nothing.
    $this->comment('Cleo', 2, 'Named by a comment', 'From a comment');
    $this->vote('Alice', 2, 60);
    $this->vote('Bob', 2, 62);
    $this->vote('Alice', 3, 70);
    $this->vote('Bob', 3, 72);

    $titles = array_column($this->recap()['timeline'], 'title', 'slide');
    $this->assertSame([0 => 'Welcome', 1 => 'Live demo', 2 => 'From a comment', 3 => 'Slide 4'], $titles);
  }

  public function testSlideLogIsWrittenOncePerChangeAndKeepsTheFirstTime(): void {
    $this->reportSlide(3, 'props', 'Props');
    $room = Node::load($this->room->id());
    $first = SlideLog::read($room)[3];
    $this->assertSame(['id' => 'props', 'title' => 'Props'], ['id' => $first['id'], 'title' => $first['title']]);
    $this->assertGreaterThan(0, $first['at']);

    // Same slide again changes nothing; a new title follows the deck but keeps the time.
    $this->reportSlide(3, 'props', 'Props');
    $this->reportSlide(3, 'props', 'Props, renamed');
    \Drupal::entityTypeManager()->getStorage('node')->resetCache();
    $entry = SlideLog::read(Node::load($this->room->id()))[3];
    $this->assertSame('Props, renamed', $entry['title']);
    $this->assertSame($first['at'], $entry['at']);
    $this->assertCount(1, SlideLog::read(Node::load($this->room->id())));
  }

  public function testSlideLogIsCappedAndSurvivesDamage(): void {
    $room = $this->createRoom('LOG-1');
    for ($i = 0; $i < SlideLog::MAX_ENTRIES + 5; $i++) {
      SlideLog::record($room, $i, '', 'S' . $i, 1000 + $i);
    }
    $this->assertCount(SlideLog::MAX_ENTRIES, SlideLog::read($room));
    // An already-logged slide can still be renamed once the cap is reached.
    $this->assertTrue(SlideLog::record($room, 0, '', 'Renamed', 5000));
    $this->assertSame('Renamed', SlideLog::read($room)[0]['title']);
    // A new slide beyond the cap is ignored.
    $this->assertFalse(SlideLog::record($room, 999, '', 'Too many', 5001));
    // Damaged JSON reads as an empty log.
    $room->set('field_slide_log', '{not json');
    $this->assertSame([], SlideLog::read($room));
  }

  public function testDurationRunsFromTheFirstSlideToTheLastActivity(): void {
    $this->reportSlide(0, 'welcome', 'Welcome');
    $room = Node::load($this->room->id());
    $start = SlideLog::read($room)[0]['at'];
    $this->vote('Alice', 0, 50);
    $this->comment('Bob', 0, 'Hi');
    // Make the last activity 45 minutes after the first slide.
    $database = \Drupal::database();
    $database->update('fun_comment')->fields(['created' => $start + 2700])->execute();
    $this->assertSame(2700, $this->recap()['durationSeconds']);
  }

  public function testOpenRoomsGetARecapToo(): void {
    $this->vote('Alice', 0, 50);
    $this->vote('Bob', 0, 52);
    $response = $this->get();
    $this->assertSame(200, $response->getStatusCode());
    $this->assertSame('open', json_decode((string) $response->getBody(), TRUE)['status']);
    $cache_control = $response->getHeaderLine('Cache-Control');
    $this->assertStringContainsString('public', $cache_control);
    $this->assertStringContainsString('max-age=' . RoomRecap::CACHE_OPEN_SECONDS, $cache_control);
  }

  public function testClosedRoomsAreCachedLonger(): void {
    $this->close();
    $response = $this->get();
    $this->assertSame('closed', json_decode((string) $response->getBody(), TRUE)['status']);
    $cache_control = $response->getHeaderLine('Cache-Control');
    $this->assertStringContainsString('public', $cache_control);
    $this->assertStringContainsString('max-age=' . RoomRecap::CACHE_CLOSED_SECONDS, $cache_control);
  }

  public function testRoomsAreSeparate(): void {
    $other = $this->createRoom('OTHER-1');
    $stranger = $this->participant($other, 'Stranger', 'token-for-stranger-0123456789abcd');
    $this->people['Stranger'] = $stranger;
    $this->vote('Stranger', 0, 99, $other);
    $this->vote('Stranger', 0, 99, $other);
    $this->vote('Alice', 0, 10);
    // Only this room's vote is charted; the stranger's 99s stay in their own room.
    $this->assertSame([10], array_column($this->recap()['timeline'], 'median'));
    $this->assertSame(4, $this->recap()['attendees']);
    $this->assertSame(1, $this->recap('OTHER-1')['attendees']);
  }

  public function testNothingIdentifying(): void {
    $this->vote('Alice', 0, 50);
    $this->vote('Bob', 0, 60);
    $this->comment('Alice', 0, 'Hello');
    $this->ask('Alice', 'hat');
    $body = (string) $this->get()->getBody();
    foreach ([
      'token-for-alice',
      (string) $this->people['Alice']->uuid(),
      (string) $this->room->uuid(),
      'token_hash',
      'participant',
    ] as $needle) {
      $this->assertStringNotContainsString($needle, $body);
    }
    $keys = array_keys(json_decode($body, TRUE));
    sort($keys);
    $this->assertSame(
      ['attendees', 'averageFun', 'code', 'comments', 'durationSeconds', 'headline', 'highlights', 'peak', 'quietest', 'requests', 'status', 'tier', 'timeline', 'topSlides', 'updated', 'voters'],
      $keys,
    );
  }

}
