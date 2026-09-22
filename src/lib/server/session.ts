import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";
import type { Role } from "../types";

// No accounts: the player enters by name, the referee through a secret link.
// REFEREE_KEY is the only credential; it also signs the session cookie, so
// rotating it invalidates every session and the old referee link at once.
const COOKIE = "offer-quest-session";
const MAX_AGE = 60 * 60 * 24 * 180;
export type Session = { role: Role; name: string };

function key() {
  const value = process.env.REFEREE_KEY;
  if (!value) throw new Error("REFEREE_KEY is not configured");
  return value;
}
function mac(payload: string) {
  return createHmac("sha256", key())
    .update(`session:${payload}`)
    .digest("base64url");
}
function equal(a: string, b: string) {
  const x = Buffer.from(a),
    y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}
export function isRefereeKey(candidate: string) {
  return equal(candidate, key());
}
export function signSession(session: Session) {
  const payload = Buffer.from(JSON.stringify(session)).toString("base64url");
  return `${payload}.${mac(payload)}`;
}
export function verifySession(token: string | undefined): Session | null {
  const [payload, signature, ...rest] = token?.split(".") ?? [];
  if (!payload || !signature || rest.length || !equal(signature, mac(payload)))
    return null;
  try {
    const { role, name } = JSON.parse(
      Buffer.from(payload, "base64url").toString(),
    );
    if ((role === "player" || role === "referee") && typeof name === "string")
      return { role, name };
  } catch {}
  return null;
}
export async function readSession() {
  return verifySession((await cookies()).get(COOKIE)?.value);
}
export async function writeSession(session: Session) {
  (await cookies()).set(COOKIE, signSession(session), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: MAX_AGE,
  });
}
export async function clearSession() {
  (await cookies()).delete(COOKIE);
}
