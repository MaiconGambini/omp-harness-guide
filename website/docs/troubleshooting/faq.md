---
sidebar_position: 1
---

# Perguntas Frequentes

## Instalação

### "O que preciso instalar?"

Clone o repositório, revise `omp/agent/omp-port-manifest.json`, rode o
validator e copie `omp/agent/*` para uma pasta limpa em `~/.omp/agent`. O site
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

Ninguém além do operador. A transição final
(`awaiting_confirmation → complete`) exige `--operator-action confirm` e um
`docs/harness/session-handoff.md` existente. Nenhum agent se autoconfirma.

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
