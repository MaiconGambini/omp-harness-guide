---
sidebar_position: 1
---

# Perguntas Frequentes

As perguntas frequentes respondem às dúvidas operacionais e conceituais mais comuns sobre instalação, execução do ciclo PREVC e solução de problemas no Harness Oh My Pi.

## Instalação

### "O que preciso instalar?"

Clone o repositório, revise `omp/agent/omp-port-manifest.json`, rode o
validador e copie `omp/agent/*` para uma pasta limpa em `~/.omp/agent`. O site
não é uma dependência do runtime OMP.

### "`npm ci` falhou"

`npm ci --prefix website` só instala dependências para desenvolvimento local do
site. Verifique Node.js 20+ e o lockfile em `website/`; isso não é necessário
para copiar o núcleo OMP.

```powershell
node --version
```

### "Oh My Pi não reconhece os comandos"

Feche e reabra o Oh My Pi. A configuração em `~/.omp/agent` é carregada apenas
na inicialização.

### "Posso instalar em cima da minha configuração atual?"

Não. A instalação é limpa — renomeie `~/.omp/agent` para
`omp-agent-backup` antes de copiar o pacote. Não existe merge automático.

### "Para que serve `omp-port-manifest.json`?"

É o inventário público com hashes dos arquivos distribuídos. A validação do
checkout usa `node scripts/validate-public-subset.mjs --check-manifest`; não há
comando `omp:check` para comparar uma instalação local.

## Uso

### "O que significa WIP=1?"

Apenas uma unidade de trabalho pode estar `in_progress` por vez. Isso evita
trabalho paralelo abandonado e mantém o foco. A ferramenta `todo` segura a
unidade ativa da sessão.

### "Preciso do sprint contract para toda tarefa?"

Não. Tarefas simples (1-3 arquivos, escopo óbvio) usam o modo rápido. O sprint
contract é para features complexas ou ambíguas.

### "O que acontece se eu pular o handoff?"

A próxima sessão não sabe o que foi feito. Você perde continuidade e precisa
reexplicar o contexto. O handoff é obrigatório no fim de toda sessão, mesmo
que o trabalho não tenha terminado.

### "Posso trabalhar em mais de uma feature ao mesmo tempo?"

Não. WIP=1 é uma regra central. Se você descobrir trabalho adjacente, adicione
como `not_started` e continue na feature ativa.

### "Por que uma transição PREVC falhou com exit 2?"

`exit 2` significa recusa do harness: aresta de ciclo ilegal, estado ou receipt
inválido, gate ausente/obsoleto/ilegível ou verificação que falhou. Leia o erro
antes de repetir.

### "Quem confirma que o trabalho terminou?"

Por padrão, a confirmação depende exclusivamente do operador humano (`--operator-action confirm`) após revisar as evidências e o arquivo de handoff da sessão. Embora o harness suporte `autoConfirm` parametrizado por critérios objetivos de gate e evals, esse recurso é estritamente opt-in e permanece desligado por padrão.

### "Por que o `autoConfirm` vem desligado por padrão?"

Para evitar encerramentos prematuros baseados em evidência fraca ou incompleta. Quando agentes fecham tarefas sem validação humana, testes superficiais ou mocks parciais podem ser aceitos indevidamente. A autoconfirmação com critérios só deve ser habilitada em pipelines específicos e exige que todas as métricas críticas estejam medidas e verdes.

### "O gate deu pass com poucas métricas medidas. Isso prova que o código está pronto?"

Não. O gate é um sinal de prontidão, não uma garantia absoluta de ausência de falhas. O gate imprime `Measured: N/M` e emite um alerta explícito quando menos da metade das métricas configuradas foi de fato executada. Um resultado `pass` com baixa cobertura de medição apenas indica que os poucos testes rodados não falharam; verificações essenciais podem estar indisponíveis ou não configuradas.

### "Qual a diferença entre métricas `unavailable`, `not_configured` e `not_applicable`?"

- **`unavailable`:** a ferramenta, linter ou comando de teste não foi encontrado no ambiente ou falhou na execução preliminar.
- **`not_configured`:** a métrica pertence ao catálogo do harness, mas o projeto não declarou thresholds ou regras para ela na configuração de qualidade.
- **`not_applicable`:** o detector de stack identificou que a tecnologia não existe no projeto (por exemplo, análise de TypeScript em um repositório exclusivamente Python).

### "O que acontece quando o fixLoop se esgota?"

O loop de autocorreção possui um limite padrão de três tentativas (`fixLoop.maxAttempts = 3`). Caso as tentativas se esgotem sem resolver a falha, o harness gera um aviso detalhado e registra os erros pendentes no arquivo de progresso. A sessão não é abortada destrutivamente: o controle retorna ao operador para inspecionar a causa raiz e redefinir o plano.

### "O comando `/maestri-team` consome muitas sessões ou tokens?"

O `/maestri-team` apenas provisiona as definições de papéis especializados em terminais dedicados. Você pode rodar `/maestri-team --dry-run` para auditar papéis e ferramentas sem nenhum custo. Cada especialista atua somente quando convocado para uma tarefa específica da sua área. Em caso de acúmulo de contexto em terminais ociosos, a opção `--reset` reinicia os papéis sem perder o histórico do workspace.

### "Como funciona o reset de contexto e quando devo usá-lo?"

O reset de contexto limpa o histórico da conversa mantendo o estado durável intacto no disco (arquivos de progresso e lifecycle do PREVC). Ele deve ser acionado quando a janela de contexto acumula ruído de depuração ou quando o orçamento de tokens se esgota. Como o handoff consolida a próxima ação, a nova sessão recomeça sem redescobrir o projeto.

### "Posso usar o harness em um projeto sem Git?"

Não. O Git é um pré-requisito fundamental. O PREVC, a inspeção de diffs no gate, o controle de lanes em worktrees e a auditoria de arquivos alterados dependem da árvore de objetos do Git para delimitar o escopo e calcular métricas de fluxo.
## Erros

### "A verificação do projeto falha mas o projeto funciona"

Registre o erro no arquivo de progresso como um blocker. Corrija antes de criar
novas features. O harness não deve operar com baseline quebrada.

### "O build do site de documentação falha"

Links quebrados ou páginas faltando causam falha de build. Verifique a mensagem
de erro — o Docusaurus indica o arquivo e o link com problema.

### "Perdi o estado da sessão"

Se o handoff não foi feito, veja se `docs/harness/progress.md` e
`docs/harness/session-handoff.md` têm informação suficiente. Se não, você
precisará reconstruir o contexto manualmente — o harness não tem recuperação
automática de sessões sem handoff.

### "O rastreio não mostra o que eu digitei"

Isso é por design. O envelope redigido registra apenas eventos nativos (sessão,
run, tool name + call id, modelo) — nunca corpos de entrada/saída, mensagens,
sessão JSONL, bancos locais ou histórico de shell.
