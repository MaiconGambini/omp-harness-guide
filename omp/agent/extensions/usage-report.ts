type ExecResult = {
  stdout: string
  code: number
}

type InputEvent = {
  text: string
  source: string
}

type InputResult = {
  text?: string
}

type WidgetContext = {
  ui: {
    setWidget(
      key: string,
      content: string[] | undefined,
      options?: { placement: 'aboveEditor' | 'belowEditor' },
    ): void
  }
}

type CommandContext = WidgetContext

type ExtensionApi = {
  exec(command: string, args: string[]): Promise<ExecResult>
  sendMessage(
    message: {
      customType: string
      content: string
      display: boolean
      attribution: 'agent'
    },
  ): void
  registerCommand(
    name: string,
    definition: {
      description: string
      handler: (args: string, context: CommandContext) => Promise<void>
    },
  ): void
  on(
    event: 'input',
    handler: (event: InputEvent, context: WidgetContext) => InputResult | undefined,
  ): void
}

type JsonRecord = Record<string, unknown>

const WIDGET_KEY = 'usage-report'
const UNAVAILABLE = 'indisponível'

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function jsonEnd(text: string, start: number): number | undefined {
  const stack: string[] = []
  let quoted = false
  let escaped = false

  for (let index = start; index < text.length; index += 1) {
    const character = text[index]
    if (quoted) {
      if (escaped) escaped = false
      else if (character === '\\') escaped = true
      else if (character === '"') quoted = false
      continue
    }
    if (character === '"') {
      quoted = true
      continue
    }
    if (character === '{' || character === '[') stack.push(character)
    else if (character === '}' || character === ']') {
      const opening = stack.pop()
      if ((character === '}' && opening !== '{') || (character === ']' && opening !== '[')) return undefined
      if (stack.length === 0) return index + 1
    }
  }
  return undefined
}

function parseJson(text: string): unknown | undefined {
  const trimmed = text.trim()
  if (!trimmed) return undefined
  try {
    return JSON.parse(trimmed) as unknown
  } catch {
    for (let index = 0; index < trimmed.length; index += 1) {
      if (trimmed[index] !== '{' && trimmed[index] !== '[') continue
      const end = jsonEnd(trimmed, index)
      if (end === undefined) continue
      try {
        return JSON.parse(trimmed.slice(index, end)) as unknown
      } catch {
        // Try the next balanced JSON value.
      }
    }
  }
  return undefined
}

async function readJson(api: ExtensionApi, command: string): Promise<unknown | undefined> {
  try {
    const result = await api.exec('omp', [command, '--json'])
    if (result.code !== 0) return undefined
    return parseJson(result.stdout)
  } catch {
    return undefined
  }
}

function valueAt(record: JsonRecord | undefined, ...keys: string[]): unknown {
  let current: unknown = record
  for (const key of keys) {
    if (!isRecord(current)) return undefined
    current = current[key]
  }
  return current
}

function formatNumber(value: unknown): string {
  return typeof value === 'number' && Number.isFinite(value)
    ? new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 0 }).format(value)
    : UNAVAILABLE
}

function formatMoney(value: unknown): string {
  return typeof value === 'number' && Number.isFinite(value)
    ? new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'USD' }).format(value)
    : UNAVAILABLE
}

function formatPercent(value: unknown): string {
  return typeof value === 'number' && Number.isFinite(value)
    ? `${(value * 100).toFixed(1).replace('.', ',')}%`
    : UNAVAILABLE
}

function formatReset(value: unknown): string {
  if (typeof value === 'number' && Number.isFinite(value)) {
    const date = new Date(value)
    return Number.isNaN(date.getTime())
      ? UNAVAILABLE
      : new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short' }).format(date)
  }
  return typeof value === 'string' && value.trim() ? value : UNAVAILABLE
}

function field(label: string, value: string): string {
  return `- ${label}: ${value}`
}

function reportValue(value: unknown, formatter: (value: unknown) => string = String): string {
  if (value === undefined || value === null) return UNAVAILABLE
  return formatter(value)
}

function totalTokens(overall: JsonRecord | undefined): unknown {
  if (!overall) return undefined
  const fields = [overall.totalInputTokens, overall.totalOutputTokens]
  if (!fields.some((value) => typeof value === 'number' && Number.isFinite(value))) return undefined
  return fields.reduce((sum, value) => sum + (typeof value === 'number' && Number.isFinite(value) ? value : 0), 0)
}

function metricLine(label: string, value: unknown, formatter: (value: unknown) => string = String): string {
  return field(label, reportValue(value, formatter))
}

function localMetrics(record: JsonRecord | undefined, provider = false): string[] {
  const entryLines = provider ? [] : [metricLine('entrada', record?.totalInputTokens, formatNumber)]
  const cacheLines = provider
    ? [
        metricLine('cache read', record?.totalCacheReadTokens, formatNumber),
        metricLine('cache write', record?.totalCacheWriteTokens, formatNumber),
      ]
    : [
        metricLine('cache read', record?.totalCacheReadTokens, formatNumber),
        metricLine('cache write', record?.totalCacheWriteTokens, formatNumber),
        metricLine('cache', record?.cacheRate, formatPercent),
      ]
  return [
    metricLine('requests', record?.totalRequests, formatNumber),
    metricLine('tokens', totalTokens(record), formatNumber),
    ...entryLines,
    metricLine('output', record?.totalOutputTokens, formatNumber),
    ...cacheLines,
    metricLine('custo', record?.totalCost, formatMoney),
    metricLine('erros', record?.failedRequests, formatNumber),
  ]
}

function providerName(value: unknown): string {
  return typeof value === 'string' && value.trim() ? value : UNAVAILABLE
}

function asArray(value: unknown): JsonRecord[] {
  return Array.isArray(value) ? value.filter(isRecord) : []
}

function providerMetrics(stats: JsonRecord | undefined): Map<string, JsonRecord> {
  const result = new Map<string, JsonRecord>()
  for (const item of asArray(stats?.byModel)) {
    const name = providerName(item.provider)
    const current = result.get(name) ?? {}
    for (const [key, value] of Object.entries(item)) {
      if (key === 'cacheRate' || key === 'errorRate') continue
      if (typeof value === 'number' && Number.isFinite(value)) {
        const previous = current[key]
        current[key] = typeof previous === 'number' ? previous + value : value
      } else if (current[key] === undefined) {
        current[key] = value
      }
    }
    result.set(name, current)
  }
  return result
}

function limitValue(amount: JsonRecord | undefined, kind: 'used' | 'remaining'): string {
  const fraction = amount?.[`${kind}Fraction`]
  if (fraction !== undefined) return formatPercent(fraction)
  return amount?.[kind] === undefined ? UNAVAILABLE : formatNumber(amount[kind])
}

function renderAccount(report: JsonRecord): string[] {
  const metadata = isRecord(report.metadata) ? report.metadata : undefined
  const lines = [
    `- Provider: ${providerName(report.provider)}`,
    `  E-mail: ${reportValue(metadata?.email)}`,
    `  Plano: ${reportValue(metadata?.planType)}`,
  ]
  const limits = asArray(report.limits)
  if (limits.length === 0) {
    lines.push('  Limites: indisponível')
    return lines
  }
  for (const limit of limits) {
    const amount = isRecord(limit.amount) ? limit.amount : undefined
    lines.push(
      `  Limite ${reportValue(limit.label)}: usado ${limitValue(amount, 'used')} · restante ${limitValue(amount, 'remaining')} · reset ${formatReset(valueAt(limit, 'window', 'resetsAt'))}`,
    )
  }
  return lines
}

function renderReport(statsValue: unknown, usageValue: unknown): string[] {
  const stats = isRecord(statsValue) ? statsValue : undefined
  const usage = isRecord(usageValue) ? usageValue : undefined
  const overall = isRecord(stats?.overall) ? stats.overall : undefined
  const providers = providerMetrics(stats)
  for (const report of asArray(usage?.reports)) providers.set(providerName(report.provider), providers.get(providerName(report.provider)) ?? {})

  const lines = ['Consumo e quota do OMP', '', 'Consumo local geral']
  lines.push(...localMetrics(overall, false))
  lines.push('', 'Consumo local por provider')
  if (providers.size === 0) {
    lines.push(`- Provider: ${UNAVAILABLE}`, ...localMetrics(undefined, true))
  } else {
    for (const [name, metrics] of providers) {
      lines.push(`- Provider: ${name}`, ...localMetrics(metrics, true))
    }
  }

  lines.push('', 'Quota externa por conta')
  const reports = asArray(usage?.reports)
  if (reports.length === 0) {
    lines.push(`- Provider: ${UNAVAILABLE}`, `  E-mail: ${UNAVAILABLE}`, `  Plano: ${UNAVAILABLE}`, '  Limites: indisponível')
  } else {
    for (const report of reports) lines.push(...renderAccount(report))
  }
  return lines
}

export default function registerUsageReport(pi: ExtensionApi): void {
  pi.registerCommand('usage-report', {
    description: 'Exibe consumo local e quota externa do OMP.',
    handler: async (_args, context) => {
      const [usage, stats] = await Promise.all([readJson(pi, 'usage'), readJson(pi, 'stats')])
      const report = renderReport(stats, usage)
      context.ui.setWidget(WIDGET_KEY, undefined)
      pi.sendMessage({
        customType: WIDGET_KEY,
        content: report.join('\n'),
        display: true,
        attribution: 'agent',
      })
    },
  })

  pi.on('input', (event) => {
    if (event.source === 'interactive' && event.text.trim() === '/usage') return { text: '/usage-report' }
    return undefined
  })
}
