// Единая точка доступа к REST API.
// В dev используется in-memory мок (mock.ts) с тем же контрактом,
// что и реальный бэкенд; в production — fetch с credentials same-origin.

import { mockRequest } from './mock';
import { ApiError } from './error';

const USE_MOCK =
  import.meta.env.VITE_USE_MOCK === undefined
    ? import.meta.env.DEV
    : import.meta.env.VITE_USE_MOCK === 'true';

let unauthorizedHandler: (() => void) | null = null;

/** Обработчик 401: вызывается при любом запросе, отклонённом по сессии. */
export function setUnauthorizedHandler(handler: (() => void) | null): void {
  unauthorizedHandler = handler;
}

async function fetchRequest<T>(
  method: string,
  path: string,
  body?: unknown,
): Promise<T> {
  let response: Response;
  try {
    response = await fetch(path, {
      method,
      credentials: 'same-origin',
      headers: body === undefined ? undefined : { 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch {
    throw new ApiError(0, 'Нет соединения с сервером');
  }

  if (!response.ok) {
    const message = await readError(response);
    if (response.status === 401) {
      unauthorizedHandler?.();
    }
    throw new ApiError(response.status, message);
  }

  if (response.status === 204) {
    return undefined as T;
  }
  return (await response.json()) as T;
}

async function readError(response: Response): Promise<string> {
  try {
    const data: unknown = await response.json();
    if (
      data !== null &&
      typeof data === 'object' &&
      'error' in data &&
      typeof (data as { error: unknown }).error === 'string'
    ) {
      return (data as { error: string }).error;
    }
  } catch {
    // тело не JSON — игнорируем
  }
  return `Ошибка ${response.status}`;
}

export async function request<T>(
  method: string,
  path: string,
  body?: unknown,
): Promise<T> {
  if (USE_MOCK) {
    return mockRequest<T>(method, path, body);
  }
  return fetchRequest<T>(method, path, body);
}
