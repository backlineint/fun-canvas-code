<?php

declare(strict_types=1);

namespace Drupal\Tests\fun_room\Functional;

use Drupal\fun_room\Entity\FunParticipant;
use Drupal\fun_room\RatingFeed;
use Drupal\node\Entity\Node;
use Drupal\node\NodeInterface;
use Drupal\Tests\BrowserTestBase;
use GuzzleHttp\RequestOptions;
use PHPUnit\Framework\Attributes\DataProvider;
use PHPUnit\Framework\Attributes\Group;
use Psr\Http\Message\ResponseInterface;

/**
 * Exercises the public ratings feed behind the deck's activity stream.
 */
#[Group('fun_room')]
final class RatingsTest extends BrowserTestBase {

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

  private FunParticipant $alice;

  /**
   * {@inheritdoc}
   */
  protected function setUp(): void {
    parent::setUp();
    user_role_grant_permissions('anonymous', ['access content']);
    $this->room = $this->createRoom('NED-4261');
    $this->alice = $this->participant($this->room, 'Alice', self::TOKEN, 2);
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

  /**
   * Stores a vote and backdates its change time, so it counts as settled.
   *
   * @return int
   *   The vote id.
   */
  private function vote(NodeInterface $room, FunParticipant $participant, int $slide, int $value, int $secondsAgo = 10): int {
    $vote = \Drupal::entityTypeManager()->getStorage('fun_vote')->create([
      'participant' => $participant->id(),
      'room' => $room->id(),
      'slide' => $slide,
      'value' => $value,
    ]);
    $vote->save();
    $this->touch((int) $vote->id(), time() - $secondsAgo);
    return (int) $vote->id();
  }

  private function touch(int $id, int $changed): void {
    \Drupal::database()->update('fun_vote')->fields(['changed' => $changed])->condition('id', $id)->execute();
    \Drupal::entityTypeManager()->getStorage('fun_vote')->resetCache([$id]);
  }

  /**
   * @param array<string, string> $query
   *   Query parameters.
   *
   * @return list<array<string, mixed>>
   *   The ratings the feed returns.
   */
  private function feed(array $query = [], string $code = 'NED-4261'): array {
    \Drupal::service('cache.default')->deleteAll();
    $response = $this->request($query, $code);
    $this->assertSame(200, $response->getStatusCode());
    return json_decode((string) $response->getBody(), TRUE, 512, JSON_THROW_ON_ERROR)['ratings'];
  }

  /**
   * @param array<string, string> $query
   *   Query parameters.
   */
  private function request(array $query = [], string $code = 'NED-4261'): ResponseInterface {
    return $this->getHttpClient()->request('GET', $this->buildUrl('/api/fun/rooms/' . $code . '/ratings', ['query' => $query]), [RequestOptions::HTTP_ERRORS => FALSE]);
  }

  /**
   * A rating lists who, the slide, the value and its tier.
   */
  public function testRatingIsListed(): void {
    $id = $this->vote($this->room, $this->alice, 3, 72);
    $feed = $this->feed();
    $this->assertCount(1, $feed);
    $this->assertSame($id, $feed[0]['id']);
    $this->assertSame('Alice', $feed[0]['name']);
    $this->assertSame(2, $feed[0]['avatar']);
    $this->assertSame(3, $feed[0]['slide']);
    $this->assertSame(72, $feed[0]['value']);
    $this->assertSame('high', $feed[0]['tier']);
    $this->assertMatchesRegularExpression('/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\dZ$/', $feed[0]['at']);
    $this->assertGreaterThan(time() - 20, $feed[0]['changed']);
  }

  /**
   * The tier follows the swarm's thresholds.
   */
  #[DataProvider('tiers')]
  public function testTier(int $value, string $tier): void {
    $this->vote($this->room, $this->alice, 0, $value);
    $this->assertSame($tier, $this->feed()[0]['tier']);
  }

  /**
   * @return array<string, array{0: int, 1: string}>
   *   Values and their tiers.
   */
  public static function tiers(): array {
    return [
      '0' => [0, 'low'],
      '34' => [34, 'low'],
      '35' => [35, 'mid'],
      '64' => [64, 'mid'],
      '65' => [65, 'high'],
      '100' => [100, 'high'],
    ];
  }

  /**
   * A changed vote keeps its id with the new value and a newer change time.
   */
  public function testChangedVoteKeepsItsId(): void {
    $id = $this->vote($this->room, $this->alice, 1, 40, 30);
    $before = $this->feed()[0];
    $vote = \Drupal::entityTypeManager()->getStorage('fun_vote')->load($id);
    $vote->set('value', 90)->save();
    $this->touch($id, time() - 5);
    $after = $this->feed();
    $this->assertCount(1, $after);
    $this->assertSame($id, $after[0]['id']);
    $this->assertSame(90, $after[0]['value']);
    $this->assertSame('high', $after[0]['tier']);
    $this->assertGreaterThan($before['changed'], $after[0]['changed']);
  }

  /**
   * A vote changed in the last 3 seconds is held back until it settles.
   */
  public function testUnsettledVoteIsHeldBack(): void {
    $id = $this->vote($this->room, $this->alice, 0, 50, 1);
    $this->assertSame([], $this->feed());
    $this->touch($id, time() - RatingFeed::SETTLE_SECONDS - 1);
    $this->assertCount(1, $this->feed());
    // Exactly at the boundary counts as settled.
    $this->touch($id, time() - RatingFeed::SETTLE_SECONDS);
    $this->assertCount(1, $this->feed());
  }

  /**
   * One person on two slides is two entries.
   */
  public function testTwoSlidesAreTwoEntries(): void {
    $this->vote($this->room, $this->alice, 1, 30, 20);
    $this->vote($this->room, $this->alice, 2, 80, 10);
    $feed = $this->feed();
    $this->assertSame([1, 2], array_column($feed, 'slide'));
    $this->assertSame([30, 80], array_column($feed, 'value'));
  }

  /**
   * "since" is inclusive of that second and returns only newer changes.
   */
  public function testSinceIsInclusive(): void {
    $bob = $this->participant($this->room, 'Bob', 'token-for-bob-0123456789abcdef012');
    $a = $this->vote($this->room, $this->alice, 0, 10, 30);
    $b = $this->vote($this->room, $bob, 0, 20, 20);
    $c = $this->vote($this->room, $this->alice, 1, 30, 10);
    $changed = array_column($this->feed(), 'changed', 'id');
    $this->assertSame([$a, $b, $c], array_keys($changed));
    $this->assertSame([$b, $c], array_column($this->feed(['since' => (string) $changed[$b]]), 'id'));
    $this->assertSame([$c], array_column($this->feed(['since' => (string) ($changed[$b] + 1)]), 'id'));
    $this->assertSame([], $this->feed(['since' => (string) ($changed[$c] + 1)]));
  }

  /**
   * Without "since" the newest $limit come back, oldest first; the limit is capped.
   */
  public function testLimit(): void {
    for ($i = 0; $i < 60; $i++) {
      $p = $this->participant($this->room, "P$i", "token-$i-0123456789abcdef0123456789");
      $this->vote($this->room, $p, 0, $i, 100 - $i);
    }
    $this->assertCount(30, $this->feed());
    $this->assertSame(range(30, 59), array_column($this->feed(), 'value'));
    $this->assertSame([58, 59], array_column($this->feed(['limit' => '2']), 'value'));
    $this->assertCount(50, $this->feed(['limit' => '500']));
    $this->assertCount(1, $this->feed(['limit' => '0']));
    $this->assertCount(30, $this->feed(['since' => 'abc', 'limit' => 'xyz']));
  }

  /**
   * One room's feed holds only its own ratings.
   */
  public function testFeedIsPerRoom(): void {
    $other = $this->createRoom('DEMO-1');
    $bob = $this->participant($other, 'Bob', 'token-for-bob-0123456789abcdef012');
    $this->vote($this->room, $this->alice, 0, 11);
    $this->vote($other, $bob, 0, 22);
    $this->assertSame([11], array_column($this->feed(), 'value'));
    $this->assertSame([22], array_column($this->feed([], 'DEMO-1'), 'value'));
  }

  /**
   * An unknown room is a 404; a closed room's final ratings are still readable.
   */
  public function testUnknownAndClosedRooms(): void {
    $this->assertSame(404, $this->request([], 'NOPE-0000')->getStatusCode());
    $this->vote($this->room, $this->alice, 0, 61);
    $this->room->set('field_status', 'closed')->save();
    $this->assertSame([61], array_column($this->feed(), 'value'));
  }

  /**
   * The feed shows only the safe fields, and is public and cacheable for a second.
   */
  public function testNothingIdentifyingAndPublicHeaders(): void {
    $this->vote($this->room, $this->alice, 0, 50);
    \Drupal::service('cache.default')->deleteAll();
    $response = $this->request();
    $body = (string) $response->getBody();
    $this->assertStringNotContainsString(self::TOKEN, $body);
    $this->assertStringNotContainsString(hash('sha256', self::TOKEN), $body);
    $this->assertStringNotContainsString((string) $this->alice->uuid(), $body);
    $keys = array_keys(json_decode($body, TRUE)['ratings'][0]);
    sort($keys);
    $this->assertSame(['at', 'avatar', 'changed', 'id', 'name', 'slide', 'tier', 'value'], $keys);
    $cache_control = $response->getHeaderLine('Cache-Control');
    $this->assertStringContainsString('public', $cache_control);
    $this->assertStringContainsString('max-age=1', $cache_control);
  }

}
