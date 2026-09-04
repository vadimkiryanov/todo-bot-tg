<script lang="ts">
  // Настройки интерфейса (шторка из бургер-меню). Два пункта:
  // 1. 📁 формат показа папок на уровне списка: строки в общем списке
  //    (как в боте) или только кнопка 📁 (stores/settings.foldersMode).
  // 2. 🧭 где живёт «хлебный путь» в папках: внутри активного таба
  //    островка топиков или отдельной строкой под ним (pathMode).
  // Выбор применяется сразу и сохраняется в localStorage.
  import Modal from './Modal.svelte';
  import { setFoldersMode, setPathMode, settings } from '../stores/settings.svelte';
  import type { FoldersMode, PathMode } from '../stores/settings.svelte';

  let {
    open = $bindable(false),
    onClose,
  }: {
    open?: boolean;
    onClose?: () => void;
  } = $props();

  const modes: { value: FoldersMode; label: string; caption: string }[] = [
    {
      value: 'list',
      label: 'В списке заметок',
      caption: 'папки — строки среди заметок, кнопка 📁 скрыта',
    },
    {
      value: 'button',
      label: 'Отдельная кнопка',
      caption: 'папок в списке нет, вход — кнопка 📁',
    },
  ];

  const pathModes: { value: PathMode; label: string; caption: string }[] = [
    {
      value: 'tab',
      label: 'В табе топика',
      caption: 'путь расширяет активный таб островка; тап — папки',
    },
    {
      value: 'strip',
      label: 'Отдельной строкой',
      caption: 'строка «Папка › Подпапка» под островком (как раньше)',
    },
  ];
</script>

<Modal open={open} onClose={onClose}>
  <div class="flex flex-col gap-1 px-1 py-2">
    <h2 class="px-2 pb-2 pt-1 text-lg font-semibold">⚙️ Настройки</h2>
    <h3 class="px-2 pb-1 text-xs font-semibold uppercase tracking-wide text-muted">📁 Папки</h3>
    {#each modes as mode (mode.value)}
      <button
        type="button"
        aria-pressed={settings.foldersMode === mode.value}
        onclick={() => setFoldersMode(mode.value)}
        class="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left transition-colors {settings
          .foldersMode === mode.value
          ? 'bg-accent-strong text-white'
          : 'active:bg-border/50'}"
      >
        <span class="min-w-0 flex-1">
          <span class="block text-[15px] font-medium leading-5">{mode.label}</span>
          <span
            class="block text-xs leading-4 {settings.foldersMode === mode.value
              ? 'text-white/75'
              : 'text-muted'}"
          >
            {mode.caption}
          </span>
        </span>
        {#if settings.foldersMode === mode.value}
          <span class="shrink-0 text-sm">✓</span>
        {/if}
      </button>
    {/each}
    <h3 class="px-2 pb-1 pt-3 text-xs font-semibold uppercase tracking-wide text-muted">
      🧭 Путь к папке
    </h3>
    {#each pathModes as mode (mode.value)}
      <button
        type="button"
        aria-pressed={settings.pathMode === mode.value}
        onclick={() => setPathMode(mode.value)}
        class="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left transition-colors {settings
          .pathMode === mode.value
          ? 'bg-accent-strong text-white'
          : 'active:bg-border/50'}"
      >
        <span class="min-w-0 flex-1">
          <span class="block text-[15px] font-medium leading-5">{mode.label}</span>
          <span
            class="block text-xs leading-4 {settings.pathMode === mode.value
              ? 'text-white/75'
              : 'text-muted'}"
          >
            {mode.caption}
          </span>
        </span>
        {#if settings.pathMode === mode.value}
          <span class="shrink-0 text-sm">✓</span>
        {/if}
      </button>
    {/each}
  </div>
</Modal>
