---
sidebar_position: 2
---

# Prós e Contras

Uma avaliação transparente e equilibrada do que o harness entrega e dos custos e compromissos operacionais associados.

## Prós

### Continuidade determinística entre sessões
Você encerra o terminal e retorna no dia seguinte com o estado intacto. A fase PREVC, os bloqueios, as decisões tomadas e o handoff estruturado (`session-handoff.md`) persistem em disco. Elimina-se o desperdício de tokens e tempo reexplicando o histórico para um novo agente.

### Disciplina de foco cognitivo (WIP=1)
A restrição de uma única tarefa ativa por vez impede dispersão de escopo (*context mixing*). O teto padrão de 3 rodadas no macro-loop de correção (`fixLoop.maxAttempts`) evita vaivéns infinitos entre autor e revisor, pausando para intervenção humana antes de estourar orçamentos.

### Evidência objetiva e Quality Gate transparente
Afirmações verbais do modelo não contam como prova. O Quality Gate avalia métricas determinísticas e exibe com total clareza a razão de cobertura de medição (**`Measured: N/M`**). Avisos explícitos alertam revisores quando menos da metade das ferramentas previstas foi executada.

### Revisão independente com modelos de famílias distintas
Ao colocar o implementador em um modelo (ex.: Gemini Flash) e o revisor em uma arquitetura concorrente (ex.: GPT Luna), eliminam-se pontos cegos e suposições compartilhadas do mesmo provedor. Contratos por área (`docs/review.md`) mantêm o foco nas falhas críticas reais, descartando debates puramente cosméticos.

### Rastreabilidade total e procedimentos de reversão
Templates padronizados de Pull Request exigem a declaração de Tier de risco, comandos de teste executados com saída observada, procedimento formal de reversão (`Como reverter`) e identificação do engenheiro responsável. Traillers de commit vinculam a entrega ao hash do relatório de validação (`sourceHash`).

### Despacho governado e time de agentes no Maestri
O orquestrador despacha lanes paralelas com posse declarada de arquivos e sincronização automática, permitindo equipes especializadas com papéis estritos (arquitetura, testes, infraestrutura, segurança e revisão).

## Contras

### Custo acrescido de tokens e provedores
Executar revisores independentes em modelos de ponta, acionar times com múltiplos agentes simultâneos e avaliar testes de regressão eleva o consumo de tokens e a dependência de créditos em múltiplos provedores de IA.

### Volume de arquivos de governança
O harness introduz especificações em `agent-os/specs/`, relatórios de gate, contratos em `docs/review.md`, handoffs e templates de PR. Para projetos minúsculos ou scripts descartáveis, essa estrutura pode parecer burocrática.

### Necessidade de disciplina constante
O valor do harness depende da adesão estrita ao fluxo: respeitar WIP=1, validar saídas reais e registrar handoffs em cada sessão. Atalhos e edições improvisadas fora do PREVC degradam a integridade do estado durável.

### Não substitui discernimento de produto e engenharia
O harness garante processo, rastreabilidade e medição empírica; ele não inventa boa arquitetura nem garante que o produto construído terá valor comercial. Código mal concebido continuará mal concebido, ainda que aprovado com evidências completas ("you land it, you own it").

### Curva de aprendizado inicial
A adoção inicial exige compreender a divisão de fases, as convenções de comandos e os arquivos de configuração. O investimento compensa largamente em projetos de médio e longo prazo, mas exige maturidade da equipe.

### Instalação em diretório limpo
Não há suporte a merge automatizado sobre instalações existentes. Atualizações e migrações exigem backup prévio e cópia limpa do pacote `omp/agent/`.
