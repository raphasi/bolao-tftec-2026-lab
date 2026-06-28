# @po Validation — Story 9.1 (Visual Copa 2026 Refresh)

> **Validator:** Pax (@po) · **Date:** 2026-05-20 · **Verdict:** ✅ **GO (9.5/10)**
> **Story:** [`docs/stories/9.1.visual-copa-refresh.story.md`](../stories/9.1.visual-copa-refresh.story.md)
> **Spec source:** [`docs/frontend-spec-copa-2026.md`](../frontend-spec-copa-2026.md) — @ux-design-expert (Uma)

---

## Veredito consolidado

| Item | Valor |
|---|---|
| **Implementation Readiness Score** | **9.5 / 10** |
| **Confidence Level** | **High** |
| **Verdict** | **GO** |
| **Status transition** | Draft → **Ready** |
| **Próximo agente** | `@dev *develop 9.1` |

## 10-Point Checklist

| # | Critério | Resultado |
|---|---|---|
| 1 | Título claro e objetivo | ✅ |
| 2 | Story bem formada (As a/I want/So that) | ✅ |
| 3 | AC testáveis (10 ACs com linhas exatas, classes literais, thresholds) | ✅ |
| 4 | Tasks executáveis (12 tarefas, 32 checkboxes) | ✅ |
| 5 | Dependências mapeadas (spec linkado, branch criada, 5 artefatos verificados) | ✅ |
| 6 | Estimativa de complexidade (2h15 + 30min QA + 15min push = ~3h) | ✅ |
| 7 | Valor de negócio explícito | ✅ |
| 8 | Riscos documentados (3 c/ mitigações) | ✅ |
| 9 | DoD / smoke claros (AC-10 + Testing) | ✅ |
| 10 | Alinhamento c/ Epic (standalone justificado) | ✅ |

## Anti-Hallucination (Art. IV)

Verificações de linha conduzidas:

| Referência | Conferido | Resultado |
|---|---|---|
| `frontend/index.html:10` `<title>` | ✅ | Match |
| `frontend/index.html:9` meta description | ✅ | Match |
| `frontend/vite.config.ts:18` PWA description | ✅ | Match |
| `frontend/src/pages/Register.tsx:40` aria-label | ✅ | Match |
| Linhas 32/36 Home, 45 Layout, 32 Navbar, 42 Login | ✅ (via grep da Uma) | Match |
| 4 imagens em `docs/Images/` | ✅ | Existem |
| Componentes existentes (`tftec-mark`, `WorldCupTrophy`, `SoccerBall`) | ✅ | Confirmados |
| Decisões em Dev Notes vs spec da Uma | ✅ | Alinhadas |

**Sem invenção. Sem alucinação detectada.**

## Reforço do escopo do rename (squad debate)

@sm escolheu **MINIMAL** (8 ocorrências user-visible). Eu **REFORÇO**.

### Argumentos sustentando MINIMAL

1. **`docs/brand/` é manual da empresa TFTEC**, não documentação do produto Bolão. "TFTEC Cloud" lá é a identidade visual oficial da empresa. Renomear quebra rastreabilidade ao manual canônico (`tftec-0004-manual-de-marca-v1.pdf` referenciado em `palette.md:168`).

2. **`infra/main.bicep` tag `owner: 'tftec-cloud'`** é identificador Azure. Filtros em Cost Management, dashboards de Application Insights e queries KQL provavelmente usam essa tag. Mudar **pode quebrar dashboards existentes** sem coordenação com @devops.

3. **`package.json` author/description** vai para artefatos npm e Azure deployment manifests. Mudar exige avaliar se "TFTEC Prime" é o nome PERENE da empresa/produto ou só do evento.

4. **Categoria B (README, docs internas)** é "soft": pode virar story-2 separada se o owner confirmar.

### Conclusão

MINIMAL está correto. Se owner depois confirmar que "TFTEC Prime" é o nome perene (não só evento), uma **Story 9.2 — Brand rename broader scope** pode ser criada. Por ora, escopo limpo.

## Issue não-bloqueante aplicada nesta validação

- **S1 — Executor Assignment metadata YAML ausente** (Should-Fix). Adicionado como parte do GO. Bloco YAML conforme story-tmpl.yaml seção `executor-assignment` (Projeto Bob / Story 11.1).

## Mudanças aplicadas ao story file durante esta validação

1. Status: `Draft` → `Ready`
2. Linha "Validated: 2026-05-20 by @po (Pax) — GO 9.5/10" adicionada no header
3. Seção `## Executor Assignment` com YAML metadata adicionada
4. Change Log entry v1.1.0 adicionada

## Handoff

```yaml
next_agent: @dev
next_command: *develop 9.1
condition: Story status is Ready (GO decision, status updated)
alternatives:
  - agent: @sm, command: *draft, condition: rework necessário (não aplicável)
  - agent: @ux-design-expert, command: consult, condition: ambiguidade visual durante implementação
```

Branch `feature/9.1-visual-copa-refresh` já preparada por @sm — `@dev` pode commitar diretamente nela.
