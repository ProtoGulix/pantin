import { defineConfig } from "vitepress";

// The user documentation (ADR 0051): French at the root, English under /en/,
// served under /docs/ of pantin.frezille.fr so that the root stays free.

const frenchGuide = [
  {
    text: "Démarrer",
    items: [
      { text: "Les fondamentaux", link: "/guide/fundamentals" },
      { text: "Tutoriel : modéliser un vérin", link: "/guide/tutorial" },
    ],
  },
  {
    text: "Préparer ses modèles 3D",
    items: [{ text: "Préparer ses fichiers de CAO", link: "/guide/preparing-models" }],
  },
  {
    text: "Construire un Pantin",
    items: [
      { text: "Le modèle d'un Pantin", link: "/guide/model" },
      { text: "Grouper, dégrouper, déplacer un corps", link: "/guide/groups" },
      { text: "Préactionneurs, actionneurs et capteurs", link: "/guide/action-chain" },
      { text: "Produits et convoyage", link: "/guide/conveying" },
      { text: "Tags, défauts et liste d'E/S", link: "/guide/tags" },
    ],
  },
  {
    text: "Connecter un automate",
    items: [{ text: "Connecter un automate", link: "/guide/connect-a-plc" }],
  },
  { text: "Dépannage", items: [{ text: "Dépannage", link: "/guide/troubleshooting" }] },
];

const frenchReference = [
  { text: "L'écran", link: "/reference/interface" },
  { text: "Menus", link: "/reference/menus" },
  { text: "Panneaux et boutons", link: "/reference/panels" },
  { text: "Vues centrales", link: "/reference/views" },
  { text: "Lire les couleurs et les repères", link: "/reference/colours" },
  { text: "Raccourcis clavier et souris", link: "/reference/shortcuts" },
];

const englishGuide = [
  {
    text: "Getting started",
    items: [
      { text: "The fundamentals", link: "/en/guide/fundamentals" },
      { text: "Tutorial: modelling a cylinder", link: "/en/guide/tutorial" },
    ],
  },
  {
    text: "Preparing 3D models",
    items: [{ text: "Preparing your CAD files", link: "/en/guide/preparing-models" }],
  },
  {
    text: "Building a Pantin",
    items: [
      { text: "The model of a Pantin", link: "/en/guide/model" },
      { text: "Group, ungroup, move a body", link: "/en/guide/groups" },
      { text: "Drives, actuators and sensors", link: "/en/guide/action-chain" },
      { text: "Products and conveying", link: "/en/guide/conveying" },
      { text: "Tags, faults and the I/O list", link: "/en/guide/tags" },
    ],
  },
  {
    text: "Connecting a PLC",
    items: [{ text: "Connecting a PLC", link: "/en/guide/connect-a-plc" }],
  },
  {
    text: "Troubleshooting",
    items: [{ text: "Troubleshooting", link: "/en/guide/troubleshooting" }],
  },
];

const englishReference = [
  { text: "The screen", link: "/en/reference/interface" },
  { text: "Menus", link: "/en/reference/menus" },
  { text: "Panels and buttons", link: "/en/reference/panels" },
  { text: "Central views", link: "/en/reference/views" },
  { text: "Reading colours and cues", link: "/en/reference/colours" },
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
          ...frenchGuide,
          { text: "Référence de l'interface", items: frenchReference },
          {
            text: "Pour les contributeurs",
            items: [{ text: "Pour les contributeurs", link: "/contributing" }],
          },
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
          ...englishGuide,
          { text: "Interface reference", items: englishReference },
          {
            text: "For contributors",
            items: [{ text: "For contributors", link: "/en/contributing" }],
          },
        ],
      },
    },
  },
});
