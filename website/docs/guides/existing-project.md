---
sidebar_position: 4
---

# Projeto Existente

O guia de projeto existente orienta como integrar o harness a uma base de código em andamento por meio de diagnóstico não destrutivo, geração de perfil e bootstrap assistido, preservando convenções já estabelecidas.

![Onboarding e instalação](/omp-harness-guide/img/diagrams/onboarding-instalacao.png)
*Onboarding e instalação: do diagnóstico do repositório à geração de perfil e bootstrap do harness.*

## O fluxo moderno de onboarding

Em versões anteriores, a configuração dependia de etapas puramente manuais. O harness agora dispõe de automação para detectar o perfil do projeto, registrar comandos de verificação e integrar o segundo cérebro sem sobrescrever arquivos sem consentimento.

O fluxo de onboarding segue quatro etapas estruturadas:

1. **Diagnóstico não-mutatório (`/harness-init`):** auditoria de camadas sem tocar em nenhum arquivo do projeto.
2. **Detecção e perfil (`harness-project-profile.mjs`):** extração de stack, suítes de teste, linters e limites de correção (`fixLoop`).
3. **Bootstrap assistido (`/harness-bootstrap`):** criação de `AGENTS.md`, `feature_list.json`, templates de PR e contratos de qualidade.
4. **Governança de revisão e segundo cérebro:** configuração de `docs/review.md` por área e sincronização com o grafo de conhecimento.

## Passo a passo de integração

### 1. Diagnóstico inicial com `/harness-init`

No chat do Oh My Pi, execute o comando de inspeção:

```text
/harness-init
```

O inicializador avalia o repositório em modo somente leitura e produz um relatório de lacunas:

- **Instruções raiz:** verifica se já existem arquivos como `AGENTS.md`, `CLAUDE.md` ou `README.md`.
- **Caminho de startup e verificação:** descobre gerenciadores de pacote e comandos de teste (por exemplo, `npm test`, `pytest`, `cargo test`).
- **Estado de progresso:** verifica se há controle de features (`feature_list.json`).
- **Segurança e MCPs:** audita credenciais expostas em arquivos de configuração local.

### 2. Geração do perfil do projeto

O script `harness-project-profile.mjs` permite inspecionar o perfil com `--detect` e gravá-lo em disco com `--write`:

```bash
# Inspecionar o perfil detectado (apenas imprime no terminal, sem alterar arquivos)
node ~/.omp/agent/scripts/harness-project-profile.mjs --detect --root <projeto>

# Gravar o perfil em <projeto>/agent-os/project-profile.json
node ~/.omp/agent/scripts/harness-project-profile.mjs --write --root <projeto>
```

Exemplo real de saída gerada:
```json
{
  "schemaVersion": 1,
  "stack": [
    "node",
    "typescript"
  ],
  "test": {
    "command": "npm test",
    "detected": true
  },
  "evals": {
    "isolation": "process",
    "detected": true
  },
  "ci": {
    "provider": "github",
    "detected": true
  },
  "delivery": {
    "mode": "none",
    "detected": true
  },
  "fixLoop": {
    "maxAttempts": 3,
    "escalateOn": [
      "attempts_exhausted",
      "secret_or_credential",
      "production_deploy",
      "scope_change",
      "dependency_cooldown"
    ],
    "detected": true
  }
}
```
O parâmetro `fixLoop.maxAttempts` garante que tentativas de autocorreção em loops de implementação parem após 3 repetições, alertando o operador em vez de consumir tokens indefinidamente. Quando executado com `--write`, o arquivo é gravado em `<projeto>/agent-os/project-profile.json`.

### 3. Instalação assistida com `/harness-bootstrap`

Com o diagnóstico aprovado, invoque o instalador:

```text
/harness-bootstrap
```

O bootstrap apresenta um plano de criação, mesclagem ou manutenção para cada arquivo:

| Arquivo | Ação padrão | Finalidade |
|---|---|---|
| `AGENTS.md` | Create ou Merge | Regras do projeto, convenções de código e entry points |
| `feature_list.json` | Create | Fila de trabalho com garantia estrita de WIP=1 |
| `agent-os/prevc-autonomy.json` | Create | Configurações de autonomia com `autoConfirm: false` |
| `agent-os/quality-thresholds.json` | Create | Definição de chaves governantes de métricas |
| `.github/pull_request_template.md` | Create | Template de PR com Tier de risco, Testes e Rollback |
| `docs/review.md` | Create | Regras de review por área, falhas críticas e defeitos escapados |
| `docs/harness/session-handoff.md` | Create | Documento de transferência contínua entre sessões |

Nenhum arquivo existente é sobrescrito sem confirmação expressa do operador.

### 4. Primeira sessão operacional

Após o bootstrap, inicie o trabalho rotineiro:

1. Execute o comando de teste descoberto para confirmar que a linha de base está verde.
2. Inicie a primeira sessão de trabalho com `/harness-session-start`.
3. Adicione a primeira unidade de trabalho no `feature_list.json` com status `in_progress`.
4. Conclua a sessão gerando o handoff durável via `/harness-clean-handoff`.

## O que isto prova e o que não prova

- **O que prova:** o processo de onboarding comprova que o repositório agora possui pontos de entrada padronizados para agentes, comandos de teste auditados e contratos de qualidade explícitos.
- **O que NÃO prova:** instalar o harness não resolve dívidas técnicas pré-existentes nem garante que a cobertura de testes seja abrangente. Se a suíte de testes original tiver pontos cegos, o gate reportará apenas o que puder medir.

## Páginas relacionadas

- [Novo Projeto](./new-project.md) — Criação de repositórios do zero com o harness.
- [Equipe no Maestri](./maestri-team.md) — Configuração de agentes persistentes no canvas.
- [Estrutura do Repositório](../reference/repository-structure.md) — Mapeamento completo dos arquivos do harness.
