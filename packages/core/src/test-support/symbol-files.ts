// A small CODESYS symbol configuration for the "axis" test Pantin, as a test sends it.
// Its variables, against the axis tags once mapped with their default variables:
//   GVL.carriage_valve_coil_14        BOOL    the variable coil_14 already has: unchanged
//   PLC_PRG.CarriageValveCoil12       BOOL    found by its normalised name: a proposal
//   GVL.carriage_stroke_setpoint      STRING  the name setpoint already has, the type is wrong
//   PLC_PRG.rStroke                   REAL    nobody uses it

const NAMESPACE = "http://www.3s-software.com/schemas/Symbolconfiguration.xsd";

export const AXIS_SYMBOL_FILE = `<?xml version="1.0" encoding="utf-8"?>
<Symbolconfiguration xmlns="${NAMESPACE}">
  <Header>
    <ProjectInfo name="Axis" devicename="Device" appname="Application" />
  </Header>
  <TypeList>
    <TypeSimple name="T_BOOL" iecname="BOOL" />
    <TypeSimple name="T_REAL" iecname="REAL" />
    <TypeSimple name="T_STRING" iecname="STRING" />
  </TypeList>
  <NodeList>
    <Node name="Application">
      <Node name="GVL">
        <Node name="carriage_valve_coil_14" type="T_BOOL" access="ReadWrite" />
        <Node name="carriage_stroke_setpoint" type="T_STRING" access="ReadWrite" />
      </Node>
      <Node name="PLC_PRG">
        <Node name="CarriageValveCoil12" type="T_BOOL" access="ReadWrite" />
        <Node name="rStroke" type="T_REAL" access="ReadWrite" />
      </Node>
    </Node>
  </NodeList>
</Symbolconfiguration>
`;

const XML_CONTENT_TYPE = "application/xml";

export function xmlBody(text: string): { contentType: string; bytes: Uint8Array } {
  return { contentType: XML_CONTENT_TYPE, bytes: new TextEncoder().encode(text) };
}
