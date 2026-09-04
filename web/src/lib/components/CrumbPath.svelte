<script lang="ts">
  // Хлебная цепочка с «ужиманием до влезающего»: полный путь показывается
  // целиком, пока влезает в ширину контейнера; если места не хватает —
  // средние сегменты отбрасываются по одному (от корня к активному концу),
  // остаются «Корень › … › Активная папка»; в крайнем случае (не влезает и
  // корень с активной) активный сегмент получает собственное многоточие.
  // Полный путь всегда доступен: у родителя в title (здесь не дублируется).
  let {
    segments,
    firstClass = '',
    restClass = '',
    containerClass = '',
  }: {
    /** Сегменты пути от корня к активному (последний — активный). */
    segments: string[];
    /** Классы первого сегмента (напр. font-semibold — имя топика). */
    firstClass?: string;
    /** Классы остальных сегментов и разделителей. */
    restClass?: string;
    /** Доп. классы корневого контейнера (flex-1 в строке-крошке). */
    containerClass?: string;
  } = $props();

  let el = $state<HTMLSpanElement | undefined>();

  // Сколько средних сегментов скрыто за «…» (убираем от корня к концу).
  let drops = $state(0);
  // Крайний случай: не влезает даже «корень › … › активный» — активный
  // сегмент ужимается с собственным многоточием (truncate).
  let clipLast = $state(false);

  // Новый путь — начинаем с полного и ужимаем до влезающего.
  let lastSegments: string[] | undefined;
  $effect(() => {
    if (lastSegments !== segments) {
      lastSegments = segments;
      drops = 0;
      clipLast = false;
    }
  });

  // Проверка переполнения после отрисовки: пока текст шире контейнера,
  // прячем по одному среднему сегменту за кадр. Измерение — реальным DOM
  // (scrollWidth против clientWidth), поэтому точно, без canvas-приближений.
  $effect(() => {
    const node = el;
    if (node === undefined) return;
    const maxDrops = Math.max(0, segments.length - 2);
    const current = drops;
    const id = requestAnimationFrame(() => {
      if (node.scrollWidth <= node.clientWidth + 1) return;
      if (current < maxDrops) {
        drops = current + 1;
      } else {
        clipLast = true;
      }
    });
    return () => cancelAnimationFrame(id);
  });

  // Оставшиеся после ужимания сегменты (без первого): средние + активный.
  const tail = $derived(segments.slice(1 + drops));
  const middles = $derived(tail.slice(0, Math.max(0, tail.length - 1)));
  const last = $derived(tail[tail.length - 1]);
  const showEllipsis = $derived(drops > 0);
</script>

<span
  bind:this={el}
  class="flex min-w-0 items-baseline overflow-hidden {containerClass}"
>
  <span class="shrink-0 whitespace-nowrap {firstClass}">{segments[0]}</span>
  {#if showEllipsis}
    <span class="shrink-0 whitespace-nowrap {restClass}"> › …</span>
  {/if}
  {#each middles as seg, i (i)}
    <span class="shrink-0 whitespace-nowrap {restClass}"> › {seg}</span>
  {/each}
  {#if last !== undefined}
    <span
      class="{clipLast ? 'min-w-0 truncate' : 'shrink-0 whitespace-nowrap'} {restClass}"
    >
      › {last}
    </span>
  {/if}
</span>
