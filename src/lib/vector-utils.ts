/** Detect columns that represent vector distance results */
export function isDistanceColumn(colName: string): boolean {
  const lower = colName.toLowerCase();
  return (
    lower === "distance" ||
    lower === "dist" ||
    lower.endsWith("_distance") ||
    lower.endsWith("_dist") ||
    lower.startsWith("dist_") ||
    lower === "_vec_dist" ||
    lower === "cosine_dist" ||
    lower === "l2_dist" ||
    lower === "ip_dist"
  );
}

/** Convert a numeric-keyed object {0: 0.42, 1: 0.38, ...} to "[0.42, 0.38, ...]" */
export function objectToVectorString(
  obj: Record<string, unknown>,
): string | null {
  const keys = Object.keys(obj);
  if (keys.length === 0) return null;
  const sorted = keys.sort((a, b) => Number(a) - Number(b));
  if (
    sorted[0] !== "0" ||
    sorted[sorted.length - 1] !== String(keys.length - 1)
  )
    return null;
  const vals = sorted.map((k) => obj[k]);
  if (vals.some((v) => typeof v !== "number")) return null;
  return `[${vals.join(", ")}]`;
}

/** Convert a vector value (string, array, or numeric-keyed object) to "[0.1, 0.2, ...]" */
export function formatVector(raw: unknown): string {
  if (typeof raw === "string") return raw;
  if (Array.isArray(raw)) return `[${raw.join(", ")}]`;
  if (raw && typeof raw === "object") {
    return (
      objectToVectorString(raw as Record<string, unknown>) ??
      JSON.stringify(raw)
    );
  }
  return String(raw);
}

/** Abbreviate a vector string like [0.1, 0.2, 0.3, ...] into a compact display */
export function formatVectorValue(str: string): string | null {
  const trimmed = str.trim();
  if (!trimmed.startsWith("[") || !trimmed.endsWith("]")) return null;
  const inner = trimmed.slice(1, -1);
  const parts = inner.split(",");
  if (parts.length < 2 || parts.some((p) => isNaN(Number(p.trim()))))
    return null;
  const dims = parts.length;
  if (dims <= 4) return trimmed;
  const first3 = parts
    .slice(0, 3)
    .map((p) => p.trim())
    .join(", ");
  return `[${first3}, \u2026 ${dims} dims]`;
}

/** Format a vector for expanded view with wrapped numbers */
export function formatVectorExpanded(str: string): string {
  const trimmed = str.trim();
  if (!trimmed.startsWith("[") || !trimmed.endsWith("]")) return str;
  const inner = trimmed.slice(1, -1);
  const parts = inner.split(",").map((p) => p.trim());
  if (parts.length < 2) return str;
  return (
    `[${parts.length} dimensions]\n\n` +
    parts.map((v, i) => `[${i}] ${v}`).join("\n")
  );
}

/** Validate a vector string for safe SQL interpolation */
export function isValidVectorLiteral(v: string): boolean {
  return /^\[[\d\s,.\-+eE]+\]$/.test(v.trim());
}
