import { NextRequest, NextResponse } from "next/server";
import { dbManager } from "@/lib/db-manager";
import { splitStatements, safeErrorMessage } from "@/lib/sql-utils";

export const dynamic = "force-dynamic";

/**
 * Strip SQL comments: full-line --, inline --, and block comments.
 * Preserves -- and /* inside string literals and double-quoted identifiers.
 */
function stripComments(sql: string): string {
  let result = "";
  let i = 0;
  while (i < sql.length) {
    // Single-quoted string
    if (sql[i] === "'") {
      result += sql[i++];
      while (i < sql.length) {
        if (sql[i] === "'" && sql[i + 1] === "'") {
          result += "''";
          i += 2;
        } else if (sql[i] === "'") {
          result += sql[i++];
          break;
        } else {
          result += sql[i++];
        }
      }
      continue;
    }
    // Double-quoted identifier
    if (sql[i] === '"') {
      result += sql[i++];
      while (i < sql.length) {
        if (sql[i] === '"' && sql[i + 1] === '"') {
          result += '""';
          i += 2;
        } else if (sql[i] === '"') {
          result += sql[i++];
          break;
        } else {
          result += sql[i++];
        }
      }
      continue;
    }
    // Line comment
    if (sql[i] === "-" && sql[i + 1] === "-") {
      while (i < sql.length && sql[i] !== "\n") i++;
      continue;
    }
    // Block comment
    if (sql[i] === "/" && sql[i + 1] === "*") {
      i += 2;
      while (i < sql.length && !(sql[i] === "*" && sql[i + 1] === "/")) i++;
      if (i + 1 < sql.length) i += 2; // skip */ only if present
      continue;
    }
    result += sql[i++];
  }
  return result.trim();
}

function classifyStatement(upper: string): "query" | "ddl" | "dml" {
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
  // WITH CTEs: scan for the final top-level keyword after the CTE block
  if (upper.startsWith("WITH")) {
    // Find the keyword after all CTE definitions by tracking parenthesis depth
    // Note: operates on already-comment-stripped, uppercased SQL
    let depth = 0;
    let j = 4; // skip "WITH"
    let foundFirstParen = false;
    while (j < upper.length) {
      // Skip single-quoted string literals (parens inside strings don't count)
      if (upper[j] === "'") {
        j++;
        while (j < upper.length) {
          if (upper[j] === "'" && upper[j + 1] === "'") {
            j += 2;
          } else if (upper[j] === "'") {
            j++;
            break;
          } else {
            j++;
          }
        }
        continue;
      }
      if (upper[j] === "(") {
        depth++;
        foundFirstParen = true;
      } else if (upper[j] === ")") {
        depth--;
      }
      // When we return to depth 0 after entering parens, check what follows
      if (foundFirstParen && depth === 0 && upper[j] === ")") {
        j++;
        // Skip whitespace and optional comma (for multiple CTEs)
        while (j < upper.length && /[\s,]/.test(upper[j])) j++;
        // Check for the final keyword (with word boundary to avoid matching CTE names like SELECT_BASE)
        const rest = upper.slice(j);
        if (
          /^(SELECT|INSERT|UPDATE|DELETE|CREATE|DROP|ALTER)(\s|$)/.test(rest)
        ) {
          if (/^(INSERT|UPDATE|DELETE)(\s|$)/.test(rest)) return "dml";
          if (/^(CREATE|DROP|ALTER)(\s|$)/.test(rest)) return "ddl";
          return "query";
        }
        // Otherwise it might be another CTE name — keep scanning
      }
      j++;
    }
    return "query";
  }
  if (
    upper.startsWith("CREATE") ||
    upper.startsWith("DROP") ||
    upper.startsWith("ALTER") ||
    upper.startsWith("TRUNCATE") ||
    upper.startsWith("VACUUM") ||
    upper.startsWith("BEGIN") ||
    upper.startsWith("COMMIT") ||
    upper.startsWith("ROLLBACK") ||
    upper.startsWith("SAVEPOINT")
  ) {
    return "ddl";
  }
  return "dml";
}

export async function POST(req: NextRequest) {
  const connId = req.headers.get("X-Connection-Id");
  if (!connId || !dbManager.has(connId)) {
    return NextResponse.json(
      { error: "No active connection" },
      { status: 400 },
    );
  }

  try {
    const { sql } = await req.json();
    if (typeof sql !== "string") {
      return NextResponse.json({ error: "Invalid query" }, { status: 400 });
    }
    if (sql.length > 2_000_000) {
      return NextResponse.json(
        { error: "SQL too large (max 2MB)" },
        { status: 400 },
      );
    }
    if (!sql.trim()) {
      return NextResponse.json({ error: "Empty query" }, { status: 400 });
    }

    const cleaned = stripComments(sql);
    if (!cleaned) {
      return NextResponse.json({ error: "Empty query" }, { status: 400 });
    }

    const statements = splitStatements(cleaned);
    if (statements.length === 0) {
      return NextResponse.json({ error: "Empty query" }, { status: 400 });
    }

    // Single statement: fast path
    if (statements.length === 1) {
      return await executeSingle(connId, statements[0]);
    }

    // Multiple statements: wrap DML in transaction, but skip if user has explicit transaction control
    const start = performance.now();
    const classified = statements.map((s) => ({
      sql: s,
      type: classifyStatement(s.trimStart().toUpperCase()),
    }));
    const hasExplicitTxn = classified.some(({ sql }) => {
      const u = sql.trimStart().toUpperCase();
      return (
        u.startsWith("BEGIN") ||
        u.startsWith("COMMIT") ||
        u.startsWith("ROLLBACK") ||
        u.startsWith("SAVEPOINT")
      );
    });
    const hasDML =
      !hasExplicitTxn && classified.some(({ type }) => type === "dml");
    if (hasDML) {
      await dbManager.execute(connId, "BEGIN");
    }

    let completed = 0;
    try {
      for (let i = 0; i < statements.length - 1; i++) {
        const stmt = statements[i];
        const type = classifyStatement(stmt.trimStart().toUpperCase());
        try {
          if (type === "query") {
            await dbManager.query(connId, stmt);
          } else {
            await dbManager.execute(connId, stmt);
          }
          completed++;
        } catch (e) {
          const msg = safeErrorMessage(e, "Query failed");
          throw new Error(
            `Statement ${i + 1} of ${statements.length} failed: ${msg}${completed > 0 ? ` (${completed} statement${completed !== 1 ? "s" : ""} succeeded before this)` : ""}`,
          );
        }
      }

      // Execute and return result of the last statement
      const lastResult = await executeSingle(
        connId,
        statements[statements.length - 1],
        start,
      );

      if (hasDML) {
        await dbManager.execute(connId, "COMMIT");
      }
      return lastResult;
    } catch (e) {
      if (hasDML) {
        try {
          await dbManager.execute(connId, "ROLLBACK");
        } catch {
          /* ignore rollback errors */
        }
      }
      return NextResponse.json(
        { error: safeErrorMessage(e, "Query failed") },
        { status: 400 },
      );
    }
  } catch (e) {
    return NextResponse.json(
      { error: safeErrorMessage(e, "Query failed") },
      { status: 500 },
    );
  }
}

async function executeSingle(
  connId: string,
  stmt: string,
  startOverride?: number,
) {
  const start = startOverride ?? performance.now();
  const upper = stmt.trimStart().toUpperCase();
  const type = classifyStatement(upper);

  if (type === "query") {
    const result = await dbManager.query(connId, stmt);
    const time = Math.round((performance.now() - start) * 100) / 100;
    return NextResponse.json({
      columns: result.columns,
      rows: result.rows,
      time,
    });
  }

  if (type === "ddl") {
    await dbManager.execute(connId, stmt);
    const time = Math.round((performance.now() - start) * 100) / 100;
    const words = stmt.trimStart().split(/\s+/);
    const ddlType = `${words[0]} ${words[1] ?? ""}`.toUpperCase().trim();
    return NextResponse.json({ ddl: ddlType, time });
  }

  // DML
  const result = await dbManager.execute(connId, stmt);
  const time = Math.round((performance.now() - start) * 100) / 100;
  return NextResponse.json({ changes: result.changes, time });
}
