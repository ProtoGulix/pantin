import { describe, expect, it } from "vitest";
import { peekXmlRoot, readXmlSubset, XML_LIMITS } from "./xml-subset.ts";
import { attributeOf, childrenNamed, type XmlElement } from "./xml-tree.ts";

function rootOf(text: string): XmlElement {
  const result = readXmlSubset(text);
  if (!result.ok) {
    throw new Error(result.problem.message);
  }
  return result.root;
}

function problemOf(text: string) {
  const result = readXmlSubset(text);
  if (result.ok) {
    throw new Error("The reader accepted the text.");
  }
  return result.problem;
}

describe("what the reader reads", () => {
  it("reads the declaration, nested elements, attributes and text", () => {
    const root = rootOf(
      `<?xml version="1.0" encoding="utf-8"?>\n<a id='1' name="x y"><b>hello</b><c/></a>`,
    );
    expect(root.name).toBe("a");
    expect(attributeOf(root, "id")).toBe("1");
    expect(attributeOf(root, "name")).toBe("x y");
    expect(root.children.map((child) => child.name)).toEqual(["b", "c"]);
    expect(childrenNamed(root, "b")[0]?.text).toBe("hello");
  });

  it("skips a byte order mark and reads the file with no declaration", () => {
    expect(rootOf("﻿<a/>").name).toBe("a");
  });

  it("reads the five entities and the character references, in text and attributes", () => {
    const root = rootOf(`<a v="&lt;&amp;&#65;&#x42;">&lt;&gt;&amp;&quot;&apos;&#233;</a>`);
    expect(attributeOf(root, "v")).toBe("<&AB");
    expect(root.text).toBe(`<>&"'é`);
  });

  it("keeps CDATA as it is and drops comments", () => {
    const root = rootOf("<a><!-- ignored -->before <![CDATA[<b>&amp;</b>]]> after</a>");
    expect(root.text).toBe("before <b>&amp;</b> after");
    expect(root.children).toEqual([]);
  });

  it("keeps the line ends of a text as one newline and ignores the layout between elements", () => {
    const root = rootOf("<a>\r\n  <b>one\r\ntwo</b>\r\n</a>");
    expect(root.text).toBe("");
    expect(childrenNamed(root, "b")[0]?.text).toBe("one\ntwo");
  });

  it("reads an attribute named __proto__ as plain data", () => {
    const root = rootOf(`<a __proto__="1"/>`);
    expect(attributeOf(root, "__proto__")).toBe("1");
  });

  it("allows comments before and after the root", () => {
    expect(rootOf("<!-- one --><a/><!-- two -->\n").name).toBe("a");
  });
});

describe("what the reader refuses", () => {
  it("refuses a DOCTYPE, so no entity can be declared", () => {
    const text = `<?xml version="1.0"?><!DOCTYPE a [<!ENTITY x "boom">]><a>&x;</a>`;
    expect(problemOf(text).code).toBe("doctype_refused");
  });

  it("refuses a DOCTYPE inside an element too", () => {
    expect(problemOf("<a><!DOCTYPE a></a>").code).toBe("doctype_refused");
  });

  it("refuses an entity the five predefined ones do not cover", () => {
    const problem = problemOf("<a>&nbsp;</a>");
    expect(problem.code).toBe("entity_refused");
    expect(problem.message).toContain("&nbsp;");
  });

  it("refuses a character reference to a character XML forbids", () => {
    expect(problemOf("<a>&#0;</a>").code).toBe("entity_refused");
    expect(problemOf("<a>&#xD800;</a>").code).toBe("entity_refused");
  });

  it("refuses a processing instruction, at the start, inside or after the root", () => {
    expect(problemOf(`<?xml-stylesheet href="x"?><a/>`).code).toBe(
      "processing_instruction_refused",
    );
    expect(problemOf("<a><?php echo 1 ?></a>").code).toBe("processing_instruction_refused");
    expect(problemOf("<a/><?x?>").code).toBe("processing_instruction_refused");
  });
});

describe("what the reader refuses, encodings and malformed text", () => {
  it("refuses an encoding other than UTF-8 and says how to fix it", () => {
    const problem = problemOf(`<?xml version="1.0" encoding="UTF-16"?><a/>`);
    expect(problem.code).toBe("encoding_refused");
    expect(problem.message).toContain("UTF-8");
  });

  it("accepts the encoding name in any case", () => {
    expect(rootOf(`<?xml version="1.0" encoding="UTF-8"?><a/>`).name).toBe("a");
  });

  it.each([
    ["an unclosed element", "<a><b></a>"],
    ["a mismatched closing tag", "<a></b>"],
    ["content after the root", "<a/><b/>"],
    ["text after the root", "<a/>text"],
    ["an unquoted attribute", "<a x=1/>"],
    ["a duplicated attribute", `<a x="1" x="2"/>`],
    ["a bare ampersand", "<a>fish & chips</a>"],
    ["an unclosed comment", "<a><!-- never"],
    ["an unclosed CDATA", "<a><![CDATA[never</a>"],
    ["a less-than sign in an attribute", `<a x="<"/>`],
    ["an empty text", ""],
    ["no space between attributes", `<a x="1"y="2"/>`],
  ])("refuses %s as malformed", (_label, text) => {
    expect(problemOf(text).code).toBe("malformed");
  });

  it("says where the problem is", () => {
    expect(problemOf("<a>\n  <b>\n</a>").message).toMatch(/line 3, column/);
  });

  it("reads UTF-16 text mangled into UTF-8 as garbage, not as a document", () => {
    expect(problemOf("<\u0000a\u0000/\u0000>").code).toBe("malformed");
  });
});

describe("limits", () => {
  it("accepts the maximum depth and refuses one more level", () => {
    const nested = (depth: number) => "<a>".repeat(depth) + "</a>".repeat(depth);
    expect(readXmlSubset(nested(XML_LIMITS.maxDepth)).ok).toBe(true);
    expect(problemOf(nested(XML_LIMITS.maxDepth + 1)).code).toBe("too_deep");
  });

  it("accepts the maximum number of elements and refuses one more", () => {
    const flat = (count: number) => `<r>${"<e/>".repeat(count - 1)}</r>`;
    expect(readXmlSubset(flat(XML_LIMITS.maxElements)).ok).toBe(true);
    expect(problemOf(flat(XML_LIMITS.maxElements + 1)).code).toBe("too_many_elements");
  });

  it("refuses a text over the size limit before reading it", () => {
    const text = `<a>${"x".repeat(XML_LIMITS.maxTextLength)}</a>`;
    expect(problemOf(text).code).toBe("too_large");
  });
});

describe("peekXmlRoot", () => {
  it("reads the root start tag without reading the rest", () => {
    const root = peekXmlRoot(`<?xml version="1.0"?><a xmlns="urn:x"><b></a>`);
    expect(root?.name).toBe("a");
    expect(attributeOf(root ?? { name: "", attributes: [], children: [], text: "" }, "xmlns")).toBe(
      "urn:x",
    );
  });

  it("answers null for what is not XML or has a refused prolog", () => {
    expect(peekXmlRoot("not xml")).toBeNull();
    expect(peekXmlRoot(`<!DOCTYPE a><a/>`)).toBeNull();
    expect(peekXmlRoot("")).toBeNull();
  });
});

describe("attributes and control characters", () => {
  const withAttributes = (count: number) =>
    `<a ${Array.from({ length: count }, (_, index) => `n${index}="1"`).join(" ")}/>`;

  it("accepts the maximum number of attributes on a tag and refuses one more", () => {
    expect(readXmlSubset(withAttributes(XML_LIMITS.maxAttributesPerElement)).ok).toBe(true);
    expect(problemOf(withAttributes(XML_LIMITS.maxAttributesPerElement + 1)).message).toContain(
      "attributes",
    );
  });

  it("refuses a raw control character in text, an attribute value or CDATA", () => {
    expect(problemOf("<a>x\u0001y</a>").message).toContain("U+0001");
    expect(problemOf('<a v="x\u0000"/>').code).toBe("malformed");
    expect(problemOf("<a><![CDATA[\u001f]]></a>").code).toBe("malformed");
  });

  it("keeps tab, line feed and carriage return", () => {
    expect(rootOf("<a>x\ty\nz\r\n</a>").text).toBe("x\ty\nz\n");
  });
});
