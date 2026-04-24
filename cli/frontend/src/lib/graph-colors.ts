const COLORS: Record<string, string> = {
  folder: "#f2c26a",
  document: "#63d59d",
  unknown: "#94a3b8",
};

export function getGraphEntityColor(type: string) {
  return COLORS[type.toLowerCase()] ?? COLORS.unknown;
}
