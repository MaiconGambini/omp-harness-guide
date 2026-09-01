import React from 'react';
import Layout from '@theme/Layout';
import Link from '@docusaurus/Link';
import useDocusaurusContext from '@docusaurus/useDocusaurusContext';

const LIFECYCLE_STAGES = [
  'prepare',
  'plan',
  'execute',
  'validate',
  'judge',
  'refine',
  'confirm',
] as const;

function localized(isEn: boolean, pt: string, en: string): string {
  return isEn ? en : pt;
}

function HomepageHeader() {
  const { i18n } = useDocusaurusContext();
  const isEn = i18n.currentLocale === 'en';

  return (
    <header className="home-header">
      <p className="home-eyebrow">
        {localized(isEn,
          'Workflow de agentes com estado durável',
          'Durable-state agent workflow',
        )}
      </p>
      <h1 className="home-title">Harness Oh My Pi</h1>
      <p className="home-subtitle">
        {localized(isEn,
          'Guia bilíngue do harness Oh My Pi: planeje, execute, valide e confirme o trabalho de agentes em múltiplas sessões, com evidência objetiva e handoff limpo.',
          'Bilingual guide to the Oh My Pi harness: plan, execute, validate and confirm agent work across sessions, with objective evidence and a clean handoff.',
        )}
      </p>

      <div
        className="lifecycle-strip"
        aria-label={localized(isEn, 'Ciclo de vida PREVC', 'PREVC lifecycle')}
      >
        {LIFECYCLE_STAGES.map((stage, index) => (
          <React.Fragment key={stage}>
            {index > 0 && (
              <span className="lifecycle-arrow" aria-hidden="true">
                →
              </span>
            )}
            <span className="lifecycle-stage">{stage}</span>
          </React.Fragment>
        ))}
      </div>

      <div className="home-ctas">
        <Link
          className="button button--primary button--lg"
          to="/docs/getting-started/installation"
        >
          {localized(isEn, 'Começar agora', 'Get started')}
        </Link>
        <Link
          className="button button--outline button--lg"
          to="/docs/concepts/prevc"
        >
          {localized(isEn, 'Entender PREVC', 'Understand PREVC')}
        </Link>
      </div>
    </header>
  );
}

function BenefitCard({
  step,
  title,
  description,
  tone,
}: {
  step: string;
  title: string;
  description: string;
  tone: 'green' | 'amber' | 'slate';
}) {
  return (
    <div className={`home-card home-card--${tone}`}>
      <p className="home-card-step">{step}</p>
      <h3>{title}</h3>
      <p>{description}</p>
    </div>
  );
}

function HomepageBody() {
  const { siteConfig, i18n } = useDocusaurusContext();
  const isEn = i18n.currentLocale === 'en';
  const baseUrl = siteConfig.baseUrl;
  const defaultBaseUrl =
    isEn && baseUrl.endsWith('en/') ? baseUrl.slice(0, -3) : baseUrl;

  const cards = [
    {
      step: localized(isEn, '01 / ESTADO DURÁVEL', '01 / DURABLE STATE'),
      title: localized(isEn, 'Cada sessão sabe onde parou', 'Every session knows where it stopped'),
      description: localized(isEn,
        'Arquivos de progresso, handoff e feature state garantem que a próxima sessão continue sem redescobrir o projeto do zero.',
        'Progress files, handoffs and feature state ensure the next session picks up without rediscovering the project from scratch.',
      ),
      tone: 'green' as const,
    },
    {
      step: localized(isEn, '02 / EVIDÊNCIA', '02 / EVIDENCE'),
      title: localized(isEn, 'Conclusão exige prova, não confiança', 'Completion requires proof, not trust'),
      description: localized(isEn,
        'Verificação em camadas — estática, runtime e de sistema — antes de marcar qualquer tarefa como concluída.',
        'Layered verification — static, runtime and system — before any task is marked done.',
      ),
      tone: 'amber' as const,
    },
    {
      step: localized(isEn, '03 / HANDOFF', '03 / HANDOFF'),
      title: localized(isEn, 'Encerre sem perder o contexto', 'Wrap up without losing context'),
      description: localized(isEn,
        'Toda sessão produz um handoff limpo: o que foi feito, o que quebrou e a única próxima ação.',
        'Every session produces a clean handoff: what was done, what broke, and the single next action.',
      ),
      tone: 'slate' as const,
    },
  ];

  const covers = [
    {
      label: localized(isEn,
        'Instalação e primeira sessão',
        'Installation and first session',
      ),
      to: '/docs/getting-started/installation',
    },
    {
      label: localized(isEn, 'O ciclo PREVC e a regra WIP=1', 'The PREVC lifecycle and the WIP=1 rule'),
      to: '/docs/concepts/prevc',
    },
    {
      label: localized(isEn,
        'Conceitos e componentes do harness',
        'Harness concepts and components',
      ),
      to: '/docs/concepts/why-a-harness',
    },
    {
      label: localized(isEn,
        'Guias: planejamento, tarefas, dispatch paralelo, portabilidade',
        'Guides: planning, tasks, parallel dispatch, portability',
      ),
      to: '/docs/guides/planning-pipeline',
    },
    {
      label: localized(isEn,
        'Referência: comandos, skills, artefatos, estrutura do repositório',
        'Reference: commands, skills, artifacts, repository structure',
      ),
      to: '/docs/reference/commands',
    },
    {
      label: localized(isEn,
        'Adoção, segurança, limitações e FAQ',
        'Adoption, security, limitations and FAQ',
      ),
      to: '/docs/adoption/use-cases',
    },
  ];

  return (
    <main className="home-main">
      <div className="home-cards">
        {cards.map((card) => (
          <BenefitCard
            key={card.step}
            step={card.step}
            title={card.title}
            description={card.description}
            tone={card.tone}
          />
        ))}
      </div>

      <section className="home-note" aria-label={localized(isEn, 'Guia bilíngue', 'Bilingual guide')}>
        <h2>{localized(isEn, 'Guia bilíngue', 'Bilingual guide')}</h2>
        <p>
          {localized(isEn,
            'O idioma padrão do site é o Português (Brasil). A versão em inglês está disponível em /en/.',
            'The default site locale is Brazilian Portuguese. An English version is available at /en/.',
          )}
        </p>
        <p>
          {isEn ? (
            <a href={defaultBaseUrl}>
              {localized(isEn, 'Ver em português →', 'View in Portuguese →')}
            </a>
          ) : (
            <a href={`${baseUrl}en/`}>
              {localized(isEn, 'Ver em inglês →', 'View in English →')}
            </a>
          )}
        </p>
      </section>

      <section className="home-covers">
        <h2>{localized(isEn, 'O que este guia cobre', 'What this guide covers')}</h2>
        <ul>
          {covers.map((item) => (
            <li key={item.to}>
              <Link to={item.to}>{item.label}</Link>
            </li>
          ))}
        </ul>
      </section>
    </main>
  );
}

export default function Home(): React.JSX.Element {
  const { siteConfig, i18n } = useDocusaurusContext();
  const isEn = i18n.currentLocale === 'en';

  return (
    <Layout
      title={siteConfig.title}
      description={
        isEn
          ? 'Documentation of the Harness Oh My Pi workflow: plan, execute, validate and confirm agent work across sessions.'
          : 'Documentação do workflow Harness Oh My Pi: planeje, execute, valide e confirme o trabalho de agentes em múltiplas sessões.'
      }
    >
      <HomepageHeader />
      <HomepageBody />
    </Layout>
  );
}
