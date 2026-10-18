// Colour maths shared by the colour tests (ADR 0057): WCAG contrast and the
// Machado 2009 colour-blindness simulation, on #rrggbb strings.

export const COLOUR_BLIND_MATRICES: Readonly<Record<string, number[][]>> = {
  protanopia: [
    [0.152286, 1.052583, -0.204868],
    [0.114503, 0.786281, 0.099216],
    [-0.003882, -0.048116, 1.051998],
  ],
  deuteranopia: [
    [0.367322, 0.860646, -0.227968],
    [0.280085, 0.672501, 0.047413],
    [-0.01182, 0.04294, 0.968881],
  ],
  tritanopia: [
    [1.255528, -0.076749, -0.178779],
    [-0.078411, 0.930809, 0.147602],
    [0.004733, 0.691367, 0.3039],
  ],
};

function channelLuminance(channel: number): number {
  const unit = channel / 255;
  return unit <= 0.03928 ? unit / 12.92 : ((unit + 0.055) / 1.055) ** 2.4;
}

/** WCAG relative luminance of a #rrggbb colour. */
function luminance(hex: string): number {
  const [red, green, blue] = [1, 3, 5].map((offset) =>
    channelLuminance(Number.parseInt(hex.slice(offset, offset + 2), 16)),
  );
  return 0.2126 * (red ?? 0) + 0.7152 * (green ?? 0) + 0.0722 * (blue ?? 0);
}

/** WCAG contrast ratio, 1 to 21, whichever colour is the lighter. */
export function contrast(foreground: string, background: string): number {
  const [lighter, darker] = [luminance(foreground), luminance(background)].sort((a, b) => b - a);
  return ((lighter ?? 0) + 0.05) / ((darker ?? 0) + 0.05);
}

function toLinear(hex: string): number[] {
  return [1, 3, 5].map((offset) => {
    const channel = Number.parseInt(hex.slice(offset, offset + 2), 16) / 255;
    return channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
  });
}

function toLab([red = 0, green = 0, blue = 0]: number[]): number[] {
  const clamp = (value: number) => Math.min(1, Math.max(0, value));
  const [r, g, b] = [clamp(red), clamp(green), clamp(blue)] as const;
  const f = (t: number) => (t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116);
  const x = f((0.4124 * r + 0.3576 * g + 0.1805 * b) / 0.95047);
  const y = f(0.2126 * r + 0.7152 * g + 0.0722 * b);
  const z = f((0.0193 * r + 0.1192 * g + 0.9505 * b) / 1.08883);
  return [116 * y - 16, 500 * (x - y), 200 * (y - z)];
}

/** CIE76 distance between two hex colours as seen with the given colour blindness. */
export function simulatedDifference(first: string, second: string, vision: string): number {
  const matrix = COLOUR_BLIND_MATRICES[vision] ?? [];
  const seen = (hex: string) => {
    const linear = toLinear(hex);
    return toLab(
      matrix.map((row) => row.reduce((sum, weight, i) => sum + weight * (linear[i] ?? 0), 0)),
    );
  };
  return Math.hypot(...seen(first).map((value, i) => value - (seen(second)[i] ?? 0)));
}
