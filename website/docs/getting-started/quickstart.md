---
sidebar_position: 1
---

# Início rápido

Este caminho leva de um projeto limpo ao primeiro objetivo no Harness Oh My Pi.
Para a instalação completa, incluindo backup, obtenção e validação do pacote,
consulte [Instalação](./installation).

## Passo 1: Instalar o pacote do harness

Depois de obter e revisar o checkout do repositório, copie a árvore de distribuição do harness para a pasta de agentes do Oh My Pi (`~/.omp/agent`):

```powershell
$target = Join-Path $env:USERPROFILE ".omp\agent"
New-Item -ItemType Directory -Force $target | Out-Null
Copy-Item -Path ".\omp\agent\*" -Destination $target -Recurse -Force
```

Feche e reabra o Oh My Pi para que os novos comandos, agentes e extensões nativas sejam carregados na inicialização.

## Passo 2: Iniciar a primeira tarefa com o ciclo PREVC

No terminal do Oh My Pi, dentro da pasta do seu projeto, execute o comando de preparação da tarefa:

```text
/prevc prepare "Criar rota POST /auth/login com JWT"
```

O harness classifica o risco da tarefa, descobre o contexto técnico do repositório e inicia a transição controlada de fases.

## Passo 3: Observar o ciclo completo do motor nativo

O OMP executa as sete etapas do PREVC em quatro fases. O agrupamento organiza as fronteiras, mas não elimina nenhuma etapa:

1. **Prepare (`prepare + plan`):** O harness descobre o contexto, classifica o risco, define o ownership (`src/auth.py`, `tests/test_auth.py`) e aguarda a aprovação do plano.
2. **Execute (`execute`):** Após a aprovação, o scheduler usa `task` e uma chamada `tasks[]` quando houver lanes independentes; `hub` coordena mensagens entre agents.
3. **Validate (`validate + judge`):** O runtime executa os comandos de verificação e um Judge read-only compara o resultado com o contrato. A saída precisa ser capturada no terminal; este guia não fornece resultados de uma execução real.
4. **Confirm (`refine + confirm`):** Refine propõe melhorias sem escrever nem votar, e o operador revisa a evidência antes de confirmar o handoff.
