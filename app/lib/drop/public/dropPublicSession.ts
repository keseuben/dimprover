import type { ResponseCookie } from "next/dist/compiled/@edge-runtime/cookies";

export const DROP_PUBLIC_SESSION_COOKIE = "dimpro_drop_public_v094";
export const DROP_DOWNLOAD_PROOF_COOKIE = "dimpro_drop_download_proof_v094";

export function dropPublicSessionCookie(rawToken: string, expiresAt: string): Partial<ResponseCookie> & { name: string; value: string } {
  return {
    name: DROP_PUBLIC_SESSION_COOKIE,
    value: rawToken,
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    expires: new Date(expiresAt),
  };
}

export function clearDropPublicSessionCookie(): Partial<ResponseCookie> & { name: string; value: string } {
  return {
    name: DROP_PUBLIC_SESSION_COOKIE,
    value: "",
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 0,
  };
}
