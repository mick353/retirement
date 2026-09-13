# Hostplus Live / Pre-Retirement Integration Foundation

Status: active foundation for the live Hostplus tracker and retirement integration.

## Purpose

The existing retirement model is projection-led. This foundation introduces a point-in-time, evidence-led pre-retirement layer that can start from an actual dated Hostplus position and then project forward from that real state.

The architecture is deliberately split into two systems:

1. **Private Hostplus Command Centre** (`mick353/hostplus-command-centre`) — authenticated-account collection, private snapshots, transaction history, exact unit ledger, contribution attribution, live/shadow market tracking, drawdown analysis and contribution scenario controls.
2. **Retirement Command Centre** (`mick353/retirement`) — governed PSS/CSC sources, retirement elections, post-retirement capital/spending analysis and a sanitised pre-retirement Hostplus input.

The private system may feed selected values into the retirement model. The public retirement repository must never become a credential store or a private Hostplus database.

## Trust boundary

Never commit any of the following to this public repository:

- Hostplus username, password or member number;
- SMS MFA codes;
- browser cookies, session tokens or local-storage credentials;
- password-manager exports;
- raw authenticated Hostplus HTML containing account identifiers;
- private snapshot history unless explicitly sanitised for publication.

The browser collector keeps credentials and MFA inside the user's normal browser/authentication boundary. Automation may continue after the user completes Hostplus verification only where Hostplus permits it; it must not bypass MFA, CAPTCHA, bot controls or other security measures.

## Private sync flow

```text
User presses Sync Hostplus
        |
        v
Local browser collector opens Hostplus
        |
        +-- valid session --> continue
        |
        +-- MFA required --> user completes verification --> continue
        v
Collector reads only approved portfolio fields
        v
Local validation + sanitisation
        v
Private immutable snapshot store
        |
        +--> Private Hostplus dashboard
        +--> Shadow-market/reconciliation engine
        +--> Sanitised retirement sync pack
        v
Public retirement repo validates the sync pack
        v
Reviewed pre-60 Hostplus scenario input
```

## Canonical snapshot model

The public code contract is implemented in `app/hostplus-live-core.ts`.

A confirmed snapshot can contain:

- Hostplus fund-price date;
- capture timestamp;
- exact units by option;
- exact unit price by option;
- optional Hostplus-reported option balance;
- current balance weight;
- future transaction weight;
- total Hostplus balance;
- provenance (`hostplus-confirmed`, `manual`, or `imported`).

Snapshots are immutable. Corrections create a later corrected snapshot or a correction event; historical rows are not silently overwritten.

## Point-in-time projection principle

All future projections should start from:

```text
actual dated snapshot
+ actual future contribution settings
+ exact contribution phase dates
+ explicit return assumption
+ explicit scenario shocks, if any
= projected retirement-day Hostplus position
```

This replaces the weaker pattern of repeatedly projecting from an old static Hostplus opening anchor.

The current retirement model remains authoritative for PSS/CSC inputs. A live Hostplus sync pack may replace only the pre-retirement Hostplus opening/projection input after explicit review; it must not overwrite PSS pension, lump-sum, tax-component or provider-assumption sources.

## Contribution modelling

The live core supports separate contribution streams:

- gross salary-sacrifice/concessional amount;
- concessional contribution tax (default 15%);
- direct after-tax/non-concessional amount;
- exact fortnightly cadence from a real next-contribution date;
- dated contribution phases;
- option allocation targets.

This allows scenarios such as changing salary sacrifice on a real future pay date, adding the later direct-contribution phase, temporarily accelerating contributions during a drawdown, modelling a one-off cash deployment separately, and comparing plan versus actual from any later date.

A critical governance rule is that **plan is not implementation**. If the retirement plan says $650/fortnight salary sacrifice but the live Hostplus evidence shows a $650 personal contribution, the live system retains that distinction until payroll implementation is actually confirmed.

## Reconciliation model

For two confirmed snapshots:

```text
current balance
- previous balance
- net external cash flow
= investment movement after account charges
```

Where available, fees and insurance are separated so the engine can also estimate investment movement before those charges. Unit deltas are retained by option so contributions and switches can be distinguished from investment returns.

## Retirement sync-pack contract

The private system exports a sanitised `schemaVersion: 1` pack. The public-side runtime validator is implemented in `app/hostplus-sync-import.ts`; the machine-readable contract is `schemas/hostplus-retirement-sync.schema.json`.

The pack contains only:

- generation timestamp and source system;
- Hostplus as-of date;
- confirmed current Hostplus balance;
- retirement date;
- Australian/international target allocation;
- named base, prudent and low-return Hostplus projections;
- current personal-contribution setting;
- planned/confirmed salary-sacrifice start and amount;
- later phase-3 total contribution setting;
- contribution-tax assumption;
- provenance.

It contains no Hostplus credentials, member number, MFA data or browser state.

`parseExternalHostplusRetirementSyncPack()` rejects malformed or unexpected inputs. `reviewExternalHostplusSyncPack()` surfaces warnings, including a planned salary-sacrifice amount with no confirmed implementation date. `hostplusProjectionFromReviewedSync()` returns a reviewed Hostplus projection but deliberately does **not** mutate retirement-core constants or any CSC/PSS values.

## Source classifications

Every material value should retain its evidence class:

- **CONFIRMED** — directly read from authenticated Hostplus or another primary source;
- **DERIVED** — direct arithmetic from confirmed source values;
- **MARKET-DERIVED** — calculated from public index, security or FX data;
- **MODELLED** — scenario/projection output;
- **ASSUMED** — user-selected or planning assumption;
- **SPECULATIVE** — future state not directly inferable from evidence.

## Private Command Centre current implementation

The private repository now contains:

- confirmed snapshot and cash-flow seed history;
- exact unit and contribution reconciliation;
- point-in-time projections;
- time-weighted return, Modified Dietz and guarded XIRR infrastructure;
- plan-versus-actual tracking;
- contribution/return scenario library;
- bear-market opportunity-capital controls with a protected cash floor;
- sanitised retirement sync-pack export;
- shadow-market estimate and proxy-calibration engine;
- local read-only Chrome/Playwright collector prototype with user-controlled MFA and fail-closed parsing.

The private command centre remains the only place for private factual history. The public retirement repository receives only the sanitised bridge payload after review.

## Security model

Preferred implementation:

- dedicated local browser profile or explicitly selected existing Chrome profile;
- no passwords in source code;
- no SMS interception;
- no MFA bypass;
- no bot-control circumvention;
- local encrypted/private snapshot store;
- least-privilege extraction of portfolio fields only;
- automatic sync only while the authenticated session remains valid and permitted;
- explicit `authentication required` state when Hostplus asks for MFA again;
- private repository or private backend for the Hostplus application itself.

## Public-repository implementation boundary

This branch contains only reusable public-safe code, validators, schemas and architecture. It intentionally contains **no live personal Hostplus snapshot data and no authentication code**.

A later retirement-UI integration should be separately reviewed. It may display a reviewed sync-pack projection as an alternate pre-60 Hostplus scenario input, but it should not silently replace the existing governed Hostplus planning anchor or mutate provider-source PSS values.
