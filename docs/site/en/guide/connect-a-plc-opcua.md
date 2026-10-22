# Connect a PLC over OPC UA

With **OPC UA**, the roles are reversed compared with [Modbus TCP](/en/guide/connect-a-plc): **the PLC is the server** and **Pantin is the client**. Pantin connects to the PLC's OPC UA server (CODESYS provides one), **reads the commands** the program writes into its variables and **writes the feedbacks** (limit switches, positions) into other variables. The PLC program has no I/O module to declare and no channel to set up: it only needs global variables exposed by the server.

::: danger Not tried on a real PLC yet
The OPC UA path is tested **against an OPC UA server written for Pantin's own tests**, in an automatic closed loop (the core, the bridge and the test server, with the certificates trusted on both sides). It has **not yet** been tried against a real CODESYS PLC: that is the next step, a manual demonstration. Everything about CODESYS on this page is therefore written from its public documentation and marked **NOT VERIFIED** where it is. CODESYS menu names are not given as facts.
:::

This page assumes you know the I/O list ([Tags, faults and the I/O list](/en/guide/tags)) and the GVL ([Connect a PLC](/en/guide/connect-a-plc#configure-the-plc-codesys)). Names in **bold** are the exact English labels of the viewer.

## Modbus or OPC UA?

| | Modbus TCP | OPC UA |
| --- | --- | --- |
| Pantin's role | slave: the PLC queries it | client: Pantin queries the PLC |
| Wiring on the PLC side | device tree: one server per module, channels, a mapping | none: global variables exposed by the OPC UA server |
| Addresses | register numbers to work out | the variable name (the core derives the NodeId) |
| Security | no authentication | signing, encryption, certificates, optional user and password |
| Tried on a real PLC | yes, on 18 October 2026 (CODESYS Control Win V3 x64) | **no** |

Choose Modbus if you want the proven path. Choose OPC UA if your PLC's server is already there, or if you want the protocol's security. Both bridges can run at the same time for one Pantin, each with its own modules.

## How it works

```text
PLC (OPC UA server)  <--OPC UA-->  OPC UA bridge (Node.js)  <--tag bus-->  core  <--REST/SSE-->  viewer
```

- The **OPC UA bridge** is a separate process, started by the core on demand with the `--opcua-bridge` option, which `pnpm serve` provides. It opens **one session per module** to the PLC.
- **Commands**: one subscription per module; the bridge sends each change to the core. A pulse shorter than the sampling interval the server settled on can be lost.
- **Feedbacks**: the bridge writes them on each change, and all of them at once each time a session opens.
- If the connection to the PLC drops, the bridge picks it up again by itself (after 1 s, then more and more spaced out up to 10 s) as long as it runs. If its link to the core closes, or if the I/O change, it stops and you must start it again.

## On the PLC side (CODESYS)

These steps come from the CODESYS documentation and public searches, **not from a test** with Pantin. The menu names below are those of the English interface as the documentation names them; their French translation and the exact version are not verified.

1. **Generate Pantin's GVL** and paste it into the project (see [The GVL](#the-gvl) below). Name the GVL object as the list's header says: **GVL_Pantin** by default.
2. **Expose the variables.** Under the **Application**, add a **Symbol Configuration** object (NOT VERIFIED: menu path), with the option that enables the OPC UA features (the export file carries `SupportOPCUA` in its settings), and tick the GVL variables.
   - A **command** (written by the program, read by Pantin) must be **readable** by the client.
   - A **feedback** (written by Pantin) must be **writable** by the client.
   The rights are set per variable in that object (NOT VERIFIED: exact labels). If a right is missing, the bridge says so (see [Reading the states and the reasons](#reading-the-states-and-the-reasons)).
3. **Enable the OPC UA server** of the runtime. Its default port is 4840 according to the CODESYS documentation (NOT VERIFIED on a CODESYS Control Win V3 x64).
4. **Set the security and the login.** Recent CODESYS versions (SP17 and later, according to their documentation, **NOT VERIFIED** here) require a **device user** by default and accept the anonymous login only if it is explicitly allowed. Two choices:
   - create a device user, then give its name to the module in Pantin (**Authentication**: **User and password**);
   - or allow the anonymous login in the device's communication settings, for a test PLC.
5. If you choose **Sign** or **Sign and encrypt**, the PLC must offer a security policy Pantin can use: **Basic256Sha256**, **Aes128_Sha256_RsaOaep** or **Aes256_Sha256_RsaPss**. The old policies (Basic128Rsa15, Basic256) are not offered. The certificates must be trusted on both sides: see [First connection](#first-connection-trust-on-both-sides).

::: warning Do not write the feedbacks in the program
A feedback is written by Pantin. If your program also writes the same variable, one of the two overwrites the other. Give it a single author.
:::

## In Pantin: create and set up the module

Open the **I/O** view (the **I/O config** button of the bridge card). Next to **Add a module**, the **Transport of the new module** list offers **Modbus TCP slave** and **OPC UA client**: choose **OPC UA client**, then **Add a module**.

![The I/O view with a Modbus module m1 and an OPC UA client module m2: its heading and its settings](/screenshots/en/io-opcua.webp)

The module's heading states its settings in words, for example **OPC UA client · port 4840 · Sign and encrypt · Basic256Sha256 · anonymous** (**no security** when the mode is **None**). The settings of a module:

| Setting | Default | Rule |
| --- | --- | --- |
| **Key** | `m1`, `m2`... | unique |
| **Port** | 4840 | 1 to 65535: the port of the PLC's server |
| **Endpoint path** | empty | empty, or starting with `/` |
| **Security mode** | **Sign and encrypt** | **None**, **Sign** or **Sign and encrypt** |
| **Security policy** | **Basic256Sha256** | **None**, **Basic256Sha256**, **Aes128_Sha256_RsaOaep** or **Aes256_Sha256_RsaPss** |
| **Authentication** | **Anonymous** | **Anonymous** or **User and password** (with a **User name**) |
| **Namespace URI** | empty: to be filled in | the namespace of the PLC's variables |
| **NodeId prefix** | `\|var\|CODESYS Control Win V3 x64.Application.` | start of each variable's NodeId |
| **GVL name** | `GVL_Pantin` | an IEC identifier |
| **Sampling (ms)** | 20 | 0 to 10,000 |
| **Publishing (ms)** | 20 | 10 to 60,000 |
| **Watchdog (ms)** | 1000 | 100 to 3,600,000 |

- **Security mode** and **Security policy** go together: both on **None**, or neither. Otherwise the core reports a security problem and the mapping stays invalid.
- **Namespace URI** is empty on creation: while it is, the mapping is invalid. No CODESYS documentation gives this value (**NOT VERIFIED**). Let the bridge look for it: if the URI does not exist on the server, the log writes an error line that lists the server's namespace table (**NamespaceArray**), and you copy the right one.
- **NodeId prefix**: the default follows a rule found in public discussions, **not verified on a real PLC**. The "device" part of the NodeId may be the runtime's name rather than the project's device name. Check it in the PLC's OPC UA server.
- **Watchdog (ms)** here measures the **server's silence**: the time since the last publish response of the subscription, whether it carried data or not. Beyond it, the bridge closes the session and opens it again.

Each channel of an OPC UA module has these columns: **Signal**, **Unit**, **Variable**, **Node** (the NodeId derived by the core, read only), **Identifier** (**derived** or **explicit**), **Type** (the IEC type), **Comment** and **Actions**. A long NodeId wraps in its cell.

The **Type** is read only in the viewer: `BOOL` for a bit, `REAL` for a float and `DINT` for an integer. The PLC variable must have that type.

The core derives the **Node**: `s=` followed by the **NodeId prefix**, the **GVL name**, a dot and the **Variable**. A variable whose name is already dotted (`GVL_IO.Verin1.FinCourseSortie`) gives `s=` followed by the prefix and that name: it names its own GVL or program. A variable used in two OPC UA modules must have the same **GVL name** in both.

## The GVL

Pantin's GVL is the same as for Modbus (the **Export GVL** button, or `pnpm pantin gvl <Pantin folder>`). For an OPC UA module, its header says which GVL to paste it into: "Paste this list into a GVL named GVL_Pantin (module m2)." It holds no address: the variable name is what counts.

::: warning A test PLC only
An **explicit** identifier can write any writable node of the server. The target must be a PLC under test, never a PLC whose outputs drive a real machine. The GVL header says so.
:::

## Taking the prefix from the symbol export

The symbol import ([Reusing the PLC's variable names](/en/guide/connect-a-plc#reuse-the-plc-s-variable-names)) also proposes a **NodeId prefix** for each OPC UA module, built from the file's device and application.

![The import window with the OPC UA modules block: proposed NodeId prefix](/screenshots/en/opcua-symbols.webp)

At the top of the window, the **OPC UA modules: proposed NodeId prefix (n)** block holds, for each module, the **Proposed NodeId prefix**, the reason (**Built from the device "…" and the application "…" of the file.**) and a warning: **To check: the NodeId may use the runtime name, not the device name. Apply it, then check it in the PLC's OPC UA server.**

The **Apply this prefix to module m2** button is separate from the window's **Apply** button: it writes the module's prefix as an unsaved edit. Check it before accepting it: the prefix is probably wrong if the runtime was renamed. The symbol file is the one [Connect a PLC](/en/guide/connect-a-plc#reuse-the-plc-s-variable-names) describes.

## Starting the bridge

In the left panel, the **PLC bridge · OPC UA client** card only appears when the Pantin has an OPC UA module.

![The PLC bridge · OPC UA client card, stopped, with the PLC address typed](/screenshots/en/opcua-card.webp)

1. Save the Pantin; its mapping must be valid (in particular the **Namespace URI**).
2. In the **PLC address for module m2** field, type the PLC's address. While one is missing: **Enter the PLC address of every OPC UA module before starting.** The address is **never saved** in `io.json`: a shared folder must not aim at another network's PLC. The viewer keeps it in memory for the session.
3. For a module on **User and password**, a **Password of module m2** field appears: type it. **Kept in memory by the core until it stops, never written to disk. Left empty, it keeps the password already sent.** The password is not in `io.json`, in a log, in the console or in the bridge's command line.
4. Click **Start**. The state goes from **Starting…** to **Running** as soon as the bridge is ready, **without waiting for the PLC**: a stopped PLC is not a bridge failure, it is a module's state.

The card recalls the module's login (**Login: anonymous** or **Login: user and password (name)**). The settings are locked while the bridge runs; any I/O edit stops it.

### Allowed addresses

Pantin only connects to **an explicit address, typed per module**:

- the local address `127.0.0.1` (or `::1`): the PLC runs on the same machine;
- or **a private network address** (`10.x.x.x`, `172.16.x.x` to `172.31.x.x`, `192.168.x.x`, `fc00::/7`).

Refused: a host name (even `localhost`), `0.0.0.0`, a public, link-local or multicast address, or `100.64.0.0/10`. The bridge connects only to that address and port, whatever addresses the server announces in its endpoints, and opens no listening port.

Two security cases:

- **None** security toward a PLC on the local network is allowed, with the console warning: "Module m2: the OPC UA session to a PLC on the local network is neither signed nor encrypted.";
- a user **Authentication** with **None** security toward a PLC on the local network is **refused**: the password would travel in clear.

Through the remote exposure (Cloudflare tunnel), only a local address (`127.0.0.1` or `::1`) is accepted, with no password and no certificate trust to give: open the viewer on the machine for those.

## First connection: trust on both sides

With **Sign** or **Sign and encrypt**, each side must trust the other's certificate. Pantin **never** trusts a first contact by itself. There are two steps, in this order.

No picture shows these prompts: they need an OPC UA server, which the screenshot script does not have.

**Step 1: Pantin trusts the PLC's certificate.** At the first start, the bridge does not know the server's certificate. It stops, the state goes to **Failed** with **The PLC's certificate is not trusted**, and the card shows **Unknown PLC certificate** with the certificate's thumbprints and its validity (**Valid from … to …**). Compare these thumbprints with those the PLC shows for its certificate: **Compare these thumbprints with the PLC's certificate before trusting it. Trust applies to every Pantin on this machine.** If they match, click **Trust and restart**.

**Step 2: the PLC trusts Pantin's certificate.** After that restart, the PLC may refuse Pantin's certificate. The module then shows **the PLC rejected Pantin's certificate** and the card writes: **The PLC refused Pantin's certificate (SHA-1 …, SHA-256 …). Trust it in the PLC's OPC UA security settings; Pantin retries every 10 s.** The **Pantin's certificate** block gives the subject, the **Application URI** (of the form `urn:pantin:<machine name>:opcua-bridge`) and the **SHA-256 thumbprint** and **SHA-1 thumbprint** of the certificate: trust it in the PLC, comparing the thumbprint (CODESYS may show only the SHA-1, **NOT VERIFIED**). There is **nothing to restart**: Pantin retries by itself every 10 s and the module connects.

The path in CODESYS to trust a client certificate (the list of rejected certificates, then trusting one) has **not been verified**; read the documentation of your version.

Some details:

- Pantin's certificate is created at the bridge's first start. Before that: **Pantin's certificate and its thumbprints appear at the first start of the bridge.**
- The certificates are kept in a folder of the **machine**, `$XDG_STATE_HOME/pantin/opcua-pki`, by default `~/.local/state/pantin/opcua-pki` (the core's `--opcua-pki-dir` option picks another), outside any Pantins folder. **Trust therefore applies to every Pantin on the machine**, not only the one that asked for it.
- A PLC certificate that is **expired, not yet valid, or whose application URI does not match** is never accepted, even with **Trust and restart**: the title is **The PLC's certificate is not valid** and the reason is written after **Reason:**. Renew the certificate in the PLC.
- With **None** security, no certificate is exchanged.

## Reading the states and the reasons

Each module has a line, with a marker, its key, its port and its state **in words**: **bridge stopped**, **waiting for the PLC** or **PLC connected**. Colour is never the only cue: read the text. When the PLC is not connected, the reason is added:

| Reason shown | What it means | What to do |
| --- | --- | --- |
| **connection closed by the PLC** | The socket or the session closed. The bridge retries by itself (1 s, 2 s, 4 s... up to 10 s). | Check that the PLC runs and that its OPC UA server is enabled. |
| **the PLC stopped answering** | No publish response during the **Watchdog (ms)**. The bridge closes the session and reconnects. | Check the network and the PLC program. Raise the watchdog if the PLC is slow. |
| **the PLC does not have the expected variables** | After connecting, a node is missing or does not fit. The bridge closes the session and retries every 10 s. The bridge log writes **one error line per problem**. | Read the log (see below). |
| **the PLC rejected Pantin's certificate** | The PLC does not trust Pantin yet. The bridge retries every 10 s. | Trust it in the PLC (step 2). |

The boolean commands of an OPC UA module that is no longer connected are reset to 0 by the core, as for Modbus; the others keep their value. The console writes the reason with the console's own words (for example "no answer in time" or "the PLC's nodes do not match the mapping").

### A node is missing or does not fit

At each session, the bridge reads each node's **type** and **access rights**. The log writes one line per problem, in English, for example:

```text
Node s=|var|CODESYS Control Win V3 x64.Application.GVL_Pantin.tige_verin_position (tag tige.verin.position) does not exist on the server. Check the node id prefix, the GVL name and that the variable is in the symbol configuration.
```

The three cases: the node does not exist (check the **NodeId prefix**, the **GVL name** and that the variable is ticked in the symbol configuration); its type is not the channel's **Type** (change the variable's type in the PLC); its rights are insufficient (read for a command, write for a feedback).

If the **Namespace URI** does not exist on the server, a single error line lists the namespace table: copy the right one from it.

## The log and the command line

The OPC UA bridge's log is in the file `<Pantins folder>/.logs/<pantinId>/bridge-opcua_client.log`. In the current version, the **PLC bridge log** window only shows the Modbus bridge's; for OPC UA, use the card's failure block or the command:

```sh
pnpm pantin bridge-log <pantinId> --transport opcua_client
```

See [Reading the bridge log](/en/guide/connect-a-plc#reading-the-bridge-log) for the other options.

## Troubleshooting

| What you see | Cause | What to do |
| --- | --- | --- |
| **Start** greyed out and `Start the core with --opcua-bridge <file> (pnpm serve adds it).` | The core was started without `--opcua-bridge` | Start the core with `pnpm serve` |
| "Enter the PLC address of every OPC UA module before starting." | A module has no PLC address | Fill in the **PLC address for module …** field |
| Start refused with mapping problems | Invalid mapping, often an empty **Namespace URI**, or mismatched security | Fix them in **I/O config** |
| **The PLC's certificate is not trusted** | First contact with this certificate | Compare the thumbprints, then **Trust and restart** |
| **The PLC's certificate is not valid** | Expired, not yet valid, or different application URI | Renew the certificate in the PLC: Pantin never overrides it |
| **the PLC rejected Pantin's certificate** | The PLC does not know Pantin | Trust it with the thumbprints of the **Pantin's certificate** block; Pantin retries every 10 s |
| **The PLC refused the login** | Wrong user name or password, or a recent CODESYS PLC that refuses the anonymous login | Check the **User name**, type the password again, then restart. **Some recent CODESYS PLCs refuse the anonymous login.** |
| **the PLC does not have the expected variables** | Prefix, GVL, type or rights | Read the log; see above |
| An error line listing the `NamespaceArray` table | The **Namespace URI** is unknown to the server | Copy the right URI |
| **the PLC stopped answering** | Silence beyond the **Watchdog (ms)** | Check the network, the program, or raise the watchdog |
| A pulse from the PLC never reaches Pantin | It is shorter than the sampling interval the server settled on | Lengthen the pulse in the program |
| A write from the PLC seems to have no effect | The tag is **forced** from the viewer | **Release all**: see [Connect a PLC](/en/guide/connect-a-plc#forced-tags) |

## Security

- Pantin is the client: it **writes** into the server's variables. Aim at a PLC **under test**, never at a PLC driving real outputs.
- Certificates and trust are **host-wide** (see above).
- Anonymous stays the default; **User and password** is allowed toward the local network only with **Sign** or **Sign and encrypt** security.
- Pantin is not meant for a production network.

## Known limits

::: warning What has not been tried
- No connection to a real CODESYS has been made: the server, the security, the logins, the NodeIds, the namespace of the variables, the default port, CODESYS menu names, the behaviour when the PLC restarts and the exchange period are **NOT VERIFIED**.
- IPv6 literal addresses have not been tried.
- Windows has not been tried: the certificate folder paths are not verified.
- 64-bit integers (`LINT`) lose their low bits beyond 2^53, because tags are JavaScript numbers.
- The **PLC bridge log** window does not show the OPC UA bridge's log yet; a channel's explicit identifier and **Type** cannot be edited in the table.
:::

## See also

- [Connect a PLC (Modbus TCP)](/en/guide/connect-a-plc)
- [Tutorial: reusing the PLC's variables](/en/guide/tutorial-plc-symbols)
- [Troubleshooting](/en/guide/troubleshooting)
- [Architecture decision 0065](https://github.com/ProtoGulix/pantin/blob/develop/docs/decisions/0065-opc-ua-client-bridge.md)
