<script lang="ts">
  // Модалка редактирования заметки: открывается из контекстного меню заметки
  // («✏️ Редактировать») на любом экране (чат/архив/выполненные).
  import Modal from './Modal.svelte';
  import NoteEditForm from './NoteEditForm.svelte';
  import type { Note } from '../types/api';

  let { note, onClose }: { note: Note; onClose: () => void } = $props();
</script>

<Modal open onClose={onClose}>
  <h2 class="mb-3 text-lg font-semibold">✏️ Редактировать</h2>
  <NoteEditForm {note} onCancel={onClose} onSaved={onClose} />
</Modal>
