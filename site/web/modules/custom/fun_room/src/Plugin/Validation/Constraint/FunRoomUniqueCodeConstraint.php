<?php

declare(strict_types=1);

namespace Drupal\fun_room\Plugin\Validation\Constraint;

use Drupal\Core\StringTranslation\TranslatableMarkup;
use Drupal\Core\Validation\Attribute\Constraint;
use Symfony\Component\Validator\Constraint as SymfonyConstraint;

/**
 * A room's code (its node title) must be unique among rooms.
 */
#[Constraint(
  id: 'FunRoomUniqueCode',
  label: new TranslatableMarkup('Unique room code', [], ['context' => 'Validation']),
)]
final class FunRoomUniqueCodeConstraint extends SymfonyConstraint {

  public string $message = 'A room with the code %code already exists.';

}
