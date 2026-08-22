// Ошибка API: HTTP-статус + текст из тела `{"error": "..."}`.
export class ApiError extends Error {
  readonly status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
  }
}
