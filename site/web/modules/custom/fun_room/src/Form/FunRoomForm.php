<?php

declare(strict_types=1);

namespace Drupal\fun_room\Form;

use Drupal\Core\Entity\ContentEntityForm;
use Drupal\Core\Form\FormStateInterface;

/**
 * Add and edit form for rooms.
 */
final class FunRoomForm extends ContentEntityForm {

  /**
   * {@inheritdoc}
   */
  public function save(array $form, FormStateInterface $form_state): int {
    $result = parent::save($form, $form_state);

    $this->messenger()->addStatus($this->t('Saved room @code (@status).', [
      '@code' => $this->entity->get('code')->value,
      '@status' => $this->entity->get('status')->value,
    ]));
    // Rooms have no page of their own, so go back to the list.
    $form_state->setRedirect('entity.fun_room.collection');

    return $result;
  }

}
