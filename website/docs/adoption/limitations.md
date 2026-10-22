---
sidebar_position: 4
---

# Limitações

Uma visão rigorosa e honesta sobre o que a distribuição do Harness Oh My Pi não faz — e quais são as lacunas arquiteturais conhecidas, tratadas como limitações explícitas e não como capacidades implícitas.

## Não é um produto SaaS

O harness não é uma plataforma gerenciada na nuvem. Trata-se de um conjunto de scripts Node.js, arquivos de configuração, comandos e extensões locais executadas no terminal do desenvolvedor. Não existe servidor web central, banco de dados hospedado, autenticação de usuários ou painel corporativo em nuvem.

## Não faz merge em configuração existente

Não existe rotina de mesclagem automática sobre diretórios `~/.omp/agent` pré-existentes. O caminho suportado para atualização é realizar o backup das personalizações locais e aplicar uma cópia limpa da pasta `omp/agent/`.

## Limitações honestas do sistema

### Gate com poucas métricas medidas (`Measured: N/M`)
Um Quality Gate com veredito `pass` **não é atestado de ausência de bugs**. Em projetos novos ou com pouca instrumentação, é comum que a maioria das métricas fique como `not_configured` ou `unavailable` (por exemplo, `Measured: 7/28`). O gate mede estritamente os testes e linters que foram executados; ele não tem como atestar a solidez de componentes não instrumentados.

### Azure DevOps sem integração de políticas de branch
O harness oferece templates de Pull Request e scripts para Git e GitHub, mas as integrações avançadas de branch policies e merge checks no Azure DevOps permanecem fora de escopo. Equipes utilizando Azure DevOps operam os gates localmente ou via scripts manuais de pipeline.

### Dependência de múltiplos provedores e custo de modelos
A separação de famílias de modelo em revisões de código (implementador em um modelo e revisor em outro) é um pilar de qualidade essencial, mas introduz dependência de contas e cotas de múltiplos provedores (ex.: Google e OpenAI), além de duplicar o consumo de tokens em cada entrega.

### Custo de concorrência de terminais no Maestri
O recrutamento do time completo no Maestri (`/maestri-team`), composto por até 10 agentes especializados, demanda slots de concorrência simultâneos, limites de requisições por minuto nos provedores e consumo de memória local. Em ambientes com conexões restritas ou planos básicos de API, rodar múltiplos agentes em paralelo pode exigir enfileiramento sequencial.

### Sem merge queue autônoma nem votação multi-agente por PR
Diferente de sistemas corporativos de altíssima escala com tokens ilimitados, o harness não executa merge queues com rebase contínuo contra a main nem votações concorrentes com dezenas de agentes para cada PR. A revisão foca no revisor independente e no contrato de área `docs/review.md`.

### Regras aprendidas e limites de autoativação
O estágio Refine propõe melhorias arquiteturais e convenções. Propostas em prosa que não forem refutadas pelo `rule-verifier` podem ser auto-aprovadas em modo estritamente observacional (`observe`) sem interrupção do operador, mas **nenhuma regra aprendida adquire capacidade bloqueante (`mode: blocking` com enforcement em teste ou lint)** sem a revisão prévia, validação determinística e aprovação expressa do operador humano no ledger `agent-os/learned-rules.json`.

### Políticas não constituem sandbox de sistema operacional
Allowlists de ferramentas restringem a chamada de funções pelo modelo, mas não isolam o terminal do sistema operacional. Comandos aprovados no plano executam no host com as credenciais do usuário.

## Dependências de infraestrutura

- **Oh My Pi** base instalado e operacional.
- **Node.js 20+** para execução de scripts, validadores e adapters do Quality Gate.
- **PowerShell 5.1+** para scripts de automação em ambiente Windows.
- **Git** para controle de versão, integridade de commits e métricas de fluxo.
