# Handoff to Codex — desktop-collapsible sidebar (mirror to ChatGPT Sites)

**From:** Claude Code, 4 Sep 2026
**Landed on `main`:** commit `d046ce7` "Command Centre: desktop-collapsible sidebar"
**Base it was built/verified against:** `main` @ `6b73a1f` (fast-forward, no rebase).

## Governing stance (same as the doc that produced this change)
Treat everything below as **provenance, not evidence**. `main` may have moved since
this was written. Re-derive from current source, run your own gate, and only mirror
once GitHub is green.

## What changed (2 files, 36 insertions / 4 deletions)
- `app/globals.css`
  - add `.desktop-only { display: none; }` after `.mobile-only`
  - add `transition: grid-template-columns .22s ease;` to `.app-layout`
  - new `@media (min-width: 921px)` block — **must sit AFTER `@media (max-width: 920px)` and BEFORE `@media (max-width: 650px)`**, or the mobile drawer rules win and desktop collapse silently dies.
- `app/retirement-dashboard.tsx`
  - `navCollapsed` state (init from `localStorage["robinson-retirement-nav-collapsed"]`), a persist effect, and a keydown effect (`[` toggles; Escape closes the mobile drawer + returns focus to `#nav-menu-button`; ignored while typing / with modifiers)
  - desktop-only topbar toggle button inserted BEFORE the existing mobile menu button
  - `id="nav-menu-button"` added to the mobile menu button
  - layout wrapper: `className={\`app-layout ${navCollapsed ? "nav-collapsed" : ""}\`.trim()}`
  - sidebar `<aside>`: `inert={navCollapsed && !navOpen}`

## Traps already hit (don't rediscover them)
- **React 19 types `inert` as boolean** — `inert=""` fails typecheck (TS2322). Use the boolean expression above.
- **180ms visibility delay** — the collapsed rule has `transition: opacity .18s ease, visibility 0s linear .18s`. Any browser assertion on visibility/grid width must settle **≥500ms** after the toggle, or it false-fails (this was misdiagnosed as a product bug once).
- **Do not overwrite whole files** to mirror — apply from anchors so you don't revert concurrent work.

## Gate this passed on GitHub `main` (identical validator output vs baseline)
`typecheck` → `validate:model` → `validate:visuals` → `validate:mobile` → `build:pages`.
Both content validators still report full assertions (model registry intact;
Atlas 141 DOM bindings; mobile guardrails intact). Build ~235ms.
Browser-verified at 1440×1024, 390×844, and the 920/921 boundary: collapse to 0 /
content reclaims 1420px / no horizontal overflow / `[` toggle / persistence /
`inert` true when collapsed / mobile drawer unaffected and **desktop pref does NOT
leak to the mobile drawer** / Escape closes drawer + focus returns / 920 hidden, 921 visible.

## Your task
1. Pull `main`, re-verify this change with your own gate run (per §8 of the verify doc: re-verify against the *promoted GitHub version*, don't mirror from a document).
2. Apply the **identical behaviour** to the ChatGPT Sites surface (the usual-use surface). Same keys, same `robinson-retirement-nav-collapsed` key, same aria/inert semantics, same 921 breakpoint placement.
3. Keep the guardrails: no engine/figure/rail/wash changes, no deletions, no CDN/framework additions.

## Suggested follow-up (separate change, not bundled here)
Add regression assertions (DOM-binding pattern in `tools/validate-atlas-visuals.mjs`,
or the model/mobile validator): `.desktop-only` rule exists; `.app-layout.nav-collapsed`
defined inside `@media (min-width: 921px)`; topbar renders `aria-controls="retirement-sidebar"`
with `aria-expanded`; mobile button carries `id="nav-menu-button"`.
