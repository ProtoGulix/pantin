// Sizes of the chain diagram, in diagram units. A node has one fixed width, so
// that columns line up whatever the labels: the renderer truncates a long label
// and shows the full one as a tooltip.

export const NODE_WIDTH = 160;
export const COLUMN_GAP = 80;
export const MARGIN = 16;
const COLUMN_COUNT = 4;

// A node: a title line, then one line per socket.
export const NODE_TITLE_HEIGHT = 28;
export const SOCKET_PITCH = 18;
export const NODE_BOTTOM_PADDING = 8;
export const MIN_ROW_GAP = 12;
// A row is at least this high, so that a band of small nodes stays airy.
export const MIN_ROW_PITCH = 60;

// A band: its header line, and the space kept around its rows.
export const BAND_HEADER_HEIGHT = 28;
export const BAND_PADDING = 8;
export const BAND_GAP = 8;

export const DIAGRAM_WIDTH =
  2 * MARGIN + COLUMN_COUNT * NODE_WIDTH + (COLUMN_COUNT - 1) * COLUMN_GAP;

/** Left edge of a column. */
export function columnX(column: number): number {
  return MARGIN + column * (NODE_WIDTH + COLUMN_GAP);
}
