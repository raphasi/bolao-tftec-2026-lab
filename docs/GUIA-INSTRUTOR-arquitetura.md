# 🎓 Guia do Instrutor — Por que cada tecnologia (fundamentação técnica)

> 🔒 **Uso exclusivo do instrutor.** Este documento NÃO faz parte do passo a passo do aluno
> (`setup-portal.md`). Ele explica **o porquê** de cada escolha de arquitetura, o que cada peça
> faz, os trade-offs e as perguntas que os alunos costumam fazer — para você conduzir o evento com
> segurança e responder "por que isso e não aquilo?".

---

## 1. Visão geral em uma frase

O Bolão é uma aplicação **orientada a eventos**: o admin lança um placar e, **sem ninguém clicar
em "recalcular"**, a pontuação de todos os palpiteiros é recalculada e o ranking se reordena **ao
vivo** na tela. Quase toda a escolha de tecnologia existe para tornar esse fluxo **reativo,
barato e simples de operar**.

```
 Navegador  ──HTTPS──▶  App Service (API Node/Express)  ──▶  Cosmos DB (NoSQL)
     ▲                                                            │
     │ push ao vivo                                               │ Change Feed (o coração)
     │                                                            ▼
  SignalR  ◀──────────────────  Azure Functions (pontuação, event-driven)
```

**A ideia-chave:** o **Change Feed do Cosmos** é o "sistema nervoso". Cada escrita no banco
**dispara** uma Function, que escreve em outro container, que dispara a próxima Function — até o
SignalR empurrar o resultado para o navegador. É isso que faz o app ser "tempo real" sem
polling, sem fila de mensagens e sem cron de recálculo.

---

## 2. Tabela-resumo: o que é cada peça e por que está aqui

| Recurso | Papel no Bolão | Por que ESTE e não outro | Camada/custo |
|---|---|---|---|
| **Azure Cosmos DB** (NoSQL) | Banco principal: usuários, palpites, jogos, ranking, auditoria | **Change Feed** nativo (dispara as Functions) + schema flexível + serverless | Free Tier (1000 RU/s, 25 GB) |
| **Azure Functions** (Consumption) | **Calculam os pontos** e agregam o ranking, reagindo a mudanças no banco | Serverless event-driven; ligam direto no Change Feed; paga só quando roda | ~zero (cota grátis) |
| **Azure SignalR** | Empurra o ranking atualizado para o navegador **em tempo real** | WebSocket gerenciado; o app não gerencia conexões | Free F1 (serverless) |
| **App Service** (B1 Linux) | Hospeda a **API** (Node/Express) e o **frontend** (React SPA) | PaaS simples; HTTPS/cert/escala sem gerenciar VM | B1 (~US$13/mês) |
| **Key Vault** | Guarda os segredos (Cosmos, JWT, SignalR) fora do código | Segredo lido por **Managed Identity**, sem senha em texto | Free (operações) |
| **App Insights + Log Analytics** | Logs, métricas, diagnóstico de tudo | Observabilidade nativa do Azure | Free (5 GB/mês) |
| **Storage Account** | Runtime das Functions (estado interno + pacote) | Requisito da plataforma Functions | Standard LRS (centavos) |

> 💡 **Mensagem pedagógica:** não escolhemos serviços "porque são da moda". Cada um resolve um
> problema concreto que apareceria de qualquer forma — e o Azure nos dá a versão **gerenciada**
> dele (não precisamos operar servidor de WebSocket, nem cluster de banco, nem fila).

---

## 3. Por que **Cosmos DB (NoSQL)** e não um banco SQL?

Esta é a pergunta nº 1 dos alunos. Há quatro motivos, em ordem de importância para ESTE app:

### 3.1 Change Feed — o motivo decisivo
O Cosmos tem um **feed de mudanças** nativo e gerenciado: toda inserção/atualização num container
vira um **evento** ao qual uma Azure Function se "inscreve". É isso que dispara a pontuação
**automaticamente** quando o admin lança um resultado — **sem polling, sem trigger de banco, sem
fila**.

- Num **SQL tradicional** (Azure SQL, PostgreSQL…) você teria que **emular** isso: ou um job que
  fica perguntando "tem resultado novo?" a cada X segundos (polling, desperdício e latência), ou
  CDC/Change Tracking + um conector, ou disparar manualmente uma fila (Service Bus) a cada escrita.
  Mais peças, mais código, mais pontos de falha.
- Com Cosmos, a "assinatura" é **uma linha de binding** na Function (`app.cosmosDB(...)`). O
  encadeamento `resultado → cálculo → agregação → tempo real` sai quase de graça.

> 🧠 **Para o aluno:** "O banco avisa quando algo muda, e a função reage. Não precisamos ficar
> perguntando." É o conceito de **event-driven** na prática.

### 3.2 Schema flexível (documentos JSON)
Palpites, jogos e especiais têm formatos diferentes e que evoluem. Num documento JSON você
adiciona um campo sem `ALTER TABLE`/migração. Para um app que muda rápido (e para uma aula), isso
reduz atrito. O preço: **você** garante a consistência do formato no código (validação Zod no
backend) em vez de o banco impor o schema.

### 3.3 Casamento com serverless e escala previsível
Cosmos cobra por **throughput (RU/s)** e foi feito para parear com Functions Consumption: ambos
escalam horizontalmente e cabem no padrão "paga pelo uso". Para o bolão (picos quando sai
resultado, silêncio no resto), isso é ideal. As **partition keys** (ex.: `predictions` por
`/userId`) distribuem a carga para não "esquentar" uma partição.

### 3.4 Modelo de dados naturalmente desnormalizado
O ranking é lido o tempo todo e calculado a partir de muitos palpites. Em NoSQL, a gente
**pré-agrega** o ranking num container `leaderboard` (uma leitura barata serve a tela), em vez de
um `JOIN`/`GROUP BY` caro a cada visita. NoSQL favorece "modele para a leitura".

> ⚖️ **Quando SQL seria melhor?** Se o domínio fosse fortemente relacional e transacional
> (transferências bancárias, joins complexos ad-hoc, relatórios SQL arbitrários). O bolão não é
> isso: são **escritas-evento** e **leituras pré-agregadas**. Vale dizer isso aos alunos — não é
> "NoSQL é melhor", é "a ferramenta casa com o problema".

### 3.5 Como isso aparece no lab
**14 containers** (9 de dados + **5 de lease**). Os *lease containers* são o "marca-página" do
Change Feed — guardam até onde cada Function já leu. Sem eles, a Function não sabe o que é "novo"
e **falha em silêncio** (por isso o guia insiste tanto neles).

---

## 4. O que as **Azure Functions** fazem (e por que serverless)

As Functions são o **motor de pontuação**. São **6**, e 5 delas são disparadas pelo **Change Feed**
(a 6ª é um cron de saúde):

| Function | Dispara quando… | O que faz |
|---|---|---|
| `calc-predictions` | muda **`matches-cache`** (admin finaliza um jogo) | calcula 25/15/0 para **cada palpite** daquele jogo |
| `calc-specials` | muda **`config`** (resultado final/especiais) | calcula os pontos dos palpites especiais (campeão, artilheiro…) |
| `aggregate-from-predictions` | muda **`predictions`** (pontos recalculados) | soma o total de cada usuário no **`leaderboard`** |
| `aggregate-from-specials` | muda **`specials`** | soma os especiais no **`leaderboard`** |
| `emit-leaderboard-update` | muda **`leaderboard`** | **empurra** o ranking novo para o **SignalR** |
| `health-check-cron` | a cada 5 min (timer) | sonda de saúde (mantém o app "acordado"/observável) |

### Por que serverless (Consumption)?
- **Paga só quando roda.** O scoring só acontece quando sai resultado — o resto do tempo custa
  ~zero. Um servidor sempre-ligado para isso seria desperdício.
- **Escala sozinho.** Se 10 jogos terminam juntos, a plataforma sobe instâncias; depois volta a
  zero.
- **Liga direto no Change Feed.** O binding do Cosmos é nativo — pouquíssimo código de
  "encanamento".

> ⚙️ **Detalhe operacional (vale ouro no evento):** o modelo v4 de Functions Node **ainda não
> suporta Node 24** — com 24 o worker **não indexa as functions** e o scoring **nunca dispara**,
> mesmo com deploy verde. Por isso a Function App roda em **Node 22** (as Web Apps seguem em 24).
> Se a pontuação "não acontece", confira isto primeiro.

---

## 5. O que o **SignalR** faz — e sem ele, o que muda?

### O que faz
SignalR é um **WebSocket gerenciado**. Quando o `leaderboard` muda, a Function
`emit-leaderboard-update` manda o ranking novo pelo SignalR, e **todos os navegadores conectados
recebem na hora** — a tabela se reordena **sem refresh**. O app não precisa gerenciar conexões,
reconexões nem broadcast: o serviço faz isso.

### Sem SignalR, o que seria diferente?
**O app continua 100% funcional.** O que muda é **só a atualização ao vivo** do ranking:

| Com SignalR | Sem SignalR |
|---|---|
| O placar lança → o ranking **se reordena sozinho** na tela de todos | A pontuação **continua acontecendo** (as Functions calculam igual) e é gravada no `leaderboard`… |
| Experiência "ao vivo", efeito uau no evento | …mas o usuário só vê o ranking novo ao **recarregar a página** (ou na próxima navegação) |

Ou seja: **sem SignalR você não perde dados nem pontuação — perde o "tempo real".** É um recurso
de **experiência**, não de correção. Por isso, em ambientes mais enxutos, ele é considerado
**opcional**: dá para subir o bolão sem SignalR e tudo funciona, só sem o auto-refresh.

> 🧠 **Para o aluno:** "SignalR é o que faz a mágica de a tabela mexer sozinha. Tire ele e o jogo
> continua certo — você só precisa apertar F5 para ver o novo ranking."

### Por que **Serverless mode** no SignalR?
Nesta arquitetura, **as Functions** (não um servidor de hub) é que publicam mensagens. O modo
**Serverless** do SignalR é exatamente esse cenário: sem servidor de hub próprio, as Functions
mandam via *output binding*. Casa com o resto (tudo event-driven, paga-pelo-uso). O tier **Free
F1** aguenta dezenas de conexões — suficiente para uma turma.

---

## 6. Por que **App Service** para API e frontend?

- É **PaaS**: você sobe código Node e o Azure cuida de HTTPS, certificado, balanceamento e escala —
  **sem gerenciar VM** nem servidor web. Para um lab, tira um monte de complexidade.
- **API e frontend separados (split)**, no mesmo plano **B1**: a API é Node/Express (cérebro), o
  frontend é um React SPA servido por um mini-Express. Separar deixa claro o papel de cada um e
  permite escalar/depurar de forma independente.
- **Por que B1 e não F1 (grátis)?** O F1 hiberna (cold start) e não tem "Always On"; o B1
  (~US$13/mês) dá uma experiência estável no evento. Ambos sofrem com a **cota regional** da trial
  (por isso o guia manda descobrir a região com cota antes de tudo).

> 🧩 **Lab vs Produção:** no lab é **split sem Front Door** (front e API em URLs diferentes, ligados
> por CORS). Em produção a TFTEC usa **Front Door** (mesma origem, `/api/*` roteado pela borda,
> origens isoladas). É por isso que alguns testes/CORS diferem entre os dois — vale saber para
> responder dúvidas.

---

## 7. Por que **Key Vault + Managed Identity** (e não a senha no código)?

- **O problema:** se a chave do Cosmos ou o `JWT_SECRET` ficam num arquivo do repositório ou numa
  App Setting em texto, vazam num print, num fork público, num screenshare.
- **A solução:** os segredos vivem **só no Key Vault**. A App Setting da API guarda apenas um
  *ponteiro* (`@Microsoft.KeyVault(SecretUri=...)`). Quando o app inicia, ele usa a **Managed
  Identity** (uma identidade do próprio App Service, sem senha) para **buscar** o valor real.
- **Resultado:** **nenhuma senha** no código, no Git ou na config. Para rotacionar, você troca
  **só no cofre** e o app pega a nova versão — sem redeploy.

> 🧠 **Conceito para a aula:** "identidade gerenciada" = o recurso do Azure **é** uma identidade
> que recebe permissão (RBAC) de **ler segredos**. Ninguém digita senha em lugar nenhum.

---

## 8. Observabilidade e Storage (as peças "de apoio")

- **Application Insights + Log Analytics:** instrumentam API e Functions — logs, latência, falhas,
  usuários ativos. É o que permite responder "por que está lento?" / "a function rodou?". No lab
  são opcionais, mas recomendados (a página "Operação ao vivo" do admin consome o App Insights).
- **Storage Account:** a Function App **exige** uma storage para o runtime (estado interno do host
  + pacote de deploy). Não é opcional — é requisito da plataforma. _(No assistente novo de
  Consumption ela é criada automaticamente.)_

---

## 9. O fluxo completo de uma pontuação (use isto no quadro)

Conte essa história — é o melhor jeito de amarrar tudo:

1. **Admin** abre o painel e lança o placar de um jogo → a API grava em **`matches-cache`**.
2. O **Change Feed** do Cosmos detecta a mudança e dispara **`calc-predictions`**.
3. Essa Function lê **todos os palpites** daquele jogo e calcula **25/15/0** para cada um →
   grava os pontos em **`predictions`**.
4. Nova mudança em `predictions` → o Change Feed dispara **`aggregate-from-predictions`**, que
   **soma** o total de cada usuário em **`leaderboard`**.
5. Mudança em `leaderboard` → dispara **`emit-leaderboard-update`**, que **publica** o ranking novo
   no **SignalR**.
6. O **SignalR** empurra para todos os navegadores conectados → a **tabela se reordena sozinha**.

> Tudo isso em **~segundos**, sem ninguém apertar "recalcular". **Cada seta é um Change Feed** — e
> é por isso que escolhemos Cosmos. Tire o Change Feed e essa cadeia inteira precisaria de filas e
> jobs manuais.

---

## 10. Simplificações do lab (vs. produção) — e por quê

| No lab (aprendizado) | Em produção | Motivo da simplificação |
|---|---|---|
| Cosmos em **rede pública** | Cosmos atrás de **Private Endpoint** (rede privada) | Deploy/seed/validação sem dor de cabeça de rede; fechamos por partes na Fase 11 |
| **Sem Front Door** (split + CORS) | **Front Door** (mesma origem, WAF) | Menos peças para o aluno; foco no essencial |
| Segredos no **Key Vault** (mantido) | Igual | Boa prática que vale a pena ensinar |
| **B1** | P1V3 / autoscale | Custo; o B1 entrega a experiência do evento |
| Helpers de teste como **workflows** (seed, abrir palpites) | Pipelines próprios | Tirar o terminal do caminho do aluno |

> 🧠 **Filosofia do lab:** montar **tudo aberto e funcionando** primeiro (linha de base), e só então
> **fechar as portas uma a uma** (Fase 11), testando entre cada fechamento. Assim, se algo quebra,
> o aluno sabe **exatamente** qual passo causou.

---

## 11. Perguntas que os alunos fazem (respostas curtas)

- **"Por que não MySQL/Postgres?"** → Porque o coração do app é reagir a mudanças do banco
  (Change Feed). Em SQL isso exigiria polling/CDC/filas. Cosmos dá isso nativo. (§3)
- **"As Functions são um servidor?"** → Não. São código que **a plataforma roda sob demanda**
  quando algo muda no banco; o resto do tempo custa ~zero. (§4)
- **"Se eu tirar o SignalR, quebra?"** → Não. A pontuação continua certa; você só perde o
  auto-refresh do ranking (precisa F5). (§5)
- **"Por que tantos containers (14)?"** → 9 guardam dados; 5 são *leases* (marca-página do Change
  Feed). Sem os leases, o scoring não dispara. (§3.5)
- **"Por que Key Vault se dá mais trabalho?"** → Para **nenhuma senha** ficar no código/Git. A
  identidade do app lê o segredo sozinha. (§7)
- **"O placar não atualizou, e agora?"** → 90% das vezes é **lease container faltando** ou a
  **Function App em Node 24** (tem que ser ~22). (§4)

---

## 12. Mapa rápido código ↔ conceito (se quiser mostrar o fonte)

| Conceito | Onde no código |
|---|---|
| Regra de pontuação (25/15/0 + especiais) | `functions/src/shared/scoring.ts` |
| Disparo por resultado | `functions/src/functions/calc-predictions.ts` (`app.cosmosDB`) |
| Agregação do ranking | `functions/src/functions/aggregate-leaderboard.ts` |
| Push em tempo real | `functions/src/functions/emit-leaderboard-update.ts` (output SignalR) |
| Lock de palpite (kickoff) | backend (`predictions`) — fonte de verdade; UI só desabilita |
| Segredos por referência | App Settings da API = `@Microsoft.KeyVault(...)` + Managed Identity |

> Regras de pontuação detalhadas (tabelas, exemplos, balanceamento): ver
> [`scoring-rules.md`](./scoring-rules.md).
