<?php

declare(strict_types=1);

namespace Drupal\Tests\fun_room\Functional;

use Drupal\fun_room\EventSubscriber\RoomPollCacheSubscriber;
use Drupal\node\Entity\Node;
use Drupal\node\NodeInterface;
use Drupal\Tests\BrowserTestBase;
use GuzzleHttp\RequestOptions;
use PHPUnit\Framework\Attributes\Group;
use Psr\Http\Message\ResponseInterface;

/**
 * The room page's status poll may be reused by a shared cache for a moment.
 */
#[Group('fun_room')]
final class RoomPollCacheTest extends BrowserTestBase {

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
    // Created before the first JSON:API request, which caches the resource types.
    $this->drupalCreateContentType(['type' => 'page']);
    \Drupal::service('router.builder')->rebuild();
    $this->room = Node::create([
      'type' => 'room',
      'title' => 'NED-4261',
      'status' => 1,
      'field_status' => 'open',
      'field_current_slide' => 0,
    ]);
    $this->room->save();
  }

  /**
   * @param array<string, string> $headers
   *   Extra request headers.
   */
  private function get(string $path, array $headers = []): ResponseInterface {
    // Drupal's page cache keeps the whole response, header included, per URL, so a
    // request made earlier in a test could answer this one.
    \Drupal::service('cache.page')->deleteAll();
    [$path, $query] = array_pad(explode('?', $path, 2), 2, '');
    return $this->getHttpClient()->request('GET', $this->buildUrl($path) . ($query !== '' ? '?' . $query : ''), [
      RequestOptions::HEADERS => $headers + ['Accept' => 'application/vnd.api+json'],
      RequestOptions::HTTP_ERRORS => FALSE,
    ]);
  }

  private function roomPath(): string {
    return '/jsonapi/node/room/' . $this->room->uuid();
  }

  public function testAnonymousStatusPollIsPublicForAShortTime(): void {
    $response = $this->get($this->roomPath());
    $this->assertSame(200, $response->getStatusCode());
    $cache_control = $response->getHeaderLine('Cache-Control');
    $this->assertStringContainsString('public', $cache_control);
    $this->assertStringContainsString('max-age=' . RoomPollCacheSubscriber::CACHE_SECONDS, $cache_control);
    $this->assertStringNotContainsString('no-cache', $cache_control);
    $this->assertStringNotContainsString('private', $cache_control);
    // The body is still the room.
    $body = json_decode((string) $response->getBody(), TRUE, 512, JSON_THROW_ON_ERROR);
    $this->assertSame('NED-4261', $body['data']['attributes']['title']);
    $this->assertSame('open', $body['data']['attributes']['field_status']);
  }

  public function testClosingShowsUpOnThePollItself(): void {
    $this->room->set('field_status', 'closed')->save();
    $body = json_decode((string) $this->get($this->roomPath())->getBody(), TRUE, 512, JSON_THROW_ON_ERROR);
    $this->assertSame('closed', $body['data']['attributes']['field_status']);
  }

  public function testLookupByCodeStaysUncached(): void {
    // Joining must see a room that has just closed, so the lookup is never reused.
    $response = $this->get('/jsonapi/node/room?filter%5Btitle%5D=NED-4261');
    $this->assertSame(200, $response->getStatusCode());
    $cache_control = $response->getHeaderLine('Cache-Control');
    $this->assertStringNotContainsString('public', $cache_control);
    $this->assertStringContainsString('no-cache', $cache_control);
  }

  public function testSessionCookieAndAuthorizationAreLeftAlone(): void {
    foreach ([['Cookie' => 'SESSabc123=1'], ['Cookie' => 'SSESSabc123=1'], ['Authorization' => 'Bearer nope']] as $headers) {
      $cache_control = $this->get($this->roomPath(), $headers)->getHeaderLine('Cache-Control');
      $this->assertStringNotContainsString('public', $cache_control, json_encode($headers));
    }
    // An unrelated cookie does not matter.
    $unrelated = $this->get($this->roomPath(), ['Cookie' => 'theme=dark']);
    $this->assertStringContainsString('public', $unrelated->getHeaderLine('Cache-Control'), json_encode($unrelated->getHeaders()));
  }

  public function testOtherNodesAndWritesAreNotTouched(): void {
    $page = $this->drupalCreateNode(['type' => 'page', 'title' => 'About']);
    $response = $this->get('/jsonapi/node/page/' . $page->uuid());
    $this->assertSame(200, $response->getStatusCode());
    $this->assertStringNotContainsString('public', $response->getHeaderLine('Cache-Control'));
  }

}
