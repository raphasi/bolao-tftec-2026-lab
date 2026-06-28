# Frontend Spec — Layout Copa 2026 Enhancements

> **Author:** Uma (@ux-design-expert) · **Date:** 2026-05-20 · **Type:** Phase 1 spec (handoff para @sm)
> **Constraint do owner:** dar mais cara de Copa do Mundo, SEM mudar paleta/fontes/design pattern.
> **Conflito chave:** imagens trazem vermelho/verde/azul saturados (cores Copa) que não estão na paleta TFTEC (magenta/roxo/dourado). Spec resolve restringindo uso colorido a contextos isolados e usando opacidade/grayscale em decorações.

---

## 1. Análise das imagens recebidas

| Imagem | Conteúdo | Cores dominantes | Compatibilidade c/ paleta TFTEC |
|---|---|---|---|
| `bola_2026.png` | Bola adidas Trionda oficial FIFA 2026 — branca c/ painéis vermelho/azul/verde + escudo FIFA azul | Branco, vermelho, azul, verde | ❌ Brigam se aplicadas em destaque grande. ✅ OK em decoração c/ opacidade baixa ou grayscale |
| `mascotes.webp` | Maple (alce 🇨🇦 vermelho) + Zayu (jaguar 🇲🇽 verde) + Clutch (águia 🇺🇸 azul) | Vermelho, verde, azul | ❌ Não-tematizam com magenta/roxo. ✅ Funcionam isolados em 1 seção dedicada "Os mascotes da Copa" |
| `taça.webp` | Taça FIFA dourada, transparente | Dourado puro | ✅ Combina com `copa-gold` que já está nos tokens. Premium feel sem conflito |
| `logo-principal-branco@2x.png` | Logo TFTEC Copa do Mundo Azure (branco s/ transparente) | Branco | ✅ Substitui `tftec-mark` SVG atual sem conflito; reforça branding evento |

---

## 2. Spec por componente

### 2.1 Logo TFTEC Copa (Atom novo)

**Atom novo:** `<TftecCopaLogo size="sm|md|lg" />` em `frontend/src/components/copa/TftecCopaLogo.tsx`

```tsx
type Size = 'sm' | 'md' | 'lg';
const SIZES: Record<Size, string> = {
  sm: 'h-5 w-auto',   // footer (~20px alto, aspect preservado)
  md: 'h-8 w-auto',   // navbar (~32px)
  lg: 'h-14 w-auto',  // login/register card header (~56px)
};
```

Source: `frontend/public/copa/tftec-copa-logo.png` (mover de `docs/Images/logo-principal-branco@2x.png`).

**Pontos de substituição** (substitui `<span className="tftec-mark"/>` atual):

| Local | Antes | Depois | Notas |
|---|---|---|---|
| `Navbar.tsx:32-34` | `<span className="tftec-mark h-8 w-8" />` | `<TftecCopaLogo size="md" />` | Mantém `group-hover:scale-110` |
| `Layout.tsx:43` (footer) | `<span className="tftec-mark h-5 w-5 opacity-60" />` | `<TftecCopaLogo size="sm" className="opacity-60" />` | Opacity inline preserva sutileza |
| `Login.tsx:42` | `<span className="tftec-mark h-12 w-12" />` | `<TftecCopaLogo size="lg" />` | Centro do CardHeader |
| `Register.tsx:40` | `<span className="tftec-mark h-12 w-12" />` | `<TftecCopaLogo size="lg" />` | Idem |

**A11y:** `alt="TFTEC Prime — Copa do Mundo Azure"` (assumindo rename, ver §3).

**Loading strategy:** `loading="eager"` (above-the-fold em todos os pontos).

**NÃO remover** o CSS `.tftec-mark` ainda — pode ser usado em outros lugares (search depois).

---

### 2.2 Mascotes da Copa (Organism novo)

**Organism novo:** `<MascotesShowcase />` em `frontend/src/components/copa/MascotesShowcase.tsx`.

**Posição na Home:** **entre o Hero e as Features** (linha 100, antes do `<section className="grid md:grid-cols-3 gap-6">`).

**Layout proposto:**

```
┌──────────────────────────────────────────────────────────────────┐
│  Os mascotes da Copa 2026                                         │
│  Maple (Canadá 🇨🇦) · Zayu (México 🇲🇽) · Clutch (EUA 🇺🇸)        │
│                                                                  │
│        [imagem mascotes.webp centralizada, max-h-64]              │
│                                                                  │
└──────────────────────────────────────────────────────────────────┘
```

**Tailwind structure:**
```tsx
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
    className="mx-auto max-h-40 md:max-h-64 w-auto"
    loading="lazy"
  />
</section>
```

**Por que aqui:** reforça narrativa dos 3 países-sede que já aparece no footer (linha 33-37). Cria momento "Copa pura" isolado, sem misturar cores com o resto do app.

---

### 2.3 Taça FIFA (Atom novo, premium feel)

**Atom novo:** `<CopaTrophyImage className=... />` em `frontend/src/components/copa/CopaTrophyImage.tsx` — wrapper de `<img src="/copa/taca.webp">`.

**Pontos de uso:**

| Local | Substitui | Tamanho | Notas |
|---|---|---|---|
| `Home.tsx:21-23` (decoração hero) | `<WorldCupTrophy>` SVG | `h-44 w-auto` | Mantém `absolute -top-4 -left-8 opacity-[0.07] -rotate-12 hidden md:block pointer-events-none` |
| `Home.tsx:161` (card "Campeão" scoring) | `<WorldCupTrophy>` SVG | `h-12 w-auto` | Sem opacity (destaque) |

**A11y:** decoração no hero = `aria-hidden`. No card "Campeão" = `alt="Taça FIFA World Cup"`.

**NÃO remover** o SVG `WorldCupTrophy` ainda — pode estar usado em outros lugares (CardContent ícone p.ex.). Migração gradual.

---

### 2.4 Bola adidas Trionda (decoração isolada)

**Pontos de uso (escolher 1 dos 2):**

#### Opção A (Recommended) — Substituir SVG SoccerBall no hero
Em `Home.tsx:25-27`, substituir:
```tsx
<SoccerBall className="absolute -bottom-10 -right-10 h-52 w-52 text-foreground opacity-[0.06] rotate-12 ..."/>
```
Por:
```tsx
<img
  src="/copa/bola.webp"
  alt=""
  aria-hidden
  className="absolute -bottom-10 -right-10 h-52 w-auto opacity-[0.12] rotate-12 pointer-events-none hidden md:block [filter:grayscale(60%)]"
  loading="lazy"
/>
```
**Justificativa:** opacity 12% + grayscale 60% neutraliza as cores fortes da bola, mantém a forma. Não polui a paleta.

#### Opção B — Card pequeno "Bola oficial 2026"
Adicionar mini-card abaixo do MascotesShowcase com bola full-color + caption "adidas Trionda — bola oficial". Permite full-color sem poluir, mas adiciona scroll.

**Recomendação Uma:** **Opção A**. Reaproveita decoração existente, custo 1 linha trocada, zero novo scroll, zero novo elemento de hierarquia.

**Otimização:** converter `bola_2026.png` (~600KB) para `bola.webp` (~150KB lossless). Reduz custo de bandwidth em mobile sem perda visível.

---

## 3. Debate de escopo: "TFTEC Cloud" → "TFTEC Prime"

> **A squad precisa decidir.** Estou recomendando o escopo MINIMAL (user-visible only) com justificativa abaixo.

### Mapa de ocorrências

| Categoria | Arquivos | Ocorrências | Impacto |
|---|---|---|---|
| **A. User-visible (frontend rendering)** | `index.html`, `vite.config.ts` PWA, `Home.tsx`, `Layout.tsx`, `Navbar.tsx` aria-label, `Login.tsx` aria-label, `Register.tsx` aria-label | ~8 | Usuário vê — RENAME OBRIGATÓRIO |
| **B. Project-level metadata** | `package.json` (description, author), top-level `README.md` | ~3 | Devs/clones veem. Renomear se for evento longo, manter se for só sprint |
| **C. Docs internas** | `docs/architecture.md`, `docs/deploy-runbook.md`, `backend/README.md`, `docs/brand/README.md` | ~6 | Devs/owner. Baixo impacto, alta poluição de diff |
| **D. Comments em código** | `backend/src/server.ts`, `infra/main.bicep`, `tailwind.config.ts`, `frontend/src/index.css` | ~5 | Só dev. Zero impacto user |
| **E. Infra tags + identifiers** | `infra/main.bicep` tag `owner: 'tftec-cloud'`, `parameters.example.json` | ~2 | Identificadores Azure. **MUDAR PODE QUEBRAR FILTROS** existentes em dashboards/Cost Mgmt |
| **F. Manual de marca** | `docs/brand/palette.md`, `docs/brand/typography.md`, `docs/brand/README.md` | ~12 | É **marca da empresa TFTEC**, não do produto. "TFTEC Cloud" é o nome histórico da identidade visual. Renomear destrói rastreabilidade ao manual oficial. |

### Recomendação Uma (escopo MINIMAL)

✅ **Renomear categoria A** (8 ocorrências) — usuário final vê.
🤔 **Categoria B (metadata) = debate squad** — depende se "TFTEC Prime" é o novo nome perene ou só para este evento.
❌ **NÃO renomear C, D, E, F** — quebram rastreabilidade interna sem benefício user, e E pode quebrar dashboards.

### Justificativa lógica para o @po debater
"TFTEC Cloud" no manual de marca refere à **identidade visual da empresa TFTEC**, não ao produto Bolão. "TFTEC Prime" é o nome do **programa/evento educacional**. Mudar a marca da empresa em `docs/brand/` seria errado — esses arquivos são cópia local do manual oficial, não documentação do produto.

Se o owner confirmar que "TFTEC Cloud" como NOME DA EMPRESA tb mudou, aí é outro escopo (rebrand corporativo, fora desta story).

---

## 4. A11y & Performance

| Item | Decisão |
|---|---|
| `alt` em decorações | `alt=""` + `aria-hidden` (bola hero, taça hero) |
| `alt` em conteúdo | Logo: "TFTEC Prime — Copa do Mundo Azure". Mascotes: "Maple, Zayu e Clutch — mascotes oficiais da FIFA World Cup 2026". Taça scoring: "Taça FIFA World Cup". |
| WCAG AA contrast | Logo branco sobre fundo `bg-dark-primary` = 21:1 ✅ |
| Loading strategy | Logo Navbar = `eager`. Resto = `lazy` |
| Imagens em `public/` | Sim — copiar de `docs/Images/` para `frontend/public/copa/` (versionado, served estático) |
| Otimização bola | Converter PNG → WebP (lossless, ~150KB vs ~600KB). Tool: `cwebp -q 90 -lossless bola_2026.png -o bola.webp` |

---

## 5. Atomic Design summary

| Level | Novo? | Componente |
|---|---|---|
| **Atom** | ✅ Sim | `TftecCopaLogo` |
| **Atom** | ✅ Sim | `CopaTrophyImage` (opcional — pode ser `<img>` inline também) |
| **Molecule** | ❌ Nenhum | — |
| **Organism** | ✅ Sim | `MascotesShowcase` (uma seção da Home) |

---

## 6. Estimativa de esforço (input para @sm)

| Tarefa | Estimativa |
|---|---|
| Mover imagens p/ `public/copa/`, otimizar bola → webp | 15 min |
| Criar `TftecCopaLogo` atom | 15 min |
| Substituir 4 ocorrências de `tftec-mark` | 15 min |
| Substituir `WorldCupTrophy` SVG por imagem taça em 2 locais | 10 min |
| Substituir `SoccerBall` SVG por imagem bola no hero (Opção A) | 10 min |
| Criar `MascotesShowcase` organism + inserir na Home | 45 min |
| Rename "TFTEC Cloud" → "TFTEC Prime" (escopo A, 8 ocorrências) | 15 min |
| A11y + lazy loading + testes manuais | 20 min |
| **Total** | **~2h15** |

**Risco:** baixo. Mudanças são aditivas (componentes novos) + substituições isoladas (logo, decoração hero). Sem refactor de tokens, sem mudança de paleta.

---

## 7. Handoff

Spec ready. Handoff para @sm draftar story. Pontos que @sm precisa resolver com o owner ou inferir:

1. **Escopo do rename "TFTEC Cloud" → "TFTEC Prime"** (categoria A só, ou A+B?)
2. **Bola: Opção A (decoração hero) ou B (card dedicado)?** — Uma recomenda A.
3. **Manter SVGs antigos** (`WorldCupTrophy`, `SoccerBall`) como fallback ou remover de vez? — Uma recomenda manter (zero-risk).
4. **Otimização bola PNG → WebP** entra na story ou vira tech-debt? — Uma recomenda incluir (1 comando, ganho real em mobile).

— Uma, desenhando com empatia 💝
