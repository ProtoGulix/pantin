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

const frenchReference = [
  { text: "L'écran", link: "/reference/interface" },
  { text: "Menus", link: "/reference/menus" },
  { text: "Panneaux et boutons", link: "/reference/panels" },
  { text: "Vues centrales", link: "/reference/views" },
  { text: "Raccourcis clavier et souris", link: "/reference/shortcuts" },
];

const englishGuide = [
  { text: "The fundamentals", link: "/en/guide/fundamentals" },
  { text: "The model of a Pantin", link: "/en/guide/model" },
  { text: "Tutorial: modelling a cylinder", link: "/en/guide/tutorial" },
  { text: "Connecting a PLC", link: "/en/guide/connect-a-plc" },
  { text: "Troubleshooting", link: "/en/guide/troubleshooting" },
];

const englishReference = [
  { text: "The screen", link: "/en/reference/interface" },
  { text: "Menus", link: "/en/reference/menus" },
  { text: "Panels and buttons", link: "/en/reference/panels" },
  { text: "Central views", link: "/en/reference/views" },
  { text: "Keyboard and mouse shortcuts", link: "/en/reference/shortcuts" },
];

export default defineConfig({
  base: "/docs/",
  title: "Pantin",
  // `head` links are not rewritten with `base`, unlike the theme's images.
  head: [["link", { rel: "icon", type: "image/svg+xml", href: "/docs/favicon.svg" }]],
  cleanUrls: true,
  lastUpdated: false,
  themeConfig: {
    // Below 48 px only the favicon glyph is used, never the symbol (ADR 0052 point 3).
    logo: "/favicon.svg",
    search: { provider: "local" },
    socialLinks: [{ icon: "github", link: "https://github.com/ProtoGulix/pantin" }],
  },
  locales: {
    root: {
      label: "Français",
      lang: "fr-FR",
      description: "Simulateur de machines industrielles pilotées par un vrai automate.",
      themeConfig: {
        nav: [
          { text: "Guide", link: "/guide/fundamentals" },
          { text: "Référence", link: "/reference/interface" },
        ],
        sidebar: [
          { text: "Guide", items: frenchGuide },
          { text: "Référence de l'interface", items: frenchReference },
        ],
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
        nav: [
          { text: "Guide", link: "/en/guide/fundamentals" },
          { text: "Reference", link: "/en/reference/interface" },
        ],
        sidebar: [
          { text: "Guide", items: englishGuide },
          { text: "Interface reference", items: englishReference },
        ],
      },
    },
  },
});
