/**
 * Cliente HTTP centralizado.
 * - Base URL configurada via VITE_API_BASE_URL (em dev = /api via proxy Vite)
 * - Bearer token injetado automaticamente do localStorage
 * - 401 limpa token e dispara evento para AuthContext fazer logout
 */
import axios, { AxiosError, type InternalAxiosRequestConfig } from 'axios';

const TOKEN_KEY = 'bolao.auth.token';

export const TOKEN_STORAGE_KEY = TOKEN_KEY;

export const api = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL ?? '/api',
  timeout: 15_000,
  headers: {
    'Content-Type': 'application/json',
  },
});

api.interceptors.request.use((config: InternalAxiosRequestConfig) => {
  const token = localStorage.getItem(TOKEN_KEY);
  if (token) {
    config.headers.set('Authorization', `Bearer ${token}`);
  }
  return config;
});

api.interceptors.response.use(
  (response) => response,
  (error: AxiosError) => {
    if (error.response?.status === 401) {
      localStorage.removeItem(TOKEN_KEY);
      // Dispara evento global para o AuthContext reagir
      window.dispatchEvent(new CustomEvent('auth:unauthorized'));
    }
    return Promise.reject(error);
  },
);

export function setAuthToken(token: string | null): void {
  if (token) localStorage.setItem(TOKEN_KEY, token);
  else localStorage.removeItem(TOKEN_KEY);
}

export function getAuthToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}

/**
 * Helper para extrair mensagem de erro padronizada do backend.
 * Backend retorna { error: { code, message, details } }
 */
export function getErrorMessage(err: unknown): string {
  if (err instanceof AxiosError) {
    const data = err.response?.data as { error?: { message?: string } } | undefined;
    return data?.error?.message ?? err.message;
  }
  if (err instanceof Error) return err.message;
  return 'Erro desconhecido';
}
