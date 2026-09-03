# Site público e pacote OMP

Este diretório contém o site Docusaurus do Harness Oh My Pi. Ele publica a
documentação, mas não instala nem executa o runtime do OMP.

## Desenvolver o site

A partir de `website/`:

```powershell
npm ci
npm run start
```

Abra `http://localhost:3000/omp-harness-guide/`. Para uma verificação local do
site, use:

```powershell
npm run typecheck
npm run build
```

A documentação-fonte fica em `docs/`; as traduções inglesas ficam em
`i18n/en/`. Preserve a estrutura de headings e os links entre os dois idiomas
quando alterar o conteúdo em português.

## Pacote público do OMP

O runtime distribuível fica no diretório irmão `../omp/agent/`. Instalar as
dependências deste diretório serve apenas para desenvolver o site; isso não
copia arquivos para `~/.omp/agent`.

A partir da raiz do repositório, valide e instale o pacote em uma pasta limpa:

```powershell
node scripts/validate-public-subset.mjs --check-manifest
$target = Join-Path $env:USERPROFILE ".omp\agent"
New-Item -ItemType Directory -Force $target | Out-Null
Copy-Item -Path ".\omp\agent\*" -Destination $target -Recurse -Force
```

Revise `omp/agent/omp-port-manifest.json` e a revisão Git antes da cópia. O
pacote não publica uma release semântica; a revisão e os hashes do manifesto
identificam o conteúdo distribuído. O runtime base do Oh My Pi deve estar
instalado separadamente.

## Limites de edição

- Edite o site em `docs/`, `src/` e nos arquivos de configuração do site quando
  a mudança exigir código de apresentação.
- Não coloque estado de sessão, evidências privadas, credenciais ou arquivos de
  `~/.omp/agent` no pacote público.
- Não trate exemplos de dispatch como benchmark: o fluxo nativo usa `task`,
  `tasks[]`, `hub` e sharding apenas quando o plano permite.

## Public website and package

This directory contains the Docusaurus website for Harness Oh My Pi. It
publishes documentation; it does not install or run the OMP runtime.

From `website/`, install the site dependencies and start the local server with
`npm ci` and `npm run start`. The source documentation is in `docs/`, and the
English translations are in `i18n/en/`. Keep heading structure and internal
links aligned when changing the Portuguese source.

The distributable OMP runtime is the sibling directory `../omp/agent/`. Validate
that public tree from the repository root with
`node scripts/validate-public-subset.mjs --check-manifest`, then copy it to a
clean `~/.omp/agent` installation as described above. Site dependencies and the
runtime base of Oh My Pi are separate installations. Identify a package by its
reviewed Git revision and manifest hashes; do not infer a public release from
this private website package.
