---
name: modular-monolith
description: "Modular monolith architecture principles. Module boundaries, internal communication, shared kernel, and migration-ready design. Teaches how to build monoliths that scale without becoming big balls of mud."
risk: unknown
source: community
date_added: "2026-03-11"
---

# Modular Monolith Architecture

> Build monoliths with clear module boundaries, enforced contracts, and a path to microservices — if you ever need one.

## Use this skill when

- Designing a new application that doesn't need microservices yet
- Structuring a monolith to prevent coupling and big-ball-of-mud syndrome
- Defining module boundaries, contracts, and internal communication
- Planning a future migration path from monolith to microservices
- Refactoring an existing tangled codebase into modules

## Do not use this skill when

- You are already committed to a microservices architecture
- The project is a small script or CLI tool with no domain complexity
- You need infrastructure/DevOps guidance rather than code architecture

## Instructions

1. Identify bounded contexts and define module boundaries.
2. Establish public APIs (contracts) for each module.
3. Enforce isolation rules and dependency direction.
4. Design internal communication patterns (sync/async).
5. Validate with the modular monolith checklist.

---

## 1. Core Philosophy

### Why Modular Monolith?

```
Microservices too early = distributed monolith (worst of both worlds)
Monolith without modules = big ball of mud (unmaintainable)
Modular monolith = clean boundaries + simple deployment
```

### The Golden Rule

> **Each module must be deployable as a separate service WITHOUT code changes to its internals — only the communication layer changes.**

---

## 2. Module Boundary Definition

### What Is a Module?

A module is a **self-contained vertical slice** of the application that:

- Owns its domain logic, data, and API surface
- Communicates with other modules only through public contracts
- Can be developed and tested independently

### Boundary Discovery

```
Start with bounded contexts:
│
├── Identify core business capabilities
│   └── Each capability = potential module
│
├── Group related use cases
│   └── Use cases that share entities → same module
│
├── Check data ownership
│   └── If two features MUST share a table → same module
│   └── If they CAN use separate tables → separate modules
│
└── Validate communication
    └── If modules talk too much → merge or rethink
```

### Module Sizing Principles

| Signal                                  | Action                                |
| --------------------------------------- | ------------------------------------- |
| Module has 1-2 files                    | Too small — merge with related module |
| Module has 50+ files                    | Too big — split by subdomain          |
| Module changes with every other module  | Boundaries are wrong — re-evaluate    |
| Module can be explained in one sentence | Right size                            |

---

## 3. Canonical Structure

### Project Layout

```
src/
├── modules/
│   ├── users/
│   │   ├── api/              # Public contract (routes, DTOs)
│   │   ├── domain/           # Entities, value objects, business rules
│   │   ├── services/         # Use cases / application logic
│   │   ├── repositories/     # Data access (DB, external APIs)
│   │   ├── events/           # Events published by this module
│   │   ├── types/            # Module-specific types
│   │   └── index.ts          # Public exports ONLY
│   │
│   ├── orders/
│   │   ├── api/
│   │   ├── domain/
│   │   ├── services/
│   │   ├── repositories/
│   │   ├── events/
│   │   ├── types/
│   │   └── index.ts
│   │
│   └── notifications/
│       └── ...
│
├── shared/                   # Shared kernel (minimal!)
│   ├── types/                # Cross-module types
│   ├── events/               # Event bus / mediator
│   ├── errors/               # Base error classes
│   └── utils/                # ONLY truly shared utilities
│
├── infrastructure/           # Framework, DB, external services
│   ├── database/
│   ├── messaging/
│   ├── http/
│   └── config/
│
└── app.ts                    # Composition root
```

### File Organization Rules

| Rule                                            | Rationale                   |
| ----------------------------------------------- | --------------------------- |
| Each module has its own `index.ts`              | Single public API surface   |
| No file imports from another module's internals | Enforced encapsulation      |
| `shared/` must be minimal                       | Shared = coupled            |
| Domain logic has zero framework imports         | Portability and testability |

---

## 4. Module Communication

### Sync Communication (Direct Calls)

Use when one module needs an **immediate response** from another.

```
Module A → calls → Module B's public API (via index.ts exports)
```

**Rules:**

- Only call functions exported from `index.ts`
- Never import internal services, repositories, or domain objects
- Use DTOs at module boundaries — never raw domain entities

### Async Communication (Events)

Use when modules need to react to things **without tight coupling**.

```
Module A → publishes event → Event Bus → Module B subscribes
```

**Rules:**

- Events are immutable data objects
- Events describe what happened, not what to do
- Event handlers must be idempotent
- Use a simple in-process event bus (mediator pattern)

### Decision: Sync vs Async

```
Need immediate response?
├── Yes → Sync (public API call)
└── No
    ├── Is it a side effect? (send email, update cache)
    │   └── Async (event)
    ├── Can it fail independently?
    │   └── Async (event)
    └── Is it a notification to other modules?
        └── Async (event)
```

---

## 5. Shared Kernel Rules

The `shared/` directory is the **most dangerous part** of a modular monolith.

### What Goes in Shared

- Base error classes
- Event bus / mediator interface
- Cross-cutting types (pagination, API response envelopes)
- Authentication/authorization primitives
- Logging interfaces

### What Does NOT Go in Shared

- Business logic
- Domain entities
- Feature-specific utilities
- Database models
- Validation schemas specific to one module

### The Shared Kernel Test

> If removing this from shared would require changes in **only one module**, it doesn't belong in shared.

---

## 6. Data Isolation

### Database Strategy

| Approach                                     | When to Use                 |
| -------------------------------------------- | --------------------------- |
| **Shared DB, separate schemas**              | Starting out, team is small |
| **Shared DB, separate tables with prefixes** | Medium complexity           |
| **Separate databases per module**            | Preparing for microservices |

### Rules

- Each module owns its tables — no other module writes to them
- Cross-module data access goes through the owning module's public API
- No cross-module JOINs in SQL queries
- Foreign keys across modules: use IDs, not relations

### Data Duplication Is OK

```
Module A owns user data:
  users table: id, name, email, ...

Module B needs user name for display:
  orders table: id, user_id, user_name (denormalized)

Module B listens to UserUpdated event → updates its local copy
```

> Eventual consistency between modules is acceptable and expected.

---

## 7. Dependency Rules

### Dependency Direction

```
app.ts (composition root)
  └── imports modules
        └── modules import shared
              └── shared imports nothing from modules

NEVER:
  Module A → imports internals of → Module B
  shared/ → imports from → modules/
```

### Enforcing Boundaries

- Use ESLint import rules or TypeScript path restrictions
- `index.ts` exports only public API — everything else is internal
- Code reviews must check for boundary violations
- Consider tools like Nx module boundaries or custom lint rules

---

## 8. Module Registration & Composition Root

### The Composition Root Pattern

All modules are wired together in **one place** — the composition root (`app.ts` or `bootstrap.ts`).

```ts
// app.ts — Composition Root
import { UserModule } from "@/modules/users";
import { OrderModule } from "@/modules/orders";
import { NotificationModule } from "@/modules/notifications";
import { EventBus } from "@/shared/events";

const eventBus = new EventBus();

const userModule = new UserModule({ eventBus, db });
const orderModule = new OrderModule({ eventBus, db, userApi: userModule.api });
const notificationModule = new NotificationModule({ eventBus });

// Register routes
app.use("/api/users", userModule.routes);
app.use("/api/orders", orderModule.routes);
```

### Rules

- Modules receive dependencies via constructor (DI)
- Modules never instantiate other modules
- The composition root is the only place that knows about all modules

---

## 9. Testing Strategy

### Per-Module Testing

| Level           | Scope             | What to Test                            |
| --------------- | ----------------- | --------------------------------------- |
| **Unit**        | Domain logic      | Business rules, value objects, entities |
| **Integration** | Module API        | Public API with real DB                 |
| **Contract**    | Module boundaries | DTOs and event schemas                  |

### Cross-Module Testing

- Test event flows end-to-end
- Test module API contracts with consumer-driven tests
- Never test Module B's internals from Module A's tests

### Isolation Rule

> Each module's test suite must pass **with all other modules removed**.

---

## 10. Migration Path to Microservices

### When to Extract a Module

| Signal                                  | Action           |
| --------------------------------------- | ---------------- |
| Module needs independent scaling        | Extract          |
| Module needs different tech stack       | Extract          |
| Module has independent deployment cycle | Extract          |
| Team ownership is clearly separated     | Extract          |
| None of the above                       | Keep in monolith |

### How to Extract

```
1. Module already has clean boundaries (this skill ensures that)
2. Replace sync calls with HTTP/gRPC clients
3. Replace in-process events with message broker
4. Move module to its own repository/service
5. Deploy independently
```

> If step 1 is done right, steps 2-5 are mechanical, not architectural.

---

## 11. Anti-Patterns (Immediate Rejection)

### ❌ DON'T:

- Import internal files from another module
- Share database tables across modules
- Put business logic in `shared/`
- Skip the public API (`index.ts`) surface
- Create circular dependencies between modules
- Use a "common" module as a dumping ground
- Cross-module JOINs in SQL
- Direct database access from one module to another's tables

### ✅ DO:

- Define explicit module boundaries from day one
- Use events for side effects and notifications
- Keep `shared/` minimal and generic
- Enforce boundaries with linting rules
- Test modules in isolation
- Document module contracts

---

## 12. Modular Monolith Checklist

Before finalizing:

- [ ] Each module has a single, clear bounded context
- [ ] Modules communicate only through public APIs or events
- [ ] No cross-module internal imports
- [ ] `shared/` contains only truly shared code
- [ ] Data ownership is clear — one module per table
- [ ] Dependency direction is enforced (modules → shared, never reverse)
- [ ] Each module is independently testable
- [ ] Composition root wires everything together
- [ ] Event contracts are documented
- [ ] No circular dependencies

---

## 13. Skill Status

**Status:** Stable · Enforceable · Architecture-grade
**Intended Use:** Applications that need clean structure without microservices overhead

## When to Use

This skill is applicable to execute the workflow or actions described in the overview.
