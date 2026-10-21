// Regenerates the screenshots of the user guide (ADR 0051), in French and English:
//   pnpm --filter @pantin/viewer build && pnpm docs:screenshots
// It starts a throwaway core per language on a free localhost port with a copy of examples/plc-cylinder, drives
// the viewer in headless Chromium, and writes WebP files to docs/site/public/screenshots/<lang>/.
// Not part of `pnpm check`: it needs a local Chromium (PANTIN_CHROMIUM, else the Playwright cache).
import { cp, mkdtemp, rm, stat } from "node:fs/promises";
import { homedir, tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { type Browser, chromium, type Page } from "playwright-core";
import { captureBridgeCard } from "./docs-screenshots/capture-bridge.ts";
import { captureConsoleVerbose } from "./docs-screenshots/capture-console.ts";
import {
  captureGroupPrompt,
  captureImportForm,
  captureJointInspector,
  captureNewActuatorForm,
  captureNewDriveForm,
  captureTreeContextMenu,
} from "./docs-screenshots/capture-editing.ts";
import { captureIoView } from "./docs-screenshots/capture-io.ts";
import { captureRedundantJointsPrompt } from "./docs-screenshots/capture-redundant.ts";
import {
  captureDiagram,
  captureForcedTag,
  captureHome,
  captureJointView,
  captureOverview,
  captureTransportBar,
  captureViewCube,
} from "./docs-screenshots/capture-views.ts";
import { startCore } from "./docs-screenshots/core-process.ts";
import { type Language, loadLabels } from "./docs-screenshots/labels.ts";
import { goToWelcome, openExample } from "./docs-screenshots/pantin-page.ts";
import { type Session, saveShot } from "./docs-screenshots/session.ts";

const REPOSITORY_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const OUTPUT_ROOT = join(REPOSITORY_ROOT, "docs/site/public/screenshots");
const LANGUAGES: readonly { language: Language; locale: string }[] = [
  { language: "fr", locale: "fr-FR" },
  { language: "en", locale: "en-GB" },
];
const ACTION_TIMEOUT_MS = 60_000;
const CONTEXT_COLOUR_SCHEME = "dark";
// chromium.executablePath() is not used: it points at the full Chromium of the installed
// Playwright version (chromium-1248 here), which this machine's cache does not hold; only the
// headless shell is installed, and its revision must be kept in step with the cache by hand.
const DEFAULT_CHROMIUM = join(
  homedir(),
  ".cache/ms-playwright/chromium_headless_shell-1243/chrome-headless-shell-linux64/chrome-headless-shell",
);

async function requireFile(path: string, advice: string): Promise<void> {
  const exists = await stat(path).then(
    () => true,
    () => false,
  );
  if (!exists) {
    throw new Error(`${path} is missing. ${advice}`);
  }
}

async function launchChromium(args: string[]): Promise<Browser> {
  const executablePath = process.env.PANTIN_CHROMIUM ?? DEFAULT_CHROMIUM;
  await requireFile(executablePath, "Set PANTIN_CHROMIUM to a Chromium or headless shell binary.");
  return chromium.launch({ executablePath, args });
}

async function captureLanguage(
  browser: Browser,
  encoderPage: Page,
  baseUrl: string,
  outputRoot: string,
  entry: (typeof LANGUAGES)[number],
): Promise<string[]> {
  const context = await browser.newContext({
    viewport: { width: 1600, height: 900 },
    deviceScaleFactor: 1,
    locale: entry.locale,
    // The viewer follows the browser's scheme by default (ADR 0053): pinned, the pictures do not
    // depend on the machine that takes them.
    colorScheme: CONTEXT_COLOUR_SCHEME,
  });
  // A missing element should fail the run quickly, with a readable message.
  context.setDefaultTimeout(ACTION_TIMEOUT_MS);
  try {
    const session: Session = {
      page: await context.newPage(),
      encoderPage,
      baseUrl,
      language: entry.language,
      label: await loadLabels(REPOSITORY_ROOT, entry.language),
      outputDirectory: join(outputRoot, entry.language),
      savedNames: [],
    };
    await goToWelcome(session);
    await saveShot(session, "welcome", session.page.getByRole("dialog"));
    await openExample(session);
    await captureOverview(session);
    await captureHome(session, CONTEXT_COLOUR_SCHEME);
    await captureViewCube(session);
    // Software WebGL renders the 3D view at about one frame per second, and every screenshot and
    // click waits for frames. The 3D view stops rendering when hidden, so showing the diagram
    // alone makes everything after the joint view fast.
    await captureJointView(session);
    await captureTransportBar(session, "transport-bar");
    await captureImportForm(session, REPOSITORY_ROOT);
    await captureTreeContextMenu(session);
    await captureGroupPrompt(session);
    await captureRedundantJointsPrompt(session, REPOSITORY_ROOT);
    await captureJointInspector(session);
    await captureNewDriveForm(session);
    await captureNewActuatorForm(session);
    await captureDiagram(session);
    await captureIoView(session, REPOSITORY_ROOT);
    await captureBridgeCard(session);
    await captureForcedTag(session);
    await captureConsoleVerbose(session);
    return session.savedNames;
  } finally {
    await context.close();
  }
}

// A core per language, on a fresh copy of the example. The core keeps an opened Pantin and its
// console between two page loads: the warnings the French run raises (the bridge's refused
// request, its stop) would otherwise count in the status bar of the English pictures.
async function captureAllLanguages(
  browser: Browser,
  encoderPage: Page,
  outputRoot: string,
  pantinsDirectory: string,
): Promise<void> {
  for (const entry of LANGUAGES) {
    // The bridge log outlives a run: start each language with an empty one, so the journal
    // picture shows that run only.
    await rm(join(pantinsDirectory, ".logs"), { recursive: true, force: true });
    const exampleCopy = join(pantinsDirectory, "plc-cylinder");
    await rm(exampleCopy, { recursive: true, force: true });
    await cp(join(REPOSITORY_ROOT, "examples/plc-cylinder"), exampleCopy, { recursive: true });
    const core = await startCore({ repositoryRoot: REPOSITORY_ROOT, pantinsDirectory });
    try {
      const names = await captureLanguage(browser, encoderPage, core.baseUrl, outputRoot, entry);
      process.stdout.write(
        `${entry.language}: ${names.length} screenshots (${names.join(", ")})\n`,
      );
    } finally {
      await core.stop();
    }
  }
}

async function replaceDirectory(source: string, destination: string): Promise<void> {
  await rm(destination, { recursive: true, force: true });
  // Not rename(): the temporary folder may be on another filesystem.
  await cp(source, destination, { recursive: true });
}

/** Turns Ctrl+C into an error, so the finally block still stops the core and removes the temp dir. */
function interruption(): Promise<never> {
  return new Promise((_resolve, reject) => {
    for (const signal of ["SIGINT", "SIGTERM"] as const) {
      process.once(signal, () => reject(new Error(`Interrupted by ${signal}.`)));
    }
  });
}

async function main(): Promise<void> {
  await requireFile(
    join(REPOSITORY_ROOT, "packages/viewer/dist/index.html"),
    "Build the viewer first: pnpm --filter @pantin/viewer build.",
  );
  const pantinsDirectory = await mkdtemp(join(tmpdir(), "pantin-screenshots-"));
  let browser: Browser | undefined;
  let encoderBrowser: Browser | undefined;
  try {
    // WebGL has no GPU in headless mode: software rendering through SwiftShader.
    browser = await launchChromium(["--use-angle=swiftshader", "--enable-unsafe-swiftshader"]);
    // The WebP encoder is a separate browser: next to the 3D view it would wait for the busy
    // software renderer, or pause the view's rendering if it were a second tab.
    encoderBrowser = await launchChromium(["--disable-gpu"]);
    const encoderPage = await encoderBrowser.newPage();
    // Pictures go to a temporary folder first: a failed run leaves the published ones untouched.
    const freshOutput = join(pantinsDirectory, "screenshots");
    await Promise.race([
      captureAllLanguages(browser, encoderPage, freshOutput, pantinsDirectory),
      interruption(),
    ]);
    await replaceDirectory(freshOutput, OUTPUT_ROOT);
  } finally {
    await browser?.close();
    await encoderBrowser?.close();
    await rm(pantinsDirectory, { recursive: true, force: true });
  }
}

await main();
