// The parts of a joint's arrow, as sizes along its own +Y axis (metres), apart
// from Babylon so that they run under Node in unit tests. A driven joint (an
// actuator moves it, ADR 0022) has the same blue as a free one (ADR 0057): a
// collar disc around the base of the shaft is what tells it apart.

export type ArrowPart =
  | { kind: "shaft"; height: number; diameter: number; centreY: number }
  | { kind: "head"; height: number; diameter: number; centreY: number }
  | { kind: "origin"; diameter: number; centreY: number }
  | { kind: "collar"; height: number; diameter: number; centreY: number };

export function planJointArrowParts(length: number, driven: boolean): ArrowPart[] {
  const headLength = length * 0.2;
  const shaftLength = length - headLength;
  const parts: ArrowPart[] = [
    { kind: "shaft", height: shaftLength, diameter: length * 0.02, centreY: shaftLength / 2 },
    {
      kind: "head",
      height: headLength,
      diameter: length * 0.07,
      centreY: shaftLength + headLength / 2,
    },
    { kind: "origin", diameter: length * 0.06, centreY: 0 },
  ];
  if (driven) {
    parts.push({
      kind: "collar",
      height: length * 0.02,
      diameter: length * 0.14,
      centreY: length * 0.12,
    });
  }
  return parts;
}
