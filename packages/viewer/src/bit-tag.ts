// A bit tag travels as a number: the core writes 0 or 1, a forced or analogue
// value can land in between. Every part of the viewer reads "on" the same way,
// so the 3D view, the tree, the diagram and the panels never disagree.

const BIT_ON_THRESHOLD = 0.5;

export function isBitOn(value: number): boolean {
  return value >= BIT_ON_THRESHOLD;
}
