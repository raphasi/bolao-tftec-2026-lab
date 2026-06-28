/**
 * Hook useLeaderboardSignal (S3.5).
 *
 * Conecta no SignalR Service via /api/negotiate e escuta evento
 * 'leaderboard:update' → invalida query ['leaderboard'] (React Query refetcha).
 *
 * Reconnect automático em caso de drop.
 * Cleanup ao desmontar.
 */
import { useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { HubConnectionBuilder, HubConnectionState, LogLevel } from '@microsoft/signalr';
import { useAuth } from '@/contexts/AuthContext';
import { signalRNegotiate } from '@/lib/bolao-api';
import { getAuthToken } from '@/lib/api';

export function useLeaderboardSignal(): void {
  const queryClient = useQueryClient();
  const { isAuthenticated } = useAuth();

  useEffect(() => {
    if (!isAuthenticated) return undefined;

    let cancelled = false;
    let connection: ReturnType<typeof HubConnectionBuilder.prototype.build> | null = null;

    const start = async () => {
      try {
        const { url, accessToken } = await signalRNegotiate();
        if (cancelled) return;

        connection = new HubConnectionBuilder()
          .withUrl(url, {
            accessTokenFactory: () => accessToken,
          })
          .withAutomaticReconnect([0, 2000, 5000, 10_000, 30_000])
          .configureLogging(LogLevel.Warning)
          .build();

        connection.on('leaderboard:update', () => {
          // Invalida a query — React Query refetcha automaticamente
          queryClient.invalidateQueries({ queryKey: ['leaderboard'] });
        });

        await connection.start();
      } catch (err) {
        // SignalR não configurado OU 401 — não bloqueia UI
        if (!cancelled) {
          console.warn('SignalR realtime indisponível:', (err as Error).message);
        }
      }
    };

    start();

    return () => {
      cancelled = true;
      if (connection && connection.state !== HubConnectionState.Disconnected) {
        connection.stop().catch(() => {});
      }
    };
  }, [isAuthenticated, queryClient]);
}

// getAuthToken não usado diretamente, mas mantém o import explícito do helper
void getAuthToken;
