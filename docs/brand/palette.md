# Paleta Oficial — TFTEC Cloud

Cores extraídas pixel-perfect dos arquivos oficiais em `3. Gradientes/` e `2. Patterns/`.

Última atualização: 2026-05-10

---

## 🎨 Cores principais (gradient brand)

A identidade TFTEC Cloud é definida por um **gradiente magenta → roxo** aplicado horizontalmente.

| Token | Hex | RGB | HSL | Uso |
|---|---|---|---|---|
| `brand-magenta` | `#D012FE` | `rgb(208, 18, 254)` | `hsl(286, 99%, 53%)` | Início do gradiente, CTAs primários, highlights |
| `brand-purple` | `#A71EF4` | `rgb(167, 30, 244)` | `hsl(279, 90%, 54%)` | Meio do gradiente, hover states |
| `brand-violet` | `#7C29E7` | `rgb(124, 41, 231)` | `hsl(266, 80%, 53%)` | Fim do gradiente, links, ícones |

### Gradiente principal (modo claro)
```css
background: linear-gradient(90deg, #D012FE 0%, #A71EF4 50%, #7C29E7 100%);
```

---

## 🌑 Cores de fundo (dark mode — padrão TFTEC)

A marca trabalha primariamente em fundos escuros com pattern de pontos.

| Token | Hex | RGB | Uso |
|---|---|---|---|
| `bg-dark-primary` | `#1D1435` | `rgb(29, 20, 53)` | **Background principal do app** (do pattern oficial) |
| `bg-dark-deep` | `#191E28` | `rgb(25, 30, 40)` | Cards/superfícies (centro do gradiente escuro) |
| `bg-dark-purple` | `#4E1385` | `rgb(78, 19, 133)` | Acento escuro (canto do gradiente escuro) |

### Gradiente escuro (hero/background ambient)
```css
background: radial-gradient(at 0% 100%, #981EFB 0%, #1D1435 40%, #191E28 70%);
```

---

## ✨ Cor de acento extra

| Token | Hex | RGB | Uso |
|---|---|---|---|
| `accent-electric` | `#981EFB` | `rgb(152, 30, 251)` | Picos de cor no fundo escuro, brilhos, focus rings |

---

## ⚪ Neutros (recomendados pra contraste)

Não estão no kit oficial, mas seguem o padrão WCAG AA sobre os fundos da marca:

| Token | Hex | Uso |
|---|---|---|
| `text-primary` | `#FFFFFF` | Texto principal sobre fundo escuro |
| `text-secondary` | `#C9C5D6` | Texto secundário, muted |
| `text-tertiary` | `#7A7589` | Texto de menor hierarquia |
| `border` | `#2A2046` | Bordas, divisores sobre fundo escuro |
| `surface-elevated` | `#241A40` | Cards elevados sobre `bg-dark-primary` |

---

## 🎯 Cores semânticas (status)

Não vêm da marca mas precisam existir. Mantidas próximas ao espectro purple/magenta:

| Status | Hex | Uso |
|---|---|---|
| Success | `#10B981` | confirmações (palpite salvo) |
| Warning | `#F59E0B` | atenção (jogo prestes a iniciar) |
| Error | `#EF4444` | erros (palpite bloqueado) |
| Info | `#A71EF4` | informações (usa o `brand-purple`) |

---

## 🧪 CSS Custom Properties (tokens)

Pra colar direto no `frontend/src/styles/brand.css`:

```css
:root {
  /* Brand */
  --brand-magenta: 286 99% 53%;
  --brand-purple:  279 90% 54%;
  --brand-violet:  266 80% 53%;
  --accent-electric: 271 96% 55%;

  /* Backgrounds (dark mode default) */
  --bg-dark-primary: 257 45% 14%;
  --bg-dark-deep:    216 23% 13%;
  --bg-dark-purple:  273 75% 30%;
  --surface-elevated: 258 41% 18%;

  /* Text */
  --text-primary: 0 0% 100%;
  --text-secondary: 251 14% 81%;
  --text-tertiary: 257 8% 51%;
  --border: 256 38% 20%;

  /* Status */
  --success: 160 84% 39%;
  --warning: 38 92% 50%;
  --error: 0 84% 60%;
}
```

> **Convenção:** valores em HSL sem `hsl()` wrapper. No Tailwind/shadcn isso vira `hsl(var(--brand-magenta))`.

---

## 🌈 Tailwind config (extract)

```ts
// tailwind.config.ts (relevant excerpt)
extend: {
  colors: {
    brand: {
      magenta: 'hsl(var(--brand-magenta))',
      purple: 'hsl(var(--brand-purple))',
      violet: 'hsl(var(--brand-violet))',
      electric: 'hsl(var(--accent-electric))',
    },
    surface: {
      DEFAULT: 'hsl(var(--bg-dark-primary))',
      deep: 'hsl(var(--bg-dark-deep))',
      elevated: 'hsl(var(--surface-elevated))',
    },
  },
  backgroundImage: {
    'brand-gradient': 'linear-gradient(90deg, hsl(var(--brand-magenta)), hsl(var(--brand-violet)))',
    'brand-radial': 'radial-gradient(at 0% 100%, hsl(var(--accent-electric)/0.4), hsl(var(--bg-dark-primary)) 60%)',
  },
}
```

---

## 📐 Regras de uso

### ✅ Faça
- Use o **gradiente magenta→roxo** em CTAs principais ("Fazer palpite", "Cadastrar")
- Use `bg-dark-primary` como fundo padrão do site (dark-first)
- Aplique `accent-electric` em focus states e brilhos pontuais
- Mantenha contraste mínimo 4.5:1 entre texto e fundo (WCAG AA)

### ❌ Evite
- Misturar cores fora desta paleta sem justificativa semântica
- Usar texto em magenta puro sobre roxo puro — baixo contraste
- Aplicar gradiente em corpo de texto (só em headlines/CTAs)
- Substituir o roxo por azul ou rosa fora do espectro definido

---

## 📚 Referências dos arquivos extraídos

| Cor | Arquivo de origem |
|---|---|
| `#D012FE` | `3. Gradientes/JPG/GRADIENTE-CLARO-TFTEC-CLOUD.jpg` (pixel 1,540) |
| `#A71EF4` | mesmo arquivo (pixel 960,540) |
| `#7C29E7` | mesmo arquivo (pixel 1918,540) |
| `#1D1435` | `2. Patterns/JPG/PATTERN-TFTEC-CLOUD-PRINCIPAL.jpg` (background) |
| `#191E28` | `3. Gradientes/JPG/GRADIENTE-ESCURO-TFTEC-CLOUD.jpg` (centro) |
| `#4E1385` | mesmo arquivo (mid-left) |
| `#981EFB` | mesmo arquivo (bottom-left) |

Manual de marca oficial: [`4. Manual de Marca/tftec-0004-manual-de-marca-v1.pdf`](./4.%20Manual%20de%20Marca/tftec-0004-manual-de-marca-v1.pdf)
