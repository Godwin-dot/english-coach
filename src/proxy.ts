import { NextRequest, NextResponse } from "next/server";
import {
  isPasswordAuthEnabled,
  SESSION_COOKIE_NAME,
  verifySessionToken,
} from "@/lib/auth";

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const isLoginPage = pathname === "/login";
  const isPublicRoute =
    isLoginPage || pathname === "/api/auth/login";

  if (isPublicRoute) {
    if (isLoginPage && !isPasswordAuthEnabled()) {
      return NextResponse.redirect(new URL("/", request.url), { status: 307 });
    }
    return NextResponse.next();
  }

  if (!isPasswordAuthEnabled()) {
    return NextResponse.next();
  }

  const token = request.cookies.get(SESSION_COOKIE_NAME)?.value;
  if (await verifySessionToken(token)) {
    return NextResponse.next();
  }

  if (pathname.startsWith("/api/")) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const loginUrl = request.nextUrl.clone();
  loginUrl.pathname = "/login";
  loginUrl.search = "";
  return NextResponse.redirect(loginUrl, { status: 307 });
}

export const config = {
  matcher: ["/((?!_next/|favicon.ico).*)"],
};
