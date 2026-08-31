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
  topic_id: number;
  folder_id: number | null; // null — в корне топика
}

export interface Folder {
  id: number;
  topic_id: number;
  parent_folder_id: number | null; // null — папка в корне топика
  name: string;
}

/** Тело ответа auth-эндпоинтов: `{ user: ... }` */
export interface UserResponse {
  user: User;
}
