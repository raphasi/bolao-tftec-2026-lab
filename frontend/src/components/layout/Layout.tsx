import type { ReactNode } from 'react';
import { WifiOff } from 'lucide-react';
import { Navbar } from './Navbar';
import { TftecCopaLogo } from '@/components/copa/TftecCopaLogo';
import { flagUrl } from '@/lib/flags';
import { useOnlineStatus } from '@/hooks/useOnlineStatus';

export function Layout({ children }: { children: ReactNode }) {
  const online = useOnlineStatus();

  return (
    <div className="min-h-screen bg-background text-foreground flex flex-col">
      <Navbar />
      {/* B6.1 fix: banner de offline persistente no topo */}
      {!online && (
        <div
          className="bg-destructive/10 border-b border-destructive/40 text-destructive py-2 px-4 text-sm flex items-center justify-center gap-2"
          role="status"
          aria-live="polite"
        >
          <WifiOff className="h-4 w-4" />
          <span className="font-medium">Sem conexão</span>
          <span className="text-destructive/80 hidden sm:inline">
            — algumas ações podem falhar até voltar online
          </span>
        </div>
      )}
      <main className="flex-1 container py-8">{children}</main>
      <footer className="border-t border-border/60 mt-12">
        <div className="container py-5 flex flex-col gap-3">
          {/* Linha 1: sedes 2026 */}
          <div className="flex items-center justify-center gap-3 text-xs text-muted-foreground">
            <span>FIFA World Cup 2026 ·</span>
            <span className="flex items-center gap-2">
              <img src={flagUrl('us', 40)} alt="Estados Unidos" className="h-4 w-6 rounded-sm ring-1 ring-border/40" />
              <img src={flagUrl('ca', 40)} alt="Canadá" className="h-4 w-6 rounded-sm ring-1 ring-border/40" />
              <img src={flagUrl('mx', 40)} alt="México" className="h-4 w-6 rounded-sm ring-1 ring-border/40" />
            </span>
            <span>· 48 seleções · 16 cidades-sede</span>
          </div>
          {/* Linha 2: assinatura */}
          <div className="flex flex-col sm:flex-row items-center justify-between gap-2 pt-3 border-t border-border/30">
            <div className="flex items-center gap-2">
              <TftecCopaLogo size="sm" className="opacity-60" />
              <span className="text-xs text-muted-foreground">
                Bolão <span className="text-brand-gradient font-semibold">TFTEC Prime</span>
              </span>
            </div>
            <div className="text-xs text-muted-foreground/60">
              Uso educacional · Conteúdo factual público
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}
