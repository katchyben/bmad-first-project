---
name: 'Todo App (BMad Method demo)'
description: 'Calm, near-monochrome single-column todo list for desktop web. shadcn/ui (Radix + Tailwind); this file specifies the Graphite Hush palette and Still Water layout as a delta on shadcn defaults.'
status: final
created: '2026-10-01'
updated: '2026-10-01'
colors:
  # Graphite Hush, mapped onto shadcn semantic tokens. Light values unsuffixed, dark values suffixed -dark.
  # Unlisted shadcn tokens (secondary, muted, sidebar-*, chart-*) inherit shadcn's neutral base.
  background: '#F4F4F3'
  foreground: '#1F1F1F'
  card: '#FFFFFF'
  card-foreground: '#1F1F1F'
  popover: '#FFFFFF'
  popover-foreground: '#1F1F1F'
  muted-foreground: '#5F5F5F'
  border: '#E2E2E0'
  input: '#8A8A8A'
  ring: '#1F1F1F'
  ring-on-toast: '#F4F4F3'
  primary: '#1F1F1F'
  primary-foreground: '#FFFFFF'
  accent: '#F7F7F6'
  accent-foreground: '#1F1F1F'
  destructive: '#1F1F1F'
  destructive-foreground: '#FFFFFF'
  overdue: '#C2341A'
  overdue-tint: '#FDEEEA'
  in-progress: '#3D3D3D'
  finished: '#6A6A6A'
  row-hover: '#F7F7F6'
  row-selected: '#F0F0EE'
  toast-background: '#1F1F1F'
  toast-foreground: '#F4F4F3'
  toast-action: '#FF8A70'
  background-dark: '#161616'
  foreground-dark: '#EAEAEA'
  card-dark: '#1E1E1E'
  card-foreground-dark: '#EAEAEA'
  popover-dark: '#1E1E1E'
  popover-foreground-dark: '#EAEAEA'
  muted-foreground-dark: '#A0A0A0'
  border-dark: '#333333'
  input-dark: '#707070'
  ring-dark: '#EAEAEA'
  ring-on-toast-dark: '#161616'
  primary-dark: '#EAEAEA'
  primary-foreground-dark: '#161616'
  accent-dark: '#242424'
  accent-foreground-dark: '#EAEAEA'
  destructive-dark: '#EAEAEA'
  destructive-foreground-dark: '#161616'
  overdue-dark: '#FF7A5C'
  overdue-tint-dark: '#352019'
  in-progress-dark: '#CFCFCF'
  finished-dark: '#9A9A9A'
  row-hover-dark: '#242424'
  row-selected-dark: '#262626'
  toast-background-dark: '#EAEAEA'
  toast-foreground-dark: '#161616'
  toast-action-dark: '#B32E15'
typography:
  # System font stack throughout; shadcn's Geist default is replaced.
  heading:
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Inter, Roboto, "Helvetica Neue", Arial, sans-serif'
    fontSize: 32px
    fontWeight: '300'
    lineHeight: '1.2'
    letterSpacing: -0.02em
  heading-date:
    fontFamily: '{typography.heading.fontFamily}'
    fontSize: 14px
    fontWeight: '400'
  body:
    fontFamily: '{typography.heading.fontFamily}'
    fontSize: 16px
    fontWeight: '400'
    lineHeight: '1.5'
  row-title:
    fontFamily: '{typography.heading.fontFamily}'
    fontSize: 16px
    fontWeight: '400'
  row-title-finished:
    fontFamily: '{typography.heading.fontFamily}'
    fontSize: 15px
    fontWeight: '400'
  row-meta:
    fontFamily: '{typography.heading.fontFamily}'
    fontSize: 13px
    fontWeight: '400'
  overdue-label:
    fontFamily: '{typography.heading.fontFamily}'
    fontSize: 13px
    fontWeight: '600'
  input:
    fontFamily: '{typography.heading.fontFamily}'
    fontSize: 15px
    fontWeight: '400'
  tab:
    fontFamily: '{typography.heading.fontFamily}'
    fontSize: 13.5px
    fontWeight: '400'
  section-label:
    fontFamily: '{typography.heading.fontFamily}'
    fontSize: 13px
    fontWeight: '500'
  button:
    fontFamily: '{typography.heading.fontFamily}'
    fontSize: 13px
    fontWeight: '500'
  button-sm:
    fontFamily: '{typography.heading.fontFamily}'
    fontSize: 12px
    fontWeight: '500'
  chip:
    fontFamily: '{typography.heading.fontFamily}'
    fontSize: 11.5px
    fontWeight: '400'
  toast:
    fontFamily: '{typography.heading.fontFamily}'
    fontSize: 13px
    fontWeight: '400'
  toast-action:
    fontFamily: '{typography.heading.fontFamily}'
    fontSize: 13px
    fontWeight: '600'
  empty-title:
    fontFamily: '{typography.heading.fontFamily}'
    fontSize: 18px
    fontWeight: '300'
  caption:
    fontFamily: '{typography.heading.fontFamily}'
    fontSize: 13px
    fontWeight: '400'
  kbd:
    fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace'
    fontSize: 10.5px
    fontWeight: '400'
rounded:
  # Softer than shadcn's default 6/8; Still Water uses 10 for controls, 12 for surfaces.
  xs: 4px
  DEFAULT: 10px
  lg: 12px
  full: 9999px
spacing:
  # Tailwind 4px scale inherited for everything not named here.
  column-max: 640px
  page-gutter: 16px
  login-card-max: 360px
  ring-width: 2px
  ring-offset: 2px
  min-target: 24px
  page-top: 48px
  heading-date-gap: 4px
  heading-to-filter: 26px
  filter-to-input: 18px
  input-to-list: 18px
  description-link-gap: 8px
  list-to-finished: 22px
  finished-header-to-list: 10px
  filter-gap: 22px
  filter-underline-offset: 6px
  row-padding-y: 16px
  row-padding-x: 22px
  row-finished-padding-y: 13px
  row-gap: 12px
  add-input-padding-x: 16px
  toast-offset: 24px
  toast-padding-y: 12px
  toast-padding-x: 18px
  toast-gap: 14px
  empty-padding-y: 64px
  empty-padding-x: 24px
components:
  task-row:
    background: '{colors.card}'
    foreground: '{colors.foreground}'
    meta: '{colors.muted-foreground}'
    typography: '{typography.row-title}'
    min-height: 58px
    padding: '{spacing.row-padding-y} {spacing.row-padding-x}'
    gap: '{spacing.row-gap}'
    divider: '1px solid {colors.border}'
    status-mark-size: 18px
  task-row-hover:
    background: '{colors.row-hover}'
  task-row-selected:
    background: '{colors.row-selected}'
    focus-outline: 'inset {spacing.ring-width} solid {colors.ring}, every variant, while the list has focus'
  task-row-selected-unfocused:
    background: '{colors.row-selected}'
  task-row-overdue:
    background: '{colors.overdue-tint}'
    rule: 'inset 3px 0 0 {colors.overdue}'
    mark: '{colors.overdue}'
    label: '{colors.overdue}'
    label-typography: '{typography.overdue-label}'
    due: '{colors.overdue}'
  task-row-in-progress:
    mark: '{colors.in-progress}'
    label: '{colors.muted-foreground}'
    label-typography: '{typography.row-meta}'
  task-row-done:
    foreground: '{colors.finished}'
    mark: '{colors.finished}'
    typography: '{typography.row-title-finished}'
    min-height: 50px
    padding: '{spacing.row-finished-padding-y} {spacing.row-padding-x}'
  task-row-cancelled:
    foreground: '{colors.finished}'
    mark: '{colors.finished}'
    typography: '{typography.row-title-finished}'
    text-decoration: 'line-through 1px'
    min-height: 50px
    padding: '{spacing.row-finished-padding-y} {spacing.row-padding-x}'
  task-list:
    background: '{colors.card}'
    border: '1px solid {colors.border}'
    radius: '{rounded.lg}'
  row-action-button:
    variant: 'shadcn Button ghost, size sm'
    min-height: 26px
    typography: '{typography.button-sm}'
    radius: '{rounded.DEFAULT}'
    hover-background: '{colors.accent}'
  add-task-input:
    background: '{colors.card}'
    border: '1px solid {colors.input}'
    placeholder: '{colors.muted-foreground}'
    typography: '{typography.input}'
    min-height: 48px
    padding-x: '{spacing.add-input-padding-x}'
    radius: '{rounded.lg}'
    focus-ring: '{spacing.ring-width} solid {colors.ring}, offset {spacing.ring-offset}'
  preset-chip:
    background: '{colors.card}'
    border: '1px solid {colors.border}'
    foreground: '{colors.muted-foreground}'
    typography: '{typography.chip}'
    min-height: 24px
    radius: '{rounded.full}'
  preset-chip-selected:
    background: '{colors.primary}'
    border: '1px solid {colors.primary}'
    foreground: '{colors.primary-foreground}'
  due-popover:
    base: 'shadcn Popover + Calendar + Input (time)'
    background: '{colors.popover}'
    radius: '{rounded.lg}'
  status-filter-tab:
    foreground: '{colors.muted-foreground}'
    typography: '{typography.tab}'
    gap: '{spacing.filter-gap}'
    padding-bottom: '{spacing.filter-underline-offset}'
  status-filter-tab-active:
    foreground: '{colors.foreground}'
    underline: 'inset 0 -1.5px 0 {colors.foreground}'
  finished-section-header:
    foreground: '{colors.muted-foreground}'
    typography: '{typography.section-label}'
    chevron-size: 14px
    min-height: '{spacing.min-target}'
  undo-toast:
    background: '{colors.toast-background}'
    foreground: '{colors.toast-foreground}'
    typography: '{typography.toast}'
    radius: '{rounded.lg}'
    padding: '{spacing.toast-padding-y} {spacing.toast-padding-x}'
    gap: '{spacing.toast-gap}'
    offset-bottom: '{spacing.toast-offset}'
    shadow: '0 6px 20px rgba(0,0,0,.18)'
  undo-toast-action:
    foreground: '{colors.toast-action}'
    typography: '{typography.toast-action}'
    text-decoration: 'underline, offset 3px'
    min-height: '{spacing.min-target}'
    focus-ring: '{spacing.ring-width} solid {colors.ring-on-toast}, offset {spacing.ring-offset}'
    pending-opacity: '0.6'
  toast-close:
    size: '{spacing.min-target}'
    foreground: '{colors.toast-foreground}'
    focus-ring: '{spacing.ring-width} solid {colors.ring-on-toast}, offset {spacing.ring-offset}'
  undo-toast-countdown:
    foreground: '{colors.toast-foreground}'
    opacity: '0.7'
    font-variant: 'tabular-nums'
  login-card:
    background: '{colors.card}'
    border: '1px solid {colors.border}'
    radius: '{rounded.lg}'
    width: '100%'
    max-width: '{spacing.login-card-max}'
    padding: 32px
  button-primary:
    background: '{colors.primary}'
    foreground: '{colors.primary-foreground}'
    typography: '{typography.button}'
    min-height: 32px
    radius: '{rounded.DEFAULT}'
  empty-state:
    background: '{colors.card}'
    border: '1px solid {colors.border}'
    radius: '{rounded.lg}'
    padding: '{spacing.empty-padding-y} {spacing.empty-padding-x}'
    ring: '44px circle, 1.5px solid {colors.border}'
    title: '{typography.empty-title}'
    body: '{typography.caption}'
    body-color: '{colors.muted-foreground}'
  connection-banner:
    background: '{colors.card}'
    foreground: '{colors.muted-foreground}'
    border-bottom: '1px solid {colors.border}'
    typography: '{typography.caption}'
    min-height: 32px
  inline-edit-row:
    background: '{colors.card}'
    input-border: '1px solid {colors.input}'
    input-radius: '{rounded.DEFAULT}'
    input-min-height: 38px
    padding: '{spacing.row-padding-y} {spacing.row-padding-x}'
  add-description-link:
    foreground: '{colors.muted-foreground}'
    hover-foreground: '{colors.foreground}'
    typography: '{typography.caption}'
    margin-top: '{spacing.description-link-gap}'
    min-height: '{spacing.min-target}'
  add-description-textarea:
    background: '{colors.card}'
    border: '1px solid {colors.input}'
    placeholder: '{colors.muted-foreground}'
    typography: '{typography.input}'
    rows: 3
    padding-x: '{spacing.add-input-padding-x}'
    radius: '{rounded.lg}'
    margin-top: '{spacing.description-link-gap}'
  delete-confirm:
    base: 'inline; replaces the row content in place, no dialog'
    background: '{colors.row-selected}'
    foreground: '{colors.foreground}'
    detail: '{colors.muted-foreground}'
    typography: '{typography.row-title}'
    min-height: 58px
    padding: '{spacing.row-padding-y} {spacing.row-padding-x}'
    gap: '{spacing.row-gap}'
    button-min-height: 26px
    button-typography: '{typography.button-sm}'
    button-radius: '{rounded.DEFAULT}'
    confirm-background: '{colors.destructive}'
    confirm-foreground: '{colors.destructive-foreground}'
    keep-variant: 'shadcn Button outline, size sm'
  loading-line:
    foreground: '{colors.muted-foreground}'
    typography: '{typography.caption}'
    padding: '{spacing.row-padding-y} {spacing.row-padding-x}'
    delay: 1s
  field-error:
    foreground: '{colors.foreground}'
    typography: '{typography.caption}'
  focus-ring:
    width: '{spacing.ring-width}'
    color: '{colors.ring}'
    offset: '{spacing.ring-offset}'
    offset-color: 'the surface behind the control ({colors.card} or {colors.background})'
    opacity: '1 (solid; overrides shadcn ring-ring/50)'
  kbd-hint:
    border: '1px solid {colors.border}, bottom 2px'
    foreground: '{colors.muted-foreground}'
    background: '{colors.card}'
    typography: '{typography.kbd}'
    radius: '{rounded.xs}'
---

# Todo App — Design Spine

> Visual identity contract. Behaviour lives in [EXPERIENCE.md](./EXPERIENCE.md).
>
> **Mockups:** [key-main.html](./mockups/key-main.html) (main list, light and dark), [key-add-expanded.html](./mockups/key-add-expanded.html) (add input, presets, due popover, description, past-time error), [key-login.html](./mockups/key-login.html) (login and its error). Provenance: [color-themes.html](./mockups/color-themes.html) (Graphite Hush chosen) and [design-directions.html](./mockups/design-directions.html) (direction A "Still Water" chosen). **This spine wins on any conflict with a mockup.** The mocks predate the accessibility fixes (focus ring on every selected row, the "In progress" label, fluid widths, the second-⌫ delete, two-line title clipping, among others); where they differ, the spine governs.

## Brand & Style

Calm and minimal. A hobby-scale, single-user todo list that should feel like a quiet sheet of paper with one ink: lots of white space, a light, large heading, one narrow centred column, nothing on screen until it is needed. Row actions stay hidden until a row is hovered or selected. Motion is limited to 180ms opacity fades; nothing slides.

The product inherits shadcn/ui (Radix primitives + Tailwind). This file names only the delta: the Graphite Hush palette mapped onto shadcn's semantic tokens, the system font stack, softer corners, the Still Water spacing, and the product-specific components. Every shadcn component not listed under Components is used as shipped.

## Colors

Graphite Hush ([color-themes.html](./mockups/color-themes.html)) is near-monochrome. Greys and ink carry everything; a single vermilion is the only hue in the app, reserved for **overdue** and **Undo**. Light and dark follow the OS (EXPERIENCE.md, Foundation); each token has a `-dark` pair.

| Token | Light | Dark | Use |
|---|---|---|---|
| `background` | #F4F4F3 | #161616 | Page canvas |
| `card` / `popover` | #FFFFFF | #1E1E1E | List surface, inputs, login card, popovers |
| `foreground` | #1F1F1F | #EAEAEA | Titles, body text |
| `muted-foreground` | #5F5F5F | #A0A0A0 | Due times, inactive filter tabs, section header, placeholders, banner, "Add description" link, "Loading…" line |
| `border` | #E2E2E0 | #333333 | Row dividers, list outline, chip outlines (decorative only) |
| `input` | #8A8A8A | #707070 | Outlines of every text field: add input, description textarea, inline edit fields, login fields, time field |
| `primary` / `ring` | #1F1F1F | #EAEAEA | Primary button, selected preset chip, focus ring, active tab underline |
| `ring-on-toast` | #F4F4F3 | #161616 | Focus ring on toast controls (Undo link, close button); equals `toast-foreground` |
| `primary-foreground` | #FFFFFF | #161616 | Text on primary |
| `destructive` | #1F1F1F | #EAEAEA | Delete button in the inline delete confirm. Ink, never red |
| `overdue` | #C2341A | #FF7A5C | Overdue mark, label, due time, 3px left rule |
| `overdue-tint` | #FDEEEA | #352019 | Overdue row background |
| `in-progress` | #3D3D3D | #CFCFCF | In-progress status mark |
| `finished` | #6A6A6A | #9A9A9A | Done and Cancelled rows (title, mark, status word) |
| `accent` / `row-hover` | #F7F7F6 | #242424 | Row hover, ghost-button hover (shadcn `accent` role) |
| `row-selected` | #F0F0EE | #262626 | Keyboard-selected row, inline delete confirm |
| `toast-background` | #1F1F1F | #EAEAEA | Undo toast (inverts against the page) |
| `toast-foreground` | #F4F4F3 | #161616 | Toast text |
| `toast-action` | #FF8A70 | #B32E15 | Undo link only |

Naming: shadcn's `accent` token is its hover surface, so it carries the hover grey; the Graphite Hush "accent" (ink) lives in `primary`. `row-hover` and `row-selected` are not part of the recorded Graphite Hush palette; their values come from the shared palette in [design-directions.html](./mockups/design-directions.html).

Load-bearing contrast (WCAG 2.x, from [color-themes.html](./mockups/color-themes.html)):

| Pair | Light | Dark |
|---|---|---|
| foreground on card | 16.48:1 | 13.86:1 |
| muted-foreground on card | 6.39:1 | 6.38:1 |
| overdue on overdue-tint | 4.89:1 | 5.97:1 |
| overdue on card | 5.53:1 | 6.50:1 |
| in-progress on card | 10.86:1 | 10.70:1 |
| finished on card | 5.41:1 | 5.92:1 |
| toast-foreground on toast-background | 14.98:1 | 15.04:1 |
| toast-action on toast-background | 7.16:1 | 5.26:1 |
| finished on row-selected (thinnest text margin) | 4.74:1 | 5.38:1 |
| ring on card / background / row-selected / overdue-tint (non-text, 3:1 min) | 16.48 / 14.98 / 14.45 / 14.59:1 | 13.86 / 15.04 / 12.58 / 12.72:1 |
| ring-on-toast on toast-background | 14.98:1 | 15.04:1 |
| input on card / background | 3.45 / 3.14:1 | 3.37 / 3.65:1 |

All text pairs meet AA. `finished` on `row-selected` is the thinnest margin (4.74:1 light), so `row-selected` must never be darkened. `row-selected` against `card` is only 1.14:1 (light) / 1.10:1 (dark): it is a secondary tint, never the only sign of selection (Components → Task row, *Selected*). Contrast for the focus ring is listed above; its spec is under Components → Focus ring.

Avoid: any second hue; vermilion on anything other than overdue and Undo (not errors, not Delete, not the banner); status communicated by colour alone.

## Typography

One family: the system UI stack (`{typography.heading.fontFamily}`), replacing shadcn's Geist. Monospace only for keyboard hints (`{typography.kbd}`).

| Role | Token | Size / weight |
|---|---|---|
| Page heading ("Today") and login app name | `{typography.heading}` | 32 / 300, −0.02em |
| Date under heading | `{typography.heading-date}` | 14 / 400, muted |
| Active row title | `{typography.row-title}` | 16 / 400 |
| Finished row title | `{typography.row-title-finished}` | 15 / 400 |
| Due time, status word | `{typography.row-meta}` | 13 / 400 |
| Overdue label | `{typography.overdue-label}` | 13 / 600 |
| Add-task input, inline edit input | `{typography.input}` | 15 / 400 |
| Filter tabs | `{typography.tab}` | 13.5 / 400 |
| Finished section header | `{typography.section-label}` | 13 / 500 |
| Buttons / small buttons | `{typography.button}` / `{typography.button-sm}` | 13 / 500, 12 / 500 |
| Toast / Undo | `{typography.toast}` / `{typography.toast-action}` | 13 / 400, 13 / 600 |
| Empty-state line | `{typography.empty-title}` | 18 / 300 |
| Captions, field errors, banner, "Add description" link, "Loading…" line | `{typography.caption}` | 13 / 400 |

The heading is the one light, large moment. Weight 600 appears only on the overdue label and the Undo action, the two things that must be seen. No all-caps, no italics.

## Layout & Spacing

Desktop web only; there is no mobile layout. Mocked in [key-main.html](./mockups/key-main.html) after direction A in [design-directions.html](./mockups/design-directions.html). Widths are fluid so the page reflows at 400% zoom (SC 1.4.10): one centred column, `width: 100%` up to `{spacing.column-max}` (640px; the agreed ~640px wins over direction A's 560px mock column), with a `{spacing.page-gutter}` (16px) gutter on each side, on `{colors.background}`. The login card is likewise `width: 100%` up to `{spacing.login-card-max}` (360px). Vertical order and gaps:

1. `{spacing.page-top}` (48px) top padding
2. Heading, then date at `{spacing.heading-date-gap}`
3. `{spacing.heading-to-filter}` (26px) → status filter tabs (gap `{spacing.filter-gap}`)
4. `{spacing.filter-to-input}` (18px) → add-task input, its preset chip row, then the "Add description" link (or the expanded textarea) at `{spacing.description-link-gap}`
5. `{spacing.input-to-list}` (18px) → active list (one bordered card, rows separated by 1px dividers); during a slow load, the "Loading…" line sits here instead
6. `{spacing.list-to-finished}` (22px) → Finished header, `{spacing.finished-header-to-list}` (10px) → finished list
7. Undo toast floats centred, `{spacing.toast-offset}` from the viewport bottom

Rows: `{spacing.row-padding-y}` × `{spacing.row-padding-x}`, min-height 58px (finished rows 50px, `{spacing.row-finished-padding-y}` vertical), `{spacing.row-gap}` between mark, title, labels and due time. The title takes the remaining width and wraps to two lines; a longer title is clipped at the end of the second line (Task row → *Title*), never truncated to a single-line ellipsis. When the row is too narrow, the labels and due time wrap under the title instead of colliding with it or with the row actions. The connection banner, when present, spans the full viewport width above the column. Everything else uses the inherited Tailwind 4px scale. No breakpoints: the fluid widths and wrapping are the only adaptation.

Every component height in this file is a **minimum** (`min-height`), never a fixed height, so text spacing overrides (SC 1.4.12) never clip text. Every interactive target is at least `{spacing.min-target}` (24px) high, including the inline text targets: "Add description", the Undo link, the toast close button and the Finished header.

Toasts must never cover the focused row (SC 2.4.11): the scroll container carries `scroll-padding-bottom` equal to the toast stack height plus `{spacing.toast-offset}`, and the selected row is scrolled into view (`block: nearest`) on every selection change.

## Elevation & Depth

Flat. Hierarchy comes from tone (`card` on `background`) and 1px borders, not shadow. The only custom shadow is the Undo toast (`0 6px 20px rgba(0,0,0,.18)`), because it floats over the list. Popover keeps shadcn's default shadow. There are no dialogs; the delete confirm is inline in the row and stays flat. In dark mode nothing gains extra shadow.

## Shapes

`{rounded.DEFAULT}` (10px) for buttons (including the delete-confirm buttons), inline-edit inputs and small controls. `{rounded.lg}` (12px) for the surfaces: task list card, add-task input, description textarea, toast, empty state, login card, popover. `{rounded.full}` only for preset chips. `{rounded.xs}` (4px) only for keyboard hints. Status marks are 18px line-drawn circles (1.5px stroke).

## Components

These shadcn components are used unchanged except for token mapping: Button (variants default, ghost, outline), Input, Textarea, Tabs, Popover, Calendar, Label. No AlertDialog: nothing in the app opens a dialog.

- **Task row** (`task-row`). Anatomy left to right: 18px status mark · title · optional overdue label · due time (`{typography.row-meta}`, muted). Status marks (decorative, `aria-hidden`; the status is in the row's accessible name): To do = empty circle; In progress = half-filled circle in `{colors.in-progress}`; Done = circle with checkmark; Cancelled = dashed circle with a dash. Mocked in [key-main.html](./mockups/key-main.html). Title rule and variants:
  - *Title*: titles run up to 200 characters (PRD). In the list the title wraps to two lines and is clipped at the end of the second (`line-clamp: 2`, trailing ellipsis). Clipping is visual only: the full title is always in the row's accessible name and in the inline edit row. The selected row (focused or not) drops the clamp and shows the full title, growing the row's height to fit.
  - *Active (To do)*: `card` background, muted empty-circle mark.
  - *In progress*: half-filled mark in `{colors.in-progress}` plus a small "In progress" label beside it, in `{typography.row-meta}` `{colors.muted-foreground}`, in the label slot after the title (where the overdue label sits; an overdue In progress row shows "In progress" then the overdue icon and label).
  - *Overdue*: `{colors.overdue-tint}` background, 3px inset left rule in `{colors.overdue}`; mark keeps its status shape but turns `{colors.overdue}`; an alert icon (14px) + "Overdue" label in `{typography.overdue-label}`; due time in `{colors.overdue}`. Overdue is shown by tint + rule + icon + word, never colour alone.
  - *Done*: finished size and spacing, title and mark in `{colors.finished}`, checkmark mark, the word "Done" in place of the due time.
  - *Cancelled*: as Done, plus title strikethrough (1px); dashed-circle mark; the word "Cancelled". Done and Cancelled share a colour and differ by mark and strikethrough.
  - *Hover*: `{colors.row-hover}` background; the due time fades out and the row action buttons (`row-action-button`, ghost, 26px) fade in at the right edge, 180ms. The overdue label stays visible.
  - *Selected, list focused* (`task-row-selected`): a 2px inset `{colors.ring}` outline on the row in **every** variant (To do, In progress, overdue, Done, Cancelled, delete confirm, edit row), plus `{colors.row-selected}` as a secondary tint (overdue rows keep their tint and left rule instead). The outline is the selection indicator; the tint alone is not enough (1.1:1). The action buttons are revealed as on hover, but the due time stays visible, shifted left of the actions, so the keyboard user can still read it.
  - *Selected, list not focused* (`task-row-selected-unfocused`): the remembered selection keeps the `{colors.row-selected}` tint only, no outline, so focused and unfocused states differ.
- **Add-task input** (`add-task-input`). Mocked in [key-add-expanded.html](./mockups/key-add-expanded.html) with the chips, popover, description and past-time error. Min 48px, `{rounded.lg}`, `{colors.input}` outline, plus icon at left (`aria-hidden`), placeholder "Add a task". Focus: the standard solid focus ring (`{components.focus-ring}`), not a soft glow. Right edge shows a `kbd-hint` ("⌘K" when unfocused, "Enter" when focused). Directly beneath, a chip row: `preset-chip` "Tomorrow 9:00 AM", "Next Monday 9:00 AM", and a "Pick date…" chip with calendar icon (chips 24px high). Exactly one chip is selected (`preset-chip-selected`, ink fill); after a calendar pick, the third chip shows the chosen value (e.g. "Oct 12, 9:00 AM").
- **Add description link** (`add-description-link`). A small text link "Add description" under the chip row, `{spacing.description-link-gap}` below it, left-aligned with the input text: `{typography.caption}` in `{colors.muted-foreground}`, `{colors.foreground}` and underlined on hover and focus. No icon, no button chrome. Activating it replaces the link, in the same spot, with the description textarea.
- **Description textarea** (`add-description-textarea`). shadcn Textarea, 3 rows, same surface, `{colors.input}` border, radius (`{rounded.lg}`), horizontal padding and focus ring as the add-task input; placeholder "Description (optional)". It collapses back to the link after the task is added.
- **Due popover** (`due-popover`). shadcn Popover anchored to the "Pick date…" chip: shadcn Calendar (past days disabled) above a time field (shadcn Input, `type="time"`, with a visible "Time" label) and a primary "Set" button. Today's date carries shadcn Calendar's default today marker; the selected day uses `{colors.primary}`.
- **Status filter** (`status-filter-tab`). Text tabs: All · To do · In progress · Done · Cancelled. Inactive in `{colors.muted-foreground}`; active in `{colors.foreground}` with a 1.5px underline. No pills, no counts.
- **Finished section header** (`finished-section-header`). Chevron (`aria-hidden`; down when expanded, right when collapsed) + "Finished (n)" in `{typography.section-label}`, muted, min 24px high, inside an `<h2>`. No background.
- **Undo toast** (`undo-toast`). Inverted bar, centred at the bottom: message · "Undo" link in `{colors.toast-action}` (underlined, min 24px high) · countdown seconds at 70% opacity (tabular figures, `aria-hidden`). While its request is pending the link is dimmed to 60% (`aria-disabled`). Focus on the link uses `{colors.ring-on-toast}`. Expired state: message only, no Undo link, no countdown. Multiple toasts stack upward with 8px between them.
- **Error toast**. Same surface and position as the Undo toast: message plus a 24×24 close button (`toast-close`, "×" icon, accessible name "Dismiss") at the right. Never uses `toast-action`. It stays until dismissed (EXPERIENCE.md).
- **Login card** (`login-card`). Mocked, with its error, in [key-login.html](./mockups/key-login.html). Centred on `background`, fluid up to 360px wide, 32px padding. App name in `{typography.heading}`; Username and Password fields (shadcn Input + visible Label, min 36px, `{colors.input}` outline); full-width `button-primary` "Log in". One error slot directly above Log in, in `{typography.caption}` `{colors.foreground}`; there are no per-field error slots.
- **Empty state** (`empty-state`). Inside a card in the list position: a 44px outlined ring, "Nothing due. Enjoy the quiet." in `{typography.empty-title}`, and "Type above when something comes up." in muted caption.
- **Loading line** (`loading-line`). Shown only when a load is still pending after 1 s: the single word "Loading…" in `{typography.caption}`, `{colors.muted-foreground}`, left-aligned at row padding where the list goes. No card, no spinner, no skeleton, no icon. It fades in (180ms) and is replaced by the list's fade-in.
- **Connection banner** (`connection-banner`). Full-width 32px line at the very top: "Can't reach the server. Retrying…" centred, muted caption, 1px bottom border. No icon, no colour.
- **Inline edit row** (`inline-edit-row`). Replaces the row in place: title Input (38px, focused, `{rounded.DEFAULT}`), description textarea beneath, then a line with the due control (same chips and popover as the add input, the current value shown in the third chip), and on the right ghost "Cancel" with `kbd-hint` "Esc" and primary "Save" with `kbd-hint` "↵". One error slot (`field-error`) sits directly above that line, for any validation message; there are no per-field slots. Fields use `{colors.input}` outlines and the standard focus ring. There is no "clear due date" control.
- **Delete confirm** (`delete-confirm`). Inline, in the row itself; no dialog, no overlay. The row keeps its height (58px) and divider, takes `{colors.row-selected}`, and its content is replaced by: "Delete 'Pack bags'?" in `{typography.row-title}` `{colors.foreground}`, then "This can't be undone." in `{colors.muted-foreground}`, and at the right edge two 26px buttons: "Delete" (`{colors.destructive}` ink fill, `{colors.destructive-foreground}` text, with a `kbd-hint` "⌫") and "Keep" (shadcn Button outline). "Keep" carries the focus ring when the confirm opens; the 2px offset makes it obvious which of the two is focused. Content swaps with the standard 180ms fade.
- **Log out**. Ghost Button (`{typography.button}`, muted until hover) at the right end of the heading row, baseline-aligned with the heading.
- **Shortcuts**. Ghost Button "Shortcuts" (`{typography.button}`, muted) immediately left of Log out. It opens a shadcn Popover listing every key from EXPERIENCE.md's keyboard map, each as a `kbd-hint` beside its action in `{typography.caption}`.
- **Focus ring** (`focus-ring`). One treatment everywhere: a solid `{spacing.ring-width}` ring in `{colors.ring}` at 100% opacity with a `{spacing.ring-offset}` offset in the colour of the surface behind the control. This overrides shadcn's default `ring-ring/50`. The offset is what keeps the ring visible around ink-filled controls (selected chip, Log in, Set, Save, Delete). On the toast the ring uses `{colors.ring-on-toast}` and the offset uses `toast-background`. The selected task row uses the same ring drawn inset, without offset.
- **Keyboard hint** (`kbd-hint`). Monospace 10.5px, 1px border with a 2px bottom border, `{rounded.xs}`.

## Do's and Don'ts

| Do | Don't |
|---|---|
| Keep vermilion for overdue and Undo only | Use vermilion (or any red) for errors, Delete or the banner |
| Pair every status with a shape or word | Signal overdue, done or cancelled by colour alone |
| Reveal row actions on hover or selection, fading 180ms | Show every row's actions at once, or slide anything |
| One fluid centred column, max 640px, 16px gutter | Side panels, multi-column layouts, responsive breakpoints, fixed widths |
| One solid 2px focus ring with 2px offset everywhere | Faint `/50` rings, soft glows, or a tint as the only focus cue |
| Use the system font stack; 300 weight for the heading | Load a web font or bold the heading |
| Use `{colors.destructive}` (ink) for Delete | Introduce a red destructive variant |
| Keep surfaces flat; the toast is the only floating element | Add shadows for hierarchy |
| Inherit shadcn components as shipped beyond the token mapping | Restyle shadcn primitives ad hoc |
