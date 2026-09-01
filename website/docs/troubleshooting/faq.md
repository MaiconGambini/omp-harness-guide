---
sidebar_position: 1
---

# Perguntas Frequentes

## Instalação

### "npm ci falhou"

Verifique se o Node.js 20+ está instalado:

```powershell
node --version
```

Se estiver abaixo de 20, atualize em [nodejs.org](https://nodejs.org). Revise também a revisão do checkout e a compatibilidade entre `package.json` e lockfile antes de repetir `npm ci --ignore-scripts`.

### "Oh My Pi não reconhece os comandos"

Feche e reabra o Oh My Pi. A configuração em `~/.omp/agent` é carregada apenas na inicialização.

### "Posso instalar em cima da minha configuração atual?"

Não. A instalação é limpa — faça backup do seu `~/.omp/agent` antes de instalar. Se o que você tem é um layout legado do harness, `omp:migrate` substitui apenas arquivos gerenciados, com backup byte-exact das colisões e preservação dos arquivos não gerenciados.

### "O que é `omp:check` e para que serve?"

É a verificação de paridade: compara a árvore instalada em `~/.omp/agent` com o manifesto e reporta drift. Rode sempre depois de instalar ou migrar.

### "O que `omp:check` reporta numa instalação limpa?"

```json
{ "ok": true, "drift": [] }
```

Qualquer caminho gerenciado ausente ou com hash divergente aparece em `drift` e representa falha.

## Uso

### "O que significa WIP=1?"

Apenas uma unidade de trabalho pode estar `in_progress` por vez. Isso evita trabalho paralelo abandonado e mantém o foco. A ferramenta `todo` segura a unidade ativa da sessão.

### "Preciso do sprint contract para toda tarefa?"

Não. Tarefas simples (1-3 arquivos, escopo óbvio) usam o modo rápido. O sprint contract é para features complexas ou ambíguas.

### "O que acontece se eu pular o handoff?"

A próxima sessão não sabe o que foi feito. Você perde continuidade e precisa reexplicar o contexto. O handoff é obrigatório no fim de toda sessão, mesmo que o trabalho não tenha terminado.

### "Posso trabalhar em mais de uma feature ao mesmo tempo?"

Não. WIP=1 é uma regra central. Se você descobrir trabalho adjacente, adicione como `not_started` e continue na feature ativa.

### "Por que uma transição PREVC falhou com exit 2?"

`exit 2` significa recusa do harness: aresta de ciclo ilegal, estado ou receipt inválido, gate ausente/obsoleto/ilegível ou verificação que falhou. Leia o erro antes de repetir.

### "Quem confirma que o trabalho terminou?"

Ninguém além do operador. A transição final (`awaiting_confirmation → complete`) exige `--operator-action confirm` e um `docs/harness/session-handoff.md` existente. Nenhum agent se autoconfirma.

## Erros

### "A verificação do projeto falha mas o projeto funciona"

Registre o erro no arquivo de progresso como um blocker. Corrija antes de criar novas features. O harness não deve operar com baseline quebrada.

### "O build do site de documentação falha"

Links quebrados ou páginas faltando causam falha de build. Verifique a mensagem de erro — o Docusaurus indica o arquivo e o link com problema.

### "Perdi o estado da sessão"

Se o handoff não foi feito, veja se os arquivos `docs/harness/progress.md` e `docs/harness/session-handoff.md` têm informação suficiente. Se não, você precisará reconstruir o contexto manualmente — o harness não tem recuperação automática de sessões sem handoff.

### "`omp:check` reporta drift"

Leia os caminhos listados. Arquivos não gerenciados (seus) são esperados e preservados — o drift só é problema se um caminho **gerenciado** divergiu do manifesto; nesse caso, reinstale com `omp:install`.

### "O rastreio não mostra o que eu digitei"

Isso é por design. O envelope redigido registra apenas eventos nativos (sessão, run, tool name + call id, modelo) — nunca corpos de entrada/saída, mensagens, sessão JSONL, bancos locais ou histórico de shell.
