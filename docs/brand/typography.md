# Tipografia — TFTEC Cloud

> **Status:** Proposta inicial baseada nas características visuais da marca (logo geométrico, moderno, tech). Aguardando confirmação do manual oficial em `4. Manual de Marca/`.

---

## 🔤 Família tipográfica

### Display / Headings — **Space Grotesk**
Sem-serifa geométrica moderna, com personalidade tech. Combina com o logo geométrico-circular da TFTEC Cloud.

- Disponível no Google Fonts (grátis, open-source — SIL Open Font License)
- Weights: 300, 400, 500, 600, 700
- Bom para: títulos, headlines, CTAs, números do leaderboard

### Body / UI — **Inter**
Sem-serifa neutra, otimizada pra interfaces. Excelente legibilidade em telas.

- Disponível no Google Fonts (grátis, open-source)
- Weights: 400, 500, 600, 700
- Bom para: corpo de texto, formulários, navegação, dados tabulares

### Code / Mono — **JetBrains Mono**
Monospace pra elementos técnicos.

- Disponível no Google Fonts
- Bom para: códigos de jogo, IDs de palpite, IDs técnicos

---

## 📏 Escala tipográfica

| Token | Tamanho | Peso | Line height | Uso |
|---|---|---|---|---|
| `display-xl` | 4.5rem (72px) | 700 | 1.05 | Hero principal |
| `display-lg` | 3.5rem (56px) | 700 | 1.1 | Page headings |
| `display-md` | 2.5rem (40px) | 600 | 1.2 | Section headings |
| `display-sm` | 1.875rem (30px) | 600 | 1.25 | Card titles, modais |
| `heading-lg` | 1.5rem (24px) | 600 | 1.3 | h2 dentro de cards |
| `heading-md` | 1.25rem (20px) | 600 | 1.4 | h3 |
| `body-lg` | 1.125rem (18px) | 400 | 1.6 | Texto destacado |
| `body-md` | 1rem (16px) | 400 | 1.6 | Texto padrão |
| `body-sm` | 0.875rem (14px) | 400 | 1.5 | Texto secundário |
| `caption` | 0.75rem (12px) | 500 | 1.4 | Labels, captions |

---

## 🔧 Implementação

### `frontend/index.html`
```html
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@300;400;500;600;700&family=Inter:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500&display=swap" rel="stylesheet">
```

### `tailwind.config.ts`
```ts
extend: {
  fontFamily: {
    display: ['Space Grotesk', 'system-ui', 'sans-serif'],
    sans: ['Inter', 'system-ui', 'sans-serif'],
    mono: ['JetBrains Mono', 'monospace'],
  },
}
```

### Aplicação
```tsx
<h1 className="font-display text-display-lg">Bolão TFTEC Cloud</h1>
<p className="font-sans text-body-md">Faça seu palpite até o início do jogo.</p>
<code className="font-mono text-sm">#A71EF4</code>
```

---

## ✏️ Hierarquia recomendada

```
font-display + brand-gradient  → Logo, hero, prêmios destacados
font-display + text-primary    → Page headings, section titles
font-sans + text-primary       → Body padrão
font-sans + text-secondary     → Texto auxiliar, descrições
font-mono + text-tertiary      → Códigos, IDs técnicos
```

---

## ⚠️ Pendências

- [ ] Confirmar tipografia oficial no manual TFTEC `4. Manual de Marca/tftec-0004-manual-de-marca-v1.pdf`
- [ ] Se houver fonte proprietária TFTEC, hospedar self-host ao invés de Google Fonts
- [ ] Validar suporte a caracteres especiais PT-BR (acentos, ç)
