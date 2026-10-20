# Troubleshooting

Each entry follows the same plan: what you see, the cause, what to do.
The messages are those that the viewer and the core display today. Core and
bridge messages are in English, and so are the viewer messages in the English
interface.

To read the history, open the **Console** (**View** menu, **Console**, or F8).
It keeps the errors, warnings and infos of the open Pantin, with the simulation
time. The **Export** button saves the lines shown in a text file `console-<Pantin>.txt`, to attach to a report.

## The viewer and the core

| What you see | Cause | What to do |
| --- | --- | --- |
| "Cannot reach the Pantin core. Is it running on 127.0.0.1:4800?" | The core is not started, or listens elsewhere | Run `pnpm serve`. With `--port` or `--listen`, open the viewer at the address shown at startup ("Pantin core (local mode) on http://...") |
| The core stops at startup with an `EADDRINUSE` error | Port 4800 is already taken, by another core for example | Close the other program, or start the core with `--port <another number>` |
| The core refuses to start: `Refusing to listen on "…"` | The `--listen` address is public, wildcard (`0.0.0.0`, `::`), link-local, or a host name | Use `127.0.0.1` (default) or **one** private address of the machine, for example `192.168.1.20`. `--allow` takes an IP or a CIDR |
| `Invalid --allow "…"` | An entry is neither an IP nor a CIDR | Write `192.168.1.10` or `192.168.1.0/24` |
| `--bridge-python "…" is not a file` at startup | The given path does not exist | Create the environment with `pnpm setup:python`, then start again with `pnpm serve` |
| A `Rejected connection from …` line in the core output | A source outside the private ranges, or outside the `--allow` list, was closed on acceptance | Normal if the source is unknown. Otherwise, add its address to `--allow` |
| "The 3D view cannot start: the browser refuses WebGL" | WebGL is disabled | Turn on the hardware acceleration of the browser, then restart it. The panels stay usable |
| "The pose stream stopped: the core refused it or no longer answers" | The position stream is closed, for example because many tabs are open on the same core | Close a tab, then reopen the Pantin |
| "The pose stream sent data that does not match the protocol" | The stream does not follow the expected protocol, for example with a viewer and a core of different versions | Rebuild the viewer and restart the core (`pnpm serve` does both) |
| The **About** window says the viewer and the core are not the same version | The browser kept an old viewer after the core was updated | Reload the page with <kbd>Ctrl</kbd>+<kbd>Shift</kbd>+<kbd>R</kbd> |
| "Item not found; the list may have changed. Reload the page." | An item was deleted in the meantime, for example from another tab | Reload the page |
| "Conflict: the request clashes with the current state of the Pantin…" | Name already used, body still used by a joint, drive still feeding an actuator | Read the full message, then detach or delete the blocking element first |
| "Internal core error; see its log." | An unexpected error in the core | Look at the output of the terminal where the core runs |
| "The simulation is falling behind real time" | The core does not run all the steps due | Without a PLC, it is a slowdown. With a PLC connected, its timers follow the real clock: close other heavy programs |

## Importing 3D files

| What you see | Cause | What to do |
| --- | --- | --- |
| ""file" is not supported. Choose a .glb, .stl, .stp or .step file." | Unrecognised extension | Export from your CAD as GLB, STL or STEP |
| "Unsupported file: use a valid GLB, STL or STEP." | The extension is right, the content is not | Open the file in your CAD, export it again |
| "File too large to import." | The file exceeds the limit of the core | Simplify the model, or export the components separately |
| "STEP import unavailable: start the core with --step-converter-python …" | The core was not started with the converter (startup prints "STEP import disabled (no --step-converter-python)") | Run `pnpm setup:python` then `pnpm serve`. Otherwise, export as GLB or STL |
| "The STEP converter could not be started with "…". Check --step-converter-python." | The path of the converter's Python is wrong, or the environment is broken | Run `pnpm setup:python` again, then the core with the right path |
| "STEP conversion failed: check that the file opens in your CAD, re-export it as STEP (AP214 or AP242) or export it as GLB or STL." | The conversion failed or exceeded its limits (2 minutes, output size) | Export again as STEP AP214 or AP242, simplify the assembly, or export as GLB or STL. The detail is in the core output |
| "The STEP file holds N components, above the limit of 500." | A STEP import is limited to 500 components | Import a sub-assembly, or merge small parts (screws, washers) in your CAD |
| "The component "…" is N MiB once converted, above the limit of 64 MiB." or "The converted meshes exceed 256 MiB in total." | One converted mesh is above 64 MiB, or all of them together are above 256 MiB | Simplify the part in your CAD (fewer faces, no fine threads), import a sub-assembly, or export as GLB or STL |
| "The assembly "…" is placed with a scale or a mirror, which Pantin cannot represent. Export the model without scaled or mirrored instances." | An assembly instance of the STEP is scaled or mirrored | In the CAD, replace the mirrored instance with a real symmetric part, then export again |
| A message in the console: "No face file…" | The body has no face table | The model is displayed and animated normally. Only **Align** cannot pick an axis on this body |
| "Cannot display body "…"" | The mesh of the body does not load | Click **Retry** in the message: the mesh is loaded again (useful after a passing failure). Otherwise import the file again; if the problem persists, check that it opens in your CAD |

During a STEP conversion, the page must stay open: "Converting STEP… Up to 2
minutes".

## Groups and joints

The core refuses without changing anything, and the viewer shows its sentence word for word (in English). The name of the joint or body involved is in it. The cases are explained in [Make a group](/en/guide/groups#make-a-group) and [Ungroup a group](/en/guide/groups#ungroup-a-group).

| What you see | Cause | What to do |
| --- | --- | --- |
| **Group…** or **Ungroup** is greyed out | The selection is not made of bodies and sub-groups of one assembly; or the row is not an assembly filed inside another | Select again, with <kbd>Ctrl</kbd>+click or <kbd>Shift</kbd>+click, rows under the same assembly |
| `Joint "…" hangs body "…" from …, which moves inside "…" and is not part of the group…` | A body of the group hangs from a moving body that is not in the group | Add that body to the group, or delete the joint |
| `Joint "…" links body "…", which is in the group, to body "…", which is not…` | A joint links a body of the group to a body left outside | Add the second body to the group, or delete the joint |
| `Group "…" is moved by joint "…" … its bodies would stop following it` (**Ungroup**) | A slider or a pivot moves the group | Make that joint **Fixed** or delete it, then ungroup |
| A refusal that names a drive, an actuator, a sensor or a belt | The joint to delete is used by that element | Remove the element first |
| `Tag key "…" … is already used by …` | Two tag keys would clash in the destination assembly | Rename one of the keys (the sentence proposes a free one) |
| `Assembly "…" is at the top of the structure tree…` | **Ungroup** on a top-level assembly | Nothing to do: there is nowhere to pour it |
| `Group "…" is not moved by any joint, but assembly "…" is moved by joint "…": its bodies would start following …` (**Ungroup**) | The group does not move, but the assembly it would dissolve into is moved by a joint: its bodies would start following it | Ungroup when that assembly does not move, or first hold the group with a fixed joint to it |
| `Group "…" hangs from … by joint "…", which moves inside "…": its bodies would stop following it` (**Ungroup**) | The group hangs from something that moves inside the destination assembly | First change the parent of that joint |
| `Joint "…" (…) links … and moves. Delete it or make it a group joint first, then move the body.` | When moving a body to another assembly: a moving joint links it to the old assembly | Delete it, or make it a group joint, then move the body |
| `Body "…" would jump when the groups move: … Move it to an assembly that moves with "…".` | The body would jump when the groups move: the old and new assemblies are not moved by the same joint | Move it to an assembly that moves with the old one, or move the whole group |
| Refusal when moving a body to another assembly | The body and its two groups are not moved by the same joint | Move the whole group, or use **Group…** |
| Joint between assemblies refused: the child is a body | Between two assemblies the child must be a group | Pick the **Group: name** entry as **Child body** |
| After **Group…**, the PLC program no longer finds its variables | Tags were renamed ("regenerate the PLC's GVL") | **Export GVL** again, then reload it in the program |
| A body moves with its group although it should stay still, or the **Console** shows “Bodies with no parent joint now follow their group when it moves: …” on opening | A body with no parent joint follows its group; this message lists the bodies concerned in a Pantin saved by an earlier version | Move it into an assembly that does not move (see [Move a body](/en/guide/groups#move-a-body-to-another-assembly)) |

## The PLC bridge

The **PLC bridge** block, at the bottom of the left panel, shows the state and,
in case of failure, a bold title, the message of the bridge and a **Bridge log**
(the last lines of its output). The button becomes **Restart**. The bridge never
restarts on its own.

### The bridge does not start

| What you see | Cause | What to do |
| --- | --- | --- |
| The **Start** button is greyed out, with the line "Start the core with `--bridge-python <path>` (pnpm setup:python)" | The core was started without `--bridge-python` (startup prints "PLC bridge disabled (no --bridge-python)") | `pnpm setup:python`, then `pnpm serve` |
| "PLC bridge unavailable: start the core with --bridge-python…" | Same cause, when pressing **Start** | Same |
| An error message when clicking **Start**, with the first problems of the mapping | The mapping is missing or invalid (the core refuses with a conflict error) | Open **I/O config**, fix the **Problems**, then try again |
| **Start** greyed out and "A bridge started outside Pantin is connected." | A bridge started by hand already holds the connection of this Pantin | Stop that bridge (Ctrl-C in its terminal) |
| "This Pantin's bridge is already running or starting." | A bridge of this Pantin is already running | Use **Stop** then **Start** |
| "Module m1 uses 127.0.0.1:4800, where the core itself listens. Change the module's port in io.json." | The port of the module is the one of the core | Change the **Port** of the module in the I/O view |
| "Module m1 uses … already held by the bridge of Pantin …" | Two Pantins have the same port on the same address | Change the **Port** of one of the modules |
| "The core already supervises 4 bridges. Stop one first." | Four bridges are already running | Stop one |
| ""…" is not an address of this machine. Choose one of: …" | The **Listen address** is not an address of the machine | Choose an address from the list |
| "A private-network listen address needs at least one allowed IP or CIDR." | **Private network** with no entry in **Allowed PLCs (IPs or CIDRs, comma separated)** | Enter the IP or CIDR of the PLC |
| "Allow entry "…" is outside the loopback and private ranges, so no source could match it." | An entry of the list is a public address | Use only private or loopback addresses |

### The bridge stops with a failure

The title comes from the kind of failure. The detailed text is in the message and
in the log.

| Title shown | Kind | Cause | What to do |
| --- | --- | --- | --- |
| **The bridge refuses its configuration** | `configuration` | An address refused by the security rules, or a port **already taken**: "Module m1 cannot listen on …: the port is taken, or this user may not bind it. Change the module's port in io.json." | Change the **Port** of the module (1024 or more), or close the program that uses it |
| **The bridge cannot reach the core** | `core_unavailable` | "Cannot reach the core at … Is it running?" | Check that the core is running. Restart the bridge |
| **The I/O list is not valid** | `mapping_not_valid` | "The io mapping is invalid: …" | Fix the problems in **I/O config**, save, restart |
| **The I/O changed: restart the bridge** | `mapping_changed` | The tag list or the mapping changed while the bridge was running (this is a warning, not a breakdown) | Click **Restart** |
| **The bridge lost its link to the core** | `bus_closed` | The core stopped or the link dropped | Start the core again if needed, then **Restart** |
| **Protocol error between the bridge and the core** | `protocol` | The bridge and the core do not have the same protocol version, or a response is too big | Update the repository and run `pnpm setup:python` again |
| **Unexpected bridge error** | `unexpected` | A bug | Read the **Bridge log** and the core output (`[bridge <Pantin>] …` lines) |
| **The bridge could not be launched** | `spawn_failed` | "Cannot run the bridge's Python (…). Run pnpm setup:python." | `pnpm setup:python` |
| **The bridge did not start in time** | `start_timeout` | "The bridge did not report ready in time. See the bridge log." (15 s) | Read the log: a module could not open, or the machine is overloaded |
| **The bridge stopped abruptly** | `crashed` | The bridge ended without saying why, with the exit code or signal | Read the log |

### The bridge is running, but the PLC sees nothing

| What you see | Cause | What to do |
| --- | --- | --- |
| The module stays on **waiting for the PLC** | No request has arrived | Check the IP address, the **Port** and the **Unit id** of the Modbus master of the PLC |
| The module stays waiting, with the PLC on a virtual machine | The source is refused: in NAT, it can come from the host, and the `100.64.0.0/10` space is refused | Read the bridge log ("Module m1 refused a connection from …"). Switch the virtual machine to bridged networking, or adapt the list of allowed PLCs. See [Connect a PLC](/en/guide/connect-a-plc) |
| The PLC connects then the connection drops; the log says "no request for 5.0 s" | The bridge refuses the PLC's requests (unexpected unit, function or address) then closes the idle connection | Open **Log** in the **PLC bridge** block and look for "refused a request": it gives the unit asked and the one the module expects. The CODESYS master's unit ID must equal the module's **Unit id**. See [Connect a PLC](/en/guide/connect-a-plc#reading-the-bridge-log) |
| The console: "PLC disconnected from module m1 (no answer in time)" | No request during the **Watchdog (ms)** duration | Increase the watchdog, or check that the PLC does query the module. Boolean commands are reset to 0 |
| The console: "PLC disconnected… (connection closed)" | The PLC closed its connection | Same thing: boolean commands are reset to 0 |
| The console: "PLC bridge disconnected… the mapped bit commands are reset to 0" | The bridge stopped or lost the core | Restart the bridge |
| A float value (the position) is absurd | Wrong **Word order** | Switch the module from **Low word first** to **High word first**, or the other way round |
| A Modbus exception 2 or 3 on the PLC side | Address outside the mapped range, or wrong quantity | Compare the addresses of the CODESYS project with the I/O list |
| A Modbus exception 11 | Wrong **Unit id** | Align the unit id of the module and the one of the CODESYS channel |
| The log: "unit 255 ... GATEWAY_NO_RESPONSE (11)" | The **Unit-ID** of the CODESYS Modbus server defaults to 16#FF (255) | Set it to the module's **Unit id** (**Général** tab). See [Connect a PLC](/en/guide/connect-a-plc#configure-the-plc-codesys) |
| On each connection: a refused request "ILLEGAL_ADDRESS (2)", then "PLC disconnected … watchdog", in a loop | A command of the **Init serveur Modbus** tab targets a zone the module does not have (for example function 16 on `m1`); CODESYS stops after that refusal | Empty the **Init serveur Modbus** tab, or make it target a zone of the module. See [Connect a PLC](/en/guide/connect-a-plc#configure-the-plc-codesys) |
| In CODESYS, **Valeur actuelle** shows "Pas actualisé (vérifier l'info-bulle)" | The lines are not linked to variables, or unused variables are not refreshed | Link each line to a variable (**ModbusTCPServer Mappage E/S** tab) and set **Toujours actualiser les variables** to "Activé 2 (toujours dans la tâche du cycle de bus)". Offline only |

## Forced tags

| What you see | Cause | What to do |
| --- | --- | --- |
| A **forced** badge on a tag, and the console: "PLC write ignored on forced tag …: forced to …, the PLC wrote …" | You wrote this tag from the viewer: the write forces the tag, and the PLC can no longer change it | **Release** the tag, or **Release all** (simulation bar, or **Edit**, **Release all forced tags**) |
| "N forced tag(s): the PLC cannot write them" in the **PLC bridge** block | Same | **Release all** button of the block |
| A command stays stuck at a value while the PLC writes something else | The tag is forced | Release it. The core then applies the last value written by the PLC |

## I/O list

| What you see | Cause | What to do |
| --- | --- | --- |
| "This Pantin has no I/O list (io.json) yet." | No `io.json` | **Create the mapping** |
| "io.json is unreadable: nothing can be edited here." | Broken file | Fix the file, or delete it |
| "The I/O list could not be read." | Read error | **Retry** |
| "The mapping shown may be out of date: the last refresh failed." | The last re-read failed | **Retry** |
| **Export GVL** greyed out | Mapping missing, not read yet, or invalid: the tooltip says which | Create the mapping, or fix the **Problems** |
| `pantin gvl`: "The mapping is invalid, so no GVL is generated: …" | Same cause, on the command line | Fix `io.json` from the viewer, run the command again |
| `pantin gvl`: "No io.json in this folder: run "pantin io init" first." | No `io.json` | `pnpm pantin io init <folder>` or **Create the mapping** |
| PLC tags that do not appear in the GVL | **Unmapped** tags are not in it | Map them in **Unmapped tags**. `pnpm pantin gvl` writes "note: N tag(s) are not mapped and not in the GVL" |

In the I/O view, the **Go to the cell concerned** icon (under **Problems**) takes
you to each problem.

## Simulation

| What you see | Cause | What to do |
| --- | --- | --- |
| Nothing moves | The simulation is paused | **Resume** in the simulation bar. The console says "Simulation paused" |
| "The simulation of this Pantin could not be resumed on opening" | The automatic resume failed | **Resume** |
| "Conflicting commands: both coils are on; the spool stays where it is." | Both coils of a 5/3 valve are at 1 | Command only one coil at a time |
| "Conflicting commands: forward and reverse are both on; the contactor already closed stays closed." | Forward and reverse of a reversing contactor are both at 1 | Command only one direction at a time |
| An active **Fault** (**Not responding**, **Jammed**) | A fault was injected | Turn it off in the **Faults** group of the inspector |
| "Error in the simulation step: the step is skipped." | An error in a calculation step | Look at the core output and report it with your Pantin |

## Still stuck?

Open the **Console** and, for the bridge, the **Bridge log**: they give the cause in most cases. To report a problem, attach your Pantin. The design choices are explained in the [For contributors](/en/contributing) page.
