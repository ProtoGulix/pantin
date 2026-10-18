import { join } from "node:path";
import { assemblyRow, FORCED, inspector, jointRow, treePanel } from "./pantin-page.ts";
import type { Session } from "./session.ts";
import { saveShot } from "./session.ts";

// The form sits at the top of the left panel: the tree below it is cropped to a few rows.
const IMPORT_FORM_CROP_HEIGHT = 360;
const EXAMPLE_MESH = "examples/plc-cylinder/meshes/id1s0400125e-0-2.glb";

export async function captureImportForm(session: Session, repositoryRoot: string): Promise<void> {
  const { page, label } = session;
  await page
    .locator(`input[aria-label="${label("import.fileInputLabel")}"]`)
    .setInputFiles(join(repositoryRoot, EXAMPLE_MESH));
  const form = page.getByRole("group", {
    name: label("import.target", { pantinName: "plc-cylinder" }),
  });
  await form.waitFor();
  const panel = await treePanel(page).boundingBox();
  if (panel === null) {
    throw new Error("The tree panel is not visible.");
  }
  await saveShot(session, "import-form", { ...panel, y: 0, height: IMPORT_FORM_CROP_HEIGHT });
  await form.getByRole("button", { name: label("import.cancel") }).click(FORCED);
}

export async function captureTreeContextMenu(session: Session): Promise<void> {
  const { page } = session;
  await assemblyRow(page).click({ ...FORCED, button: "right" });
  const menu = page.getByRole("menu").filter({ visible: true });
  await menu.waitFor();
  const panel = await treePanel(page).boundingBox();
  const menuBox = await menu.boundingBox();
  if (panel === null || menuBox === null) {
    throw new Error("The tree or its context menu is not visible.");
  }
  const bottom = Math.min(page.viewportSize()?.height ?? 900, menuBox.y + menuBox.height + 20);
  await saveShot(session, "tree-context-menu", {
    x: 0,
    y: 0,
    width: panel.width + 60,
    height: bottom,
  });
  await page.keyboard.press("Escape");
}

/** Two bodies of the example's assembly. */
const FIRST_BODY_ROW = /^ID1S0400125E_0_1\b/;
const SECOND_BODY_ROW = /^ID1S0400125E_0_2\b/;

/**
 * Selects two bodies of the example and opens the group name line, then cancels: the example is
 * never actually grouped, so the pictures that follow keep showing the unchanged machine.
 */
export async function captureGroupPrompt(session: Session): Promise<void> {
  const { page, label } = session;
  await page.getByRole("treeitem", { name: FIRST_BODY_ROW }).click(FORCED);
  await page
    .getByRole("treeitem", { name: SECOND_BODY_ROW })
    .click({ ...FORCED, modifiers: ["Control"] });
  await page
    .getByRole("treeitem", { name: SECOND_BODY_ROW })
    .click({ ...FORCED, button: "right", modifiers: ["Control"] });
  await page.getByRole("menuitem", { name: label("menu.group") }).click(FORCED);
  const nameField = page.getByLabel(label("prompt.group.nameLabel"));
  await nameField.waitFor();
  await saveShot(session, "group-prompt", treePanel(page));
  // The toolbar also has an icon button with the same name, so the text button is told apart by its class.
  await page.locator("button.button", { hasText: label("prompt.group.cancel") }).click(FORCED);
  await nameField.waitFor({ state: "detached" });
}

export async function captureJointInspector(session: Session): Promise<void> {
  await jointRow(session.page).click(FORCED);
  await session.page.locator("input.joint-slider__input").waitFor();
  await saveShot(session, "inspector-joint", inspector(session));
}

async function captureCreationForm(
  session: Session,
  buttonKey: "drives.new" | "actuators.new",
  formKey: "drives.form.title" | "actuators.form.title",
  shotName: string,
): Promise<void> {
  const { page, label } = session;
  const tools = page.getByRole("toolbar", { name: label("inspector.toolsLabel") });
  await tools.getByRole("button", { name: label(buttonKey) }).click(FORCED);
  const form = page.getByRole("group", { name: label(formKey) });
  await form.waitFor();
  await saveShot(session, shotName, form);
  await form.getByRole("button", { name: label("create.cancel") }).click(FORCED);
}

export async function captureNewDriveForm(session: Session): Promise<void> {
  await captureCreationForm(session, "drives.new", "drives.form.title", "form-new-drive");
}

export async function captureNewActuatorForm(session: Session): Promise<void> {
  await captureCreationForm(session, "actuators.new", "actuators.form.title", "form-new-actuator");
}
