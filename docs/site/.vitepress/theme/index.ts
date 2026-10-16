import type { Theme } from "vitepress";
import DefaultTheme from "vitepress/theme-without-fonts";
import "./fonts.css";
import "./pantin.css";

// The default theme without its bundled Inter font, plus the Pantin fonts and
// colours (ADR 0052). VitePress loads the theme from this file's default export.
export default {
  extends: DefaultTheme,
} satisfies Theme;
