---
name: shadcn-ui
description: "shadcn/ui component patterns for Next.js + TypeScript applications. Component customization, theming, Tailwind CSS integration, accessible UI patterns, and production-ready component architecture."
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

## 5. Component Customization Patterns

### Pattern 1: Extending with Variants (CVA)

```tsx
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const badgeVariants = cva(
  "inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold transition-colors",
  {
    variants: {
      variant: {
        default: "border-transparent bg-primary text-primary-foreground",
        secondary: "border-transparent bg-secondary text-secondary-foreground",
        destructive:
          "border-transparent bg-destructive text-destructive-foreground",
        outline: "text-foreground",
        success: "border-transparent bg-green-500 text-white",
        warning: "border-transparent bg-yellow-500 text-white",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  },
);

interface BadgeProps
  extends
    React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, ...props }: BadgeProps) {
  return (
    <div className={cn(badgeVariants({ variant }), className)} {...props} />
  );
}
```

### Pattern 2: Composing Multiple Components

```tsx
// components/composed/confirm-dialog.tsx
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";

interface ConfirmDialogProps {
  title: string;
  description: string;
  onConfirm: () => void;
  trigger: React.ReactNode;
  variant?: "default" | "destructive";
}

export function ConfirmDialog({
  title,
  description,
  onConfirm,
  trigger,
  variant = "default",
}: ConfirmDialogProps) {
  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>{trigger}</AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{title}</AlertDialogTitle>
          <AlertDialogDescription>{description}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction
            onClick={onConfirm}
            className={
              variant === "destructive"
                ? "bg-destructive text-destructive-foreground hover:bg-destructive/90"
                : ""
            }
          >
            Confirm
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
```

### Pattern 3: Server Components + Client Components

```tsx
// Server Component — fetches data
import { DataTable } from "@/components/composed/data-table";
import { columns } from "./columns";

export default async function UsersPage() {
  const users = await getUsers(); // Server-side fetch

  return (
    <div className="container mx-auto py-10">
      <DataTable columns={columns} data={users} />
    </div>
  );
}

// columns.tsx — column definitions (can be server)
// data-table.tsx — interactive table ("use client")
```

---

## 6. Theming & Dark Mode

### CSS Variables (Default Approach)

```css
/* globals.css */
@layer base {
  :root {
    --background: 0 0% 100%;
    --foreground: 0 0% 3.9%;
    --card: 0 0% 100%;
    --card-foreground: 0 0% 3.9%;
    --primary: 0 0% 9%;
    --primary-foreground: 0 0% 98%;
    --secondary: 0 0% 96.1%;
    --secondary-foreground: 0 0% 9%;
    --destructive: 0 84.2% 60.2%;
    --destructive-foreground: 0 0% 98%;
    --muted: 0 0% 96.1%;
    --muted-foreground: 0 0% 45.1%;
    --accent: 0 0% 96.1%;
    --accent-foreground: 0 0% 9%;
    --border: 0 0% 89.8%;
    --input: 0 0% 89.8%;
    --ring: 0 0% 3.9%;
    --radius: 0.5rem;
  }

  .dark {
    --background: 0 0% 3.9%;
    --foreground: 0 0% 98%;
    /* ... dark mode overrides */
  }
}
```

### Theme Switching (next-themes)

```tsx
// app/layout.tsx
import { ThemeProvider } from "@/components/theme-provider";

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body>
        <ThemeProvider
          attribute="class"
          defaultTheme="system"
          enableSystem
          disableTransitionOnChange
        >
          {children}
        </ThemeProvider>
      </body>
    </html>
  );
}
```

```tsx
// components/theme-provider.tsx
"use client";

import { ThemeProvider as NextThemesProvider } from "next-themes";

export function ThemeProvider({
  children,
  ...props
}: React.ComponentProps<typeof NextThemesProvider>) {
  return <NextThemesProvider {...props}>{children}</NextThemesProvider>;
}
```

### Custom Theme Colors

To add a custom brand color:

```css
:root {
  --brand: 221.2 83.2% 53.3%; /* hsl values without hsl() */
  --brand-foreground: 210 40% 98%;
}
```

```ts
// tailwind.config.ts
export default {
  theme: {
    extend: {
      colors: {
        brand: {
          DEFAULT: "hsl(var(--brand))",
          foreground: "hsl(var(--brand-foreground))",
        },
      },
    },
  },
};
```

---

## 7. Forms with React Hook Form + Zod

### The Standard Pattern

```tsx
"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";

const formSchema = z.object({
  name: z.string().min(2, "Name must be at least 2 characters"),
  email: z.string().email("Invalid email address"),
});

type FormValues = z.infer<typeof formSchema>;

export function UserForm() {
  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      name: "",
      email: "",
    },
  });

  async function onSubmit(values: FormValues) {
    // Handle submission
  }

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
        <FormField
          control={form.control}
          name="name"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Name</FormLabel>
              <FormControl>
                <Input placeholder="John Doe" {...field} />
              </FormControl>
              <FormDescription>Your display name.</FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="email"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Email</FormLabel>
              <FormControl>
                <Input placeholder="john@example.com" {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <Button type="submit">Submit</Button>
      </form>
    </Form>
  );
}
```

### Form Rules

| Rule                             | Why                             |
| -------------------------------- | ------------------------------- |
| Always use Zod for validation    | Type-safe, runtime validated    |
| Always use `zodResolver`         | Connects Zod to React Hook Form |
| Always use `<FormField>` wrapper | Error messages + accessibility  |
| Derive types with `z.infer<>`    | Single source of truth          |
| Server Actions for mutations     | Progressive enhancement         |

---

## 8. Data Table Pattern

### Minimal Setup with TanStack Table

```tsx
"use client";

import {
  ColumnDef,
  flexRender,
  getCoreRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  getFilteredRowModel,
  useReactTable,
} from "@tanstack/react-table";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

interface DataTableProps<TData, TValue> {
  columns: ColumnDef<TData, TValue>[];
  data: TData[];
  searchKey?: string;
}

export function DataTable<TData, TValue>({
  columns,
  data,
  searchKey,
}: DataTableProps<TData, TValue>) {
  const table = useReactTable({
    data,
    columns,
    getCoreRowModel: getCoreRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
  });

  return (
    <div className="space-y-4">
      {searchKey && (
        <Input
          placeholder={`Filter by ${searchKey}...`}
          value={(table.getColumn(searchKey)?.getFilterValue() as string) ?? ""}
          onChange={(e) =>
            table.getColumn(searchKey)?.setFilterValue(e.target.value)
          }
          className="max-w-sm"
        />
      )}
      <div className="rounded-md border">
        <Table>
          <TableHeader>
            {table.getHeaderGroups().map((headerGroup) => (
              <TableRow key={headerGroup.id}>
                {headerGroup.headers.map((header) => (
                  <TableHead key={header.id}>
                    {header.isPlaceholder
                      ? null
                      : flexRender(
                          header.column.columnDef.header,
                          header.getContext(),
                        )}
                  </TableHead>
                ))}
              </TableRow>
            ))}
          </TableHeader>
          <TableBody>
            {table.getRowModel().rows?.length ? (
              table.getRowModel().rows.map((row) => (
                <TableRow key={row.id}>
                  {row.getVisibleCells().map((cell) => (
                    <TableCell key={cell.id}>
                      {flexRender(
                        cell.column.columnDef.cell,
                        cell.getContext(),
                      )}
                    </TableCell>
                  ))}
                </TableRow>
              ))
            ) : (
              <TableRow>
                <TableCell
                  colSpan={columns.length}
                  className="h-24 text-center"
                >
                  No results.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
      <div className="flex items-center justify-end space-x-2">
        <Button
          variant="outline"
          size="sm"
          onClick={() => table.previousPage()}
          disabled={!table.getCanPreviousPage()}
        >
          Previous
        </Button>
        <Button
          variant="outline"
          size="sm"
          onClick={() => table.nextPage()}
          disabled={!table.getCanNextPage()}
        >
          Next
        </Button>
      </div>
    </div>
  );
}
```

---

## 9. Common Component Recipes

### Toast Notifications

```tsx
"use client";

import { useToast } from "@/hooks/use-toast";

export function MyComponent() {
  const { toast } = useToast();

  function handleAction() {
    toast({
      title: "Success",
      description: "Your action was completed.",
    });
  }

  function handleError() {
    toast({
      variant: "destructive",
      title: "Error",
      description: "Something went wrong.",
    });
  }
}
```

### Command Palette (cmdk)

```tsx
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";

export function CommandMenu() {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.key === "k" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        setOpen((prev) => !prev);
      }
    };
    document.addEventListener("keydown", down);
    return () => document.removeEventListener("keydown", down);
  }, []);

  return (
    <CommandDialog open={open} onOpenChange={setOpen}>
      <CommandInput placeholder="Type a command or search..." />
      <CommandList>
        <CommandEmpty>No results found.</CommandEmpty>
        <CommandGroup heading="Actions">
          <CommandItem>New Document</CommandItem>
          <CommandItem>Search Users</CommandItem>
        </CommandGroup>
      </CommandList>
    </CommandDialog>
  );
}
```

### Sheet (Slide-over Panel)

```tsx
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";

export function EditPanel() {
  return (
    <Sheet>
      <SheetTrigger asChild>
        <Button variant="outline">Edit</Button>
      </SheetTrigger>
      <SheetContent>
        <SheetHeader>
          <SheetTitle>Edit Item</SheetTitle>
          <SheetDescription>Make changes here.</SheetDescription>
        </SheetHeader>
        {/* Form content */}
      </SheetContent>
    </Sheet>
  );
}
```

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
