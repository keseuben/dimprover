import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";

export type DropUploadTokenPayload = {
  version: 1;
  sessionId: string;
  fileId: string;
  packageId: string;
  expiresAt: string;
  nonce: string;
};

function getSecret() {
  const secret = process.env.DROP_UPLOAD_SESSION_SECRET?.trim() || process.env.DROP_TOKEN_PEPPER?.trim();
  if (!secret || secret.length < 32 || secret.includes("<") || secret.includes(">")) {
    const error = new Error("A Drop feltöltési session titka nincs biztonságosan beállítva.");
    Object.assign(error, { code: "DROP_UPLOAD_TOKEN_SECRET_MISSING", status: 503 });
    throw error;
  }
  return secret;
}

export function assertDropUploadSessionTokenReady() {
  void getSecret();
}

function sign(encodedPayload: string) {
  return createHmac("sha256", getSecret()).update(`dup_s_1.${encodedPayload}`).digest("base64url");
}

export function createDropUploadSessionToken(input: {
  sessionId: string;
  fileId: string;
  packageId: string;
  expiresAt: string;
}) {
  const payload: DropUploadTokenPayload = {
    version: 1,
    sessionId: input.sessionId,
    fileId: input.fileId,
    packageId: input.packageId,
    expiresAt: input.expiresAt,
    nonce: randomBytes(12).toString("base64url"),
  };
  const encoded = Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
  return `dup_s_1.${encoded}.${sign(encoded)}`;
}

export function verifyDropUploadSessionToken(rawToken: string): DropUploadTokenPayload {
  const parts = rawToken.trim().split(".");
  if (parts.length !== 3 || parts[0] !== "dup_s_1") {
    const error = new Error("A feltöltési munkamenet tokenje érvénytelen.");
    Object.assign(error, { code: "DROP_UPLOAD_TOKEN_INVALID", status: 401 });
    throw error;
  }
  const expected = Buffer.from(sign(parts[1]), "utf8");
  const received = Buffer.from(parts[2], "utf8");
  if (expected.length !== received.length || !timingSafeEqual(expected, received)) {
    const error = new Error("A feltöltési munkamenet tokenje érvénytelen.");
    Object.assign(error, { code: "DROP_UPLOAD_TOKEN_INVALID", status: 401 });
    throw error;
  }
  let payload: DropUploadTokenPayload;
  try {
    payload = JSON.parse(Buffer.from(parts[1], "base64url").toString("utf8")) as DropUploadTokenPayload;
  } catch {
    const error = new Error("A feltöltési munkamenet tokenje nem olvasható.");
    Object.assign(error, { code: "DROP_UPLOAD_TOKEN_INVALID", status: 401 });
    throw error;
  }
  if (
    payload.version !== 1
    || !/^[0-9a-f-]{36}$/i.test(payload.sessionId)
    || !/^[0-9a-f-]{36}$/i.test(payload.fileId)
    || !/^[0-9a-f-]{36}$/i.test(payload.packageId)
    || !payload.nonce
  ) {
    const error = new Error("A feltöltési munkamenet tokenje hiányos.");
    Object.assign(error, { code: "DROP_UPLOAD_TOKEN_INVALID", status: 401 });
    throw error;
  }
  if (new Date(payload.expiresAt).getTime() <= Date.now()) {
    const error = new Error("A feltöltési munkamenet tokenje lejárt.");
    Object.assign(error, { code: "DROP_UPLOAD_TOKEN_EXPIRED", status: 410 });
    throw error;
  }
  return payload;
}

export function readDropUploadBearerToken(headers: Headers) {
  const authorization = headers.get("authorization")?.trim() || "";
  const match = authorization.match(/^Bearer\s+(dup_s_1\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+)$/i);
  if (!match) {
    const error = new Error("Hiányzó feltöltési munkamenet token.");
    Object.assign(error, { code: "DROP_UPLOAD_TOKEN_MISSING", status: 401 });
    throw error;
  }
  return match[1];
}
