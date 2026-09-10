// Нижняя панель: белая панель с инпутом, где слева от textarea стоит
// бургер ☰ (как раньше). Над панелью парят кнопки: слева столбик 📁 «Папки»
// (выше) и 📚 «Топики» (ниже), справа — 🔍 «Поиск» (над ➤) — вне белой
// заливки, между ними видны заметки чата. Каждая открывает свою шторку.
// При вводе текста над инпутом появляется панель действий новой заметки:
// 🔴🟡🔵 приоритет (цикл), ⏰ напоминание (модалка), 📌 закрепление и справа
// ✏️ «полный редактор» — создать заметку и открыть её в NotePage.
// Тап по кнопкам панели/плавающим кнопкам не уводит фокус из поля ввода —
// можно нажимать опции и продолжать набор.
// Enter — отправить, Shift+Enter — новая строка. После отправки поле очищается.
//
// TODO(router): пункты бургер-меню переходят на экраны /archive, /done,
// /notifications, /timers, /login. Смена экранов — дело микро-роутера уровня
// вью, поэтому здесь переходы оставлены колбэком onNavigate(path): вью
// (родитель) передаёт его и выполняет навигацию, данные грузятся тут.
import { useEffect, useRef, useState } from 'react';

import { createNote, loadArchived, loadDone, loadTimers } from '../stores/notes';
import { loadNotifications, useNotificationsStore } from '../stores/notifications';
import { useNavigationStore } from '../stores/navigation';
import { logout } from '../stores/session';
import { useSettingsStore } from '../stores/settings';
import { useTopicsStore } from '../stores/topics';
import type { Note, Priority, ReminderRepeat } from '../types/api';
import { nextPriority, priorityEmoji, priorityLabel } from '../utils/format';

import { Modal } from './Modal';
import { ReminderForm } from './ReminderForm';
import { SettingsSheet } from './SettingsSheet';
import { Spinner } from './Spinner';

interface InputBarProps {
  /** Открыть шторку топиков. */
  onOpenTopics?: () => void;
  /** Открыть шторку папок. */
  onOpenFolders?: () => void;
  /** Открыть поиск по заметкам (rect — геометрия кнопки 🔍: панель поиска
      раскрывается из неё круговой анимацией). */
  onOpenSearch?: (rect: DOMRect) => void;
  /** Переход на экран уровня вью: '/archive', '/done', '/notifications',
      '/timers', '/login' (см. TODO(router) в шапке). */
  onNavigate?: (path: string) => void;
  /** Открыть созданную заметку в полном редакторе («расширенный режим»). */
  onOpenNote?: (note: Note) => void;
}

export function InputBar({
  onOpenTopics,
  onOpenFolders,
  onOpenSearch,
  onNavigate,
  onOpenNote,
}: InputBarProps) {
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const input = useRef<HTMLTextAreaElement>(null);

  // Опции создания: приоритет / закреплено / напоминание.
  const [priority, setPriority] = useState<Priority>('none');
  const [pinned, setPinned] = useState(false);
  const [reminderAt, setReminderAt] = useState<string | null>(null); // ISO 8601 UTC
  const [reminderRepeat, setReminderRepeat] = useState<ReminderRepeat>('once');
  const [showReminderForm, setShowReminderForm] = useState(false);

  // Бургер-меню: выполненные, архив, настройки и выход.
  const [menuOpen, setMenuOpen] = useState(false);
  // Шторка настроек: открывается из бургер-меню (⚙️ Настройки).
  const [settingsOpen, setSettingsOpen] = useState(false);

  // Активна ли папка (влияет на вид 📁-кнопки).
  const folderActive = useNavigationStore((s) => s.activeFolderID !== null);
  // Режим показа папок на списке: кнопка 📁 нужна только в режиме 'button'.
  const foldersMode = useSettingsStore((s) => s.foldersMode);
  // Поиск по заметкам показываем только когда есть топики: по пустому списку
  // искать нечего. Кнопка 🔍 парит справа над ➤ (зеркально столбику 📁/📚).
  const hasTopics = useTopicsStore((s) => s.topics.length > 0);
  const searchBtnRef = useRef<HTMLButtonElement>(null);
  // Бейдж непрочитанных уведомлений на 🔔 и на бургере (считаем из списка,
  // на который подписались — в zustand нет реактивного getState()).
  const notificationItems = useNotificationsStore((s) => s.items);
  const badgeCount = notificationItems.reduce((acc, n) => acc + (n.read ? 0 : 1), 0);

  /** Вернуть фокус в поле ввода после тапа по кнопке (панель действий и т.п.):
      иначе на десктопе кнопка забирает фокус и набор прерывается. */
  function keepInputFocus(): void {
    requestAnimationFrame(() => input.current?.focus({ preventScroll: true }));
  }

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
    setReminderAt(null);
    setReminderRepeat('once');
    setShowReminderForm(false);
  }

  /**
   * Создать заметку из текущего ввода. openEditor — открыть созданную заметку
   * в полном редакторе (кнопка ✏️ на панели действий): сразу можно дописать
   * форматирование, как будто уже перешли в заметку.
   */
  async function submit(openEditor: boolean): Promise<void> {
    const value = text.trim();
    if (value === '' || sending) return;
    setSending(true);
    try {
      const created = await createNote(value, currentOptions());
      resetCompose();
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

  /** Тап по ⏰: открыть модалку напоминания или снять уже заданное. */
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
    setMenuOpen(!menuOpen);
    if (menuOpen) keepInputFocus();
  }

  function closeMenu(): void {
    setMenuOpen(false);
    keepInputFocus();
  }

  async function goArchived(): Promise<void> {
    // Сразу грузим архив — экран покажет данные без повторного запроса.
    closeMenu();
    await loadArchived();
    onNavigate?.('/archive');
  }

  async function goDone(): Promise<void> {
    // Сразу грузим выполненные — экран покажет данные без повторного запроса.
    closeMenu();
    await loadDone();
    onNavigate?.('/done');
  }

  async function goNotifications(): Promise<void> {
    // Сразу грузим журнал — экран покажет данные без повторного запроса.
    closeMenu();
    await loadNotifications();
    onNavigate?.('/notifications');
  }

  async function goTimers(): Promise<void> {
    // Сразу грузим таймеры — экран покажет данные без повторного запроса.
    closeMenu();
    await loadTimers();
    onNavigate?.('/timers');
  }

  async function doLogout(): Promise<void> {
    closeMenu();
    await logout();
    onNavigate?.('/login');
  }

  /** Открыть настройки: бургер закрываем без возврата фокуса в инпут
      (иначе на мобильных над шторкой вылезет клавиатура). */
  function openSettings(): void {
    setMenuOpen(false);
    setSettingsOpen(true);
  }

  // Escape закрывает бургер-меню. closeMenu стабилен по поведению
  // (setMenuOpen + возврат фокуса в поле ввода) — переподписка при каждом
  // ре-рендере не нужна, достаточно открытия/закрытия меню.
  useEffect(() => {
    if (!menuOpen) return;
    const onKeydown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') closeMenu();
    };
    window.addEventListener('keydown', onKeydown);
    return () => window.removeEventListener('keydown', onKeydown);
  }, [menuOpen]);

  return (
    <div className="relative px-3 py-2">
      {menuOpen && (
        <>
          {/* Затемняющая подложка: тап вне меню — закрыть */}
          <div
            className="backdrop-glass backdrop-anim fixed inset-0 z-40 bg-black/40"
            onClick={closeMenu}
            aria-hidden="true"
          ></div>
          <div
            className="glass-menu menu-anim absolute bottom-full left-2 z-50 mb-2 flex w-56 flex-col gap-1 rounded-2xl p-2 shadow-xl"
            role="menu"
          >
            <button
              type="button"
              role="menuitem"
              className="flex h-11 items-center gap-3 rounded-xl px-3 text-left text-[15px] transition-colors active:bg-border/50"
              onClick={() => {
                void goNotifications();
              }}
            >
              <span className="relative w-6 shrink-0 text-center text-base">
                🔔
                {badgeCount > 0 && (
                  <span className="absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-destructive px-1 text-[10px] font-semibold leading-none text-white">
                    {badgeCount > 99 ? '99+' : badgeCount}
                  </span>
                )}
              </span>
              Уведомления
            </button>
            <button
              type="button"
              role="menuitem"
              className="flex h-11 items-center gap-3 rounded-xl px-3 text-left text-[15px] transition-colors active:bg-border/50"
              onClick={() => {
                void goTimers();
              }}
            >
              <span className="w-6 shrink-0 text-center text-base">⏰</span>
              Таймеры
            </button>
            <button
              type="button"
              role="menuitem"
              className="flex h-11 items-center gap-3 rounded-xl px-3 text-left text-[15px] transition-colors active:bg-border/50"
              onClick={() => {
                void goDone();
              }}
            >
              <span className="w-6 shrink-0 text-center text-base">✅</span>
              Выполненные
            </button>
            <button
              type="button"
              role="menuitem"
              className="flex h-11 items-center gap-3 rounded-xl px-3 text-left text-[15px] transition-colors active:bg-border/50"
              onClick={() => {
                void goArchived();
              }}
            >
              <span className="w-6 shrink-0 text-center text-base">🗄</span>
              Архив
            </button>
            <button
              type="button"
              role="menuitem"
              className="flex h-11 items-center gap-3 rounded-xl px-3 text-left text-[15px] transition-colors active:bg-border/50"
              onClick={openSettings}
            >
              <span className="w-6 shrink-0 text-center text-base">⚙️</span>
              Настройки
            </button>
            <button
              type="button"
              role="menuitem"
              className="flex h-11 items-center gap-3 rounded-xl px-3 text-left text-[15px] transition-colors active:bg-border/50"
              onClick={() => {
                void doLogout();
              }}
            >
              <span className="w-6 shrink-0 text-center text-base">🚪</span>
              Выход
            </button>
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
            <h2 className="text-center text-sm text-muted-foreground">⏰ Напоминание</h2>
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
           📚 «Топики» — шторка топиков. 📁 «Папки» показываем только в режиме
           «Отдельная кнопка»: в режиме «в списке» папки видны строками прямо
           в списке заметок, отдельная кнопка не нужна (строка текущей папки
           над списком остаётся в обоих режимах). Тап не уводит фокус из ввода. */}
      <div className="absolute bottom-full left-3 mb-2 flex flex-col items-center gap-2">
        {foldersMode === 'button' && (
          <button
            type="button"
            aria-label="Папки"
            aria-expanded={folderActive}
            title={folderActive ? 'Вы в папке — открыть папки' : 'Открыть папки'}
            className={`glass-fab flex h-11 w-11 items-center justify-center rounded-full text-lg transition-[background-color,transform] active:scale-90 ${
              folderActive ? 'text-primary' : 'text-muted-foreground'
            }`}
            onClick={() => press(() => onOpenFolders?.())}
          >
            📁
          </button>
        )}
        <button
          type="button"
          aria-label="Топики"
          className="glass-fab flex h-11 w-11 items-center justify-center rounded-full text-lg text-muted-foreground transition-[background-color,transform] active:scale-90"
          onClick={() => press(() => onOpenTopics?.())}
        >
          📚
        </button>
      </div>

      {/* 🔍 «Поиск» — справа, на одном уровне со столбиком слева, над ➤
          (кнопкой отправки заметки). Тап открывает полноэкранный поиск;
          панель раскрывается круговой «развёрткой» из центра этой кнопки —
          она же даёт геометрию (searchBtnRef) через onOpenSearch. */}
      {hasTopics && (
        <button
          ref={searchBtnRef}
          type="button"
          aria-label="Поиск по заметкам"
          className="glass-fab absolute bottom-full right-3 mb-2 flex h-11 w-11 items-center justify-center rounded-full text-lg text-muted-foreground transition-[background-color,transform] active:scale-90"
          onClick={() => {
            const rect = searchBtnRef.current?.getBoundingClientRect();
            if (rect !== undefined) onOpenSearch?.(rect);
          }}
        >
          🔍
        </button>
      )}

      <div className="flex flex-col gap-1.5">
        {text.trim() !== '' && (
          /* Панель действий новой заметки (видна при вводе текста): тап по
             кнопке не уводит фокус из поля ввода (press возвращает фокус) */
          <div className="flex items-center gap-2 px-1">
            <button
              type="button"
              aria-label={`Приоритет: ${priorityLabel(priority)}`}
              aria-pressed={priority !== 'none'}
              title={`Приоритет: ${priorityLabel(priority)}`}
              className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-lg transition-[background-color,transform] active:scale-90 ${
                priority !== 'none' ? 'bg-border/60' : 'bg-muted'
              }`}
              onClick={() => press(() => setPriority(nextPriority(priority)))}
            >
              {priorityEmoji(priority)}
            </button>
            <button
              type="button"
              aria-label={reminderAt !== null ? 'Снять напоминание' : 'Добавить напоминание'}
              aria-pressed={reminderAt !== null}
              className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-lg transition-[background-color,transform] active:scale-90 ${
                reminderAt !== null ? 'bg-border/60' : 'bg-muted'
              }`}
              onClick={() => press(toggleReminderForm)}
            >
              ⏰
            </button>
            <button
              type="button"
              aria-label={pinned ? 'Открепить' : 'Закрепить'}
              aria-pressed={pinned}
              className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-lg transition-[background-color,transform] active:scale-90 ${
                pinned ? 'bg-border/60' : 'bg-muted'
              }`}
              onClick={() => press(() => setPinned(!pinned))}
            >
              📌
            </button>
            {/* ✏️ прижата вправо: создать заметку и сразу открыть её в полном
                редакторе (форматирование, заголовки, списки). */}
            <button
              type="button"
              aria-label="Открыть в полном редакторе"
              title="Открыть в полном редакторе"
              className="ml-auto flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-muted text-lg text-muted-foreground transition-[background-color,transform] active:scale-90 active:bg-border disabled:opacity-40"
              disabled={sending}
              onClick={() => {
                void submit(true);
              }}
            >
              ✏️
            </button>
          </div>
        )}

        <div className="flex items-end gap-1.5">
          <button
            type="button"
            aria-label={badgeCount > 0 ? `Меню (${badgeCount} непрочитанных уведомлений)` : 'Меню'}
            aria-expanded={menuOpen}
            className="relative flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-muted text-lg text-muted-foreground transition-[background-color,transform] active:scale-90 active:bg-border"
            onClick={toggleMenu}
          >
            ☰
            {badgeCount > 0 && (
              /* Бейдж непрочитанных на самом бургере: видно, что в 🔔 что-то есть */
              <span
                className="absolute right-1 top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-destructive px-1 text-[10px] font-semibold leading-none text-white"
                aria-hidden="true"
              >
                {badgeCount > 99 ? '99+' : badgeCount}
              </span>
            )}
          </button>
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
            className="max-h-32 min-h-11 flex-1 resize-none rounded-2xl border border-border bg-muted px-4 py-3 text-base leading-5 outline-none focus:border-ring placeholder:text-muted-foreground"
          ></textarea>
          <button
            type="button"
            aria-label="Отправить"
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-primary text-white transition-[opacity,transform] active:scale-90 disabled:opacity-40"
            disabled={sending || text.trim() === ''}
            onClick={() => {
              void send();
            }}
          >
            {sending ? <Spinner size="20px" /> : <span className="text-xl leading-none">➤</span>}
          </button>
        </div>
      </div>
    </div>
  );
}
