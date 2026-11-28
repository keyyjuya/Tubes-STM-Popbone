/**
 * Palet warna PopBone.
 * Semua warna visual (CSS & canvas) diturunkan dari daftar ini.
 */
export const PALETTE = {
  cream: "#fff7e6",
  pink: "#f7c8d3",
  rose: "#b46a72",
  sage: "#a8b58a",
  steel: "#a9b7c6",
  slate: "#2d3a47",
};

export const BUBBLE_COLORS = [
  PALETTE.pink,
  PALETTE.rose,
  PALETTE.sage,
  PALETTE.steel,
];

export function hexToRgb(hex) {
  const h = hex.replace("#", "");
  const full =
    h.length === 3
      ? h
          .split("")
          .map((c) => c + c)
          .join("")
      : h;
  const n = parseInt(full, 16);
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
}

export function rgba(hex, alpha = 1) {
  const { r, g, b } = hexToRgb(hex);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

export function rgbTriplet(hex) {
  const { r, g, b } = hexToRgb(hex);
  return `${r},${g},${b}`;
}

export function mix(hexA, hexB, t) {
  const a = hexToRgb(hexA);
  const b = hexToRgb(hexB);
  const toHex = (v) => Math.round(v).toString(16).padStart(2, "0");
  const r = Math.round(a.r + (b.r - a.r) * t);
  const g = Math.round(a.g + (b.g - a.g) * t);
  const bl = Math.round(a.b + (b.b - a.b) * t);
  return `#${toHex(r)}${toHex(g)}${toHex(bl)}`;
}
