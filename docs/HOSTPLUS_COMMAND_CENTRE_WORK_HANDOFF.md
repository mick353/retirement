# Hostplus Command Centre — Work / Codex Handoff

**Purpose:** give a ChatGPT Work / Codex session working on the public `mick353/retirement` project enough context to discover and continue the private Hostplus Command Centre safely, including building a private ChatGPT Site if that environment supports it.

## Repositories and trust boundary

- **Public / governed retirement repository:** `mick353/retirement`
  - Long-range retirement model, PSS/CSC source-backed data, retirement-day modelling and public-facing retirement application.
  - Must remain safe for public visibility.
  - Do **not** commit Hostplus credentials, member number, MFA data, browser cookies/session state, authenticated account exports, or private financial history here.

- **Private Hostplus repository:** `mick353/hostplus-command-centre`
  - Private live pre-60 financial engine and dashboard.
  - Holds the React/Vite application, confirmed Hostplus snapshots, unit ledger, contribution attribution, public Hostplus holdings ingestion, shadow tracking, stress testing, Exposure Atlas, S&P 500 comparator, retirement bridge, provenance controls and AI-analysis interfaces.
  - Treat this repository as the private factual / operational rail.

The intended architecture is:

`Hostplus account truth + public market data -> private Hostplus Command Centre -> reviewed/sanitised retirement sync proposal -> public retirement model`

The Hostplus Command Centre must never silently overwrite governed PSS/CSC evidence.

## Current implementation status

As of this handoff, the private repository has a real interactive React/Vite application on `main`; it is **not** merely a Markdown dashboard.

Major merged capabilities include:

- Mission Control mobile-first dashboard
- immutable Hostplus snapshots and cash-flow ledger
- contribution vs investment-return reconciliation
- plan-vs-actual tracking
- editable contribution / return / retirement-date modelling
- scenario library
- bear-market opportunity-capital framework
- history charts and unit-price charts
- Hostplus public holdings ingestion and security-level look-through
- exact concentration metrics and analytical AI / mega-cap watchlists
- Exposure Atlas with identifier-jurisdiction proxy, concentration curves and structural stress nodes
- S&P 500 / SPY comparator with governed State Street source pipeline
- shadow-price estimation and later actual-vs-shadow calibration
- provenance classes distinguishing confirmed, public-source, benchmark, market-derived and modelled data
- Hostplus public unit-price ledger infrastructure
- local browser collector prototype designed for user-controlled SMS MFA
- retirement-sync proposal engine with hard PSS/CSC write protections
- deployment/security preflight controls
- AI-analysis packet / handoff architecture without exposing a browser-side API key

The private repo `main` should be inspected directly for the latest authoritative code and documentation before making changes.

A development branch named `phase20-planning-baselines` was started for versioned planning baselines. Treat branch status as non-authoritative until inspected; do not assume it is complete or merged.

## Existing retirement-side integration

The public retirement repository already contains:

- `app/hostplus-live-core.ts`
- `app/hostplus-sync-import.ts`
- `docs/HOSTPLUS_LIVE_INTEGRATION.md`
- Hostplus snapshot / retirement-sync schemas

The existing retirement sync validator deliberately does **not** mutate retirement-core constants or CSC/PSS values automatically. Preserve that design.

The public retirement model currently contains legacy/static Hostplus planning anchors. The private Command Centre should progressively supersede those for **reviewed pre-60 Hostplus scenario inputs**, not by silently rewriting source-backed retirement evidence.

## Immediate Work / Codex objective

If ChatGPT Work / Codex has access to both repositories and ChatGPT Sites, the preferred next step is to create a **private owner-only Hostplus Command Centre Site** using the private `mick353/hostplus-command-centre` codebase as the application/source layer.

The Site should be the primary phone-friendly interface, while GitHub remains the engineering, audit and data-governance layer.

Do **not** publish the financial application publicly merely to obtain a convenient URL.

If ChatGPT Sites cannot support a required backend capability, retain protected Vercel as a secondary/fallback deployment option rather than weakening the privacy boundary.

## Site product requirements

The target is a cutting-edge private financial command centre, not a static report. Preserve and extend the following product model:

### Mission Control

At-a-glance current position, allocation, contribution status, account movement, evidence freshness, risk state, alerts and next actions.

### Snapshot timeline

Immutable point-in-time records of Hostplus balances, units, unit prices, contributions, fees/charges and allocation settings. Confirmed history must never be retroactively rewritten.

### Performance attribution

Separate:

- money contributed
- investment return
- fees/charges
- unit accumulation
- time-weighted return
- personal money-weighted return / XIRR once enough history exists

### Graphs

Include, at minimum:

- total balance vs cumulative contributions
- Australian vs International unit prices
- units held through time
- account drawdown from peak
- contribution history
- plan-vs-actual trajectory
- age-60 projection fan
- concentration curve
- top-company exposure
- AI / semiconductor-chain exposure
- Australian bank / resource concentration
- Hostplus vs S&P 500 comparison
- shadow estimate vs later confirmed Hostplus actual
- model residual / MAE / bias history
- eventually sector, country, currency and valuation histories once governed data exists

### Actions

Support reviewed user actions such as:

- import / reconcile a new Hostplus snapshot
- change future contribution assumptions
- save / load scenarios
- generate retirement sync proposal
- export factual history
- export AI audit packet
- launch / guide local Hostplus collector authentication
- acknowledge / annotate alerts
- create a planning baseline

No automatic trading or uncontrolled financial-account actions.

### Integrated AI

Preferred end state: authenticated in-site AI analyst using a server-side or Site-native secure model connection.

The AI must consume a governed packet containing source/evidence classes and must not collapse the distinction between:

- Hostplus-confirmed facts
- Hostplus public-source facts
- benchmark-primary data
- market-derived estimates
- planning assumptions
- modelled scenarios
- governed retirement / PSS inputs

Never embed an OpenAI API key in browser JavaScript.

Useful analysis modes include:

- What changed?
- Hostile Committee / adversarial risk review
- AI-bubble stress test
- Contribution decision analysis
- Pre-60 trajectory review
- Plan vs actual
- Retirement-sync impact

## Hostplus authentication design

The intended Member Online workflow is:

`user launches local collector -> Chrome / dedicated profile -> user completes normal Hostplus login -> Hostplus sends SMS MFA -> user enters OTP directly into Hostplus -> collector reads only required account fields -> sanitised snapshot is produced locally`

Do not automate SMS interception or attempt to bypass MFA, bot protection, CAPTCHA or other Hostplus controls.

Credentials and authenticated session material must remain local and outside GitHub / ChatGPT Site data.

## Public/private retirement integration rules

1. Private Command Centre may read governed retirement assumptions required for pre-60 modelling.
2. Private Command Centre may generate a sanitised retirement-sync **proposal**.
3. Public retirement repository changes must be reviewable through GitHub / PR workflow.
4. No Hostplus credentials, account identifiers, browser state or MFA information may enter the public repo.
5. Current account values and private financial history should not be published to the public repo merely because they are credential-safe.
6. CSC/PSS source-backed values and evidence must not be modified by Hostplus automation.
7. If retirement `main` has moved since the proposal's recorded source commit, regenerate/review the proposal before write-back.

## Data-quality doctrine

Maintain four separate layers:

1. **Account truth** — authenticated Hostplus snapshots and cash flows.
2. **Market truth** — Hostplus public holdings/prices, benchmark data, FX and external market inputs.
3. **Model truth** — projections, stress tests, scenario assumptions, bear-market rules.
4. **Retirement truth** — governed PSS/CSC and retirement-model evidence.

Never silently promote an estimate to a confirmed fact.

## Recommended continuation sequence

1. Inspect `mick353/hostplus-command-centre` `main` and its docs before changing anything.
2. Inspect `phase20-planning-baselines` and either complete it with tests/PR or supersede it cleanly.
3. Create / configure a **private ChatGPT Site** from the private Command Centre if supported.
4. Verify signed-out / non-owner access is denied before treating the Site as production-ready.
5. Preserve mobile-first design and all existing interactive controls.
6. Add direct authenticated AI only behind the private access boundary.
7. Improve governed sector/economic-country metadata enrichment while surfacing unclassified weight instead of inventing classifications.
8. Continue automatic Hostplus holdings and SPY source refresh pipelines.
9. When the user is at a desktop, test the local Hostplus collector with user-controlled SMS MFA.
10. Keep the public retirement model aligned through reviewed sync proposals, not silent mutation.

## What to ask the Work / Codex session

A concise instruction is sufficient:

> Read `docs/HOSTPLUS_COMMAND_CENTRE_WORK_HANDOFF.md` in `mick353/retirement`, then inspect the private `mick353/hostplus-command-centre` repository and continue the work. Prioritise a private owner-only ChatGPT Site for the full interactive Command Centre, preserve the public/private trust boundary, and do not publish private Hostplus data into the public retirement repository.

If the Work / Codex environment cannot access the private repository, stop and ask for that GitHub repository to be connected rather than reconstructing the system from the public retirement repo.
