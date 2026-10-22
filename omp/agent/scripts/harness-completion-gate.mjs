import fs from "node:fs"
import path from "node:path"
import { pathToFileURL } from "node:url"

export const MAX_CRITERIA = 50
const CRITERION_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/

function addError(errors, code, value) {
  const error = value === undefined ? code : `${code}:${value}`
  if (!errors.includes(error)) errors.push(error)
}

function criterionId(record) {
  return record && typeof record.criterionId === "string" ? record.criterionId : null
}

export function validateCompletionPayload(payload) {
  const errors = []
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    return { valid: false, errors: ["INVALID_PAYLOAD"] }
  }

  if (!Array.isArray(payload.criteria)) {
    addError(errors, "CRITERIA_REQUIRED")
  }
  if (!Array.isArray(payload.evidence)) {
    addError(errors, "EVIDENCE_REQUIRED")
  }
  if (!Array.isArray(payload.adversarial)) {
    addError(errors, "ADVERSARIAL_REQUIRED")
  }
  if (errors.length > 0 && !Array.isArray(payload.criteria)) {
    return { valid: false, errors }
  }

  const criteria = payload.criteria
  if (criteria.length < 1 || criteria.length > MAX_CRITERIA) addError(errors, "CRITERIA_COUNT")

  const declared = new Set()
  for (const criterion of criteria) {
    const id = criterion?.id
    if (typeof id !== "string" || !CRITERION_ID_PATTERN.test(id)) {
      addError(errors, "INVALID_CRITERION_ID", typeof id === "string" ? id : "missing")
      continue
    }
    if (declared.has(id)) addError(errors, "DUPLICATE_CRITERION_ID", id)
    declared.add(id)
    if (typeof criterion.text !== "string" || criterion.text.trim() === "") addError(errors, "INVALID_CRITERION_TEXT", id)
  }

  const evidenceIds = new Set()
  if (Array.isArray(payload.evidence)) {
    for (const record of payload.evidence) {
      const id = criterionId(record)
      if (!id) {
        addError(errors, "INVALID_EVIDENCE_CRITERION")
      } else if (!declared.has(id)) {
        addError(errors, "UNKNOWN_EVIDENCE_CRITERION", id)
      } else {
        evidenceIds.add(id)
      }
    }
  }
  for (const id of declared) if (!evidenceIds.has(id)) addError(errors, "MISSING_EVIDENCE", id)

  const adversarialIds = new Set()
  if (Array.isArray(payload.adversarial)) {
    for (const record of payload.adversarial) {
      const id = criterionId(record)
      if (!id) {
        addError(errors, "INVALID_ADVERSARIAL_CRITERION")
      } else if (!declared.has(id)) {
        addError(errors, "UNKNOWN_ADVERSARIAL_CRITERION", id)
      } else if (adversarialIds.has(id)) {
        addError(errors, "DUPLICATE_ADVERSARIAL_ATTEMPT", id)
      } else {
        adversarialIds.add(id)
      }
    }
  }
  for (const id of declared) if (!adversarialIds.has(id)) addError(errors, "MISSING_ADVERSARIAL_ATTEMPT", id)

  return {
    valid: errors.length === 0,
    errors,
    criterionCount: criteria.length,
  }
}

function readPayload(payloadPath) {
  try {
    return JSON.parse(fs.readFileSync(payloadPath, "utf8"))
  } catch (error) {
    return { __completionGateReadError: error.message }
  }
}

export function validateCompletionFile(payloadPath) {
  const payload = readPayload(payloadPath)
  if (payload?.__completionGateReadError) {
    return { valid: false, errors: ["PAYLOAD_UNREADABLE"], detail: payload.__completionGateReadError }
  }
  return validateCompletionPayload(payload)
}

function runCli() {
  const args = process.argv.slice(2)
  const payloadIndex = args.indexOf("--payload")
  const payloadPath = payloadIndex >= 0 ? args[payloadIndex + 1] : null
  const result = payloadPath ? validateCompletionFile(path.resolve(payloadPath)) : { valid: false, errors: ["PAYLOAD_REQUIRED"] }
  console.log(JSON.stringify(result, null, 2))
  if (!result.valid) process.exitCode = 1
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) runCli()
