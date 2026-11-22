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
 * Generate DROP TABLE statements for tables given in dependency order
 * (referenced tables first). Drops run in reverse, so a table is dropped only
 * after every table whose foreign key references it: Stoolap 0.5.0 refuses to
 * drop a table that is still referenced.
 */
export function generateTableDrops(tablesInDependencyOrder: string[]): string {
  if (tablesInDependencyOrder.length === 0) return "";
  const lines = [...tablesInDependencyOrder]
    .reverse()
    .map((t) => `DROP TABLE IF EXISTS ${quoteId(t)};`);
  return lines.join("\n") + "\n\n";
}

/**
 * Generate CREATE INDEX statements for a table.
 * Handles multi-column indexes (columnName = "(a, b)"), HNSW, and unique indexes.
 * Skips auto-created primary key (pk_*) indexes. Uses IF NOT EXISTS because
 * CREATE TABLE already recreates the UNIQUE (unique_*) and FOREIGN KEY (fk_*)
 * indexes that SHOW INDEXES lists.
 */
export function generateTableIndexes(
  tableName: string,
  indexes: {
    indexName: string;
    columnName: string;
    columns: string[];
    indexType: string;
    isUnique: boolean;
    options?: string;
  }[],
): string {
  const lines: string[] = [];
  const seen = new Set<string>();

  for (const idx of indexes) {
    // Skip primary key auto-indexes (recreated by DDL)
    if (idx.indexName.startsWith("pk_")) continue;
    // Deduplicate by index name
    if (seen.has(idx.indexName)) continue;
    seen.add(idx.indexName);

    // The indexed columns, as db_indexes parsed them (a name may hold a comma)
    const columnList = idx.columns.map(quoteId).join(", ");

    const isHnsw = idx.indexType.toUpperCase() === "HNSW";
    if (isHnsw) {
      // Parse options like "metric=cosine, m=16, ef_construction=128"
      let withClause = "";
      if (idx.options) {
        const opts: string[] = [];
        for (const part of idx.options.split(",").map((s) => s.trim())) {
          const [key, val] = part.split("=").map((s) => s.trim());
          if (key === "metric") opts.push(`metric = '${val}'`);
          else if (key === "m") opts.push(`m = ${val}`);
          else if (key === "ef_construction") opts.push(`ef_construction = ${val}`);
        }
        if (opts.length > 0) withClause = ` WITH (${opts.join(", ")})`;
      }
      lines.push(
        `CREATE INDEX IF NOT EXISTS ${quoteId(idx.indexName)} ON ${quoteId(tableName)}(${columnList}) USING HNSW${withClause};`,
      );
    } else {
      const unique = idx.isUnique ? "UNIQUE " : "";
      // Keep the index type explicit: the default for TEXT columns changed
      // from HASH to BTREE in Stoolap 0.5.0. MULTICOLUMN is not a USING type.
      const type = idx.indexType.toUpperCase();
      const using =
        type === "BTREE" || type === "HASH" || type === "BITMAP"
          ? ` USING ${type}`
          : "";
      lines.push(
        `CREATE ${unique}INDEX IF NOT EXISTS ${quoteId(idx.indexName)} ON ${quoteId(tableName)}(${columnList})${using};`,
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
