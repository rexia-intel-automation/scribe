import { defineConfig } from "vitepress";

const en = [
  { text: "Home", link: "/" },
  { text: "Install", link: "/installation" },
];
const pt = [
  { text: "Início", link: "/pt-BR/" },
  { text: "Instalação", link: "/pt-BR/installation" },
];

const enSidebar = [
  {
    text: "Guides",
    items: [
      { text: "Installation", link: "/installation" },
      { text: "Getting started", link: "/getting-started" },
      { text: "How it works", link: "/how-it-works" },
      { text: "Reference", link: "/reference" },
      { text: "Security", link: "/security" },
      { text: "Configuration", link: "/configuration" },
      { text: "Troubleshooting", link: "/troubleshooting" },
      { text: "FAQ", link: "/faq" },
      { text: "Architecture", link: "/architecture" },
      { text: "ADRs", link: "/adrs" },
      { text: "Contributing", link: "/contributing" },
      { text: "Changelog", link: "/changelog" },
    ],
  },
];
const ptSidebar = [
  {
    text: "Guias",
    items: [
      { text: "Instalação", link: "/pt-BR/installation" },
      { text: "Primeiros passos", link: "/pt-BR/getting-started" },
      { text: "Como funciona", link: "/pt-BR/how-it-works" },
      { text: "Referência", link: "/pt-BR/reference" },
      { text: "Segurança", link: "/pt-BR/security" },
      { text: "Configuração", link: "/pt-BR/configuration" },
      { text: "Solução de problemas", link: "/pt-BR/troubleshooting" },
      { text: "Perguntas frequentes", link: "/pt-BR/faq" },
      { text: "Arquitetura", link: "/pt-BR/architecture" },
      { text: "ADRs", link: "/pt-BR/adrs" },
      { text: "Contribuir", link: "/pt-BR/contributing" },
      { text: "Histórico de versões", link: "/pt-BR/changelog" },
    ],
  },
];

export default defineConfig({
  base: "/scribe/",
  ignoreDeadLinks: false,
  lang: "en-US",
  title: "Scribe",
  description: "Local desktop companion for Claude Code sessions.",
  locales: {
    root: {
      label: "English",
      lang: "en-US",
      title: "Scribe",
      description: "Local desktop companion for Claude Code sessions.",
      themeConfig: {
        nav: en,
        sidebar: enSidebar,
        search: { provider: "local" },
        footer: {
          message:
            "Independent open-source project by RexIA. Not affiliated with Anthropic.",
          copyright:
            "Claude and Claude Code are Anthropic trademarks, referenced only for compatibility.",
        },
      },
    },
    "pt-BR": {
      label: "Português",
      lang: "pt-BR",
      title: "Scribe",
      description: "Aplicativo local para acompanhar sessões do Claude Code.",
      themeConfig: {
        nav: pt,
        sidebar: ptSidebar,
        search: { provider: "local" },
        footer: {
          message:
            "Projeto independente de código aberto da RexIA. Sem afiliação com a Anthropic.",
          copyright:
            "Claude e Claude Code são marcas da Anthropic, citadas apenas para descrever compatibilidade.",
        },
      },
    },
  },
});
