---
sidebar_position: 7
---

# Quality Gate

O Quality Gate é o mecanismo de verificação empírica do harness. Ele avalia o código produzido em relação às políticas declaradas em `agent-os/quality-thresholds.json`, gerando relatórios auditáveis ancorados no identificador da árvore de trabalho (`sourceHash`).

Em vez de presumir que o código está pronto porque um modelo de linguagem declarou conclusão, o gate mede métricas estáticas, suítes de testes, regressões e controles de segurança com comandos determinísticos.

## Status das métricas

Toda métrica avaliada pelo gate recebe um de seis status formais:

| Status | Significado | Comportamento no gate |
|---|---|---|
| `pass` | A métrica foi medida e satisfez o limiar configurado. | Contribui para o veredito favorável. |
| `fail` | A métrica foi medida e violou o limiar de qualidade. | Bloqueia a conclusão da fase. |
| `observe` | A métrica foi medida apenas para monitoramento e histórico. | Registra o valor numérico sem reprovar o gate. |
| `unavailable` | A ferramenta falhou, o scanner travou ou a saída veio corrompida. | Bloqueia compulsoriamente se a métrica for exigida no perfil (fail-closed). |
| `not_configured` | A métrica existe no catálogo, mas não tem ferramenta configurada no projeto. | Registrada como lacuna; não reprova por padrão. |
| `not_applicable` | A métrica não se aplica ao tipo de projeto (por exemplo, checagem de banco em pacote estático). | Ignorada no cômputo de conformidade. |

O tratamento de status como `unavailable` segue o princípio de falha segura (*fail-closed*): ferramentas ausentes ou comandos que sofrem falha de execução jamais são convertidos em contagem zero ou interpretados como conformidade tácita.

## Roteador de risco e tiers

O `harness-risk-router` classifica a iniciativa determinando o tier de governança (`auto`, `sampling` ou `full`). Embora o tier normalmente acompanhe a classificação de risco do diff (`low`, `medium`, `high`), o roteamento não é um mapeamento um-para-um, pois avalia o contexto do repositório e o estado do gate:

- **Caminhos de alto risco (`high_risk_paths`):** Qualquer alteração tocando autenticação, autorização, migrações de esquema de banco de dados, infraestrutura ou regras de governança do próprio harness classifica compulsoriamente o risco como `high` e força o tier `full`, independentemente do número de linhas alteradas.
- **Gate não configurado (`gate.unconfigured`):** Se o repositório ainda não possui ferramentas ou limiares configurados, o roteador recai automaticamente em `sampling` para exigir inspeção por amostra, impedindo que o fluxo avance para `auto` sem medições reais.
- **Métricas indisponíveis ou incompletas:** Se o gate full estiver verde, mas houver métricas instrumentadas que retornaram `unavailable`, ou se a verificação tiver sido executada apenas no modo local (`--mode local`), o tier recai para `sampling`.
- **Tier `auto`:** Reservado exclusivamente para alterações de baixo risco (`risk:low`), baixa complexidade e com o Quality Gate em modo full comprovadamente verde e com medições válidas.
## O gate como sinal operacional

O resultado do Quality Gate atua estritamente como um sinal de engenharia, e não como uma interrupção destrutiva:

![Gate de qualidade como sinal no ciclo PREVC](/omp-harness-guide/img/diagrams/prevc-fase-a-fase.png)
*O Quality Gate atua como sinal de medição entre micro e macro-loops no PREVC.*

Quando o gate retorna veredito `fail`:
1. A afirmação de conclusão e a transição para a fase de confirmação são bloqueadas.
2. A sessão de desenvolvimento **permanece aberta** e a árvore de trabalho não é descartada.
3. O orquestrador e os agentes inspecionam os motivos da reprovação na tabela de métricas e iniciam um novo ciclo de correção (*macro-loop*).

O sinal vermelho impede a entrega precoce de código quebrado sem penalizar o fluxo exploratório de depuração.

## Cobertura de medição: Measured N/M

Um gate verde (`pass`) não significa necessariamente alta cobertura. Se um projeto novo define apenas linters e desliga testes e scanners de segurança, a quase totalidade das métricas resultará em `not_configured` ou `unavailable`.

Para combater a falsa ilusão de robustez ("falso verde"), o cabeçalho do relatório emitido pelo gate expõe com transparência a razão de cobertura e um alerta formal:

```text
- Verdict: **pass** (exit 0)
- Measured: 8/28 metrics
- WARNING: most metrics unmeasured (8/28); pass is not evidence of quality
```

Sempre que a quantidade de métricas medidas for inferior a 50% das métricas monitoradas, um aviso formal alerta os revisores de que a medição foi parcial.

## Evals, segurança e pré-voo de entrega

O Quality Gate incorpora verificações estruturais diretamente no ciclo de validação:

### Regressão de evals (`eval_regressions`)
O script `node ~/.omp/agent/scripts/harness-eval-runner.mjs` minera tarefas provadas do histórico em uma worktree temporária (`--mine`) e, no modo regressão (`--regression --metric`), executa cada tarefa provada de `evals/dataset.json` diretamente sobre o código atual do repositório. Se qualquer comportamento histórico com teste quebrar, a métrica conta a falha e bloqueia o gate.

### Contrato de segurança (`authz_controls`)
O script `node ~/.omp/agent/scripts/harness-security-contract.mjs --run --metric` executa testes declarados em `agent-os/security-contract.json` para rotas protegidas, integridade de autenticação e isolamento multi-tenant. Ferramentas ou dependências indisponíveis geram status `unavailable`, impedindo que falhas de infraestrutura passem despercebidas.

### Pré-voo de entrega (`delivery_config`)
O script `node ~/.omp/agent/scripts/harness-delivery-preflight.mjs --config-check --metric` valida sintaxe e integridade de manifestos de contêineres (`docker-compose.yml`, Dockerfiles, arquivos de nuvem) sem efetuar builds demorados, publicações de imagens ou deploys reais. A métrica atua em modo `observe`, assegurando que configurações de deploy sejam checadas antes da fusão do código.
## Exemplo de execução

Ao disparar a verificação de qualidade via linha de comando:

```bash
node ~/.omp/agent/scripts/harness-quality-gate.mjs --mode full
```

Saída real observada no terminal:

```text
# Quality Gate — full

- Date: 2026-10-22T14:34:28.143Z
- Verdict: **pass** (exit 0)
- Label: session
- Phase: A
- Source hash: f4785ee8c1e0a83e
- Measured: 8/28 metrics
- WARNING: most metrics unmeasured (8/28); pass is not evidence of quality
- Config fingerprint: b998ddc88421f438
- Project commands: enabled

## Metrics

Metric                       Value  Threshold  Status
regression_suite             0      <= 0       pass
redteam_quickcheck           0      <= 0       pass
dependency_cooldown          0      <= 0       pass
skill_lint                   0      <= 0       pass
file_growth_delta            0      -          pass
module_lines_max             12991  <= 300     observe
prose_tells                  856    -          observe
security_findings            -      -          unavailable
authz_controls               -      -          unavailable
eval_regressions             -      -          not_applicable
delivery_config              -      -          not_applicable
line_coverage                -      -          not_configured

## Notes

- 14 of 30 metric(s) unavailable — these SHOULD have measured and did not. A green exit code over 8 measured rows means little. Read the table.
- 6 of 30 metric(s) not_configured — no instrument exists for them in this project.
- 2 metric(s) not_applicable to this project or diff (eval_regressions, delivery_config).
```

## O que isto prova e o que não prova

### O que prova
- Que os comandos configurados executaram no ambiente de teste com os códigos de saída previstos.
- Que as métricas ativas respeitaram os limiares numéricos estabelecidos para o projeto.
- Que o relatório está criptograficamente associado ao estado da árvore de trabalho (`sourceHash`).
- Quais métricas deixaram de ser medidas por indisponibilidade de ferramentas ou falta de configuração.

### O que NÃO prova
- Um gate com status `pass` e baixa razão de cobertura (`Measured: 7/28`) **não prova** ausência de vulnerabilidades ou defeitos arquiteturais nas métricas não avaliadas.
- Não substitui a inspeção lógica humana de requisitos e regras de negócio complexas.
- Não garante que o software funcione em ambientes externos de produção caso variáveis de execução ou serviços de terceiros divirjam do ambiente de teste.

## Próximo passo

Entenda como o gate se articula com a inspeção humana e de agentes em [Code Review](./code-review) ou explore os detalhes do ciclo de vida em [PREVC](./prevc).
