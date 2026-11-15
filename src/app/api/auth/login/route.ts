import { timingSafeEqual } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import {
  createSessionToken,
  getAppPassword,
  isPasswordAuthEnabled,
  SESSION_COOKIE_NAME,
  SESSION_DURATION_SECONDS,
} from "@/lib/auth";

export async function POST(request: NextRequest) {
  if (!isPasswordAuthEnabled()) {
    return NextResponse.json(
      { error: "Password authentication is disabled." },
      { status: 404 },
    );
  }

  let submittedPassword: unknown;

  try {
    const body: unknown = await request.json();
    if (typeof body !== "object" || body === null || !("password" in body)) {
      return NextResponse.json({ error: "Invalid request." }, { status: 400 });
    }
    submittedPassword = body.password;
  } catch {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }

  if (typeof submittedPassword !== "string") {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }

  const expected = Buffer.from(getAppPassword(), "utf8");
  const received = Buffer.from(submittedPassword, "utf8");
  const matches =
    expected.length === received.length && timingSafeEqual(expected, received);

  if (!matches) {
    return NextResponse.json({ error: "Invalid password." }, { status: 401 });
  }

  const token = await createSessionToken();
  const response = NextResponse.json({ ok: true });
  response.cookies.set(SESSION_COOKIE_NAME, token, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    secure: process.env.NODE_ENV === "production",
    maxAge: SESSION_DURATION_SECONDS,
  });

  return response;
}
