import { NextResponse } from "next/server";
import {
  deleteMistake,
  MistakeNotFoundError,
} from "@/domain/mistakes";

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: idParam } = await params;
  const id = Number(idParam);
  if (!/^[1-9]\d*$/u.test(idParam) || !Number.isSafeInteger(id) || id < 1) {
    return NextResponse.json(
      { error: "Identifiant d’erreur invalide." },
      { status: 400 },
    );
  }

  try {
    deleteMistake(id);
    return NextResponse.json({ deleted: true, id });
  } catch (error) {
    if (error instanceof MistakeNotFoundError) {
      return NextResponse.json({ error: error.message }, { status: 404 });
    }
    throw error;
  }
}
