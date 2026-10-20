# Fundamentals

This page explains what Pantin is for, how it is built and how to start it. You do not need any programming knowledge.

## What Pantin is for

Pantin simulates an industrial machine (its movements and a little physics). A real PLC program drives it in a closed loop.

The goal: validate a PLC program on a special-purpose machine **before** commissioning.

The closed loop works like this:

1. the PLC writes its commands (a valve coil, a contactor);
2. Pantin moves the simulated machine accordingly;
3. the simulated sensors (limit switch, photocell) change state;
4. the PLC reads this feedback and decides what to do next.

You import your 3D models, animate them, then link the machine's tags to your PLC. A **signal** ("tag" in the viewer and in the rest of this guide) is a named value of the machine: a command the PLC writes, or a feedback it reads.

## The three processes

Pantin is made of three processes. They talk to each other over the local network of your machine.

```
  Browser                   Core (Node)                 Bridge (Python)
 ┌───────────┐  HTTP, SSE  ┌──────────────────┐  tags  ┌─────────────┐   Modbus TCP   ┌──────────┐
 │  Viewer   │ <---------> │ simulation       │ <----> │  Modbus     │ <------------> │ CODESYS  │
 │ (displays,│             │ fixed step 1/120s│ WebSock│  slave      │                │ PLC      │
 │  edits)   │             │ tags, files      │        │             │                │          │
 └───────────┘             └──────────────────┘        └─────────────┘                └──────────┘
```

- **The core** contains the whole simulation: joints, drives, sensors, products, physics, tags. It reads and writes the files of the Pantin. It runs without a window open.
- **The viewer** is the web page you open in the browser. It displays the state sent by the core and serves as the editing interface. It computes nothing of the simulation.
- **The PLC bridge** is a small Python process, started by the core on demand (the **Start** button of the **PLC bridge** card). It presents itself to the PLC as Modbus TCP input/output modules.

### The simulation does not depend on the browser

Closing the tab, leaving it in the background or having a slow computer has no effect on the simulation. The browser only watches. The PLC thus always faces a stable machine.

## A fixed time step

The core advances in fixed steps of **1/120 s** (about 8.3 ms), whatever the frame rate. A command written to a tag takes effect at the next step.

The same commands therefore give the same results. The display adapts to the speed of your screen.

The simulation bar of the viewer lets you **Pause**, **Resume**, or advance by **1 step** or **10 steps**.

::: tip
When the simulation is paused and a PLC bridge is connected, the PLC sees a frozen machine. The **Console** tells you so.
:::

## Units and axes

| Subject | In the core and the files | In the interface |
| --- | --- | --- |
| Lengths | metres | millimetres |
| Angles | radians | degrees |
| Time | seconds | seconds |
| Masses | kilograms | kilograms |

Tag values are in International System units (metres, radians), not millimetres.

The **Z axis points up**, as in CAD software. The viewer converts to the frame of its 3D engine: you have nothing to do.

When you import an STL, you give the unit of the file (**mm**, **cm**, **m**, **in**). For a GLB or an STL, you also give the **Up axis** (**Z up (CAD)** or **Y up (glTF standard)**). A STEP has nothing to set.

## A Pantin is a folder

A simulated machine is called a **Pantin**. It is a folder of text files, compatible with git:

| Item | Role |
| --- | --- |
| `pantin.json` | the whole machine: bodies, joints, drives, actuators, sensors, conveying objects |
| `meshes/` | the 3D meshes (`.glb` or `.stl` files) |
| `io.json` | the I/O list: Modbus modules and channels linking tags to PLC variables |

`io.json` only exists once the I/O is configured. You do not edit it by hand: the viewer creates and changes it.

Pantins are stored by default in the `pantin-projects` folder of your home folder (`~/pantin-projects`). The `--pantins-dir` option of the core chooses another folder.

Since everything is text, you can version a Pantin with git, compare two versions or share it. The format is described in the [Pantin document guide](https://github.com/ProtoGulix/pantin/blob/develop/docs/guides/pantin-document.md).

## Local by default

On startup, the core listens **only on the local machine** (`127.0.0.1`). Nobody else on your network can connect to it.

Opening the network is an explicit choice, limited to the private local network:

- the core refuses to start on a public address or on `0.0.0.0`;
- in private network mode, it listens on **a single private address** that you give (`--listen`);
- any connection whose source address is outside the private ranges is closed before anything is read;
- a list of allowed addresses (`--allow`) can only restrict access, never widen it.

For the PLC bridge, the **PLC bridge** card offers the same choice: **Local only (127.0.0.1)** or **Private network**, with a **Listen address** and the list of **Allowed PLCs (IPs or CIDRs, comma separated)**. The procedure is in [Connect a PLC](/en/guide/connect-a-plc).

## Install and start

Prerequisites: Node.js 24 or newer, pnpm, and Python 3 for the bridge and the STEP conversion. The details are in the `README.md` file of the repository.

From the repository folder:

```
pnpm install
pnpm setup:python
pnpm serve
```

- `pnpm install` installs the dependencies.
- `pnpm setup:python` prepares the Python environments of the PLC bridge and the STEP converter.
- `pnpm serve` builds the viewer then starts the core, which also serves the viewer.

The core prints a line like `Pantin core (local mode) on http://127.0.0.1:4800`. Open this address in your browser. The default port is **4800**; the `--port` option chooses another one.

To know which version you run, open **Help**, **About Pantin…**: the window gives the viewer version and the core version. The version of the guide is shown in its header, with a link to the change history.

The **Home** screen offers to create a Pantin (**Empty Pantin** or **From a 3D file**) or to open an existing one.

## What next

- Build a first example step by step: [Tutorial](/en/guide/tutorial).
- Prepare your CAD files before the import: [Preparing your CAD files](/en/guide/preparing-models).
- Understand the elements of a machine: [The model of a Pantin](/en/guide/model), then [Group, ungroup, move a body](/en/guide/groups), [Drives, actuators and sensors](/en/guide/action-chain), [Products and conveying](/en/guide/conveying) and [Tags, faults and the I/O list](/en/guide/tags).
- Link a PLC: [Connect a PLC](/en/guide/connect-a-plc).
- Something does not work: [Troubleshooting](/en/guide/troubleshooting).

::: warning Known limits
A real CODESYS Control Win V3 x64 drove the `plc-cylinder` example in a closed loop ([setup](/en/guide/connect-a-plc#configure-the-plc-codesys)). Other CODESYS versions and WAGO targets have not been tried.
:::
