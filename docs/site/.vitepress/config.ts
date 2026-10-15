import { defineConfig } from "vitepress";

// The user documentation (ADR 0051): French at the root, English under /en/,
// served under /docs/ of pantin.frezille.fr so that the root stays free.

const frenchGuide = [
  { text: "Les fondamentaux", link: "/guide/fundamentals" },
  { text: "Le modèle d'un Pantin", link: "/guide/model" },
  { text: "Tutoriel : modéliser un vérin", link: "/guide/tutorial" },
  { text: "Connecter un automate", link: "/guide/connect-a-plc" },
  { text: "Dépannage", link: "/guide/troubleshooting" },
];

const englishGuide = [
  { text: "The fundamentals", link: "/en/guide/fundamentals" },
  { text: "The model of a Pantin", link: "/en/guide/model" },
  { text: "Tutorial: modelling a cylinder", link: "/en/guide/tutorial" },
  { text: "Connecting a PLC", link: "/en/guide/connect-a-plc" },
  { text: "Troubleshooting", link: "/en/guide/troubleshooting" },
];

export default defineConfig({
  base: "/docs/",
  title: "Pantin",
  cleanUrls: true,
  lastUpdated: false,
  themeConfig: {
    search: { provider: "local" },
    socialLinks: [{ icon: "github", link: "https://github.com/ProtoGulix/pantin" }],
  },
  locales: {
    root: {
      label: "Français",
      lang: "fr-FR",
      description: "Simulateur de machines industrielles pilotées par un vrai automate.",
      themeConfig: {
        nav: [{ text: "Guide", link: "/guide/fundamentals" }],
        sidebar: [{ text: "Guide", items: frenchGuide }],
        outline: { label: "Sur cette page" },
        docFooter: { prev: "Page précédente", next: "Page suivante" },
        darkModeSwitchLabel: "Apparence",
        sidebarMenuLabel: "Menu",
        returnToTopLabel: "Retour en haut",
        langMenuLabel: "Langue",
      },
    },
    en: {
      label: "English",
      lang: "en-GB",
      link: "/en/",
      description: "Industrial machine simulator driven by a real PLC program.",
      themeConfig: {
        nav: [{ text: "Guide", link: "/en/guide/fundamentals" }],
        sidebar: [{ text: "Guide", items: englishGuide }],
      },
    },
  },
});
