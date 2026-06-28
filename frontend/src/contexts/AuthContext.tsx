import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import {
  getMe,
  login as apiLogin,
  register as apiRegister,
  type AuthUser,
  type LoginInput,
  type RegisterInput,
} from '@/lib/auth-api';
import { getAuthToken, setAuthToken } from '@/lib/api';

interface AuthContextValue {
  user: AuthUser | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  login: (input: LoginInput) => Promise<void>;
  register: (input: RegisterInput) => Promise<void>;
  logout: () => void;
  refresh: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // Hidrata estado a partir do token salvo (se houver) chamando /api/auth/me
  const refresh = useCallback(async () => {
    const token = getAuthToken();
    if (!token) {
      setUser(null);
      setIsLoading(false);
      return;
    }
    try {
      const { user: me } = await getMe();
      setUser(me);
    } catch {
      setAuthToken(null);
      setUser(null);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();

    // Reage a 401 emitido pelo interceptor do axios
    const onUnauth = () => {
      setUser(null);
    };
    window.addEventListener('auth:unauthorized', onUnauth);
    return () => window.removeEventListener('auth:unauthorized', onUnauth);
  }, [refresh]);

  const login = useCallback(async (input: LoginInput) => {
    const { token, user: loggedUser } = await apiLogin(input);
    setAuthToken(token);
    setUser(loggedUser);
  }, []);

  const register = useCallback(async (input: RegisterInput) => {
    const { token, user: createdUser } = await apiRegister(input);
    setAuthToken(token);
    setUser(createdUser);
  }, []);

  const logout = useCallback(() => {
    setAuthToken(null);
    setUser(null);
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      isAuthenticated: user !== null,
      isLoading,
      login,
      register,
      logout,
      refresh,
    }),
    [user, isLoading, login, register, logout, refresh],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error('useAuth deve ser usado dentro de <AuthProvider>');
  }
  return ctx;
}
