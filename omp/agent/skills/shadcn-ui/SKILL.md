---
name: shadcn-ui
description: "Customize and compose accessible shadcn/ui components with Tailwind CSS in Next.js. Use when building UI with shadcn/ui in React. Do NOT use for non-React apps or component libraries like MUI."
risk: unknown
source: community
date_added: "2026-03-11"
---

# shadcn/ui Development

> Build production-grade UIs with shadcn/ui, Tailwind CSS, and Radix UI primitives in Next.js + TypeScript.
> **Own your components — shadcn/ui is copied into your codebase, not installed as a dependency.**

## Use this skill when

- Building UI with shadcn/ui components in a Next.js + TypeScript project
- Customizing shadcn/ui components for specific design requirements
- Designing component architecture and theming with Tailwind CSS
- Choosing and composing accessible UI patterns from the shadcn/ui catalog

## Do not use this skill when

- You are using MUI, Chakra UI, or another component library
- You need backend or API architecture guidance
- You are working on a non-React or non-Tailwind project

## Instructions

1. Identify the UI requirement and find the matching shadcn/ui component.
2. Install it via CLI (`npx shadcn@latest add <component>`).
3. Customize the component source to match design requirements.
4. Compose components following the patterns in this skill.

---

## 1. Core Philosophy

### What Is shadcn/ui?

```
shadcn/ui is NOT a component library.
It is a collection of reusable components that you COPY into your project.

You own the code:
├── Components live in YOUR codebase (src/components/ui/)
├── You can modify them freely
├── No version lock-in
├── Built on Radix UI primitives (accessible by default)
└── Styled with Tailwind CSS (utility-first)
```

### Why shadcn/ui?

| Advantage           | Detail                                        |
| ------------------- | --------------------------------------------- |
| **Ownership**       | Code lives in your repo — no hidden behavior  |
| **Accessibility**   | Built on Radix UI — WCAG compliant by default |
| **Customization**   | Full control over styling and behavior        |
| **No bundle bloat** | Only include components you use               |
| **TypeScript**      | Fully typed out of the box                    |
| **Tailwind native** | Consistent with your existing Tailwind setup  |

---

## 2. Project Setup

### Installation

```bash
# Initialize shadcn/ui in your Next.js project
npx shadcn@latest init
```

### Configuration (`components.json`)

```json
{
  "$schema": "https://ui.shadcn.com/schema.json",
  "style": "new-york",
  "rsc": true,
  "tsx": true,
  "tailwind": {
    "config": "tailwind.config.ts",
    "css": "src/app/globals.css",
    "baseColor": "neutral",
    "cssVariables": true
  },
  "aliases": {
    "components": "@/components",
    "utils": "@/lib/utils",
    "ui": "@/components/ui",
    "hooks": "@/hooks",
    "lib": "@/lib"
  }
}
```

### Adding Components

```bash
# Add individual components
npx shadcn@latest add button
npx shadcn@latest add card
npx shadcn@latest add dialog
npx shadcn@latest add form

# Add multiple at once
npx shadcn@latest add button card dialog form input label
```

---

## 3. File Structure

### Canonical Layout

```
src/
├── components/
│   ├── ui/                    # shadcn/ui base components (auto-generated)
│   │   ├── button.tsx
│   │   ├── card.tsx
│   │   ├── dialog.tsx
│   │   ├── dropdown-menu.tsx
│   │   ├── form.tsx
│   │   ├── input.tsx
│   │   ├── label.tsx
│   │   ├── select.tsx
│   │   ├── table.tsx
│   │   ├── toast.tsx
│   │   └── ...
│   │
│   ├── composed/              # Your composed/custom components
│   │   ├── data-table.tsx     # Table + pagination + sorting
│   │   ├── confirm-dialog.tsx # Dialog + form + actions
│   │   ├── search-input.tsx   # Input + debounce + icon
│   │   └── file-upload.tsx    # Dropzone + preview + progress
│   │
│   └── layout/                # Layout components
│       ├── header.tsx
│       ├── sidebar.tsx
│       └── footer.tsx
│
├── lib/
│   └── utils.ts               # cn() utility (auto-generated)
│
└── hooks/
    ├── use-toast.ts           # Toast hook (auto-generated)
    └── use-mobile.ts
```

### Organization Rules

| Directory              | Purpose                                 | Who Creates            |
| ---------------------- | --------------------------------------- | ---------------------- |
| `components/ui/`       | Base shadcn components                  | CLI (`npx shadcn add`) |
| `components/composed/` | Your business components built from ui/ | You                    |
| `components/layout/`   | Page layout and navigation              | You                    |
| `lib/utils.ts`         | `cn()` and shared utilities             | CLI + You              |

> **Never modify files in `ui/` unless you are intentionally customizing the base component.** For custom behavior, compose in `composed/`.

---

## 4. The `cn()` Utility

### What It Does

```ts
// lib/utils.ts (auto-generated)
import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
```

### Usage Pattern

```tsx
import { cn } from "@/lib/utils";

// Merge base classes with conditional and override classes
<div
  className={cn(
    "flex items-center gap-2 rounded-md border p-4",
    isActive && "border-primary bg-primary/10",
    className, // Allow parent to override
  )}
/>;
```

### Rules

- Always use `cn()` for class merging — never concatenate strings
- Always accept `className` prop for composability
- Tailwind Merge resolves conflicts (`p-2` + `p-4` → `p-4`)

---

## References

- [references/customization-patterns.md](references/customization-patterns.md) — When extending components with CVA variants or composing primitives.
- [references/theming.md](references/theming.md) — When configuring CSS variables, dark mode, or next-themes provider.
- [references/forms.md](references/forms.md) — When building forms with React Hook Form and Zod validation.
- [references/data-table.md](references/data-table.md) — When implementing data tables with TanStack Table.
- [references/recipes.md](references/recipes.md) — When implementing toasts, command palette, and sheet panels.

---

## 10. Responsive Design

### Breakpoint Strategy

```tsx
// Tailwind responsive prefixes
<div className="
  grid
  grid-cols-1       // Mobile: 1 column
  sm:grid-cols-2    // ≥640px: 2 columns
  md:grid-cols-3    // ≥768px: 3 columns
  lg:grid-cols-4    // ≥1024px: 4 columns
  gap-4
">
```

### Mobile-First Sidebar

```tsx
// Desktop: persistent sidebar
// Mobile: sheet (slide-over)
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Menu } from "lucide-react";

export function AppSidebar({ children }: { children: React.ReactNode }) {
  return (
    <>
      {/* Mobile */}
      <Sheet>
        <SheetTrigger asChild className="md:hidden">
          <Button variant="ghost" size="icon">
            <Menu className="h-5 w-5" />
          </Button>
        </SheetTrigger>
        <SheetContent side="left" className="p-0">
          <SidebarContent />
        </SheetContent>
      </Sheet>

      {/* Desktop */}
      <aside className="hidden md:flex md:w-64 md:flex-col md:border-r">
        <SidebarContent />
      </aside>
    </>
  );
}
```

---

## 11. Accessibility Rules

### Built-in Accessibility (Radix UI)

shadcn/ui components inherit Radix UI accessibility:

| Feature               | Automatic |
| --------------------- | --------- |
| Keyboard navigation   | Yes       |
| Focus management      | Yes       |
| ARIA attributes       | Yes       |
| Screen reader support | Yes       |
| Escape to close       | Yes       |
| Focus trap in dialogs | Yes       |

### Your Responsibilities

| Responsibility    | How                                                      |
| ----------------- | -------------------------------------------------------- |
| Meaningful labels | Use `<FormLabel>` or `aria-label`                        |
| Color contrast    | Meet WCAG AA (4.5:1 for text)                            |
| Focus visibility  | Don't remove `focus-visible` ring                        |
| Loading states    | Use `aria-busy` and skeleton components                  |
| Error messages    | Use `<FormMessage>` — it's linked via `aria-describedby` |

---

## 12. Performance

### Bundle Impact

- shadcn/ui adds **zero runtime dependency** — it's just your code
- Radix primitives are tree-shakeable
- Only install components you use

### Optimization Patterns

| Pattern                    | Details                                          |
| -------------------------- | ------------------------------------------------ |
| Lazy load heavy components | Dialogs, sheets, data tables                     |
| Use Server Components      | Cards, tables, layout — anything non-interactive |
| Minimize `"use client"`    | Only for interactive components                  |
| Use `React.memo`           | For list items in large data tables              |
| Virtualize long lists      | Use `@tanstack/react-virtual` with shadcn Table  |

---

## 13. Anti-Patterns (Immediate Rejection)

### ❌ DON'T:

- Install shadcn/ui as an npm package — it's copied, not installed
- Modify `ui/` components without clear intention — compose instead
- Use raw HTML elements when a shadcn component exists
- Skip the `cn()` utility for class merging
- Use inline styles instead of Tailwind classes
- Import from `@radix-ui` directly — use the shadcn wrapper
- Ignore dark mode — always test both themes
- Hardcode colors instead of using CSS variables

### ✅ DO:

- Use the CLI to add components (`npx shadcn@latest add`)
- Compose complex components from `ui/` primitives
- Always accept and forward `className` prop
- Use CSS variables for theming
- Use `cn()` for all class merging
- Follow the Form pattern with React Hook Form + Zod
- Keep `ui/` components close to their original form
- Test keyboard navigation and screen reader behavior

---

## 14. shadcn/ui Checklist

Before shipping:

- [ ] Components installed via CLI, not manually created
- [ ] `cn()` used for all class merging
- [ ] Dark mode works correctly
- [ ] Forms use React Hook Form + Zod pattern
- [ ] Custom components live in `composed/`, not `ui/`
- [ ] `className` prop accepted and forwarded
- [ ] Keyboard navigation tested
- [ ] Focus states visible
- [ ] Responsive design verified on mobile
- [ ] Only needed components are installed

---

## 15. Skill Status

**Status:** Stable · Enforceable · Production-grade
**Intended Use:** Next.js + TypeScript applications using shadcn/ui for component architecture

## When to Use

This skill is applicable to execute the workflow or actions described in the overview.

