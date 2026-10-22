---
sidebar_position: 6
---

# Evidência e Handoff

A disciplina de evidência e handoff estabelece a cadeia verificável de provas de execução e o protocolo de transferência de estado durável entre sessões consecutivas de trabalho.

Uma conclusão técnica confiável não decorre de uma afirmação textual no chat ("os testes passaram e está tudo funcionando"). O harness exige uma cadeia verificável de evidências que conecta a intenção inicial aos comandos executados no terminal e aos relatórios persistidos no disco.

O handoff transforma essas evidências em estado durável consumível por qualquer sessão futura, garantindo continuidade sem perda de contexto.

## Os cinco degraus da evidência

Os degraus de evidência são cumulativos e classificam a solidez de qualquer alegação de sucesso:

| Degrau | Tipo de prova | O que demonstra |
|---|---|---|
| **Rung 1 — Assertion** | Texto emitido pelo agente declarando conclusão. | Intenção ou expectativa do modelo; não prova execução. |
| **Rung 2 — Artifact** | Arquivos gravados, diff ou esquemas gerados. | O que foi alterado na árvore de trabalho; não demonstra funcionamento. |
| **Rung 3 — Command output** | Saída capturada e código de saída de um comando. | Execução reproduzível de um linter, compilador ou teste unitário. |
| **Rung 4 — Acceptance** | Tabela mapeando critérios de aceite a resultados. | Atendimento explícito aos requisitos acordados na especificação. |
| **Rung 5 — Live verification** | Sistema iniciado no terminal com tráfego real exercitado. | Comportamento funcional observado ponta a ponta com códigos HTTP e logs. |

Um degrau inferior jamais substitui um superior: uma afirmação (Rung 1) ou um arquivo editado (Rung 2) não possuem valor probatório sem a respectiva saída de execução (Rung 3 ou 5).

## O relatório do Quality Gate como evidência

Na fase de validação, as evidências são consolidadas no relatório estruturado do Quality Gate gerado pelo orquestrador. Esse artefato é imutável e contém:

- O hash exato do estado dos arquivos inspecionados (`sourceHash`).
- A classificação de risco do diff (`low`, `medium` ou `high`) e o respectivo tier de governança (`auto`, `sampling` ou `full`).
- A tabela de métricas com valores observados e limiares de tolerância.
- O rótulo explícito de cobertura de medição: **`Measured: N/M`**.

```text
- Verdict: **pass** (exit 0)
- Measured: 8/28 metrics
- WARNING: most metrics unmeasured (8/28); pass is not evidence of quality
```

O rótulo `Measured: N/M` impede que relatórios com dezenas de métricas ausentes ou desligadas passem como garantia plena de qualidade.

## Trailer de commit ancorado ao sourceHash

Quando uma iniciativa é aprovada para fusão no histórico Git, o commit de entrega recebe metadados formais em seu rodapé (*commit trailers*). Esse vínculo atesta que o commit exato corresponde ao relatório de gate aprovado:

```gitcommit
feat: add session token expiration handler

Implement automatic session invalidation upon credential revocation.
Closes #142.

Quality-Gate: pass (full)
Metrics: regression=0
Adherence: rules-active=0
Risk-Tier: full
Gate-Report: <caminho-relativo>/quality-report.json
Source-Hash: 6ed19345c071fc94
```

Essa amarração criptográfica permite auditar meses depois se um commit introduzido em produção passou por validação real ou se o gate foi ignorado.

## O papel do Judge e do Refine

Durante a validação e confirmação, a evidência é processada por agentes especializados com separação estrita de papéis:

![Judge e Refine por dentro](/omp-harness-guide/img/diagrams/judge-refine-a2a.png)
*Como o Judge e o Refine operam sobre os relatórios de evidência.*

- **O Judge (somente-leitura):** Compara a especificação original, o diff de arquivos e o relatório do Quality Gate. Ele emite um recibo JSON formal contendo o veredito (`accept`, `revise` ou `reject`) e aponta expressamente qualquer critério bloqueante pendente.
- **O Refine (somente-leitura):** Analisa os achados das revisões e propõe eventuais melhorias nos padrões do projeto. O Refine não escreve no código, não altera o veredito do Judge e suas propostas exigem confirmação do operador.

## Estrutura do Handoff de Sessão

Ao encerrar ou pausar qualquer ciclo de trabalho, o orquestrador gera o arquivo durável `docs/harness/session-handoff.md`. O documento segue cinco seções obrigatórias:

```markdown
# Handoff — <título da iniciativa> (<data>)

## Verified Now
Resumo conciso das verificações executadas na sessão:
- Risco (`low`, `medium` ou `high`), tier avaliado (`auto`, `sampling` ou `full`) e resultado do Quality Gate (ex.: sourceHash 6ed19345, verdict pass).
- Rótulo de cobertura exato: `Measured: N/M`.
- Testes automatizados executados e contagem de aprovação.

## Changed This Session
Lista cirúrgica dos arquivos modificados, novos artefatos criados e contratos alterados.

## Broken Or Unverified
Transparência rigorosa sobre o que NÃO foi verificado:
- Métricas com status `unavailable` ou `not_configured`.
- Alertas de cobertura (ex.: menos da metade das métricas medidas).
- Testes pendentes ou comportamentos que ainda exigem validação em ambiente integrado.

## Decisions Made
Decisões de design, escolhas de bibliotecas ou convenções estabelecidas que a próxima sessão deve obrigatoriamente respeitar.

## Next Best Step
Exatamente UMA próxima ação executável, com indicação de pré-requisitos ou comandos recomendados.
```

O `session-handoff.md` garante que um novo agente ou o próprio desenvolvedor retomem a atividade na manhã seguinte sem necessidade de reexplicar o contexto ou reler o histórico da conversa.

## Envelope de evidência entre lanes

Quando o orquestrador despacha tarefas em paralelo para subagentes (`tasks[]`), cada lane devolve um envelope restrito de quatro chaves:

```json
{
  "status": "ok",
  "summary": "Implementação do parser concluída com testes verdes",
  "artifact": "local://relatorio-lane-parser.md",
  "failures": []
}
```

O subagente não redefine arquivos ou próximos passos globais; o orquestrador pai reconcilia os envelopes individuais e sintetiza a evidência unificada.

## O que isto prova e o que não prova

### O que prova
- Que a conclusão baseia-se em saídas reais de programas e relatórios auditáveis ancorados em hashes do Git.
- Que as limitações da medição (`Broken Or Unverified` e `Measured: N/M`) estão documentadas explicitamente para quem for revisar.
- Que o estado do projeto sobrevive de forma determinística à troca de agentes e ao fechamento de janelas de contexto.

### O que NÃO prova
- Um handoff bem redigido **não prova** que o sistema está livre de erros se os testes executados forem superficiais.
- Não substitui a leitura crítica do operador humano sobre as decisões arquiteturais tomadas.
- Não garante que branches remotas de terceiros não sofram conflitos de mesclagem posteriores.

## Próximo passo

Conheça as métricas e status inspecionados em [Quality Gate](./quality-gate) ou veja as práticas de inspeção entre modelos em [Code Review](./code-review).
