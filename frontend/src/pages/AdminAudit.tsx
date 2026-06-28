/**
 * Página Admin · Auditoria global.
 * Lista TODAS as entradas do audit-log (não só por usuário), incluindo ações
 * operacionais do evento: resultado de jogo, trava, liberação de fase, especiais
 * e resultado final. Filtros por tipo de alvo + paginação "carregar mais".
 */
import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { History, Loader2, ShieldCheck } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import {
  listAuditLog,
  AUDIT_ACTION_LABELS,
  formatAuditValue,
  type AuditLogEntry,
  type AuditTargetType,
} from '@/lib/admin-api';
import { getErrorMessage } from '@/lib/api';

type TargetFilter = 'all' | AuditTargetType;

const FILTERS: { key: TargetFilter; label: string }[] = [
  { key: 'all', label: 'Tudo' },
  { key: 'match', label: 'Jogos' },
  { key: 'prediction', label: 'Palpites' },
  { key: 'special', label: 'Especiais' },
  { key: 'config', label: 'Configuração' },
  { key: 'user', label: 'Usuários' },
];

const PAGE_SIZE = 50;

export default function AdminAudit() {
  const [filter, setFilter] = useState<TargetFilter>('all');
  const [page, setPage] = useState(1);

  // Mantém páginas anteriores acumuladas ao "carregar mais".
  const query = useQuery({
    queryKey: ['admin', 'audit-global', filter, page],
    queryFn: () =>
      listAuditLog({
        page,
        pageSize: PAGE_SIZE,
        ...(filter !== 'all' ? { targetType: filter } : {}),
      }),
    placeholderData: (prev) => prev,
  });

  const entries = query.data?.entries ?? [];

  function changeFilter(next: TargetFilter) {
    setFilter(next);
    setPage(1);
  }

  return (
    <div className="space-y-6 animate-fade-in">
      <header className="flex items-center gap-4">
        <div className="h-12 w-12 rounded-xl bg-brand-purple/15 flex items-center justify-center ring-1 ring-brand-purple/30">
          <ShieldCheck className="h-7 w-7 text-brand-purple" />
        </div>
        <div>
          <h1 className="font-display text-3xl md:text-4xl font-bold">Auditoria</h1>
          <p className="text-muted-foreground mt-1">
            Histórico de todas as ações administrativas — quem fez, quando e o que mudou.
          </p>
        </div>
      </header>

      <div className="flex flex-wrap gap-2">
        {FILTERS.map(({ key, label }) => (
          <button
            key={key}
            type="button"
            onClick={() => changeFilter(key)}
            className={`px-3 py-1.5 rounded-full text-sm font-medium ring-1 transition-colors ${
              filter === key
                ? 'bg-brand-purple/15 text-brand-purple ring-brand-purple/40'
                : 'text-muted-foreground ring-border/60 hover:text-foreground'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      <Card>
        <CardContent className="pt-6">
          {query.isLoading && (
            <div className="flex justify-center py-12">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          )}
          {query.isError && (
            <div className="text-sm text-destructive py-4">{getErrorMessage(query.error)}</div>
          )}
          {query.data && entries.length === 0 && (
            <div className="flex flex-col items-center gap-2 py-12 text-muted-foreground">
              <History className="h-8 w-8 opacity-50" />
              <span className="text-sm">Nenhuma entrada de auditoria neste filtro.</span>
            </div>
          )}
          {entries.length > 0 && (
            <div className="space-y-2">
              {entries.map((e) => (
                <AuditRow key={e.id} entry={e} />
              ))}
            </div>
          )}

          {query.data?.hasMore && (
            <div className="flex justify-center pt-4">
              <button
                type="button"
                onClick={() => setPage((p) => p + 1)}
                disabled={query.isFetching}
                className="px-4 py-2 rounded-md text-sm font-medium ring-1 ring-border/60 hover:bg-muted/50 disabled:opacity-50"
              >
                {query.isFetching ? 'Carregando…' : 'Carregar mais'}
              </button>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function targetText(entry: AuditLogEntry): string {
  return entry.targetLabel ?? entry.targetEmail ?? entry.targetId ?? '—';
}

function AuditRow({ entry }: { entry: AuditLogEntry }) {
  const date = new Date(entry.timestamp).toLocaleString('pt-BR');
  return (
    <div className="border border-border/60 rounded-md p-3 text-xs space-y-1">
      <div className="flex items-center justify-between gap-2">
        <span className="font-medium text-foreground">
          {AUDIT_ACTION_LABELS[entry.action] ?? entry.action}
        </span>
        <span className="text-muted-foreground shrink-0">{date}</span>
      </div>
      <div className="text-muted-foreground">
        Alvo: <span className="font-medium text-foreground/90">{targetText(entry)}</span>
      </div>
      <div className="text-muted-foreground">
        Por: <span className="font-mono">{entry.performedByEmail}</span>
      </div>
      <div className="font-mono break-all">
        <span className="line-through text-muted-foreground">
          {formatAuditValue(entry.previousValue)}
        </span>
        {' → '}
        <span className="text-foreground">{formatAuditValue(entry.newValue)}</span>
      </div>
      {entry.reason && <div className="text-muted-foreground italic">"{entry.reason}"</div>}
    </div>
  );
}
