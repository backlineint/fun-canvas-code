<?php

declare(strict_types=1);

namespace Drupal\fun_room\Entity;

use Drupal\Core\Entity\Attribute\ContentEntityType;
use Drupal\Core\Entity\ContentEntityBase;
use Drupal\Core\Entity\EntityChangedInterface;
use Drupal\Core\Entity\EntityChangedTrait;
use Drupal\Core\Entity\EntityTypeInterface;
use Drupal\Core\Field\BaseFieldDefinition;
use Drupal\Core\StringTranslation\TranslatableMarkup;
use Drupal\fun_room\FunVoteAccessControlHandler;
use Drupal\views\EntityViewsData;

/**
 * One attendee's fun level on one slide.
 *
 * A participant has at most one vote per slide: moving the slider again while a
 * slide is showing updates that row, and the next slide starts a new one. The
 * latest value is also kept on the participant for the swarm, so the swarm reads
 * one table; these rows are the history the end-of-session recap is built from.
 * Votes are only written by the vote endpoint, never through JSON:API.
 */
#[ContentEntityType(
  id: 'fun_vote',
  label: new TranslatableMarkup('Fun vote'),
  label_collection: new TranslatableMarkup('Fun votes'),
  label_singular: new TranslatableMarkup('fun vote'),
  label_plural: new TranslatableMarkup('fun votes'),
  entity_keys: [
    'id' => 'id',
    'uuid' => 'uuid',
  ],
  handlers: [
    'access' => FunVoteAccessControlHandler::class,
    'views_data' => EntityViewsData::class,
  ],
  base_table: 'fun_vote',
  admin_permission: 'administer fun_room',
)]
class FunVote extends ContentEntityBase implements EntityChangedInterface {

  use EntityChangedTrait;

  /**
   * Highest fun value (the slider runs from 0 to this).
   */
  public const MAX_VALUE = 100;

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

    $fields['value'] = BaseFieldDefinition::create('integer')
      ->setLabel(new TranslatableMarkup('Fun (0-100)'))
      ->setRequired(TRUE)
      ->addPropertyConstraints('value', [
        'Range' => ['min' => 0, 'max' => self::MAX_VALUE],
      ]);

    $fields['created'] = BaseFieldDefinition::create('created')
      ->setLabel(new TranslatableMarkup('Created'));

    $fields['changed'] = BaseFieldDefinition::create('changed')
      ->setLabel(new TranslatableMarkup('Changed'));

    return $fields;
  }

}
