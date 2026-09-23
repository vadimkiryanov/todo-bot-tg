// Нижняя панель: инпут с полем ввода, слева от него — кнопка «Меню».
// Над панелью парят кнопки: слева столбик «Папки» (выше) и «Топики» (ниже) —
// вне заливки панели, между ними видны заметки чата. Каждая открывает свою
// шторку. Подписей-иконок для папок/топиков/поиска в наборе
// @telegram-apps/telegram-ui нет, поэтому кнопки подписаны словами (политика
// иконок — в web/AGENTS.md). Кнопка «Поиск» живёт не здесь, а рядом с панелью
// ввода (ChatView): у неё своя заливка, и она не должна попадать в контейнер
// панели.
// Меню — плоские строки-Cell на компонентах @telegram-apps/telegram-ui
// (как списки уведомлений и шторок). Кнопки панели действий, «Меню» и
// плавающие кнопки — IconButton той же библиотеки: mode="gray" — нейтральная,
// mode="bezeled" — включённая опция; круглые тач-цели 44 px возвращаются
// оверрайдами (h-11 w-11 rounded-full! p-0!), а «стекло» плавающих кнопок —
// нашим классом .glass-fab. Поле ввода остаётся своим textarea: у библиотеки
// Textarea — форм-поле с min-height 84px, а Input однострочный и сломал бы
// «Enter = отправить, Shift+Enter = новая строка».
// При вводе текста или с курсором в поле над инпутом стоит панель действий
// новой заметки:
// приоритет (цикл; метка — '!'/'!!'/'!!!', у «без приоритета» — тире),
// напоминание (колокольчик, модалка), закрепление (иконка пина),
// «развернуть» (шеврон; созданная заметка показывается на карточке целиком)
// и справа карандаш «полный редактор» — создать заметку и открыть её в NotePage.
// Панель стоит раскрытой всё время, пока в поле ввода курсор, — опции можно
// выставить и до набора текста.
// Тап по кнопкам панели/плавающим кнопкам не уводит фокус из поля ввода —
// можно нажимать опции и продолжать набор.
// Enter — отправить, Shift+Enter — новая строка. После отправки поле очищается.
//
// TODO(router): пункты меню переходят на экраны /archive, /done,
// /notifications, /timers, /login. Смена экранов — дело микро-роутера уровня
// вью, поэтому здесь переходы оставлены колбэком onNavigate(path): вью
// (родитель) передаёт его и выполняет навигацию, данные грузятся тут.
import { useEffect, useRef, useState } from 'react';
import { IconButton, List, Section } from '@telegram-apps/telegram-ui';
import { Icon20Select } from '@telegram-apps/telegram-ui/dist/icons/20/select';
import { Icon24ChevronDown } from '@telegram-apps/telegram-ui/dist/icons/24/chevron_down';
import { Icon24ChevronRight } from '@telegram-apps/telegram-ui/dist/icons/24/chevron_right';
import { Icon24Notifications } from '@telegram-apps/telegram-ui/dist/icons/24/notifications';
import { Icon24PersonRemove } from '@telegram-apps/telegram-ui/dist/icons/24/person_remove';
import { Icon24SunLow } from '@telegram-apps/telegram-ui/dist/icons/24/sun_low';
import { Icon28Archive } from '@telegram-apps/telegram-ui/dist/icons/28/archive';
import { Icon28Edit } from '@telegram-apps/telegram-ui/dist/icons/28/edit';

import { createNote, loadArchived, loadDone, loadTimers } from '../stores/notes';
import { loadNotifications, useNotificationsStore } from '../stores/notifications';
import { useNavigationStore } from '../stores/navigation';
import { setNoteExpanded } from '../stores/noteView';
import { logout } from '../stores/session';
import { useSettingsStore } from '../stores/settings';
import { bumpTopicNoteCount } from '../stores/topics';
import type { Note, Priority, ReminderRepeat } from '../types/api';
import { useCloseAnim } from '../utils/closeAnim';
import { nextPriority, priorityLabel, priorityMark } from '../utils/format';

import { Modal } from './Modal';
import { MenuRow } from './MenuRow';
import { PinIcon } from './PinIcon';
import { ReminderForm } from './ReminderForm';
import { SettingsSheet } from './SettingsSheet';
import { Spinner } from './Spinner';

interface InputBarProps {
  /** Открыть шторку топиков. */
  onOpenTopics?: () => void;
  /** Открыть шторку папок. */
  onOpenFolders?: () => void;
  /** Переход на экран уровня вью: '/archive', '/done', '/notifications',
      '/timers', '/login' (см. TODO(router) в шапке). */
  onNavigate?: (path: string) => void;
  /** Открыть созданную заметку в полном редакторе («расширенный режим»). */
  onOpenNote?: (note: Note) => void;
}

export function InputBar({
  onOpenTopics,
  onOpenFolders,
  onNavigate,
  onOpenNote,
}: InputBarProps) {
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const input = useRef<HTMLTextAreaElement>(null);
  /** Курсор в поле ввода: панель действий видна и без текста (см. showActions). */
  const [focused, setFocused] = useState(false);
  /** Корень панели: по нему отличаем уход фокуса из поля от тапа по её кнопкам. */
  const rootRef = useRef<HTMLDivElement>(null);

  // Опции создания: приоритет / закреплено / развёрнуто / напоминание.
  const [priority, setPriority] = useState<Priority>('none');
  const [pinned, setPinned] = useState(false);
  // «Развёрнуто» — созданная заметка сразу показывается на карточке целиком
  // (как пункт «Развернуть» в меню заметки), без обрезки превью.
  const [expanded, setExpanded] = useState(false);
  const [reminderAt, setReminderAt] = useState<string | null>(null); // ISO 8601 UTC
  const [reminderRepeat, setReminderRepeat] = useState<ReminderRepeat>('once');
  const [showReminderForm, setShowReminderForm] = useState(false);

  // Бургер-меню: выполненные, архив, настройки и выход.
  const [menuOpen, setMenuOpen] = useState(false);
  // Шторка настроек: открывается из меню (строка «Настройки»).
  const [settingsOpen, setSettingsOpen] = useState(false);

  // Активна ли папка (влияет на вид кнопки «Папки»).
  const folderActive = useNavigationStore((s) => s.activeFolderID !== null);
  // Режим показа папок на списке: кнопка «Папки» нужна только в режиме 'button'.
  const foldersMode = useSettingsStore((s) => s.foldersMode);
  // Бейдж непрочитанных уведомлений на кнопке «Меню» (считаем из списка,
  // на который подписались — в zustand нет реактивного getState()).
  const notificationItems = useNotificationsStore((s) => s.items);
  const badgeCount = notificationItems.reduce((acc, n) => acc + (n.read ? 0 : 1), 0);

  /** Вернуть фокус в поле ввода после тапа по кнопке (панель действий и т.п.):
      иначе на десктопе кнопка забирает фокус и набор прерывается. */
  function keepInputFocus(): void {
    requestAnimationFrame(() => input.current?.focus({ preventScroll: true }));
  }

  // Меню закрывается обратной анимацией (раньше исчезало рывком, хотя
  // открывалось плавно): setMenuOpen(false) откладывается до её конца.
  // menuRefocus — вернуть ли после этого фокус в поле ввода.
  const menuRefocus = useRef(true);
  const { closing: menuClosing, requestClose: requestMenuClose } = useCloseAnim(() => {
    setMenuOpen(false);
    if (menuRefocus.current) keepInputFocus();
    menuRefocus.current = true;
  });

  /** Тап по кнопке, не прерывающий набор: выполнить действие + вернуть фокус. */
  function press(action: () => void): void {
    action();
    keepInputFocus();
  }

  /** Опции создания заметки из текущего состояния панели действий. */
  function currentOptions(): {
    priority: Priority;
    pinned: boolean;
    reminder_at?: string;
    reminder_repeat?: ReminderRepeat;
  } {
    return {
      priority,
      pinned,
      reminder_at: reminderAt ?? undefined,
      reminder_repeat: reminderAt !== null ? reminderRepeat : undefined,
    };
  }

  /** Сброс текста и опций после успешного создания заметки. */
  function resetCompose(): void {
    setText('');
    resetHeight();
    setPriority('none');
    setPinned(false);
    setExpanded(false);
    setReminderAt(null);
    setReminderRepeat('once');
    setShowReminderForm(false);
  }

  /**
   * Создать заметку из текущего ввода. openEditor — открыть созданную заметку
   * в полном редакторе (кнопка-карандаш на панели действий): сразу можно
   * дописать форматирование, как будто уже перешли в заметку.
   */
  async function submit(openEditor: boolean): Promise<void> {
    const value = text.trim();
    if (value === '' || sending) return;
    setSending(true);
    try {
      const created = await createNote(value, currentOptions());
      const markExpanded = expanded;
      resetCompose();
      // Счётчик заметок топика в табах/шторке: сервер отдаёт его в списке
      // топиков, а тот после создания заметки не перечитывается.
      if (created !== null) bumpTopicNoteCount(created.topic_id, 1);
      if (markExpanded && created !== null) {
        // Заметку просили сразу развернуть — помечаем её «развёрнутой» до
        // открытия редактора, чтобы карточка (и NotePage) показали её целиком.
        setNoteExpanded(created.id, true);
      }
      if (openEditor && created !== null) {
        // Полный редактор сам управляет фокусом — в поле ввода не возвращаем
        // (иначе на мобильных всплывёт клавиатура под открытой заметкой).
        onOpenNote?.(created);
      }
    } catch {
      // При ошибке текст остаётся в поле — пользователь видит и может повторить
      // (тост с причиной уже показал стор заметок).
    } finally {
      setSending(false);
      if (!openEditor) {
        // Сразу можно писать следующую заметку.
        keepInputFocus();
      }
    }
  }

  async function send(): Promise<void> {
    await submit(false);
  }

  /** Тап по кнопке напоминания: открыть модалку или снять уже заданное. */
  function toggleReminderForm(): void {
    if (reminderAt !== null) {
      setReminderAt(null);
      setShowReminderForm(false);
      return;
    }
    setShowReminderForm(true);
  }

  function onKeydown(event: React.KeyboardEvent<HTMLTextAreaElement>): void {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      void send();
    }
  }

  /** Авторастягивание textarea под текст (до max-h-32), как в Svelte-версии. */
  function autoResize(): void {
    const node = input.current;
    if (node === null) return;
    node.style.height = 'auto';
    node.style.height = `${Math.min(node.scrollHeight, 128)}px`;
  }

  function resetHeight(): void {
    const node = input.current;
    if (node !== null) node.style.height = '';
  }

  function toggleMenu(): void {
    if (menuOpen) {
      closeMenu();
      return;
    }
    setMenuOpen(true);
  }

  /** Закрыть бургер-меню обратной анимацией (как открывали). Фокус возвращаем
      в поле только для «обычного» закрытия: при уходе на другой экран и при
      открытии настроек он не нужен — клавиатура вылезла бы поверх шторки. */
  function closeMenu(refocus = true): void {
    menuRefocus.current = refocus;
    requestMenuClose();
  }

  async function goArchived(): Promise<void> {
    // Сразу грузим архив — экран покажет данные без повторного запроса.
    closeMenu(false);
    await loadArchived();
    onNavigate?.('/archive');
  }

  async function goDone(): Promise<void> {
    // Сразу грузим выполненные — экран покажет данные без повторного запроса.
    closeMenu(false);
    await loadDone();
    onNavigate?.('/done');
  }

  async function goNotifications(): Promise<void> {
    // Сразу грузим журнал — экран покажет данные без повторного запроса.
    closeMenu(false);
    await loadNotifications();
    onNavigate?.('/notifications');
  }

  async function goTimers(): Promise<void> {
    // Сразу грузим таймеры — экран покажет данные без повторного запроса.
    closeMenu(false);
    await loadTimers();
    onNavigate?.('/timers');
  }

  async function doLogout(): Promise<void> {
    closeMenu(false);
    await logout();
    onNavigate?.('/login');
  }

  /** Открыть настройки: бургер закрываем без возврата фокуса в инпут
      (иначе на мобильных над шторкой вылезет клавиатура). */
  function openSettings(): void {
    closeMenu(false);
    setSettingsOpen(true);
  }

  // Escape закрывает бургер-меню. closeMenu держим в ref: она пересоздаётся
  // на каждом рендере, а переподписка нужна только на открытие/закрытие меню.
  const closeMenuRef = useRef(closeMenu);
  closeMenuRef.current = closeMenu;
  useEffect(() => {
    if (!menuOpen) return;
    const onKeydown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') closeMenuRef.current();
    };
    window.addEventListener('keydown', onKeydown);
    return () => window.removeEventListener('keydown', onKeydown);
  }, [menuOpen]);

  // Есть ли текст для отправки: кнопка отправки зависит от этого.
  const hasText = text.trim() !== '';
  // Панель действий показываем и на пустом поле, пока в нём курсор: опции
  // (приоритет, напоминание, закреп, «развернуть») выставляют до набора текста.
  const showActions = hasText || focused;

  return (
    <div ref={rootRef} className="relative px-3 py-2">
      {menuOpen && (
        <>
          {/* Затемняющая подложка: тап вне меню — закрыть */}
          <div
            className={`backdrop-glass fixed inset-0 z-40 bg-black/40 ${
              menuClosing ? 'backdrop-out' : 'backdrop-anim'
            }`}
            onClick={() => closeMenu()}
            aria-hidden="true"
          ></div>
          {/* px-0! py-0! — снимаем собственные отступы List (10px 18px): поля
              меню задаёт карточка-секция, как в шторке настроек. */}
          <div
            className={`glass-menu absolute bottom-full left-2 z-50 mb-2 w-56 rounded-2xl p-2 shadow-xl ${
              menuClosing ? 'menu-out' : 'menu-anim'
            }`}
            role="menu"
          >
            <List className="px-0! py-0!">
              <Section>
                <MenuRow
                  icon={<Icon24Notifications />}
                  badge={badgeCount}
                  onSelect={() => {
                    void goNotifications();
                  }}
                >
                  Уведомления
                </MenuRow>
                <MenuRow
                  icon={<Icon24Notifications />}
                  onSelect={() => {
                    void goTimers();
                  }}
                >
                  Таймеры
                </MenuRow>
                <MenuRow
                  icon={<Icon20Select />}
                  onSelect={() => {
                    void goDone();
                  }}
                >
                  Выполненные
                </MenuRow>
                <MenuRow
                  icon={<Icon28Archive />}
                  onSelect={() => {
                    void goArchived();
                  }}
                >
                  Архив
                </MenuRow>
                <MenuRow
                  icon={<Icon24SunLow />}
                  onSelect={openSettings}
                >
                  Настройки
                </MenuRow>
                <MenuRow
                  icon={<Icon24PersonRemove />}
                  onSelect={() => {
                    void doLogout();
                  }}
                >
                  Выход
                </MenuRow>
              </Section>
            </List>
          </div>
        </>
      )}

      {showReminderForm && (
        <Modal
          open
          onClose={() => {
            setShowReminderForm(false);
            keepInputFocus();
          }}
        >
          <div className="flex flex-col gap-1 px-1 py-2">
            <h2 className="text-center text-sm text-muted-foreground">Напоминание</h2>
            <ReminderForm
              initial={reminderAt ?? ''}
              initialRepeat={reminderRepeat}
              busy={sending}
              onSubmit={async (iso, repeat) => {
                setReminderAt(iso);
                setReminderRepeat(repeat);
              }}
              onSaved={() => {
                setShowReminderForm(false);
                keepInputFocus();
              }}
              onCancel={() => {
                setShowReminderForm(false);
                keepInputFocus();
              }}
            />
          </div>
        </Modal>
      )}

      {settingsOpen && (
        <SettingsSheet
          open
          onClose={() => {
            setSettingsOpen(false);
            keepInputFocus();
          }}
        />
      )}

      {/* Плавающие кнопки над нижней панелью (слева, вне белой заливки):
           «Топики» — шторка топиков. «Папки» показываем только в режиме
           «Отдельная кнопка»: в режиме «в списке» папки видны строками прямо
           в списке заметок, отдельная кнопка не нужна (строка текущей папки
           над списком остаётся в обоих режимах). Тап не уводит фокус из ввода.
           Иконок «папки»/«топики» в наборе библиотеки нет — кнопки-пилюли
           подписаны словами (тач-цель та же, h-11). */}
      <div className="absolute bottom-full left-3 mb-2 flex flex-col items-start gap-2">
        {foldersMode === 'button' && (
          <IconButton
            type="button"
            size="m"
            mode="gray"
            aria-label="Папки"
            aria-expanded={folderActive}
            title={folderActive ? 'Вы в папке — открыть папки' : 'Открыть папки'}
            className={`glass-fab h-11 items-center justify-center rounded-full! px-4! text-sm btn-press ${
              folderActive ? 'text-primary!' : 'text-muted-foreground!'
            }`}
            onClick={() => press(() => onOpenFolders?.())}
          >
            Папки
          </IconButton>
        )}
        <IconButton
          type="button"
          size="m"
          mode="gray"
          aria-label="Топики"
          className="glass-fab h-11 items-center justify-center rounded-full! px-4! text-sm text-muted-foreground! btn-press"
          onClick={() => press(() => onOpenTopics?.())}
        >
          Топики
        </IconButton>
      </div>

      <div className="flex flex-col">
        {/* Панель действий новой заметки: плавно раскрывается по высоте, когда
            в поле ввода встал курсор (текст не обязателен — опции выставляют
            заранее), и так же прячется, когда поле покинули. Держим её в DOM
            всегда — grid-rows 0fr→1fr (CSS не анимирует высоту к auto, а
            условный рендер давал бы резкий скачок строки ввода). inert и
            aria-hidden в скрытом состоянии — кнопки не ловят фокус. Тап по
            кнопке не уводит фокус из поля ввода (press возвращает фокус). */}
        <div
          className={`grid transition-[grid-template-rows,opacity] duration-200 ease-out motion-reduce:transition-none ${
            showActions ? 'grid-rows-[1fr] opacity-100' : 'grid-rows-[0fr] opacity-0'
          }`}
          aria-hidden={!showActions}
          inert={!showActions}
        >
          <div className="min-h-0 overflow-hidden">
            <div className="flex items-center gap-2 px-1 pb-1.5">
              <IconButton
                type="button"
                size="m"
                mode={priority !== 'none' ? 'bezeled' : 'gray'}
                aria-label={`Приоритет: ${priorityLabel(priority)}`}
                aria-pressed={priority !== 'none'}
                title={`Приоритет: ${priorityLabel(priority)}`}
                className="h-11 w-11 shrink-0 items-center justify-center rounded-full! p-0! btn-press"
                onClick={() => press(() => setPriority(nextPriority(priority)))}
              >
                <span className="text-base font-semibold leading-none">
                  {priorityMark(priority)}
                </span>
              </IconButton>
              <IconButton
                type="button"
                size="m"
                mode={reminderAt !== null ? 'bezeled' : 'gray'}
                aria-label={reminderAt !== null ? 'Снять напоминание' : 'Добавить напоминание'}
                aria-pressed={reminderAt !== null}
                className="h-11 w-11 shrink-0 items-center justify-center rounded-full! p-0! btn-press"
                onClick={() => press(toggleReminderForm)}
              >
                <Icon24Notifications className="h-6 w-6" />
              </IconButton>
              <IconButton
                type="button"
                size="m"
                mode={pinned ? 'bezeled' : 'gray'}
                aria-label={pinned ? 'Открепить' : 'Закрепить'}
                aria-pressed={pinned}
                className="h-11 w-11 shrink-0 items-center justify-center rounded-full! p-0! btn-press"
                onClick={() => press(() => setPinned(!pinned))}
              >
                {/* Иконка закрепления вместо слова «Пин» (PinIcon — своя:
                    в наборе библиотеки пина нет). */}
                <PinIcon className="h-6 w-6" />
              </IconButton>
              {/* Шеврон вниз — созданная заметка будет развёрнута: карточка
                  покажет текст целиком (то же, что «Развернуть» в меню заметки). */}
              <IconButton
                type="button"
                size="m"
                mode={expanded ? 'bezeled' : 'gray'}
                aria-label={expanded ? 'Заметка не будет развёрнута' : 'Развернуть заметку'}
                aria-pressed={expanded}
                title={expanded ? 'Заметка будет развёрнута' : 'Развернуть заметку'}
                className="h-11 w-11 shrink-0 items-center justify-center rounded-full! p-0! btn-press"
                onClick={() => press(() => setExpanded(!expanded))}
              >
                <Icon24ChevronDown className="h-6 w-6" />
              </IconButton>
              {/* Карандаш прижат вправо: создать заметку и сразу открыть её
                  в полном редакторе (форматирование, заголовки, списки). */}
              <IconButton
                type="button"
                size="m"
                mode="gray"
                aria-label="Открыть в полном редакторе"
                title="Открыть в полном редакторе"
                className="ml-auto h-11 w-11 shrink-0 items-center justify-center rounded-full! p-0! text-muted-foreground! btn-press disabled:opacity-40"
                disabled={sending}
                onClick={() => {
                  void submit(true);
                }}
              >
                <Icon28Edit />
              </IconButton>
            </div>
          </div>
        </div>

        <div className="flex items-end gap-1.5">
          <IconButton
            type="button"
            size="m"
            mode="gray"
            aria-label={badgeCount > 0 ? `Меню (${badgeCount} непрочитанных уведомлений)` : 'Меню'}
            aria-expanded={menuOpen}
            className="relative h-11 min-w-11 shrink-0 items-center justify-center rounded-full! px-3! text-sm text-muted-foreground! btn-press"
            onClick={toggleMenu}
          >
            Меню
            {badgeCount > 0 && (
              /* Бейдж непрочитанных на самой кнопке: видно, что в уведомлениях
                 что-то есть */
              <span
                className="absolute right-1 top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-destructive px-1 text-[10px] font-semibold leading-none text-white"
                aria-hidden="true"
              >
                {badgeCount > 99 ? '99+' : badgeCount}
              </span>
            )}
          </IconButton>
          {/* Поле ввода: тап пальцем/стилусом «продавливает» поле (лёгкое
              сжатие) и пружинисто отпускает — тактильный отклик касания, как
              у кнопок Telegram. Отклик общий для всех полей приложения
              (.input-press в app.css, состояние — нативный :active). */}
          <textarea
            ref={input}
            rows={1}
            value={text}
            placeholder="Написать заметку…"
            onChange={(e) => {
              setText(e.target.value);
              autoResize();
            }}
            onKeyDown={onKeydown}
            onFocus={() => setFocused(true)}
            onBlur={(e) => {
              // Фокус ушёл на элемент самой панели (кнопки опций, отправка):
              // это не уход из поля, панель не складываем — иначе она
              // схлопнулась бы прямо под пальцем в момент нажатия.
              if (e.relatedTarget !== null && rootRef.current?.contains(e.relatedTarget) === true) {
                return;
              }
              setFocused(false);
            }}
            className="input-press max-h-32 min-h-11 flex-1 resize-none rounded-2xl border border-border bg-muted px-4 py-3 text-base leading-5 outline-none focus:border-ring placeholder:text-muted-foreground"
          ></textarea>
          <IconButton
            type="button"
            size="m"
            mode="plain"
            aria-label="Отправить"
            className="h-11 w-11 shrink-0 items-center justify-center rounded-full! bg-primary! p-0! text-white! btn-press disabled:opacity-40"
            disabled={sending || !hasText}
            onClick={() => {
              void send();
            }}
          >
            {sending ? <Spinner size="20px" /> : <Icon24ChevronRight className="h-6 w-6" />}
          </IconButton>
        </div>
      </div>
    </div>
  );
}
