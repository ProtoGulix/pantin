import { resolveReference } from "./xml-entities.ts";

// The position in the text, the errors, and the lexical pieces (names, quoted
// values, comments, CDATA, text) that the XML subset reader is made of.

export type XmlProblemCode =
  | "malformed"
  | "doctype_refused"
  | "processing_instruction_refused"
  | "encoding_refused"
  | "entity_refused"
  | "too_large"
  | "too_deep"
  | "too_many_elements";

// Thrown inside the reader and turned into a result at its two entry points.
export class XmlStop extends Error {
  readonly code: XmlProblemCode;

  constructor(code: XmlProblemCode, message: string) {
    super(message);
    this.code = code;
  }
}

const NAME = /[\p{L}_:][\p{L}\p{N}_:.-]*/uy;
const WHITESPACE = /[ \t\n\r]*/y;
const BYTE_ORDER_MARK = "﻿";

export class XmlCursor {
  protected position = 0;
  protected readonly text: string;

  constructor(source: string) {
    // A byte order mark is not content; line ends are one "\n" for XML.
    const withoutMark = source.startsWith(BYTE_ORDER_MARK) ? source.slice(1) : source;
    this.text = withoutMark.replace(/\r\n?/g, "\n");
  }

  protected fail(code: XmlProblemCode, message: string): never {
    const before = this.text.slice(0, this.position);
    const line = before.split("\n").length;
    const column = this.position - (before.lastIndexOf("\n") + 1) + 1;
    throw new XmlStop(code, `${message} (line ${line}, column ${column})`);
  }

  protected startsWith(prefix: string): boolean {
    return this.text.startsWith(prefix, this.position);
  }

  protected skipWhitespace(): boolean {
    WHITESPACE.lastIndex = this.position;
    const matched = WHITESPACE.exec(this.text)?.[0] ?? "";
    this.position += matched.length;
    return matched.length > 0;
  }

  protected expect(token: string): void {
    if (!this.startsWith(token)) {
      this.fail("malformed", `Expected "${token}".`);
    }
    this.position += token.length;
  }

  protected readName(): string {
    NAME.lastIndex = this.position;
    const name = NAME.exec(this.text)?.[0];
    if (name === undefined) {
      this.fail("malformed", "Expected a name.");
    }
    this.position += name.length;
    return name;
  }

  // The Char production of XML: below U+0020 only tab, line feed and carriage return are text.
  protected refuseControlCharacters(raw: string): void {
    for (let index = 0; index < raw.length; index += 1) {
      const code = raw.charCodeAt(index);
      if (code < 0x20 && code !== 0x9 && code !== 0xa && code !== 0xd) {
        this.fail(
          "malformed",
          `A control character (U+${code.toString(16).toUpperCase().padStart(4, "0")}) is not allowed in XML text.`,
        );
      }
    }
  }

  protected decode(raw: string): string {
    this.refuseControlCharacters(raw);
    return raw.replace(/&([^&;\s]*)(;?)/g, (_match, body: string, semicolon: string) => {
      if (semicolon === "") {
        return this.fail("malformed", 'A "&" must start a reference that ends with ";".');
      }
      const resolved = resolveReference(body);
      return "problem" in resolved ? this.fail("entity_refused", resolved.problem) : resolved.text;
    });
  }

  protected skipComment(): void {
    const end = this.text.indexOf("-->", this.position + 4);
    if (end === -1) {
      this.fail("malformed", "A comment is never closed.");
    }
    this.position = end + 3;
  }

  protected refuseDoctype(): never {
    return this.fail("doctype_refused", "A DOCTYPE is refused: it could declare entities.");
  }

  protected refuseProcessingInstruction(): never {
    return this.fail(
      "processing_instruction_refused",
      "Processing instructions are refused: only the XML declaration at the very start is read.",
    );
  }

  protected readAttributeValue(): string {
    const quote = this.text[this.position];
    if (quote !== '"' && quote !== "'") {
      this.fail("malformed", "An attribute value must be quoted.");
    }
    const end = this.text.indexOf(quote, this.position + 1);
    if (end === -1) {
      this.fail("malformed", "An attribute value is never closed.");
    }
    const raw = this.text.slice(this.position + 1, end);
    if (raw.includes("<")) {
      this.fail("malformed", 'An attribute value cannot hold "<".');
    }
    // Normalised before the references are decoded, as XML says.
    const value = this.decode(raw.replace(/[\t\n]/g, " "));
    this.position = end + 1;
    return value;
  }

  protected readCdata(): string {
    const start = this.position + "<![CDATA[".length;
    const end = this.text.indexOf("]]>", start);
    if (end === -1) {
      this.fail("malformed", "A CDATA section is never closed.");
    }
    this.position = end + 3;
    const content = this.text.slice(start, end);
    this.refuseControlCharacters(content);
    return content;
  }

  protected readTextRun(): string {
    const end = this.text.indexOf("<", this.position);
    const stop = end === -1 ? this.text.length : end;
    const decoded = this.decode(this.text.slice(this.position, stop));
    this.position = stop;
    return decoded;
  }
}
