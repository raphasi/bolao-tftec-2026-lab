/**
 * Página AdminConfig (S2.7) — admin-only.
 * Permite setar lockUtc dos palpites especiais (campeão, top 4, artilheiro).
 *
 * Validações UI:
 *  - datetime-local com min=now (browser bloqueia datas passadas)
 *  - Botão Salvar disabled se valor não mudou
 *  - Confirma se vai limpar lock OU travar imediatamente
 */
import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AlertTriangle, CheckCircle2, Eraser, Lock, Loader2, Save, Settings, XCircle } from 'lucide-react';
import { toast } from 'sonner';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import {
  getAdminSpecialsLock,
  patchAdminSpecialsLockManual,
  updateAdminSpecialsLock,
  type UpdateAdminLockInput,
} from '@/lib/bolao-api';
import { getErrorMessage } from '@/lib/api';
import { cn } from '@/lib/utils';
import type { AdminSpecialsLockPublic } from '@/lib/types-domain';

// Converte ISO 8601 (com Z) pra valor de <input type=datetime-local> no fuso local
function isoToLocalInput(iso: string | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

// Converte valor de datetime-local (local time) pra ISO UTC
function localInputToIso(local: string): string | null {
  if (!local) return null;
  const d = new Date(local);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString();
}

function nowLocalInputValue(): string {
  return isoToLocalInput(new Date().toISOString());
}

export default function AdminConfig() {
  const queryClient = useQueryClient();
  const [localInput, setLocalInput] = useState<string>('');
  const [description, setDescription] = useState<string>('');

  const configQuery = useQuery({
    queryKey: ['admin', 'config', 'specials-lock'],
    queryFn: getAdminSpecialsLock,
  });

  // Hidrata estado a partir do backend
  useEffect(() => {
    if (!configQuery.data) return;
    setLocalInput(isoToLocalInput(configQuery.data.lockUtc));
    setDescription(configQuery.data.description ?? '');
  }, [configQuery.data]);

  const saveMutation = useMutation({
    mutationFn: (input: UpdateAdminLockInput) => updateAdminSpecialsLock(input),
    onSuccess: (saved) => {
      toast.success(
        saved.lockUtc
          ? `Lock setado para ${new Date(saved.lockUtc).toLocaleString('pt-BR')}`
          : 'Lock removido',
      );
      queryClient.setQueryData<AdminSpecialsLockPublic>(['admin', 'config', 'specials-lock'], saved);
      // Também invalida o endpoint público para outros componentes refletirem
      queryClient.invalidateQueries({ queryKey: ['specials-lock'] });
    },
    onError: (err) => toast.error(getErrorMessage(err)),
  });

  // B1.4: toggle do lock manual (aditivo)
  const manualMutation = useMutation({
    mutationFn: (manual: boolean) => patchAdminSpecialsLockManual(manual),
    onSuccess: (saved) => {
      toast.success(
        saved.lockedManually
          ? 'Palpites especiais travados manualmente.'
          : 'Trava manual removida.',
      );
      queryClient.setQueryData<AdminSpecialsLockPublic>(['admin', 'config', 'specials-lock'], saved);
      queryClient.invalidateQueries({ queryKey: ['specials-lock'] });
    },
    onError: (err) => toast.error(getErrorMessage(err)),
  });

  const current = configQuery.data;
  const currentLocked = current?.locked ?? false;
  const isManuallyLocked = current?.lockedManually ?? false;
  // Time-based locked = locked sem ser manual (admin não consegue mais alterar lockUtc)
  const isTimeBasedLocked = currentLocked && !isManuallyLocked;
  const minDateTime = nowLocalInputValue();

  const inputIso = localInputToIso(localInput);
  const hasChanges =
    current &&
    (inputIso !== current.lockUtc ||
      (description || '') !== (current.description || ''));

  const handleSave = () => {
    saveMutation.mutate({
      lockUtc: inputIso,
      description: description.trim() || undefined,
    });
  };

  const handleClear = () => {
    if (isTimeBasedLocked) {
      toast.error('Não é possível destravar após o lock por data ter ativado.');
      return;
    }
    if (!window.confirm('Confirma remover a data de lock? Os campos especiais ficarão abertos (a menos que o lock manual esteja ativo).')) {
      return;
    }
    saveMutation.mutate({ lockUtc: null });
    setLocalInput('');
  };

  const handleManualToggle = () => {
    const next = !isManuallyLocked;
    const message = next
      ? 'Travar palpites especiais manualmente AGORA? Usuários não poderão mais alterar campeão/top4/artilheiro até você destravar.'
      : 'Remover trava manual? Os palpites especiais voltarão a aceitar alterações (a menos que a data de lock já tenha ativado).';
    if (!window.confirm(message)) return;
    manualMutation.mutate(next);
  };

  return (
    <div className="space-y-6 animate-fade-in max-w-3xl">
      {/* Header */}
      <header className="flex items-center gap-4">
        <div className="h-12 w-12 rounded-xl bg-brand-purple/15 flex items-center justify-center ring-1 ring-brand-purple/30">
          <Settings className="h-7 w-7 text-brand-purple" />
        </div>
        <div>
          <h1 className="font-display text-3xl md:text-4xl font-bold">Console Admin</h1>
          <p className="text-muted-foreground mt-1">Configurações globais do bolão.</p>
        </div>
      </header>

      {/* Loading */}
      {configQuery.isLoading && (
        <div className="flex justify-center py-16">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      )}

      {!configQuery.isLoading && (
        <Card className="border-border/60">
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <Lock className="h-5 w-5 text-copa-gold" />
              Lock dos palpites especiais
            </CardTitle>
            <CardDescription>
              Data/hora em que campeão, top 4 e artilheiro ficarão imutáveis. Aplica-se
              globalmente a todos os usuários.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-5">
            {/* Status atual */}
            <div
              className={cn(
                'rounded-lg p-4 flex items-center gap-3 text-sm',
                currentLocked
                  ? 'bg-destructive/10 border border-destructive/40'
                  : current?.lockUtc
                    ? 'bg-copa-gold/5 border border-copa-gold/40'
                    : 'bg-copa-pitch/5 border border-copa-pitch/40',
              )}
            >
              {currentLocked ? (
                <>
                  <XCircle className="h-5 w-5 text-destructive shrink-0" />
                  <div>
                    <div className="font-medium text-destructive">Travado</div>
                    <div className="text-muted-foreground">
                      {isManuallyLocked && !isTimeBasedLocked ? (
                        <>
                          Travado manualmente
                          {current?.lockedManuallyAt && (
                            <> em {new Date(current.lockedManuallyAt).toLocaleString('pt-BR')}</>
                          )}.
                          Para reabrir, desligue a trava manual abaixo.
                        </>
                      ) : (
                        <>
                          Lock por data ativou em {current?.lockUtc ? new Date(current.lockUtc).toLocaleString('pt-BR') : '—'}.
                          Não pode mais ser alterado.
                        </>
                      )}
                    </div>
                  </div>
                </>
              ) : current?.lockUtc ? (
                <>
                  <Lock className="h-5 w-5 text-copa-gold shrink-0" />
                  <div>
                    <div className="font-medium text-copa-gold">Aguardando lock</div>
                    <div className="text-muted-foreground">
                      Travará em {new Date(current.lockUtc).toLocaleString('pt-BR')}.
                    </div>
                  </div>
                </>
              ) : (
                <>
                  <CheckCircle2 className="h-5 w-5 text-copa-pitch shrink-0" />
                  <div>
                    <div className="font-medium text-copa-pitch">Aberto</div>
                    <div className="text-muted-foreground">
                      Sem data de lock configurada. Usuários podem alterar especiais a qualquer momento.
                    </div>
                  </div>
                </>
              )}
            </div>

            {/* Form */}
            <div className="space-y-3">
              <div className="space-y-1.5">
                <Label htmlFor="lockUtc">Nova data/hora de lock (fuso local)</Label>
                <input
                  id="lockUtc"
                  type="datetime-local"
                  value={localInput}
                  min={minDateTime}
                  disabled={isTimeBasedLocked || saveMutation.isPending}
                  onChange={(e) => setLocalInput(e.target.value)}
                  className={cn(
                    'flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm',
                    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
                    'disabled:cursor-not-allowed disabled:opacity-50',
                  )}
                />
                {inputIso && (
                  <p className="text-xs text-muted-foreground">
                    Será salvo como UTC: <code>{inputIso}</code>
                  </p>
                )}
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="description">Descrição (opcional)</Label>
                <textarea
                  id="description"
                  rows={2}
                  maxLength={200}
                  placeholder="Ex: Lock 30min antes da abertura"
                  value={description}
                  disabled={isTimeBasedLocked || saveMutation.isPending}
                  onChange={(e) => setDescription(e.target.value)}
                  className={cn(
                    'flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm',
                    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
                    'disabled:cursor-not-allowed disabled:opacity-50 resize-none',
                  )}
                />
                <p className="text-xs text-muted-foreground text-right">{description.length}/200</p>
              </div>
            </div>

            {/* Botões */}
            <div className="flex flex-wrap justify-end gap-2 pt-2 border-t">
              {current?.lockUtc && !isTimeBasedLocked && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleClear}
                  disabled={saveMutation.isPending}
                >
                  <Eraser className="h-4 w-4" />
                  Remover data
                </Button>
              )}
              <Button
                onClick={handleSave}
                disabled={!hasChanges || isTimeBasedLocked || saveMutation.isPending}
              >
                {saveMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                Salvar configuração
              </Button>
            </div>

            {/* B1.4: Trava manual (aditiva ao lock por data) */}
            <div
              className={cn(
                'rounded-lg border p-4 space-y-3',
                isManuallyLocked
                  ? 'bg-destructive/5 border-destructive/40'
                  : 'bg-muted/20 border-border/60',
              )}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="space-y-1">
                  <div className="flex items-center gap-2 font-medium text-sm">
                    <AlertTriangle className={cn('h-4 w-4', isManuallyLocked ? 'text-destructive' : 'text-muted-foreground')} />
                    Trava manual de emergência
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Trava palpites especiais imediatamente, independente da data agendada. Use se
                    precisar fechar antes do horário planejado (vazamento de resultado, ajuste de regra etc.).
                  </p>
                  {isManuallyLocked && current?.lockedManuallyAt && (
                    <p className="text-xs text-destructive">
                      Ativada em {new Date(current.lockedManuallyAt).toLocaleString('pt-BR')}.
                    </p>
                  )}
                </div>
                <Button
                  size="sm"
                  variant={isManuallyLocked ? 'outline' : 'destructive'}
                  onClick={handleManualToggle}
                  disabled={manualMutation.isPending}
                >
                  {manualMutation.isPending ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Lock className="h-4 w-4" />
                  )}
                  {isManuallyLocked ? 'Destravar' : 'Travar agora'}
                </Button>
              </div>
            </div>

            {/* Meta info */}
            {current?.updatedAt && (
              <div className="text-xs text-muted-foreground border-t pt-3">
                Última atualização: {new Date(current.updatedAt).toLocaleString('pt-BR')}
                {current.updatedBy && (
                  <> por <code className="text-xs">{current.updatedBy.slice(0, 8)}...</code></>
                )}
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
