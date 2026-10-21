// Entities and character references of the XML subset (ADR 0064 point 11).
// Only the 5 predefined entities exist: with no DOCTYPE nobody can define
// another, so there is nothing to expand and no expansion to bound.

const PREDEFINED_ENTITIES: Readonly<Record<string, string>> = {
  lt: "<",
  gt: ">",
  amp: "&",
  quot: '"',
  apos: "'",
};

// The Char production of XML 1.0: tab, line feeds, and the Unicode ranges
// without the surrogates and the two non-characters.
function isXmlCharacter(codePoint: number): boolean {
  return (
    codePoint === 0x9 ||
    codePoint === 0xa ||
    codePoint === 0xd ||
    (codePoint >= 0x20 && codePoint <= 0xd7ff) ||
    (codePoint >= 0xe000 && codePoint <= 0xfffd) ||
    (codePoint >= 0x10000 && codePoint <= 0x10ffff)
  );
}

export type ReferenceResult = { text: string } | { problem: string };

/** The text a reference stands for; `body` is what sits between "&" and ";". */
export function resolveReference(body: string): ReferenceResult {
  const predefined = Object.hasOwn(PREDEFINED_ENTITIES, body)
    ? PREDEFINED_ENTITIES[body]
    : undefined;
  if (predefined !== undefined) {
    return { text: predefined };
  }
  const decimal = /^#([0-9]+)$/.exec(body);
  const hexadecimal = /^#x([0-9a-fA-F]+)$/.exec(body);
  const digits = decimal?.[1] ?? hexadecimal?.[1];
  if (digits === undefined) {
    return {
      problem: `The entity "&${body};" is not defined: only &lt; &gt; &amp; &quot; &apos; and character references are read.`,
    };
  }
  const codePoint = Number.parseInt(digits, decimal === null ? 16 : 10);
  if (!Number.isSafeInteger(codePoint) || !isXmlCharacter(codePoint)) {
    return { problem: `The character reference "&${body};" is not a character XML allows.` };
  }
  return { text: String.fromCodePoint(codePoint) };
}
