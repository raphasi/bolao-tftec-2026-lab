# PWA (Progressive Web App)

Bolão TFTEC Cloud é uma PWA — pode ser instalada como app nativo em mobile/desktop e suporta cache offline para conteúdo público.

## Instalar

**Mobile (iOS/Android):**
1. Abra https://app-fifa-bolao-tftec01.azurewebsites.net no browser (Safari iOS / Chrome Android)
2. Toque no menu → "Adicionar à tela inicial" / "Instalar app"
3. Aparece como ícone independente no home screen

**Desktop (Chrome/Edge):**
1. Abra a URL acima
2. Na barra de endereço, clique no ícone "Instalar" à direita
3. Confirma instalação

## Manifest

`vite-plugin-pwa` gera `manifest.webmanifest` automaticamente com:
- `name`: "Bolão TFTEC FIFA World Cup 2026"
- `short_name`: "Bolão TFTEC"
- `theme_color`: `#1D1435` (TFTEC dark purple)
- `display`: standalone (sem chrome do browser)
- `orientation`: portrait
- Ícones 192x192 e 512x512 (`/icons/pwa-*.png`)

## Cache strategy

| Recurso | Estratégia | TTL |
|---|---|---|
| Assets estáticos (JS/CSS/PNG/SVG/woff2) | Precache (sempre cacheado) | até nova build |
| `/api/(matches\|groups\|leaderboard)` GET | NetworkFirst (5s timeout → cache) | 5 min |
| `flagcdn.com/*` | CacheFirst | 30 dias |
| `/api/auth/*` `/api/predictions/*` `/api/admin/*` | NÃO cacheado (sempre network) | — |

**Offline behavior:** se network falhar, conteúdo público pré-cacheado responde do cache. Operações autenticadas (palpitar, login) requerem conexão — falha graciosamente.

## Auto-update

`registerType: 'autoUpdate'` no plugin: novo Service Worker baixa em background e fica em estado "waiting".

Quando detectado, o componente `PWAUpdatePrompt` (`frontend/src/components/layout/PWAUpdatePrompt.tsx`) exibe um banner inferior com:
- Texto "Nova versão disponível"
- Botão "Atualizar" → chama `updateSW(true)` que faz `skipWaiting()` + reload

## Dev workflow

`vite.config.ts` setado com `devOptions: { enabled: false }` — Service Worker não roda em dev (`npm run dev`). Para testar PWA local, faz `npm run build && npm run preview`.

## Ícones (TODO S5+)

Os ícones atuais (`pwa-192.png`, `pwa-512.png`) são cópias diretas do `tftec-icon.png` original (1055x910 não-quadrado). Browser scaleia em runtime — visual sub-ótimo.

Para corrigir, gerar PNGs quadrados 192x192 e 512x512 com padding adequado (Web App Manifest spec) e substituir em `frontend/public/icons/`.

## Lighthouse

PWA score esperado: 100/100 quando todos os checks passam (manifest, SW, instalável, theme color, viewport). Rodar via Chrome DevTools → Lighthouse → PWA tab.
