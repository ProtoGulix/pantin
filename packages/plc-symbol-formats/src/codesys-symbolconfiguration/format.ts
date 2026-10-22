import {
  MAX_SYMBOLS,
  type ParseProblem,
  type ParseResult,
  type PlcProjectInfo,
  type PlcSymbolFormat,
} from "../model.ts";
import { peekXmlRoot, readXmlSubset } from "../xml-subset.ts";
import { attributeOf, firstChildNamed, type XmlElement } from "../xml-tree.ts";
import { TooManySymbolsError, type WalkState, walkNodes } from "./expand.ts";
import { readTypeList } from "./type-list.ts";

// The symbol configuration CODESYS V3 writes at "Generate Code"
// (<project>.<device>.<application>.xml). Verified on one real SP22 file and one
// published SP12 sample (spike 0012): SP22 still writes this format, under the
// same namespace (ADR 0064 amendment of 2026-10-21).

const CODESYS_SYMBOLCONFIGURATION_ID = "codesys-symbolconfiguration";
const ROOT_NAME = "Symbolconfiguration";
const NAMESPACE = "http://www.3s-software.com/schemas/Symbolconfiguration.xsd";

function isSymbolConfiguration(root: XmlElement | null): root is XmlElement {
  return root?.name === ROOT_NAME && attributeOf(root, "xmlns") === NAMESPACE;
}

function projectOf(root: XmlElement): PlcProjectInfo | null {
  const info = firstChildNamed(firstChildNamed(root, "Header") ?? root, "ProjectInfo");
  const name = info === undefined ? undefined : attributeOf(info, "name");
  const deviceName = info === undefined ? undefined : attributeOf(info, "devicename");
  const applicationName = info === undefined ? undefined : attributeOf(info, "appname");
  return name === undefined || deviceName === undefined || applicationName === undefined
    ? null
    : { name, deviceName, applicationName };
}

function problem(code: string, message: string): ParseResult {
  const problems: ParseProblem[] = [{ code, message }];
  return { ok: false, problems };
}

function parseSymbolConfiguration(root: XmlElement): ParseResult {
  const nodeList = firstChildNamed(root, "NodeList");
  if (nodeList === undefined) {
    return problem(
      "missing_node_list",
      "The file has no NodeList: it is not a symbol configuration with symbols. Generate the code of the application again.",
    );
  }
  const state: WalkState = {
    types: readTypeList(firstChildNamed(root, "TypeList")),
    symbols: [],
    warnings: new Map(),
    visited: 0,
  };
  try {
    walkNodes(state, nodeList, []);
  } catch (error) {
    if (error instanceof TooManySymbolsError) {
      return problem(
        "too_many_symbols",
        `The file lists, or its types expand into, more than ${MAX_SYMBOLS} symbols: select fewer variables in the Symbol Configuration.`,
      );
    }
    throw error;
  }
  return {
    ok: true,
    list: {
      project: projectOf(root),
      symbols: state.symbols,
      warnings: [...state.warnings.values()],
    },
  };
}

function parse(text: string): ParseResult {
  const read = readXmlSubset(text);
  if (!read.ok) {
    return problem(read.problem.code, read.problem.message);
  }
  if (!isSymbolConfiguration(read.root)) {
    return problem(
      "wrong_format",
      `The root element is not <${ROOT_NAME}> in the namespace ${NAMESPACE}: this is not a CODESYS symbol configuration file.`,
    );
  }
  return parseSymbolConfiguration(read.root);
}

export const CODESYS_SYMBOLCONFIGURATION_FORMAT: PlcSymbolFormat = {
  id: CODESYS_SYMBOLCONFIGURATION_ID,
  detect: (text) => isSymbolConfiguration(peekXmlRoot(text)),
  parse,
};
