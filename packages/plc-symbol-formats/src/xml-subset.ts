import { XmlCursor, type XmlProblemCode, XmlStop } from "./xml-cursor.ts";
import { type XmlAttribute, type XmlElement, XmlElementSchema } from "./xml-tree.ts";

// A hand-written reader for the subset of XML that PLC symbol files use
// (ADR 0064 point 11): the declaration, elements, attributes, self-closing tags,
// text, CDATA, comments, the 5 predefined entities and character references.
// Pure: it reads a string. Refused, with a sentence that says why: DOCTYPE (so
// no external or expanding entity can exist), processing instructions other
// than the declaration, any encoding but UTF-8. Namespace prefixes are not
// resolved: a name is read as written.

export const XML_LIMITS = {
  maxDepth: 64,
  maxElements: 200_000,
  maxAttributesPerElement: 256,
  // UTF-16 code units, never more than the bytes of the file.
  maxTextLength: 8 * 1024 * 1024,
} as const;

interface XmlProblem {
  code: XmlProblemCode;
  message: string;
}

export type XmlReadResult = { ok: true; root: XmlElement } | { ok: false; problem: XmlProblem };

const DECLARATION = /<\?xml(?:[ \t\n\r][\s\S]*?)?\?>/y;
const DECLARED_ENCODING = /[ \t\n\r]encoding[ \t\n\r]*=[ \t\n\r]*(?:"([^"]*)"|'([^']*)')/;

class XmlReader extends XmlCursor {
  private elementCount = 0;

  private readDeclaration(): void {
    DECLARATION.lastIndex = this.position;
    const declaration = DECLARATION.exec(this.text)?.[0];
    if (declaration === undefined) {
      return;
    }
    const encoding = DECLARED_ENCODING.exec(declaration);
    const declared = encoding?.[1] ?? encoding?.[2];
    if (declared !== undefined && declared.toLowerCase() !== "utf-8") {
      this.fail(
        "encoding_refused",
        `The file declares the encoding "${declared}": only UTF-8 is read. Save it as UTF-8.`,
      );
    }
    this.position += declaration.length;
  }

  // Comments and whitespace around the root; refuses what could hide an entity.
  private skipMisc(): void {
    for (;;) {
      this.skipWhitespace();
      if (this.startsWith("<!--")) {
        this.skipComment();
      } else if (this.startsWith("<!DOCTYPE")) {
        this.refuseDoctype();
      } else if (this.startsWith("<?")) {
        this.refuseProcessingInstruction();
      } else {
        return;
      }
    }
  }

  private readAttributes(): { attributes: XmlAttribute[]; selfClosing: boolean } {
    const attributes: XmlAttribute[] = [];
    const names = new Set<string>();
    for (;;) {
      const separated = this.skipWhitespace();
      if (this.startsWith("/>")) {
        this.position += 2;
        return { attributes, selfClosing: true };
      }
      if (this.startsWith(">")) {
        this.position += 1;
        return { attributes, selfClosing: false };
      }
      if (!separated) {
        this.fail("malformed", 'Expected whitespace, ">" or "/>" in a tag.');
      }
      const name = this.readName();
      this.skipWhitespace();
      this.expect("=");
      this.skipWhitespace();
      if (names.has(name)) {
        this.fail("malformed", `The attribute "${name}" appears twice in a tag.`);
      }
      if (names.size >= XML_LIMITS.maxAttributesPerElement) {
        this.fail(
          "too_many_elements",
          `A tag has more than ${XML_LIMITS.maxAttributesPerElement} attributes.`,
        );
      }
      names.add(name);
      attributes.push({ name, value: this.readAttributeValue() });
    }
  }

  private readStartTag(depth: number): { element: XmlElement; selfClosing: boolean } {
    if (depth > XML_LIMITS.maxDepth) {
      this.fail("too_deep", `Elements are nested more than ${XML_LIMITS.maxDepth} levels deep.`);
    }
    this.elementCount += 1;
    if (this.elementCount > XML_LIMITS.maxElements) {
      this.fail("too_many_elements", `The file has more than ${XML_LIMITS.maxElements} elements.`);
    }
    this.expect("<");
    const name = this.readName();
    const { attributes, selfClosing } = this.readAttributes();
    return { element: { name, attributes, children: [], text: "" }, selfClosing };
  }

  private readClosingTag(name: string): void {
    this.position += 2;
    const closing = this.readName();
    if (closing !== name) {
      this.fail("malformed", `The element "${name}" is closed by "</${closing}>".`);
    }
    this.skipWhitespace();
    this.expect(">");
  }

  private readContent(element: XmlElement, depth: number): void {
    const pieces: string[] = [];
    for (;;) {
      if (this.position >= this.text.length) {
        this.fail("malformed", `The element "${element.name}" is never closed.`);
      }
      if (this.startsWith("</")) {
        this.readClosingTag(element.name);
        break;
      }
      this.readContentItem(element, pieces, depth);
    }
    // Whitespace between elements is layout, not text.
    element.text = pieces.filter((piece) => piece.trim() !== "").join("");
  }

  private readContentItem(element: XmlElement, pieces: string[], depth: number): void {
    if (this.startsWith("<!--")) {
      this.skipComment();
    } else if (this.startsWith("<![CDATA[")) {
      pieces.push(this.readCdata());
    } else if (this.startsWith("<!DOCTYPE")) {
      this.refuseDoctype();
    } else if (this.startsWith("<?")) {
      this.refuseProcessingInstruction();
    } else if (this.startsWith("<")) {
      element.children.push(this.readElement(depth + 1));
    } else {
      pieces.push(this.readTextRun());
    }
  }

  private readElement(depth: number): XmlElement {
    const { element, selfClosing } = this.readStartTag(depth);
    if (!selfClosing) {
      this.readContent(element, depth);
    }
    return element;
  }

  readDocument(): XmlElement {
    this.readDeclaration();
    this.skipMisc();
    const root = this.readElement(1);
    this.skipMisc();
    if (this.position < this.text.length) {
      this.fail("malformed", "Content follows the root element.");
    }
    return root;
  }

  readRootStartTag(): XmlElement {
    this.readDeclaration();
    this.skipMisc();
    return this.readStartTag(1).element;
  }
}

function problemOf(error: unknown): XmlProblem {
  if (error instanceof XmlStop) {
    return { code: error.code, message: error.message };
  }
  throw error;
}

function tooLarge(text: string): XmlProblem | null {
  return text.length > XML_LIMITS.maxTextLength
    ? {
        code: "too_large",
        message: `The file is larger than ${XML_LIMITS.maxTextLength} characters.`,
      }
    : null;
}

/** Reads a whole document; the tree is checked by its Zod schema before it is returned. */
export function readXmlSubset(text: string): XmlReadResult {
  const problem = tooLarge(text);
  if (problem !== null) {
    return { ok: false, problem };
  }
  try {
    const root = new XmlReader(text).readDocument();
    const checked = XmlElementSchema.safeParse(root);
    return checked.success
      ? { ok: true, root: checked.data }
      : { ok: false, problem: { code: "malformed", message: "The XML tree is not valid." } };
  } catch (error) {
    return { ok: false, problem: problemOf(error) };
  }
}

/**
 * The root's start tag alone (its name and attributes, no children), for a format
 * to recognise its file without reading all of it; null when there is no start tag
 * or the prolog is refused.
 */
export function peekXmlRoot(text: string): XmlElement | null {
  if (tooLarge(text) !== null) {
    return null;
  }
  try {
    return new XmlReader(text).readRootStartTag();
  } catch (error) {
    // Not XML, or a refused prolog: no root. Any other error is a bug and goes up.
    problemOf(error);
    return null;
  }
}
