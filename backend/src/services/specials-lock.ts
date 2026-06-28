/**
 * Helper de leitura/validação do lock dos palpites especiais.
 * Lock é global (1 doc 'specials-lock' em container config, PK scope='global').
 *
 * Regras:
 *   - lockUtc null/ausente → não travado (campos abertos)
 *   - now >= lockUtc → travado (POST/PUT em /specials retorna 409)
 *
 * Cache: leitura é barata (1 RU, 1 doc). Sem cache local — admin pode mudar
 * a qualquer momento e queremos enforcement imediato.
 */
import { container } from './cosmos.js';
import type { SpecialsLockConfigDoc } from '../types/domain.js';

const CONFIG_ID = 'specials-lock';
const CONFIG_SCOPE = 'global';

/**
 * Lê o doc de config. Retorna null se ainda não foi setado pelo admin.
 */
export async function readSpecialsLockConfig(): Promise<SpecialsLockConfigDoc | null> {
  try {
    const { resource } = await container('config')
      .item(CONFIG_ID, CONFIG_SCOPE)
      .read<SpecialsLockConfigDoc>();
    return resource ?? null;
  } catch (err: unknown) {
    const e = err as { code?: number };
    if (e.code === 404) return null;
    throw err;
  }
}

/**
 * Faz upsert do doc de config — usado pelo endpoint admin PUT (lockUtc/description).
 * Preserva os campos de lock manual (B1.4) do doc atual, se existirem.
 */
export async function upsertSpecialsLockConfig(input: {
  lockUtc: string | null;
  description?: string;
  updatedBy: string;
}): Promise<SpecialsLockConfigDoc> {
  const current = await readSpecialsLockConfig();
  const doc: SpecialsLockConfigDoc = {
    id: CONFIG_ID,
    scope: CONFIG_SCOPE,
    value: {
      lockUtc: input.lockUtc,
      description: input.description,
      // Preserva flag manual em ops de set-de-data — toggle é endpoint separado (PATCH).
      lockedManually: current?.value.lockedManually,
      lockedManuallyBy: current?.value.lockedManuallyBy,
      lockedManuallyAt: current?.value.lockedManuallyAt,
    },
    updatedBy: input.updatedBy,
    updatedAt: new Date().toISOString(),
  };
  const { resource } = await container('config').items.upsert<SpecialsLockConfigDoc>(doc);
  return resource ?? doc;
}

/**
 * B1.4: toggle do lock manual (aditivo ao time-based).
 * Preserva lockUtc/description do doc atual; só muda os campos lockedManually*.
 */
export async function setSpecialsLockManual(input: {
  manual: boolean;
  updatedBy: string;
}): Promise<SpecialsLockConfigDoc> {
  const current = await readSpecialsLockConfig();
  const nowIso = new Date().toISOString();
  const doc: SpecialsLockConfigDoc = {
    id: CONFIG_ID,
    scope: CONFIG_SCOPE,
    value: {
      lockUtc: current?.value.lockUtc ?? null,
      description: current?.value.description,
      lockedManually: input.manual,
      lockedManuallyBy: input.manual ? input.updatedBy : undefined,
      lockedManuallyAt: input.manual ? nowIso : undefined,
    },
    updatedBy: input.updatedBy,
    updatedAt: nowIso,
  };
  const { resource } = await container('config').items.upsert<SpecialsLockConfigDoc>(doc);
  return resource ?? doc;
}

/**
 * Time-based lock: ativo quando há lockUtc setado E `nowMs >= lockUtc`.
 * Não considera o flag manual.
 */
export function isTimeBasedLocked(
  config: SpecialsLockConfigDoc | null,
  nowMs: number = Date.now(),
): boolean {
  if (!config?.value.lockUtc) return false;
  const lockMs = Date.parse(config.value.lockUtc);
  if (!Number.isFinite(lockMs)) return false;
  return nowMs >= lockMs;
}

/**
 * Determina se palpites especiais estão travados no momento `nowMs` (default now).
 * Aditivo: travado se admin acionou manualmente (B1.4) OU time-based ativou.
 */
export function computeSpecialsLocked(
  config: SpecialsLockConfigDoc | null,
  nowMs: number = Date.now(),
): boolean {
  if (!config) return false;
  if (config.value.lockedManually === true) return true;
  return isTimeBasedLocked(config, nowMs);
}

/**
 * Helper combinado: lê config e devolve { config, locked, lockUtc }.
 * Usado por routes que precisam do estado atual.
 */
export async function getSpecialsLockState(nowMs: number = Date.now()): Promise<{
  config: SpecialsLockConfigDoc | null;
  locked: boolean;
  lockUtc: string | null;
}> {
  const config = await readSpecialsLockConfig();
  return {
    config,
    locked: computeSpecialsLocked(config, nowMs),
    lockUtc: config?.value.lockUtc ?? null,
  };
}
