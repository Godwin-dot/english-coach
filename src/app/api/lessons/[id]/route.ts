import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { db } from "@/db";
import { lessons } from "@/db/schema";

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: idParam } = await params;
  const id = Number(idParam);
  if (!/^[1-9]\d*$/u.test(idParam) || !Number.isSafeInteger(id) || id < 1) {
    return NextResponse.json({ error: "Identifiant de leçon invalide." }, { status: 400 });
  }

  const deleted = db.delete(lessons).where(eq(lessons.id, id)).returning({ id: lessons.id }).get();
  if (!deleted) {
    return NextResponse.json({ error: "Leçon introuvable." }, { status: 404 });
  }
  return NextResponse.json({ deleted: true, id: deleted.id });
}
