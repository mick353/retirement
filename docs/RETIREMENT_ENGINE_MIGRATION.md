# Canonical retirement engine — Pass 2
Date: 5 September 2026

## Implemented boundary
Pass 1 supplied shared PSS opening positions and wash calculations. Pass 2 adds calculateFlatRetirementLedger in app/retirement-core.ts. Command Centre and Atlas now adapt its numeric rows into their existing presentation shapes. Frontier, observatory and risk projections use that ledger through those consumers. No financial assumption or source election changes are intended.

The generated public/retirement-engine.js is built from the TypeScript source, never edited by hand. Browser cache references are advanced with this release.

## Preserved conventions
- Age 60 is an opening capital snapshot; operating years end at ages 61–95.
- All returns and spending in this ledger use the existing real-dollar convention. No additional CPI adjustment is applied.
- Pool A mandatory draws, additional spending draws, Pool C drag, surplus routing, shortfalls and end-of-year balance arithmetic retain their published order.
- Gross salary equivalent remains presentation-only and does not determine available capital.
- Rail A and each source-backed Rail B election retain their separate inputs.
- The flat-spend ledger does not withdraw from Pool C to cover shortfalls. This is the existing comparison convention, not a new legal restriction.

## Deliberately not migrated yet
V23 retains its richer age-band/Pool B/one-off/Pool C-spending-policy ledger. Its existing tests and shared opening-position engine remain active. VR-specific rules and tax-display helpers have not been fully consolidated. A single flat-spend engine must not silently replace these different policies.

## Regression evidence
tools/fixtures/pass2-legacy-ledgers.mjs freezes the old Command Centre, Atlas and Monte Carlo implementations from published GitHub commit 0a3fe30a33f7e53e63ce8df28119816d7b45e090. These are test-only oracles, excluded from browser execution and deployment assets.
tools/validate-ledger-migration.mjs checks:
- 780 cases, with exact full-row comparison across source bases, elections, spending, returns, tax years, exhausted balances and sampled-return paths.
- Source TypeScript and generated browser engine parity.
- 16 seeded Monte Carlo scenarios: all 480 paths and every percentile match the frozen baseline.
- Non-negative balances and funded spending plus shortfall reconciliation.
These checks block both release builds. Parity proves preservation, not an independent legal or actuarial certification.

## Efficiency and future reuse
The two independent flat-spend loops are now one maintained implementation. Risk calculations call numeric rows directly, avoiding 21,000 unnecessary gross-salary-equivalent conversions per standard 600-path run (35 operating years each). No speed percentage is claimed; device and browser performance varies.

Separating inputs from rendering makes a future personal template feasible. It still requires profile/onboarding design, validation, source provenance, privacy, scheme-specific rules and independent testing before use by other people.

## Next migration gate
Inventory and specify V23 policy differences first. Freeze V23 outputs for representative age-band and Pool B/Pool C scenarios. Extract one domain at a time and require explicit approval for any intentional financial-behaviour change. Preserve all current views, controls and source boundaries.

## Presentation
Atlas's Quantified trade-off now states the active real return, election, target age and home assumption in the section itself, and refreshes them with scenario changes.

