# Handoff to Codex — three scenario instruments (mirror to ChatGPT Sites)

**From:** Claude Code, 17 Nov 2026
**State:** prepared on local branch `scenario-instruments`, **not pushed**. Mick reviews the diff and
decides whether it goes up. If it has landed by the time you read this, find it by searching `main`
for `InverseSolveLab` rather than by commit hash.
**Base it was built and verified against:** `main` @ `4f15f9a` (clean tree, no rebase).

## Governing stance (same as the doc that produced this change)
Treat everything below as **provenance, not evidence**. `main` may have moved since this was written.
Re-derive every insertion point from current source by searching for the quoted anchor strings — do
not trust line numbers, and do not apply this as a patch file. Run your own gate. Only mirror to
ChatGPT Sites once GitHub is green.

## What this adds
Three instruments in the Scenario workspace, all of them **readers of the canonical ledger**. Not one
line of retirement arithmetic is new: every number comes from `calculateFlatRetirementLedger` in
`app/retirement-core.ts`, or from inverting it numerically with bisection.

| Instrument | Where it mounts | What it does |
|---|---|---|
| `InverseSolveLab` | bottom of the **Lab** tab | Drag the outcome, read the assumption. Four solve targets: flat spend, real return, TBC headroom, and spend+return jointly from two pinned points. |
| `DecisionSurface` | new **Surface** tab (6th scenario tool) | 8,120 live ledgers over flat spend × real return, as a heat map. The existing Frontier tab is drawn on it as the single row it is. Click adopts both controls. |
| `ProbabilityVolume` | bottom of the **Risk** tab | The Monte Carlo fan as a 3D WebGL volume: height = Pool A / total / Pool C, depth = that path's realised average return. Orbit, pan, slice, zoom, filters, σ slider, 1.5k/6k/12k paths. |

## Files touched (3 files, 1,315 insertions / 10 deletions)

### `app/retirement-dashboard.tsx` (+1,260 / −4)
Anchors, in file order:

1. **React import** — `import { useEffect, useMemo, useRef, useState } from "react";` becomes a
   multi-line import that also brings in `type KeyboardEvent as ReactKeyboardEvent`,
   `type PointerEvent as ReactPointerEvent`, `type WheelEvent as ReactWheelEvent`. The instruments use
   React synthetic event types; the file previously only used DOM ones.
2. **Core import** — add `TRANSFER_BALANCE_BUFFER` and `TRANSFER_BALANCE_CAP` after
   `POOL_C_MODELLED_DRAG`. Both already exist in `retirement-core.ts`; nothing new is defined.
3. **`type ScenarioTool`** — insert `"surface"` between `"frontier"` and `"risk"`.
4. **`SCENARIO_TOOLS`** — new entry after the `frontier` row.
5. **`SCENARIO_GUIDES`** — new `surface` entry before `risk:`. This record is
   `Record<ScenarioTool, GuideCopy>`, so **omitting it is a typecheck failure**, not a silent gap.
6. **Instrument block** — everything from `type PoolPath = ` to the end of `ProbabilityVolume`, inserted
   immediately before `function LineChart({ labels, series, height = 280 }`.
7. **Lab mount** — `<InverseSolveLab …/>` after the `assumption-row` badges close the ledger section at
   the end of `renderScenario`.
8. **Risk mount** — `<ProbabilityVolume …/>` after the fan-chart `</section>` that ends
   `… Sample seed: {simulationSeed}.</div>`.
9. **`renderSurface`** — new renderer inserted before `const renderScenarioWorkspace=()=>{`.
10. **Workspace switch** — add `scenarioTool==="surface"?renderSurface():` to the ternary chain.
11. **Hub title** — "One active plan. Five ways to work with it." → "**Six** ways".

### `app/globals.css` (+42 / −2)
- `.scenario-hub-tabs` grid widened from `repeat(5,…)` to `repeat(6,…)`, and its stacking breakpoint
  moved from `850px` to `1180px` so six tabs never wrap to a ragged second row.
- A new block **appended at the end of the file** (after the existing appended scenario-hub rules):
  `.instrument-bar`, `.instrument-label`, `.instrument-sep`, `.solve-canvas`, `.solve-readout`,
  `.solve-kv`, `.solve-facts`, `.solve-prompt`, `.surface-wrap`, `.surface-canvas`,
  `.surface-readout`, `.volume-wrap`, `.volume-canvas`, `.volume-overlay`, `.volume-readout`,
  `.volume-sliders`, plus one `@media(max-width:650px)` block.
  **Append, do not insert.** `tools/validate-mobile-layout.mjs` asserts the index order
  `@media (max-width: 920px)` < `@media (min-width: 921px)` < `@media (max-width: 650px)` using
  `indexOf`, so a new spaced `@media (max-width: 650px)` placed earlier in the file would break the
  desktop-collapse guard. The appended rules deliberately use the unspaced `@media(max-width:650px)`
  form, matching the existing appended block.

### `tools/validate-integrated-explorer.mjs` (+13 / −4)
- reads `app/globals.css` as a sixth input (`appCss`); the existing `css` binding is `public/atlas.css`
  and asserting instrument styles against it silently passes nothing.
- "Five ways" assertion updated to "Six ways"; tool loop now includes `"surface"`.
- **new** assertions: each of `InverseSolveLab` / `DecisionSurface` / `ProbabilityVolume` is both
  defined and mounted; `poolPath` delegates to `calculateCanonicalFlatRetirementLedger` (this is the
  guard that stops anyone re-implementing the ledger inside an instrument); `renderSurface` exists; the
  four instrument style hooks exist in `globals.css`.
- summary line now reads "… six modes, five panels, **three scenario instruments** and V23 handoff
  verified." Diff it string-for-string against your baseline run.

## Traps already hit (don't rediscover them)
- **`Record<ScenarioTool, GuideCopy>` is exhaustive.** Adding the tool without the guide entry fails
  typecheck with a non-obvious error pointing at the record, not the tool.
- **The validator's `css` is Atlas CSS, not app CSS.** An assertion written against `css` for a
  `globals.css` class passes locally only if you happen to test the failure path.
- **`new RegExp("function " + name + "\\(")` inside a `.mjs` heredoc loses the escape** and throws
  `Unterminated group`. The committed assertion uses `includes("function " + name + "({")`.
- **`html { scroll-behavior: smooth }` breaks `scrollIntoView` assertions.** Measuring the element's
  rect immediately after `scrollIntoView` returns the pre-scroll position; use
  `window.scrollTo({behavior:"instant"})` or settle ≥600 ms. This cost two false diagnoses here.
- **Additive blending makes brightness a function of lines per pixel, not path count.** The cloud alpha
  is `0.5 * (canvasArea / (900*560)) / (paths / 1500)` precisely so a phone-sized canvas at 1,500 paths
  matches a desktop canvas at 6,000. Change one term and the phone blows out to white.
- **A near-cubic 3D subject needs a near-square frame.** At `cssHeight = cssWidth * 0.5` the volume
  wasted ~40% of its width; `0.64` with `radius 2.42` and a look-at target lifted to `y + 0.07`
  (because the plotted band runs −1 … +1.12, not −1 … +1) is what finally framed it.
- **`solveSpendAndReturn` must scan, not bracket.** The inner return solve is only valid over part of
  the spend range, so testing the interval endpoints reports "infeasible" where a solution exists. It
  samples 97 quadratically-spaced spends and looks for an adjacent pair of *valid* sign changes.
- **The y scale must not depend on the dragged target.** `InverseSolveLab` scales off the statutory
  ceiling path, which is independent of the target, so the axis cannot rescale mid-drag. If you port
  this to a canvas, keep that property — the obvious "scale to the data" version moves the value out
  from under the cursor.

## Two model findings the instruments now surface
Both are consequences of the flat ledger never drawing Pool C. They are the model behaving correctly,
not defects — do not "fix" them, and do not quietly soften the copy that explains them.

1. **Pool A is capped by transfer-balance headroom, never by capital, at every election.**
   `poolA = min(capital, max(0, headroom − buffer))` and the headroom side binds in all four elections.
   Extra capital at 60 cannot enter Pool A; it lands in Pool C. The only lever that raises Pool A is a
   lower defined-benefit special value, i.e. a lower gross pension, i.e. a different election. The
   **TBC headroom** solve mode reports the gross pension that would be required and which elections
   clear it.
2. **Pool A responds to spending as a cliff, not a dial.** Below the dead-zone ceiling
   (`netPension + poolA × drawRate(61)`, $116,810 at 70/30) every spend gives an identical Pool A path,
   because the statutory minimum already exceeds the lifestyle gap. The live band at 75 is roughly
   $27–31k wide depending on the return. The Lab shows the band and the dead-zone ceiling; the Surface
   draws the ceiling as a vertical wall.

## Gate this passed locally against `main` @ `4f15f9a`
`typecheck` → `validate:model` → `validate:policy` → `validate:visuals` → `validate:mobile` →
`validate-integrated-explorer` → `vite build`. Validator output is identical to the pre-change baseline
except the one intended line (see above):

```
Seeded risk parity: 16 scenarios, 480 paths and all percentiles unchanged.
Pass 2 frozen-ledger parity: 858 scenarios; every financial and presentation row agrees with the published baseline.
Policy comparator: advisory parity, all-ones parity, causal decisions, paired paths, election semantics and checks passed.
Atlas visual studio validated: 6 synchronized modes and 144 DOM bindings.
Mobile layout guardrails passed for Command Centre, VR, V23 and Atlas.
Integrated explorer guards: 16 legacy routes preserve all scenario fields; embedded ownership, message origins, six modes, five panels, three scenario instruments and V23 handoff verified.
```

Browser-verified in Chromium at 1400×900, 1024 and 375×812, in both themes:
zero console errors; six hub tabs on one row; Surface hover readout and click-to-adopt propagate to the
whole Command Centre (plan bar and URL both update); Lab drag solves without the axis rescaling;
every unreachable target explains itself instead of clamping silently; the joint solver round-trips —
pinning two points that lie on the active plan recovers $119,002 and 6.14% against an active
$119,000 / 6.14%; **σ = 0 collapses the volume to P5 = P50 = P95 and 100% survival**, which is the
zero-volatility parity invariant made visible; 1,500 / 6,000 / 12,000 paths all render without WebGL
context loss; no horizontal overflow at 375px.

## Your task
1. Pull `main` and re-verify this change with your own gate run, against the **promoted GitHub
   version** — not against this document.
2. Apply the same three instruments to the **ChatGPT Sites surface** (the usual-use surface). Same tool
   key `"surface"`, same URL contract (`?section=scenario&tool=surface` already works through the
   existing `legacyTool` / `openScenarioTool` plumbing — no new query parameters were added), same
   adopt-into-plan semantics clamped to the existing control ranges (spend 76,000 … `MAX_FLAT_SPEND`,
   real return 0.02 … 0.075).
3. Keep the guardrails: no engine-math, locked-figure, new-figure, rail-default or wash-logic changes;
   no deletions; no CDN or framework additions. The volume is hand-written WebGL and the surface is
   hand-written Canvas 2D precisely so that last one holds — **do not swap either for a charting
   library.**

## Known gaps, deliberately left out
- The instruments are **not** wired into the saved-scenario JSON, the review snapshot, or the AI
  assistant's context. They read the active plan and write back through `setSpend` / `setRealReturn`
  only.
- `InverseSolveLab` supports **one** pin. The preview that preceded this carried three saved
  scenarios, a pin list and a clipboard handoff note; those were dropped because the app already has
  saved scenarios and sharing, and duplicating them would have been the worse kind of addition.
- No visual-regression baseline has been captured for the three new panels. If you want one, run the
  manual workflow from the Actions tab per `docs/VISUAL_REGRESSION.md` — do **not** add the
  `Visual-Change-Approved: yes` marker to force a pass.
- The WebGL fallback is a message plus live percentile readouts, not a 2D redraw of the volume. The
  existing capital simulation fan sits directly above it and shows the same paths in two dimensions.
