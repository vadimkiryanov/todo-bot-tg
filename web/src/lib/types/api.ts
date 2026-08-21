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

export interface Note {
  id: number;
  text: string;
  priority: Priority;
  done: boolean;
  pinned: boolean;
  created_at: string; // ISO 8601
}

/** Тело ответа auth-эндпоинтов: `{ user: ... }` */
export interface UserResponse {
  user: User;
}
