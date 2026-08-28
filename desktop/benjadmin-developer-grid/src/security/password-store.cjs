"use strict";

const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");

const RECORD_VERSION = 1;
const SCRYPT = Object.freeze({ N: 32768, r: 8, p: 1, keyLength: 32, maxmem: 128 * 1024 * 1024 });

function securityPath(userDataPath) {
  return path.join(userDataPath, "chatgrid-security.json");
}

function derive(password, salt) {
  return crypto.scryptSync(password, salt, SCRYPT.keyLength, {
    N: SCRYPT.N,
    r: SCRYPT.r,
    p: SCRYPT.p,
    maxmem: SCRYPT.maxmem
  });
}

function validateNewPassword(password) {
  if (typeof password !== "string" || password.length < 8) throw new Error("A jelszó legalább 8 karakter legyen.");
  if (password.length > 256) throw new Error("A jelszó túl hosszú.");
}

function createPasswordRecord(password) {
  validateNewPassword(password);
  const salt = crypto.randomBytes(16);
  const verifier = derive(password, salt);
  return {
    version: RECORD_VERSION,
    algorithm: "scrypt",
    params: { N: SCRYPT.N, r: SCRYPT.r, p: SCRYPT.p, keyLength: SCRYPT.keyLength },
    salt: salt.toString("base64"),
    verifier: verifier.toString("base64"),
    createdAt: new Date().toISOString()
  };
}

function verifyPassword(password, record) {
  if (!record || record.version !== RECORD_VERSION || record.algorithm !== "scrypt") return false;
  if (typeof password !== "string") return false;
  try {
    const salt = Buffer.from(record.salt, "base64");
    const expected = Buffer.from(record.verifier, "base64");
    const actual = derive(password, salt);
    return actual.length === expected.length && crypto.timingSafeEqual(actual, expected);
  } catch {
    return false;
  }
}

function loadPasswordRecord(userDataPath) {
  const file = securityPath(userDataPath);
  try {
    return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch {
    return null;
  }
}

function savePasswordRecord(userDataPath, record) {
  fs.mkdirSync(userDataPath, { recursive: true });
  const file = securityPath(userDataPath);
  const temp = `${file}.tmp`;
  fs.writeFileSync(temp, JSON.stringify(record, null, 2), { mode: 0o600 });
  fs.renameSync(temp, file);
  return file;
}

module.exports = {
  RECORD_VERSION,
  SCRYPT,
  createPasswordRecord,
  verifyPassword,
  loadPasswordRecord,
  savePasswordRecord,
  validateNewPassword
};
