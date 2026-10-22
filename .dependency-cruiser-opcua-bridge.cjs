// Dependency rules of packages/opcua-bridge (ADR 0065 point 1). The isolation from core and
// viewer is in the main file with the other isolated packages.
module.exports = [
  {
    name: "opcua-bridge-imports-only-protocol-and-network-address",
    comment:
      "The OPC UA bridge talks to the core through the tag bus and the API: among the workspace packages it imports the protocol and the address classification only (ADR 0065 point 1).",
    severity: "error",
    from: { path: "^packages/opcua-bridge/" },
    to: {
      path: "^packages/(?!opcua-bridge/|protocol/|network-address/)|^@pantin/(?!protocol$|network-address$)",
    },
  },
  {
    name: "node-opcua-only-in-the-opcua-folder",
    comment:
      "node-opcua is imported by the files of opcua-bridge/src/opcua/ alone, so the library stays behind one adapter folder (ADR 0065 point 1, S3 amendment). Tests and their support files may import it.",
    severity: "error",
    from: {
      pathNot: "^packages/opcua-bridge/src/opcua/|\\.test\\.ts$|/test-support/",
    },
    to: { path: "node-opcua" },
  },
  {
    name: "main-loads-the-bridge-dynamically",
    comment:
      "The stdout guard must be installed before node-opcua is loaded, and a static import is evaluated before the body of main.ts: main.ts reaches run.ts, and through it node-opcua, by a dynamic import only (ADR 0065 point 1).",
    severity: "error",
    from: { path: "^packages/opcua-bridge/src/main\\.ts$" },
    to: {
      path: "node-opcua|^packages/opcua-bridge/src/(run|opcua/)",
      dependencyTypesNot: ["dynamic-import"],
    },
  },
];
