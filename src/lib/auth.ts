import { errors, SignJWT, jwtVerify } from "jose";

export const SESSION_COOKIE_NAME = "ec_session";
export const SESSION_DURATION_SECONDS = 60 * 60 * 24 * 7;

export function isPasswordAuthEnabled(): boolean {
  return Boolean(process.env.APP_PASSWORD?.trim());
}

function getAuthKey(): Uint8Array {
  const secret = process.env.AUTH_SECRET;

  if (!secret || new TextEncoder().encode(secret).byteLength < 32) {
    throw new Error("AUTH_SECRET must contain at least 32 bytes.");
  }

  return new TextEncoder().encode(secret);
}

export async function createSessionToken(): Promise<string> {
  return new SignJWT({})
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(`${SESSION_DURATION_SECONDS}s`)
    .sign(getAuthKey());
}

export async function verifySessionToken(
  token: string | undefined,
): Promise<boolean> {
  if (!token) {
    return false;
  }

  try {
    await jwtVerify(token, getAuthKey(), { algorithms: ["HS256"] });
    return true;
  } catch (error) {
    if (error instanceof errors.JOSEError) {
      return false;
    }

    throw error;
  }
}

export function getAppPassword(): string {
  const password = process.env.APP_PASSWORD;

  if (!password?.trim()) {
    throw new Error("APP_PASSWORD must be set in the environment.");
  }

  return password;
}
