<script lang="ts">
  let { emoji = '📝', text }: { emoji?: string; text?: string } = $props();
</script>

<div class="flex flex-col items-center justify-center gap-3 px-6 py-16">
  <div class="text-5xl">{emoji}</div>
  {#if text}
    <p class="text-sm text-muted">{text}</p>
  {/if}
</div>
