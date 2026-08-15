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
  { name: "Credentialed connection string", pattern: /(?:postgres(?:ql)?|mysql|mariadb|mongodb(?:\+srv)?|redis):\/\/[^:\s/]+:[^@\s/]+@/i },
  { name: "GitHub token", pattern: /gh[pousr]_[A-Za-z0-9]{20,}/ },
  { name: "OpenAI-style API key", pattern: /\bsk-[A-Za-z0-9_-]{20,}\b/ },
  { name: "AWS access key", pattern: /\bAKIA[0-9A-Z]{16}\b/ },
  { name: "JWT token", pattern: /\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\b/ },
];

export function isSensitivePath(filePath: string) {
  const normalized = filePath.replaceAll("\\", "/");
  return sensitivePathPatterns.some((pattern) => pattern.test(normalized));
}

export function scanSensitiveText(value: string) {
  return sensitiveTextPatterns.filter((item) => item.pattern.test(value)).map((item) => item.name);
}
