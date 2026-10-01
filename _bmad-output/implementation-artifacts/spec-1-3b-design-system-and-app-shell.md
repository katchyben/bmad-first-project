---
title: 'Story 1.3b: Design system'
type: 'feature'
created: '2026-10-01'
status: 'done'
route: 'dispatch'
review_loop_iteration: 0
baseline_commit: 'fd216da22419272ae18302c56c1f259be505ff07'
context:
  - '{project-root}/_bmad-output/implementation-artifacts/epic-1-context.md'
  - '{project-root}/_bmad-output/planning-artifacts/ux-designs/ux-bmad-first-project-2026-10-01/DESIGN.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** The frontend (1.3a) is unstyled. Every UI story from 1.6 on needs shadcn/ui themed to DESIGN.md's Graphite Hush tokens, one accessible focus ring, a minimum target size and a reduced-motion-aware fade, so components look and behave the same everywhere.

**Approach:** This is the second part of Story 1.3. Set up Tailwind and shadcn/ui, map DESIGN.md `colors`, typography stacks and radii onto shadcn's CSS variables, install the listed components, override the focus ring, and add `min-target` and the fade utility. The app shell, toast region and global error toast (1.3c) were split off by the user's decision and are logged in `deferred-work.md`.

## Boundaries & Constraints

**Always:**
- Light values are DESIGN.md `colors` unsuffixed; dark values are the `-dark` ones, switched only by `@media (prefers-color-scheme: dark)` (no `.dark` class, no toggle). Every DESIGN.md colour, including the app-specific ones (`overdue`, `overdue-tint`, `in-progress`, `finished`, `row-hover`, `row-selected`, `toast-*`, `ring-on-toast`), exists as a CSS variable and a Tailwind colour.
- The font is DESIGN.md's system stack (Geist removed); `kbd` uses the monospace stack. Radii: controls 10px, surfaces 12px, chips full.
- Install Button, Input, Textarea, Tabs, Popover, Calendar, Label and Sonner with the shadcn CLI. The only edits to them are token mapping and the focus ring.
- Focus ring: every focusable element shows a solid 2px `ring` at full opacity with a 2px offset showing the surface behind; shadcn's `ring-ring/50` / 3px ring is removed. A `min-target` (24px) token and utility exist.
- `body` uses `background` and `foreground`.
- Motion: one shared 180ms opacity-fade utility; under `prefers-reduced-motion: reduce` it applies no transition, and no timer changes.

**Never:** No shell column, mounted `Toaster` or global error toast (1.3c). No login screen, task UI or routing (later stories). No change to 1.3a's retry or 401 policy. No backend changes.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Light theme | OS light | `--background` #F4F4F3, `--primary` #1F1F1F, `--overdue` #C2341A, `--toast-action` #FF8A70 | — |
| Dark theme | OS dark | `--background` #161616, `--primary` #EAEAEA, `--overdue` #FF7A5C, `--toast-action` #B32E15 | — |
| Font | any text | computed `font-family` starts with `-apple-system`; no Geist loaded | — |
| Radii | a Button / a surface using `rounded-lg` | 10px / 12px | — |
| Focus | Tab onto a shadcn Button and Input | a 2px solid ring in `ring` with a 2px offset; no 50%-opacity ring | — |
| Min target | an element with the `min-target` utility | computed `min-height` 24px | — |
| Reduced motion | the fade utility, with and without `prefers-reduced-motion: reduce` | transition 180ms opacity / none | — |

</frozen-after-approval>

## Code Map

- `frontend/src/App.tsx` -- the placeholder `<main>Todo</main>`. For e2e checks, render a small `DesignCheck` fixture (a Button, an Input, a `rounded-lg` surface, a `min-target` element, a `fade` element) only when the URL has `?design-check`; otherwise keep the placeholder. 1.3c replaces it with the shell.
- `frontend/vite.config.ts`, `tsconfig*.json` -- add `@tailwindcss/vite` and the `@/` alias that shadcn needs.
- `frontend/eslint.config.js` -- the HTTP bans must still pass on `src/components/ui/**`.
- Run all npm commands under Node 24 (`source ~/.nvm/nvm.sh && nvm use 24`). The shadcn CLI is `npx shadcn@4.21.1`, run non-interactively (`init`/`add` with `-y`). Pin every added package exactly (resolved today: tailwindcss / `@tailwindcss/vite` 4.3.3, tw-animate-css 1.4.0, radix-ui 1.6.7, react-day-picker 10.0.2, lucide-react 1.49.0, class-variance-authority 0.7.1, clsx 2.1.1, tailwind-merge 3.7.0, sonner 2.0.8).
- shadcn's default CSS uses a `.dark` class variant; replace it with the media query.
- Playwright starts its own servers on a scratch DB (1.3a); never point anything at `./data`.

## Tasks & Acceptance

**Execution:**
- [x] `frontend/package.json`, `vite.config.ts`, `tsconfig*.json`, `components.json` -- Tailwind v4 plus shadcn init, the alias, exact pins -- UX-DR1
- [x] `frontend/src/index.css` -- tokens (light, dark media query), fonts, radii, `min-target`, the base focus-ring rule, the fade utility with its reduced-motion rule -- UX-DR1, UX-DR25, UX-DR29, UX-DR30
- [x] `frontend/src/components/ui/{button,input,textarea,tabs,popover,calendar,label,sonner}.tsx` -- CLI-installed; focus-ring classes replaced -- UX-DR1, UX-DR25
- [x] `frontend/src/lib/motion.ts` -- a fade class export -- UX-DR29
- [x] `frontend/src/App.tsx`, `src/DesignCheck.tsx` -- the `?design-check` fixture -- NFR6
- [x] `frontend/e2e/design.spec.ts` -- every matrix row via `page.emulateMedia` (`colorScheme`, `reducedMotion`) and computed styles -- NFR6

**Acceptance Criteria:**
- Given `frontend/` under Node 24, when `npm run lint`, `npm run build`, `npm test` and `npm run e2e` run, then all pass, and the 1.3a tests still pass unchanged.

## Implementation Notes

- shadcn 4.21.1 `init -b radix -p nova` (style `radix-nova`) generates components that import `cn` from the `cn` package (0.4.0, shadcn-ui's clsx + tailwind-merge replacement), so `clsx` and `tailwind-merge` are not installed. The CLI also added `next-themes` 0.4.6 (used by `sonner.tsx`; with no provider it falls back to `system`) and `date-fns` 4.4.0. All pinned exactly; `@fontsource-variable/geist` was removed. Build-time packages (`tailwindcss`, `@tailwindcss/vite`, `tw-animate-css`, `shadcn` for `shadcn/tailwind.css`) are devDependencies.
- Radii: `rounded-md` = 10px (controls), `rounded-lg` = 12px (surfaces), `rounded-xs` = 4px. Token mapping therefore changed Button and Input from `rounded-lg` to `rounded-md`; Textarea keeps `rounded-lg` (a surface per DESIGN.md).
- Focus ring is an outline (`focus-ring` utility plus a base `:focus-visible` rule), so the 2px offset shows the real surface behind. shadcn's `focus-visible:border-ring/ring-3/ring-ring/50` (and the Tabs `outline-1`, Calendar day `ring-[3px]`) were replaced with `focus-ring`; PopoverContent also gets `focus-ring`, Calendar's hidden dropdown `<select>` shows the ring on its `dropdown_root` via `has-focus-visible:`, and the `aria-invalid:ring-*` box-shadow rings were removed (the destructive border stays). Override the colour locally with `[--ring:var(--ring-on-toast)]`.
- A global `prefers-reduced-motion: reduce` rule stops all animations (0.01ms, one iteration) and transitions (0s) in CSS only. The `?design-check` fixture is lazy-loaded in dev builds only. Vitest resolves the `@/` alias.
- `tsconfig.node.json` gained the DOM lib so `e2e/` can type `page.evaluate` callbacks.

## Spec Change Log

## Review Triage Log

Pass 1 (blind = B, edge-case = E, verification-gap = V):

| # | Finding | Verdict | Evidence | Route |
|---|---------|---------|----------|-------|
| B1/E6 | Calendar month/year dropdown focus is invisible (the focused `<select>` is `opacity-0`; the wrapper's `has-focus` ring was removed) | medium | Breaks the frozen "every focusable element shows the ring" rule; a focus-ring edit is allowed | patch |
| E5 | `PopoverContent` keeps `outline-hidden` with no `focus-ring`; the utility beats the base `:focus-visible` rule | low | Radix focuses the content when it has no focusable child; a direct class addition | patch |
| B2/E8 | `aria-invalid:ring-3 ring-destructive/20` box-shadow ring remains on Button/Input/Textarea | medium | It's the 3px shadcn ring the frozen rule removes, and it's untested because the e2e checks only valid controls | patch |
| B3/V1 | Focus test covers only Button and Input, not Tabs, Textarea or a plain link (base rule) | medium | V: re-adding shadcn's ring classes to Tabs/Textarea or deleting the base rule leaves e2e green | patch |
| B5/E2–E4/claim | Only `.fade` honours reduced motion; Button `transition-all`/`translate-y-px`, Popover zoom/slide and the Sonner spinner don't | medium | UX says all motion is off under reduced motion; a global reduced-motion override in `index.css` fixes it without editing components | patch |
| B7/E1 | The `?design-check` fixture ships in production builds | low | `App.tsx` imports it unconditionally; a direct `import.meta.env.DEV` guard | patch |
| V-other | Vitest doesn't resolve the `@/` alias | low | `vitest.config.ts` doesn't merge `vite.config.ts`; 1.3c's toast tests would fail to import; a direct config fix | patch |
| B5b | Popover zoom/slide and Button press translate in normal motion conflict with "nothing slides or grows" | low | Real; editing component animation is outside this story's allowed edits; matters at the first Popover use (2.5) | defer |
| B6/E7/V | Sonner wrapper uses popover colours, not `toast-*`; `cn-toast` is undefined; `ring-on-toast` is unused | low | The Toaster isn't mounted until 1.3c, whose entry already themes it on the `toast-*` tokens | defer (to 1.3c) |
| B8 | `next-themes` `useTheme()` with no provider; `date-fns` unused | low | Works (falls back to "system"); tidy up with the 1.3c Toaster theming | defer (to 1.3c) |
| B4 | `muted`/`secondary`/`sidebar` tokens are still shadcn oklch neutrals | false | DESIGN.md: "Unlisted shadcn tokens (secondary, muted, sidebar-*, chart-*) inherit shadcn's neutral base" | reject |
| B9 | Radius test omits `rounded-xs`/`rounded-full`/Textarea; derived `--radius-sm/xl…` | low | No chips or hints exist yet; the derived steps are shadcn's scale | reject |
| B10 | DOM lib added to `tsconfig.node.json`; `paths` duplicated | low | Cosmetic config layout | reject |
| B11 | shadcn files' quote style, `"use client"`, the direct `cn` import; Button/Input `rounded-lg`→`rounded-md` | low | Generated code that lint passes; the radius change is token mapping onto DESIGN.md's control radius | reject |
| E9 | `min-target` + fixed `size-*` conflicts resolved by CSS order | low | Contrived; no component combines them yet | reject |

## Verification

**Commands (Node 24, from `frontend/`):**
- `npm run lint && npm run build && npm test && npm run e2e` -- expected: all pass
