# Hostplus Live / Pre-Retirement Integration Foundation

Status: foundation design for the live Hostplus tracker and retirement integration.

## Purpose

The existing retirement model is projection-led. This foundation introduces a point-in-time, evidence-led pre-retirement layer that can start from an actual dated Hostplus position and then project forward from that real state.

The target architecture is deliberately split into two systems:

1. **Private Hostplus Command Centre** — authenticated account collection, private snapshots, transaction history, exact unit ledger, contribution attribution, live/shadow market tracking, drawdown analysis and contribution scenario controls.
2. **Retirement Command Centre** — governed PSS/CSC sources, retirement elections, post-retirement capital/spending analysis and a sanitised pre-retirement Hostplus input.

The private system may feed selected values into the retirement model. The public retirement repository must never become a credential store or a private Hostplus database.

## Trust boundary

Never commit any of the following to this public repository:

- Hostplus username, password or member number;
- SMS MFA codes;
- browser cookies, session tokens or local-storage credentials;
- password-manager exports;
- raw authenticated Hostplus HTML containing account identifiers;
- private snapshot history unless explicitly sanitised for publication.

The browser collector should keep credentials and MFA inside the user's normal browser/authentication boundary. Automation may continue after the user completes Hostplus SMS verification, but it must not bypass or defeat MFA.

## Proposed private sync flow

```text
User presses Sync Hostplus
        |
        v
Local browser collector opens Hostplus
        |
        +-- valid session --> continue
        |
        +-- SMS MFA required --> user completes verification --> continue
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
```

## Canonical snapshot model

The public code contract is implemented in `app/hostplus-live-core.ts`.

A confirmed snapshot is expected to contain:

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

The current retirement model remains authoritative for PSS/CSC inputs. A live Hostplus sync pack may replace only the pre-retirement Hostplus opening/projection input; it must not overwrite PSS pension, lump-sum, tax-component or provider-assumption sources.

## Contribution modelling

The live core supports separate contribution streams:

- gross salary-sacrifice/concessional amount;
- concessional contribution tax (default 15%);
- direct after-tax/non-concessional amount;
- exact fortnightly cadence from a real next-contribution date;
- dated contribution phases;
- option allocation targets.

This allows scenarios such as:

- change salary sacrifice on a real future pay date;
- add or remove the later direct-contribution phase;
- temporarily accelerate contributions during a drawdown;
- model a one-off cash deployment separately from ordinary payroll contributions;
- compare plan versus actual from any later date.

## Reconciliation model

For two confirmed snapshots:

```text
current balance
- previous balance
- net external cash flow
= investment movement after account charges
```

Where available, fees and insurance are separated so the engine can also estimate investment movement before those charges.

Unit deltas are retained by option. This allows contributions and option switches to be distinguished from investment returns.

## Private Hostplus Command Centre — planned modules

### Live Position

- confirmed Hostplus balance;
- shadow/live estimate between Hostplus price publications;
- exact unit ledger;
- current versus target allocation;
- contribution status and pending transactions;
- last successful authenticated sync.

### Performance Attribution

- total personal contributions;
- concessional tax drag;
- fees and insurance;
- investment gain/loss;
- money-weighted return (XIRR);
- time-weighted return;
- option-level contribution to return;
- plan versus actual.

### Look-through Portfolio

- Australia / US / Japan / Europe / other developed exposure;
- sector exposure;
- major-company effective weights;
- currency exposure;
- AI/mega-cap concentration;
- Australian bank/resource concentration;
- valuation and earnings-yield indicators;
- comparison with S&P 500, Hostplus Indexed High Growth and other approved references.

### Drawdown / Bear-Market Engine

- peak balance and peak unit-price reference;
- current drawdown;
- staged drawdown thresholds;
- contribution acceleration scenarios;
- optional opportunity-capital tranches;
- recovery-to-old-peak estimate;
- account recovery versus market/unit-price recovery;
- explicit invalidation conditions before any tactical action.

### Snapshot Archive

- immutable authenticated snapshots;
- transaction events;
- allocation-setting changes;
- contribution-setting changes;
- assumption changes;
- reconciliation status;
- provenance and evidence status.

### Retirement Bridge

The private system should produce a minimal sanitised `RetirementSyncPack` containing only what the retirement engine requires, such as:

- as-of date;
- confirmed Hostplus balance;
- retirement date;
- current contribution schedule;
- projected Hostplus balance under named assumptions;
- target allocation;
- provenance label.

No credentials, member number, MFA data or private browser state should cross this interface.

## Source classifications

Every material value in the private tracker should be labelled as one of:

- **CONFIRMED** — directly read from authenticated Hostplus or another primary source;
- **DERIVED** — direct arithmetic from confirmed source values;
- **MARKET-DERIVED** — calculated from public index, security or FX data;
- **MODELLED** — scenario/projection output;
- **ASSUMED** — user-selected or planning assumption;
- **SPECULATIVE** — future state not directly inferable from evidence.

## Security model

Preferred implementation:

- dedicated local browser profile or explicitly selected existing Chrome profile;
- no passwords in source code;
- no SMS interception;
- no MFA bypass;
- local encrypted/private snapshot store;
- least-privilege extraction of portfolio fields only;
- automatic sync only while the authenticated session remains valid;
- explicit `authentication required` state when Hostplus asks for MFA again;
- private repository or private backend for the Hostplus application itself.

## Immediate implementation boundary

This branch contains only reusable public-safe code and architecture. It intentionally contains **no live personal Hostplus snapshot data and no authentication code**.

The next implementation stage should occur in a separate private repository or private backend. That stage can add:

1. the private snapshot store;
2. the phone-friendly dashboard;
3. import/manual-entry workflow;
4. browser collector prototype;
5. retirement sync-pack export;
6. automated validation against the public retirement engine.
