// Enforces the package boundaries of CLAUDE.md section 4: core, viewer and bridge
// only talk through the tag bus and the API, never through imports.
const isolatedPackages = ["core", "viewer", "bridge"];

const isolationRules = isolatedPackages.map((packageName) => ({
  name: `${packageName}-is-isolated`,
  comment: `${packageName} must not import core, viewer or bridge: use the tag bus or the API.`,
  severity: "error",
  from: { path: `^packages/${packageName}/` },
  to: {
    path: `^packages/(${isolatedPackages.join("|")})/|^@pantin/(${isolatedPackages.join("|")})$`,
    pathNot: `^packages/${packageName}/`,
  },
}));

module.exports = {
  forbidden: [
    ...isolationRules,
    {
      name: "protocol-has-no-workspace-dependency",
      comment: "protocol is the shared contract: it imports no other Pantin package.",
      severity: "error",
      from: { path: "^packages/protocol/" },
      to: { path: "^packages/(?!protocol/)|^@pantin/(?!protocol$)" },
    },
    {
      name: "no-circular",
      comment: "Circular imports hide the real dependency direction.",
      severity: "error",
      from: {},
      to: { circular: true },
    },
    {
      name: "no-dev-dependency-in-sources",
      comment: "Shipped code must not rely on devDependencies.",
      severity: "error",
      from: { path: "^packages/[^/]+/src/", pathNot: "\\.test\\.ts$" },
      to: { dependencyTypes: ["npm-dev"] },
    },
    {
      name: "no-unresolvable-import",
      comment: "An import that does not resolve is a broken build waiting to happen.",
      severity: "error",
      from: {},
      to: { couldNotResolve: true },
    },
  ],
  options: {
    doNotFollow: { path: "node_modules" },
    exclude: { path: "(^|/)dist/" },
    tsPreCompilationDeps: true,
    tsConfig: { fileName: "tsconfig.base.json" },
    combinedDependencies: true,
    enhancedResolveOptions: {
      exportsFields: ["exports"],
      conditionNames: ["import", "require", "node", "default"],
      extensions: [".ts", ".js"],
    },
  },
};
