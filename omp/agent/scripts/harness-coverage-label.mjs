// Leaf module: no imports from gate/adapters/findings/ship-evidence, so the gate and the PR body
// can share the coverage label without an import cycle (gate -> adapters -> findings -> ship-evidence).
// Mirrors STATUS.UNAVAILABLE / NOT_CONFIGURED / NOT_APPLICABLE in harness-quality-gate.mjs.
const NOT_APPLICABLE = "not_applicable"
const UNMEASURED_STATUSES = ["unavailable", "not_configured", NOT_APPLICABLE]
const isUnmeasured = (status) => UNMEASURED_STATUSES.includes(status)

/**
 * Derives coverage numbers and human label from measurement coverage or rows:
 * - measured: metrics with status pass/fail/observe
 * - total: all declared metrics, excluding not_applicable
 * - ratio: measured / total (or null if total is 0)
 * - unmeasuredMajority: true when total > 0 and ratio < 0.5
 */
export function computeCoverageLabel(coverageOrReport) {
  const coverage = coverageOrReport?.measurementCoverage ?? coverageOrReport ?? {}
  let measured = 0
  let total = 0

  if (Array.isArray(coverageOrReport?.rows) && coverageOrReport.measurementCoverage === undefined && coverage.total === undefined) {
    const rows = coverageOrReport.rows
    const notApplicable = rows.filter((r) => r.status === NOT_APPLICABLE).length
    measured = rows.filter((r) => !isUnmeasured(r.status)).length
    total = Math.max(0, rows.length - notApplicable)
  } else {
    measured = typeof coverage.measured === "number" ? coverage.measured : 0
    const rawTotal = typeof coverage.total === "number" ? coverage.total : 0
    const notApplicable = typeof coverage.notApplicable === "number" ? coverage.notApplicable : 0
    total = Math.max(0, rawTotal - notApplicable)
  }

  const exactRatio = total === 0 ? null : measured / total
  const ratio = exactRatio === null ? null : Math.round(exactRatio * 1000) / 1000
  const unmeasuredMajority = exactRatio !== null && exactRatio < 0.5

  return {
    measured,
    total,
    ratio,
    unmeasuredMajority,
  }
}
