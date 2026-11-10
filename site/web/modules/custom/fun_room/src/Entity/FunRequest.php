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
use Drupal\fun_room\FunRequestAccessControlHandler;
use Drupal\views\EntityViewsData;

/**
 * An attendee's request for a party hat, a noise maker or candy.
 *
 * A request is open until a volunteer marks it delivered (or the attendee cancels it).
 * It records the slide showing when it was made. Requests are only written by the
 * requests endpoints, never through JSON:API. There is no moderation UI: an admin can
 * remove one with `drush entity:delete fun_request <id>`.
 */
#[ContentEntityType(
  id: 'fun_request',
  label: new TranslatableMarkup('Fun request'),
  label_collection: new TranslatableMarkup('Fun requests'),
  label_singular: new TranslatableMarkup('fun request'),
  label_plural: new TranslatableMarkup('fun requests'),
  entity_keys: [
    'id' => 'id',
    'uuid' => 'uuid',
  ],
  handlers: [
    'access' => FunRequestAccessControlHandler::class,
    'views_data' => EntityViewsData::class,
  ],
  base_table: 'fun_request',
  admin_permission: 'administer fun_room',
)]
class FunRequest extends ContentEntityBase implements EntityChangedInterface {

  use EntityChangedTrait;

  /**
   * What can be asked for. The clients (separate projects) hold the labels.
   */
  public const KINDS = ['hat', 'noise', 'candy'];

  public const OPEN = 'open';

  public const DELIVERED = 'delivered';

  public const CANCELLED = 'cancelled';

  /**
   * Longest note, in characters.
   */
  public const MAX_NOTE = 40;

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

    $fields['kind'] = BaseFieldDefinition::create('list_string')
      ->setLabel(new TranslatableMarkup('Kind'))
      ->setRequired(TRUE)
      ->setSetting('allowed_values', [
        'hat' => 'Party hat',
        'noise' => 'Noise maker',
        'candy' => 'Candy',
      ]);

    $fields['note'] = BaseFieldDefinition::create('string')
      ->setLabel(new TranslatableMarkup('Note (where they are)'))
      ->setSetting('max_length', self::MAX_NOTE);

    $fields['slide'] = BaseFieldDefinition::create('integer')
      ->setLabel(new TranslatableMarkup('Slide (zero-based index)'))
      ->setRequired(TRUE)
      ->setDefaultValue(0);

    $fields['status'] = BaseFieldDefinition::create('list_string')
      ->setLabel(new TranslatableMarkup('Status'))
      ->setRequired(TRUE)
      ->setDefaultValue(self::OPEN)
      ->setSetting('allowed_values', [
        self::OPEN => 'Open',
        self::DELIVERED => 'Delivered',
        self::CANCELLED => 'Cancelled',
      ]);

    $fields['created'] = BaseFieldDefinition::create('created')
      ->setLabel(new TranslatableMarkup('Created'));

    $fields['changed'] = BaseFieldDefinition::create('changed')
      ->setLabel(new TranslatableMarkup('Changed'));

    return $fields;
  }

}
