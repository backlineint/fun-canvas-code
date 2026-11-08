<?php

declare(strict_types=1);

namespace Drupal\fun_room\Plugin\Validation\Constraint;

use Drupal\fun_room\Entity\FunParticipant;
use Symfony\Component\Validator\Constraint;
use Symfony\Component\Validator\ConstraintValidator;

/**
 * Validates that a new participant's room is open.
 */
final class FunRoomOpenConstraintValidator extends ConstraintValidator {

  /**
   * {@inheritdoc}
   */
  public function validate(mixed $entity, Constraint $constraint): void {
    if (!$entity instanceof FunParticipant || !$entity->isNew()) {
      return;
    }
    $room = $entity->get('room')->entity;
    if ($room !== NULL && $room->get('status')->value !== 'open') {
      assert($constraint instanceof FunRoomOpenConstraint);
      // Point at the room relationship so clients can tell this apart from a
      // bad name or avatar.
      $this->context->buildViolation($constraint->message)
        ->atPath('room')
        ->addViolation();
    }
  }

}
