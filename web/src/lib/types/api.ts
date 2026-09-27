// Типы API — зеркалят DTO бэкенда (docs/BACKEND_API_PLAN.md, §6).
// При изменении контракта — обновлять здесь и в mock.ts.

export interface User {
  id: number;
  username: string;
}

export interface Topic {
  id: number;
  name: string;
  note_count: number;
  /** Закреплён (быстрый топик в боте): в вебе такие топики идут первыми,
   *  закреп/открепление — через PATCH §6. */
  pinned: boolean;
}

export type Priority = 'none' | 'low' | 'medium' | 'high';

/** Сущность форматирования фрагмента заметки (формат Telegram MessageEntity,
 * offset/length в UTF-16 единицах). */
export interface NoteEntity {
  type: string;
  offset: number;
  length: number;
  url?: string;
}

export interface Note {
  id: number;
  text: string;
  entities: NoteEntity[];
  priority: Priority;
  done: boolean;
  pinned: boolean;
  archived: boolean;
  created_at: string; // ISO 8601
  /** Время последнего редактирования текста (ISO 8601). Меняется только при
   *  правке текста — приоритет/выполнение/закрепление/архив его не трогают. */
  updated_at: string;
  topic_id: number;
  folder_id: number | null; // null — в корне топика
  reminder_at: string | null; // ISO 8601 (UTC); null — без напоминания
  reminder_repeat: ReminderRepeat; // 'once' | 'daily' | 'weekly' | 'monthly'
  /** Дни недели недельного повтора: 1 = Пн … 7 = Вс (номера ISO 8601, в UTC
   *  отсчёте `reminder_at`). Пустой массив для остальных типов. */
  reminder_weekdays: number[];
  /** Числа месяца месячного повтора: 1..31 (в UTC-отсчёте `reminder_at`).
   *  Месяц, в котором выбранного числа нет (31 февраля), пропускается.
   *  Пустой массив для остальных типов. */
  reminder_month_days: number[];
}

export type ReminderRepeat = 'once' | 'daily' | 'weekly' | 'monthly';

export interface Folder {
  id: number;
  topic_id: number;
  parent_folder_id: number | null; // null — папка в корне топика
  name: string;
}

/** Запись журнала «пришедших уведомлений» (сработавшие напоминания). */
export interface NotificationItem {
  id: number;
  note_id: number; // заметка, на которую сработало напоминание
  text: string; // снапшот текста заметки на момент срабатывания
  fired_at: string; // ISO 8601 (UTC)
  read: boolean;
}

/** Тело ответа auth-эндпоинтов: `{ user: ... }` */
export interface UserResponse {
  user: User;
}
