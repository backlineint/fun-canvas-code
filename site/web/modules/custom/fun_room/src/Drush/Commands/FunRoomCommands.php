<?php

declare(strict_types=1);

namespace Drupal\fun_room\Drush\Commands;

use Consolidation\AnnotatedCommand\Attributes\Argument;
use Consolidation\AnnotatedCommand\Attributes\Command;
use Consolidation\AnnotatedCommand\Attributes\Usage;
use Drupal\fun_room\Entity\FunRoom;
use Drush\Commands\DrushCommands;

/**
 * Drush commands for managing rooms.
 *
 * Drush instantiates command classes before Drupal's container exists, so the
 * entity type manager is fetched when a command runs rather than injected.
 */
final class FunRoomCommands extends DrushCommands {

  /**
   * Creates an open room with the given code (or reopens it if it exists).
   */
  #[Command(name: 'fun-room:create')]
  #[Argument(name: 'code', description: 'The room code, for example NED-4261.')]
  #[Usage(name: 'fun-room:create NED-4261', description: 'Create room NED-4261.')]
  public function create(string $code): void {
    $room = $this->load($code)
      ?? \Drupal::entityTypeManager()->getStorage('fun_room')->create(['code' => $code]);
    $room->set('status', 'open')->save();
    $this->logger()->success(dt('Room @code is open.', ['@code' => $room->get('code')->value]));
  }

  /**
   * Closes a room so nobody else can join it.
   */
  #[Command(name: 'fun-room:close')]
  #[Argument(name: 'code', description: 'The room code.')]
  public function close(string $code): void {
    $room = $this->load($code);
    if ($room === NULL) {
      throw new \InvalidArgumentException(dt('No room with code @code.', ['@code' => $code]));
    }
    $room->set('status', 'closed')->save();
    $this->logger()->success(dt('Room @code is closed.', ['@code' => $room->get('code')->value]));
  }

  private function load(string $code): ?FunRoom {
    $rooms = \Drupal::entityTypeManager()->getStorage('fun_room')
      ->loadByProperties(['code' => strtoupper(trim($code))]);
    $room = reset($rooms);
    return $room instanceof FunRoom ? $room : NULL;
  }

}
