import { request } from './client';
import type { User, UserResponse } from '../types/api';

export function register(username: string, password: string): Promise<User> {
  return request<UserResponse>('POST', '/api/v1/auth/register', {
    username,
    password,
  }).then((r) => r.user);
}

export function login(username: string, password: string): Promise<User> {
  return request<UserResponse>('POST', '/api/v1/auth/login', {
    username,
    password,
  }).then((r) => r.user);
}

export function logout(): Promise<void> {
  return request<void>('POST', '/api/v1/auth/logout');
}

export function me(): Promise<User> {
  return request<UserResponse>('GET', '/api/v1/me').then((r) => r.user);
}
