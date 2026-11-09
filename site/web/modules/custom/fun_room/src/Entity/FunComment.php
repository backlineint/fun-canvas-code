<?php

declare(strict_types=1);

namespace Drupal\fun_room\Entity;

use Drupal\Core\Entity\Attribute\ContentEntityType;
use Drupal\Core\Entity\ContentEntityBase;
use Drupal\Core\Entity\EntityTypeInterface;
use Drupal\Core\Field\BaseFieldDefinition;
use Drupal\Core\StringTranslation\TranslatableMarkup;
use Drupal\fun_room\FunCommentAccessControlHandler;
use Drupal\views\EntityViewsData;

/**
 * A comment an attendee posted to a room.
 *
 * It records the slide the room was on (the index and a snapshot of its title, so
 * the stream still reads right if the deck changes). Comments are only written by
 * the comments endpoint, never through JSON:API. There is no moderation UI: an
 * admin removes one with `drush entity:delete fun_comment <id>`.
 */
#[ContentEntityType(
  id: 'fun_comment',
  label: new TranslatableMarkup('Fun comment'),
  label_collection: new TranslatableMarkup('Fun comments'),
  label_singular: new TranslatableMarkup('fun comment'),
  label_plural: new TranslatableMarkup('fun comments'),
  entity_keys: [
    'id' => 'id',
    'uuid' => 'uuid',
  ],
  handlers: [
    'access' => FunCommentAccessControlHandler::class,
    'views_data' => EntityViewsData::class,
  ],
  base_table: 'fun_comment',
  admin_permission: 'administer fun_room',
)]
class FunComment extends ContentEntityBase {

  /**
   * Longest comment, in characters.
   */
  public const MAX_LENGTH = 280;

  /**
   * {@inheritdoc}
   */
  public static function baseFieldDefinitions(EntityTypeInterface $entity_type): array {
    $fields = parent::baseFieldDefinitions($entity_type);

    $fields['participant'] = BaseFieldDefinition::create('entity_reference')
      ->setLabel(new TranslatableMarkup('Participant'))
      ->setRequired(TRUE)
      ->setSetting('target_type', 'fun_participant');

    $fields['room'] = BaseFieldDefinition::create('entity_reference')
      ->setLabel(new TranslatableMarkup('Room'))
      ->setRequired(TRUE)
      ->setSetting('target_type', 'node')
      ->setSetting('handler', 'default:node')
      ->setSetting('handler_settings', ['target_bundles' => ['room' => 'room']]);

    $fields['slide'] = BaseFieldDefinition::create('integer')
      ->setLabel(new TranslatableMarkup('Slide (zero-based index)'))
      ->setRequired(TRUE)
      ->setDefaultValue(0);

    $fields['slide_title'] = BaseFieldDefinition::create('string')
      ->setLabel(new TranslatableMarkup('Slide title when posted'))
      ->setSetting('max_length', 255);

    $fields['body'] = BaseFieldDefinition::create('string_long')
      ->setLabel(new TranslatableMarkup('Comment (plain text)'))
      ->setRequired(TRUE);

    $fields['created'] = BaseFieldDefinition::create('created')
      ->setLabel(new TranslatableMarkup('Created'));

    return $fields;
  }

}
