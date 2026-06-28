/**
 * Micro-servidor estático do SPA do Bolão (S6.2 / ADR-020 / Epic S6).
 *
 * Por que Express e não `pm2 serve`:
 *   - `pm2 serve` falhou sob WEBSITE_RUN_FROM_PACKAGE (worker não subia —
 *     pm2 não resolvível no PATH, porta ≠ $PORT, estado em FS read-only).
 *   - Express só LÊ de ./dist (compatível com wwwroot read-only do
 *     Run-From-Package) e usa process.env.PORT (a porta que o App Service
 *     realmente sonda). `node` está sempre no PATH da imagem.
 *
 * Empacotado junto: server.js + package.json + node_modules/express + dist/.
 * Startup command no App Service: `node server.js`.
 */
const path = require('path');
const express = require('express');

const app = express();

// Atrás do App Service LB hoje e do Application Gateway no futuro (S6.4):
// confia em X-Forwarded-* para protocolo/IP corretos.
app.set('trust proxy', 1);

// Esconde o stack — sem isto toda resposta carrega "X-Powered-By: Express"
// (fingerprint trivial p/ scanners; o backend já faz o disable, o front não fazia).
app.disable('x-powered-by');

// Headers de segurança no DOCUMENTO de navegação (o SPA). A API tem helmet, mas
// este micro-servidor estático não emitia NENHUM header — securityheaders.com dava
// "F" e a página era enquadrável (clickjacking). Aplicado a todas as respostas.
// CSP: connect-src libera o Azure SignalR (realtime via /api/negotiate → wss
// *.service.signalr.net); sem isso a CSP quebraria o tempo-real.
// Split front/API (sem Front Door): a API é OUTRA origem, então o CSP precisa
// liberá-la no connect-src senão o navegador bloqueia as chamadas do SPA.
// Defina a app setting API_ORIGIN = URL da API (ex.: https://<api>.azurewebsites.net).
// Atrás de Front Door (same-origin) não é necessário — deixe vazio.
const API_ORIGIN = process.env.API_ORIGIN ? ` ${process.env.API_ORIGIN}` : '';
const CONTENT_SECURITY_POLICY = [
  "default-src 'self'",
  "base-uri 'self'",
  "object-src 'none'",
  "frame-ancestors 'none'",
  "img-src 'self' data:",
  "script-src 'self'",
  "style-src 'self' https://fonts.googleapis.com 'unsafe-inline'",
  "font-src 'self' https://fonts.gstatic.com data:",
  `connect-src 'self' https://*.service.signalr.net wss://*.service.signalr.net${API_ORIGIN}`,
  "form-action 'self'",
  'upgrade-insecure-requests',
].join('; ');

app.use((_req, res, next) => {
  res.removeHeader('Server');
  res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  res.setHeader('Content-Security-Policy', CONTENT_SECURITY_POLICY);
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=(), payment=()');
  next();
});

const DIST = path.join(__dirname, 'dist');

// Health-probe dedicado — usado pelo health probe do Front Door (ADR-021)
// e para smoke. Não depende do SPA estar íntegro.
app.get('/healthz', (_req, res) => res.status(200).send('ok'));

// /api/* NUNCA é servido por este host. Via Front Door (same-origin) essas
// rotas vão para a API (rota /api/* → og-api). Se chegarem aqui (acesso
// DIRETO ao host do front, fora do AFD), responder erro explícito em vez do
// index.html — senão o catch-all devolveria HTML 200 onde o axios espera
// JSON e a falha viraria silenciosa (mascaramento). Vale prod e self-host.
app.all('/api/*', (_req, res) =>
  res.status(502).json({
    error: { code: 'BAD_GATEWAY', message: 'API indisponível neste host — use o endpoint do Front Door.' },
  }),
);

// Assets estáticos do build (JS/CSS/img/sw).
// index:false → o catch-all abaixo decide o que serve em "/" (o index.html).
// sw.js / manifest / index.html: no-cache no edge (AFD) e no browser, senão o
// AFD serviria service-worker/HTML VELHO até o TTL e o deploy ficaria "preso"
// (index.html stale aponta p/ bundles hasheados já apagados → tela branca).
// Os assets JS/CSS são content-hashed (imutáveis) → cache de 1h é seguro.
app.use(
  express.static(DIST, {
    index: false,
    maxAge: '1h',
    setHeaders: (res, filePath) => {
      const base = path.basename(filePath);
      if (base === 'sw.js' || base === 'manifest.webmanifest' || base === 'index.html') {
        res.setHeader('Cache-Control', 'no-cache');
      }
    },
  }),
);

// Scanners (nuclei/nikto/dirsearch) batem em /.env, /.git/config, /server.js,
// /package.json etc. O catch-all do SPA devolveria index.html com 200 — o que vira
// "200 em /.env → ENV EXPOSTO" no relatório do scanner (falso-positivo, mas é munição
// de print). Aqui devolvemos 404 honesto para dotfiles e arquivos "de projeto" que
// NÃO fazem parte do SPA. (Assets reais .js/.css já foram servidos pelo express.static
// acima; só cai aqui o que NÃO existe.) Exceção: /.well-known/ (RFC 9116, padrão web).
app.get(/^\/\.(?!well-known\/)/, (_req, res) => res.status(404).type('txt').send('Not Found'));
app.get(/\.(?:js|mjs|cjs|json|map|ya?ml|env|pfx|p12|pem|key|lock|sh|ps1|ts|md)$/i, (_req, res) =>
  res.status(404).type('txt').send('Not Found'),
);

// Fallback SPA: qualquer rota desconhecida → index.html (roteamento client-side).
// no-cache para o edge sempre revalidar o documento de navegação.
app.get('*', (_req, res) => {
  res.setHeader('Cache-Control', 'no-cache');
  res.sendFile(path.join(DIST, 'index.html'));
});

const port = process.env.PORT || 8080;
app.listen(port, () => {
  // eslint-disable-next-line no-console
  console.log(`[frontend-server] SPA servido em :${port} (dist=${DIST})`);
});
