# Command Centre + V23 consolidation

Date: 5 September 2026

## Product boundary

There are now two user workspaces: Command Centre for flat annual real-spending comparisons, and V23 for detailed age-band planning. Command Centre's five scenario tools are tabs of one Scenario workspace. Atlas is retained as an internal rendering module, not a separate product or separately authoritative scenario.

## View reconciliation

| Former Atlas feature | Destination |
| --- | --- |
| Lab, Explore, Compare, Frontier and Risk | Command Centre / Scenario tabs |
| Horizon, River, Orbit, Waterfall, Sunburst, annual Table | Scenario / Explore / Visual studio |
| Annual pension, draw, funded spend, surplus and salary equivalents | Explore the plan / Income by year |
| Capital paths at different real returns | Explore the plan / Return comparison |
| Pool architecture, objectives, milestones, guardrails | Explore the plan / How it fits together |
| Quantified spending trade-off table | Spending frontier |
| Duplicate landing, headline metrics, scenario controls | Existing Command Centre overview and one collapsible active-plan bar |
| Duplicate tax and evidence summaries | Existing Tax & estate and Evidence & audit |
| V23 detailed planning, risk, reinvestment and guides | Retained; navigation and guide descriptions reconciled |

Legacy atlas.html and atlas-prototype.html bookmarks resolve to the corresponding Scenario tab, preserving scenario, theme and visual mode. Legacy direct Command Centre section links for Lab, Explore, Compare, Frontier and Risk also resolve into the new hub. The embedded module accepts messages only from its same-origin parent; it does not independently persist a scenario. No new external scripts or dependencies.

## Clarity improvements

- One collapsed summary and editable plan bar on every Command Centre page.
- Five overlapping sidebar destinations are one Scenario destination with a persistent five-tab tool switcher; the sidebar has nine primary items instead of thirteen.
- Invalid number drafts keep the last valid calculation instead of changing the model to zero.
- URL tracks active settings and section, so a copied link is not stale.
- No temporary default financial results while shared/saved assumptions are loading.
- Shared help explains flat spending versus V23 age-band gaps, real dollars, pre/post-retirement returns and sensitivity versus probability.
- V23 quick start/control guide and static model reference describe the two-workspace structure.
- Visual modules reiterate active real return and election beside their figures.
- Salary equivalents distinguish all receipts before reinvestment from funded spending only.
- The map's buffer wording does not imply it eliminates a full-pension DB excess; the contribution milestone does not promise a wash when there is no PSS lump.

## Validation and limits

- Frozen financial comparisons: 780 full-row scenarios unchanged.
- Seeded risk regression: 16 scenarios, 480 complete paths and all percentiles unchanged.
- Six visual modes and DOM-binding validator; mobile layout guards.
- New build-blocking integrated-explorer validator: 16 legacy route cases, scenario preservation, same-origin ownership and module wiring.
- Existing Sites 25-test suite including V23 navigation, spending policies and scenario matrix.
- Browser checks: six modes, age inspector, keyboard and pointer activation, focus/Escape, income and return panels, full-pension cashflow, prudent basis fallback, invalid number drafts, all Command Centre navigation destinations, light/dark and 320/390px layouts.
- The local browser connector's frame-locator click did not reliably dispatch pointer clicks; native accessibility clicks and keyboard activation verified the actual visual controls.

This is a presentation/state consolidation, not a new legal or tax ruling. Financial formulas, source elections, real-dollar treatment and V23 calculation pages are retained. The frozen tests preserve previous outputs; they do not prove every planning assumption is suitable for every person. V23's richer annual ledger remains a later canonical-engine migration domain.
