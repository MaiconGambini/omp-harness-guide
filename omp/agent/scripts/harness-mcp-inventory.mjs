import path from "node:path"
import { pathToFileURL } from "node:url"
import { cursorRoot, globalOpenCodeRoot, readTextIfExists } from "./harness-common.mjs"

const locations = [
  ".opencode/opencode.json",
  ".opencode/opencode.jsonc",
  ".mcp.json",
  path.join(globalOpenCodeRoot(), "opencode.jsonc"),
  path.join(cursorRoot(), "mcp.json"),
]

export function inspectLocation(location) {
  const text = readTextIfExists(location)
  if (!text) return { location, exists: false }
  const config = parseConfig(text)
  const servers = listServers(config)
  const container = config?.mcp ?? config?.mcpServers ?? {}
  const hasSecretKey = hasSecretBearingKey(container)
  // Finding-2: also scan string VALUES for secrets (bearer/authorization headers
  // in args arrays, tokens embedded in URLs). Locations reported by key path
  // only — the secret value itself is never emitted. An `{env:NAME}` placeholder
  // (optionally behind a "Bearer " prefix, or the `{"env": "NAME"}` object form)
  // is a reference, not an inline secret: it names the environment variable the
  // runtime must supply, so it is reported as `envReferencePaths`, never a WARN.
  const envReferencePaths = findEnvReferencePaths(container)
  const secretValuePaths = findSecretBearingValuePaths(container)
  const hasInlineSecret = hasSecretKey || secretValuePaths.length > 0
  return {
    location,
    exists: true,
    hasMcp: /"mcp"\s*:/.test(text) || /"mcpServers"\s*:/.test(text),
    hasInlineSecret,
    envReferencePaths: envReferencePaths.length > 0 ? envReferencePaths : undefined,
    secretValuePaths: secretValuePaths.length > 0 ? secretValuePaths : undefined,
    servers,
    redaction: hasInlineSecret ? "secret-bearing keys/values present; values redacted" : undefined,
  }
}

export function parseConfig(text) {
  try {
    return JSON.parse(stripJsonComments(text))
  } catch {
    return null
  }
}

function stripJsonComments(text) {
  return text.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "")
}

export function listServers(config) {
  const container = config?.mcp ?? config?.mcpServers ?? {}
  return Object.entries(container).map(([name, value]) => ({
    name,
    enabled: value?.enabled ?? "unspecified",
    transport: value?.type ?? (value?.command ? "local" : value?.url ? "remote" : "unspecified"),
  }))
}

// An env reference is `{env:NAME}` — optionally prefixed by "Bearer " for header
// values — or the object form `{"env": "NAME"}`. Either way it names an environment
// variable instead of carrying a value, so it can never leak a secret from this file.
const ENV_PLACEHOLDER_STRING = /^\s*(?:bearer\s+)?\{env:[A-Za-z_][A-Za-z0-9_]*\}\s*$/i
const ENV_PLACEHOLDER_OBJECT = /^[A-Za-z_][A-Za-z0-9_]*$/

export function isEnvReference(value) {
  if (typeof value === "string") return ENV_PLACEHOLDER_STRING.test(value)
  if (value && typeof value === "object" && !Array.isArray(value)) {
    const keys = Object.keys(value)
    return keys.length === 1 && keys[0] === "env" && typeof value.env === "string" && ENV_PLACEHOLDER_OBJECT.test(value.env)
  }
  return false
}

// Finding-2 (revised): a key that names a secret only counts when its value is NOT an
// env reference — `Authorization: "Bearer {env:OBSIDIAN_API_KEY}"` is a safe pointer.
export function hasSecretBearingKey(value) {
  if (!value || typeof value !== "object") return false
  return Object.entries(value).some(([key, child]) => {
    if (isSecretKey(key) && !isEnvReference(child)) return true
    return hasSecretBearingKey(child)
  })
}

export function isSecretKey(key) {
  return /(authorization|api[_-]?key|x-api-key|x-goog-api-key|token|secret|password|cookie)/i.test(key)
}

// Finding-2: a string value looks secret-bearing if it carries a bearer/auth
// header token or embeds a credential query parameter in a URL. Env references are
// excluded first — a placeholder is a reference, not a value.
export function isSecretValue(value) {
  if (typeof value !== "string") return false
  if (isEnvReference(value)) return false
  return (
    /bearer\s+\S/i.test(value) ||
    /authorization\s*:/i.test(value) ||
    /[?&](token|api[_-]?key)=/i.test(value) ||
    /\bapi-key\b/i.test(value)
  )
}

// Finding-2: walk the config tree recording the KEY PATH (never the value) of
// any string leaf that looks secret-bearing, including array elements.
export function findSecretBearingValuePaths(value, prefix = "", found = []) {
  if (isSecretValue(value)) {
    found.push(prefix || "(root)")
    return found
  }
  if (!value || typeof value !== "object") return found
  for (const [key, child] of Object.entries(value)) {
    const nextPrefix = prefix ? `${prefix}.${key}` : key
    findSecretBearingValuePaths(child, nextPrefix, found)
  }
  return found
}

// Same walk, recording KEY PATHS whose leaf is an env reference (never the name of
// the referenced variable — the inventory reports structure, not values).
export function findEnvReferencePaths(value, prefix = "", found = []) {
  if (isEnvReference(value)) {
    found.push(prefix || "(root)")
    return found
  }
  if (!value || typeof value !== "object") return found
  for (const [key, child] of Object.entries(value)) {
    const nextPrefix = prefix ? `${prefix}.${key}` : key
    findEnvReferencePaths(child, nextPrefix, found)
  }
  return found
}

function runCli() {
  const inventory = locations.map(inspectLocation)
  const status = inventory.some((item) => item.hasInlineSecret) ? "WARN" : "PASS"
  console.log(JSON.stringify({ status, inventory }, null, 2))
}

// Auto-run only when invoked directly; stays silent when imported by tests.
if (import.meta.url === pathToFileURL(process.argv[1]).href) runCli()
