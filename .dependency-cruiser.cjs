// Enforces the package boundaries of CLAUDE.md section 4: core and viewer only talk through
// the tag bus and the API, never through imports. The bridge is Python (ADR 0045): it has
// no TypeScript to cruise, and its only link to the protocol is the shared fixtures.
// The one crossing: the viewer's build config loads core's build-version module. It is build
// tooling run by Node, never part of the bundle (ADR 0058 point 2).
const VITE_CONFIG = "^packages/viewer/vite\\.config\\.ts$";
const BUILD_VERSION_MODULE = "^packages/core/src/build-version\\.ts$";

const isolatedPackages = ["core", "viewer"];

const isolationRules = isolatedPackages.map((packageName) => ({
  name: `${packageName}-is-isolated`,
  comment: `${packageName} must not import core or viewer: use the tag bus or the API.`,
  severity: "error",
  from: {
    path: `^packages/${packageName}/`,
    pathNot: packageName === "viewer" ? VITE_CONFIG : undefined,
  },
  to: {
    path: `^packages/(${isolatedPackages.join("|")})/|^@pantin/(${isolatedPackages.join("|")})$`,
    pathNot: `^packages/${packageName}/`,
  },
}));

module.exports = {
  forbidden: [
    ...isolationRules,
    {
      name: "viewer-config-imports-only-build-version",
      comment:
        "The viewer's vite.config.ts may import core's build-version module and nothing else of core.",
      severity: "error",
      from: { path: VITE_CONFIG },
      to: { path: "^packages/core/|^@pantin/core$", pathNot: BUILD_VERSION_MODULE },
    },
    {
      name: "protocol-has-no-workspace-dependency",
      comment:
        "protocol is the shared contract: it imports no other Pantin package, but the drive, actuator, sensor and transport type schemas (ADR 0022, 0023, 0028, 0064).",
      severity: "error",
      from: { path: "^packages/protocol/" },
      to: {
        path: "^packages/(?!protocol/)|^@pantin/(?!protocol$)",
        pathNot:
          "^packages/(drive|actuator|sensor|transport)-types/src/(schemas|schema-common|[^/]+/schema)\\.ts$|^packages/drive-types/src/(schemas|ports)\\.ts$",
      },
    },
    {
      name: "drive-types-has-no-workspace-dependency",
      comment: "A drive type folder must be shareable alone: it depends on Zod only (ADR 0022).",
      severity: "error",
      from: { path: "^packages/drive-types/" },
      to: { path: "^packages/(?!drive-types/)|^@pantin/" },
    },
    {
      name: "transport-types-has-no-workspace-dependency",
      comment:
        "A transport folder must be shareable alone: it depends on Zod only (ADR 0064 point 3).",
      severity: "error",
      from: { path: "^packages/transport-types/" },
      to: { path: "^packages/(?!transport-types/)|^@pantin/" },
    },
    {
      name: "viewer-runs-no-transport-rules",
      comment:
        "The viewer shows what the core decided and imports the schemas, labels and presentation of a transport, never its rules (ADR 0064 point 3).",
      severity: "error",
      from: { path: "^packages/viewer/" },
      to: { path: "^packages/transport-types/src/(rules|rule-types|[^/]+/rules[a-z-]*)\\.ts$" },
    },
    {
      name: "transport-type-schemas-hold-no-logic",
      comment:
        "The protocol imports the schemas: they must never reach the rules, through any chain of imports (ADR 0064 point 3).",
      severity: "error",
      from: { path: "^packages/transport-types/src/(schemas|schema-common|[^/]+/schema)\\.ts$" },
      to: {
        path: "^packages/transport-types/src/(rules|rule-types|[^/]+/rules[a-z-]*)\\.ts$",
        reachable: true,
      },
    },
    {
      name: "viewer-runs-no-drive-behaviour",
      comment: "The viewer shows drives but never simulates them (CLAUDE.md section 3.2).",
      severity: "error",
      from: { path: "^packages/viewer/" },
      to: {
        path: "^packages/drive-types/src/(behaviours|[^/]*behaviour-[a-z-]*common|[^/]+/behaviour)\\.ts$",
      },
    },
    {
      name: "drive-type-schemas-hold-no-logic",
      comment: "The protocol imports the schemas: they must never reach the behaviours (ADR 0022).",
      severity: "error",
      from: {
        path: "^packages/drive-types/src/(schemas|schema-common|ports|[^/]+/schema)\\.ts$",
      },
      // Through any chain of imports, not only a direct one.
      to: { path: "behaviour", reachable: true },
    },
    {
      name: "actuator-types-imports-only-port-states",
      comment:
        "An actuator type depends on Zod and on the port state schemas of drive-types, never on its behaviours (ADR 0028 point 3).",
      severity: "error",
      from: { path: "^packages/actuator-types/", pathNot: "\\.test\\.ts$" },
      to: {
        path: "^packages/(?!actuator-types/)|^@pantin/",
        pathNot: "^packages/drive-types/src/ports\\.ts$",
      },
    },
    {
      name: "actuator-types-tests-import-only-drive-schemas",
      comment:
        "Tests may also read the drive port declarations (schemas) to check default feeds, never a behaviour (ADR 0028).",
      severity: "error",
      from: { path: "^packages/actuator-types/.*\\.test\\.ts$" },
      to: {
        path: "^packages/(?!actuator-types/)|^@pantin/",
        pathNot: "^packages/drive-types/src/(ports|schemas)\\.ts$",
      },
    },
    {
      name: "viewer-runs-no-actuator-behaviour",
      comment: "The viewer shows actuators but never simulates them (CLAUDE.md section 3.2).",
      severity: "error",
      from: { path: "^packages/viewer/" },
      to: {
        path: "^packages/actuator-types/src/(behaviours|behaviour-[a-z-]*common|[^/]+/behaviour)\\.ts$",
      },
    },
    {
      name: "actuator-type-schemas-hold-no-logic",
      comment: "The protocol imports the schemas: they must never reach the behaviours (ADR 0028).",
      severity: "error",
      from: { path: "^packages/actuator-types/src/(schemas|schema-common|[^/]+/schema)\\.ts$" },
      // Through any chain of imports, not only a direct one.
      to: { path: "behaviour", reachable: true },
    },
    {
      name: "sensor-types-has-no-workspace-dependency",
      comment: "A sensor type folder must be shareable alone: it depends on Zod only (ADR 0023).",
      severity: "error",
      from: { path: "^packages/sensor-types/" },
      to: { path: "^packages/(?!sensor-types/)|^@pantin/" },
    },
    {
      name: "viewer-runs-no-sensor-evaluation",
      comment:
        "The viewer shows sensor values read from the core, it never computes them (CLAUDE.md section 3.2).",
      severity: "error",
      from: { path: "^packages/viewer/" },
      to: {
        path: "^packages/sensor-types/src/(evaluators|evaluation-common|switch-evaluation|[^/]+/evaluate)\\.ts$",
      },
    },
    {
      name: "sensor-type-schemas-hold-no-logic",
      comment:
        "The protocol imports the schemas: they must never reach the evaluations (ADR 0023).",
      severity: "error",
      from: { path: "^packages/sensor-types/src/(schemas|schema-common|[^/]+/schema)\\.ts$" },
      // Through any chain of imports, not only a direct one.
      to: { path: "evaluat", reachable: true },
    },
    {
      name: "sensor-type-zones-hold-no-evaluation",
      comment:
        "Clients read the switch zones to draw them: zones never reach an evaluation (ADR 0025).",
      severity: "error",
      from: { path: "^packages/sensor-types/src/(zones|switch-zones|[^/]+/zone)\\.ts$" },
      to: { path: "evaluat", reachable: true },
    },
    {
      name: "rapier-only-in-rapier-world",
      comment:
        "Rapier is imported by core/src/physics/rapier-world.ts alone, so the engine stays behind one boundary (ADR 0043 point 9).",
      severity: "error",
      from: { pathNot: "^packages/core/src/physics/rapier-world\\.ts$" },
      to: { path: "@dimforge/rapier3d" },
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
      // Test code may use vitest: test files, test-support folders and *-test-helpers.ts
      // files only exist to serve tests; shipped-code-imports-no-test-code keeps them
      // out of shipped code.
      from: {
        path: "^packages/[^/]+/src/",
        pathNot: "\\.test\\.ts$|/test-support/|-test-helpers\\.ts$",
      },
      to: { dependencyTypes: ["npm-dev"] },
    },
    {
      name: "shipped-code-imports-no-test-code",
      comment:
        "Test helpers may import vitest, so shipped code must never reach them (see no-dev-dependency-in-sources).",
      severity: "error",
      from: {
        path: "^packages/[^/]+/src/",
        pathNot: "\\.test\\.ts$|/test-support/|-test-helpers\\.ts$",
      },
      to: { path: "/test-support/|-test-helpers\\.ts$" },
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
    // Only the packages' own build output is left out: an npm dependency served from its
    // dist/ (vitest, Rapier) must stay visible to the rules, such as rapier-only-in-rapier-world.
    exclude: { path: "^packages/[^/]+/dist/" },
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
