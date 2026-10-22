---
sidebar_position: 3
---

# Segurança

A seção de segurança documenta os limites, as salvaguardas e os guardrails obrigatórios do Harness Oh My Pi, diferenciando proteções ativas de fronteiras do sistema operacional. É fundamental compreender tanto o que o harness protege ativamente quanto o que ele deliberadamente não protege — a segurança real mora na fase de planejamento e aprovação prévia, e não em bloqueios reativos automáticos.

## O que o harness protege

- **Estado durável e rastreabilidade:** Decisões, bloqueios, comandos e handoffs são persistidos em arquivos Git, sem informações críticas confinadas à memória volátil de sessões.
- **Permissões declarativas por agente:** Cada papel de agente opera sob uma allowlist estrita de ferramentas; operações perigosas (mutação de pacotes, diretórios externos, execução de comandos não catalogados) exigem confirmação explícita.
- **Verificação fail-closed:** O Quality Gate reprova se qualquer métrica bloqueante sofrer falha de execução, scanner ausente ou código de saída não previsto (`unavailable`). Ferramentas com crash nunca são convertidas em contagem zero.
- **Quarentena de staging e expurgo de credenciais:** Conteúdos destinados ao segundo cérebro (Obsidian) passam por área de quarentena com varredura contra segredos (usando o validador público `harness-security-scan.mjs` ou rotinas locais do operador fora do pacote) e filtros de privacidade antes da sincronização.
- **Redação estrita de telemetria:** O rastreio nativo de eventos (`harness-omp-trace.ts`) grava exclusivamente nomes e identificadores de chamadas de ferramentas, suprimindo payloads completos, corpos de requisições e variáveis de ambiente.

## Guardrails obrigatórios

### Red-team obrigatório no tier full
Em iniciativas classificadas como tier `full` (ou risco `high`), o script `harness-prevc-state.mjs` bloqueia a transição `judge -> refine` caso não exista um parecer de auditoria de segurança aprovado com o mesmo `sourceHash` e contendo a linha `Red-team: N tentativas` (N mínimo 3) e `Verdict: APPROVE`. No ambiente de trabalho do operador, esses testes na superfície alterada são conduzidos pelo agente de segurança do operador; a distribuição pública do harness não inclui o subagente ofensivo `security-analyst`.

### Contrato de segurança executável (`authz_controls`)
O comando `harness-security-contract --run --metric` avalia rotas protegidas, integridade de autenticação e regras de isolamento multi-tenant (RLS/IDOR) declaradas em `agent-os/security-contract.json`. Se um serviço de suporte (ex.: banco PostgreSQL de teste) estiver inacessível, o comando emite `unavailable` e o gate reprova compulsoriamente.

### Pré-voo de entrega sem deploy (`delivery_config`)
O script `harness-delivery-preflight --config-check --metric` valida a integridade sintática de arquivos Docker Compose, Dockerfiles e manifestos de nuvem antes do merge, prevenindo que configurações quebradas alcancem produção, sem contudo disparar deploys ou builds demorados.

### Cooldown de dependências
O script `harness-dependency-cooldown.mjs` opera de forma estritamente offline: rastreia o aparecimento de novas dependências nos lockfiles do projeto contra o arquivo local `agent-os/dependency-ledger.json`. Qualquer pacote cuja primeira detecção (`firstSeen`) seja inferior a 7 dias bloqueia o Quality Gate full, a menos que o operador aprove explicitamente a dependência via comando `--approve <pacote>@<versão> --yes`.

## Salvaguardas no terminal e guardrails

No pacote público distribuível, a proteção contra comandos perigosos baseia-se em governança preventiva: allowlists estritas por agente, revisão humana de comandos na fase de planejamento e varreduras com `/harness-security-scan`. Em ambientes locais privados, o operador pode complementar essa proteção com extensões de runtime (como `harness-security-guard.ts`, mantida localmente fora do pacote público) para interceptar:

- Remoções recursivas indiscriminadas (`rm -rf /` ou equivalentes).
- Comandos destrutivos de Git (`git reset --hard`, `git clean -fdx` sem escopo).
- Invocações de shells reversos remotos.
- Downloads via curl/wget encadeados diretamente para executores de shell (`curl | bash`).
- Tentativas de acesso a chaves privadas e pastas de certificados do sistema.
## Tratamento de segredos

Nunca registre chaves privadas, senhas, tokens de API ou dados pessoais em arquivos de especificação, relatórios de teste, handoffs de sessão ou notas de governança.

Caso precise documentar a integração de um serviço confidencial, use descrições redigidas: *"Credencial de integração carregada via secret manager de ambiente; valor não exposto"*.

## O que o harness NÃO protege

### Não há sandbox de sistema operacional no host
As allowlists e guardrails reduzem substancialmente o risco de enganos, mas **não constituem uma fronteira de segurança no nível do SO**. Qualquer comando aprovado no plano e executado no shell roda com os privilégios do usuário local do computador.

### Não substitui a revisão e aprovação humana
O Judge analisa critérios objetivos e os revisores examinam código sob contratos de área, mas a autorização final permanece como prerrogativa e responsabilidade do operador humano.

### O guardrail não substitui bom senso de engenharia
Scanners de padrões cobrem expressões conhecidas, mas não detectam lógicas de negócio maliciosas ou omissões sutis. **A principal barreira de segurança é a leitura atenta do plano pelo desenvolvedor antes de digitar `/prevc run`**.

## Boas práticas

1. **Examine o plano completo antes de aprová-lo:** Certifique-se de que cada comando e arquivo listado corresponde estritamente ao objetivo solicitado.
2. **Execute `/harness-security-scan` com regularidade:** Identifique permissões excessivas ou credenciais acidentalmente versionadas.
3. **Mantenha segredos em variáveis de ambiente ou secret stores locais:** Jamais salve tokens em arquivos rastreados pelo Git.
4. **Desconfie de pacotes desconhecidos:** Verifique a reputação e data de lançamento de qualquer nova biblioteca antes de incluí-la no projeto.
