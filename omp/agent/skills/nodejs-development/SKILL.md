---
name: nodejs-development
description: "Master Node.js runtime internals, streams, worker threads, and event loops. Use when building or debugging Node.js backends. Do NOT use for framework logic, preferring backend-dev-guidelines."
risk: unknown
source: community
date_added: "2026-03-11"
---

# Node.js Development

> Node.js runtime mastery for production-grade server-side applications.
> **Understand the runtime, don't just use the framework.**

## Use this skill when

- Building or architecting Node.js backend services
- Debugging Node.js performance, memory, or event loop issues
- Choosing patterns for concurrency, streaming, or error handling in Node.js
- Configuring Node.js runtime for production deployment

## Do not use this skill when

- You need framework-specific guidance (use backend-dev-guidelines for Express, python-patterns for Python)
- You are working exclusively on frontend/browser JavaScript
- You need infrastructure/DevOps guidance without Node.js specifics

## Instructions

1. Understand the runtime constraints and requirements.
2. Choose appropriate concurrency and I/O patterns.
3. Implement with proper error handling and observability.
4. Profile, optimize, and secure for production.

---

## 1. Event Loop Fundamentals

### Event Loop Phases

```
   ┌───────────────────────────┐
┌─→│         timers            │ ← setTimeout, setInterval
│  └──────────┬────────────────┘
│  ┌──────────┴────────────────┐
│  │     pending callbacks     │ ← I/O callbacks deferred
│  └──────────┬────────────────┘
│  ┌──────────┴────────────────┐
│  │       idle, prepare       │ ← internal use
│  └──────────┬────────────────┘
│  ┌──────────┴────────────────┐
│  │         poll              │ ← I/O events (most work happens here)
│  └──────────┬────────────────┘
│  ┌──────────┴────────────────┐
│  │         check             │ ← setImmediate
│  └──────────┬────────────────┘
│  ┌──────────┴────────────────┐
│  │     close callbacks       │ ← socket.on('close')
│  └──────────┬────────────────┘
└─────────────┘
```

### Critical Rules

- **Never block the event loop** — no synchronous I/O in request handlers
- `process.nextTick()` runs before any I/O — use sparingly
- `setImmediate()` runs after I/O — prefer over `setTimeout(fn, 0)`
- Long-running CPU tasks must go to Worker Threads

### Event Loop Blocking Detection

| Symptom                 | Cause                        | Fix                                |
| ----------------------- | ---------------------------- | ---------------------------------- |
| High response latency   | Sync I/O in hot path         | Use async alternatives             |
| Uneven response times   | CPU-bound work in event loop | Offload to worker threads          |
| Memory growing steadily | Event listener leaks         | Track and remove listeners         |
| Timeouts under load     | Event loop lag               | Profile with `--prof` or clinic.js |

---

## 2. Async Patterns

### The Async Hierarchy

```
Pattern selection (prefer top to bottom):
│
├── async/await        ← Default. Clean, readable, debuggable.
├── Promises           ← When composing with Promise.all/race/allSettled
├── Streams            ← For large data / backpressure
├── Event Emitters     ← For pub/sub within process
└── Callbacks          ← Legacy only. Never write new callback code.
```

### Promise Composition

| Pattern                | Use Case                                     |
| ---------------------- | -------------------------------------------- |
| `Promise.all()`        | Run N tasks in parallel, fail if any fails   |
| `Promise.allSettled()` | Run N tasks in parallel, collect all results |
| `Promise.race()`       | First to resolve/reject wins                 |
| `Promise.any()`        | First to resolve wins, ignore rejections     |

### Concurrency Control

```ts
// Process items with limited concurrency (e.g., 5 at a time)
async function processWithConcurrency<T, R>(
  items: T[],
  fn: (item: T) => Promise<R>,
  concurrency: number,
): Promise<R[]> {
  const results: R[] = [];
  const executing = new Set<Promise<void>>();

  for (const item of items) {
    const promise = fn(item).then((result) => {
      results.push(result);
      executing.delete(promise);
    });
    executing.add(promise);

    if (executing.size >= concurrency) {
      await Promise.race(executing);
    }
  }

  await Promise.all(executing);
  return results;
}
```

---

## 3. Error Handling

### Error Strategy

```
Error hierarchy:
│
├── Operational errors (expected, recoverable)
│   ├── Validation errors → 400
│   ├── Not found → 404
│   ├── External service timeout → retry or 503
│   └── Rate limit exceeded → 429
│
└── Programmer errors (bugs, unexpected)
    ├── TypeError, ReferenceError → fix the code
    ├── Assertion failures → fix the logic
    └── Unhandled rejection → crash and restart
```

### Critical Rules

| Rule                          | Why                                                        |
| ----------------------------- | ---------------------------------------------------------- |
| Always catch async errors     | Unhandled rejections crash Node 16+                        |
| Use custom error classes      | Enable typed error handling                                |
| Never swallow errors silently | Silent failures are the worst bugs                         |
| Log with context              | Error alone is useless without request ID, user, operation |
| Crash on programmer errors    | Restarting is safer than running in unknown state          |

### Process-Level Safety Nets

```ts
// These are LAST RESORTS, not error handling strategies
process.on("uncaughtException", (err) => {
  logger.fatal({ err }, "Uncaught exception — shutting down");
  process.exit(1);
});

process.on("unhandledRejection", (reason) => {
  logger.fatal({ reason }, "Unhandled rejection — shutting down");
  process.exit(1);
});
```

### Graceful Shutdown

```ts
async function gracefulShutdown(signal: string) {
  logger.info(`Received ${signal}. Starting graceful shutdown...`);

  // 1. Stop accepting new requests
  server.close();

  // 2. Finish in-flight requests (with timeout)
  await Promise.race([
    finishPendingRequests(),
    setTimeout(10_000), // Force exit after 10s
  ]);

  // 3. Close database connections
  await db.disconnect();

  // 4. Flush logs and metrics
  await logger.flush();

  process.exit(0);
}

process.on("SIGTERM", () => gracefulShutdown("SIGTERM"));
process.on("SIGINT", () => gracefulShutdown("SIGINT"));
```

---

## 4. Streams & Worker Threads

For stream pipelines, backpressure management, and worker thread CPU offloading patterns, see `references/streams-and-workers.md`.

---

## 6. Security

### Input Validation

- Validate ALL external input — body, query, params, headers
- Use Zod, Joi, or class-validator — never trust raw input
- Sanitize strings to prevent injection
- Limit request body size (`express.json({ limit: '1mb' })`)

### Common Vulnerabilities

| Vulnerability           | Prevention                                                |
| ----------------------- | --------------------------------------------------------- |
| **Prototype Pollution** | Freeze prototypes, use `Object.create(null)` for maps     |
| **ReDoS**               | Avoid complex regex, use `re2` for user-supplied patterns |
| **Path Traversal**      | Use `path.resolve()` + validate against base directory    |
| **Dependency Attacks**  | Audit with `npm audit`, use lockfiles, pin versions       |
| **SSRF**                | Validate/allowlist outbound URLs, block private IPs       |
| **Timing Attacks**      | Use `crypto.timingSafeEqual()` for secret comparison      |

### Security Headers

```ts
// Use helmet for sensible defaults
import helmet from "helmet";
app.use(helmet());
```

### Environment & Secrets

- Never commit secrets to source control
- Use environment variables or secret managers
- Validate required env vars at startup — fail fast

---

## 7. Performance

### Profiling Tools

| Tool                        | Use For                              |
| --------------------------- | ------------------------------------ |
| `--prof` + `--prof-process` | V8 CPU profiling                     |
| `clinic.js`                 | Event loop, I/O, and memory analysis |
| `0x`                        | Flamegraph generation                |
| `node --inspect`            | Chrome DevTools debugging            |
| `process.memoryUsage()`     | Memory snapshot                      |
| `perf_hooks`                | Precise timing measurements          |

### Memory Management

- Avoid global caches that grow unbounded — use LRU
- Watch for closure leaks in event handlers
- Monitor heap with `--max-old-space-size` and process metrics
- Use `WeakRef` and `FinalizationRegistry` for advanced patterns

### Performance Principles

| Principle            | Details                                               |
| -------------------- | ----------------------------------------------------- |
| **Avoid sync I/O**   | `readFileSync` in startup only, never in request path |
| **Pool connections** | DB, HTTP clients — never create per-request           |
| **Buffer wisely**    | Don't load entire files into memory — use streams     |
| **Cache smartly**    | Cache computation results, invalidate on change       |
| **Cluster mode**     | Use `node:cluster` or PM2 to utilize all CPU cores    |

---

## 8. Module System

### ESM vs CommonJS

```
ESM (prefer for new projects):
├── import/export syntax
├── Top-level await
├── Better tree-shaking
├── "type": "module" in package.json
└── .mjs extension (or .ts with bundler)

CommonJS (legacy):
├── require/module.exports
├── Synchronous loading
├── .cjs extension
└── Still widely used in ecosystem
```

### Rules

- New projects: use ESM
- Existing CJS projects: migrate incrementally or stay CJS
- Never mix require() and import in the same file
- Use `"type": "module"` in `package.json` for ESM

---

## 9. Logging & Observability

### Structured Logging

```ts
// Use pino for performance
import pino from "pino";

const logger = pino({
  level: process.env.LOG_LEVEL || "info",
  transport:
    process.env.NODE_ENV === "development"
      ? { target: "pino-pretty" }
      : undefined,
});

// Always log with context
logger.info({ userId, orderId, duration }, "Order processed");
```

### Logging Rules

| Rule                      | Why                             |
| ------------------------- | ------------------------------- |
| JSON format in production | Machine-parseable, aggregatable |
| Pretty print in dev only  | Human readability               |
| Include correlation IDs   | Trace requests across services  |
| Log levels matter         | DEBUG for dev, INFO+ for prod   |
| Never log secrets         | Passwords, tokens, PII          |

### Health Checks

```ts
app.get("/health", (req, res) => {
  res.json({ status: "ok", uptime: process.uptime() });
});

app.get("/ready", async (req, res) => {
  const dbOk = await db.ping().catch(() => false);
  const status = dbOk ? 200 : 503;
  res.status(status).json({ db: dbOk });
});
```

## 10. Production Configuration & Setup

For production runtime settings, memory caps, signals, and package management defaults, see `references/production-setup.md`.

---

## 12. Anti-Patterns (Immediate Rejection)

### ❌ DON'T:

- Block the event loop with synchronous I/O in request handlers
- Swallow errors or use empty catch blocks
- Use `var` or untyped JavaScript in new code
- Create unbounded caches or event listeners
- Use `eval()` or `new Function()` with user input
- Skip input validation on any external data
- Ignore process signals (SIGTERM, SIGINT)
- Use `console.log` in production — use structured logging
- Spawn child processes with unsanitized user input

### ✅ DO:

- Use async/await for all I/O operations
- Implement graceful shutdown
- Validate environment variables at startup
- Use worker threads for CPU-bound work
- Pool database and HTTP connections
- Set request body size limits
- Use TypeScript strict mode
- Monitor event loop lag in production

---

## References

- [references/streams-and-workers.md](references/streams-and-workers.md) — When implementing Node.js streams or CPU-intensive worker threads.
- [references/production-setup.md](references/production-setup.md) — When configuring production runtime settings, memory limits, and package management defaults.

---

## 13. Node.js Development Checklist

Before deploying:

- [ ] No synchronous I/O in request paths
- [ ] All errors are caught and logged with context
- [ ] Graceful shutdown handles SIGTERM/SIGINT
- [ ] Input validation on all external data
- [ ] Health and readiness endpoints exist
- [ ] Structured logging with correlation IDs
- [ ] Security headers enabled (helmet)
- [ ] Environment variables validated at startup
- [ ] Dependencies audited for vulnerabilities
- [ ] Memory and event loop monitored

---

## 14. Skill Status

**Status:** Stable · Enforceable · Production-grade
**Intended Use:** Node.js backend services running in production with real traffic

## When to Use

This skill is applicable to execute the workflow or actions described in the overview.

