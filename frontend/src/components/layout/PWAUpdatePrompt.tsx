/**
 * Banner que aparece quando uma nova versão da PWA está disponível (S5.3).
 * Usa registerSW do virtual:pwa-register para detectar atualizações.
 */
import { useEffect, useState } from 'react';
import { RefreshCw, X } from 'lucide-react';
import { Button } from '@/components/ui/button';

export function PWAUpdatePrompt() {
  const [needRefresh, setNeedRefresh] = useState(false);
  const [updateSW, setUpdateSW] = useState<((reload?: boolean) => Promise<void>) | null>(null);

  useEffect(() => {
    // Import dinâmico — virtual:pwa-register só existe em build
    let cancelled = false;
    import('virtual:pwa-register')
      .then(({ registerSW }) => {
        if (cancelled) return;
        const update = registerSW({
          onNeedRefresh() {
            setNeedRefresh(true);
          },
          onOfflineReady() {
            // SW ativado; conteúdo cacheado e disponível offline
          },
        });
        setUpdateSW(() => update);
      })
      .catch(() => {
        // Module não disponível (dev mode); ignora silenciosamente
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (!needRefresh) return null;

  return (
    <div
      role="alert"
      className="fixed bottom-4 left-1/2 -translate-x-1/2 z-50 max-w-sm bg-card border border-brand-purple/30 rounded-lg shadow-lg p-3 flex items-center gap-3 animate-fade-in"
    >
      <RefreshCw className="h-5 w-5 text-brand-purple shrink-0" />
      <div className="flex-1 text-sm">
        <p className="font-medium">Nova versão disponível</p>
        <p className="text-xs text-muted-foreground">Atualize para a versão mais recente.</p>
      </div>
      <Button size="sm" onClick={() => updateSW?.(true)}>
        Atualizar
      </Button>
      <button
        type="button"
        onClick={() => setNeedRefresh(false)}
        className="text-muted-foreground hover:text-foreground"
        aria-label="Dispensar"
      >
        <X className="h-4 w-4" />
      </button>
    </div>
  );
}
