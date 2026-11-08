<?php

declare(strict_types=1);

namespace Drupal\fun_room\Hook;

use Drupal\Core\Access\AccessResult;
use Drupal\Core\Access\AccessResultInterface;
use Drupal\Core\Field\FieldDefinitionInterface;
use Drupal\Core\Field\FieldItemListInterface;
use Drupal\Core\Hook\Attribute\Hook;
use Drupal\Core\Session\AccountInterface;
use Drupal\node\NodeInterface;

/**
 * Hooks for rooms (a node type) and participants.
 */
final class FunRoomHooks {

  /**
   * Implements hook_entity_type_alter().
   *
   * Adds the unique room code check to nodes; it only applies to rooms.
   *
   * @param \Drupal\Core\Entity\EntityTypeInterface[] $entity_types
   *   The entity types.
   */
  #[Hook('entity_type_alter')]
  public function entityTypeAlter(array &$entity_types): void {
    if (isset($entity_types['node'])) {
      $entity_types['node']->addConstraint('FunRoomUniqueCode');
    }
  }

  /**
   * Implements hook_ENTITY_TYPE_presave() for nodes.
   *
   * Room codes are stored trimmed and uppercase, like the codes attendees type.
   */
  #[Hook('node_presave')]
  public function nodePresave(NodeInterface $node): void {
    if ($node->bundle() === 'room') {
      $node->setTitle(strtoupper(trim((string) $node->label())));
    }
  }

  /**
   * Implements hook_entity_field_access().
   *
   * Hides participant token fields from API readers.
   */
  #[Hook('entity_field_access')]
  public function entityFieldAccess(string $operation, FieldDefinitionInterface $field_definition, AccountInterface $account, ?FieldItemListInterface $items = NULL): AccessResultInterface {
    if ($field_definition->getTargetEntityTypeId() !== 'fun_participant') {
      return AccessResult::neutral();
    }

    switch ($field_definition->getName()) {
      case 'token':
        // Write-only, and only while creating the participant.
        if ($operation === 'view') {
          return AccessResult::forbidden();
        }
        $is_new = $items === NULL || $items->getEntity()->isNew();
        return $is_new ? AccessResult::neutral() : AccessResult::forbidden();

      case 'token_hash':
        // Set by the server; only admins may read it.
        if ($operation === 'view') {
          return AccessResult::forbiddenIf(!$account->hasPermission('administer fun_room'))
            ->addCacheContexts(['user.permissions']);
        }
        return AccessResult::forbidden();
    }

    return AccessResult::neutral();
  }

}
