# Adaptive Policy Comparator — Phase 1

The V23 Guardrail spending page compares the active plan with an adaptive version of that same plan. It does not change the active plan. Advisory remains the default everywhere else.

## Calculation order

Each annual row starts with the prior closing Pool A/B/C balances. The policy checks those opening balances against the existing V23 investment-capital zones, then adjusts only the explicitly classified discretionary part of desired total spending. The existing V23 ledger calculates PSS spending or surplus, mandatory ABP draw, returns, extra withdrawals, Pool C routing, one-offs and closing balances. The next decision uses those closing balances. The current period's return never enters the policy decision.

The default multipliers are the existing advisory zone values: 70%, 90%, 100%, 120% and 135%. The essential total budget is entered separately and is never multiplied. If essentials exceed desired spending, the comparison stops. V23's percentage-of-current-return spending rule is ex-post; adaptive comparison rejects it until a lagged rule is designed and validated.

## Comparison contract

- **Same total lifestyle:** the selected election's desired total is carried across elections, including every dollar band and growth step. A larger PSS pension can create a surplus routed by the existing ledger.
- **Same additional gap above PSS:** the selected gap programme is carried across elections. Total spending changes with PSS income.
- Return, volatility, seed, provider projection basis, horizon, one-offs, Pool C policy and other economic assumptions stay common. The return matrix is generated once without an election-dependent seed and reused for all policies and elections.
- Age 75 and 85 checks measure investment capital (Pools A+B+C), excluding the home. Informational and inactive checks have no pass/fail threshold. Preferred checks report headroom but do not affect hard-feasibility status. Hard checks require an explicit amount; all active hard checks must pass. An age outside the horizon is not evaluated.

The results distinguish desired, permitted and funded spending; an adaptive cut does not erase an unmet desired lifestyle. Funded discretionary spending is the amount funded above the explicitly entered essential budget. Core shortfalls compare funded spending to that budget. The table reports actual investment balances and cut/shortfall years; paired Monte Carlo reports absolute values and within-path deltas.

## Coverage boundary

This first release does not rank after-tax inheritance. Existing Hostplus component and Pool C cost-basis uncertainty makes a precise pathwise after-tax comparison unsupported. Gross investment capital is not a home-inclusive estate measure. A liquidity reserve is not inferred from all invested Pool C assets. The age checks here do not represent an absolute estate floor or liquidity requirement. The existing V23 one-off capacity tool remains separate and has not been reclassified as a multi-constraint solver.

`npm run validate:policy` checks advisory and all-ones parity, changed adaptive paths, opening-period causality, random-path reproducibility, election semantics, hard-check classification and rendered comparator output. It is part of the production build gate.
