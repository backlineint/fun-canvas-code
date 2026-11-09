<?php

declare(strict_types=1);

namespace Drupal\Tests\fun_room\Functional;

use Drupal\fun_room\Controller\PresenterController;
use Drupal\node\Entity\Node;
use Drupal\node\NodeInterface;
use Drupal\Tests\BrowserTestBase;
use GuzzleHttp\RequestOptions;
use PHPUnit\Framework\Attributes\DataProvider;
use PHPUnit\Framework\Attributes\Group;
use Psr\Http\Message\ResponseInterface;

/**
 * Exercises the presenter endpoint the slide deck uses to set a room's slide.
 */
#[Group('fun_room')]
final class PresenterSlideTest extends BrowserTestBase {

  private const KEY = 'test-presenter-key';

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
    $this->room = Node::create(['type' => 'room', 'title' => 'NED-4261', 'status' => 1, 'field_status' => 'open']);
    $this->room->save();
  }

  /**
   * Sets the presenter key the site uses (an empty string means "no key").
   *
   * The site under test runs in a separate process, so the setting is written to
   * its settings.php rather than set in this one.
   */
  private function useKey(string $key): void {
    $this->writeSettings([
      'settings' => ['fun_room_presenter_key' => (object) ['value' => $key, 'required' => TRUE]],
    ]);
  }

  /**
   * Posts a slide report as the deck does.
   *
   * @param array<string, mixed>|string $body
   *   The JSON body (an array is encoded, a string is sent as is).
   */
  private function report(array|string $body, ?string $key = self::KEY, string $code = 'NED-4261'): ResponseInterface {
    $headers = ['Content-Type' => 'application/json', 'Accept' => 'application/json'];
    if ($key !== NULL) {
      $headers['X-Presenter-Key'] = $key;
    }
    return $this->getHttpClient()->request('POST', $this->buildUrl('/api/fun/rooms/' . $code . '/slide'), [
      RequestOptions::HEADERS => $headers,
      RequestOptions::BODY => is_array($body) ? json_encode($body, JSON_THROW_ON_ERROR) : $body,
      RequestOptions::HTTP_ERRORS => FALSE,
    ]);
  }

  /**
   * Reads the room's slide back the way phones do, through JSON:API.
   *
   * @return array<string, mixed>
   *   The room's attributes.
   */
  private function readRoom(): array {
    $response = $this->getHttpClient()->request('GET', $this->buildUrl('/jsonapi/node/room'), [
      RequestOptions::QUERY => ['filter[title]' => 'NED-4261'],
      RequestOptions::HEADERS => ['Accept' => 'application/vnd.api+json'],
      RequestOptions::HTTP_ERRORS => FALSE,
    ]);
    return json_decode((string) $response->getBody(), TRUE, 512, JSON_THROW_ON_ERROR)['data'][0]['attributes'];
  }

  /**
   * A correct key sets the slide, and phones read it back.
   */
  public function testCorrectKeyUpdatesTheSlide(): void {
    $this->useKey(self::KEY);
    $response = $this->report(['index' => 4, 'id' => 'swarm', 'title' => 'Live demo: the Swarm']);
    $this->assertSame(200, $response->getStatusCode(), (string) $response->getBody());
    $this->assertSame(['code' => 'NED-4261', 'index' => 4, 'id' => 'swarm', 'title' => 'Live demo: the Swarm'], json_decode((string) $response->getBody(), TRUE, 512, JSON_THROW_ON_ERROR));
    $this->assertStringContainsString('no-store', $response->getHeaderLine('Cache-Control'));

    $attributes = $this->readRoom();
    $this->assertSame(4, $attributes['field_current_slide']);
    $this->assertSame('swarm', $attributes['field_current_slide_id']);
    $this->assertSame('Live demo: the Swarm', $attributes['field_current_slide_title']);

    // A later report replaces all of it, and the id and title are optional.
    $this->assertSame(200, $this->report(['index' => 0])->getStatusCode());
    $attributes = $this->readRoom();
    $this->assertSame(0, $attributes['field_current_slide']);
    $this->assertEmpty($attributes['field_current_slide_id']);
    $this->assertEmpty($attributes['field_current_slide_title']);
  }

  /**
   * A title that wraps over several lines is stored as one tidy line of text.
   */
  public function testTitleWhitespaceIsCollapsed(): void {
    $this->useKey(self::KEY);
    $response = $this->report(['index' => 2, 'title' => "  Ask Claude to\n   create a Drupal CMS site\t "]);
    $this->assertSame(200, $response->getStatusCode(), (string) $response->getBody());
    $this->assertSame('Ask Claude to create a Drupal CMS site', $this->readRoom()['field_current_slide_title']);
  }

  /**
   * Titles are stored as plain text and shown escaped, so markup is harmless.
   */
  public function testTitleIsStoredAsPlainText(): void {
    $this->useKey(self::KEY);
    $title = '<b>Bold</b> & "quoted"';
    $this->assertSame(200, $this->report(['index' => 1, 'title' => $title])->getStatusCode());
    $this->assertSame($title, $this->readRoom()['field_current_slide_title']);
  }

  /**
   * The room code is matched case-insensitively, and closed rooms still update.
   */
  public function testCodeIsCaseInsensitiveAndClosedRoomsUpdate(): void {
    $this->useKey(self::KEY);
    $this->room->set('field_status', 'closed')->save();
    $this->assertSame(200, $this->report(['index' => 7], self::KEY, 'ned-4261')->getStatusCode());
    $this->assertSame(7, $this->readRoom()['field_current_slide']);
  }

  /**
   * Without a configured key nobody may change a room, even sending an empty key.
   */
  public function testRefusesWhenNoKeyIsConfigured(): void {
    $this->useKey('');
    $this->assertSame(503, $this->report(['index' => 3], '')->getStatusCode());
    $this->assertSame(503, $this->report(['index' => 3], self::KEY)->getStatusCode());
    $this->assertSame(0, (int) $this->readRoom()['field_current_slide']);
  }

  /**
   * A missing or wrong key is refused and changes nothing.
   */
  public function testWrongOrMissingKeyIsForbidden(): void {
    $this->useKey(self::KEY);
    $this->assertSame(403, $this->report(['index' => 3], NULL)->getStatusCode());
    $this->assertSame(403, $this->report(['index' => 3], 'nope')->getStatusCode());
    $this->assertSame(403, $this->report(['index' => 3], self::KEY . 'x')->getStatusCode());
    $this->assertSame(0, (int) $this->readRoom()['field_current_slide']);
  }

  /**
   * Repeated wrong keys from one IP are rate-limited, but the right key never is.
   */
  public function testWrongKeysAreRateLimited(): void {
    $this->useKey(self::KEY);
    for ($i = 0; $i < PresenterController::FLOOD_LIMIT; $i++) {
      $this->assertSame(403, $this->report(['index' => 3], 'nope')->getStatusCode());
    }
    $this->assertSame(429, $this->report(['index' => 3], 'nope')->getStatusCode());
    // The presenter, on the same IP, still gets through.
    $this->assertSame(200, $this->report(['index' => 3])->getStatusCode());
    $this->assertSame(3, (int) $this->readRoom()['field_current_slide']);
  }

  /**
   * Bad indexes and ids are rejected with a 422 and change nothing.
   *
   * @param array<string, mixed> $body
   *   The request body.
   */
  #[DataProvider('invalidBodies')]
  public function testInvalidBodyIsRejected(array $body, string $error): void {
    $this->useKey(self::KEY);
    $response = $this->report($body);
    $this->assertSame(422, $response->getStatusCode());
    $this->assertSame($error, json_decode((string) $response->getBody(), TRUE, 512, JSON_THROW_ON_ERROR)['error']);
    $this->assertSame(0, (int) $this->readRoom()['field_current_slide']);
  }

  /**
   * Data provider for testInvalidBodyIsRejected().
   *
   * @return array<string, array{0: array<string, mixed>, 1: string}>
   *   A request body and the expected error code.
   */
  public static function invalidBodies(): array {
    return [
      'missing index' => [['id' => 'swarm'], 'invalid_index'],
      'negative index' => [['index' => -1], 'invalid_index'],
      'index too large' => [['index' => 1000], 'invalid_index'],
      'index as a string' => [['index' => '4'], 'invalid_index'],
      'index as a float' => [['index' => 4.5], 'invalid_index'],
      'id with capitals' => [['index' => 1, 'id' => 'Swarm'], 'invalid_id'],
      'id with a space' => [['index' => 1, 'id' => 'a b'], 'invalid_id'],
      'id too long' => [['index' => 1, 'id' => str_repeat('a', 65)], 'invalid_id'],
      'id as a number' => [['index' => 1, 'id' => 5], 'invalid_id'],
      'title as a number' => [['index' => 1, 'title' => 5], 'invalid_title'],
      'title as a list' => [['index' => 1, 'title' => ['a']], 'invalid_title'],
      'title too long' => [['index' => 1, 'title' => str_repeat('a', 256)], 'invalid_title'],
      'title with a control character' => [['index' => 1, 'title' => "bad\x07title"], 'invalid_title'],
    ];
  }

  /**
   * A body that is not JSON is a 400, and an unknown room is a 404.
   */
  public function testMalformedBodyAndUnknownRoom(): void {
    $this->useKey(self::KEY);
    $this->assertSame(400, $this->report('not json')->getStatusCode());
    $this->assertSame(400, $this->report('"just a string"')->getStatusCode());
    $this->assertSame(404, $this->report(['index' => 1], self::KEY, 'NOPE-1')->getStatusCode());
  }

}
