# Harness Oh My Pi

Guia público e bilíngue do harness Oh My Pi. O contrato PREVC organiza sete
etapas em quatro fases: Prepare (`prepare + plan`), Execute (`execute`),
Validate (`validate + judge`) e Confirm (`refine + confirm`). O estado durável,
as evidências e o handoff entre sessões pertencem ao contrato, não a uma
promessa de produto.

No desenho deste guia, o **PREVC é o contrato comum**; o **OpenCode é o
adaptador metodológico e de continuidade**, que organiza convenções, artefatos
e handoffs; e o **OMP é o motor nativo**, que executa o contrato com `task`,
`tasks[]`, `hub`, `todo` e extensões do runtime. Sharding só entra quando o
plano declara lanes independentes e ownership sem sobreposição.

## Português

O Harness Oh My Pi organiza o trabalho com agentes em ciclos previsíveis de
planejamento, execução, validação, avaliação e entrega. Cada sessão mantém
estado durável (`harness-prevc-state.mjs`), respeita a regra WIP=1 e registra
evidências mensuráveis antes de qualquer handoff. Eventos nativos do Oh My Pi
(`pi.on`) alimentam um rastreamento redigido e compartilhado entre sessões.
Os comandos do pacote são instalados em `~/.omp/agent/commands/`; não há
comandos públicos `omp:*`.

- [Documentação em português](https://maicongambini.github.io/omp-harness-guide/)
- [Repositório](https://github.com/MaiconGambini/omp-harness-guide)

## English

Oh My Pi Harness organizes agent work under a common PREVC contract. The seven
steps are grouped into four phases: Prepare (`prepare + plan`), Execute
(`execute`), Validate (`validate + judge`), and Confirm (`refine + confirm`).
Durable state, evidence, and session handoff belong to the contract, not to a
product-performance claim.

Here, **PREVC is the common contract**; **OpenCode is the methodological and
continuity adapter** for conventions, artifacts, and handoffs; and **OMP is
the native engine**, using `task`, `tasks[]`, `hub`, `todo`, and runtime
extensions. Sharding applies only when the plan declares independent lanes with
non-overlapping ownership.

- [English documentation](https://maicongambini.github.io/omp-harness-guide/en/)
- [Repository](https://github.com/MaiconGambini/omp-harness-guide)

## Desenvolvimento local do site / Local site development

Este repositório contém o site público e o núcleo distribuível do OMP em
`omp/agent/`. Clonar o repositório e instalar `website` serve apenas à
documentação; isso não instala automaticamente o runtime em `~/.omp/agent`.
Para instalar o núcleo, siga o guia de
[instalação completa](https://maicongambini.github.io/omp-harness-guide/docs/getting-started/installation)
e revise a revisão Git e o manifesto antes de copiar arquivos para o diretório
do agente. O runtime base do Oh My Pi é uma dependência separada.

> Instalação limpa / Clean install: se `~/.omp/agent` já existe, renomeie para
> `omp-agent-backup` antes de instalar — não há merge automático / if
> `~/.omp/agent` already exists, rename it to `omp-agent-backup` first — there
> is no automatic merge.

```powershell
git clone https://github.com/MaiconGambini/omp-harness-guide.git
cd omp-harness-guide
npm ci --ignore-scripts --prefix website
```

## Distribuição OMP / OMP distribution

`omp/agent/` contém os arquivos reais gerenciados pelo Oh My Pi: agents,
commands, scripts, extensão, configuração e skills gerais. O pacote não inclui
estado de runtime, bancos locais, evidências privadas, skills de recon,
pentest, exploração, WSTG ou playbooks ofensivos; mantém somente controles
defensivos necessários ao próprio harness.

O pacote público não anuncia release semântica. Identifique o conteúdo pela
revisão Git aprovada e pelos hashes de `omp/agent/omp-port-manifest.json`.

instalação limpa:

```powershell
$target = Join-Path $env:USERPROFILE ".omp\agent"
New-Item -ItemType Directory -Force $target | Out-Null
Copy-Item -Path "omp/agent/*" -Destination $target -Recurse -Force
```
## Portfólio / Portfolio

**Problema / Problem:** manter escopo, continuidade e prova ao executar
trabalho significativo com agents em um runtime nativo.

**Método / Method:** aplicar o contrato PREVC em sete etapas agrupadas em quatro
fases, com WIP=1, aprovação do operador e Judge read-only.

**Implementação / Implementation:** mapear o contrato para o motor OMP:
`task`/`tasks[]` para lanes, `hub` para coordenação, `todo` para estado da
sessão, sharding condicionado e extensões nativas para observabilidade.

**Evidência / Evidence:** revisão Git, manifesto com hashes e
`scripts/validate-public-subset.mjs` verificam o pacote público. Exemplos de
dispatch e números de wall-clock são ilustrativos até que uma medição
reprodutível seja registrada.

## Verificação / Verification

```powershell
node scripts/validate-public-subset.mjs
npm run typecheck --prefix website
npm run build --prefix website
```

## Documentação local / Local docs

```powershell
npm ci --ignore-scripts --prefix website
npm --prefix website start
```

Abra / Open `http://localhost:3000/omp-harness-guide/`.

## Estrutura / Structure

- `omp/agent/` — núcleo OMP distribuível, com agents, commands, scripts, extensão, configuração e skills gerais.
- `website/` — site Docusaurus bilíngue (padrão pt-BR; inglês em `/en/`).
- `scripts/` — manifest público e validador determinístico do subconjunto público.

## Escopo de segurança pública / Public-safety scope

Este repositório público contém o site, o núcleo OMP curado e artefatos de
validação; o manifest `scripts/harness-manifest.json` e o validador
`scripts/validate-public-subset.mjs` garantem em CI que a árvore permaneça
dentro do subconjunto permitido.

Incluído: README, `omp/agent/**`, o site `website/**`, o manifest, o validador,
o `CODEOWNERS` e os workflows. Excluído e rejeitado: estado privado do PREVC e
evidências de runtime (estado, receipts de judge e de review, findings, traces
e relatórios de qualidade), subárvores não revisadas, manifests de portabilidade
e arquivos de credenciais ou configuração local (`.env`, `.env.*`, `*.env.*`,
`.pem`, `.key`, `*.secret`, `*.local.json`, `.npmrc`), além de skills
`recon-*`, `redteam-*`, `hiagosh-*`, `wstg-*` e famílias ofensivas equivalentes.
Conteúdo com formato de segredo (chaves privadas, tokens bearer, credenciais
`sk-`) é rejeitado em qualquer arquivo público. O validador imprime apenas
caminhos e motivos — nunca os valores detectados.

Não publique exemplos com formato `token = "valor"` ou credenciais parecidas;
prefira explicar o formato em prosa. / Do not publish
`token = "value"`-shaped examples or credential-like literals; explain the
format in prose instead.

Para preservar a confiança do gate, proteja a branch `main` no GitHub,
exija pull requests, revisão do `CODEOWNERS` e os checks de subconjunto público
antes do merge. / Protect `main`, require pull requests, CODEOWNERS review, and
the public-subset checks before merging.

## Limitações / Limitations

- Policies de permissão controlam o comportamento dos agentes, mas não são
  isolamento de sistema operacional.
- O guia não comprova RLS/IDOR de aplicações reais; isso pertence ao projeto
  que usa o harness.
- Recursos ainda não implementados (A2A/UCP/BCP, fontes de custo não
  suportadas) são documentados como lacunas, não como capacidades.
- As afirmações do guia vêm de contratos de fonte curados ou estão rotuladas
  como limitações.

## Licença / License

Este repositório é público. Revise os arquivos antes de compartilhar
informações que não deveriam ser públicas.

This repository is public. Review files before sharing information that should
not be public.
