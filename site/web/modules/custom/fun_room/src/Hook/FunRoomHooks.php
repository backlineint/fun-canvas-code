<?php

declare(strict_types=1);

namespace Drupal\fun_room\Hook;

use Drupal\Core\Access\AccessResult;
use Drupal\Core\Access\AccessResultInterface;
use Drupal\Core\Entity\EntityTypeInterface;
use Drupal\Core\Field\FieldDefinitionInterface;
use Drupal\Core\Field\FieldItemListInterface;
use Drupal\Core\Hook\Attribute\Hook;
use Drupal\Core\Session\AccountInterface;

/**
 * Access rules for the JSON:API surface of rooms and participants.
 */
final class FunRoomHooks {

  /**
   * Implements hook_jsonapi_ENTITY_TYPE_filter_access() for rooms.
   *
   * JSON:API cannot check access after a filtered query runs, so without this
   * a filtered request (such as filter[code]=...) returns nothing for anyone
   * lacking admin access. Rooms are public. Participants declare nothing, so
   * filtering them stays admin-only.
   */
  #[Hook('jsonapi_fun_room_filter_access')]
  public function roomFilterAccess(EntityTypeInterface $entity_type, AccountInterface $account): array {
    return [
      JSONAPI_FILTER_AMONG_ALL => AccessResult::allowed(),
    ];
  }

  /**
   * Implements hook_entity_field_access().
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
