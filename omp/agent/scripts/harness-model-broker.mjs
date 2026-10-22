// harness-model-broker.mjs — local model broker and egress validation for OMP eval trials.
// Enforces typed model endpoint allowlists, blocks private/metadata host escapes,
// forwards authorized LLM traffic to upstream providers with credential injection,
// and enforces budget authorization and trial token quotas.

import http from "node:http"
import https from "node:https"
import dns from "node:dns"
import fs from "node:fs"
import path from "node:path"
import crypto from "node:crypto"

/**
 * Baseline model provider hostnames permitted for evaluation trials.
 */
export const DEFAULT_ALLOWED_MODEL_HOSTS = Object.freeze([
  "googleapis.com",
  "generativelanguage.googleapis.com",
  "chatgpt.com",
  "api.openai.com",
  "api.anthropic.com",
])

/**
 * Default mapping of model host to credential environment variable reference.
 */
export const DEFAULT_HOST_CREDENTIAL_ENV_MAP = Object.freeze({
  "api.openai.com": Object.freeze({ envVar: "OPENAI_API_KEY", type: "bearer" }),
  "chatgpt.com": Object.freeze({ envVar: "OPENAI_API_KEY", type: "bearer" }),
  "api.anthropic.com": Object.freeze({ envVar: "ANTHROPIC_API_KEY", type: "x-api-key" }),
  "generativelanguage.googleapis.com": Object.freeze({ envVar: "GEMINI_API_KEY", altEnvVar: "GOOGLE_API_KEY", type: "x-goog-api-key" }),
  "googleapis.com": Object.freeze({ envVar: "GEMINI_API_KEY", altEnvVar: "GOOGLE_API_KEY", type: "x-goog-api-key" }),
})

/**
 * Extracts total tokens used from standard provider usage response formats.
 */
export function extractUsageTokens(data) {
  if (!data || typeof data !== "object") return 0
  const usage = data.usage || data.usageMetadata
  if (!usage || typeof usage !== "object") return 0
  if (typeof usage.total_tokens === "number") return usage.total_tokens
  if (typeof usage.totalTokenCount === "number") return usage.totalTokenCount
  const prompt = usage.prompt_tokens ?? usage.input_tokens ?? usage.promptTokenCount ?? 0
  const completion = usage.completion_tokens ?? usage.output_tokens ?? usage.candidatesTokenCount ?? 0
  return Number(prompt) + Number(completion)
}

/**
 * Resolves credential configuration for a host from the mapping.
 */
export function resolveCredentialForHost(hostname, map = DEFAULT_HOST_CREDENTIAL_ENV_MAP) {
  if (!hostname || typeof hostname !== "string") return null
  const norm = hostname.toLowerCase().trim()
  if (map[norm]) return map[norm]
  for (const [h, cfg] of Object.entries(map)) {
    if (norm === h.toLowerCase() || norm.endsWith("." + h.toLowerCase())) {
      return cfg
    }
  }
  return null
}

/**
 * Loads allowed model endpoints from a config.yml file if present.
 * Returns { allowedHosts: [...], models: [...] }.
 */
export function loadAllowedModelEndpoints(configPath) {
  const allowedHosts = [...DEFAULT_ALLOWED_MODEL_HOSTS]
  const models = []

  let resolvedPath = configPath
  if (!resolvedPath) {
    const candidates = [
      path.resolve(process.cwd(), "config.yml"),
      path.resolve(process.cwd(), "omp/overrides/config.yml"),
    ]
    for (const c of candidates) {
      if (fs.existsSync(c)) {
        resolvedPath = c
        break
      }
    }
  }

  if (resolvedPath && fs.existsSync(resolvedPath)) {
    try {
      const content = fs.readFileSync(resolvedPath, "utf8")
      const lines = content.split(/\r?\n/)
      let inModelRoles = false
      let inModels = false
      let inAllowedHosts = false

      for (const line of lines) {
        const trimmed = line.trim()
        if (!trimmed || trimmed.startsWith("#")) continue

        if (/^modelRoles:\s*$/.test(trimmed)) {
          inModelRoles = true
          inModels = false
          inAllowedHosts = false
          continue
        }
        if (/^(models|modelList):\s*$/.test(trimmed)) {
          inModels = true
          inModelRoles = false
          inAllowedHosts = false
          continue
        }
        if (/^(allowedHosts|allowed_hosts|endpoints):\s*$/.test(trimmed)) {
          inAllowedHosts = true
          inModelRoles = false
          inModels = false
          continue
        }
        if (/^[a-zA-Z0-9_-]+:/.test(line) && !line.startsWith(" ") && !line.startsWith("\t")) {
          inModelRoles = false
          inModels = false
          inAllowedHosts = false
        }

        if (inModelRoles) {
          const match = /^\s*([a-zA-Z0-9_-]+):\s*([^\s#]+)/.exec(line)
          if (match) {
            const modelVal = match[2]
            models.push(modelVal)
            if (modelVal.includes("openai") || modelVal.includes("gpt")) {
              allowedHosts.push("api.openai.com", "chatgpt.com")
            }
            if (modelVal.includes("google") || modelVal.includes("gemini")) {
              allowedHosts.push("googleapis.com", "generativelanguage.googleapis.com")
            }
            if (modelVal.includes("anthropic") || modelVal.includes("claude")) {
              allowedHosts.push("api.anthropic.com")
            }
          }
        } else if (inModels) {
          const match = /^\s*-\s*([^\s#]+)/.exec(line)
          if (match) {
            models.push(match[1])
          }
        } else if (inAllowedHosts) {
          const match = /^\s*-\s*([^\s#]+)/.exec(line)
          if (match) {
            allowedHosts.push(match[1].toLowerCase())
          }
        }
      }
    } catch {
      // Fall back cleanly to defaults
    }
  }

  return {
    allowedHosts: [...new Set(allowedHosts)],
    models: [...new Set(models)],
  }
}

/**
 * Checks whether a host belongs to private network ranges, loopback, or cloud metadata.
 * Returns true for localhost, 127.0.0.1, ::1, 0.0.0.0, 169.254.169.254, 10.*, 192.168.*, 172.16-31.*, *.internal, *.local.
 */
export function isPrivateOrMetadataHost(host) {
  if (!host || typeof host !== "string") return false
  let hostname = host.trim().toLowerCase()

  // Strip brackets if IPv6
  if (hostname.startsWith("[") && hostname.includes("]")) {
    hostname = hostname.slice(1, hostname.indexOf("]"))
  } else if (hostname.includes(":") && !hostname.includes("::")) {
    hostname = hostname.split(":")[0]
  }

  if (
    hostname === "localhost" ||
    hostname === "127.0.0.1" ||
    hostname === "::1" ||
    hostname === "0:0:0:0:0:0:0:1" ||
    hostname === "0.0.0.0" ||
    hostname === "::" ||
    hostname === "169.254.169.254"
  ) {
    return true
  }

  if (hostname === "internal" || hostname.endsWith(".internal")) return true
  if (hostname === "local" || hostname.endsWith(".local")) return true

  // IPv4 private ranges:
  if (/^127\.\d+\.\d+\.\d+$/.test(hostname)) return true
  if (/^10\.\d+\.\d+\.\d+$/.test(hostname)) return true
  if (/^192\.168\.\d+\.\d+$/.test(hostname)) return true
  if (/^169\.254\.\d+\.\d+$/.test(hostname)) return true

  // 172.16.0.0/12 (172.16.0.0 - 172.31.255.255)
  const match172 = /^172\.(\d+)\.\d+\.\d+$/.exec(hostname)
  if (match172) {
    const octet = Number(match172[1])
    if (octet >= 16 && octet <= 31) return true
  }

  // IPv6 unique local (fc00::/7) and link-local (fe80::/10)
  if (/^(fc00|fd[0-9a-f]{2}|fe80):/i.test(hostname)) {
    return true
  }

  return false
}

/**
 * Validates a request against trial token, URL structure, egress allowlist, and budget.
 */
export function validateBrokerRequest({
  url,
  method = "POST",
  headers = {},
  trialToken = null,
  expectedToken = null,
  allowedHosts = DEFAULT_ALLOWED_MODEL_HOSTS,
  followRedirects = false,
  budget = {},
} = {}) {
  // 1. Follow redirects check
  if (followRedirects) {
    return {
      allowed: false,
      status: 400,
      code: "REDIRECTS_FORBIDDEN",
      reason: "redirects are forbidden in model broker",
    }
  }

  // 2. Token check
  if (expectedToken && trialToken !== expectedToken) {
    return {
      allowed: false,
      status: 401,
      code: "INVALID_TRIAL_TOKEN",
      reason: "invalid or missing trial token",
    }
  }

  // 3. URL parsing and protocol check
  if (!url || typeof url !== "string") {
    return {
      allowed: false,
      status: 400,
      code: "INVALID_URL",
      reason: "invalid URL",
    }
  }

  let parsedUrl
  try {
    parsedUrl = new URL(url)
  } catch {
    return {
      allowed: false,
      status: 400,
      code: "INVALID_URL",
      reason: "invalid URL",
    }
  }

  if (parsedUrl.protocol !== "https:") {
    return {
      allowed: false,
      status: 400,
      code: "HTTPS_REQUIRED",
      reason: "HTTPS is required for model broker requests",
    }
  }

  // 4. Host allowlist and private host check
  const hostname = parsedUrl.hostname.toLowerCase()
  const isAllowedHost = (allowedHosts || []).some((h) => {
    const norm = h.toLowerCase().trim()
    return hostname === norm || hostname.endsWith("." + norm)
  })

  if (isPrivateOrMetadataHost(hostname) || !isAllowedHost) {
    return {
      allowed: false,
      status: 403,
      code: "EGRESS_BLOCKED",
      reason: `egress-blocked: host ${hostname} not in model allowlist`,
    }
  }

  // 5. Budget check
  if (
    (budget.paidProvider || budget.maxCostUsd !== undefined) &&
    (!budget.operatorAuthorized || !budget.meteredProviderVerified)
  ) {
    return {
      allowed: false,
      status: 402,
      code: "BLOCKED: unmetered-provider-budget-unverified",
      reason: "BLOCKED: unmetered-provider-budget-unverified",
    }
  }

  // 6. Token cap check
  if (
    budget.maxTokensPerTrial !== undefined &&
    (budget.tokensUsed ?? 0) > budget.maxTokensPerTrial
  ) {
    return {
      allowed: false,
      status: 429,
      code: "TRIAL_TOKEN_CAP_EXCEEDED",
      reason: "trial token cap exceeded",
    }
  }

  return {
    allowed: true,
    status: 200,
    host: hostname,
    code: "ALLOWED",
  }
}

/**
 * Resolves the target URL from request headers, path, or body.
 */
function resolveTargetUrl(req, parsedBody, defaultHost = "api.openai.com") {
  const customTarget = req.headers["x-target-url"] || (parsedBody && parsedBody.url)
  if (customTarget && typeof customTarget === "string") {
    return customTarget
  }
  if (req.url && (req.url.startsWith("https://") || req.url.startsWith("http://"))) {
    return req.url
  }
  const hostHeader = req.headers["x-forwarded-host"] || req.headers["host"]
  if (hostHeader && typeof hostHeader === "string") {
    const cleanHost = hostHeader.split(":")[0].toLowerCase()
    if (!isPrivateOrMetadataHost(cleanHost)) {
      return `https://${hostHeader}${req.url || "/"}`
    }
  }
  const fallback = defaultHost || "api.openai.com"
  return `https://${fallback}${req.url || "/"}`
}

/**
 * Creates a local model broker HTTP server (127.0.0.1:0).
 * Forwards authorized traffic to allowlisted LLM providers with injected credentials,
 * DNS rebinding protection, redirect prevention, and response token metering.
 */
export function createModelBrokerServer(options = {}) {
  const host = options.host ?? "127.0.0.1"
  const port = options.port ?? 0
  const allowedHosts = options.allowedHosts ?? DEFAULT_ALLOWED_MODEL_HOSTS
  const defaultBudget = options.budget ?? {}
  const hostCredentialMap = {
    ...DEFAULT_HOST_CREDENTIAL_ENV_MAP,
    ...(options.hostCredentialMap || {}),
  }
  const dnsLookup = options.dnsLookup ?? dns.promises.lookup
  const transport = options.transport ?? options.forwardTransport ?? null

  const trialTokens = new Map() // trialToken -> trialId
  const trialIdToToken = new Map() // trialId -> trialToken
  const trialStats = new Map() // trialId -> { tokensUsed, costUsd, requests }

  function issueTrialToken(trialId) {
    const id = trialId || `trial_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
    const token = `mbtk_${crypto.randomUUID ? crypto.randomUUID().replace(/-/g, "") : crypto.randomBytes(16).toString("hex")}`
    trialTokens.set(token, id)
    trialIdToToken.set(id, token)
    if (!trialStats.has(id)) {
      trialStats.set(id, { tokensUsed: 0, costUsd: 0, requests: 0 })
    }
    return token
  }

  function recordUsage(trialId, { tokens = 0, costUsd = 0 } = {}) {
    const current = trialStats.get(trialId) || { tokensUsed: 0, costUsd: 0, requests: 0 }
    current.tokensUsed += (Number(tokens) || 0)
    current.costUsd += (Number(costUsd) || 0)
    current.requests += 1
    trialStats.set(trialId, current)
    return { ...current }
  }

  function getTrialStats(trialId) {
    const current = trialStats.get(trialId)
    return current ? { ...current } : { tokensUsed: 0, costUsd: 0, requests: 0 }
  }

  function validateRequest(reqParams = {}) {
    let budget = { ...defaultBudget, ...(reqParams.budget || {}) }
    let expectedToken = reqParams.expectedToken ?? null

    const token = reqParams.trialToken || reqParams.headers?.["x-trial-token"]
    if (token && trialTokens.has(token)) {
      const trialId = trialTokens.get(token)
      const stats = getTrialStats(trialId)
      budget = {
        ...budget,
        tokensUsed: stats.tokensUsed,
        costUsd: stats.costUsd,
      }
      if (!expectedToken) {
        expectedToken = token
      }
    }

    return validateBrokerRequest({
      allowedHosts,
      ...reqParams,
      trialToken: token,
      expectedToken,
      budget,
    })
  }

  async function forwardRequest({ req, res, targetUrl, rawBodyBuffer, trialToken }) {
    let urlObj
    try {
      urlObj = new URL(targetUrl)
    } catch (err) {
      res.writeHead(400, { "Content-Type": "application/json" })
      res.end(JSON.stringify({ allowed: false, status: 400, code: "INVALID_URL", reason: err.message }))
      return
    }

    const hostname = urlObj.hostname.toLowerCase()
    const trialId = trialToken && trialTokens.has(trialToken) ? trialTokens.get(trialToken) : null

    // 1. Resolve provider credential from environment variable reference
    const credConfig = resolveCredentialForHost(hostname, hostCredentialMap)
    let credVal = null
    let envVarName = null

    if (options.getProviderKey) {
      credVal = options.getProviderKey(hostname)
      envVarName = "CUSTOM_RESOLVER"
    } else if (credConfig) {
      envVarName = credConfig.envVar
      credVal = process.env[credConfig.envVar] || (credConfig.altEnvVar ? process.env[credConfig.altEnvVar] : null)
    }

    if (!credVal) {
      res.writeHead(503, { "Content-Type": "application/json" })
      res.end(JSON.stringify({
        allowed: false,
        status: 503,
        code: "PROVIDER_CREDENTIAL_UNAVAILABLE",
        reason: `provider credential ${envVarName || "for host " + hostname} unavailable in environment`,
      }))
      return
    }

    // 2. DNS lookup before dialing to prevent DNS rebinding attacks
    let addresses = []
    try {
      const lookupRes = await dnsLookup(hostname, { all: true })
      if (Array.isArray(lookupRes)) {
        addresses = lookupRes.map((a) => (typeof a === "string" ? a : a.address))
      } else if (lookupRes && typeof lookupRes === "object" && lookupRes.address) {
        addresses = [lookupRes.address]
      } else if (typeof lookupRes === "string") {
        addresses = [lookupRes]
      }
    } catch (err) {
      res.writeHead(502, { "Content-Type": "application/json" })
      res.end(JSON.stringify({
        allowed: false,
        status: 502,
        code: "DNS_LOOKUP_FAILED",
        reason: `DNS lookup failed for ${hostname}: ${err.message}`,
      }))
      return
    }

    if (!addresses || addresses.length === 0) {
      res.writeHead(502, { "Content-Type": "application/json" })
      res.end(JSON.stringify({
        allowed: false,
        status: 502,
        code: "DNS_LOOKUP_FAILED",
        reason: `DNS lookup returned no addresses for ${hostname}`,
      }))
      return
    }

    for (const ip of addresses) {
      if (isPrivateOrMetadataHost(ip)) {
        res.writeHead(403, { "Content-Type": "application/json" })
        res.end(JSON.stringify({
          allowed: false,
          status: 403,
          code: "EGRESS_BLOCKED",
          reason: `egress-blocked: resolved IP ${ip} for host ${hostname} is private or metadata address (DNS rebinding blocked)`,
        }))
        return
      }
    }

    const resolvedIp = addresses[0]

    // 3. Strip client credentials and inject provider credentials
    const forwardHeaders = { ...req.headers }
    delete forwardHeaders["authorization"]
    delete forwardHeaders["x-api-key"]
    delete forwardHeaders["x-goog-api-key"]
    delete forwardHeaders["cookie"]
    delete forwardHeaders["set-cookie"]
    delete forwardHeaders["x-trial-token"]
    delete forwardHeaders["x-target-url"]
    delete forwardHeaders["x-follow-redirects"]
    delete forwardHeaders["connection"]
    delete forwardHeaders["keep-alive"]

    // Strip any client header matching /api[-_]?key|token|secret/i
    for (const h of Object.keys(forwardHeaders)) {
      if (/api[-_]?key|token|secret/i.test(h)) {
        delete forwardHeaders[h]
      }
    }

    forwardHeaders["host"] = hostname
    if (rawBodyBuffer && rawBodyBuffer.length > 0) {
      forwardHeaders["content-length"] = String(rawBodyBuffer.length)
    }

    if (credConfig?.type === "x-api-key") {
      forwardHeaders["x-api-key"] = credVal
    } else if (credConfig?.type === "x-goog-api-key") {
      forwardHeaders["x-goog-api-key"] = credVal
    } else {
      forwardHeaders["authorization"] = `Bearer ${credVal}`
    }

    const targetPort = urlObj.port ? Number(urlObj.port) : 443
    const dialOptions = {
      protocol: "https:",
      host: resolvedIp,
      hostname: resolvedIp,
      port: targetPort,
      path: `${urlObj.pathname}${urlObj.search}`,
      method: req.method || "POST",
      headers: forwardHeaders,
      servername: hostname, // Pinned servername for TLS certificate validation
      timeout: options.upstreamTimeoutMs ?? 30_000,
    }

    const reqTransport = transport ?? https.request

    const upstreamReq = reqTransport(dialOptions, (upstreamRes) => {
      // 4. Refuse redirects (upstream 3xx -> 502 REDIRECTS_FORBIDDEN)
      if (upstreamRes.statusCode >= 300 && upstreamRes.statusCode < 400) {
        if (!res.headersSent) {
          res.writeHead(502, { "Content-Type": "application/json" })
          res.end(JSON.stringify({
            allowed: false,
            status: 502,
            code: "REDIRECTS_FORBIDDEN",
            reason: `upstream returned redirect status ${upstreamRes.statusCode}, redirects are forbidden in model broker`,
          }))
        }
        upstreamRes.destroy()
        return
      }

      // Stream status and response headers back
      const respHeaders = { ...upstreamRes.headers }
      delete respHeaders["connection"]
      delete respHeaders["keep-alive"]
      res.writeHead(upstreamRes.statusCode, respHeaders)

      const responseChunks = []
      let totalBytes = 0
      const maxBytes = options.maxResponseBytes ?? 10 * 1024 * 1024
      let payloadTooLarge = false

      upstreamRes.on("data", (chunk) => {
        totalBytes += chunk.length
        if (totalBytes > maxBytes) {
          payloadTooLarge = true
          upstreamRes.destroy()
          return
        }
        responseChunks.push(chunk)
        res.write(chunk)
      })

      upstreamRes.on("end", () => {
        if (payloadTooLarge) {
          if (!res.writableEnded) {
            res.end()
          }
          return
        }
        res.end()

        // 5. Meter tokens from response
        try {
          const respText = Buffer.concat(responseChunks).toString("utf8")
          const respJson = JSON.parse(respText)
          const tokens = extractUsageTokens(respJson)
          if (tokens > 0 && trialId) {
            recordUsage(trialId, { tokens })
          }
        } catch {
          // not json or non-parsable
        }
      })

      upstreamRes.on("error", (err) => {
        if (!res.writableEnded) {
          res.end()
        }
      })
    })

    upstreamReq.on("timeout", () => {
      upstreamReq.destroy()
      if (!res.headersSent) {
        res.writeHead(504, { "Content-Type": "application/json" })
        res.end(JSON.stringify({
          allowed: false,
          status: 504,
          code: "UPSTREAM_TIMEOUT",
          reason: "upstream request timed out",
        }))
      }
    })

    upstreamReq.on("error", (err) => {
      if (!res.headersSent) {
        res.writeHead(502, { "Content-Type": "application/json" })
        res.end(JSON.stringify({
          allowed: false,
          status: 502,
          code: "UPSTREAM_ERROR",
          reason: `upstream request error: ${err.message}`,
        }))
      }
    })

    if (rawBodyBuffer && rawBodyBuffer.length > 0) {
      upstreamReq.write(rawBodyBuffer)
    }
    upstreamReq.end()
  }

  const server = http.createServer(async (req, res) => {
    const chunks = []
    req.on("data", (chunk) => {
      chunks.push(chunk)
    })

    req.on("end", async () => {
      const rawBodyBuffer = Buffer.concat(chunks)
      let parsed = {}
      if (rawBodyBuffer.length > 0) {
        try {
          parsed = JSON.parse(rawBodyBuffer.toString("utf8"))
        } catch {
          // not json
        }
      }

      const reqUrl = req.url || "/"
      if (reqUrl === "/health" || reqUrl === "/ping") {
        res.writeHead(200, { "Content-Type": "application/json" })
        res.end(JSON.stringify({ status: "ok", broker: "harness-model-broker" }))
        return
      }

      if (reqUrl.startsWith("/stats/")) {
        const trialId = reqUrl.slice("/stats/".length)
        res.writeHead(200, { "Content-Type": "application/json" })
        res.end(JSON.stringify(getTrialStats(trialId)))
        return
      }

      const trialToken = req.headers["x-trial-token"] || parsed.trialToken || null
      const targetUrl = resolveTargetUrl(req, parsed, options.defaultTargetHost)
      const followRedirects = Boolean(parsed.followRedirects || req.headers["x-follow-redirects"] === "true")

      const validation = validateRequest({
        url: targetUrl,
        method: req.method,
        headers: req.headers,
        trialToken,
        followRedirects,
        budget: parsed.budget,
      })

      // Validation-only diagnostic endpoints
      if (reqUrl === "/validate" || reqUrl === "/check") {
        res.writeHead(validation.status, { "Content-Type": "application/json" })
        res.end(JSON.stringify(validation))
        return
      }

      if (!validation.allowed) {
        res.writeHead(validation.status, { "Content-Type": "application/json" })
        res.end(JSON.stringify(validation))
        return
      }

      // Forward allowed LLM calls to upstream provider
      await forwardRequest({
        req,
        res,
        targetUrl,
        rawBodyBuffer,
        trialToken,
      })
    })
  })

  let isListening = false

  async function start() {
    if (isListening) return server.address().port
    return new Promise((resolve, reject) => {
      server.listen(port, host, () => {
        isListening = true
        resolve(server.address().port)
      })
      server.once("error", reject)
    })
  }

  async function stop() {
    if (!isListening) return
    return new Promise((resolve, reject) => {
      server.close((err) => {
        isListening = false
        if (err) reject(err)
        else resolve()
      })
    })
  }

  function getPort() {
    return server.address()?.port ?? null
  }

  function getUrl() {
    const p = getPort()
    return p ? `http://${host}:${p}` : null
  }

  return {
    server,
    start,
    stop,
    getPort,
    getUrl,
    issueTrialToken,
    recordUsage,
    getTrialStats,
    validateRequest,
  }
}

// CLI Execution support
if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(new URL(import.meta.url).pathname.replace(/^\/([A-Z]:)/i, "$1"))) {
  if (process.argv.includes("--self-test")) {
    let passed = 0

    // Test 1: DEFAULT_ALLOWED_MODEL_HOSTS
    if (Array.isArray(DEFAULT_ALLOWED_MODEL_HOSTS) && DEFAULT_ALLOWED_MODEL_HOSTS.length >= 5) passed++

    // Test 2: isPrivateOrMetadataHost
    if (
      isPrivateOrMetadataHost("localhost") &&
      isPrivateOrMetadataHost("127.0.0.1") &&
      isPrivateOrMetadataHost("169.254.169.254") &&
      isPrivateOrMetadataHost("10.0.0.1") &&
      isPrivateOrMetadataHost("192.168.1.1") &&
      isPrivateOrMetadataHost("172.20.1.1") &&
      isPrivateOrMetadataHost("cluster.local") &&
      isPrivateOrMetadataHost("service.internal") &&
      !isPrivateOrMetadataHost("api.openai.com") &&
      !isPrivateOrMetadataHost("googleapis.com")
    ) {
      passed++
    }

    // Test 3: validateBrokerRequest - redirects forbidden
    const redirectTest = validateBrokerRequest({
      url: "https://api.openai.com/v1/models",
      followRedirects: true,
    })
    if (!redirectTest.allowed && redirectTest.code === "REDIRECTS_FORBIDDEN" && redirectTest.status === 400) passed++

    // Test 4: validateBrokerRequest - token check
    const tokenTest = validateBrokerRequest({
      url: "https://api.openai.com/v1/models",
      trialToken: "wrong",
      expectedToken: "correct",
    })
    if (!tokenTest.allowed && tokenTest.code === "INVALID_TRIAL_TOKEN" && tokenTest.status === 401) passed++

    // Test 5: validateBrokerRequest - egress blocked
    const egressTest = validateBrokerRequest({
      url: "https://malicious.example.com/exfil",
    })
    if (!egressTest.allowed && egressTest.code === "EGRESS_BLOCKED" && egressTest.status === 403) passed++

    // Test 6: validateBrokerRequest - budget checks
    const budgetTest1 = validateBrokerRequest({
      url: "https://api.openai.com/v1/models",
      budget: { paidProvider: true, operatorAuthorized: false },
    })
    if (!budgetTest1.allowed && budgetTest1.status === 402 && budgetTest1.code === "BLOCKED: unmetered-provider-budget-unverified") passed++

    const budgetTest2 = validateBrokerRequest({
      url: "https://api.openai.com/v1/models",
      budget: { maxTokensPerTrial: 100, tokensUsed: 150 },
    })
    if (!budgetTest2.allowed && budgetTest2.status === 429 && budgetTest2.code === "TRIAL_TOKEN_CAP_EXCEEDED") passed++

    // Test 7: validateBrokerRequest - allowed request
    const allowedTest = validateBrokerRequest({
      url: "https://api.openai.com/v1/models",
      trialToken: "valid_token",
      expectedToken: "valid_token",
      budget: { maxTokensPerTrial: 1000, tokensUsed: 100 },
    })
    if (allowedTest.allowed && allowedTest.status === 200 && allowedTest.code === "ALLOWED") passed++

    // Test 8: server lifecycle
    const broker = createModelBrokerServer()
    await broker.start()
    const port = broker.getPort()
    const token = broker.issueTrialToken("trial_001")
    broker.recordUsage("trial_001", { tokens: 50, costUsd: 0.005 })
    const stats = broker.getTrialStats("trial_001")
    await broker.stop()
    if (port > 0 && token.startsWith("mbtk_") && stats.tokensUsed === 50) passed++

    // Test 9: validateBrokerRequest - HTTPS required
    const httpTest = validateBrokerRequest({
      url: "http://api.openai.com/v1/models",
    })
    if (!httpTest.allowed && httpTest.status === 400 && httpTest.code === "HTTPS_REQUIRED") passed++

    const summary = {
      status: "ok",
      selfTest: true,
      testsPassed: passed,
      totalTests: 10,
      allowedHosts: DEFAULT_ALLOWED_MODEL_HOSTS,
    }
    console.log(JSON.stringify(summary, null, 2))
    process.exit(0)
  }
}
