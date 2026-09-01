# Robinson Retirement Command Centre

A responsive, interactive retirement planning command centre built from the Robinson retirement model, PSS defined-benefit analysis and the corrected V23 simulation workbench.

## Live versions

- GitHub Pages: <https://mick353.github.io/retirement/>
- ChatGPT Sites: <https://robinson-retirement.mick353.chatgpt.site>
- Deep V23 workbench: <https://mick353.github.io/retirement/deep-model.html>
- Retirement Atlas: <https://mick353.github.io/retirement/atlas.html>

The Command Centre, Atlas and V23 share the rail, PSS election, PSS provider projection basis, total spending target, real return, target age, home, tax year, reserve policy and simulation seed. GitHub Pages and ChatGPT Sites are parallel published surfaces; ChatGPT Sites is the usual-use surface and GitHub is the public mirror/backup.

## What is included

- Integrated command centre with Rail A plus two selectable, source-backed Rail B provider bases
- Governed provider-basis layer: the 8.2% fund / 5% salary / 2.5% CPI set has 60/40, 65/35, 70/30 and 100% pension; the 6% / 5% / 3% set has direct 60/40, 65/35 and 70/30 estimates, while only its unsupplied 100% election remains disabled
- Retirement Atlas strategy map with reciprocal links to the Command Centre and V23
- Adjustable scenario lab and side-by-side saved-scenario comparison
- Spending and estate frontier analysis
- Mobile Frontier context that keeps the selected comparison age visible and distinguishes it from the age-95 projection horizon
- Monte Carlo fan chart, probability gauge and stress controls
- PSS defined-benefit, three-pool, TBC and source-limited tax/estate wash views
- Surplus-aware 100% pension modelling: pension above the selected total spend routes to Pool C rather than being treated as spent
- Present-to-age-60 action plan and a clearly isolated March/V5 voluntary-redundancy sensitivity; the VR page does not pretend the September age-60 provider bases are formal age-57–59 estimates
- Progressive disclosure for secondary PSS, VR and evidence detail while source-basis and election controls remain immediately visible and keyboard operable
- Annual review checklist and review snapshot
- Corrected V23 model with advanced controls, export, print packs and mobile workbench
- V23.5 control-integrity safeguards: exact number fields and sticky assumptions stay synchronised, manually authored age bands survive PSS election/basis changes, and shared flat scenarios require an explicit choice before replacing a saved detailed plan
- V23.6 plain-English lifestyle funding: every phase now shows the planned gap, amount actually funded, target-funding percentage, compulsory ABP payment used, and whether the funded gap stays within portfolio earnings; the active PSS election, CSC basis and post-retirement return are repeated beside the results
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

This repository is public and the website contains personal retirement assumptions and modelled financial figures. The source PDFs, spreadsheets and research files are intentionally not committed. Only the integrated website and its calculation logic are included.

The site stores saved scenarios, the selected PSS election and provider basis, and annual-review preferences only in the current browser using local storage. It has no account system or server-side database.

When a user sends an adviser message, the current retirement scenario, the detailed model reference and that chat history are sent to the protected ChatGPT Site endpoint and then to Google Gemini. The Gemini credential remains server-side and is not stored in this public repository or exposed to the browser.

The V23 workbench also has a separate page-aware AI review panel. Each message attaches the active V23 page, current controls, rendered tables and chart datasets at send time. Its device-local chat history is separate from the main Command Centre adviser and can be reset independently.

## Important notice

This is a personal planning model, not financial, taxation or legal advice. Outputs depend on assumptions and should be checked against current legislation, fund rules, official PSS estimates and qualified professional advice before decisions are made.
