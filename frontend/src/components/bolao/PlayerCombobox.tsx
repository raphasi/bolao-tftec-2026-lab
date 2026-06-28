/**
 * PlayerCombobox — seleção do artilheiro a partir do catálogo (~1200 jogadores).
 *
 * Input com busca + lista filtrada (sem dependências novas). Guarda o ID do
 * jogador (não o nome) → comparação exata no scoring. Exibe "Nome (Seleção)"
 * com bandeira. Usado no palpite do aluno e no gabarito do admin.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { Check, ChevronsUpDown, Loader2, Search, X } from 'lucide-react';
import { flagUrl } from '@/lib/flags';
import { cn } from '@/lib/utils';
import type { PlayerPublic } from '@/lib/types-domain';

const norm = (s: string) =>
  s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();

const MAX_RESULTS = 60;

interface PlayerComboboxProps {
  value: string | null; // player id
  onChange: (id: string | null) => void;
  players: PlayerPublic[];
  loading?: boolean;
  disabled?: boolean;
  placeholder?: string;
  id?: string;
}

export function PlayerCombobox({
  value,
  onChange,
  players,
  loading,
  disabled,
  placeholder = 'Buscar jogador...',
  id,
}: PlayerComboboxProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const rootRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const selected = useMemo(() => players.find((p) => p.id === value) ?? null, [players, value]);

  const filtered = useMemo(() => {
    const q = norm(query);
    const base = q
      ? players.filter((p) => norm(p.name).includes(q) || norm(p.nation).includes(q))
      : players;
    return base.slice(0, MAX_RESULTS);
  }, [players, query]);

  // Fecha ao clicar fora.
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) {
        setOpen(false);
        setQuery('');
      }
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [open]);

  const pick = (p: PlayerPublic) => {
    onChange(p.id);
    setOpen(false);
    setQuery('');
  };

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        id={id}
        disabled={disabled}
        onClick={() => {
          if (disabled) return;
          setOpen((o) => !o);
          setTimeout(() => inputRef.current?.focus(), 0);
        }}
        className={cn(
          'flex h-10 w-full items-center gap-2 rounded-md border border-input bg-background px-3 py-2 text-sm text-left',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
          'disabled:cursor-not-allowed disabled:opacity-60',
        )}
      >
        {selected ? (
          <>
            <img
              src={flagUrl(selected.iso || 'xx', 40)}
              alt=""
              className="h-4 w-6 rounded-sm object-cover ring-1 ring-border/40 shrink-0"
            />
            <span className="truncate">
              {selected.name}{' '}
              <span className="text-muted-foreground">({selected.nation})</span>
            </span>
          </>
        ) : (
          <span className="text-muted-foreground truncate">{placeholder}</span>
        )}
        <span className="ml-auto flex items-center gap-1 shrink-0">
          {selected && !disabled && (
            <X
              className="h-4 w-4 text-muted-foreground hover:text-foreground"
              onClick={(e) => {
                e.stopPropagation();
                onChange(null);
              }}
            />
          )}
          <ChevronsUpDown className="h-4 w-4 text-muted-foreground" />
        </span>
      </button>

      {open && (
        <div className="absolute z-50 mt-1 w-full rounded-md border border-border bg-popover shadow-lg">
          <div className="flex items-center gap-2 border-b border-border/60 px-3">
            <Search className="h-4 w-4 text-muted-foreground shrink-0" />
            <input
              ref={inputRef}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Digite o nome ou a seleção..."
              className="h-9 w-full bg-transparent text-sm outline-none placeholder:text-muted-foreground"
            />
          </div>
          <div className="max-h-64 overflow-y-auto py-1">
            {loading ? (
              <div className="flex items-center justify-center py-6 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin mr-2" /> carregando jogadores...
              </div>
            ) : filtered.length === 0 ? (
              <div className="py-6 text-center text-sm text-muted-foreground">
                Nenhum jogador encontrado.
              </div>
            ) : (
              filtered.map((p) => (
                <button
                  type="button"
                  key={p.id}
                  onClick={() => pick(p)}
                  className={cn(
                    'flex w-full items-center gap-2 px-3 py-1.5 text-sm text-left hover:bg-secondary/60',
                    p.id === value && 'bg-secondary/40',
                  )}
                >
                  <img
                    src={flagUrl(p.iso || 'xx', 40)}
                    alt=""
                    className="h-4 w-6 rounded-sm object-cover ring-1 ring-border/40 shrink-0"
                  />
                  <span className="truncate">{p.name}</span>
                  <span className="ml-auto text-xs text-muted-foreground truncate shrink-0">
                    {p.nation}
                  </span>
                  {p.id === value && <Check className="h-4 w-4 text-copa-pitch shrink-0" />}
                </button>
              ))
            )}
          </div>
          {!loading && players.length > MAX_RESULTS && !query && (
            <div className="border-t border-border/60 px-3 py-1.5 text-[11px] text-muted-foreground">
              {players.length} jogadores — refine a busca para ver mais.
            </div>
          )}
        </div>
      )}
    </div>
  );
}
