<?php

declare(strict_types=1);

namespace Drupal\Tests\fun_room\Functional;

use Drupal\fun_room\Entity\FunParticipant;
use Drupal\fun_room\Entity\FunRoom;
use Drupal\fun_room\EventSubscriber\JoinFloodSubscriber;
use Drupal\Tests\BrowserTestBase;
use GuzzleHttp\RequestOptions;
use PHPUnit\Framework\Attributes\DataProvider;
use PHPUnit\Framework\Attributes\Group;
use Psr\Http\Message\ResponseInterface;

/**
 * Exercises the anonymous join flow through the JSON:API endpoints.
 */
#[Group('fun_room')]
final class JoinFlowTest extends BrowserTestBase {

  private const SECRET = '0123456789abcdef0123456789abcdef';

  /**
   * {@inheritdoc}
   */
  protected static $modules = ['fun_room', 'jsonapi'];

  /**
   * {@inheritdoc}
   */
  protected $defaultTheme = 'stark';

  private FunRoom $room;

  /**
   * {@inheritdoc}
   */
  protected function setUp(): void {
    parent::setUp();
    $this->room = FunRoom::create(['code' => 'ned-4261']);
    $this->room->save();
  }

  /**
   * Sends a JSON:API request as an anonymous client.
   *
   * @param array<string, mixed> $options
   *   Guzzle options.
   */
  private function request(string $method, string $path, array $options = []): ResponseInterface {
    $options += [
      RequestOptions::HEADERS => [
        'Accept' => 'application/vnd.api+json',
        'Content-Type' => 'application/vnd.api+json',
      ],
      RequestOptions::HTTP_ERRORS => FALSE,
    ];
    return $this->getHttpClient()->request($method, $this->buildUrl($path), $options);
  }

  /**
   * Builds a participant create body for the given room.
   *
   * @param array<string, mixed> $overrides
   *   Attribute overrides.
   *
   * @return array<string, mixed>
   *   Guzzle options with the JSON body.
   */
  private function joinBody(FunRoom $room, array $overrides = []): array {
    return [
      RequestOptions::BODY => json_encode([
        'data' => [
          'type' => 'fun_participant--fun_participant',
          'attributes' => $overrides + [
            'name' => 'Sam',
            'avatar' => 2,
            'token' => self::SECRET,
          ],
          'relationships' => [
            'room' => ['data' => ['type' => 'fun_room--fun_room', 'id' => $room->uuid()]],
          ],
        ],
      ], JSON_THROW_ON_ERROR),
    ];
  }

  /**
   * Rooms are found by code, with the stored uppercase form.
   */
  public function testRoomLookupByCode(): void {
    $response = $this->request('GET', '/jsonapi/fun_room/fun_room', [RequestOptions::QUERY => ['filter[code]' => 'NED-4261']]);
    $this->assertSame(200, $response->getStatusCode(), substr((string) $response->getBody(), 0, 500));
    $found = json_decode((string) $response->getBody(), TRUE, 512, JSON_THROW_ON_ERROR);
    $this->assertCount(1, $found['data']);
    $this->assertSame('open', $found['data'][0]['attributes']['status']);

    $response = $this->request('GET', '/jsonapi/fun_room/fun_room', [RequestOptions::QUERY => ['filter[code]' => 'NOPE']]);
    $this->assertSame(200, $response->getStatusCode(), substr((string) $response->getBody(), 0, 500));
    $missing = json_decode((string) $response->getBody(), TRUE, 512, JSON_THROW_ON_ERROR);
    $this->assertSame([], $missing['data']);
  }

  /**
   * A valid join creates a participant and never exposes the token.
   */
  public function testJoinCreatesParticipantWithHashedToken(): void {
    $response = $this->request('POST', '/jsonapi/fun_participant/fun_participant', $this->joinBody($this->room));
    $this->assertSame(201, $response->getStatusCode());

    $body = (string) $response->getBody();
    $this->assertStringNotContainsString(self::SECRET, $body);
    $this->assertStringNotContainsString('token', $body);

    $participants = \Drupal::entityTypeManager()->getStorage('fun_participant')->loadMultiple();
    $this->assertCount(1, $participants);
    $participant = reset($participants);
    $this->assertInstanceOf(FunParticipant::class, $participant);
    $this->assertSame(hash('sha256', self::SECRET), $participant->get('token_hash')->value);
    $this->assertEmpty($participant->get('token')->value);
    $this->assertSame('Sam', $participant->get('name')->value);
  }

  /**
   * Invalid names, avatars and tokens are rejected with a 422 and a pointer.
   *
   * @param array<string, mixed> $attributes
   *   Attribute overrides.
   */
  #[DataProvider('invalidAttributes')]
  public function testInvalidJoinIsRejected(array $attributes, string $pointer): void {
    $response = $this->request('POST', '/jsonapi/fun_participant/fun_participant', $this->joinBody($this->room, $attributes));
    $this->assertSame(422, $response->getStatusCode());
    $errors = json_decode((string) $response->getBody(), TRUE, 512, JSON_THROW_ON_ERROR)['errors'];
    $this->assertSame($pointer, $errors[0]['source']['pointer']);
    $this->assertCount(0, \Drupal::entityTypeManager()->getStorage('fun_participant')->loadMultiple());
  }

  /**
   * Data provider for testInvalidJoinIsRejected().
   *
   * @return array<string, array{0: array<string, mixed>, 1: string}>
   *   Attribute overrides and the expected error pointer.
   */
  public static function invalidAttributes(): array {
    return [
      'blank name' => [['name' => '   '], '/data/attributes/name/value'],
      'name too long' => [['name' => str_repeat('a', 31)], '/data/attributes/name/value'],
      'avatar out of range' => [['avatar' => 9], '/data/attributes/avatar/value'],
      'negative avatar' => [['avatar' => -1], '/data/attributes/avatar/value'],
      'token too short' => [['token' => 'short'], '/data/attributes/token/value'],
    ];
  }

  /**
   * Nobody can join a closed room.
   */
  public function testClosedRoomRejectsJoin(): void {
    $this->room->set('status', 'closed')->save();
    $response = $this->request('POST', '/jsonapi/fun_participant/fun_participant', $this->joinBody($this->room));
    $this->assertSame(422, $response->getStatusCode());
    $errors = json_decode((string) $response->getBody(), TRUE, 512, JSON_THROW_ON_ERROR)['errors'];
    $this->assertSame('/data/attributes/room', $errors[0]['source']['pointer']);
    $this->assertStringContainsString('closed', $errors[0]['detail']);
  }

  /**
   * Anonymous clients can not read, change or delete participants or rooms.
   */
  public function testAnonymousCannotReadOrModify(): void {
    $this->request('POST', '/jsonapi/fun_participant/fun_participant', $this->joinBody($this->room));
    $participant = array_values(\Drupal::entityTypeManager()->getStorage('fun_participant')->loadMultiple())[0];
    $path = '/jsonapi/fun_participant/fun_participant/' . $participant->uuid();

    $this->assertSame(403, $this->request('GET', $path)->getStatusCode());
    $this->assertSame(403, $this->request('DELETE', $path)->getStatusCode());
    $patch = $this->request('PATCH', $path, [
      RequestOptions::BODY => json_encode(['data' => [
        'type' => 'fun_participant--fun_participant',
        'id' => $participant->uuid(),
        'attributes' => ['name' => 'Hacked'],
      ]], JSON_THROW_ON_ERROR),
    ]);
    $this->assertSame(403, $patch->getStatusCode());
    $this->assertSame(403, $this->request('POST', '/jsonapi/fun_room/fun_room', [
      RequestOptions::BODY => json_encode(['data' => [
        'type' => 'fun_room--fun_room',
        'attributes' => ['code' => 'EVIL-1'],
      ]], JSON_THROW_ON_ERROR),
    ])->getStatusCode());

    $list = json_decode((string) $this->request('GET', '/jsonapi/fun_participant/fun_participant')->getBody(), TRUE, 512, JSON_THROW_ON_ERROR);
    $this->assertSame([], $list['data']);
    \Drupal::entityTypeManager()->getStorage('fun_participant')->resetCache();
    $this->assertSame('Sam', \Drupal::entityTypeManager()->getStorage('fun_participant')->load($participant->id())->get('name')->value);
  }

  /**
   * Joining too often from one IP is rate-limited.
   */
  public function testJoinIsRateLimited(): void {
    for ($i = 0; $i < JoinFloodSubscriber::LIMIT; $i++) {
      $this->request('POST', '/jsonapi/fun_participant/fun_participant', $this->joinBody($this->room));
    }
    $response = $this->request('POST', '/jsonapi/fun_participant/fun_participant', $this->joinBody($this->room));
    $this->assertSame(429, $response->getStatusCode());
  }

}
