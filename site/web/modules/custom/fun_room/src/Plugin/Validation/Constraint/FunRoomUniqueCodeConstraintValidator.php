<?php

declare(strict_types=1);

namespace Drupal\fun_room\Plugin\Validation\Constraint;

use Drupal\Core\DependencyInjection\ContainerInjectionInterface;
use Drupal\Core\Entity\EntityTypeManagerInterface;
use Drupal\node\NodeInterface;
use Symfony\Component\DependencyInjection\ContainerInterface;
use Symfony\Component\Validator\Constraint;
use Symfony\Component\Validator\ConstraintValidator;

/**
 * Validates that no other room has the same code.
 */
final class FunRoomUniqueCodeConstraintValidator extends ConstraintValidator implements ContainerInjectionInterface {

  public function __construct(private readonly EntityTypeManagerInterface $entityTypeManager) {}

  /**
   * {@inheritdoc}
   */
  public static function create(ContainerInterface $container): static {
    return new static($container->get('entity_type.manager'));
  }

  /**
   * {@inheritdoc}
   */
  public function validate(mixed $entity, Constraint $constraint): void {
    if (!$entity instanceof NodeInterface || $entity->bundle() !== 'room') {
      return;
    }

    $code = strtoupper(trim((string) $entity->label()));
    $query = $this->entityTypeManager->getStorage('node')->getQuery()
      ->accessCheck(FALSE)
      ->condition('type', 'room')
      ->condition('title', $code);
    if (!$entity->isNew()) {
      $query->condition('nid', $entity->id(), '<>');
    }

    if ($query->count()->execute() > 0) {
      assert($constraint instanceof FunRoomUniqueCodeConstraint);
      $this->context->buildViolation($constraint->message, ['%code' => $code])
        ->atPath('title')
        ->addViolation();
    }
  }

}
