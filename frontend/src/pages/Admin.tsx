/**
 * Página Admin landing (S4.5.4) — dashboard inicial pro admin.
 * 4 cards: Usuários, Sistema, Configuração, Resultados.
 */
import { Link } from 'react-router-dom';
import { ArrowRight, Cpu, GitBranch, History, RadioTower, Settings, ShieldCheck, Trophy, Users } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

interface AdminCard {
  to: string;
  title: string;
  description: string;
  icon: typeof Users;
  accent: string;
}

const cards: AdminCard[] = [
  {
    to: '/admin/users',
    title: 'Usuários',
    description: 'Gerencie membros, roles, ativações e veja o audit log.',
    icon: Users,
    accent: 'from-brand-purple/20 to-brand-purple/5 ring-brand-purple/30 text-brand-purple',
  },
  {
    to: '/admin/system',
    title: 'Sistema',
    description: 'KPIs do bolão, status da infraestrutura e cache.',
    icon: Cpu,
    accent: 'from-emerald-500/20 to-emerald-500/5 ring-emerald-500/30 text-emerald-500',
  },
  {
    to: '/admin/config',
    title: 'Configuração',
    description: 'Trava de palpites especiais e configurações do bolão.',
    icon: Settings,
    accent: 'from-blue-500/20 to-blue-500/5 ring-blue-500/30 text-blue-500',
  },
  {
    to: '/admin/results',
    title: 'Resultados',
    description: 'Registrar placares oficiais e fechamento do torneio.',
    icon: Trophy,
    accent: 'from-amber-500/20 to-amber-500/5 ring-amber-500/30 text-amber-500',
  },
  {
    to: '/admin/bracket',
    title: 'Chaveamento',
    description: 'Monta o mata-mata pelas regras oficiais (FIFA 2026); confira, ajuste e confirme os confrontos.',
    icon: GitBranch,
    accent: 'from-copa-gold/20 to-copa-gold/5 ring-copa-gold/30 text-copa-gold',
  },
  {
    to: '/admin/ops',
    title: 'Operação ao Vivo',
    description: 'Dashboard real-time pro dia do evento (refresh 10s). Errors, latency, active match.',
    icon: RadioTower,
    accent: 'from-red-500/20 to-red-500/5 ring-red-500/30 text-red-500',
  },
  {
    to: '/admin/audit',
    title: 'Auditoria',
    description: 'Histórico completo de ações: resultados, travas, liberação de fases e usuários.',
    icon: History,
    accent: 'from-slate-500/20 to-slate-500/5 ring-slate-500/30 text-slate-400',
  },
];

export default function Admin() {
  return (
    <div className="space-y-8 animate-fade-in">
      <header className="flex items-center gap-4">
        <div className="h-12 w-12 rounded-xl bg-brand-purple/15 flex items-center justify-center ring-1 ring-brand-purple/30">
          <ShieldCheck className="h-7 w-7 text-brand-purple" />
        </div>
        <div>
          <h1 className="font-display text-3xl md:text-4xl font-bold">Console Administrativo</h1>
          <p className="text-muted-foreground mt-1">
            Operação e governança do Bolão TFTEC FIFA World Cup 2026.
          </p>
        </div>
      </header>

      <section className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {cards.map(({ to, title, description, icon: Icon, accent }) => (
          <Link key={to} to={to} className="group block">
            <Card className="h-full transition-all duration-300 hover:-translate-y-0.5 hover:shadow-lg hover:shadow-brand-purple/10 border-border/60 group-hover:border-brand-purple/40">
              <CardHeader>
                <div
                  className={`h-12 w-12 rounded-xl bg-gradient-to-br flex items-center justify-center ring-1 ${accent}`}
                >
                  <Icon className="h-6 w-6" />
                </div>
                <CardTitle className="font-display text-xl mt-3 flex items-center justify-between">
                  {title}
                  <ArrowRight className="h-5 w-5 text-muted-foreground opacity-0 -translate-x-1 transition-all group-hover:opacity-100 group-hover:translate-x-0" />
                </CardTitle>
                <CardDescription>{description}</CardDescription>
              </CardHeader>
              <CardContent className="text-sm text-muted-foreground">
                <span className="text-brand-purple font-medium group-hover:underline">
                  Abrir →
                </span>
              </CardContent>
            </Card>
          </Link>
        ))}
      </section>
    </div>
  );
}
