const sensitivePathPatterns = [
  /(^|\/)\.env(?:\.|$)/i,
  /(secret|credential|private[-_]?key)/i,
  /\.pem$/i,
  /\.p12$/i,
  /\.pfx$/i,
  /id_(rsa|ed25519)$/i,
];

const sensitiveTextPatterns: Array<{ name: string; pattern: RegExp }> = [
  { name: "Private key", pattern: /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/ },
  { name: "Generic API key assignment", pattern: /(?:api[_-]?key|secret|password|token)\s*[:=]\s*["'][^"']{8,}["']/i },
  { name: "Bearer token", pattern: /authorization\s*:\s*["']?bearer\s+[a-z0-9._-]{12,}/i },
];

export function isSensitivePath(filePath: string) {
  const normalized = filePath.replaceAll("\\", "/");
  return sensitivePathPatterns.some((pattern) => pattern.test(normalized));
}

export function scanSensitiveText(value: string) {
  return sensitiveTextPatterns.filter((item) => item.pattern.test(value)).map((item) => item.name);
}
