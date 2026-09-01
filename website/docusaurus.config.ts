import { themes as prismThemes } from 'prism-react-renderer';
import type { Config } from '@docusaurus/types';
import type * as Preset from '@docusaurus/preset-classic';

const config: Config = {
  title: 'Harness Oh My Pi',
  tagline:
    'Guia bilíngue do harness Oh My Pi: estado durável, evidência e handoff entre sessões',
  favicon: 'img/omp-harness-logo.svg',

  future: {
    v4: true,
  },

  url: 'https://maicongambini.github.io',
  baseUrl: '/omp-harness-guide/',

  organizationName: 'MaiconGambini',
  projectName: 'omp-harness-guide',

  onBrokenLinks: 'throw',

  markdown: {
    hooks: {
      onBrokenMarkdownLinks: 'throw',
    },
  },

  i18n: {
    defaultLocale: 'pt-BR',
    locales: ['pt-BR', 'en'],
    localeConfigs: {
      en: {
        htmlLang: 'en-US',
        label: 'English',
      },
    },
  },

  presets: [
    [
      'classic',
      {
        docs: {
          sidebarPath: './sidebars.ts',
          routeBasePath: 'docs',
          editUrl:
            'https://github.com/MaiconGambini/omp-harness-guide/tree/main/website/',
        },
        blog: false,
        theme: {
          customCss: './src/css/custom.css',
        },
      } satisfies Preset.Options,
    ],
  ],

  themeConfig: {
    colorMode: {
      defaultMode: 'dark',
      disableSwitch: true,
      respectPrefersColorScheme: false,
    },

    navbar: {
      title: 'Harness Oh My Pi',
      logo: {
        alt: 'Harness Oh My Pi',
        src: 'img/omp-harness-logo.svg',
      },
      items: [
        {
          type: 'docSidebar',
          sidebarId: 'tutorialSidebar',
          position: 'left',
          label: 'Docs',
        },
        {
          type: 'localeDropdown',
          position: 'right',
        },
        {
          href: 'https://github.com/MaiconGambini/omp-harness-guide',
          label: 'GitHub',
          position: 'right',
        },
      ],
    },

    footer: {
      style: 'dark',
      links: [
        {
          title: 'Docs',
          items: [
            { label: 'Introdução', to: '/docs/intro' },
            {
              label: 'Instalação',
              to: '/docs/getting-started/installation',
            },
            { label: 'PREVC', to: '/docs/concepts/prevc' },
          ],
        },
        {
          title: 'Projeto',
          items: [
            {
              label: 'GitHub',
              href: 'https://github.com/MaiconGambini/omp-harness-guide',
            },
          ],
        },
      ],
      copyright: `© ${new Date().getFullYear()} Harness Oh My Pi. Built with Docusaurus.`,
    },

    prism: {
      theme: prismThemes.vsDark,
      darkTheme: prismThemes.vsDark,
      additionalLanguages: ['powershell', 'bash', 'json'],
    },
  } satisfies Preset.ThemeConfig,
};

export default config;
