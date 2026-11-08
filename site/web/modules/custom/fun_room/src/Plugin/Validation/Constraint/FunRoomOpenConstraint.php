<?php

declare(strict_types=1);

namespace Drupal\fun_room\Plugin\Validation\Constraint;

use Drupal\Core\StringTranslation\TranslatableMarkup;
use Drupal\Core\Validation\Attribute\Constraint;
use Symfony\Component\Validator\Constraint as SymfonyConstraint;

/**
 * A participant can only join a room that is open.
 */
#[Constraint(
  id: 'FunRoomOpen',
  label: new TranslatableMarkup('Room is open', [], ['context' => 'Validation']),
)]
final class FunRoomOpenConstraint extends SymfonyConstraint {

  public string $message = 'That room has closed.';

}
