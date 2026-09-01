<script lang="ts">
  // Горизонтальные табы топиков: тап — выбор, «＋» — создание, долгий тап — меню (переименовать/удалить).
  import ConfirmModal from './ConfirmModal.svelte';
  import Modal from './Modal.svelte';
  import { navigation, setActiveTopic } from '../stores/navigation.svelte';
  import { createTopic, deleteTopic, renameTopic, topicsStore } from '../stores/topics.svelte';
  import type { Topic } from '../types/api';

  let showCreate = $state(false);
  let createName = $state('');
  let createError = $state('');

  // Автофокус в инпут при открытии формы создания топика
  // (autofocus-атрибут в Safari/повторном открытии не срабатывает).
  let createInput = $state<HTMLInputElement | undefined>();
  $effect(() => {
    if (showCreate) createInput?.focus();
  });

  let menuTopic: Topic | null = $state(null);
  let menuError = $state('');
  let renameMode = $state(false);
  let renameName = $state('');

  let showDelete = $state(false);
  let deleteError = $state('');

  let busy = $state(false);
  let longPressTimer: number | undefined;
  let longPressFired = false;

  const LONG_PRESS_MS = 500;

  function handlePointerDown(id: number): void {
    longPressFired = false;
    longPressTimer = window.setTimeout(() => {
      longPressFired = true;
      const topic = topicsStore.topics.find((t) => t.id === id);
      if (topic !== undefined) {
        renameMode = false;
        renameName = topic.name;
        menuError = '';
        menuTopic = topic;
      }
    }, LONG_PRESS_MS);
  }

  function cancelLongPress(): void {
    window.clearTimeout(longPressTimer);
  }

  function onTap(id: number): void {
    if (longPressFired) {
      longPressFired = false;
      return;
    }
    setActiveTopic(id);
  }

  async function submitCreate(): Promise<void> {
    const name = createName.trim();
    if (name === '') {
      createError = 'введите название';
      return;
    }
    busy = true;
    createError = '';
    try {
      await createTopic(name);
      showCreate = false;
      createName = '';
    } catch (e) {
      createError = e instanceof Error ? e.message : 'ошибка';
    } finally {
      busy = false;
    }
  }

  function closeMenu(): void {
    menuTopic = null;
  }

  async function submitRename(): Promise<void> {
    if (menuTopic === null) return;
    const name = renameName.trim();
    if (name === '') {
      menuError = 'введите название';
      return;
    }
    busy = true;
    menuError = '';
    try {
      await renameTopic(menuTopic.id, name);
      closeMenu();
    } catch (e) {
      menuError = e instanceof Error ? e.message : 'ошибка';
    } finally {
      busy = false;
    }
  }

  async function doDelete(): Promise<void> {
    if (menuTopic === null) return;
    busy = true;
    deleteError = '';
    try {
      await deleteTopic(menuTopic.id);
      showDelete = false;
      closeMenu();
    } catch (e) {
      deleteError = e instanceof Error ? e.message : 'ошибка';
    } finally {
      busy = false;
    }
  }
</script>

<div
  class="touch-strip no-scrollbar flex shrink-0 items-center gap-2 overflow-x-auto border-b border-border bg-surface px-3 py-2"
>
  {#each topicsStore.topics as topic (topic.id)}
    <button
      type="button"
      class="flex h-10 shrink-0 items-center gap-1.5 rounded-full px-4 text-sm transition-[background-color,transform] active:scale-[0.97] {topic.id === navigation.activeTopicID
        ? 'bg-accent-strong text-white'
        : 'bg-background text-content'}"
      class:active={topic.id === navigation.activeTopicID}
      onpointerdown={() => handlePointerDown(topic.id)}
      onpointerup={cancelLongPress}
      onpointercancel={cancelLongPress}
      onpointerleave={cancelLongPress}
      onclick={() => onTap(topic.id)}
    >
      <span class="max-w-40 truncate">{topic.name}</span>
      {#if topic.note_count > 0}
        <span class="text-xs opacity-60">{topic.note_count}</span>
      {/if}
    </button>
  {/each}
  <button
    type="button"
    aria-label="Создать топик"
    class="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-background text-lg text-muted transition-[background-color,transform] active:scale-90 active:bg-border"
    onclick={() => {
      createError = '';
      createName = '';
      showCreate = true;
    }}
  >
    ＋
  </button>
</div>

{#if showCreate}
  <Modal open onClose={() => (showCreate = false)}>
    <form
      class="flex flex-col gap-3"
      onsubmit={(e) => {
        e.preventDefault();
        submitCreate();
      }}
    >
      <h2 class="text-lg font-semibold">Новый топик</h2>
      <input
        type="text"
        bind:this={createInput}
        bind:value={createName}
        placeholder="Название"
        maxlength="64"
        class="h-11 rounded-xl border border-border bg-background px-4 text-base outline-none focus:border-accent"
      />
      {#if createError}
        <p class="text-sm text-danger">{createError}</p>
      {/if}
      <div class="flex gap-2">
        <button
          type="button"
          class="h-11 flex-1 rounded-xl border border-border text-sm"
          onclick={() => (showCreate = false)}
        >
          Отмена
        </button>
        <button
          type="submit"
          class="h-11 flex-1 rounded-xl bg-accent-strong text-sm font-medium text-white disabled:opacity-50"
          disabled={busy}
        >
          Создать
        </button>
      </div>
    </form>
  </Modal>
{/if}

{#if menuTopic !== null}
  <Modal open onClose={closeMenu}>
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
        {#if menuError}
          <p class="text-sm text-danger">{menuError}</p>
        {/if}
        <div class="flex gap-2">
          <button
            type="button"
            class="h-11 flex-1 rounded-xl border border-border text-sm"
            onclick={() => (renameMode = false)}
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
        <h2 class="px-2 pb-2 pt-1 text-lg font-semibold">{menuTopic.name}</h2>
        {#if menuError}
          <p class="px-2 pb-2 text-sm text-danger">{menuError}</p>
        {/if}
        <button
          type="button"
          class="flex h-12 items-center gap-3 rounded-xl px-2 text-base"
          onclick={() => (renameMode = true)}
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
        <button
          type="button"
          class="mt-2 h-11 rounded-xl border border-border text-sm"
          onclick={closeMenu}
        >
          Отмена
        </button>
      </div>
    {/if}
  </Modal>
{/if}

{#if showDelete && menuTopic !== null}
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

<style>
  .no-scrollbar {
    scrollbar-width: none;
  }
  .no-scrollbar::-webkit-scrollbar {
    display: none;
  }
  /* Мобильный скролл табов: touch-action сразу резервирует жест за
     горизонтальным паном, user-select + touch-callout отключают выделение
     текста и iOS-лупу (WebKit игнорирует user-select на родителе для
     текста внутри <button>, поэтому задаём и кнопкам). */
  .touch-strip,
  .touch-strip button {
    touch-action: pan-x;
    -webkit-touch-callout: none;
    -webkit-user-select: none;
    user-select: none;
  }
  /* Шторка меню топика: долгий тап, открывший меню, может продолжаться уже
     на контенте шторки — выделение текста там не нужно. */
  .sheet-menu,
  .sheet-menu button {
    -webkit-touch-callout: none;
    -webkit-user-select: none;
    user-select: none;
  }
</style>
