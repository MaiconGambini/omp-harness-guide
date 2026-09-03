---
sidebar_position: 1
---

# Início rápido

Este caminho leva de um projeto limpo ao primeiro objetivo no Harness Oh My Pi.
O OMP combina o ciclo PREVC com execução nativa de até 32 subagentes, fan-out
paralelo e sharding de testes. Para a instalação completa, incluindo backup,
obtenção e validação do pacote, consulte [Instalação](./installation).

1. **Instale o núcleo em uma pasta limpa.** Depois de obter e revisar o
   checkout do repositório, execute o mesmo bloco copy-pasteável do
   [guia de instalação](./installation):

   ```powershell
   $target = Join-Path $env:USERPROFILE ".omp\agent"
   New-Item -ItemType Directory -Force $target | Out-Null
   Copy-Item -Path ".\omp\agent\*" -Destination $target -Recurse -Force
   ```

2. **Prepare um objetivo no projeto.** Dentro do Oh My Pi, execute exatamente:

   ```text
   /prevc prepare "Criar rota POST /auth/login com JWT"
   ```

3. **Observe o ciclo antes de executar.** O PREVC apresenta o plano para
   aprovação explícita; depois da aprovação, o OMP despacha lanes independentes
   e shards em paralelo quando o plano permitir, roda a validação e reúne a
   evidência dos testes. O Judge compara o resultado com os critérios de
   aceite, e o handoff registra o que foi verificado, os arquivos alterados,
   blockers e a próxima ação para continuidade entre sessões. Consulte
   [Primeira Sessão](./first-session) para o fluxo operacional completo.
