# Robinson Retirement Command Centre

A responsive, interactive retirement planning command centre built from the Robinson retirement model, PSS defined-benefit analysis and the corrected V23 simulation workbench.

## Live versions

- GitHub Pages: <https://mick353.github.io/retirement/>
- ChatGPT Sites: <https://robinson-retirement.mick353.chatgpt.site>
- Deep V23 workbench: <https://mick353.github.io/retirement/deep-model.html>
- Visual explorer (formerly Atlas): <https://mick353.github.io/retirement/?section=scenario&tool=explore>

Command Centre uses a flat annual net-spending comparison. V23 keeps its separate, saved age-band spending plan; a shared link carries assumptions without silently replacing that plan. The former Atlas visualisations now live inside Command Centre's Scenario → Explore tab. GitHub Pages and ChatGPT Sites are separate published surfaces and can temporarily differ while a pull request or deployment is pending.

## Start here

1. Check the active rail, dated CSC provider basis and PSS election. The provider basis sets retirement-day pension and lump figures; the site's real-return control applies afterwards.
2. In Scenario → Lab, compare desired and funded spending, then inspect the annual ledger and investment capital. A spending shortfall is not income.
3. Use Scenario → Explore for age-by-age values, Compare and Frontier for flat-spending trade-offs, and Risk for sampled and stress sensitivities. Sample frequencies are model outputs, not personal forecast odds.
4. Open V23 Income & draws for spending that changes by age. On Guardrail spending, advice is the default; the opt-in Adaptive Policy Comparator requires an explicit essential total budget and compares policies on paired return paths without changing the saved plan.
5. Read the static model reference for source dates, calculation boundaries and tax assumptions before making a real decision.

## What is included

- Integrated command centre with Rail A plus two selectable, source-backed Rail B provider bases
- Governed provider-basis layer: both the 8.2% fund / 5% salary / 2.5% CPI and 6% / 5% / 3% sets have direct 60/40, 65/35, 70/30 and 100% pension estimates; the prudent 100% estimate retains its separate 9 September source and FAS
- Former Atlas visualisations and strategy map within Scenario → Explore
- Adjustable scenario lab and side-by-side saved-scenario comparison
- Spending and estate frontier analysis
- Mobile Frontier context that keeps the selected comparison age visible and distinguishes it from the age-95 projection horizon
- Monte Carlo fan chart, probability gauge and stress controls
- PSS defined-benefit, three-pool, TBC and source-limited tax/estate wash views
- Surplus-aware 100% pension modelling: pension above the selected total spend routes to Pool C rather than being treated as spent
- Present-to-age-60 action plan and a scenario-aware voluntary-retirement/redundancy view: the active Rail B provider basis and election supply the exact CPI-reduced age-60 anchor, while March/V5 age factors transparently generate labelled age-57–59 illustrations on a consistent real-dollar basis
- Progressive disclosure for secondary PSS, VR and evidence detail while source-basis and election controls remain immediately visible and keyboard operable
- Annual review checklist and review snapshot
- Corrected V23 model with advanced controls, export, print packs and mobile workbench
- Opt-in V23 Adaptive Policy Comparator with advisory default, explicit PSS election semantics, identical-path Monte Carlo and configurable age-75/85 investment checks
- V23.5 control-integrity safeguards: exact number fields and sticky assumptions stay synchronised, manually authored age bands survive PSS election/basis changes, and shared flat scenarios require an explicit choice before replacing a saved detailed plan
- V23.7 plain-English lifestyle funding: every phase now shows the planned gap, amount actually funded, target-funding percentage, compulsory ABP payment used, and whether the funded gap stays within portfolio earnings; the active PSS election, CSC basis and post-retirement return are repeated beside the results
- Simplified V23 everyday navigation with all specialist analysis retained behind an Advanced analysis disclosure
- Responsive navigation, installable PWA manifest and offline app shell
- Retractable Gemini retirement adviser using the active scenario and detailed V23 model reference

## Run locally

Requirements: Node.js 22.13 or newer.

```bash
npm ci
npm run dev:pages
```

Open <http://localhost:5173/retirement/>.

To produce the same static site GitHub Pages deploys:

```bash
npm run build:pages
npm run preview:pages
```

The output is written to `dist-pages/`.

## Publishing

The workflow in `.github/workflows/pages.yml` builds and deploys the site after every push to `main`. In GitHub, select **Settings → Pages → Source: GitHub Actions** if Pages is not enabled automatically on the first run.

## Data and privacy

The published website contains personal retirement assumptions and modelled financial figures. The source PDFs, spreadsheets and research files are intentionally not committed. Only the integrated website and its calculation logic are included.

The site stores saved scenarios, the selected PSS election and provider basis, and annual-review preferences only in the current browser using local storage. It has no account system or server-side database.

When a user sends an adviser message, the current retirement scenario, the detailed model reference and that chat history are sent to the protected ChatGPT Site endpoint and then to Google Gemini. The Gemini credential remains server-side and is not stored in this public repository or exposed to the browser.

The V23 workbench also has a separate page-aware AI review panel. Each message attaches the active V23 page, current controls, rendered tables and chart datasets at send time. Its device-local chat history is separate from the main Command Centre adviser and can be reset independently.

## Important notice

This is a personal planning model, not financial, taxation or legal advice. Outputs depend on assumptions and should be checked against current legislation, fund rules, official PSS estimates and qualified professional advice before decisions are made.
