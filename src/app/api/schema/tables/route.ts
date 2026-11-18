import { NextRequest, NextResponse } from "next/server";
import { dbManager } from "@/lib/db-manager";
import { safeErrorMessage } from "@/lib/sql-utils";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const connId = req.headers.get("X-Connection-Id");
  if (!connId || !dbManager.has(connId)) {
    return NextResponse.json(
      { error: "No active connection" },
      { status: 400 },
    );
  }
  try {
    const result = await dbManager.query(connId, "SHOW TABLES");
    // Hide the engine's statistics tables (_sys_table_stats, ... after ANALYZE)
    const tables = result.rows
      .map((r) => String(r[0]))
      .filter((t) => !t.startsWith("_sys_"));
    return NextResponse.json(tables);
  } catch (e) {
    return NextResponse.json(
      { error: safeErrorMessage(e, "Failed") },
      { status: 400 },
    );
  }
}
