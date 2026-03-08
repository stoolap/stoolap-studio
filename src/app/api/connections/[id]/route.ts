import { NextRequest, NextResponse } from "next/server";
import { dbManager } from "@/lib/db-manager";
import { safeErrorMessage } from "@/lib/sql-utils";

export const dynamic = "force-dynamic";

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    await dbManager.close(id);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json(
      { error: safeErrorMessage(e, "Failed to close") },
      { status: 400 },
    );
  }
}
