/**
 * Локальные типы для siema (npm-пакет без собственных .d.ts).
 * Описываем только то, что реально используется в SwipeStrip.
 */
declare module 'siema' {
  interface SiemaOptions {
    /** Селектор или сам элемент-контейнер (в него siema кладёт sliderFrame). */
    selector?: string | HTMLElement;
    /** Длительность CSS-transition при доезде/программных переходах, мс. */
    duration?: number;
    easing?: string;
    perPage?: number | Record<number, number>;
    /** Стартовый слайд (индекс). */
    startIndex?: number;
    /** Отключает обработчики тача/мыши (слайды листаются только программно). */
    draggable?: boolean;
    multipleDrag?: boolean;
    /** Порог драга до смены слайда, px. */
    threshold?: number;
    loop?: boolean;
    rtl?: boolean;
    onInit?: () => void;
    /** Вызывается в момент смены currentSlide (драг-отпускание, prev/next/goTo). */
    onChange?: () => void;
  }

  export default class Siema {
    constructor(options?: SiemaOptions);

    /** Индекс текущего слайда. */
    currentSlide: number;
    /** Контейнер (нормализован из конфига в элемент). */
    selector: HTMLElement;
    /** Исходные слайды (siema перемещает их в свои float-обёртки). */
    innerElements: HTMLElement[];
    /** Идёт ли сейчас жест (mousedown/touchstart принят, mouseup ещё не был). */
    pointerDown: boolean;
    /** Состояние текущего драга — для ручного завершения «потерянного» mouseup. */
    drag: {
      startX: number;
      endX: number;
      startY: number;
      letItGo: number | null;
      preventClick: boolean;
    };

    goTo(index: number, callback?: () => void): void;
    prev(howManySlides?: number, callback?: () => void): void;
    next(howManySlides?: number, callback?: () => void): void;
    /** restoreMarkup=true возвращает слайды в контейнер без обёрток (для повторного конструктора). */
    destroy(restoreMarkup?: boolean, callback?: () => void): void;

    /** Включить CSS-transition (следующий сдвиг анимируется). */
    enableTransition(): void;
    /** Выключить CSS-transition (следующий сдвиг мгновенный). */
    disableTransition(): void;
    /** Завершить драг по накопленному смещению: prev/next/возврат (как mouseupHandler). */
    updateAfterDrag(): void;
    /** Сбросить состояние драга (startX/endX/startY/letItGo). */
    clearDrag(): void;
  }
}
