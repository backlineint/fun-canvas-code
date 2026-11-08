<?php

declare(strict_types=1);

namespace Drupal\fun_room;

use Drupal\Core\Datetime\DateFormatterInterface;
use Drupal\Core\Entity\EntityInterface;
use Drupal\Core\Entity\EntityListBuilder;
use Drupal\Core\Entity\EntityStorageInterface;
use Drupal\Core\Entity\EntityTypeInterface;
use Symfony\Component\DependencyInjection\ContainerInterface;

/**
 * Lists rooms with their status, slide and participant count.
 */
final class FunRoomListBuilder extends EntityListBuilder {

  public function __construct(
    EntityTypeInterface $entity_type,
    EntityStorageInterface $storage,
    private readonly EntityStorageInterface $participants,
    private readonly DateFormatterInterface $dateFormatter,
  ) {
    parent::__construct($entity_type, $storage);
  }

  /**
   * {@inheritdoc}
   */
  public static function createInstance(ContainerInterface $container, EntityTypeInterface $entity_type): static {
    $manager = $container->get('entity_type.manager');
    return new static(
      $entity_type,
      $manager->getStorage($entity_type->id()),
      $manager->getStorage('fun_participant'),
      $container->get('date.formatter'),
    );
  }

  /**
   * {@inheritdoc}
   */
  public function buildHeader(): array {
    return [
      'code' => $this->t('Code'),
      'status' => $this->t('Status'),
      'slide' => $this->t('Current slide'),
      'participants' => $this->t('Participants'),
      'created' => $this->t('Created'),
    ] + parent::buildHeader();
  }

  /**
   * {@inheritdoc}
   */
  public function buildRow(EntityInterface $entity): array {
    $participants = $this->participants->getQuery()
      ->accessCheck(FALSE)
      ->condition('room', $entity->id())
      ->count()
      ->execute();

    // The deck reports a zero-based index; show it as a slide number.
    $slide = (int) $entity->get('current_slide')->value + 1;
    $slide_id = (string) $entity->get('current_slide_id')->value;

    return [
      'code' => $entity->get('code')->value,
      'status' => $entity->get('status')->value === 'closed' ? $this->t('Closed') : $this->t('Open'),
      'slide' => $slide_id !== '' ? $this->t('@number (@id)', ['@number' => $slide, '@id' => $slide_id]) : $slide,
      'participants' => $participants,
      'created' => $this->dateFormatter->format((int) $entity->get('created')->value, 'short'),
    ] + parent::buildRow($entity);
  }

}
