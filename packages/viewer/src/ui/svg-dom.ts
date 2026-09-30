// Builds SVG elements, which need their namespace: document.createElement would
// make unknown HTML elements that draw nothing.

const SVG_NAMESPACE = "http://www.w3.org/2000/svg";

export type SvgAttributes = Readonly<Record<string, string | number>>;

export function svgElement(
  tag: string,
  attributes: SvgAttributes,
  children: readonly (Node | string)[] = [],
): SVGElement {
  const created = document.createElementNS(SVG_NAMESPACE, tag);
  for (const [name, value] of Object.entries(attributes)) {
    created.setAttribute(name, String(value));
  }
  created.append(...children);
  return created;
}
