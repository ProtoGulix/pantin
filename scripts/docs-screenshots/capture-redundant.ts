import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { FORCED, goToWelcome, openExample, treePanel } from "./pantin-page.ts";
import type { Session } from "./session.ts";
import { saveShot } from "./session.ts";

// The example holds no redundant fixed joint any more, so the cleanup preview is shown on a
// temporary state, built through the API and thrown away with "discard" right after.
const PANTIN_URL_PATH = "/api/pantins/plc-cylinder";
const SPARE_BODY_FILE = "examples/plc-cylinder/meshes/id1s0400125e-0-2.glb";
const SPARE_BODY_ID = "support";
const ASSEMBLY_KEY = "verin1";
const TIP_BODY_ID = "id1s0400125e-0-2";
const ROD_BODY_ID = "id1s040cf-16040-3";
const CYLINDER_BODY_ID = "id1s0400125e-0-1";
const MOVED_BODY_ID = "support-mobile";
const KEPT_BODY_ID = "support-bague";
const FIXED_AXIS = [0, 0, 1];

async function request(
  session: Session,
  method: string,
  path: string,
  headers: Record<string, string>,
  body: string | Uint8Array<ArrayBuffer> | null,
): Promise<void> {
  const response = await fetch(`${session.baseUrl}${PANTIN_URL_PATH}${path}`, {
    method,
    headers,
    body,
  });
  if (!response.ok) {
    throw new Error(`${method} ${path} answered ${response.status}: ${await response.text()}`);
  }
}

async function sendJson(
  session: Session,
  method: string,
  path: string,
  body?: object,
): Promise<void> {
  if (body === undefined) {
    await request(session, method, path, {}, null);
    return;
  }
  await request(
    session,
    method,
    path,
    { "content-type": "application/json" },
    JSON.stringify(body),
  );
}

async function sendBytes(
  session: Session,
  path: string,
  bytes: Uint8Array<ArrayBuffer>,
): Promise<void> {
  await request(session, "POST", path, { "content-type": "application/octet-stream" }, bytes);
}

function bodyEndpoint(id: string) {
  return { kind: "body", id };
}

function joint(type: string, name: string, parentBodyId: string, childBodyId: string) {
  return {
    type,
    name,
    parent: bodyEndpoint(parentBodyId),
    child: bodyEndpoint(childBodyId),
    origin: [0, 0, 0],
    axis: FIXED_AXIS,
  };
}

async function addSpareBody(
  session: Session,
  bytes: Uint8Array<ArrayBuffer>,
  id: string,
): Promise<void> {
  await sendBytes(session, `/bodies?fileName=${id}.glb`, bytes);
  await sendJson(session, "PUT", `/bodies/${id}/assembly`, { assembly: ASSEMBLY_KEY });
  // Each import creates a root assembly of its own, left empty by the move.
  await sendJson(session, "DELETE", `/assemblies/${id}`);
}

/**
 * Three spare bodies in the assembly of the cylinder body. "fixation" is redundant, since its
 * parent follows the group. "coulisse" moves its child inside the assembly, so "bague" under
 * it is kept: its parent moves with "coulisse". "bague-tige" is redundant too.
 */
async function addLegacyJoints(session: Session, repositoryRoot: string): Promise<void> {
  const bytes = new Uint8Array(await readFile(join(repositoryRoot, SPARE_BODY_FILE)));
  for (const id of [SPARE_BODY_ID, MOVED_BODY_ID, KEPT_BODY_ID]) {
    await addSpareBody(session, bytes, id);
  }
  await sendJson(
    session,
    "POST",
    "/joints",
    joint("fixed", "fixation", CYLINDER_BODY_ID, SPARE_BODY_ID),
  );
  await sendJson(session, "POST", "/joints", {
    ...joint("prismatic", "coulisse", CYLINDER_BODY_ID, MOVED_BODY_ID),
    limits: [0, 0.05],
  });
  await sendJson(session, "POST", "/joints", joint("fixed", "bague", MOVED_BODY_ID, KEPT_BODY_ID));
  await sendJson(
    session,
    "POST",
    "/joints",
    joint("fixed", "bague-tige", TIP_BODY_ID, ROD_BODY_ID),
  );
}

export async function captureRedundantJointsPrompt(
  session: Session,
  repositoryRoot: string,
): Promise<void> {
  const { page, label } = session;
  await addLegacyJoints(session, repositoryRoot);
  // The tree is read when the Pantin opens: open it again to show the new rows.
  await goToWelcome(session);
  await openExample(session);
  // The viewer reads the preview from the core when the entry is chosen.
  await page.getByRole("menuitem", { name: label("menubar.edit"), exact: true }).click(FORCED);
  await page
    .getByRole("menuitem", { name: label("menubar.edit.deleteRedundantJoints") })
    .click(FORCED);
  const cancel = page.locator("button.button", {
    hasText: label("prompt.redundantJoints.cancel"),
  });
  await cancel.waitFor();
  await saveShot(session, "redundant-joints-prompt", treePanel(page));
  await cancel.click(FORCED);
  await sendJson(session, "POST", "/discard");
  await goToWelcome(session);
  await openExample(session);
}
