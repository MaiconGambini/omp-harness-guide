---
sidebar_position: 3
---

# Segurança

Limites de segurança do Harness Oh My Pi. É importante entender tanto o que o harness protege quanto o que ele deliberadamente não protege — a segurança mora na fase de planejamento e aprovação, não em bloqueios automáticos.

## O que o harness protege

- **Estado durável** — blockers, decisões e handoffs são registrados em arquivos. Nenhuma informação de estado vive apenas na memória do chat.
- **Permissões declarativas** — cada agent tem uma allowlist de ferramentas; operações sensíveis (push, deploy, mutação de pacotes, diretórios externos) exigem aprovação explícita.
- **Verificação em três camadas** — todo resultado é validado antes de ser marcado como concluído.
- **Rastreabilidade** — cada mudança é associada a uma feature, com evidência e aprovação registradas.
- **Redação** — o rastreio nativo grava apenas o nome e o id da chamada de ferramenta, nunca corpos de entrada/saída, mensagens ou valores de ambiente.

## Guardrails obrigatórios

- **Red-team quickcheck (R1)** — `harness-redteam-scan.mjs` escaneia cada diff de lane reconciliado (determinístico, read-only); achados ou tier `sampling`/`full` escalam para revisão de segurança especializada.
- **Cooldown de dependência (R3)** — uma dependência nova com menos de 7 dias bloqueia o gate full; apenas aprovação explícita do operador libera.
- **Contrato de segurança (R2)** — `agent-os/security-contract.json` declara os caminhos de evidência de isolamento/autorização do projeto; o gate exige a presença do contrato e a existência da evidência declarada (`authz_controls`). Sem contrato, a lacuna é nomeada como `unavailable` — nunca um pass.
- **Varredura de secrets** — `/harness-security-scan` audita harness e projeto buscando segredos e riscos de supply-chain, resumindo PASS/WARN/FAIL sem imprimir valores.

## Bloqueios do security guard

A extensão `harness-security-guard.ts` bloqueia padrões reconhecidos de:

- Remoção recursiva.
- `git reset --hard` e variantes destrutivas.
- `git clean` forçado.
- Shells remotos.
- Download seguido de execução.
- Acesso a caminhos sensíveis.

## Redação de logs e retenção

O `harness-omp-trace.ts` consome eventos nativos (`pi.on`) e persiste um envelope redigido, validado, encadeado por hash e limitado por tamanho/eventos. Registros de ferramenta carregam apenas nome e id da chamada; registros de modelo carregam identidade e uso exatamente como o runtime forneceu (ausente → `unavailable` explícito, nunca zero ou inferido). Logs ajudam no diagnóstico; eles não provam que um objetivo foi concluído corretamente — apenas `--verify` torna o stream evidência de auditoria.

## Segredos

Nunca inclua credenciais, tokens, dados pessoais ou payloads sensíveis em: goals, evidence, session handoff, logs de ferramentas ou documentos de governança. Quando precisar registrar um fato sensível, use uma descrição redigida — por exemplo: "token de integração presente e carregado pelo secret store, nunca o valor".

## O que o harness NÃO protege

### Não há sandbox de sistema operacional

As políticas de permissão reduzem risco, mas **não** são uma fronteira de segurança do sistema operacional. Um comando aprovado e executado no shell tem acesso total ao sistema.

### Não prova autorização de aplicações reais

O contrato de segurança verifica presença e existência de evidência declarada — ele não prova isolamento multi-tenant (RLS/IDOR) de uma aplicação que não faz parte deste repositório. Esta documentação não reivindica tal prova.

### Não substitui revisão humana

O Judge avalia o trabalho contra critérios objetivos, mas a confirmação final ainda depende do operador. O harness reduz o risco de conclusão prematura — não elimina a necessidade de revisão.

### O guard não cobre tudo

O security guard bloqueia padrões *reconhecidos*, mas não é infalível. A segurança real ainda mora na fase de planejamento e aprovação: revise cada comando do plano antes de aprovar.

## Boas práticas

1. **Revise o plano antes de aprovar.** Todo comando listado no plano será executado — leia cada linha.
2. **Mantenha a configuração sob controle de versão** e revise as permissões antes de compartilhar.
3. **Não armazene tokens ou credenciais em arquivos de configuração.** Use variáveis de ambiente.
4. **Rode `/harness-security-scan` periodicamente** para detectar secrets expostos e permissões excessivas.
5. **Lembre que o repositório é público** — não comite nada que não deveria ser visível para qualquer pessoa.
