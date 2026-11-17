# Scenario instrument review — 18 November 2026

Owner: Codex. Scope: review Claude PR #14, improve observed issues, synchronize Sites and local checkouts.

- Source reviewed: GitHub main b74eff2 and HANDOFF_TO_CODEX_scenario-instruments.md.
- Baseline: clean install, typecheck and full Pages build passed with the documented model/policy/mobile/explorer summaries.
- Improvements: allow joint spending/return solves above the active-return ceiling; explain independent 3D path count/volatility; distinguish an empty pool from spending failure; update help to six tools.
- Regression: known-plan spend, return and joint inverse round-trips, including a target above the active-return ceiling. This runs inside the integrated explorer gate.
- Acceptance: release status and browser evidence are recorded in the local delivery receipt under 02_DEVELOPMENT_RECORDS/handoffs. Publication is not established by this source review alone.
- Maintenance dependency: npm audit reports five high-severity entries in the existing GitHub development tooling (Vite/picomatch/source-map-js and their dependants). Audit saved in outputs/github-audit-2026-11-18.json. A tested dependency upgrade remains separate work; no dependency changes are included here.
- Rollback: revert the review commit through a PR; Sites can redeploy its preceding saved version.
