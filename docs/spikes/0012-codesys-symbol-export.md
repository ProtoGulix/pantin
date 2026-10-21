# Spike 0012: CODESYS symbol list export format

Date: 2026-10-20
Status: partly verified (symbol XML verified from one real sample; I/O mapping CSV and TIA Portal not verified at file level)

## Question

What is the real file format of the symbol list a CODESYS V3 project exports
(Symbol Configuration object, XML file written at "Generate Code"), what does it
carry, how do OPC UA NodeIds derive from it, what does the CODESYS "Export
mappings to CSV" of a Modbus TCP slave look like, and (future only) what does a
TIA Portal PLC tag table export look like.

## Verdict

1. The symbol XML is a real, documented-by-example format. Root
   `<Symbolconfiguration>`, namespace `http://www.3s-software.com/schemas/Symbolconfiguration.xsd`,
   sections `Header`, `TypeList`, `NodeList`. It lists variables, IEC types, sizes
   and access rights. It carries NO Modbus address and NO I/O mapping. It is
   usable to import the list of variable names and types for pantin, not the wiring.
2. The I/O mapping CSV is the only CODESYS export that touches Modbus channels,
   but its columns could not be verified (no real file found, official page
   gives no column list). Needs a real export from the user's CODESYS.
3. TIA Portal: Openness XML (SimaticML) tag table shape confirmed by one
   third-party sample. Excel columns NOT VERIFIED. Future architecture only.

## Method

Web search and page fetches of official CODESYS help, CODESYS Forge threads, a
vendor tutorial containing a full generated file, and third-party TIA samples.
GitHub code search for a real exported file returned nothing usable (the search
tool cannot search file contents; NOT VERIFIED that none exists). No file was
generated locally (no CODESYS available). The EMQX page HTML was downloaded to
the scratchpad and the sample extracted from it unchanged.

## Results

### 1. Symbol XML (verified, one real sample)

Source of the sample: EMQX Neuron documentation, CODESYS V3 demo, project
"test", device CODESYS Control Win V3 x64:
https://docs.emqx.com/en/neuronex/latest/configuration/south-devices/codesys3/demo.html
(same text on docs.emqx.com/en/neuron/latest/...). Page states the file
`test.Device.Application.xml` "will be generated in the project directory" via
Build, then Build > Generate Code.

Minimal excerpt (verbatim, shortened):

    <?xml version="1.0" encoding="utf-8"?>
    <Symbolconfiguration xmlns="http://www.3s-software.com/schemas/Symbolconfiguration.xsd">
      <Header>
        <Version>3.5.11.0</Version>
        <SymbolConfigObject version="3.5.12.0" runtimeid="3.5.12.0" libversion="3.5.11.0" compiler="3.5.12.0" lmm="3.5.12.0" profile="CODESYS V3.5 SP12+" settings="SupportOPCUA, XmlIncludeComments, LayoutCalculator=OptimizedClientSideLayoutCalculator" />
        <ProjectInfo name="test" devicename="Device" appname="Application" />
      </Header>
      <TypeList>
        <TypeSimple name="T_BOOL" size="1" swapsize="0" typeclass="Bool" iecname="BOOL" />
        <TypeSimple name="T_INT" size="2" swapsize="2" typeclass="Int" iecname="INT" />
        <TypeSimple name="T_REAL" size="4" swapsize="4" typeclass="Real" iecname="REAL" />
        <TypeArray name="T_ARRAY__0__10__OF_INT" size="22" nativesize="22" typeclass="Array" iecname="ARRAY [0..10] OF INT" basetype="T_INT">
          <ArrayDim minrange="0" maxrange="10" />
        </TypeArray>
        <TypeUserDef name="T_Point" size="89" nativesize="92" typeclass="Userdef" pouclass="STRUCTURE" iecname="Point">
          <UserDefElement iecname="X" type="T_INT" byteoffset="0" vartype="VAR" />
          <UserDefElement iecname="Y" type="T_REAL" byteoffset="4" vartype="VAR" />
        </TypeUserDef>
      </TypeList>
      <NodeList>
        <Node name="Application">
          <Node name="PLC_PRG">
            <Node name="ok" type="T_BOOL" access="ReadWrite" />
            <Node name="point" type="T_Point" access="ReadWrite" />
          </Node>
        </Node>
      </NodeList>
    </Symbolconfiguration>

Facts read from the sample:

- Encoding: UTF-8 (XML declaration).
- Root and namespace: as above. The "schema version" is not an attribute of the
  root. Versions live in `Header`: `<Version>` (3.5.11.0), and on
  `SymbolConfigObject` the attributes `version`, `runtimeid`, `libversion`,
  `compiler`, `lmm`, `profile` (e.g. "CODESYS V3.5 SP12+"), `settings`.
- Types: every type is a child of `TypeList`, referenced by its `name`
  (prefix `T_`). `TypeSimple` (BOOL, BYTE, SINT, USINT, INT, UINT, DINT, UDINT,
  DWORD, REAL, STRING seen; `typeclass` e.g. Bool, Int, Real, String, `iecname`
  the IEC name, `size` in bytes; STRING size 81 = 80 chars + terminator).
  `TypeArray` (`basetype`, one `ArrayDim minrange/maxrange` per dimension),
  `TypeUserDef` (`pouclass="STRUCTURE"`, children `UserDefElement` with `iecname`,
  `type`, `byteoffset`, `vartype`).
- Nodes: `NodeList` holds a tree of `Node name=...`. The full symbol path is the
  concatenation of the names from the top (`Application` > `PLC_PRG` > `ok`).
  Only leaves carry `type` and `access`. Observed access value: `ReadWrite`.
- Access rights per official help: Read only, Write only, Read and write,
  Execute (functions, FB, methods, programs; needs "Support calls" and "Support
  OPC UA features"). Source:
  https://content.helpme-codesys.com/en/CODESYS%20Communication/_cds_obj_symbolconfiguration.html
  The exact XML spelling of the other values (ReadOnly, WriteOnly...) is NOT
  VERIFIED (only `ReadWrite` seen in a real file).
- Comments and attributes: help says "Include comments in XML" exports the
  comments, and attributes need "Enable extended OPC UA information". The
  sample was generated with `XmlIncludeComments` in `settings`, but no variable
  in it had a comment, so the XML element/attribute that carries a comment is
  NOT VERIFIED.
- Modbus / I/O mapping: absent from the file and from the help page. The file
  has no address of any kind, except `byteoffset` inside structures.
- Schema: the help page says Tools > "Save XSD Scheme File" saves the XSD of the
  symbol file. The XSD itself was not obtained (NOT VERIFIED).
- Naming of the file: `<project>.<device>.<application>.xml`
  (EMQX sample; ABB help example `proj_xy.PLC1.application.xml`,
  https://help.plc.abb.com/_cds_Symbol_Config_.html). A Forge answer confirms
  "With Build/Generate Code a XML file is created within the project folder"
  (https://forge.codesys.com/forge/talk/Engineering/thread/867598e44c, 2021).
  The download to the controller is a different file, `<application>._symbols`.
- Deprecation: German and Spanish help pages state that the classic symbol
  configuration is outdated and recommend the "IEC Symbol Set Configuration"
  from V3.5 SP18 (also repeated on the English page). Its export format was NOT
  investigated.
- Only one sample file exists in this report, version 3.5.12.x. Differences in
  other versions (SP18 and later, other `profile`) are NOT VERIFIED.

### 2. OPC UA NodeIds

- Real NodeId seen in a forum question (2016) for a Raspberry Pi runtime:
  `ns=4;s=|var|Raspberry Pi.Application.PLC_PRG.IrSpeed`
  (https://forge.codesys.com/forge/talk/Runtime/thread/43b08a8321/). A forum user's
  NodeId for the Win runtime: `|var|CODESYS Control Win V3 x64.Application.GVL.uiCycleCounter`
  (forum thread https://forge.codesys.com/forge/talk/Engineering/thread/ca689d54ab/,
  as summarised by search, page not opened).
- Derived rule, NOT VERIFIED (one of its two sources was not opened):
  NodeId string = `|var|` + device name + `.` + path of the Symbolconfiguration
  node tree (Application.GVL.var). The device name in the NodeId comes from the
  runtime/device, whereas the XML calls it `devicename` in `ProjectInfo`
  ("Device" in the EMQX sample); equality of the two in a real deployment is
  NOT VERIFIED.
- The `ns=4` index is what the examples show; it depends on the server's
  namespace table, so a client must resolve the namespace URI. NOT VERIFIED as a
  stable value, and no official doc for the `|var|` convention was found.
- Runtime config `[CmpOPCUAProviderIecVarAccess] CustomNodeName=MyPLC123`
  replaces the device name part (answer by CodesysNA_Shawn, same thread). Whether
  `|var|` can be dropped: unknown, per the same answer.
- The EMQX CODESYS V3 TCP driver (port 11740 default) builds its point addresses
  from the XML `NodeList` ("concatenate the point addresses according to the
  NodeList"): independent evidence that the XML is the machine-readable symbol
  source.
- With "Use Empty Namespaces by Default (V2 Compatibility)", program and global
  variables are exported without application and GVL names (official help).

### 3. I/O mapping CSV ("Export mappings to CSV")

Official page:
https://content.helpme-codesys.com/en/CODESYS%20Development%20System/_cds_cmd_export_io_mapping_csv.html

Verified (documentation):
- Device context menu command in the Devices view; the device needs an I/O
  mapping configuration. Result is a CSV file.
- Separator: the Windows list separator (comma or semicolon). The older ABB-hosted
  help says semicolon.
- Entries are matched to the device by device name and parameter name; duplicate
  parameter names are numbered `@<n>`.
- Files may be edited by hand if the format is kept (said by the import page).
- Forum: on a Modbus TCP slave in 3.5.12.x, right click the slave, export CSV,
  delete mappings, "Import mappings from CSV" restored the variables
  (https://forge.codesys.com/forge/talk/Engineering/thread/34f5575e45/). Another
  user got an "is not found" error, unresolved. Another thread says channel
  definitions cannot be imported from a file, only mappings
  (https://forge.codesys.com/forge/talk/Engineering/thread/59d126b62a/).

NOT VERIFIED: the column list and any sample line. No real file was found. The
CSV links variables to channels of a device; whether it carries the Modbus
register address or only the channel name is unknown. Action: the user exports
one from CODESYS Control Win V3 x64 with a Modbus TCP slave and drops it in
private/ for a follow-up.
WAGO e!COCKPIT has its own Modbus slave CSV import/export (techdocs.wago.com,
page not opened, one URL returned 404), format NOT VERIFIED.

### 4. TIA Portal tag table (future architecture only)

- Openness export is XML in SimaticML. A sample on the DMC blog shows
  `<Document>`, `<SW.Tags.PlcTagTable ID="0">`, then `SW.Tags.PlcTag` objects with an
  `AttributeList` holding `<Name>I_Section1Running</Name>`,
  `<DataTypeName>Bool</DataTypeName>`, `<LogicalAddress>%I0.0</LogicalAddress>`
  (https://www.dmcinfo.com/blog/21173/using-xml-templates-in-tia-openness/).
  Here, unlike CODESYS symbols, the file carries the absolute address.
- A tool exporting tag tables to XML with TIA V15.1 and .NET 4.7.2:
  https://github.com/Speedstuff/TiaExportBlocks (not run).
- Excel export columns (Name, Path, Data Type, Logical Address, Comment, ...):
  NOT VERIFIED. The only source found (industrialmonitordirect.com) is a
  third-party blog judged unreliable. No Siemens documentation was reached.

## NOT VERIFIED (summary)

- XML spelling of access values other than ReadWrite.
- Element/attribute carrying variable comments and attributes in the XML.
- The XSD file content, and the format of IEC Symbol Set Configuration (SP18+).
- Differences between CODESYS versions and between runtimes (WAGO, Linux).
- Official documentation of the `|var|` NodeId rule, stability of `ns=4`, and
  whether the XML `devicename` equals the NodeId device part.
- Any real I/O mapping CSV (columns, delimiter in practice, Modbus address).
- TIA Portal Excel columns and the full Openness schema.
- Any real exported file on GitHub (search tooling could not search contents).

## What a follow-up would need

A real export from the user: the symbol XML of a project with a GVL containing
BOOL, INT, REAL, a struct, a commented variable, a read-only variable
(`{attribute 'symbol' := 'read'}`), and the I/O mapping CSV of a Modbus TCP slave.
No dependency needed to read them; a parser must use a schema-validated reader
(Zod after XML parsing) per CLAUDE.md section 8.

## Sources

- https://docs.emqx.com/en/neuronex/latest/configuration/south-devices/codesys3/demo.html
- https://content.helpme-codesys.com/en/CODESYS%20Communication/_cds_obj_symbolconfiguration.html
- https://help.plc.abb.com/_cds_Symbol_Config_.html
- https://forge.codesys.com/forge/talk/Engineering/thread/867598e44c
- https://forge.codesys.com/forge/talk/Runtime/thread/43b08a8321/
- https://forge.codesys.com/forge/talk/Engineering/thread/ca689d54ab/
- https://content.helpme-codesys.com/en/CODESYS%20Development%20System/_cds_cmd_export_io_mapping_csv.html
- https://forge.codesys.com/forge/talk/Engineering/thread/34f5575e45/
- https://forge.codesys.com/forge/talk/Engineering/thread/72e110c775/
- https://forge.codesys.com/forge/talk/Engineering/thread/59d126b62a/
- https://www.dmcinfo.com/blog/21173/using-xml-templates-in-tia-openness/
- https://github.com/Speedstuff/TiaExportBlocks

## Real export, 2026-10-21

A symbol file exported by CODESYS V3.5 SP22 Patch 1 (profile attribute "CODESYS V3.5 SP22
Patch 1+", runtime id 3.5.22.10, compiler 3.5.22.0) was read in full. It is versioned,
with the project name replaced, as the fixture
`packages/plc-symbol-formats/fixtures/codesys-3.5-sp22.xml`. These facts replace the
corresponding NOT VERIFIED items above.

Verified:

- SP22 still writes the `Symbolconfiguration` format, in the namespace
  `http://www.3s-software.com/schemas/Symbolconfiguration.xsd`. `Header/Version` is
  3.5.14.0: a format version, not the product version. `SymbolConfigObject` has a
  `settings` attribute ("SupportOPCUA, XmlIncludeComments, LayoutCalculator=...").
- The file starts with a byte order mark before the XML declaration.
- Access values seen: `ReadWrite` and `Read` (on the `Constants` of the library).
- A comment is a child `<Comment>` element, on a `Node` and on a `UserDefElement`. Its
  text starts with a space and may span several lines.
- A `Node` without `type` is a container (application, GVL, program, `Constants`,
  `IoConfig_Globals`); a typed `Node` is a symbol.
- `TypeUserDef` with `pouclass` `STRUCTURE` and `FUNCTION_BLOCK` list their members as
  `UserDefElement` (`iecname`, `type`, `vartype`, `access`, `inherited_from`). A derived
  function block lists the members it inherits, so its `basetype` need not be walked.
  A function block can hold other function blocks (`TON`, `R_TRIG`) as members.
- `TypeUserDef` with `typeclass="Enum"` has `UserDefElement` entries with `enumvalue`:
  values, not members.
- `TypeSimple` with `typeclass="Pointer"` covers `POINTER TO ...` and `RTS_IEC_HANDLE`;
  `TYPE_REFERENCE` is a `TypeSimple` of `typeclass="Userdef"`. `TypeArray` carries the
  `ARRAY [0..3] OF BYTE` text in `iecname`.
- An alias type (`XWORD`) has `aliasedtype` and `aliasediecname` (`LWORD`).
- Nodes of the I/O mapping globals carry `directaddress="%IW1"` (an absolute address).
- A GVL generated by Pantin from io.json appears as plain GVL variables, one
  `Node` per channel, with the channel's comment.

Still NOT VERIFIED:

- The XML spelling of a write-only access (`Write` is a guess).
- Other CODESYS versions and runtimes (WAGO, Linux), and the empty-namespace option.
- The IEC Symbol Set Configuration (SP18+) and its export format.
- TIA Portal files, and the CODESYS I/O mapping CSV (point 3 above).
- Whether the CODESYS I/O mapping of a Modbus slave channel accepts a dotted reference.
