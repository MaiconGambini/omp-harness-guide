---
sidebar_position: 4
---

# Harness Contínuo

> **Estado PREVC:** `judge → refine → awaiting_confirmation → confirm` — o loop aprendido atua depois do Judge, sem escrever e sem votar.

O harness contínuo transforma feedback de revisão em um sinal estruturado que pode orientar execuções futuras. Ele não promete que o agent "aprende sozinho": o loop é local ao projeto, medido pelos sinais configurados e limitado por permissões e confirmação humana.

## Loop de comportamento

```text
ticket e risco
  -> manifesto e regras ativas por ownership
  -> lanes executam e rodam gate local
  -> scheduler roda gate completo e risk router
  -> reviewers retornam findings tipados
  -> scheduler valida e grava a janela
  -> commit de código e Judge
  -> Refine propõe, sem escrever e sem votar
  -> awaiting_confirmation mostra o texto literal
  -> regra aprovada entra separadamente
  -> próxima execução injeta a regra nas lanes compatíveis
```

O gate mede o artefato, não a reputação do agent. Métricas e políticas são declaradas em `agent-os/quality-thresholds.json`; controles do ciclo aprendido ficam em `quality-thresholds.json#learned_rules`. Valor ausente, relatório stale ou roster ausente são lacunas fail-closed.

## Findings tipados

Reviewers retornam records; eles não gravam arquivos. O scheduler valida e é o único escritor do arquivo de findings da execução.

| Classe | Significado |
|---|---|
| `rule_violation` | Regra escrita foi violada; exige ponteiro exato |
| `operator_note` | Operador registrou uma correção manual |
| `blind_spot` | Problema real ainda sem regra aplicável |
| `defect` | Defeito que um gate deveria ter capturado |
| `nit` | Preferência sem regra por trás |

O envelope também liga o finding ao gate, roster, tier e manifesto de lanes. Sem esse contexto, um zero pode significar ausência de revisão, não ausência de problemas. Adherence é um piso baseado no que foi detectado, não uma taxa real.

## Ledger e injeção

`agent-os/learned-rules.json` mantém regras ativas, conflitos e aposentadorias do projeto. Os alvos permitidos e os níveis de enforcement são validados; uma regra em prosa não se torna bloqueante por acidente.

Durante o planejamento, o scheduler cruza regras ativas com o ownership de cada lane e injeta somente as relevantes no prompt, dentro de uma cerca de dados não confiáveis. A injeção fecha o loop: uma regra só influencia comportamento se chega à capacidade que fará a mudança.

## Refine

Refine ocorre depois do Judge e antes de `awaiting_confirmation`. Ele lê a janela de findings, o relatório do gate, o ledger e o histórico de adherence; devolve uma proposta limitada por componente.

Refine:

- não edita, não executa shell, não delega e não acessa diretórios externos;
- não participa do payload nem do veredito do Judge;
- não aprova sua própria proposta;
- não altera os números governantes;
- nunca propõe edições em `~/.omp/agent/**` nem nos scripts do harness — propostas miram `agent-os/standards/` do projeto, dentro de `targets_allowed`.

O texto literal, alvo, fontes e mecanismo de refutação são apresentados ao operador. Regras capazes de bloquear e efeitos de alto risco mantêm aprovação humana. A regra entra depois do código, em mudança separada, porque o rulebook faz parte do hash de fonte do gate.

```text
/refine
```

Para registrar uma correção manual como evidência:

```text
/refine --note "<o que corrigi à mão>"
```

## Guardrails

O loop é limitado por guardrails obrigatórios:

- **Red-team quickcheck (R1)** — cada diff de lane reconciliado é escaneado por `harness-redteam-scan.mjs` (determinístico, read-only). Achados ou tier `sampling`/`full` escalam para revisão de segurança.
- **Cooldown de dependência (R3)** — uma dependência vista há menos de 7 dias bloqueia o gate full; apenas aprovação explícita do operador libera.
- **Fallback de provedor (R7)** — falha de provedor re-despacha a lane uma única vez em um modelo alternativo permitido; exaustão bloqueia com `blocked: provider-fallback-exhausted`. O papel de scheduler nunca é rebaixado automaticamente; cada evento é registrado no log de fallback.
- **Matriz de modelos (R8)** — papéis de modelo são fixos por config (`config.yml` `modelRoles`); o papel de scheduler é reservado; os demais resolvem para alternativas permitidas.
- **Multimodal (R6)** — imagens ficam na sessão principal; uma lane sem capacidade multimodal devolve `blocked: multimodal-unsupported` em vez de converter ou descartar a imagem.

## O que está live e o que não está

**Live:** schemas e validação determinística de findings e ledger; gates medidos, risk router e comportamento fail-closed; contratos de manifesto, injeção, revisão tipada e Refine; testes automatizados dos caminhos determinísticos.

**Não live ou não comprovado:**

- A ativação automática de regras em prosa não está ativa por padrão.
- A aceitação ao vivo com modelos não é reivindicada aqui; não há alegação de ganho medido.
- Configuração alterada não afeta um processo já iniciado sem restart.
- Findings medem o que reviewers detectam; não provam recall total.
- Refine propõe melhoria, mas não garante que a proposta seja correta ou aceita.

Para escolher o fluxo adequado, veja [Casos de Uso](../adoption/use-cases).
