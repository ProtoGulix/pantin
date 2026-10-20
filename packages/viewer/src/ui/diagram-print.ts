import { element } from "./dom.ts";

// Printing the diagram through the browser (ADR 0029): a copy of the column
// heads and of the drawing is put in a sheet that only the print stylesheet
// shows (diagram-toolbar.css), the page takes the light theme so that it prints dark on
// white whatever the screen uses, and both go back once the browser has printed
// or the user cancelled. The copy is what the filter shows, without the
// selection, the dimming of a chain in focus, the matches or the remove button
// of a link. The browser's own dialog offers "Save as PDF"; no library is involved.

export interface PrintPorts {
  // Puts the sheet and the light theme in place; returns what undoes it.
  prepare(): () => void;
  print(): void;
  onceAfterPrint(listener: () => void): void;
}

/**
 * A print command that ignores a second request until the first one is over:
 * the page is in its print state until the browser says it is done (which may
 * be later than `print` returns), and a second preparation would save that state
 * as the one to restore.
 */
export function createPrinter(): (ports: PrintPorts) => void {
  let printing = false;
  return (ports) => {
    if (printing) {
      return;
    }
    printing = true;
    const restore = ports.prepare();
    ports.onceAfterPrint(() => {
      restore();
      printing = false;
    });
    ports.print();
  };
}

// What the screen adds to the drawing for the selection and the filter.
const SCREEN_STATE_CLASSES = ["diagram--focus", "is-selected", "is-related", "is-match"];
const EDGE_REMOVE_BUTTON = ".diagram-edge-remove";

interface PrintableNode {
  classList: { remove(token: string): void };
  querySelectorAll(selector: string): Iterable<PrintableNode>;
  remove(): void;
}

/** Takes the selection, the focus dimming, the matches and the link remove button off a copy. */
export function stripScreenState(copy: PrintableNode): void {
  for (const name of SCREEN_STATE_CLASSES) {
    copy.classList.remove(name);
    for (const marked of copy.querySelectorAll(`.${name}`)) {
      marked.classList.remove(name);
    }
  }
  for (const button of copy.querySelectorAll(EDGE_REMOVE_BUTTON)) {
    button.remove();
  }
}

/** Puts the theme back, deleting the attribute when the page had none. */
export function restoreTheme(
  root: { dataset: { theme?: string | undefined } },
  previousTheme: string | undefined,
): void {
  if (previousTheme === undefined) {
    delete root.dataset.theme;
  } else {
    root.dataset.theme = previousTheme;
  }
}

function printCopy(source: Element): Node {
  const copy = source.cloneNode(true);
  if (copy instanceof Element) {
    stripScreenState(copy);
  }
  return copy;
}

/** The browser's printing, for the column heads and the drawing now on screen. */
export function browserPrintPorts(heads: HTMLElement, drawing: SVGElement): PrintPorts {
  return {
    prepare: () => {
      const sheet = element("div", { className: "print-sheet" }, [
        printCopy(heads),
        printCopy(drawing),
      ]);
      const root = document.documentElement;
      const previousTheme = root.dataset.theme;
      document.body.append(sheet);
      root.dataset.theme = "light";
      return () => {
        sheet.remove();
        restoreTheme(root, previousTheme);
      };
    },
    print: () => window.print(),
    onceAfterPrint: (listener) => window.addEventListener("afterprint", listener, { once: true }),
  };
}
