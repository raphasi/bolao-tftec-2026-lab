import { Link } from 'react-router-dom';
import { Sparkles, Medal, Target, LayoutGrid } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { useAuth } from '@/contexts/AuthContext';
import { FlagMarquee } from '@/components/copa/FlagMarquee';
import { MascotesShowcase } from '@/components/copa/MascotesShowcase';
import { WorldCupTrophy } from '@/components/icons/WorldCupTrophy';
import { SoccerBall } from '@/components/icons/SoccerBall';

export default function Home() {
  const { isAuthenticated, user } = useAuth();

  return (
    <div className="space-y-12 animate-fade-in">
      {/* Marquee de bandeiras — alma da Copa */}
      <FlagMarquee className="mt-2" />

      {/* Hero */}
      <section className="relative text-center py-16 md:py-24 overflow-hidden rounded-2xl bg-tftec-radial">
        {/* Decoração: taça FIFA real flutuando à esquerda */}
        <img
          src="/copa/taca.webp"
          alt=""
          aria-hidden
          loading="lazy"
          decoding="async"
          className="absolute -top-4 -left-8 h-44 w-auto opacity-[0.07] -rotate-12 pointer-events-none hidden md:block"
        />
        {/* Decoração: bola adidas Trionda flutuando à direita (grayscale + opacity p/ não poluir paleta TFTEC) */}
        <img
          src="/copa/bola.webp"
          alt=""
          aria-hidden
          loading="lazy"
          decoding="async"
          className="absolute -bottom-10 -right-10 h-52 w-auto opacity-[0.12] rotate-12 pointer-events-none hidden md:block [filter:grayscale(60%)]"
        />

        <div className="relative z-10 max-w-3xl mx-auto px-4">
          <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-primary/10 border border-primary/30 backdrop-blur mb-6">
            <Sparkles className="h-3.5 w-3.5 text-brand-magenta" />
            <span className="text-xs font-medium tracking-wide">TFTEC Prime · Edição 2026</span>
          </div>

          <h1 className="font-display text-5xl md:text-7xl font-bold tracking-tight mb-4">
            Bolão <span className="text-brand-gradient">TFTEC Prime</span>
          </h1>

          <p className="text-lg md:text-xl text-muted-foreground mb-6 max-w-2xl mx-auto">
            Palpite jogo a jogo na <span className="text-foreground font-medium">FIFA World Cup 2026</span>.
            Dispute o leaderboard ao vivo com seus colegas de turma.
          </p>

          {/* Stats da Copa em linha */}
          <div className="flex flex-wrap items-center justify-center gap-x-6 gap-y-2 mb-8 text-sm">
            <div className="inline-flex items-center gap-2">
              <span className="font-display text-2xl font-bold text-copa-gold">48</span>
              <span className="text-muted-foreground">seleções</span>
            </div>
            <div className="h-4 w-px bg-border" aria-hidden />
            <div className="inline-flex items-center gap-2">
              <span className="font-display text-2xl font-bold text-copa-pitch">72</span>
              <span className="text-muted-foreground">jogos na fase de grupos</span>
            </div>
            <div className="h-4 w-px bg-border" aria-hidden />
            <div className="inline-flex items-center gap-2">
              <span className="font-display text-2xl font-bold text-brand-magenta">1</span>
              <span className="text-muted-foreground">campeão</span>
            </div>
          </div>

          <div className="flex flex-col sm:flex-row gap-3 justify-center">
            {isAuthenticated ? (
              <>
                <Link to="/palpites">
                  <Button size="lg" className="gap-2 bg-tftec-gradient text-primary-foreground hover:opacity-90 border-0 shadow-brand-glow">
                    <SoccerBall className="h-5 w-5" />
                    Fazer palpites
                  </Button>
                </Link>
                <Link to="/leaderboard">
                  <Button size="lg" variant="outline">
                    Ver leaderboard
                  </Button>
                </Link>
              </>
            ) : (
              <>
                <Link to="/register">
                  <Button size="lg" className="bg-tftec-gradient text-primary-foreground hover:opacity-90 border-0 shadow-brand-glow-lg">
                    Criar conta grátis
                  </Button>
                </Link>
                <Link to="/login">
                  <Button size="lg" variant="outline">
                    Já tenho conta
                  </Button>
                </Link>
              </>
            )}
          </div>

          <div className="mt-5">
            <Link
              to="/tabela"
              className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
            >
              <LayoutGrid className="h-4 w-4 text-copa-gold" />
              Acompanhe a <span className="font-medium text-foreground">Tabela da Copa</span> ao vivo →
            </Link>
          </div>

          {isAuthenticated && user && (
            <p className="mt-8 text-sm text-muted-foreground">
              Olá, <span className="font-medium text-foreground">{user.name}</span>! Bom palpite. ⚽
            </p>
          )}
        </div>
      </section>

      {/* Mascotes oficiais da Copa 2026 — seção dedicada (cores Copa isoladas, sem poluir paleta TFTEC) */}
      <MascotesShowcase />

      {/* Features com ícones semânticos copa */}
      <section className="grid md:grid-cols-3 gap-6">
        <Card className="border-border/60 hover:border-copa-pitch/50 transition-colors">
          <CardContent className="pt-6 space-y-3">
            <div className="h-12 w-12 rounded-xl bg-copa-pitch/10 flex items-center justify-center ring-1 ring-copa-pitch/20">
              <SoccerBall className="h-7 w-7 text-copa-pitch" />
            </div>
            <h3 className="font-display text-xl font-semibold">Palpite jogo a jogo</h3>
            <p className="text-sm text-muted-foreground">
              72 jogos da fase de grupos. Palpite até o apito inicial — depois disso o palpite trava.
            </p>
          </CardContent>
        </Card>

        <Card className="border-border/60 hover:border-copa-gold/50 transition-colors">
          <CardContent className="pt-6 space-y-3">
            <div className="h-12 w-12 rounded-xl bg-copa-gold/10 flex items-center justify-center ring-1 ring-copa-gold/20">
              <WorldCupTrophy className="h-7 w-7 text-copa-gold" />
            </div>
            <h3 className="font-display text-xl font-semibold">Palpites especiais</h3>
            <p className="text-sm text-muted-foreground">
              Campeão, top 4 e artilheiro valem pontos extras. Acertar o top 4 inteiro: bônus.
            </p>
          </CardContent>
        </Card>

        <Card className="border-border/60 hover:border-brand-purple/50 transition-colors">
          <CardContent className="pt-6 space-y-3">
            <div className="h-12 w-12 rounded-xl bg-brand-magenta/10 flex items-center justify-center ring-1 ring-brand-magenta/20">
              <Medal className="h-7 w-7 text-brand-magenta" />
            </div>
            <h3 className="font-display text-xl font-semibold">Leaderboard ao vivo</h3>
            <p className="text-sm text-muted-foreground">
              A cada resultado lançado, sua posição atualiza instantaneamente via WebSocket.
            </p>
          </CardContent>
        </Card>
      </section>

      {/* Scoring */}
      <section className="rounded-2xl border border-border/60 bg-card/50 backdrop-blur p-6 md:p-10">
        <div className="text-center mb-8">
          <h2 className="font-display text-3xl md:text-4xl font-bold mb-2">
            Como <span className="text-brand-gradient">pontuar</span>
          </h2>
          <p className="text-muted-foreground">Pontuação balanceada — consistência vence o palpite sortudo</p>
        </div>

        <div className="grid sm:grid-cols-2 md:grid-cols-4 gap-4 text-sm">
          <div className="rounded-xl bg-secondary/30 p-4 text-center ring-1 ring-copa-pitch/20">
            <div className="h-12 flex items-center justify-center mb-2">
              <SoccerBall className="h-6 w-6 text-copa-pitch" />
            </div>
            <div className="font-display text-4xl font-bold text-copa-pitch mb-1">25</div>
            <div className="text-xs text-muted-foreground uppercase tracking-wider">Placar exato</div>
          </div>
          <div className="rounded-xl bg-secondary/30 p-4 text-center ring-1 ring-primary/20">
            <div className="h-12 flex items-center justify-center mb-2">
              <Target className="h-6 w-6 text-primary" />
            </div>
            <div className="font-display text-4xl font-bold text-primary mb-1">15</div>
            <div className="text-xs text-muted-foreground uppercase tracking-wider">Vencedor ou empate</div>
          </div>
          <div className="rounded-xl bg-secondary/30 p-4 text-center ring-1 ring-copa-gold/20">
            <div className="h-12 flex items-center justify-center mb-2">
              <img
                src="/copa/taca.webp"
                alt="Taça FIFA World Cup"
                loading="lazy"
                decoding="async"
                className="h-12 w-auto"
              />
            </div>
            <div className="font-display text-4xl font-bold text-copa-gold mb-1">150</div>
            <div className="text-xs text-muted-foreground uppercase tracking-wider">Campeão</div>
          </div>
          <div className="rounded-xl bg-secondary/30 p-4 text-center ring-1 ring-brand-magenta/20">
            <div className="h-12 flex items-center justify-center mb-2">
              <Medal className="h-6 w-6 text-brand-magenta" />
            </div>
            <div className="font-display text-4xl font-bold text-brand-magenta mb-1">120</div>
            <div className="text-xs text-muted-foreground uppercase tracking-wider">Artilheiro</div>
          </div>
        </div>
      </section>
    </div>
  );
}
