import {
  createPrivateKey,
  createPublicKey,
  generateKeyPairSync,
  sign,
  verify,
  type KeyObject,
} from "node:crypto";
import { chmod, mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import type { LicenseTokenPayload } from "./types";

const licenseDataRoot = process.env.DIMPRO_LICENSE_DATA_ROOT?.trim() || path.join(process.cwd(), ".dimprover");
const keyDir = path.join(licenseDataRoot, "license");
const privateKeyFile = path.join(keyDir, "ed25519-private-key.pem");
const publicKeyFile = path.join(keyDir, "ed25519-public-key.base64");

export function base64UrlEncode(input: Buffer | string) {
  return Buffer.from(input)
    .toString("base64")
    .replace(/=/g, "")
    .replace(/\+/g, "-")
    .replace(/\//g, "_");
}

export function base64UrlDecode(input: string) {
  const normalized = input.replace(/-/g, "+").replace(/_/g, "/");
  const padded = normalized.padEnd(
    normalized.length + ((4 - (normalized.length % 4)) % 4),
    "=",
  );
  return Buffer.from(padded, "base64");
}

function publicKeyBase64FromPrivateKey(privateKey: KeyObject) {
  const publicKey = createPublicKey(privateKey);
  return publicKey.export({ type: "spki", format: "der" }).toString("base64");
}

async function getPrivateKeyFromEnvironment() {
  const pem = process.env.DIMPRO_LICENSE_PRIVATE_KEY_PEM;
  if (pem) {
    const privateKey = createPrivateKey(pem.replace(/\\n/g, "\n"));
    return {
      privateKey,
      publicKeyBase64: publicKeyBase64FromPrivateKey(privateKey),
      source: "env-pem" as const,
    };
  }

  const derBase64 = process.env.DIMPRO_LICENSE_PRIVATE_KEY_BASE64;
  if (derBase64) {
    const privateKey = createPrivateKey({
      key: Buffer.from(derBase64, "base64"),
      type: "pkcs8",
      format: "der",
    });
    return {
      privateKey,
      publicKeyBase64: publicKeyBase64FromPrivateKey(privateKey),
      source: "env-der" as const,
    };
  }

  return null;
}

async function getOrCreateLocalPrivateKey() {
  await mkdir(keyDir, { recursive: true });

  try {
    const existingPem = await readFile(privateKeyFile, "utf8");
    const privateKey = createPrivateKey(existingPem);
    return {
      privateKey,
      publicKeyBase64: publicKeyBase64FromPrivateKey(privateKey),
      source: "local-file" as const,
    };
  } catch {
    const { privateKey, publicKey } = generateKeyPairSync("ed25519");
    const privatePem = privateKey.export({ type: "pkcs8", format: "pem" });
    const publicDerBase64 = publicKey
      .export({ type: "spki", format: "der" })
      .toString("base64");

    await writeFile(privateKeyFile, privatePem, { encoding: "utf8", mode: 0o600 });
    await chmod(privateKeyFile, 0o600).catch(() => undefined);
    await writeFile(publicKeyFile, `${publicDerBase64}\n`, "utf8");

    return {
      privateKey,
      publicKeyBase64: publicDerBase64,
      source: "generated-local-file" as const,
    };
  }
}

export async function getLicenseSigningKeyPair() {
  return (await getPrivateKeyFromEnvironment()) ?? (await getOrCreateLocalPrivateKey());
}

export async function signLicenseToken(payload: LicenseTokenPayload) {
  const { privateKey } = await getLicenseSigningKeyPair();
  const payloadJson = JSON.stringify(payload);
  const payloadBase64Url = base64UrlEncode(payloadJson);
  const signature = sign(null, Buffer.from(payloadBase64Url, "utf8"), privateKey);
  return `${payloadBase64Url}.${base64UrlEncode(signature)}`;
}

export function verifyLicenseToken(token: string, publicKeyBase64: string) {
  const [payloadBase64Url, signatureBase64Url] = token.split(".");
  if (!payloadBase64Url || !signatureBase64Url) return null;

  const publicKey = createPublicKey({
    key: Buffer.from(publicKeyBase64, "base64"),
    type: "spki",
    format: "der",
  });
  const isValid = verify(
    null,
    Buffer.from(payloadBase64Url, "utf8"),
    publicKey,
    base64UrlDecode(signatureBase64Url),
  );
  if (!isValid) return null;

  return JSON.parse(base64UrlDecode(payloadBase64Url).toString("utf8")) as LicenseTokenPayload;
}

export async function getServerPublicKeyBase64() {
  const { publicKeyBase64 } = await getLicenseSigningKeyPair();
  return publicKeyBase64;
}
