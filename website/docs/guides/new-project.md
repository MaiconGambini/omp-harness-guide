---
sidebar_position: 0
---

# Novo Projeto

O guia de novo projeto orienta como estruturar um repositório desde o primeiro commit com o Harness Oh My Pi, integrando governança de entrega, revisão de código e memória contínua.

![Loop operacional de novo projeto](/omp-harness-guide/img/diagrams/onboarding-loop-fase-a.png)
*Loop operacional de novo projeto: do repositório limpo ao ciclo contínuo com governança.*

## Do repositório vazio à operação contínua

Inicializar um projeto com o harness estabelece disciplina de entrega desde o início. Em vez de adicionar verificações e controles retrospectivamente quando incidentes começarem a ocorrer, o fluxo estrutura a base de código em cinco etapas:

1. **Estrutura base e inicialização:** criação do repositório Git, configuração do gerenciador de pacotes e baseline de testes.
2. **Auditoria e bootstrap (`/harness-init` e `/harness-bootstrap`):** geração dos contratos operacionais e instruções para os agentes.
3. **Registro e segundo cérebro:** indexação do repositório no grafo de conhecimento para apoiar o raciocínio arquitetural.
4. **Contratos de qualidade e entrega:** configuração do template de Pull Request, diretrizes de code review e classificação de risco.
5. **Autonomia e limites de loop:** calibração de `autoConfirm` e parâmetros de parada do `fixLoop`.

## Passo a passo de configuração

### 1. Criar o repositório e linha de base

Inicie o repositório e configure uma suíte básica de testes:

```bash
mkdir <projeto>
cd <projeto>
git init
```

Adicione um teste inicial que passe (por exemplo, `npm test` ou `pytest`). O harness exige uma linha de base verde comprovada antes de permitir a criação de novas tarefas.

### 2. Executar auditoria e bootstrap

Dentro do Oh My Pi ou no terminal do Maestro:

```text
/harness-init
```

O comando analisa o ambiente sem modificar arquivos e aponta os elementos ausentes. Em seguida, confirme a instalação:

```text
/harness-bootstrap
```

O bootstrap cria os artefatos fundamentais do projeto:

- `AGENTS.md`: regras do repositório, convenções de código e comandos canônicos de teste.
- `feature_list.json`: backlog operacional com garantia estrita de WIP=1.
- `agent-os/prevc-autonomy.json`: parâmetros de autonomia do PREVC.
- `agent-os/quality-thresholds.json`: chaves governantes para o gate de qualidade.

### 3. Registro do projeto e segundo cérebro

Para habilitar a recuperação de contexto de longo prazo via grafo de conhecimento:

1. Registre o novo projeto no gerenciador de projetos local (`projects.json`).
2. Execute a carga inicial de contexto (`cerebro-carga-inicial`) para indexar arquivos e dependências no Obsidian e no Graphify.
3. Isso permite que agentes de arquitetura e planejamento consultem decisões passadas sem precisar reler o repositório inteiro a cada sessão.

### 4. Contratos de entrega e code review

Configure a governança de código que protegerá o branch principal:

#### Template de Pull Request (`.github/pull_request_template.md`)

```markdown
### Tier
auto | sampling | full

### Classificação de Risco
- [ ] risk:low — Alteração cosmética ou documental
- [ ] risk:medium — Lógica de negócio ou alteração em APIs internas
- [ ] risk:high — Alteração em esquemas de dados, autenticação ou infraestrutura

### Testing
- Comando reproduzível: `<comando>`
- Evidência observada: `<saída do terminal>`

### Como Reverter
- Passos ou comandos explícitos de rollback: `<instruções>`

### Responsável
- Dono da entrega: `<nome>`
```

#### Regras de revisão por área (`docs/review.md`)

Crie o arquivo `docs/review.md` estruturado para receber o conhecimento do time:

- **Falhas críticas reais observadas:** registre armadilhas e bugs comuns do ecossistema adotado.
- **Regras de verificação do revisor:** checklist obrigatório para o subagente `code-reviewer`.
- **Log de defeitos escapados:** tabela para registrar regressões futuras e lições aprendidas.

### 5. Detecção do perfil e limites de loop

Execute o script de detecção para inspecionar os comandos reconhecidos:

```bash
node ~/.omp/agent/scripts/harness-project-profile.mjs --detect --root <projeto>
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

O parâmetro `fixLoop.maxAttempts = 3` evita loops infinitos de autocorreção quando um teste falha repetidamente, escalando a decisão para o operador humano. Use `--write` para salvar a configuração em `<projeto>/agent-os/project-profile.json`.

## Primeira tarefa operacional

Com a estrutura pronta, inicie a primeira tarefa:

1. Inicie a sessão com `/harness-session-start`.
2. Adicione a primeira unidade de trabalho no `feature_list.json` com status `in_progress`.
3. Planeje a implementação com `/planner <funcionalidade>`.
4. Aprove o plano e execute o ciclo com `/prevc run`.
5. Antes de abrir o Pull Request, execute `/quality full` e certifique-se de que a cobertura de medição foi informada honestamente (`Measured: N/M`).

## O que isto prova e o que não prova

- **O que prova:** criar um projeto com esse fluxo garante que a infraestrutura de testes, regras de revisão de código, template de entrega rastreável e limites de autocorreção estão ativos desde o primeiro commit.
- **O que NÃO prova:** ter o harness instalado não garante por si só que o design inicial da arquitetura esteja correto. O harness garante disciplina de processo, enquanto a validação funcional depende da qualidade dos testes e das especificações elaboradas.

## Páginas relacionadas

- [Projeto Existente](./existing-project.md) — Como introduzir o harness em código legado.
- [Equipe no Maestri](./maestri-team.md) — Configuração de especialistas persistentes no canvas.
- [Qualidade e Gate](../concepts/quality-gate.md) — Funcionamento detalhado dos thresholds e tiers de risco.
