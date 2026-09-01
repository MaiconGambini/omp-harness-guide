import fs from "node:fs"
import os from "node:os"
import path from "node:path"

export function pathExists(targetPath) {
  return fs.existsSync(targetPath)
}

export function readTextIfExists(targetPath) {
  if (!pathExists(targetPath)) return ""
  return fs.readFileSync(targetPath, "utf8")
}

export function listFiles(rootPath, predicate = () => true) {
  if (!pathExists(rootPath)) return []
  if (fs.statSync(rootPath).isFile()) return predicate(rootPath) ? [rootPath] : []
  const result = []
  walkDirectory(rootPath, result, predicate)
  return result
}

export function redactedFinding(filePath, message, severity = "WARN") {
  return { severity, file: filePath, message }
}

// Finding-5: single shared source of truth for secret token length thresholds.
// Previously scanners disagreed ({4,} in scan vs {8,}/{12,} in redact), causing
// inconsistent detection. All scanners now import these constants.
export const MIN_SECRET_TOKEN_LEN = 8
export const MIN_SK_TOKEN_LEN = 12
export const MIN_BEARER_TOKEN_LEN = 20

// F1: single shared source string for the sk- token shape, reused by every
// scanner pattern and redaction consumer so detection and redaction stay in
// lockstep. The character class includes `-` so modern hyphenated keys
// (sk-proj-..., sk-ant-api03-...) are covered alongside the legacy all-alnum
// shape; the minimum-length policy (MIN_SK_TOKEN_LEN after the `sk-` prefix)
// is unchanged.
export const SK_TOKEN_PATTERN = `sk-[a-z0-9-]{${MIN_SK_TOKEN_LEN},}`

// Finding-5: canonical JSON secret-key/value pattern reused by security-scan.
export const SECRET_PATTERN = new RegExp(
  `("(api[_-]?key|authorization|x-api-key|x-goog-api-key|password|secret|token)"\\s*:\\s*"[^"$][^"]{${MIN_SECRET_TOKEN_LEN},}")` +
    `|(bearer\\s+[a-z0-9._-]{${MIN_BEARER_TOKEN_LEN},})` +
    `|(${SK_TOKEN_PATTERN})`,
  "i",
)

// Finding-3: hard-secret / private-key patterns escalate to FAIL (not WARN).
export const HARD_SECRET_PATTERN = new RegExp(
  `(${SK_TOKEN_PATTERN})` +
    `|(-----BEGIN [A-Z ]*PRIVATE KEY-----)` +
    `|(bearer\\s+[a-z0-9._-]{${MIN_BEARER_TOKEN_LEN},})`,
  "i",
)

export function globalOpenCodeRoot() {
  return path.join(os.homedir(), ".config", "opencode")
}

export function cursorRoot() {
  return path.join(os.homedir(), ".cursor")
}

export function uniqueExistingPaths(paths) {
  return [...new Set(paths.map((item) => path.resolve(item)))].filter(pathExists)
}

// Finding-5: thresholds now come from the shared constants above so redaction
// and detection stay in lockstep. Wired into security-scan's --text summary.
export function redactSensitiveText(text) {
  const bearer = new RegExp(`bearer\\s+[a-z0-9._-]{${MIN_BEARER_TOKEN_LEN},}`, "gi")
  const sk = new RegExp(SK_TOKEN_PATTERN, "gi")
  // Credential globals run before key/value redaction: otherwise
  // `Authorization: Bearer <token>` consumes only `Bearer` and strands the
  // credential tail in downstream report/error text.
  return text
    .replace(bearer, "Bearer [REDACTED]")
    .replace(sk, "sk-[REDACTED]")
    .replace(/(authorization|api[_-]?key|x-api-key|token|password|secret|cookie)(\s*[=:]\s*)[^\s,;}]+/gi, "$1$2[REDACTED]")
}

function walkDirectory(currentPath, result, predicate) {
  for (const entry of fs.readdirSync(currentPath, { withFileTypes: true })) {
    const fullPath = path.join(currentPath, entry.name)
    if (entry.isDirectory() && !isIgnoredDirectory(entry.name)) walkDirectory(fullPath, result, predicate)
    if (entry.isFile() && predicate(fullPath)) result.push(fullPath)
  }
}

function isIgnoredDirectory(name) {
  return ["node_modules", ".git", "dist", "build", "coverage", ".backup", "cache"].includes(name)
}
