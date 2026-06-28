/** "atualizado há Xs/Xmin" — relativo ao agora, fallback p/ horário pt-BR. */
export function formatRelative(iso: string): string {
  const elapsed = Date.now() - new Date(iso).getTime();
  if (elapsed < 10_000) return 'agora';
  if (elapsed < 60_000) return `há ${Math.floor(elapsed / 1000)}s`;
  if (elapsed < 3_600_000) return `há ${Math.floor(elapsed / 60_000)}min`;
  return new Date(iso).toLocaleTimeString('pt-BR');
}
