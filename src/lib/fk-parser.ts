import type { ForeignKeyInfo } from "./types";

/**
 * Parse FOREIGN KEY constraints from a SHOW CREATE TABLE DDL string.
 *
 * Expected format per constraint (from Stoolap's show.rs):
 *   FOREIGN KEY (column_name) REFERENCES referenced_table(referenced_column) ON DELETE action ON UPDATE action
 */
// Matches either a bare identifier (\w+) or a double-quoted identifier ("...")
const IDENT = `(?:"([^"]+)"|(\\w+))`;

export function parseForeignKeys(ddl: string): ForeignKeyInfo[] {
  const results: ForeignKeyInfo[] = [];
  const re = new RegExp(
    `FOREIGN\\s+KEY\\s*\\(${IDENT}\\)\\s*REFERENCES\\s+${IDENT}\\(${IDENT}\\)\\s+ON\\s+DELETE\\s+(RESTRICT|CASCADE|SET\\s+NULL|NO\\s+ACTION)\\s+ON\\s+UPDATE\\s+(RESTRICT|CASCADE|SET\\s+NULL|NO\\s+ACTION)`,
    "gi",
  );
  let match: RegExpExecArray | null;
  while ((match = re.exec(ddl)) !== null) {
    results.push({
      columnName: match[1] || match[2],
      referencedTable: match[3] || match[4],
      referencedColumn: match[5] || match[6],
      onDelete: normalize(match[7]),
      onUpdate: normalize(match[8]),
    });
  }
  return results;
}

function normalize(raw: string): string {
  return raw.toUpperCase().replace(/\s+/g, " ").trim();
}
