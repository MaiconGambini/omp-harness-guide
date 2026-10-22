---
sidebar_position: 3
---

# Dispatch Paralelo

O despacho paralelo detalha como executar múltiplas unidades de trabalho de forma simultânea durante a fase Execute do PREVC, mantendo isolamento estrito de escrita por arquivo e coordenação centralizada pelo `scheduler`.

![Orquestração e papéis](/omp-harness-guide/img/diagrams/orquestracao-e-papeis.png)
*Orquestração e papéis: divisão de responsabilidades entre o scheduler, especialistas e revisores.*

## Como funciona a orquestração real

O despacho paralelo no Oh My Pi opera sob regras rígidas de ownership para evitar colisões e conflitos de mesclagem:

1. **Dono exclusivo por arquivo:** cada arquivo sujeito a alteração pertence a exatamente uma lane com capacidade de escrita por vez. Se duas tarefas precisam tocar o mesmo módulo, o `scheduler` as serializa obrigatoriamente.
2. **Subagentes efêmeros vs. time persistente no Maestri:**
   - **Subagentes nativos (`tasks[]`):** criados pelo `scheduler` via ferramenta `task` no runtime do OMP para tarefas delimitadas (por exemplo, implementação em TDD de um arquivo ou execução de um shard de testes).
   - **Time persistente no Maestri (`/maestri-team`):** equipe de dez papéis operando em terminais dedicados no canvas do Maestri, permitindo colaboração contínua entre especialistas com permissões de ferramentas pré-fixadas (como revisores com permissão somente de leitura).
3. **Comunicação e sincronização:** os agentes comunicam interfaces e pontos de bloqueio por mensagens estruturadas, sem necessidade de polling manual.
4. **Validação em duas camadas:** cada lane executa verificações locais (`--mode local`). Ao final da reconciliação de todas as lanes, o `scheduler` roda o gate completo (`--mode full`) sobre a árvore consolidada.

## A tabela de lanes

Antes de despachar qualquer onda concorrente, o `scheduler` constrói a matriz de dependências e propriedade de arquivos:

| Lane | Objetivo | Ownership (arquivos) | Dependência | Capability |
|---|---|---|---|---|
| L1 | Camada de autorização | `src/auth/service.py` | — | `implementer` |
| L2 | Camada de persistência | `src/storage/repository.py` | — | `implementer` |
| L3 | Testes de integração L1+L2 | `tests/test_integration.py` | L1, L2 | `test-runner` |

Lanes sem dependência mútua (L1 e L2) rodam na mesma onda de execução. A lane L3 aguarda a entrega e reconciliação dos arquivos de L1 e L2 antes de iniciar a execução da suíte de testes.

## Despacho via ferramenta `task`

O `scheduler` monta o payload declarando o perfil explícito de subagente para cada tarefa:

```json
{
  "context": "# Objetivo: Desacoplar persistência e autorização mantendo fronteiras isoladas.",
  "tasks": [
    {
      "name": "AuthLane",
      "agent": "implementer",
      "task": "Implementar controle de autorização em src/auth/service.py e rodar pytest tests/test_auth.py."
    },
    {
      "name": "StorageLane",
      "agent": "implementer",
      "task": "Refatorar queries em src/storage/repository.py e rodar pytest tests/test_storage.py."
    }
  ]
}
```

## Rastreio de conclusão e reconciliação

Cada lane retorna um recibo de conclusão estruturado contendo o código de saída e a lista de arquivos alterados:

```text
[AuthLane]    concluído -> pytest tests/test_auth.py: 12 passed (exit 0)
[StorageLane] concluído -> pytest tests/test_storage.py: 8 passed (exit 0)
Reconciliação: 2 lanes mescladas com 0 conflitos de arquivo.
Gate full sobre a árvore reconciliada: pass (Measured: 6/6 métricas avaliadas).
```

## Projeção de tempo e limites práticos

Em um plano decomposto em tarefas independentes, o tempo de execução deixa de ser a soma linear das tarefas e passa a ser determinado pela lane mais longa mais o custo de reconciliação:

```text
T_total = max(T_L1, T_L2, ...) + T_reconciliacao
```

Essa projeção teórica não constitui garantia de aceleração fixa: contenção de CPU, latência de rede em chamadas de API e limites de taxa de provedores de modelo afetam o tempo real. Meça o tempo de execução do seu projeto antes e depois da paralelização.

## Limites operacionais

- **Arquivos compartilhados:** nunca despache em paralelo lanes que escrevem no mesmo arquivo.
- **Concorrência de processos:** limites de memória e processamento da máquina host devem ser respeitados ao definir o número de terminais ou shards simultâneos.
- **Git:** subagentes nunca realizam commit diretamente. O `scheduler` é o único responsável pela mesclagem e pelo commit local ao final do PREVC.

## O que isto prova e o que não prova

- **O que prova:** o isolamento de lanes comprova que as tarefas foram executadas sem contaminação mútua de arquivos e que a árvore resultante passou pelo gate completo de validação.
- **O que NÃO prova:** a conclusão bem-sucedida de lanes paralelas não prova ausência de regressões semânticas entre os módulos. Essa garantia depende da abrangência dos testes de integração executados na reconciliação final.

## Páginas relacionadas

- [Equipe no Maestri](./maestri-team.md) — Operação com terminais persistentes no canvas.
- [Qualidade e Gate](../concepts/quality-gate.md) — Como o gate full avalia a árvore reconciliada.
- [Skills e Agentes](../reference/skills.md) — Perfis de `implementer`, `scheduler` e especialistas.
