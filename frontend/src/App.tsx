import { lazy, Suspense } from 'react';
import { BrowserRouter, Route, Routes } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ReactQueryDevtools } from '@tanstack/react-query-devtools';
import { Loader2 } from 'lucide-react';
import { Toaster } from 'sonner';

import { AuthProvider } from '@/contexts/AuthContext';
import { Layout } from '@/components/layout/Layout';
import { ProtectedRoute } from '@/components/layout/ProtectedRoute';
import { PWAUpdatePrompt } from '@/components/layout/PWAUpdatePrompt';
import Home from '@/pages/Home';

// Páginas autenticadas: lazy para reduzir bundle inicial
const Login = lazy(() => import('@/pages/Login'));
const Register = lazy(() => import('@/pages/Register'));
const Palpites = lazy(() => import('@/pages/Palpites'));
const Especiais = lazy(() => import('@/pages/Especiais'));
const Leaderboard = lazy(() => import('@/pages/Leaderboard'));
const TabelaCopa = lazy(() => import('@/pages/TabelaCopa'));
const Perfil = lazy(() => import('@/pages/Perfil'));
const AdminConfig = lazy(() => import('@/pages/AdminConfig'));
const AdminResults = lazy(() => import('@/pages/AdminResults'));
const AdminBracket = lazy(() => import('@/pages/AdminBracket'));
const Admin = lazy(() => import('@/pages/Admin'));
const AdminUsers = lazy(() => import('@/pages/AdminUsers'));
const AdminAudit = lazy(() => import('@/pages/AdminAudit'));
const AdminSystem = lazy(() => import('@/pages/AdminSystem'));
const AdminOps = lazy(() => import('@/pages/AdminOps'));
const Regras = lazy(() => import('@/pages/Regras'));
const NotFound = lazy(() => import('@/pages/NotFound'));

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 60_000,         // 1 min — palpites/leaderboard mudam frequentemente
      gcTime: 5 * 60_000,        // 5 min de cache em memória
      refetchOnWindowFocus: false,
      retry: 1,
    },
  },
});

function PageLoader() {
  return (
    <div className="flex items-center justify-center py-24">
      <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
    </div>
  );
}

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <BrowserRouter>
          <Layout>
            <Suspense fallback={<PageLoader />}>
              <Routes>
                <Route path="/" element={<Home />} />
                <Route path="/login" element={<Login />} />
                <Route path="/register" element={<Register />} />
                <Route path="/leaderboard" element={<Leaderboard />} />
                <Route path="/tabela" element={<TabelaCopa />} />
                <Route path="/regras" element={<Regras />} />
                <Route
                  path="/palpites"
                  element={
                    <ProtectedRoute>
                      <Palpites />
                    </ProtectedRoute>
                  }
                />
                <Route
                  path="/especiais"
                  element={
                    <ProtectedRoute>
                      <Especiais />
                    </ProtectedRoute>
                  }
                />
                <Route
                  path="/perfil"
                  element={
                    <ProtectedRoute>
                      <Perfil />
                    </ProtectedRoute>
                  }
                />
                <Route
                  path="/admin"
                  element={
                    <ProtectedRoute adminOnly>
                      <Admin />
                    </ProtectedRoute>
                  }
                />
                <Route
                  path="/admin/users"
                  element={
                    <ProtectedRoute adminOnly>
                      <AdminUsers />
                    </ProtectedRoute>
                  }
                />
                <Route
                  path="/admin/audit"
                  element={
                    <ProtectedRoute adminOnly>
                      <AdminAudit />
                    </ProtectedRoute>
                  }
                />
                <Route
                  path="/admin/system"
                  element={
                    <ProtectedRoute adminOnly>
                      <AdminSystem />
                    </ProtectedRoute>
                  }
                />
                <Route
                  path="/admin/config"
                  element={
                    <ProtectedRoute adminOnly>
                      <AdminConfig />
                    </ProtectedRoute>
                  }
                />
                <Route
                  path="/admin/results"
                  element={
                    <ProtectedRoute adminOnly>
                      <AdminResults />
                    </ProtectedRoute>
                  }
                />
                <Route
                  path="/admin/bracket"
                  element={
                    <ProtectedRoute adminOnly>
                      <AdminBracket />
                    </ProtectedRoute>
                  }
                />
                <Route
                  path="/admin/ops"
                  element={
                    <ProtectedRoute adminOnly>
                      <AdminOps />
                    </ProtectedRoute>
                  }
                />
                <Route path="*" element={<NotFound />} />
              </Routes>
            </Suspense>
          </Layout>
        </BrowserRouter>
        <Toaster richColors position="top-right" />
        <PWAUpdatePrompt />
        {import.meta.env.DEV && <ReactQueryDevtools initialIsOpen={false} />}
      </AuthProvider>
    </QueryClientProvider>
  );
}
