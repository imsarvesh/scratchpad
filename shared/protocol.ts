export const INK_COLORS = [
  "#1a1a1a",
  "#c45c26",
  "#2f6f6a",
  "#2c4a7c",
  "#a33b5a",
] as const;

export type InkColor = (typeof INK_COLORS)[number];
