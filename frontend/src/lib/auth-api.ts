/**
 * Funções de API relacionadas a autenticação.
 * Tipos compartilhados entre páginas e AuthContext.
 */
import { api } from './api';

export interface AuthUser {
  userId: string;
  email: string;
  name: string;
  role: 'user' | 'admin';
  createdAt?: string;
}

export interface AuthResponse {
  token: string;
  user: AuthUser;
}

export interface LoginInput {
  email: string;
  password: string;
}

export interface RegisterInput extends LoginInput {
  name: string;
}

export async function login(input: LoginInput): Promise<AuthResponse> {
  const { data } = await api.post<AuthResponse>('/auth/login', input);
  return data;
}

export async function register(input: RegisterInput): Promise<AuthResponse> {
  const { data } = await api.post<AuthResponse>('/auth/register', input);
  return data;
}

export async function getMe(): Promise<{ user: AuthUser }> {
  const { data } = await api.get<{ user: AuthUser }>('/auth/me');
  return data;
}

export interface ChangePasswordInput {
  currentPassword: string;
  newPassword: string;
}

/** Troca a própria senha (autenticado). Backend responde 204. */
export async function changePassword(input: ChangePasswordInput): Promise<void> {
  await api.post('/auth/change-password', input);
}
