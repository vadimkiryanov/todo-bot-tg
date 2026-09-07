<script lang="ts">
  // Загрузочное состояние списка/превью: акцентный круглый спиннер по центру
  // (вместо «качающегося» эмодзи ⏳). Контейнер повторяет EmptyState, чтобы
  // подстановка в те же места разметки не двигала вёрстку.
  let { label }: { label?: string } = $props();
</script>

<div
  class="flex flex-col items-center justify-center gap-3 px-6 py-16"
  role="status"
  aria-label="Загрузка"
>
  <span class="loader" aria-hidden="true"></span>
  {#if label}
    <p class="text-sm text-muted">{label}</p>
  {/if}
</div>
