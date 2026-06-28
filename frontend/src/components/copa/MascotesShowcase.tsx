/**
 * Seção dedicada aos 3 mascotes oficiais da FIFA World Cup 2026:
 * Maple (alce 🇨🇦), Zayu (jaguar 🇲🇽), Clutch (águia 🇺🇸).
 *
 * Por que isolada: as cores fortes (vermelho/verde/azul) das mascotes brigam
 * com a paleta TFTEC (magenta/roxo). Mantendo em UMA seção dedicada, o impacto
 * "Copa pura" acontece sem poluir o resto da UI.
 *
 * Story 9.1 — Visual Copa 2026 Refresh.
 */
export function MascotesShowcase() {
  return (
    <section className="rounded-2xl border border-border/60 bg-card/50 backdrop-blur p-6 md:p-10 text-center">
      <h2 className="font-display text-2xl md:text-3xl font-bold mb-2">
        Os <span className="text-brand-gradient">mascotes</span> da Copa 2026
      </h2>
      <p className="text-sm text-muted-foreground mb-6">
        Maple (Canadá 🇨🇦) · Zayu (México 🇲🇽) · Clutch (EUA 🇺🇸)
      </p>
      <img
        src="/copa/mascotes.webp"
        alt="Maple, Zayu e Clutch — mascotes oficiais da FIFA World Cup 2026"
        loading="lazy"
        decoding="async"
        className="mx-auto max-h-40 md:max-h-64 w-auto"
      />
    </section>
  );
}
