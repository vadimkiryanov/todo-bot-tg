<script lang="ts">
  // Мини-спиннер для busy-кнопок: крутится и окрашивается в currentColor —
  // подходит и на белой кнопке с текстом, и на цветной с иконкой.
  let { size = '18px' }: { size?: string } = $props();
</script>

<span
  class="spinner shrink-0"
  style:width={size}
  style:height={size}
  style:border-width="max(2px, calc({size} / 9))"
  aria-hidden="true"
></span>
