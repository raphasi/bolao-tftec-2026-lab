import { useState } from 'react';
import { Link, NavLink } from 'react-router-dom';
import { LogOut, Target, Star, BarChart3, BookOpen, LayoutGrid, User as UserIcon, ShieldCheck, Menu, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { TftecCopaLogo } from '@/components/copa/TftecCopaLogo';
import { useAuth } from '@/contexts/AuthContext';
import { cn } from '@/lib/utils';

interface NavLinkItem {
  to: string;
  label: string;
  icon: typeof Target;
  protected: boolean;
  adminOnly?: boolean;
}

const navLinks: NavLinkItem[] = [
  { to: '/palpites', label: 'Palpites', icon: Target, protected: true },
  { to: '/especiais', label: 'Especiais', icon: Star, protected: true },
  { to: '/tabela', label: 'Tabela da Copa', icon: LayoutGrid, protected: false },
  { to: '/leaderboard', label: 'Leaderboard', icon: BarChart3, protected: false },
  { to: '/regras', label: 'Regras', icon: BookOpen, protected: false },
  { to: '/admin', label: 'Admin', icon: ShieldCheck, protected: true, adminOnly: true },
];

// Estilo compartilhado dos itens (desktop e mobile usam variações).
const itemClass = (isActive: boolean) =>
  cn(
    'flex items-center gap-2 rounded-md px-3 py-2 text-sm font-medium transition-all',
    isActive
      ? 'bg-primary/15 text-foreground'
      : 'text-muted-foreground hover:text-foreground hover:bg-secondary/40',
  );

export function Navbar() {
  const { user, isAuthenticated, logout } = useAuth();
  const [mobileOpen, setMobileOpen] = useState(false);

  // Links visíveis (filtro de auth/admin) — reusado no desktop e no mobile.
  const visibleLinks = navLinks
    .filter((link) => !link.protected || isAuthenticated)
    .filter((link) => !link.adminOnly || user?.role === 'admin');

  const closeMobile = () => setMobileOpen(false);

  return (
    <header className="sticky top-0 z-40 w-full border-b border-border/60 bg-background/80 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      <div className="container flex h-16 items-center justify-between">
        <Link to="/" className="flex items-center gap-3 group" onClick={closeMobile}>
          <TftecCopaLogo size="md" className="transition-transform duration-300 group-hover:scale-110" />
          <div className="hidden sm:block">
            <div className="font-display font-bold text-base leading-tight">
              Bolão <span className="text-brand-gradient">TFTEC</span>
            </div>
            <div className="text-[10px] text-muted-foreground leading-tight tracking-wider uppercase">
              FIFA World Cup 2026
            </div>
          </div>
        </Link>

        <nav className="hidden md:flex items-center gap-1">
          {visibleLinks.map(({ to, label, icon: Icon }) => (
            <NavLink key={to} to={to} className={({ isActive }) => itemClass(isActive)}>
              <Icon className="h-4 w-4" />
              {label}
            </NavLink>
          ))}
        </nav>

        <div className="flex items-center gap-2">
          {isAuthenticated && user ? (
            <>
              <Link to="/perfil" className="hidden sm:flex">
                <Button variant="ghost" size="sm" className="gap-2">
                  <UserIcon className="h-4 w-4" />
                  <span className="max-w-[120px] truncate">{user.name}</span>
                </Button>
              </Link>
              <Button variant="ghost" size="icon" onClick={logout} title="Sair" className="hidden md:inline-flex">
                <LogOut className="h-4 w-4" />
              </Button>
            </>
          ) : (
            <>
              <Link to="/login">
                <Button variant="ghost" size="sm">
                  Entrar
                </Button>
              </Link>
              <Link to="/register" className="hidden sm:inline-flex">
                <Button size="sm" className="bg-tftec-gradient text-primary-foreground hover:opacity-90 border-0">
                  Cadastrar
                </Button>
              </Link>
            </>
          )}

          {/* Hambúrguer — só no mobile (<md). Dá acesso a Especiais/Regras/Perfil/Sair
              que ficavam inacessíveis no celular (device dominante dos alunos). */}
          <Button
            variant="ghost"
            size="icon"
            className="md:hidden"
            onClick={() => setMobileOpen((o) => !o)}
            aria-label={mobileOpen ? 'Fechar menu' : 'Abrir menu'}
            aria-expanded={mobileOpen}
          >
            {mobileOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </Button>
        </div>
      </div>

      {/* Painel mobile (drawer simples por estado — sem dependência nova). */}
      {mobileOpen && (
        <nav className="md:hidden border-t border-border/60 bg-background/95 backdrop-blur">
          <div className="container flex flex-col gap-1 py-3">
            {visibleLinks.map(({ to, label, icon: Icon }) => (
              <NavLink
                key={to}
                to={to}
                onClick={closeMobile}
                className={({ isActive }) => cn(itemClass(isActive), 'py-2.5')}
              >
                <Icon className="h-4 w-4" />
                {label}
              </NavLink>
            ))}

            {isAuthenticated && user ? (
              <>
                <div className="my-1 h-px bg-border/60" />
                <NavLink
                  to="/perfil"
                  onClick={closeMobile}
                  className={({ isActive }) => cn(itemClass(isActive), 'py-2.5')}
                >
                  <UserIcon className="h-4 w-4" />
                  <span className="truncate">{user.name}</span>
                </NavLink>
                <button
                  type="button"
                  onClick={() => {
                    closeMobile();
                    logout();
                  }}
                  className={cn(itemClass(false), 'py-2.5 text-left')}
                >
                  <LogOut className="h-4 w-4" />
                  Sair
                </button>
              </>
            ) : (
              <>
                <div className="my-1 h-px bg-border/60" />
                <Link to="/register" onClick={closeMobile} className={cn(itemClass(false), 'py-2.5')}>
                  <UserIcon className="h-4 w-4" />
                  Cadastrar
                </Link>
              </>
            )}
          </div>
        </nav>
      )}
    </header>
  );
}
