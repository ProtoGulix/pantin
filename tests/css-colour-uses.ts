// Finds the CSS rules that paint with a reserved colour (ADR 0057 rule 3 and 5):
// a state colour, an IEC fill or the brand. Used by viewer-colour-allowlist.test.ts.

const RESERVED_COLOUR = /var\(--(?:state-|fill-|brand)[\w-]*\)/;

export interface ReservedUse {
  /** "file.css :: selector", the key of the allowlist. */
  key: string;
  /** The declarations that use a reserved colour, for the message of a failure. */
  declarations: string[];
}

/** Raised when the stylesheet uses a form this scan cannot follow: a silent miss would hide a use. */
export class UnsupportedCssError extends Error {}

function withoutComments(css: string): string {
  return css.replace(/\/\*[\s\S]*?\*\//g, "");
}

function normalised(selector: string): string {
  return selector.replace(/\s+/g, " ").trim();
}

interface Block {
  header: string;
  body: string;
}

/** The top-level blocks of a stylesheet fragment: `header { body }`. */
function blocksOf(css: string): Block[] {
  const blocks: Block[] = [];
  let depth = 0;
  let quote: string | null = null;
  let headerStart = 0;
  let bodyStart = 0;
  for (let index = 0; index < css.length; index += 1) {
    const character = css[index];
    if (quote !== null) {
      quote = character === quote ? null : quote;
    } else if (character === '"' || character === "'") {
      quote = character;
    } else if (character === "{") {
      if (depth === 0) {
        bodyStart = index + 1;
      }
      depth += 1;
    } else if (character === "}") {
      depth -= 1;
      if (depth === 0) {
        blocks.push({
          header: css.slice(headerStart, bodyStart - 1),
          body: css.slice(bodyStart, index),
        });
        headerStart = index + 1;
      }
    } else if (
      character === ";" &&
      depth === 0 &&
      css.slice(headerStart, index).trim().startsWith("@")
    ) {
      throw new UnsupportedCssError(
        `Statement at-rule not supported: ${css.slice(headerStart, index).trim()}`,
      );
    }
  }
  return blocks;
}

function reservedDeclarations(header: string, body: string): string[] {
  // A nested rule is a block inside the body, with or without "&".
  if (body.includes("{")) {
    throw new UnsupportedCssError(`Nested rule not supported: ${normalised(header)}`);
  }
  const declarations = body.split(";").map((declaration) => declaration.trim());
  // The tints of the reserved tokens themselves (--state-abnormal-soft...) are the one definition allowed.
  const alias = declarations.find(
    (declaration) =>
      declaration.startsWith("--") &&
      !/^--(?:state-|fill-|brand)/.test(declaration) &&
      RESERVED_COLOUR.test(declaration),
  );
  if (alias !== undefined) {
    throw new UnsupportedCssError(`A custom property aliases a reserved colour: ${alias}`);
  }
  return declarations.filter(
    (declaration) => !declaration.startsWith("--") && RESERVED_COLOUR.test(declaration),
  );
}

/** Every rule of the stylesheet that uses a reserved colour, at-rules included. */
export function reservedUsesOf(fileName: string, css: string): ReservedUse[] {
  const uses: ReservedUse[] = [];
  const visit = (fragment: string): void => {
    for (const { header, body } of blocksOf(fragment)) {
      if (header.trim().startsWith("@")) {
        if (/^@(?:media|supports|container|layer)\b/.test(header.trim())) {
          visit(body);
        } else if (RESERVED_COLOUR.test(body)) {
          throw new UnsupportedCssError(`At-rule not followed: ${normalised(header)}`);
        }
        continue;
      }
      const declarations = reservedDeclarations(header, body);
      if (declarations.length > 0) {
        uses.push({ key: `${fileName} :: ${normalised(header)}`, declarations });
      }
    }
  };
  visit(withoutComments(css));
  return uses;
}
