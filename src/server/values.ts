// Values between the driver and the UI, as Stoolap Desktop's db.rs writes
// them: cells for the grid, and SQL literals for a backup.

/** Number.MAX_SAFE_INTEGER */
const MAX_SAFE = BigInt(Number.MAX_SAFE_INTEGER);

/** The shortest decimal that reads back as the same 32-bit float: how the
 *  engine writes a vector's components (0.1, not 0.10000000149011612) */
function f32(x: number): string {
  if (!Number.isFinite(x)) return String(x);
  for (let p = 1; p < 9; p++) {
    const s = Number(x.toPrecision(p));
    if (Math.fround(s) === x) return String(s);
  }
  return String(x);
}

/** A vector as the engine writes it: "[0.1, 2.5]" */
export function vectorText(v: Float32Array): string {
  return `[${Array.from(v, f32).join(", ")}]`;
}

/** A cell as the UI reads it */
export function toCell(v: unknown): unknown {
  if (v === null || v === undefined) return null;
  // JavaScript numbers hold integers exactly only up to 2^53; beyond that
  // the grid would show, edit and delete a rounded key, so those travel as
  // text (the engine reads text back into INTEGER columns)
  if (typeof v === "bigint") return v > MAX_SAFE || v < -MAX_SAFE ? v.toString() : Number(v);
  // JSON writes NaN and infinities as null, as Desktop does
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  if (v instanceof Date) return v.toISOString();
  if (v instanceof Float32Array) return vectorText(v);
  return v;
}

/** `s` as a SQL string literal the engine reads back exactly. It reads
 *  backslash escapes inside quotes (\n is a newline), so \ is doubled too. */
export function sqlString(s: string): string {
  return `'${s.replace(/\\/g, "\\\\").replace(/'/g, "''")}'`;
}

/** `v` as a SQL literal that restores it exactly: integers in full, JSON as
 *  its own text (so `null` and strings in a JSON column stay JSON, apart
 *  from SQL NULL and TEXT). */
export function sqlLiteral(v: unknown): string {
  if (v === null || v === undefined) return "NULL";
  if (typeof v === "bigint") return v.toString();
  if (typeof v === "number") return Number.isFinite(v) ? String(v) : "NULL";
  if (typeof v === "boolean") return v ? "TRUE" : "FALSE";
  if (v instanceof Date) return sqlString(v.toISOString());
  if (v instanceof Float32Array) return sqlString(vectorText(v));
  return sqlString(String(v));
}
