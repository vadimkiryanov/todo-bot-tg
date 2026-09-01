<script lang="ts">
  // Папки под табами топиков: дерево всех папок топика (вложенность —
  // отступ слева, клик — переход в папку, активная подсвечена).
  // Долгий тап по папке — меню (переименовать/удалить); создание папки —
  // долгое нажатие на заметке или пустом месте в чате (CreateFolderModal).
  import ConfirmModal from './ConfirmModal.svelte';
  import Modal from './Modal.svelte';
  import {
    deleteFolder,
    foldersStore,
    renameFolder,
    treeFolders,
  } from '../stores/folders.svelte';
  import { navigation, setActiveFolder } from '../stores/navigation.svelte';
  import type { Folder } from '../types/api';

  let menuFolder: Folder | null = $state(null);
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

  async function doDelete(): Promise<void> {
    if (menuFolder === null) return;
    busy = true;
    deleteError = '';
    try {
      await deleteFolder(menuFolder.id);
      showDelete = false;
      closeMenu();
    } catch (e) {
      deleteError = e instanceof Error ? e.message : 'ошибка';
    } finally {
      busy = false;
    }
  }

  const tree = $derived(treeFolders());
</script>

<div class="shrink-0 border-b border-border bg-surface px-3 py-2">
  {#if foldersStore.loading && foldersStore.topicId !== navigation.activeTopicID}
    <div class="h-10 animate-pulse rounded-full bg-border/40"></div>
  {:else}
    <!-- Дерево всех папок топика: вложенность — отступ слева, клик — переход -->
    <div class="tree no-scrollbar flex max-h-44 flex-col gap-1 overflow-y-auto">
        <button
          type="button"
          class="flex h-10 shrink-0 items-center gap-2 rounded-full px-3 text-sm transition-[background-color,transform] active:scale-[0.97] {navigation.activeFolderID ===
          null
            ? 'bg-accent-strong text-white'
            : 'bg-background text-muted'}"
          onclick={() => setActiveFolder(null)}
        >
          📂 Корень
        </button>
        {#each tree as node (node.folder.id)}
          <button
            type="button"
            class="flex h-10 min-w-0 shrink-0 items-center gap-1.5 rounded-full px-3 text-sm text-content transition-[background-color,transform] active:scale-[0.97] {node.folder.id ===
            navigation.activeFolderID
              ? 'bg-accent-strong text-white'
              : 'bg-background active:bg-border'}"
            style={node.depth > 0 ? `padding-left: ${12 + node.depth * 16}px` : undefined}
            onpointerdown={() => handlePointerDown(node.folder.id)}
            onpointerup={cancelLongPress}
            onpointercancel={cancelLongPress}
            onpointerleave={cancelLongPress}
            onclick={() => onTap(node.folder.id)}
          >
            <span class="shrink-0">📁</span>
            <span class="truncate">{node.folder.name}</span>
          </button>
        {/each}
    </div>
  {/if}
</div>

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

{#if showDelete && menuFolder !== null}
  <ConfirmModal
    title="Удалить папку?"
    text="Вместе с папкой удалятся все вложенные папки и заметки"
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
  /* Дерево папок (до 4 рядов видно, дальше вертикальный скролл внутри
     секции): долгий тап по папке открывает меню — выделение текста не
     нужно; touch-action не ограничиваем — вертикальный свайп скроллит
     секцию. WebKit игнорирует user-select на родителе для текста внутри
     <button>, поэтому задаём и кнопкам. */
  .tree,
  .tree button {
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
