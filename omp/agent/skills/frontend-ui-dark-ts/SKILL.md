---
name: frontend-ui-dark-ts
description: "Build dark-themed React dashboards with Tailwind CSS and Framer Motion. Use when creating dark-mode admin panels or glassmorphism UIs. Do NOT use for light themes or non-React apps."
risk: unknown
source: community
date_added: "2026-02-27"
---

# Frontend UI Dark Theme (TypeScript)

A modern dark-themed React UI system using **Tailwind CSS** and **Framer Motion**. Designed for dashboards, admin panels, and data-rich applications with glassmorphism effects and tasteful animations.

## Stack

| Package | Version | Purpose |
|---------|---------|---------|
| `react` | ^18.x | UI framework |
| `react-dom` | ^18.x | DOM rendering |
| `react-router-dom` | ^6.x | Routing |
| `framer-motion` | ^11.x | Animations |
| `clsx` | ^2.x | Class merging |
| `tailwindcss` | ^3.x | Styling |
| `vite` | ^5.x | Build tool |
| `typescript` | ^5.x | Type safety |

## Quick Start

```bash
npm create vite@latest my-app -- --template react-ts
cd my-app
npm install framer-motion clsx react-router-dom
npm install -D tailwindcss postcss autoprefixer
npx tailwindcss init -p
```

## Project Structure

```
public/
├── favicon.ico                    # Classic favicon (32x32)
├── favicon.svg                    # Modern SVG favicon
├── apple-touch-icon.png           # iOS home screen (180x180)
├── og-image.png                   # Social sharing image (1200x630)
└── site.webmanifest               # PWA manifest
src/
├── assets/
│   └── fonts/
│       ├── Segoe UI.ttf
│       ├── Segoe UI Bold.ttf
│       ├── Segoe UI Italic.ttf
│       └── Segoe UI Bold Italic.ttf
├── components/
│   ├── ui/
│   │   ├── Button.tsx
│   │   ├── Card.tsx
│   │   ├── Input.tsx
│   │   ├── Badge.tsx
│   │   ├── Dialog.tsx
│   │   ├── Tabs.tsx
│   │   └── index.ts
│   └── layout/
│       ├── AppShell.tsx
│       ├── Sidebar.tsx
│       └── PageHeader.tsx
├── styles/
│   └── globals.css
├── App.tsx
└── main.tsx
```

## Configuration

For HTML entry point, PWA webmanifest, Tailwind theme config, Vite setup, TypeScript compiler settings, and utility types, see `references/configuration.md`.

## Animation Patterns

### Framer Motion Variants

```tsx
// Fade in on mount
export const fadeIn = {
  initial: { opacity: 0 },
  animate: { opacity: 1 },
  exit: { opacity: 0 },
  transition: { duration: 0.2 },
};

// Slide up on mount
export const slideUp = {
  initial: { opacity: 0, y: 20 },
  animate: { opacity: 1, y: 0 },
  exit: { opacity: 0, y: 20 },
  transition: { duration: 0.3, ease: 'easeOut' },
};

// Scale on hover (for buttons/cards)
export const scaleOnHover = {
  whileHover: { scale: 1.02 },
  whileTap: { scale: 0.98 },
  transition: { type: 'spring', stiffness: 400, damping: 17 },
};

// Stagger children
export const staggerContainer = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: {
      staggerChildren: 0.05,
      delayChildren: 0.1,
    },
  },
};

export const staggerItem = {
  hidden: { opacity: 0, y: 10 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.2, ease: 'easeOut' },
  },
};
```

### Page Transition Wrapper

```tsx
import { motion } from 'framer-motion';
import { ReactNode } from 'react';

interface PageTransitionProps {
  children: ReactNode;
}

export function PageTransition({ children }: PageTransitionProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -20 }}
      transition={{ duration: 0.3, ease: 'easeOut' }}
    >
      {children}
    </motion.div>
  );
}
```

## Glass Effect Patterns

### Glass Card

```tsx
<div className="glass-card p-6">
  <h2 className="text-lg font-semibold text-text-primary">Card Title</h2>
  <p className="text-text-secondary mt-2">Card content goes here.</p>
</div>
```

### Glass Panel (Sidebar)

```tsx
<aside className="glass-panel w-64 h-screen p-4">
  <nav className="space-y-2">
    {/* Navigation items */}
  </nav>
</aside>
```

### Glass Modal Overlay

```tsx
<motion.div
  className="fixed inset-0 glass-overlay flex items-center justify-center z-50"
  initial={{ opacity: 0 }}
  animate={{ opacity: 1 }}
  exit={{ opacity: 0 }}
>
  <motion.div
    className="glass-card p-6 max-w-md w-full mx-4"
    initial={{ scale: 0.95, opacity: 0 }}
    animate={{ scale: 1, opacity: 1 }}
    exit={{ scale: 0.95, opacity: 0 }}
  >
    {/* Modal content */}
  </motion.div>
</motion.div>
```

## Typography

| Element | Classes |
|---------|---------|
| Page title | `text-2xl font-semibold text-text-primary` |
| Section title | `text-lg font-semibold text-text-primary` |
| Card title | `text-base font-medium text-text-primary` |
| Body text | `text-sm text-text-secondary` |
| Caption | `text-xs text-text-muted` |
| Label | `text-sm font-medium text-text-secondary` |

## Color Usage

| Use Case | Color | Class |
|----------|-------|-------|
| Primary action | Brand purple | `bg-brand text-white` |
| Primary hover | Brand hover | `hover:bg-brand-hover` |
| Page background | Neutral bg1 | `bg-neutral-bg1` |
| Card background | Neutral bg2 | `bg-neutral-bg2` |
| Elevated surface | Neutral bg3 | `bg-neutral-bg3` |
| Input background | Neutral bg2 | `bg-neutral-bg2` |
| Input focus | Neutral bg3 | `focus:bg-neutral-bg3` |
| Border default | Border default | `border-border` |
| Border subtle | Border subtle | `border-border-subtle` |
| Success | Status success | `text-status-success` |
| Warning | Status warning | `text-status-warning` |
| Error | Status error | `text-status-error` |

## References

- [references/configuration.md](references/configuration.md) — When configuring HTML entry, PWA manifest, Tailwind, Vite, TypeScript, and utility types.

---

## Related Files

- Design Tokens — Complete color system, spacing, typography scales
- Components — Button, Card, Input, Dialog, Tabs, and more
- Patterns — Page layouts, navigation, lists, forms

## When to Use
This skill is applicable to execute the workflow or actions described in the overview.

