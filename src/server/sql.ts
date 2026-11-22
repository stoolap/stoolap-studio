// Reading statements as Stoolap Desktop's sql_utils.rs does. Desktop reads
// them with the engine's own lexer; here strings, quoted names and comments
// are matched with the engine's rules (the same ones lib/sql-utils.ts
// splits by, checked against the engine in sql.test.ts).

/** A string, quoted name (group 1) or comment, read as the engine reads them */
const QUOTED_OR_COMMENT =
  /('(?:[^'\\]|\\[\s\S]|'')*'|"(?:[^"]|"")*"|`(?:[^`]|``)*`)|(?:--|#)[^\n]*|\/\*[\s\S]*?(?:\*\/|$)/g;

/** Strip comments; each becomes a space, so `SELECT/*x*\/1` stays two words. */
export function stripComments(sql: string): string {
  return sql.replace(QUOTED_OR_COMMENT, (_, quoted?: string) => quoted ?? " ").trim();
}

/** The statement with strings and quoted names emptied and comments gone:
 *  what is left are its words and punctuation */
function code(sql: string): string {
  return sql
    .replace(QUOTED_OR_COMMENT, (_, quoted?: string) => (quoted ? quoted[0].repeat(2) : " "))
    .trim()
    .toUpperCase();
}

export type StatementType = "query" | "ddl" | "dml";

const DML = ["INSERT", "UPDATE", "DELETE", "MERGE", "UPSERT", "REPLACE"];

export function classifyStatement(sql: string): StatementType {
  const upper = sql.trimStart().toUpperCase();
  if (
    upper.startsWith("SELECT") ||
    upper.startsWith("SHOW") ||
    upper.startsWith("DESCRIBE") ||
    upper.startsWith("DESC ") ||
    upper.startsWith("EXPLAIN") ||
    upper.startsWith("PRAGMA")
  ) {
    return "query";
  }
  if (upper.startsWith("WITH")) {
    // DML with RETURNING returns its rows as a query
    const body = classifyWithBody(sql);
    return body === "dml" && hasReturning(sql) ? "query" : body;
  }
  if (
    ["CREATE", "DROP", "ALTER", "TRUNCATE", "BEGIN", "COMMIT", "ROLLBACK", "SAVEPOINT"].some((k) =>
      upper.startsWith(k),
    )
  ) {
    return "ddl";
  }
  // DML with RETURNING produces rows, which only a query returns (execute
  // reports 0 changes and drops them)
  return hasReturning(sql) ? "query" : "dml";
}

/** True when the statement changes rows, whatever it returns: an INSERT
 *  with RETURNING runs as a query but still needs a script's transaction. */
export function modifiesData(sql: string): boolean {
  const upper = sql.trimStart().toUpperCase();
  if (upper.startsWith("WITH")) return classifyWithBody(sql) === "dml";
  return DML.some((k) => upper.startsWith(k));
}

/** True if RETURNING appears as a word, not in a string or quoted name */
export function hasReturning(sql: string): boolean {
  return /\bRETURNING\b/.test(code(sql));
}

/** A WITH statement's kind: the first top-level SELECT/INSERT/... after its CTEs */
function classifyWithBody(sql: string): StatementType {
  let depth = 0;
  for (const token of code(sql).match(/[()]|[A-Z_][A-Z0-9_]*/g) ?? []) {
    if (token === "(") depth++;
    else if (token === ")") depth--;
    else if (depth === 0 && token === "SELECT") return "query";
    else if (depth === 0 && DML.includes(token)) return "dml";
  }
  // Couldn't identify: treat as a query (a read-only assumption won't run
  // DML under a forgotten transaction wrapper)
  return "query";
}

/** BEGIN, COMMIT, ROLLBACK (to a savepoint or not), or neither */
export function transactionControl(sql: string): "begin" | "commit" | "rollback" | "rollbackTo" | null {
  const words = code(sql).split(/\s+/);
  if (words[0] === "BEGIN" || (words[0] === "START" && words[1] === "TRANSACTION")) return "begin";
  if (words[0] === "COMMIT" || words[0] === "END") return "commit";
  if (words[0] === "ROLLBACK") return words.includes("TO") ? "rollbackTo" : "rollback";
  return null;
}
