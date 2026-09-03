const WIDGET_KEY = "usage-report"
const USAGE_COMMAND = "omp usage --json"
const STATS_COMMAND = "omp stats --json"
const UNAVAILABLE = "indisponível"

type JsonRecord = Record<string, unknown>

type ExecResult = {
  stdout: string
  stderr: string
  code: number
  killed?: boolean
}

type InputEvent = {
  text: string
  source: "interactive" | "rpc" | "extension"
}

type InputEventResult = {
  text?: string
}

type WidgetContext = {
  ui: {
    setWidget(
      key: string,
      content: string[] | undefined,
      options?: { placement: "aboveEditor" | "belowEditor" },
    ): void
  }
}

type ExtensionApi = {
  exec(command: string, args: string[], options?: { timeout?: number }): Promise<ExecResult>
  sendMessage(message: {
    customType: string
    content: string
    display: boolean
    attribution: "user" | "agent"
  }): void
  on(
    event: "input",
    handler: (event: InputEvent, context: WidgetContext) => InputEventResult | Promise<InputEventResult | void> | void,
  ): void
  registerCommand(
    name: string,
    definition: {
      description: string
      handler: (args: string, context: WidgetContext) => Promise<void>
    },
  ): void
}

type CommandSnapshot = {
  value?: unknown
  fallback: string
}

type AccountView = {
  key: string
  provider: string
  email?: string
  plan?: string
  limits: JsonRecord[]
}

type ProviderTotals = {
  provider: string
  requests: number[]
  tokens: number[]
  output: number[]
  cacheRead: number[]
  cacheWrite: number[]
  cost: number[]
  errors: number[]
}

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

function stringValue(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined
}

function numberValue(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined
}

function firstString(...values: unknown[]): string | undefined {
  for (const value of values) {
    const result = stringValue(value)
    if (result) return result
  }
  return undefined
}

function firstNumber(...values: unknown[]): number | undefined {
  for (const value of values) {
    const result = numberValue(value)
    if (result !== undefined) return result
  }
  return undefined
}

function scalar(value: unknown): string {
  if (value === undefined || value === null || value === "") return UNAVAILABLE
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") return String(value)
  return UNAVAILABLE
}

function isoOrValue(value: unknown): string {
  const number = numberValue(value)
  if (number !== undefined) {
    const date = new Date(number)
    if (!Number.isNaN(date.getTime())) return date.toISOString()
  }
  return scalar(value)
}

function parseJson(stdout: string): unknown | undefined {
  const text = stdout.trim()
  if (!text) return undefined
  try {
    return JSON.parse(text) as unknown
  } catch {
    for (let index = 0; index < text.length; index += 1) {
      if (text[index] !== "{" && text[index] !== "[") continue
      try {
        return JSON.parse(text.slice(index)) as unknown
      } catch {
        continue
      }
    }
  }
  return undefined
}

function safeStdoutFallback(stdout: string): string {
  const forbidden = /account[_ -]?id|access[_ -]?token|refresh[_ -]?token|api[_ -]?key|secret|password|authorization|bearer|prompt|transcript|tool[_ -]?(?:argument|result|input|output)/i
  const lines = stdout
    .split(/\r?\n/)
    .map(line => line.trim())
    .filter(line => line && !forbidden.test(line))
  return lines.join(" ").slice(0, 500)
}

async function runReadOnly(pi: ExtensionApi, command: string, args: string[]): Promise<CommandSnapshot> {
  try {
    const result = await pi.exec(command, args, { timeout: 30_000 })
    if (result.code !== 0 || result.killed) return { fallback: `${command}: ${UNAVAILABLE}` }
    const value = parseJson(result.stdout)
    if (value !== undefined) return { value, fallback: "" }
    const stdout = safeStdoutFallback(result.stdout)
    return { fallback: `${command}: ${stdout || UNAVAILABLE}` }
  } catch {
    return { fallback: `${command}: ${UNAVAILABLE}` }
  }
}

function arrayFrom(value: unknown, key: string): JsonRecord[] {
  const root = isRecord(value) ? value[key] : undefined
  return Array.isArray(root) ? root.filter(isRecord) : []
}

function accountIdentity(provider: string, metadata: JsonRecord, fallback: JsonRecord): { key: string; email?: string; plan?: string } {
  const email = firstString(metadata.email, fallback.email)
  const org = firstString(metadata.orgId, fallback.orgId)
  const account = firstString(metadata.accountId, fallback.accountId)
  const project = firstString(metadata.projectId, fallback.projectId)
  const key = [provider, email ?? "", org ?? "", account ?? "", project ?? ""].join("\u0000")
  const plan = firstString(metadata.planType, metadata.plan, metadata.currentTierName, fallback.plan, fallback.planType)
  return { key, email, plan }
}

function reportAccounts(value: unknown): AccountView[] {
  const root = isRecord(value) ? value : {}
  const accounts: AccountView[] = []
  for (const report of arrayFrom(value, "reports")) {
    const provider = firstString(report.provider) ?? UNAVAILABLE
    const metadata = isRecord(report.metadata) ? report.metadata : {}
    const identity = accountIdentity(provider, metadata, report)
    accounts.push({
      key: identity.key,
      provider,
      email: identity.email,
      plan: identity.plan,
      limits: Array.isArray(report.limits) ? report.limits.filter(isRecord) : [],
    })
  }
  for (const account of arrayFrom(value, "accountsWithoutUsage")) {
    const provider = firstString(account.provider) ?? UNAVAILABLE
    const identity = accountIdentity(provider, account, account)
    accounts.push({ key: identity.key, provider, email: identity.email, plan: identity.plan, limits: [] })
  }
  for (const account of arrayFrom(value, "disabledCredentials")) {
    const provider = firstString(account.provider) ?? UNAVAILABLE
    const identity = accountIdentity(provider, account, account)
    accounts.push({ key: identity.key, provider, email: identity.email, plan: identity.plan, limits: [] })
  }
  return accounts
}

function limitValue(amount: JsonRecord, primary: string, fraction: string): string {
  const fractionValue = numberValue(amount[fraction])
  if (fractionValue !== undefined) return `${(fractionValue * 100).toFixed(1).replace(".", ",")}%`
  const absolute = numberValue(amount[primary])
  if (absolute !== undefined) return String(absolute)
  return UNAVAILABLE
}

function renderQuota(value: unknown, fallback: string): string[] {
  const accounts = reportAccounts(value)
  if (accounts.length === 0) return [`Quota externa: ${fallback || `${USAGE_COMMAND}: ${UNAVAILABLE}`}`]

  const lines = ["Quota externa"]
  const seen = new Set<string>()
  for (const account of accounts) {
    if (seen.has(account.key)) continue
    seen.add(account.key)
    lines.push(`Provider: ${account.provider}`)
    lines.push(`E-mail: ${account.email ?? UNAVAILABLE}`)
    lines.push(`Plano: ${account.plan ?? UNAVAILABLE}`)
    if (account.limits.length === 0) {
      lines.push(`Limite: ${UNAVAILABLE}`)
    } else {
      for (const limit of account.limits) {
        const amount = isRecord(limit.amount) ? limit.amount : {}
        const window = isRecord(limit.window) ? limit.window : {}
        const label = firstString(limit.label, window.label) ?? UNAVAILABLE
        lines.push(
          `Limite: ${label} | usado=${limitValue(amount, "used", "usedFraction")} | restante=${limitValue(amount, "remaining", "remainingFraction")} | reset=${isoOrValue(window.resetsAt)}`,
        )
      }
    }
  }
  return lines
}

function pushNumber(target: number[], value: unknown): void {
  const number = numberValue(value)
  if (number !== undefined) target.push(number)
}

function providerTotals(provider: string): ProviderTotals {
  return { provider, requests: [], tokens: [], output: [], cacheRead: [], cacheWrite: [], cost: [], errors: [] }
}

function collectProviderTotals(value: unknown): ProviderTotals[] {
  const root = isRecord(value) ? value : {}
  const candidates = [
    ...(Array.isArray(root.providers) ? root.providers : []),
    ...(Array.isArray(root.byProvider) ? root.byProvider : []),
    ...(Array.isArray(root.byModel) ? root.byModel : []),
  ].filter(isRecord)
  const grouped = new Map<string, ProviderTotals>()
  for (const item of candidates) {
    const provider = firstString(item.provider) ?? UNAVAILABLE
    const current = grouped.get(provider) ?? providerTotals(provider)
    pushNumber(current.requests, firstNumber(item.totalRequests, item.requests))
    pushNumber(current.tokens, item.totalInputTokens)
    pushNumber(current.tokens, item.totalOutputTokens)
    pushNumber(current.output, firstNumber(item.totalOutputTokens, item.outputTokens, item.output))
    pushNumber(current.cacheRead, firstNumber(item.totalCacheReadTokens, item.cacheReadTokens))
    pushNumber(current.cacheWrite, firstNumber(item.totalCacheWriteTokens, item.cacheWriteTokens))
    pushNumber(current.cost, firstNumber(item.totalCost, item.cost))
    pushNumber(current.errors, firstNumber(item.failedRequests, item.errors, item.errorCount))
    grouped.set(provider, current)
  }
  return [...grouped.values()].sort((left, right) => left.provider.localeCompare(right.provider))
}

function sum(values: number[]): string {
  return values.length > 0 ? String(values.reduce((total, value) => total + value, 0)) : UNAVAILABLE
}
function tokenTotal(record: JsonRecord): string {
  const values = [
    numberValue(record.totalInputTokens),
    numberValue(record.totalOutputTokens),
  ].filter((value): value is number => value !== undefined)
  return values.length > 0 ? String(values.reduce((total, value) => total + value, 0)) : UNAVAILABLE
}

function renderLocalStats(value: unknown, fallback: string): string[] {
  const root = isRecord(value) ? value : {}
  const overall = isRecord(root.overall) ? root.overall : undefined
  const lines = ["Consumo local geral"]
  if (!overall) {
    lines.push(`requests=${UNAVAILABLE} tokens=${UNAVAILABLE} output=${UNAVAILABLE} cache=${UNAVAILABLE} custo=${UNAVAILABLE} erros=${UNAVAILABLE}`)
  } else {
    lines.push(
      `requests=${scalar(firstNumber(overall.totalRequests, overall.requests))} input=${scalar(firstNumber(overall.totalInputTokens, overall.inputTokens))} output=${scalar(firstNumber(overall.totalOutputTokens, overall.outputTokens, overall.output))} tokens=${tokenTotal(overall)} cacheRead=${scalar(firstNumber(overall.totalCacheReadTokens, overall.cacheReadTokens))} cacheWrite=${scalar(firstNumber(overall.totalCacheWriteTokens, overall.cacheWriteTokens))} cacheRate=${scalar(firstNumber(overall.cacheRate))} custo=${scalar(firstNumber(overall.totalCost, overall.cost))} erros=${scalar(firstNumber(overall.failedRequests, overall.errors, overall.errorCount))}`,
    )
  }

  const providers = collectProviderTotals(value)
  if (providers.length === 0) {
    lines.push(`Consumo local por provider: ${fallback || UNAVAILABLE}`)
  } else {
    lines.push("Consumo local por provider")
    for (const provider of providers) {
      lines.push(
        `${provider.provider}: requests=${sum(provider.requests)} tokens=${sum(provider.tokens)} output=${sum(provider.output)} cache=read:${sum(provider.cacheRead)},write:${sum(provider.cacheWrite)} custo=${sum(provider.cost)} erros=${sum(provider.errors)}`,
      )
    }
  }
  return lines
}

function renderReport(usage: CommandSnapshot, stats: CommandSnapshot): string[] {
  return [
    "Consumo e quota do OMP",
    "",
    ...renderQuota(usage.value, usage.fallback),
    "",
    ...renderLocalStats(stats.value, stats.fallback),
  ]
}

export default function registerUsageReport(pi: ExtensionApi): void {
  pi.on("input", event => {
    if (event.source === "interactive" && event.text.trim() === "/usage") return { text: "/usage-report" }
    return undefined
  })

  pi.registerCommand("usage-report", {
    description: "Show local OMP consumption and provider quota",
    handler: async (_args, context) => {
      const [usage, stats] = await Promise.all([
        runReadOnly(pi, "omp", ["usage", "--json"]),
        runReadOnly(pi, "omp", ["stats", "--json"]),
      ])
      context.ui.setWidget(WIDGET_KEY, undefined, { placement: "aboveEditor" })
      pi.sendMessage({
        customType: "usage-report",
        content: renderReport(usage, stats).join("\n"),
        display: true,
        attribution: "agent",
      })
    },
  })
}
