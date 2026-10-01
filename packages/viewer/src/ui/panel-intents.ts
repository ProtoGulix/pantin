import type { CentralLayout } from "../central-layout.ts";
import type { DiagramElementKind, DiagramHint } from "../controller/diagram-edit-actions.ts";
import type { DeviceRef } from "../device-selection.ts";
import type { Endpoint } from "../diagram/diagram-wiring.ts";
import type { MenuCommand } from "../menu/menu-model.ts";
import type { PromptAction } from "../panel/prompt-model.ts";
import type { EditTarget } from "../properties/property-rows.ts";
import type { WelcomeTab } from "../viewer-state.ts";

// What the user asks for from the menu bar and the left panel. Components
// only raise intents; the controller decides what to call and how the state
// changes. Values from form fields arrive as raw strings, validated there.
export interface PanelIntents {
  runMenuCommand(command: MenuCommand): void;

  // The welcome dialog (ADR 0027), shown while no Pantin is open.
  selectListPantin(pantinId: string): void;
  openPantin(pantinId: string): void;
  toggleCreatePantin(): void;
  createPantin(name: string): void;
  // Creates a Pantin named after the file, then starts importing it.
  createPantinFromFile(file: File): void;
  hideWelcome(): void;
  selectWelcomeTab(tab: WelcomeTab): void;
  setWelcomeFilter(text: string): void;

  // Edit view.
  requestClose(): void;
  savePantin(): void;
  frameAll(): void;
  frameSelection(): void;
  frameNode(nodeId: string): void;
  selectNode(nodeId: string): void;
  // Selects a drive, an actuator or a sensor, shown in the inspector (ADR 0030).
  selectDevice(device: DeviceRef): void;
  // Selects a node that may sit in a folded branch, unfolding its ancestors.
  revealNode(nodeId: string): void;
  setExpanded(nodeId: string, expanded: boolean): void;
  activateNode(nodeId: string): void;
  startRename(nodeId: string): void;
  commitRename(nodeId: string, name: string): void;
  cancelRename(): void;
  // A committed edit of a grid (rename, joint field, device field...).
  commitPropertyEdit(target: EditTarget, value: string): void;
  requestDelete(nodeId: string): void;
  openContextMenu(nodeId: string, x: number, y: number): void;
  closeContextMenu(): void;
  resolvePrompt(action: PromptAction): void;

  // targetPantinId: the Pantin chosen from its context menu, or null for the open one.
  chooseImportFile(file: File, targetPantinId: string | null): void;
  changeImportUnit(unit: string): void;
  changeImportUpAxis(upAxis: string): void;
  confirmImport(): void;
  cancelImport(): void;

  // The inspector on the right (ADR 0022, 0030): the device forms, faults and commands.
  toggleInspector(): void;
  openDriveForm(driveId: string | null): void;
  cancelDriveForm(): void;
  editDriveName(name: string): void;
  editDriveParameter(field: string, text: string): void;
  changeDriveType(type: string): void;
  changeDriveAssembly(assembly: string): void;
  submitDriveForm(): void;
  deleteDrive(driveId: string): void;
  setDriveUnresponsive(driveId: string, on: boolean): void;
  setJointJammed(jointId: string, on: boolean): void;
  toggleBitTag(tagName: string): void;
  // Typed in mm or degrees (per second).
  writeFloatTag(tagName: string, text: string): void;

  // The actuators of the same panel (ADR 0028): the feed is a drive and its
  // output port for each input port of the type.
  openActuatorForm(actuatorId: string | null): void;
  // From a joint's context menu: its actuator, or a new one moving it.
  openActuatorFormForJoint(nodeId: string): void;
  cancelActuatorForm(): void;
  editActuatorName(name: string): void;
  editActuatorParameter(field: string, text: string): void;
  changeActuatorType(type: string): void;
  changeActuatorAssembly(assembly: string): void;
  // An empty drive id removes the feed.
  changeActuatorDrive(driveId: string): void;
  changeActuatorPort(inputPort: string, outputPort: string): void;
  toggleActuatorJoint(jointId: string, moved: boolean): void;
  submitActuatorForm(): void;
  deleteActuator(actuatorId: string): void;

  // The sensors of the same panel (ADR 0023); parameter inputs by key
  // ("range.lower", "pulsesPerUnit"), a flag as "true" or "false".
  openSensorForm(sensorId: string | null): void;
  // From a joint's context menu: a new sensor watching it, or its two end switches.
  openSensorFormForJoint(nodeId: string): void;
  addEndSwitches(nodeId: string): void;
  cancelSensorForm(): void;
  editSensorName(name: string): void;
  editSensorParameter(key: string, text: string): void;
  changeSensorType(type: string): void;
  changeSensorJoint(jointId: string): void;
  changeSensorAssembly(assembly: string): void;
  submitSensorForm(): void;
  deleteSensor(sensorId: string): void;

  // A new empty assembly in the Pantin of this tree node (ADR 0019).
  createAssembly(nodeId: string): void;
  // A body dragged onto an assembly, or onto a body of it, in the tree.
  dropBody(draggedNodeId: string, targetNodeId: string): void;
  // 3D display of the assembly of this tree node; never saved.
  toggleAssemblyHidden(nodeId: string): void;
  toggleAssemblyIsolated(nodeId: string): void;

  // Joints: the form (creation or type change), and the sliders (position in SI).
  openJointForm(): void;
  // The form prefilled with the joint of this tree node (ADR 0018).
  openJointEditForm(nodeId: string): void;
  editJointField(fieldId: string, value: string): void;
  changeJointType(type: string): void;
  // "x", "y", "z" or "custom".
  chooseJointAxis(direction: string): void;
  reverseJointAxis(): void;
  submitJointForm(): void;
  cancelJointForm(): void;
  moveJoint(pantinId: string, jointId: string, position: number): void;

  // The chain diagram (ADR 0029): the central layout, a band folded,
  // a node clicked (an id like "drive:valve").
  setCentralLayout(layout: CentralLayout): void;
  toggleDiagramBand(bandKey: string): void;
  selectDiagramNode(nodeId: string): void;
  // Wiring (ADR 0029 points 6 and 7): two sockets linked, by drag or from
  // "Relier à…"; the link between two nodes removed; a hint for a key that
  // has nothing to do; the creation form of a column's "+".
  linkDiagramNodes(from: Endpoint, to: Endpoint): void;
  removeDiagramLink(fromNodeId: string, toNodeId: string): void;
  showDiagramHint(hint: DiagramHint): void;
  createDiagramElement(kind: DiagramElementKind): void;

  togglePropertyGroup(groupId: string): void;
  dismissMessage(): void;
  changeLanguage(language: string): void;
}
