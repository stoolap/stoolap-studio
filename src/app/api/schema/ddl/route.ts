import { NextRequest, NextResponse } from "next/server";
import { dbManager } from "@/lib/db-manager";
import { quoteId, safeErrorMessage } from "@/lib/sql-utils";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const connId = req.headers.get("X-Connection-Id");
  if (!connId || !dbManager.has(connId)) {
    return NextResponse.json(
      { error: "No active connection" },
      { status: 400 },
    );
  }
  const table = req.nextUrl.searchParams.get("table");
  const view = req.nextUrl.searchParams.get("view");
  if (!table && !view) {
    return NextResponse.json(
      { error: "Missing table or view param" },
      { status: 400 },
    );
  }
  try {
    const name = table ?? view;
    const quotedName = quoteId(name as string);
    const sql = table
      ? `SHOW CREATE TABLE ${quotedName}`
      : `SHOW CREATE VIEW ${quotedName}`;
    const start = performance.now();
    const result = await dbManager.query(connId, sql);
    const time = Math.round((performance.now() - start) * 100) / 100;
    const ddl = result.rows.length > 0 ? String(result.rows[0][1] ?? "") : "";
    return NextResponse.json({ ddl, time });
  } catch (e) {
    return NextResponse.json(
      { error: safeErrorMessage(e, "Failed") },
      { status: 400 },
    );
  }
}
