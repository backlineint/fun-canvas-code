<?php

declare(strict_types=1);

namespace Drupal\fun_room\Entity;

use Drupal\Core\Entity\Attribute\ContentEntityType;
use Drupal\Core\Entity\ContentEntityBase;
use Drupal\Core\Entity\ContentEntityDeleteForm;
use Drupal\Core\Entity\EntityChangedTrait;
use Drupal\Core\Entity\EntityStorageInterface;
use Drupal\Core\Entity\EntityTypeInterface;
use Drupal\Core\Entity\Routing\AdminHtmlRouteProvider;
use Drupal\Core\Field\BaseFieldDefinition;
use Drupal\Core\StringTranslation\TranslatableMarkup;
use Drupal\fun_room\Form\FunRoomForm;
use Drupal\fun_room\FunRoomAccessControlHandler;
use Drupal\fun_room\FunRoomListBuilder;
use Drupal\views\EntityViewsData;

/**
 * A room that attendees join with its code.
 */
#[ContentEntityType(
  id: 'fun_room',
  label: new TranslatableMarkup('Fun room'),
  label_collection: new TranslatableMarkup('Fun rooms'),
  label_singular: new TranslatableMarkup('fun room'),
  label_plural: new TranslatableMarkup('fun rooms'),
  entity_keys: [
    'id' => 'id',
    'uuid' => 'uuid',
    'label' => 'code',
  ],
  handlers: [
    'access' => FunRoomAccessControlHandler::class,
    'list_builder' => FunRoomListBuilder::class,
    'views_data' => EntityViewsData::class,
    'form' => [
      'default' => FunRoomForm::class,
      'delete' => ContentEntityDeleteForm::class,
    ],
    'route_provider' => [
      'html' => AdminHtmlRouteProvider::class,
    ],
  ],
  links: [
    'collection' => '/admin/content/fun-room/rooms',
    'add-form' => '/admin/content/fun-room/rooms/add',
    'edit-form' => '/admin/content/fun-room/rooms/{fun_room}/edit',
    'delete-form' => '/admin/content/fun-room/rooms/{fun_room}/delete',
  ],
  base_table: 'fun_room',
  admin_permission: 'administer fun_room',
)]
class FunRoom extends ContentEntityBase {

  use EntityChangedTrait;

  /**
   * {@inheritdoc}
   */
  public static function baseFieldDefinitions(EntityTypeInterface $entity_type): array {
    $fields = parent::baseFieldDefinitions($entity_type);

    $fields['code'] = BaseFieldDefinition::create('string')
      ->setLabel(new TranslatableMarkup('Room code'))
      ->setRequired(TRUE)
      ->setSetting('max_length', 16)
      ->addConstraint('UniqueField')
      ->setDisplayOptions('form', ['type' => 'string_textfield', 'weight' => 0]);

    $fields['status'] = BaseFieldDefinition::create('list_string')
      ->setLabel(new TranslatableMarkup('Status'))
      ->setRequired(TRUE)
      ->setDefaultValue('open')
      ->setSetting('allowed_values', ['open' => 'Open', 'closed' => 'Closed'])
      ->setDisplayOptions('form', ['type' => 'options_select', 'weight' => 1]);

    $fields['current_slide'] = BaseFieldDefinition::create('integer')
      ->setLabel(new TranslatableMarkup('Current slide (index)'))
      ->setDefaultValue(0)
      ->setDisplayOptions('form', ['type' => 'number', 'weight' => 2]);

    $fields['current_slide_id'] = BaseFieldDefinition::create('string')
      ->setLabel(new TranslatableMarkup('Current slide (id)'))
      ->setSetting('max_length', 64)
      ->setDisplayOptions('form', ['type' => 'string_textfield', 'weight' => 3]);

    $fields['created'] = BaseFieldDefinition::create('created')
      ->setLabel(new TranslatableMarkup('Created'));

    $fields['changed'] = BaseFieldDefinition::create('changed')
      ->setLabel(new TranslatableMarkup('Changed'));

    return $fields;
  }

  /**
   * {@inheritdoc}
   */
  public function preSave(EntityStorageInterface $storage): void {
    parent::preSave($storage);
    // Codes are matched case-insensitively by the client; store them uppercase.
    $this->set('code', strtoupper(trim((string) $this->get('code')->value)));
  }

}
