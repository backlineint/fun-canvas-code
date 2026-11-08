<?php

declare(strict_types=1);

namespace Drupal\fun_room\Entity;

use Drupal\Core\Entity\Attribute\ContentEntityType;
use Drupal\Core\Entity\ContentEntityBase;
use Drupal\Core\Entity\ContentEntityDeleteForm;
use Drupal\Core\Entity\EntityStorageInterface;
use Drupal\Core\Entity\EntityTypeInterface;
use Drupal\Core\Entity\Routing\AdminHtmlRouteProvider;
use Drupal\Core\Field\BaseFieldDefinition;
use Drupal\Core\StringTranslation\TranslatableMarkup;
use Drupal\fun_room\FunParticipantAccessControlHandler;
use Drupal\fun_room\FunParticipantListBuilder;
use Drupal\views\EntityViewsData;

/**
 * Someone who joined a room. Created anonymously through JSON:API.
 */
#[ContentEntityType(
  id: 'fun_participant',
  label: new TranslatableMarkup('Fun participant'),
  label_collection: new TranslatableMarkup('Fun participants'),
  label_singular: new TranslatableMarkup('fun participant'),
  label_plural: new TranslatableMarkup('fun participants'),
  entity_keys: [
    'id' => 'id',
    'uuid' => 'uuid',
    'label' => 'name',
  ],
  handlers: [
    'access' => FunParticipantAccessControlHandler::class,
    'list_builder' => FunParticipantListBuilder::class,
    'views_data' => EntityViewsData::class,
    'form' => [
      'delete' => ContentEntityDeleteForm::class,
    ],
    'route_provider' => [
      'html' => AdminHtmlRouteProvider::class,
    ],
  ],
  links: [
    'collection' => '/admin/content/fun-room/participants',
    'delete-form' => '/admin/content/fun-room/participants/{fun_participant}/delete',
  ],
  base_table: 'fun_participant',
  admin_permission: 'administer fun_room',
  constraints: [
    'FunRoomOpen' => [],
  ],
)]
class FunParticipant extends ContentEntityBase {

  /**
   * Highest valid avatar index (the join UI offers six avatars, 0 to 5).
   */
  public const MAX_AVATAR = 5;

  /**
   * {@inheritdoc}
   */
  public static function baseFieldDefinitions(EntityTypeInterface $entity_type): array {
    $fields = parent::baseFieldDefinitions($entity_type);

    $fields['room'] = BaseFieldDefinition::create('entity_reference')
      ->setLabel(new TranslatableMarkup('Room'))
      ->setRequired(TRUE)
      ->setSetting('target_type', 'node')
      ->setSetting('handler', 'default:node')
      ->setSetting('handler_settings', ['target_bundles' => ['room' => 'room']]);

    $fields['name'] = BaseFieldDefinition::create('string')
      ->setLabel(new TranslatableMarkup('Name'))
      ->setRequired(TRUE)
      ->setSetting('max_length', 30)
      ->addPropertyConstraints('value', [
        'Length' => ['min' => 1, 'max' => 30],
        'Regex' => [
          'pattern' => '/\S/',
          'message' => 'The name cannot be blank.',
        ],
      ]);

    $fields['avatar'] = BaseFieldDefinition::create('integer')
      ->setLabel(new TranslatableMarkup('Avatar'))
      ->setRequired(TRUE)
      ->addPropertyConstraints('value', [
        'Range' => ['min' => 0, 'max' => self::MAX_AVATAR],
      ]);

    // The client generates a secret and sends it here on create. It is hashed
    // in preSave() and blanked, and is never readable (see FunRoomHooks).
    $fields['token'] = BaseFieldDefinition::create('string')
      ->setLabel(new TranslatableMarkup('Token (write-only)'))
      ->setSetting('max_length', 128)
      ->addPropertyConstraints('value', [
        'Length' => ['min' => 16, 'max' => 128],
      ]);

    $fields['token_hash'] = BaseFieldDefinition::create('string')
      ->setLabel(new TranslatableMarkup('Token hash'))
      ->setSetting('max_length', 64);

    // The attendee's current fun level, empty until they first move the slider.
    // Set only by the vote endpoint (see FunRoomHooks for the field access).
    $fields['fun'] = BaseFieldDefinition::create('integer')
      ->setLabel(new TranslatableMarkup('Fun (0-100)'))
      ->addPropertyConstraints('value', [
        'Range' => ['min' => 0, 'max' => FunVote::MAX_VALUE],
      ]);

    $fields['fun_at'] = BaseFieldDefinition::create('timestamp')
      ->setLabel(new TranslatableMarkup('Fun updated'));

    $fields['created'] = BaseFieldDefinition::create('created')
      ->setLabel(new TranslatableMarkup('Created'));

    return $fields;
  }

  /**
   * {@inheritdoc}
   */
  public function preSave(EntityStorageInterface $storage): void {
    parent::preSave($storage);
    $this->set('name', trim((string) $this->get('name')->value));

    $token = (string) $this->get('token')->value;
    if ($token !== '') {
      $this->set('token_hash', hash('sha256', $token));
      $this->set('token', '');
    }
  }

}
