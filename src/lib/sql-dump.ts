import { quoteId } from "./sql-utils";

export interface DumpOptions {
  tables: boolean;
  data: boolean;
  views: boolean;
  indexes: boolean;
  dropBeforeCreate: boolean;
}

export const DEFAULT_DUMP_OPTIONS: DumpOptions = {
  tables: true,
  data: true,
  views: true,
  indexes: true,
  dropBeforeCreate: true,
};

/**
 * Escape a value for use in a SQL INSERT statement.
 */
export function escapeSqlValue(value: unknown): string {
  if (value === null || value === undefined) return "NULL";
  if (typeof value === "boolean") return value ? "TRUE" : "FALSE";
  if (typeof value === "number")
    return isFinite(value) ? String(value) : "NULL";
  // Array (e.g. vector column returned as number[])
  if (Array.isArray(value)) {
    return `'[${value.join(", ")}]'`;
  }
  // Numeric-keyed object from stoolap (vector): {0: 0.1, 1: 0.2, ...}
  if (value && typeof value === "object") {
    const keys = Object.keys(value as Record<string, unknown>);
    const sorted = keys.sort((a, b) => Number(a) - Number(b));
    if (
      sorted.length > 0 &&
      sorted[0] === "0" &&
      sorted[sorted.length - 1] === String(keys.length - 1)
    ) {
      const vals = sorted.map(
        (k) => (value as Record<string, unknown>)[k],
      );
      if (vals.every((v) => typeof v === "number")) {
        return `'[${vals.join(", ")}]'`;
      }
    }
    // Fallback for other objects: JSON
    const json = JSON.stringify(value);
    return `'${json.replace(/'/g, "''")}'`;
  }
  const str = String(value);
  return `'${str.replace(/'/g, "''")}'`;
}

/**
 * Generate INSERT statements for rows. One INSERT per row.
 */
export function generateInserts(
  tableName: string,
  columns: string[],
  rows: unknown[][],
): string {
  if (rows.length === 0) return "";
  const quotedCols = columns.map(quoteId).join(", ");
  const lines: string[] = [];
  for (const row of rows) {
    const values = row.map(escapeSqlValue).join(", ");
    lines.push(
      `INSERT INTO ${quoteId(tableName)} (${quotedCols}) VALUES (${values});`,
    );
  }
  return lines.join("\n");
}

/**
 * Generate the SQL dump file header comment.
 */
export function generateHeader(connectionName: string): string {
  const dateStr = new Date().toISOString().slice(0, 19).replace("T", " ");
  return [
    "-- Stoolap Studio SQL Dump",
    `-- Database: ${connectionName}`,
    `-- Date: ${dateStr}`,
    "-- ---",
    "",
  ].join("\n");
}

/**
 * Detect vector dimensions from row data for a given column index.
 */
function detectVectorDims(rows: unknown[][], colIdx: number): number {
  for (const row of rows) {
    const val = row[colIdx];
    if (val == null) continue;
    if (Array.isArray(val)) return val.length;
    if (typeof val === "object") {
      return Object.keys(val as Record<string, unknown>).length;
    }
    if (typeof val === "string" && val.startsWith("[") && val.endsWith("]")) {
      return val.slice(1, -1).split(",").length;
    }
  }
  return 0;
}

/**
 * Patch bare `Vector` types in DDL with actual dimensions from data or
 * DESCRIBE column types.
 */
export function patchVectorDimensions(
  ddl: string,
  columns: string[],
  rows: unknown[][],
  columnTypes?: string[],
): string {
  // Quick check: does the DDL have a bare Vector without dimensions?
  if (!/\bVector\b(?!\s*\()/i.test(ddl)) return ddl;

  let patched = ddl;
  for (let i = 0; i < columns.length; i++) {
    // First try DESCRIBE type info (e.g. "Vector(128)")
    if (columnTypes?.[i]) {
      const m = columnTypes[i].match(/^Vector\((\d+)\)$/i);
      if (m) {
        const dims = m[1];
        const re = new RegExp(
          `(\\b${columns[i].replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s+)Vector\\b(?!\\s*\\()`,
          "i",
        );
        patched = patched.replace(re, `$1Vector(${dims})`);
        continue;
      }
    }
    // Fall back to detecting from row data
    const dims = detectVectorDims(rows, i);
    if (dims > 0) {
      const re = new RegExp(
        `(\\b${columns[i].replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s+)Vector\\b(?!\\s*\\()`,
        "i",
      );
      patched = patched.replace(re, `$1Vector(${dims})`);
    }
  }
  return patched;
}

/**
 * Generate the dump section for a single table.
 */
export function generateTableSection(
  tableName: string,
  ddl: string,
  columns: string[],
  rows: unknown[][],
  options: DumpOptions,
  columnTypes?: string[],
): string {
  const parts: string[] = [];
  parts.push(`-- Table: ${tableName}`);

  const patchedDdl = patchVectorDimensions(ddl, columns, rows, columnTypes);

  if (options.dropBeforeCreate) {
    parts.push(`DROP TABLE IF EXISTS ${quoteId(tableName)};`);
  }
  // DDL from SHOW CREATE TABLE does not end with semicolon
  parts.push(`${patchedDdl};`);
  parts.push("");

  if (options.data && rows.length > 0) {
    parts.push(generateInserts(tableName, columns, rows));
    parts.push("");
  }

  return parts.join("\n");
}

/**
 * Generate CREATE INDEX statements for a table.
 * Skips auto-created primary key (pk_*) and foreign key (fk_*) indexes.
 */
export function generateTableIndexes(
  tableName: string,
  indexes: {
    indexName: string;
    columnName: string;
    indexType: string;
    isUnique: boolean;
  }[],
): string {
  const lines: string[] = [];
  for (const idx of indexes) {
    // Skip auto-created indexes from constraints (PK, FK, UNIQUE column constraints)
    if (
      idx.indexName.startsWith("pk_") ||
      idx.indexName.startsWith("fk_") ||
      idx.indexName.startsWith("unique_")
    ) {
      continue;
    }
    const isHnsw = idx.indexType.toUpperCase() === "HNSW";
    if (isHnsw) {
      lines.push(
        `CREATE INDEX ${quoteId(idx.indexName)} ON ${quoteId(tableName)} (${quoteId(idx.columnName)}) USING HNSW;`,
      );
    } else {
      const unique = idx.isUnique ? "UNIQUE " : "";
      lines.push(
        `CREATE ${unique}INDEX ${quoteId(idx.indexName)} ON ${quoteId(tableName)} (${quoteId(idx.columnName)});`,
      );
    }
  }
  return lines.length > 0 ? lines.join("\n") + "\n" : "";
}

/**
 * Generate the dump section for a single view.
 */
export function generateViewSection(
  viewName: string,
  ddl: string,
  options: DumpOptions,
): string {
  const parts: string[] = [];
  parts.push(`-- View: ${viewName}`);

  if (options.dropBeforeCreate) {
    parts.push(`DROP VIEW IF EXISTS ${quoteId(viewName)};`);
  }
  parts.push(`${ddl};`);
  parts.push("");

  return parts.join("\n");
}
