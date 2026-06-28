# Regras de Pontuação — Bolão TFTEC Cloud

Documento oficial das regras de pontuação. **Fonte da verdade executável:** `functions/src/shared/scoring.ts::calcMatchPoints` — este documento deve espelhá-lo (não o contrário).

---

## 🎯 Resumo executivo

| Categoria | Item | Pontos |
|---|---|---|
| **Por jogo (72 jogos da fase de grupos)** | Placar exato | **25** |
| | Acertou o vencedor ou o empate (sem acertar os gols) | **15** |
| | Errou | 0 |
| **Palpites especiais** | Campeão | **150** |
| | Vice-campeão | **75** |
| | 3º lugar | **40** |
| | 4º lugar | **40** |
| | Artilheiro (Chuteira de Ouro) | **120** |
| | Bônus top 4 completo (ordem livre) | **+50** |

**Máximo teórico:** 72 × 25 + 150 + 75 + 40 + 40 + 120 + 50 = **2.275 pts**
**Máximo realista (jogador muito bom):** ~800-1.100 pts

---

## 📐 Pontuação por jogo

### Regra detalhada

Dado um palpite `(predictedHome, predictedAway)` e resultado real `(actualHome, actualAway)`:

```ts
function scoreMatch(
  predictedHome: number, predictedAway: number,
  actualHome: number, actualAway: number,
): number {
  // 1. Placar exato — 25 pts
  if (predictedHome === actualHome && predictedAway === actualAway) {
    return 25;
  }

  // 2. Acertou o vencedor (ou o empate), sem o placar exato — 15 pts
  const predictedWinner = Math.sign(predictedHome - predictedAway);
  const actualWinner = Math.sign(actualHome - actualAway);
  if (predictedWinner === actualWinner) {
    return 15;
  }

  // 3. Errou — 0 pts
  return 0;
}
```

### Exemplos práticos

| Palpite | Resultado real | Pontos | Por quê |
|---|---|---|---|
| 2-1 | 2-1 | **25** | Placar exato |
| 3-2 | 2-1 | **15** | Acertou o vencedor (sem o placar) |
| 4-0 | 2-1 | **15** | Acertou o vencedor (sem o placar) |
| 1-1 | 0-0 | **15** | Acertou o empate (sem o placar) |
| 1-1 | 2-2 | **15** | Acertou o empate (sem o placar) |
| 2-1 | 1-2 | **0** | Errou o vencedor |
| 0-0 | 1-1 | **15** | Acertou o empate (sem o placar) |
| 0-0 | 1-0 | **0** | Errou (palpitou empate, foi vitória) |
| 3-1 | 3-1 | **25** | Placar exato |
| 3-1 | 4-2 | **15** | Acertou o vencedor (sem o placar) |

### Casos especiais

- **Sem palpite:** 0 pontos (não houve aposta)
- **Jogo cancelado/adiado:** mantém palpite, recalcula quando jogo realmente acontecer
- **Decisão por pênaltis:** só conta o tempo regulamentar (90min). 1-1 que vira 1-1 (4-3 pen) = empate 1-1 para fins de pontuação.

---

## 🏆 Palpites especiais

Estes palpites são **fechados na abertura oficial da Copa** (antes do 1º jogo) e calculados **após a final**.

### Tabela de pontos

| Acerto | Pontos | Comentário |
|---|---|---|
| Campeão | **150** | A maior pontuação isolada — acertar é raro |
| Vice-campeão | **75** | Acertar quem perde a final |
| 3º lugar | **40** | Acertar quem ganha disputa do 3º |
| 4º lugar | **40** | Acertar quem perde disputa do 3º |
| Artilheiro (Chuteira de Ouro) | **120** | Jogador com mais gols na Copa |
| Bônus top 4 completo | **+50** | Se acertou as 4 seleções do top 4, qualquer ordem |

### O bônus top 4 (50 pts)

**Trigger:** suas 4 escolhas (campeão, vice, 3º, 4º) batem com o top 4 real, **em qualquer ordem**.

**Exemplo:**
- Seu palpite: campeão=Brasil, vice=Argentina, 3º=França, 4º=Inglaterra
- Real: campeão=Argentina, vice=França, 3º=Brasil, 4º=Inglaterra
- Resultado:
  - Campeão: 0 (errou)
  - Vice: 0 (errou)
  - 3º: 0 (errou)
  - 4º: 40 (acertou Inglaterra)
  - **Bônus top 4: +50** (suas 4 seleções estão no top 4 real)
  - Total: 90 pts

### Artilheiro

- **1 palpite por jogador.** Se 2 jogadores empatam no número de gols, ambos acertaram (ambos recebem 120 pts). Critério oficial FIFA: em caso de empate, vence quem deu mais assistências, depois quem jogou menos minutos.

---

## ⏰ Janela de palpite (lock)

### Jogos
- **Pode editar:** enquanto `kickoffUtc > now`
- **Bloqueado:** assim que `now >= kickoffUtc`, o backend rejeita updates e marca `lockedAt`
- **UI:** desabilita inputs e mostra "Trancado às HH:MM"

### Especiais
- **Pode editar:** enquanto Copa não começou (`now < firstMatch.kickoffUtc`)
- **Bloqueado:** assim que o 1º jogo começa, todos os 5 palpites especiais ficam read-only

> O backend é a **fonte de verdade** do lock. UI desabilita inputs apenas para conveniência — qualquer POST após o lock retorna `409 Conflict`.

---

## 🧮 Cálculo do leaderboard

`totalPoints = matchPoints + specialPoints`

```ts
matchPoints = predictions
  .filter(p => p.points !== null)
  .reduce((sum, p) => sum + p.points, 0);

specialPoints = special.points.champion
              + special.points.runnerUp
              + special.points.thirdPlace
              + special.points.fourthPlace
              + special.points.topScorer
              + special.points.top4Bonus;
```

Ordenação do leaderboard:
1. `totalPoints` DESC (mais pontos primeiro)
2. `perfectScores` DESC (desempate: quem acertou mais placares exatos)
3. `createdAt` ASC (último critério: quem cadastrou primeiro)

---

## 🛡️ Validações

### Backend (autoritativo)
- `predictedHome` e `predictedAway`: inteiros entre **0 e 15**
- `kickoffUtc > now` no momento do POST
- `userId` extraído do JWT (não confia em body)
- Schema Zod estrito (rejeita campos extras)

### Frontend (conveniência)
- Inputs `type="number"` com `min=0 max=15`
- Desabilita após `kickoffUtc`
- Contador regressivo até o lock (Sprint 2)

---

## 📊 Probabilidade vs Pontuação (justificativa do balanceamento)

Por que esses valores?

| Acerto | Probabilidade aproximada | Pontos | Pontos esperados (E[X]) |
|---|---|---|---|
| Placar exato | ~10% | 25 | 2.5 |
| Acertou vencedor/empate (sem placar) | ~45% | 15 | 6.75 |
| Errou | ~45% | 0 | 0 |
| **Esperado por jogo (chute aleatório)** | | | **~9 pts** |

- Aluno **médio** (chuta aleatório informado): ~9 × 72 ≈ 650 pts em jogos
- Aluno **bom** (acerta vencedor ~50%, exato ~15%): ~12-13 × 72 ≈ 850-950 pts
- Aluno **excepcional**: ~16+ × 72 + acertos especiais = 1150+ pts

Campeão (150) e artilheiro (120) são "swing factors": acertar um deles compensa ~5 jogos de placar exato.

---

## 🔧 Implementação no código

### Engine (fonte da verdade)
- `functions/src/shared/scoring.ts` — `calcMatchPoints` (25/15/0) + cálculo dos especiais

### Function
- `functions/src/functions/calc-predictions.ts` — calcula points quando admin finaliza o match
- `functions/src/functions/aggregate-leaderboard.ts` — agrega total + `perfectScores` (placar exato = 25, usado no desempate)

### Frontend (apenas exibe — não recalcula)
- `frontend/src/pages/Home.tsx` — tabela resumida "Como pontuar"
- `frontend/src/pages/Regras.tsx` — regras completas + exemplos
- `frontend/src/pages/{Leaderboard,Perfil}.tsx` — exibem pontos/placares exatos

---

## 🔄 Histórico de revisões

| Data | Versão | Mudança |
|---|---|---|
| 2026-05-10 | 1.0 | Versão inicial — placar exato 25, campeão 150, artilheiro 120 |
| 2026-05-15 | 2.0 | **Por jogo passa a 25/15/0** (decisão do owner) — supersede ADR-014 (10/5/0). Engine, Regras, Home e este doc alinhados; consumidores de "placar exato" ajustados (10→25). |

> A pontuação está sujeita a ajustes antes do início da Copa. Após o 1º jogo, a tabela **não muda mais** para preservar fairness.
