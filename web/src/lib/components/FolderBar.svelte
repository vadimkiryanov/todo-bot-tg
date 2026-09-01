<script lang="ts">
  // Папки под табами топиков: хлебные крошки (навигация вверх) + папки уровня (вход вниз).
  // «＋» — создать папку на текущем уровне; долгий тап по папке — меню (переименовать/удалить).
  import Modal from './Modal.svelte';
  import {
    createFolder,
    deleteFolder,
    folderChain,
    foldersStore,
    levelFolders,
    renameFolder,
  } from '../stores/folders.svelte';
  import { navigation, setActiveFolder } from '../stores/navigation.svelte';
  import type { Folder } from '../types/api';

  let showCreate = $state(false);
  let createName = $state('');
  let createError = $state('');

  let menuFolder: Folder | null = $state(null);
  let menuError = $state('');
  let renameMode = $state(false);
  let renameName = $state('');

  let busy = $state(false);
  let longPressTimer: number | undefined;
  let longPressFired = false;

  const LONG_PRESS_MS = 500;

  function handlePointerDown(id: number): void {
    longPressFired = false;
    longPressTimer = window.setTimeout(() => {
      longPressFired = true;
      const folder = foldersStore.all.find((f) => f.id === id);
      if (folder !== undefined) {
        renameMode = false;
        renameName = folder.name;
        menuError = '';
        menuFolder = folder;
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
    setActiveFolder(id);
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
      await createFolder(name);
      showCreate = false;
      createName = '';
    } catch (e) {
      createError = e instanceof Error ? e.message : 'ошибка';
    } finally {
      busy = false;
    }
  }

  function closeMenu(): void {
    menuFolder = null;
  }

  async function submitRename(): Promise<void> {
    if (menuFolder === null) return;
    const name = renameName.trim();
    if (name === '') {
      menuError = 'введите название';
      return;
    }
    busy = true;
    menuError = '';
    try {
      await renameFolder(menuFolder.id, name);
      closeMenu();
    } catch (e) {
      menuError = e instanceof Error ? e.message : 'ошибка';
    } finally {
      busy = false;
    }
  }

  async function confirmDelete(): Promise<void> {
    if (menuFolder === null) return;
    busy = true;
    menuError = '';
    try {
      await deleteFolder(menuFolder.id);
      closeMenu();
    } catch (e) {
      menuError = e instanceof Error ? e.message : 'ошибка';
    } finally {
      busy = false;
    }
  }

  const chain = $derived(folderChain());
  const children = $derived(levelFolders());
</script>

<div class="shrink-0 border-b border-border bg-surface px-3 py-2">
  {#if foldersStore.loading}
    <div class="h-10 animate-pulse rounded-full bg-border/40"></div>
  {:else}
    <!-- Хлебные крошки: корень → папка → подпапка -->
    <div class="touch-strip no-scrollbar flex items-center gap-1 overflow-x-auto">
      <button
        type="button"
        class="flex h-10 shrink-0 items-center rounded-full px-3 text-sm {navigation.activeFolderID ===
        null
          ? 'bg-accent-strong text-white'
          : 'bg-background text-muted'}"
        onclick={() => setActiveFolder(null)}
      >
        📂 Корень
      </button>
      {#each chain as folder (folder.id)}
        <span class="shrink-0 text-muted">›</span>
        <button
          type="button"
          class="max-w-40 truncate rounded-full px-3 py-2 text-sm {folder.id ===
          navigation.activeFolderID
            ? 'bg-accent-strong text-white'
            : 'bg-background text-content'}"
          onclick={() => setActiveFolder(folder.id)}
        >
          {folder.name}
        </button>
      {/each}
      <button
        type="button"
        aria-label="Создать папку"
        class="ml-auto flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-background text-lg text-muted transition-colors active:bg-border"
        onclick={() => {
          createError = '';
          createName = '';
          showCreate = true;
        }}
      >
        ＋
      </button>
    </div>

    <!-- Папки текущего уровня (вход в подпапки) -->
    {#if children.length > 0}
      <div class="touch-strip no-scrollbar mt-2 flex items-center gap-2 overflow-x-auto">
        {#each children as folder (folder.id)}
          <button
            type="button"
            class="flex h-10 shrink-0 items-center gap-1.5 rounded-full bg-background px-4 text-sm text-content transition-colors active:bg-border"
            onpointerdown={() => handlePointerDown(folder.id)}
            onpointerup={cancelLongPress}
            onpointercancel={cancelLongPress}
            onpointerleave={cancelLongPress}
            onclick={() => onTap(folder.id)}
          >
            <span>📁</span>
            <span class="max-w-40 truncate">{folder.name}</span>
          </button>
        {/each}
      </div>
    {/if}
  {/if}
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
      <h2 class="text-lg font-semibold">Новая папка</h2>
      <!-- svelte-ignore a11y_autofocus -->
      <input
        type="text"
        bind:value={createName}
        placeholder="Название"
        maxlength="64"
        class="h-11 rounded-xl border border-border bg-background px-4 text-sm outline-none focus:border-accent"
        autofocus
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

{#if menuFolder !== null}
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
          class="h-11 rounded-xl border border-border bg-background px-4 text-sm outline-none focus:border-accent"
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
        <h2 class="px-2 pb-2 pt-1 text-lg font-semibold">{menuFolder.name}</h2>
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
            menuError = '';
            confirmDelete();
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

<style>
  .no-scrollbar {
    scrollbar-width: none;
  }
  .no-scrollbar::-webkit-scrollbar {
    display: none;
  }
  /* Мобильный скролл крошек и чипов папок: touch-action сразу резервирует
     жест за горизонтальным паном (браузер не ждёт распознавания long-press),
     а user-select + touch-callout отключают выделение текста и iOS-лупу.
     user-select задаём и кнопкам напрямую: WebKit игнорирует его на
     родителе для текста внутри <button>. */
  .touch-strip,
  .touch-strip button {
    touch-action: pan-x;
    -webkit-touch-callout: none;
    -webkit-user-select: none;
    user-select: none;
  }
  /* Шторка меню папки: долгий тап, открывший меню, может продолжаться уже
     на контенте шторки — выделение текста там не нужно. */
  .sheet-menu,
  .sheet-menu button {
    -webkit-touch-callout: none;
    -webkit-user-select: none;
    user-select: none;
  }
</style>
