import { NextRequest, NextResponse } from "next/server";
import { dbManager } from "@/lib/db-manager";
import { quoteId, safeErrorMessage } from "@/lib/sql-utils";
import type { ColumnInfo } from "@/lib/types";

export const dynamic = "force-dynamic";

function inferType(value: unknown): string {
  if (value === null || value === undefined) return "UNKNOWN";
  if (typeof value === "boolean") return "BOOLEAN";
  if (typeof value === "number")
    return Number.isInteger(value) ? "INTEGER" : "FLOAT";
  if (typeof value === "string") {
    // Check for ISO timestamp pattern
    if (/^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}/.test(value)) return "TIMESTAMP";
    // Check for JSON
    if (
      (value.startsWith("{") && value.endsWith("}")) ||
      (value.startsWith("[") && value.endsWith("]"))
    ) {
      try {
        JSON.parse(value);
        return "JSON";
      } catch {
        /* not JSON */
      }
    }
    return "TEXT";
  }
  return "";
}

export async function GET(req: NextRequest) {
  const connId = req.headers.get("X-Connection-Id");
  if (!connId || !dbManager.has(connId)) {
    return NextResponse.json(
      { error: "No active connection" },
      { status: 400 },
    );
  }
  const table = req.nextUrl.searchParams.get("table");
  if (!table) {
    return NextResponse.json({ error: "Missing table param" }, { status: 400 });
  }
  const type = req.nextUrl.searchParams.get("type") ?? "table";
  if (type !== "table" && type !== "view") {
    return NextResponse.json(
      { error: "Invalid type (must be 'table' or 'view')" },
      { status: 400 },
    );
  }
  try {
    const quotedName = quoteId(table);

    if (type === "view") {
      // DESCRIBE doesn't work on views — infer types from a sample row
      const result = await dbManager.query(
        connId,
        `SELECT * FROM ${quotedName} LIMIT 1`,
      );
      const sampleRow = result.rows[0] ?? null;
      const columns: ColumnInfo[] = result.columns.map(
        (col: string, i: number) => ({
          field: col,
          type: inferType(sampleRow ? sampleRow[i] : null),
          nullable: true,
          key: "",
          defaultValue: "",
          extra: "",
        }),
      );
      return NextResponse.json(columns);
    }

    const result = await dbManager.query(connId, `DESCRIBE ${quotedName}`);
    // Columns: Field, Type, Null, Key, Default, Extra
    const columns: ColumnInfo[] = result.rows.map((r) => ({
      field: String(r[0] ?? ""),
      type: String(r[1] ?? ""),
      nullable: String(r[2] ?? "YES") === "YES",
      key: String(r[3] ?? ""),
      defaultValue: String(r[4] ?? ""),
      extra: String(r[5] ?? ""),
    }));
    return NextResponse.json(columns);
  } catch (e) {
    return NextResponse.json(
      { error: safeErrorMessage(e, "Failed") },
      { status: 400 },
    );
  }
}
