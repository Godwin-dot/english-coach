import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { db } from "@/db";
import { cards } from "@/db/schema";

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: idParam } = await params;
  const id = Number(idParam);
  if (!/^[1-9]\d*$/u.test(idParam) || !Number.isSafeInteger(id) || id < 1) {
    return NextResponse.json({ error: "Identifiant de carte invalide." }, { status: 400 });
  }

  const deleted = db.delete(cards).where(eq(cards.id, id)).returning({ id: cards.id }).get();
  if (!deleted) {
    return NextResponse.json({ error: "Carte introuvable." }, { status: 404 });
  }
  return NextResponse.json({ deleted: true, id: deleted.id });
}
