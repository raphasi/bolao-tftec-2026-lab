/**
 * Helper das "janelas de fase" (feature phase-windows).
 *
 * Doc único `phase-windows` no container config (PK scope='global') mapeia
 * fase -> openUtc (ISO). Conceito ORTOGONAL ao lock de kickoff:
 *   - computeMatchLocked = "tarde demais" (kickoff-30min/finished/manual)
 *   - isPredictionOpen   = "ainda não abriu" (now < openUtc da fase)
 *
 * Fase ausente em `value` => aberta (grupos jamais listados; backward-compatible
 * quando o doc não existe). Leitura é barata (1 doc) — sem cache, enforcement
 * imediato quando o admin muda as datas.
 */
import { container } from './cosmos.js';
import type { MatchCacheDoc, MatchPhase, PhaseWindowsConfigDoc } from '../types/domain.js';

const CONFIG_ID = 'phase-windows';
const CONFIG_SCOPE = 'global';

export type PhaseWindows = Partial<Record<MatchPhase, string>>;

/** Lê o doc de janelas de fase. Null se ainda não foi configurado pelo admin. */
export async function readPhaseWindowsConfig(): Promise<PhaseWindowsConfigDoc | null> {
  try {
    const { resource } = await container('config')
      .item(CONFIG_ID, CONFIG_SCOPE)
      .read<PhaseWindowsConfigDoc>();
    return resource ?? null;
  } catch (err: unknown) {
    const e = err as { code?: number };
    if (e.code === 404) return null;
    throw err;
  }
}

/** Upsert das janelas (endpoint admin PUT). */
export async function upsertPhaseWindowsConfig(input: {
  windows: PhaseWindows;
  updatedBy: string;
}): Promise<PhaseWindowsConfigDoc> {
  const doc: PhaseWindowsConfigDoc = {
    id: CONFIG_ID,
    scope: CONFIG_SCOPE,
    value: input.windows,
    updatedBy: input.updatedBy,
    updatedAt: new Date().toISOString(),
  };
  const { resource } = await container('config').items.upsert<PhaseWindowsConfigDoc>(doc);
  return resource ?? doc;
}

/**
 * A fase do jogo está aberta para palpite em `nowMs`?
 * Sem janela para a fase => aberta. Com janela => aberta sse now >= openUtc.
 */
export function isPredictionOpen(
  doc: Pick<MatchCacheDoc, 'phase'>,
  windows: PhaseWindows | null | undefined,
  nowMs: number = Date.now(),
): { open: boolean; opensUtc?: string } {
  const openUtc = windows?.[doc.phase];
  if (!openUtc) return { open: true };
  const openMs = Date.parse(openUtc);
  if (!Number.isFinite(openMs)) return { open: true };
  return { open: nowMs >= openMs, opensUtc: openUtc };
}
