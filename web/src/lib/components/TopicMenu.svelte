<script lang="ts">
  // Меню топика (шторка): пункты «Создать топик», «Переименовать», «Удалить».
  // Открывается долгим нажатием по табу топика — в островке и в сетке шторки
  // топиков. Общее для всех мест (состояние открытого топика — в сторе topicMenu).
  import ConfirmModal from './ConfirmModal.svelte';
  import Modal from './Modal.svelte';
  import { closeTopicMenu, topicMenu } from '../stores/topic-menu.svelte';
  import { deleteTopic, renameTopic } from '../stores/topics.svelte';
  import { ui } from '../stores/ui.svelte';

  let renameMode = $state(false);
  let renameName = $state('');

  let showDelete = $state(false);
  let deleteError = $state('');
  let renameError = $state('');
  let busy = $state(false);

  function openRename(): void {
    if (topicMenu.topic === null) return;
    renameMode = true;
    renameName = topicMenu.topic.name;
    renameError = '';
  }

  function close(): void {
    closeTopicMenu();
    renameMode = false;
    renameError = '';
    deleteError = '';
  }

  async function submitRename(): Promise<void> {
    const topic = topicMenu.topic;
    if (topic === null) return;
    const name = renameName.trim();
    if (name === '') {
      renameError = 'введите название';
      return;
    }
    busy = true;
    renameError = '';
    try {
      await renameTopic(topic.id, name);
      close();
    } catch (e) {
      renameError = e instanceof Error ? e.message : 'ошибка';
    } finally {
      busy = false;
    }
  }

  async function doDelete(): Promise<void> {
    const topic = topicMenu.topic;
    if (topic === null) return;
    busy = true;
    deleteError = '';
    try {
      await deleteTopic(topic.id);
      showDelete = false;
      close();
    } catch (e) {
      deleteError = e instanceof Error ? e.message : 'ошибка';
    } finally {
      busy = false;
    }
  }
</script>

{#if topicMenu.topic !== null}
  <Modal open onClose={close}>
    {#if renameMode}
      <form
        class="flex flex-col gap-3"
        onsubmit={(e) => {
          e.preventDefault();
          submitRename();
        }}
      >
        <h2 class="text-lg font-semibold">Переименовать</h2>
        <!-- svelte-ignore a11y_autofocus -->
        <input
          type="text"
          bind:value={renameName}
          maxlength="64"
          class="h-11 rounded-xl border border-border bg-background px-4 text-base outline-none focus:border-accent"
          autofocus
        />
        {#if renameError}
          <p class="text-sm text-danger">{renameError}</p>
        {/if}
        <div class="flex gap-2">
          <button
            type="button"
            class="h-11 flex-1 rounded-xl border border-border text-sm"
            onclick={() => {
              renameMode = false;
              renameError = '';
            }}
          >
            Назад
          </button>
          <button
            type="submit"
            class="h-11 flex-1 rounded-xl bg-accent-strong text-sm font-medium text-white disabled:opacity-50"
            disabled={busy}
          >
            Сохранить
          </button>
        </div>
      </form>
    {:else}
      <div class="sheet-menu flex flex-col gap-1">
        <h2 class="px-2 pb-2 pt-1 text-lg font-semibold">{topicMenu.topic.name}</h2>
        <button
          type="button"
          class="flex h-12 items-center gap-3 rounded-xl px-2 text-base"
          onclick={() => {
            close();
            ui.topicCreateOpen = true;
          }}
        >
          <span>📚</span> Создать топик
        </button>
        <button
          type="button"
          class="flex h-12 items-center gap-3 rounded-xl px-2 text-base"
          onclick={openRename}
        >
          <span>✏️</span> Переименовать
        </button>
        <button
          type="button"
          class="flex h-12 items-center gap-3 rounded-xl px-2 text-base text-danger"
          onclick={() => {
            deleteError = '';
            showDelete = true;
          }}
        >
          <span>🗑</span> Удалить
        </button>
        <button type="button" class="mt-2 h-11 rounded-xl border border-border text-sm" onclick={close}>
          Отмена
        </button>
      </div>
    {/if}
  </Modal>
{/if}

{#if showDelete && topicMenu.topic !== null}
  <ConfirmModal
    title="Удалить топик?"
    text="Вместе с топиком удалятся все заметки и папки"
    {busy}
    error={deleteError}
    onClose={() => {
      showDelete = false;
      deleteError = '';
    }}
    onConfirm={doDelete}
  />
{/if}
