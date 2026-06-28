/**
 * Hook useOnlineStatus — observa navigator.onLine + eventos online/offline.
 *
 * Usado pelo Layout pra mostrar banner "Sem conexão" e por queries
 * pra adaptar mensagens de erro.
 *
 * B6.1 fix: app não tinha nenhum indicador visual quando offline,
 * usuário ficava confuso ao clicar Salvar e nada acontecer.
 */
import { useEffect, useState } from 'react';

export function useOnlineStatus(): boolean {
  const [online, setOnline] = useState<boolean>(() =>
    typeof navigator === 'undefined' ? true : navigator.onLine,
  );

  useEffect(() => {
    const handleOnline = () => setOnline(true);
    const handleOffline = () => setOnline(false);

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  return online;
}
