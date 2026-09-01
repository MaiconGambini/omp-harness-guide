import { execFileSync } from "node:child_process"
import { pathExists } from "./harness-common.mjs"

function runGit(args) {
  try {
    return execFileSync("git", args, { encoding: "utf8" }).trim()
  } catch {
    return ""
  }
}

function worktreeStatus(worktreePath) {
  if (!pathExists(worktreePath)) return "missing"
  const status = runGit(["-C", worktreePath, "status", "--short"])
  if (!status) return "clean"
  return "dirty"
}

function parsePorcelainWorktrees(raw) {
  const worktrees = []
  let current = null
  // Finding-1: split on \r?\n and strip any trailing \r so Windows CRLF output
  // does not leave a carriage return on the path (which made every worktree
  // report as "missing" on Windows).
  for (const rawLine of raw.split(/\r?\n/)) {
    const line = rawLine.replace(/\r$/, "")
    if (line.startsWith("worktree ")) {
      if (current) worktrees.push(current)
      current = { path: line.slice("worktree ".length), head: "", branch: "detached" }
    } else if (current && line.startsWith("HEAD ")) {
      current.head = line.slice("HEAD ".length)
    } else if (current && line.startsWith("branch ")) {
      current.branch = line.slice("branch ".length).replace(/^refs\/heads\//, "")
    }
  }
  if (current) worktrees.push(current)
  return worktrees
}

function describeAction(status) {
  if (status === "clean") return "keep-or-prune-after-review"
  if (status === "dirty") return "keep-salvage-first"
  return "inspect-manually"
}

const raw = runGit(["worktree", "list", "--porcelain"])
const worktrees = parsePorcelainWorktrees(raw)
  .map((item) => ({ ...item, status: worktreeStatus(item.path) }))
  .map((item) => ({ ...item, recommendedAction: describeAction(item.status) }))

console.log(JSON.stringify({ status: "PASS", worktrees }, null, 2))
