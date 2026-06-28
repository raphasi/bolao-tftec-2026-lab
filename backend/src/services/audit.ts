/**
 * Audit log service (S4.5.3).
 * Helper para gravar entries em audit-log container.
 *
 * Princípios:
 *  - Fire-and-forget: falha NÃO bloqueia operação principal
 *  - Log warn em logger se falhar (visibilidade sem quebrar UX)
 *  - PK /performedBy: query "tudo que admin X fez" é barato
 */
import { randomUUID } from 'node:crypto';
import { container } from './cosmos.js';
import { logger } from '../config/logger.js';
import type { AuditAction, AuditLogDoc, AuditTargetType } from '../types/domain.js';

export interface AppendAuditEntryInput {
  performedBy: string;
  performedByEmail: string;
  action: AuditAction;
  targetType?: AuditTargetType; // default 'user' (compat com ações de usuário)
  targetUserId?: string;
  targetEmail?: string;
  targetId?: string;
  targetLabel?: string;
  previousValue: unknown;
  newValue: unknown;
  reason?: string;
}

/**
 * Grava entry no audit log. Não throw em caso de falha — apenas log warn.
 */
export async function appendAuditEntry(input: AppendAuditEntryInput): Promise<void> {
  const doc: AuditLogDoc = {
    id: randomUUID(),
    performedBy: input.performedBy,
    performedByEmail: input.performedByEmail,
    action: input.action,
    targetType: input.targetType ?? 'user',
    targetUserId: input.targetUserId,
    targetEmail: input.targetEmail,
    targetId: input.targetId,
    targetLabel: input.targetLabel,
    previousValue: input.previousValue,
    newValue: input.newValue,
    reason: input.reason,
    timestamp: new Date().toISOString(),
  };

  try {
    await container('auditLog').items.create(doc);
  } catch (err) {
    logger.warn(
      { err, action: input.action, target: input.targetUserId },
      'audit log write failed (operation succeeded but audit lost)',
    );
  }
}
