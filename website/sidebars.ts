import type { SidebarsConfig } from '@docusaurus/plugin-content-docs';

const sidebars: SidebarsConfig = {
  tutorialSidebar: [
    'intro',
    {
      type: 'category',
      label: 'Primeiros Passos',
      link: { type: 'doc', id: 'getting-started/quickstart' },
      items: [
        'getting-started/prerequisites',
        'getting-started/installation',
        'getting-started/first-session',
      ],
    },
    {
      type: 'category',
      label: 'Conceitos Essenciais',
      link: { type: 'doc', id: 'concepts/why-a-harness' },
      items: [
        'concepts/seven-components',
        'concepts/prevc',
        'concepts/continual-harness',
        'concepts/wip-one',
        'concepts/evidence-and-handoff',
      ],
    },
    {
      type: 'category',
      label: 'Guias Práticos',
      items: [
        'guides/planning-pipeline',
        'guides/small-task',
        'guides/complex-feature',
        'guides/parallel-dispatch',
        'guides/existing-project',
        'guides/portability',
      ],
    },
    {
      type: 'category',
      label: 'Referência Completa',
      items: [
        'reference/commands',
        'reference/skills',
        'reference/artifacts',
        'reference/repository-structure',
      ],
    },
    {
      type: 'category',
      label: 'Adoção & FAQ',
      link: { type: 'doc', id: 'adoption/use-cases' },
      items: [
        'adoption/pros-and-cons',
        'adoption/security',
        'adoption/limitations',
        'troubleshooting/faq',
      ],
    },
    'references',
  ],
};

export default sidebars;
