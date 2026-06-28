# Identidade Visual — TFTEC Cloud

Diretório oficial da marca **TFTEC Cloud** aplicada ao Bolão FIFA 2026.

> **Status:** ✅ Kit completo recebido (2026-05-10). Cores extraídas pixel-perfect dos arquivos oficiais. Tipografia proposta para confirmação.

---

## 📁 Estrutura

```
docs/brand/
├── README.md                              ← este arquivo
├── palette.md                             ✅ paleta oficial extraída
├── typography.md                          ✅ tipografia proposta
│
├── 1. Logos/                              ✅ Logos oficiais
│   ├── CMYK (impressão)/
│   │   ├── JPEG/ · PNG/                   ← rasterizado para print
│   │   ├── AI/                            ⛔ ignorado no git (.gitignore)
│   │   └── EPS/                           ⛔ ignorado no git (.gitignore)
│   └── RGB (digital)/                     ← usado pelo frontend
│       ├── JPG/ · PNG/                    ✅ commitado
│       ├── AI/                            ⛔ ignorado
│       └── EPS/                           ⛔ ignorado
│
├── 2. Patterns/                           ✅ padrões/texturas
│   ├── JPG/ · PNG/                        ✅ commitado
│   ├── AI/                                ⛔ ignorado
│   └── EPS/                               ⛔ ignorado
│
├── 3. Gradientes/                         ✅ exemplos oficiais de gradiente
│   ├── JPG/                               ✅ commitado (fonte das cores)
│   ├── AI/                                ⛔ ignorado
│   └── EPS/                               ⛔ ignorado
│
├── 4. Manual de Marca/                    ✅ PDF oficial
│   └── tftec-0004-manual-de-marca-v1.pdf
│
└── 5. Avatares/                           ✅ refs para redes sociais
    ├── *.png                              ✅ commitado
    └── *.psd                              ⛔ ignorado
```

**Política de versionamento:** apenas formatos web (PNG/JPG/SVG/PDF) entram no repo. Fontes editáveis (AI/EPS/PSD/INDD) ficam locais no `.gitignore`. Designers acessam os fontes via drive interno da TFTEC.

---

## 🎨 Cores oficiais (resumo)

| Token | Hex | Uso |
|---|---|---|
| `brand-magenta` | `#D012FE` | CTAs primários, início de gradiente |
| `brand-purple` | `#A71EF4` | Hover states, meio de gradiente |
| `brand-violet` | `#7C29E7` | Links, ícones, fim de gradiente |
| `bg-dark-primary` | `#1D1435` | Background principal do app |
| `bg-dark-deep` | `#191E28` | Cards e superfícies |
| `accent-electric` | `#981EFB` | Focus rings, brilhos pontuais |

📄 Detalhes completos em [`palette.md`](./palette.md).

---

## 🔤 Tipografia (proposta)

- **Display:** Space Grotesk (geométrica moderna)
- **Body:** Inter (legibilidade UI)
- **Mono:** JetBrains Mono (códigos)

📄 Detalhes em [`typography.md`](./typography.md).

---

## 🎯 Onde cada asset é consumido

| Asset | Arquivo de origem | Local de consumo no app |
|---|---|---|
| Logo horizontal (light) | `1. Logos/RGB (digital)/PNG/LOGO-TFTEC-CLOUD-PRINCIPAL.png` | `frontend/src/components/layout/Navbar.tsx` (versão dark) |
| Ícone isolado | `1. Logos/RGB (digital)/PNG/ICONE-TFTEC-CLOUD-PRINCIPAL.png` | Favicon, splash screen do PWA |
| Logo negativo (fundo escuro) | `1. Logos/RGB (digital)/PNG/LOGO-TFTEC-CLOUD-MONOCROMATICO-NEGATIVO.png` | Footer, áreas com fundo claro |
| Pattern | `2. Patterns/JPG/PATTERN-TFTEC-CLOUD-PRINCIPAL.jpg` | Background hero, áreas decorativas |
| Gradient claro | usado como referência → CSS `linear-gradient` | CTAs, headers, cards de destaque |
| Gradient escuro | usado como referência → CSS `radial-gradient` | Ambient background do app |

---

## ✅ Checklist de aplicação no projeto

- [x] Paleta documentada (`palette.md`)
- [x] Tipografia proposta (`typography.md`)
- [x] `.gitignore` configurado para formatos editáveis
- [ ] `frontend/src/styles/brand.css` com tokens HSL
- [ ] `tailwind.config.ts` com extends de cores
- [ ] Logo aplicado no Navbar
- [ ] Favicon configurado
- [ ] Manifest PWA com cores brand
- [ ] Validação WCAG AA (contraste mínimo 4.5:1)

A aplicação prática rola no **Block 1.6** da Sprint S1.
