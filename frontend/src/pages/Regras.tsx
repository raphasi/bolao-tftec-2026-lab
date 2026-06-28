/**
 * Página /regras — explicação completa da pontuação do bolão.
 * Pública (não exige auth) — todos veem as regras antes mesmo de se cadastrar.
 *
 * Source of truth: functions/src/shared/scoring.ts
 */
import { BookOpen, Crown, Target, Trophy, Users } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { cn } from '@/lib/utils';

interface ExampleRow {
  predicted: string;
  actual: string;
  points: number;
  label: string;
}

const MATCH_EXAMPLES: ExampleRow[] = [
  { predicted: '2-1', actual: '2-1', points: 25, label: 'Placar exato' },
  { predicted: '3-0', actual: '3-0', points: 25, label: 'Placar exato' },
  { predicted: '2-1', actual: '3-0', points: 15, label: 'Acertou o vencedor (sem o placar)' },
  { predicted: '0-0', actual: '1-1', points: 15, label: 'Acertou o empate (sem o placar)' },
  { predicted: '2-1', actual: '1-2', points: 0, label: 'Errou o vencedor' },
  { predicted: '0-0', actual: '2-1', points: 0, label: 'Errou o empate' },
];

export default function Regras() {
  return (
    <div className="space-y-8 animate-fade-in max-w-3xl">
      {/* Header */}
      <header className="flex items-center gap-4">
        <div className="h-12 w-12 rounded-xl bg-brand-purple/15 flex items-center justify-center ring-1 ring-brand-purple/30">
          <BookOpen className="h-7 w-7 text-brand-purple" />
        </div>
        <div>
          <h1 className="font-display text-3xl md:text-4xl font-bold">Regras de pontuação</h1>
          <p className="text-muted-foreground mt-1">
            Como funcionam os pontos no Bolão TFTEC FIFA World Cup 2026.
          </p>
        </div>
      </header>

      {/* Seção 1: Palpites por jogo */}
      <section className="space-y-3">
        <h2 className="font-display text-xl font-semibold flex items-center gap-2">
          <Target className="h-5 w-5 text-emerald-500" />
          Palpites por jogo
        </h2>
        <Card>
          <CardContent className="p-6 space-y-4">
            <p className="text-sm text-muted-foreground">
              Cada um dos <strong>72 jogos da fase de grupos</strong> vale até <strong>25 pontos</strong>.
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <ScoreCard
                points={25}
                label="Placar exato"
                description="Acertou o placar de ambos os times"
                color="gold"
              />
              <ScoreCard
                points={15}
                label="Vencedor ou empate"
                description="Acertou quem ganhou (ou o empate), sem acertar os gols"
                color="emerald"
              />
              <ScoreCard
                points={0}
                label="Errou"
                description="Não acertou vencedor nem placar"
                color="muted"
              />
            </div>

            {/* Tabela de exemplos */}
            <div className="border-t pt-4">
              <h3 className="text-sm font-semibold mb-2">Exemplos</h3>
              <table className="w-full text-sm">
                <thead className="text-xs uppercase text-muted-foreground">
                  <tr>
                    <th className="text-left py-2">Palpite</th>
                    <th className="text-left py-2">Real</th>
                    <th className="text-left py-2">Caso</th>
                    <th className="text-right py-2">Pontos</th>
                  </tr>
                </thead>
                <tbody>
                  {MATCH_EXAMPLES.map((ex, i) => {
                    const ptsColor =
                      ex.points === 25 ? 'text-copa-gold' : ex.points > 0 ? 'text-emerald-500' : 'text-muted-foreground';
                    return (
                      <tr key={i} className="border-t border-border/40">
                        <td className="py-2 font-mono">{ex.predicted}</td>
                        <td className="py-2 font-mono">{ex.actual}</td>
                        <td className="py-2 text-xs">{ex.label}</td>
                        <td className={cn('py-2 text-right font-display font-bold', ptsColor)}>
                          +{ex.points}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      </section>

      {/* Seção 2: Palpites especiais */}
      <section className="space-y-3">
        <h2 className="font-display text-xl font-semibold flex items-center gap-2">
          <Crown className="h-5 w-5 text-copa-gold" />
          Palpites especiais
        </h2>
        <Card>
          <CardContent className="p-6 space-y-4">
            <p className="text-sm text-muted-foreground">
              Antes da Copa começar, você palpita o <strong>top 4 do torneio</strong> e o{' '}
              <strong>artilheiro</strong>. Total máximo: <strong>475 pontos</strong>.
            </p>
            <table className="w-full text-sm">
              <thead className="text-xs uppercase text-muted-foreground">
                <tr>
                  <th className="text-left py-2">Item</th>
                  <th className="text-left py-2 hidden sm:table-cell">Como acertar</th>
                  <th className="text-right py-2">Pontos</th>
                </tr>
              </thead>
              <tbody>
                <tr className="border-t border-border/40">
                  <td className="py-2 font-medium">🥇 Campeão</td>
                  <td className="py-2 text-xs text-muted-foreground hidden sm:table-cell">Seleção exata</td>
                  <td className="py-2 text-right font-display font-bold text-copa-gold">+150</td>
                </tr>
                <tr className="border-t border-border/40">
                  <td className="py-2 font-medium">🥈 Vice-campeão</td>
                  <td className="py-2 text-xs text-muted-foreground hidden sm:table-cell">Seleção exata</td>
                  <td className="py-2 text-right font-display font-bold text-copa-gold">+75</td>
                </tr>
                <tr className="border-t border-border/40">
                  <td className="py-2 font-medium">🥉 Terceiro lugar</td>
                  <td className="py-2 text-xs text-muted-foreground hidden sm:table-cell">Seleção exata</td>
                  <td className="py-2 text-right font-display font-bold text-copa-gold">+40</td>
                </tr>
                <tr className="border-t border-border/40">
                  <td className="py-2 font-medium">Quarto lugar</td>
                  <td className="py-2 text-xs text-muted-foreground hidden sm:table-cell">Seleção exata</td>
                  <td className="py-2 text-right font-display font-bold text-copa-gold">+40</td>
                </tr>
                <tr className="border-t border-border/40">
                  <td className="py-2 font-medium">⚽ Artilheiro</td>
                  <td className="py-2 text-xs text-muted-foreground hidden sm:table-cell">Nome exato (sem acentos)</td>
                  <td className="py-2 text-right font-display font-bold text-copa-gold">+120</td>
                </tr>
                <tr className="border-t border-border/40 bg-amber-500/5">
                  <td className="py-2 font-medium">🎁 Bonus Top 4</td>
                  <td className="py-2 text-xs text-muted-foreground hidden sm:table-cell">
                    4 seleções top4 em qualquer ordem
                  </td>
                  <td className="py-2 text-right font-display font-bold text-amber-500">+50</td>
                </tr>
              </tbody>
            </table>
            <div className="bg-secondary/40 rounded-md p-3 text-xs text-muted-foreground">
              <strong className="text-foreground">Observação:</strong> O <strong>bonus de 50 pts</strong>{' '}
              é cumulativo com os pontos individuais — se você acertar campeão+vice+3º+4º exatos,
              ganha 150+75+40+40 (individuais) <strong>+50 (bonus)</strong> = 355 pts dos top4.
            </div>
          </CardContent>
        </Card>
      </section>

      {/* Seção 3: Quando os pontos são calculados */}
      <section className="space-y-3">
        <h2 className="font-display text-xl font-semibold flex items-center gap-2">
          <Trophy className="h-5 w-5 text-emerald-500" />
          Quando os pontos aparecem
        </h2>
        <Card>
          <CardContent className="p-6 space-y-3 text-sm">
            <p>
              <strong>Jogos:</strong> os pontos do seu palpite são calculados automaticamente assim
              que o administrador registra o placar oficial do jogo (geralmente em ~10 segundos
              após o término).
            </p>
            <p>
              <strong>Especiais:</strong> calculados apenas no final do torneio, quando o
              administrador registra o resultado oficial (campeão, top 4 e artilheiro).
            </p>
            <p>
              <strong>Empate na pontuação total:</strong> entre dois jogadores com o mesmo total,
              o critério de desempate é (1) maior número de placares exatos, (2) maior pontuação
              dos especiais.
            </p>
          </CardContent>
        </Card>
      </section>

      {/* Seção 4: Transparência */}
      <section className="space-y-3">
        <h2 className="font-display text-xl font-semibold flex items-center gap-2">
          <Users className="h-5 w-5 text-brand-purple" />
          Transparência
        </h2>
        <Card>
          <CardContent className="p-6 space-y-3 text-sm">
            <p>
              No <strong>Leaderboard</strong>, você pode clicar em <strong>qualquer participante</strong>{' '}
              para ver os palpites dele em jogos já encerrados — quais placares ele palpitou, quais foram os placares reais,
              e quantos pontos ganhou em cada jogo.
            </p>
            <p className="text-muted-foreground text-xs">
              Palpites de jogos ainda não encerrados ficam privados — só você vê os seus.
            </p>
          </CardContent>
        </Card>
      </section>
    </div>
  );
}

// ───────────────────────────────────────────────────────────────────────────
// Helpers
// ───────────────────────────────────────────────────────────────────────────

function ScoreCard({
  points,
  label,
  description,
  color,
}: {
  points: number;
  label: string;
  description: string;
  color: 'gold' | 'emerald' | 'muted';
}) {
  const colorMap = {
    gold: 'ring-copa-gold/40 bg-copa-gold/5 text-copa-gold',
    emerald: 'ring-emerald-500/40 bg-emerald-500/5 text-emerald-500',
    muted: 'ring-muted-foreground/30 bg-muted/40 text-muted-foreground',
  };
  return (
    <div className={cn('rounded-lg ring-1 p-4 text-center', colorMap[color])}>
      <div className="font-display text-3xl font-bold">+{points}</div>
      <div className="text-sm font-semibold mt-1">{label}</div>
      <div className="text-xs opacity-80 mt-1">{description}</div>
    </div>
  );
}
