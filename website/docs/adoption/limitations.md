---
sidebar_position: 4
---

# Limitações

O que o Harness Oh My Pi não faz na versão atual — e o que é lacuna explícita, não capacidade.

## Não é um produto SaaS

O harness é um conjunto de arquivos de configuração, scripts e uma extensão. Não há servidor, API, autenticação ou dashboard gerenciados.

## Não faz merge em configuração existente

O caminho suportado é uma cópia limpa de `omp/agent/` após backup. Não há
script de merge ou migração: se `~/.omp/agent` já existe, renomeie-o para
`omp-agent-backup` antes de instalar.

## Não é um gerenciador de pacotes

Não há CLI de instalação, atualização automática ou versionamento semântico da
distribuição. Atualizações usam uma revisão Git revisada, validação do manifest
e nova cópia limpa do núcleo.

## Não documenta todas as skills

O site documenta o workflow do harness. Skills especializadas (frontend,
backend, Python, TypeScript e testes) que acompanham o núcleo não têm capítulos
próprios na documentação.

## Não é multiplataforma completo

O harness foi projetado e testado no Windows com PowerShell 5.1+. O runtime
Node é portável, mas os fluxos documentados de instalação usam comandos
PowerShell; scripts shell equivalentes não são fornecidos para outros sistemas.

## Lacunas explícitas

- **Sem A2A/UCP/BCP** — não há suporte a protocolos de comunicação entre agents (A2A), Universal Control Plane (UCP) ou Blockchain Certified Programs (BCP). Não trate esses nomes como capacidades.
- **Sem AI Gateway** — não há gateway de IA gerenciado na distribuição.
- **Sem prova de autorização de aplicações reais** — o contrato de segurança (`agent-os/security-contract.json`) verifica presença e existência de evidência declarada; não prova RLS/IDOR de aplicações fora deste repositório.
- **Fontes de custo/uso limitadas** — o rastreio registra identidade e uso de modelo exatamente como o runtime forneceu; quando a fonte não fornece, o valor é `unavailable` explícito — nunca zero nem inferido.
- **Sem auto-ativação de regras em prosa** — a ativação automática de regras aprendidas não está ativa por padrão.
- **Config exige restart** — alterações de configuração não afetam um processo do Oh My Pi já iniciado sem reiniciá-lo.
- **Políticas não são sandbox** — permissões reduzem blast radius, mas não isolam o processo do sistema operacional.
- **O rastreio não é onisciente** — o envelope cobre eventos nativos e registros explícitos de lifecycle; sessão JSONL, bancos locais, statusline e histórico de shell nunca são rastreados.

## Dependências

- Oh My Pi instalado e funcionando.
- Node.js 20+ para os scripts.
- PowerShell 5.1+ para os fluxos de instalação.
- Git para controle de versão.
