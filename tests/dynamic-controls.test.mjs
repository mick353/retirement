import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import vm from "node:vm";
import { ModuleKind, ScriptTarget, transpileModule } from "typescript";

const dashboard = await readFile(new URL("../app/retirement-dashboard.tsx", import.meta.url), "utf8");
const atlas = await readFile(new URL("../public/atlas.js", import.meta.url), "utf8");
const atlasHtml = await readFile(new URL("../public/atlas.html", import.meta.url), "utf8");
const v23 = await readFile(new URL("../public/deep-model.html", import.meta.url), "utf8");
const browserEngine = await readFile(new URL("../public/retirement-engine.js", import.meta.url), "utf8");
const modelReferenceHtml = await readFile(new URL("../public/model-reference.html", import.meta.url), "utf8");
const modelReferenceText = await readFile(new URL("../public/model-reference.txt", import.meta.url), "utf8");
const coreSource = await readFile(new URL("../app/retirement-core.ts", import.meta.url), "utf8");
const coreScript = transpileModule(coreSource, { compilerOptions: { module: ModuleKind.ESNext, target: ScriptTarget.ES2022 } }).outputText;
const core = await import(`data:text/javascript;base64,${Buffer.from(coreScript).toString("base64")}`);

test("Hostplus central case and ABP timing controls retain their governed regression values", () => {
  assert.equal(Number(core.projectHostplusAt60(650, 1_200, 0.08).toFixed(2)), 289_620.63);
  assert.equal(core.abpMinimumRateAtAgeOn1July(64), 0.04);
  assert.equal(core.abpMinimumRateAtAgeOn1July(65), 0.05);
  assert.equal(Number(core.firstFinancialYearMinimum(840_887.36, 60).toFixed(2)), 17_693.19);
  assert.deepEqual(core.firstPensionFinancialYear(441_674.40, 60, "2033-12-21"), {
    commencement:"2033-12-21", endDate:"2034-06-30", elapsedDays:192, financialYearDays:365, minimum:9290,
  });
  assert.equal(core.firstPensionFinancialYear(100_000, 60, "2028-06-01").minimum, 0);
  assert.equal(core.firstPensionFinancialYear(100_000, 60, "2027-07-01").financialYearDays, 366);
  assert.equal(core.firstPensionFinancialYear(100_000, 65, "2027-07-01").minimum, 5000);
  assert.throws(()=>core.firstPensionFinancialYear(100_000,60,"2027-02-30"), /valid pension commencement/);
});

test("the payment calendar differentiates living costs, fortnightly PSS and the fund minimum", () => {
  const inputs = {
    retirementDate: "2033-12-21", abpStart: "2033-12-21", abpOpening: 441_674.40, abpAge: 60,
    nextJulyBalance: 400_000, nextJulyAge: 65, firstPssPayday: "2034-01-05",
    annualLivingCosts: 160_000, netPensionPerFortnight: 3_670.55,
  };
  const [start, next] = core.retirementPaymentCalendar(inputs);
  assert.equal(start.days, 192);
  assert.equal(start.abpMinimum, 9290);
  assert.equal(Number(start.livingCosts.toFixed(2)), 84_164.38);
  assert.equal(start.pssDates[0], "2034-01-05");
  assert.equal(start.pssDates.at(-1), "2034-06-22");
  assert.equal(start.pssDates.length, 13);
  assert.ok(Math.abs(start.estimatedPssPayments - 47_717.15) < .005);
  assert.equal(next.from, "2034-07-01");
  assert.equal(next.livingCosts, 160_000);
  assert.equal(next.abpMinimum, 20_000);
  assert.equal(next.pssDates[0], "2034-07-06");
  assert.equal(next.pssDates.length, 26);
  const leap = core.retirementPaymentCalendar({ ...inputs, retirementDate: "2027-07-01", abpStart: "2027-07-01", firstPssPayday: null });
  assert.equal(leap[0].days, 366);
  assert.equal(leap[0].abpMinimum, 17_670);
  assert.equal(leap[0].estimatedPssPayments, null);
  assert.equal(core.retirementPaymentCalendar({ ...inputs, abpStart: "2034-06-01", nextJulyBalance: null })[0].abpMinimum, 0);
  const delayed = core.retirementPaymentCalendar({ ...inputs, abpStart: "2034-07-01", nextJulyBalance: null });
  assert.equal(delayed[0].abpBasis, "starts-later");
  assert.equal(delayed[1].abpMinimum, 17_670);
  assert.throws(() => core.retirementPaymentCalendar({ ...inputs, firstPssPayday: "2033-12-01" }), /on or after retirement/);
});

test("plan IDs travel across builds and track material assumption changes", () => {
  const input = {
    workspace: "v23", modelRevision: "test", source: "CSC", sourceDate: "9 September 2026",
    poolCPolicy: "preserve", periodConvention: "Birthday", simulationSeed: 20260814,
    assumptions: { bands: [{ amount: 28_000, age: 60 }, { age: 70, amount: 18_000 }], rate: .05, saved: { budget: 0 } },
  };
  const first = core.planReceipt(input);
  const reordered = core.planReceipt({ ...input, modelRevision: "newer test", assumptions: { rate: .05, saved: { budget: 0 }, bands: [{ age: 60, amount: 28_000 }, { amount: 18_000, age: 70 }] } });
  assert.equal(reordered.planId, first.planId);
  assert.notEqual(reordered.modelRevision, first.modelRevision);
  assert.notEqual(core.planReceipt({ ...input, poolCPolicy: "after-abp" }).planId, first.planId);
  assert.notEqual(core.planReceipt({ ...input, simulationSeed: 20260815 }).planId, first.planId);
  assert.notEqual(core.planReceipt({ ...input, sourceDate: null }).planId, first.planId);
});

test("provider projection bases are explicit, shared and election-gated", () => {
  for (const source of [dashboard, atlas, v23]) {
    assert.match(source, /source-825/);
    assert.match(source, /prudent-630/);
    assert.match(source, /8\.2[^\n]*5[^\n]*2\.5/);
    assert.match(source, /6[^\n]*5[^\n]*3/);
    assert.match(source, /pssProjectionBasis/);
  }
  assert.doesNotMatch(dashboard, /<option value="prudent-630" disabled>/);
  assert.doesNotMatch(atlasHtml, /id="basisPrudent" disabled/);
  assert.doesNotMatch(v23, /id="pss-basis-prudent" disabled/);
  assert.match(dashboard, /const PSS_PRUDENT_ELECTIONS/);
  assert.match(atlas, /const PSS_PRUDENT_ELECTIONS/);
  assert.match(v23, /const PSS_PRUDENT_ELECTIONS/);
  for (const source of [dashboard, atlas, v23]) {
    assert.match(source, /88_571\.01/);
    assert.match(source, /95_951\.93/);
    assert.match(source, /103_332\.85/);
    assert.match(source, /162_380\.20/);
    assert.match(source, /147_713\.96/);
    assert.match(source, /162_485\.36/);
    assert.match(source, /normaliseElectionForBasis/);
  }
  assert.match(v23, /const LS_KEY="v23_4_state"/);
  assert.match(v23, /range\.setAttribute\("aria-label"/);
  assert.match(atlas, /basis:\s*state\.pssProjectionBasis/);
  assert.match(v23, /basis:normaliseProjectionBasis\(scenario\.pssProjectionBasis\)/);
});

test("mobile Frontier makes the selected age distinct from the projection horizon", () => {
  assert.match(dashboard, /Frontier decision point/);
  assert.match(dashboard, /Age \{targetAge\}/);
  assert.match(dashboard, /selected comparison age—not the end of the retirement projection/);
  assert.match(dashboard, /continues to age 95/);
  assert.match(dashboard, /Change target age in Adjust/);
});

test("VR is scenario-aware while keeping sourced and illustrative values separate", () => {
  assert.match(dashboard, /function vrScenarioPath/);
  assert.match(dashboard, /Current choices now drive the VR illustration/);
  assert.match(dashboard, /The age-60 anchor is source-backed; ages 57–59 are transparent illustrations/);
  assert.match(dashboard, /Changing either control recalculates every VR card, chart and table below/);
  assert.match(dashboard, /activeElection: rail\.electionLabel/);
  assert.match(dashboard, /providerCpi: vrBasis\.cpi/);
  assert.match(dashboard, /postRetirementRealReturn: realReturn/);
  assert.match(dashboard, /obtain formal CSC VR estimates and tax components/);
  assert.match(dashboard, /later 9 September snapshot/);
  for (const reference of [modelReferenceHtml, modelReferenceText]) {
    assert.match(reference, /age-60 anchor/i);
    assert.match(reference, /ABM ratio/i);
    assert.match(reference, /potential ABP/i);
    assert.match(reference, /VR cash/i);
  }
});

test("secondary detail uses keyboard-operable progressive disclosure", () => {
  assert.match(dashboard, /function CollapsiblePanel/);
  assert.match(dashboard, /event\.key === "Enter" \|\| event\.key === " "/);
  assert.match(dashboard, /Transfer-balance allocation/);
  assert.match(dashboard, /How the three pools work/);
  assert.match(dashboard, /Open the interactive timing curves/);
  assert.match(dashboard, /Open benefits, costs and evidence required/);
  assert.match(dashboard, /title="Source register"/);
});

test("active return drives Command Centre frontier outputs", () => {
  assert.doesNotMatch(dashboard, /Investments @75 · 5%/);
  assert.doesNotMatch(dashboard, /ledgerEndingAtAge\(rail, spend, 0\.05, 75/);
  assert.match(dashboard, /Investments @\$\{targetAge\} · \$\{pct\(realReturn, 1\)\}/);
  assert.match(dashboard, /FrontierCurve rail=\{rail\}[^>]*realReturn=\{realReturn\}/);
  assert.match(dashboard, /Estate · active \{pct\(realReturn, 1\)\}/);
  assert.match(dashboard, /FrontierCurve[^]*targetAge/);
  assert.match(dashboard, /ledgerEndingAtAge\(rail, candidateSpend, realReturn, targetAge, taxYear\)/);
  assert.doesNotMatch(dashboard, /Interactive spending and age-75 estate frontier/);
});

test("V23 headline prioritises the selected likely return", () => {
  assert.match(v23, /Active capital @\$\{ta\}/);
  assert.match(v23, /\$\{fmtPct\(STATE\.likely\)\} real \[MODELLED\]/);
  assert.match(v23, /Reference only: 4\.0% conservative to 5\.0% base/);
  assert.match(v23, /id="sl_targetage" min="70" max="95"/);
  assert.match(v23, /id="sl_likely" min="2" max="7\.5"/);
  assert.match(v23, /launchSnapshot:true/);
  assert.match(v23, /for\(let age=startAge\+1;age<=endAge;age\+\+\)/);
  assert.match(v23, /"60-40":\{[^}]*grossPension:91_776\.03[^}]*lumpTaxableTaxed:512_745\.98/);
  assert.match(v23, /"100":\{[^}]*grossPension:152_960\.05[^}]*netPension:143_104\.26[^}]*lumpSum:0/);
  assert.match(v23, /RETIREMENT_ENGINE\.railBOpeningPosition/);
  assert.match(v23, /STATE\.wash\.enabled=true/);
  assert.match(v23, /const rail=isRailBProfile\(profile\)\?"B":"A"/);
});

test("V23 lifestyle phases follow the active bands and show the gross-equivalent bridge", () => {
  assert.match(v23, /function lifestylePhaseDefinitions\(sim,p\)/);
  assert.match(v23, /function splitPhaseByCashflow\(phase,sim\)/);
  assert.match(v23, /function cashflowSubPhases\(phases,sim\)/);
  assert.match(v23, /formatBandValue\(band,fmtFull\)/);
  assert.match(v23, /const phases=lifestylePhaseDefinitions\(sim,p\)/);
  assert.match(v23, /const cashflowPhases=cashflowSubPhases\(phases,sim\)/);
  assert.doesNotMatch(v23, /const phases=\[\[60,61,"Phase 1/);
  assert.match(v23, /const allHeaders=\["Cashflow sub-phase","Band input","Avg planned gap","Avg funded gap","Target funded","Avg shortfall","Mandatory used","Gap ÷ portfolio earnings"/);
  assert.doesNotMatch(v23, /"Spend % of mand\. draw"/);
  assert.match(v23, /function safePercent\(numerator,denominator,\{cap=false\}=\{\}\)/);
  assert.match(v23, /“Target funded” shows how much of your planned gap was actually delivered/);
  assert.match(v23, /CSC basis \$\{basis\.shortLabel\}/);
  assert.match(v23, /"Gross salary equiv\. \/yr"/);
  assert.match(v23, /function grossSalaryEquivalent\(netIncome\)/);
  assert.match(v23, /Age \$\{age\} already starts another band/);
  assert.match(v23, /calculations still use the last valid schedule/);
  assert.match(v23, /const operatingAges=operatingRows\.map\(r=>`\$\{r\.age-1\}→\$\{r\.age\}`\)/);
  assert.match(v23, /Gross salary equivalent” uses \$\{salaryYearLabel\(\)\} resident rates and 2% Medicare/);
});

test("V23 mobile task dock has direct-page fallbacks and selected-page feedback", () => {
  assert.match(v23, /const pageHref=page=>\{const url=new URL\(location\.href\);url\.searchParams\.set\("page",page\)/);
  assert.match(v23, /<a href="\$\{pageHref\(page\)\}" data-v23-page="\$\{page\}" aria-controls="page-\$\{page\}"/);
  assert.match(v23, /history\.pushState\(\{v23Page:page\}/);
  assert.match(v23, /addEventListener\("popstate"/);
  assert.match(v23, /Current view: \$\{selected\[2\]\}/);
  assert.match(v23, /\.v23-mobile-dock a\.active/);
});

test("V23 Plan controls use one accessible collapsible summary on desktop and mobile", () => {
  assert.match(v23, /id="plan-controls"/);
  assert.match(v23, /id="plan-controls-toggle" aria-expanded="false" aria-controls="plan-controls-body"/);
  assert.match(v23, /id="plan-controls-body" hidden/);
  assert.match(v23, /<label for="sel_spendmode">Spending rule<\/label>/);
  assert.match(v23, /<option value="flatTotal">Total annual spending<\/option>/);
  assert.match(v23, /<form[^>]+id="v23-flat-spend-form" hidden>/);
  assert.match(v23, /id="lbl-gap-summary"/);
  assert.match(v23, /id="plan-control-context"/);
  assert.match(v23, /id="plan-control-rule-label"/);
  assert.match(v23, /show\("v23-age-band-editor",spendRule==="fixed"\)/);
  assert.match(v23, /show\("v23-spend-percentage",percentSpend\)/);
  assert.match(v23, /function setPlanControlsExpanded\(expanded/);
  assert.match(v23, /function togglePlanControls/);
  assert.match(v23, /togglePlanControls\(\{scroll:true\}\)/);
  assert.match(v23, /exact\.addEventListener\("input",commitExact\)/);
  assert.match(v23, /window\.syncV23PrecisionControls\?\.\(\);/);
  assert.match(v23, /button class="rm"[^>]*aria-label="Remove band from age/);
  assert.doesNotMatch(v23, /body\.v23-mobile-compact \.control-bar\{display:none\}/);
  assert.match(v23, /id="profile-controls-toggle" aria-expanded="false" aria-controls="profile-controls-body"/);
  assert.match(v23, /function setProfileControlsExpanded\(expanded\)/);
  assert.match(v23, /id="sel_poolcpolicy"/);
  assert.match(v23, /Use Pool C after Pools A and B are exhausted/);
  assert.match(v23, /modelledPoolCLabel\(STATE\.poolCPolicy,STATE\.poolCReserve\)/);
});

test("V23 reinvestment page explains zero-surplus cases and points to income equivalents", () => {
  assert.match(v23, /id="ri-empty" hidden/);
  assert.match(v23, /No Pool C recycling or withdrawal occurs in this scenario/);
  assert.match(v23, /Pool C balance = prior balance \+ Pool C return \+ deposits − explicit Pool C withdrawals/);
  assert.match(v23, /data-reinvest-table-mode="key" aria-pressed="true"/);
  assert.match(v23, /data-reinvest-table-mode="all" aria-pressed="false"/);
  assert.match(v23, /function wireReinvestTableMode\(\)/);
  assert.match(v23, /Looking for net income and gross salary equivalent/);
  assert.match(v23, /Open Income &amp; draws/);
});

test("V23 lifestyle detail and charts use accessible progressive disclosure", () => {
  assert.match(v23, /data-income-table-mode="essential" aria-pressed="true"/);
  assert.match(v23, /data-income-table-mode="full" aria-pressed="false"/);
  assert.match(v23, /const essentialColumns=\[0,1,2,3,4,5,6,11,12,17,18,19\]/);
  assert.match(v23, /function wireIncomeTableMode\(\)/);
  assert.match(v23, /aria-roledescription","interactive chart"/);
  assert.match(v23, /Press Enter for an enlarged chart and numeric readout/);
});

test("Command Centre distinguishes the flat comparison lens from V23 age-band planning", () => {
  assert.match(dashboard, /const v23SpendPlanUrl = sharedPageUrl\("deep-model\.html\?page=income", currentScenario, theme, carryGoalsToV23\)/);
  assert.match(dashboard, /function sharedPageUrl\(path: string, scenario: ScenarioState, theme\?: Theme, carryGoals = true\)/);
  assert.match(dashboard, /THEME_STORAGE_KEY = "robinson-retirement-theme"/);
  assert.match(dashboard, /Command Centre tests a flat annual-spending lens/);
  assert.match(dashboard, /held constant in real dollars for every retirement year here/);
  assert.match(dashboard, /Set the gap and drawdown periods by age/);
  assert.match(dashboard, /Flat net annual spend/);
  assert.match(dashboard, /Each card keeps its labelled annual spend and rail fixed, so the trade-offs are comparable/);
  assert.doesNotMatch(dashboard, /sharedModelUrl\(/);
  assert.match(v23, /function initialPageFromQuery\(\)/);
  assert.match(v23, /class="spending-control-link"/);
  assert.match(v23, /id="v23-edit-spending"/);
  assert.match(v23, /id="v23-age-band-editor"/);
  assert.match(v23, /data-band-age=/);
});

test("Command Centre owns the integrated six-view studio and its active scenario", () => {
  assert.match(dashboard, /function VisualExplorerPanel/);
  assert.doesNotMatch(dashboard, /function HorizonExplorer|function HorizonTerrainCanvas/);
  assert.match(dashboard, /Uses your active Command Centre plan/);
  assert.match(dashboard, /scenario=\{currentScenario\} theme=\{theme\}/);
  assert.match(dashboard, /V23 remains your age-band workbench/);
  assert.match(v23, /Shared V23 plan controls/);
  assert.match(v23, /Two workspaces:/);
  assert.match(dashboard, /id="scenario-hub-title"/);
  assert.match(dashboard, /type ScenarioTool = "lab" \| "explore" \| "compare" \| "frontier" \| "surface" \| "risk"/);
  assert.match(dashboard, /label: "Scenario", group: "Decide"/);
  assert.doesNotMatch(dashboard, /label: "Scenario lab", group: "Decide"|label: "Explore the plan", group: "Decide"|label: "Risk studio", group: "Decide"/);
  assert.match(v23, /section=scenario&tool=explore/);
  assert.match(atlasHtml, /One governed ledger\. Six ways to understand it\./);
  assert.match(atlasHtml, /id="visualCanvas"/);
  assert.match(atlasHtml, /id="visualAgeRange"/);
  assert.match(atlasHtml, /id="visualDimensionToggle"/);
  assert.match(atlasHtml, /id="visualFocusToggle"/);
  assert.match(atlasHtml, /Real return used/);
  assert.match(atlas, /function drawHorizon/);
  assert.match(atlas, /function drawRiver/);
  assert.match(atlas, /function drawOrbit/);
  assert.match(atlas, /function drawWaterfall/);
  assert.match(atlas, /function drawSunburst/);
  assert.match(atlas, /function renderVisualTable/);
  assert.match(atlas, /function selectCapitalAge/);
  assert.match(atlas, /These are scenario slices, not probabilities/);
  assert.match(atlas, /state\.visualMode = button\.dataset\.visualMode/);
});

test("comparison plans use the active return, horizon and home assumptions", () => {
  for (const source of [dashboard, atlas, v23]) assert.match(source, /taxYear/);
  assert.match(dashboard, /const MAX_FLAT_SPEND = 300_000/);
  assert.match(dashboard, /76_000, MAX_FLAT_SPEND/);
  assert.match(atlas, /const MAX_FLAT_SPEND = 300_000/);
  assert.match(dashboard, /0\.02, 0\.075/);
  assert.match(atlasHtml, /id="spend"[^>]*min="76000"[^>]*max="300000"/);
  assert.match(atlasHtml, /id="return"[^>]*min="2"[^>]*max="7\.5"/);
  assert.match(atlasHtml, /id="home"[^>]*max="1000000"/);
  assert.match(dashboard, /ledgerEndingAtAge\(scenarioRail, scenario\.spend, realReturn, targetAge, taxYear\)/);
  assert.match(dashboard, /monteCarloFan\(scenarioRail, scenario\.spend, realReturn, taxYear, \.12, 360, simulationSeed, null, investmentFloor\)/);
  assert.match(dashboard, /New repeatable sample/);
  assert.match(dashboard, /Active assumptions: <b>\{pct\(realReturn, 1\)\} real return p\.a\.<\/b> after inflation · target age \{targetAge\}/);
  assert.match(dashboard, /Using a card changes only its spend and rail; it does not reset those assumptions/);
  assert.match(dashboard, /const applyComparisonPlan = \(plan: ComparisonPlan\) => \{\s+setRailKey\(plan\.rail\);\s+setSpend\(plan\.spend\);/);
  assert.doesNotMatch(dashboard, /realReturn: 0\.05, targetAge: 75, homeValue: 500_000/);
});

test("Rail B active-return engine changes the age-75 result", () => {
  const rail = { netPension: 76_302.72, poolA: 774_185.76, poolC: 148_635.12 };
  const drawRate = (age) => {
    const ageAt1July = age - 1;
    return ageAt1July < 65 ? 0.04 : ageAt1July < 75 ? 0.05 : ageAt1July < 80 ? 0.06 : ageAt1July < 85 ? 0.07 : ageAt1July < 90 ? 0.09 : ageAt1July < 95 ? 0.11 : 0.14;
  };
  const endingAt75 = (realReturn) => {
    let poolA = rail.poolA;
    let poolC = rail.poolC;
    for (let age = 61; age <= 75; age += 1) {
      const draw = Math.min(poolA, Math.max(poolA * drawRate(age), 110_000 - rail.netPension));
      const reinvestment = Math.max(0, rail.netPension + draw - 110_000);
      const drag = poolC * 0.0035;
      poolA = Math.max(0, poolA * (1 + realReturn) - draw);
      poolC = Math.max(0, poolC * (1 + realReturn) - drag + reinvestment);
    }
    return poolA + poolC;
  };

  assert.equal(Math.round(endingAt75(0.05)), 1_174_942);
  assert.equal(Math.round(endingAt75(0.065)), 1_537_551);
  assert.ok(endingAt75(0.065) > endingAt75(0.05));
});

test("ledger gross equivalent follows annual net income", () => {
  assert.match(dashboard, /grossEquivalent: grossForNet\(row\.netIncome, taxYear\)/);
  assert.match(atlas, /grossEquivalent: row\.isOpening \? 0 : grossForNet\(row\.netIncome\)/);
  assert.doesNotMatch(dashboard, /grossEquivalent: grossForNet\(spend, taxYear\)/);
  assert.doesNotMatch(atlas, /grossEquivalent: grossForNet\(spend\)/);

  const lowerRate = 0.15;
  const incomeTax = (gross) => {
    let tax = 0;
    if (gross > 18_200) tax += (Math.min(gross, 45_000) - 18_200) * lowerRate;
    if (gross > 45_000) tax += (Math.min(gross, 135_000) - 45_000) * 0.30;
    if (gross > 135_000) tax += (Math.min(gross, 190_000) - 135_000) * 0.37;
    if (gross > 190_000) tax += (gross - 190_000) * 0.45;
    return tax;
  };
  const grossForNet = (target) => {
    let low = target;
    let high = 500_000;
    for (let index = 0; index < 70; index += 1) {
      const midpoint = (low + high) / 2;
      const net = midpoint - incomeTax(midpoint) - midpoint * 0.02;
      if (net < target) low = midpoint;
      else high = midpoint;
    }
    return high;
  };

  assert.equal(Math.round(grossForNet(110_000)), 149_295);
  assert.equal(Math.round(grossForNet(119_562)), 164_970);
  assert.ok(grossForNet(119_562) > grossForNet(110_000));

  const railA = { netPension: 76_041.68, poolA: 840_887.36, poolC: 51_361.96 };
  let poolA = railA.poolA;
  let poolC = railA.poolC;
  const rows = [];
  for (let age = 61; age <= 65; age += 1) {
    const rate = age - 1 < 65 ? 0.04 : 0.05;
    const draw = Math.min(poolA, Math.max(poolA * rate, 110_000 - railA.netPension));
    const netIncome = railA.netPension + draw;
    const reinvestment = Math.max(0, netIncome - 110_000);
    const taxDrag = poolC * 0.0035;
    poolA = Math.max(0, poolA * 1.07 - draw);
    poolC = Math.max(0, poolC * 1.07 - taxDrag + reinvestment);
    rows.push({ age, netIncome, grossEquivalent: grossForNet(netIncome) });
  }

  assert.equal(Math.round(rows.find((row) => row.age === 64).grossEquivalent), 153_856);
  assert.equal(Math.round(rows.find((row) => row.age === 65).grossEquivalent), 155_663);
});

test("opening capital and first retirement-year cashflow are visually distinct", () => {
  assert.match(dashboard, /year: "Opening position"/);
  assert.match(dashboard, /period: "21 Dec 2033"/);
  assert.match(dashboard, /year: `Year \$\{row\.age - 60\}`/);
  assert.match(dashboard, /ageLabel: `\$\{row\.age - 1\}→\$\{row\.age\}`/);
  assert.match(dashboard, /No annual income or spending belongs in this snapshot/);
  assert.match(dashboard, /FIRST PLANNING YEAR/);
  assert.match(dashboard, /ending capital = opening capital \+ net investment growth − planning portfolio draw/);
  assert.match(atlas, /const operatingRows = ledger\.filter\(\(row\) => row\.age > 60\)/);
  assert.match(atlas, /Year \$\{age - 60\} · age \$\{age - 1\}→\$\{age\}/);
  assert.match(atlasHtml, /age-60 retirement-day position is a capital snapshot, not a zero-income year/);
  assert.match(v23, /Year 1 spending funded \(age \$\{p\.retireAge\}→\$\{firstYear\?\.age/);
  assert.match(v23, /const operatingAges=operatingRows\.map/);
  assert.doesNotMatch(v23, /data:sim\.rows\.map\(r=>r\.pension\)/);

  const opening = 892_249.32;
  const openingPoolA = 840_887.36;
  const openingPoolC = 51_361.96;
  const pension = 76_041.68;
  const spend = 110_000;
  const draw = Math.max(openingPoolA * .04, spend - pension);
  const investmentGrowth = opening * .065 - openingPoolC * .0035;
  const ending = opening + investmentGrowth - draw;
  assert.equal(Math.round(draw), 33_958);
  assert.equal(Math.round(investmentGrowth), 57_816);
  assert.equal(Math.round(ending), 916_107);
});

test("death-benefit-tax simulator uses each direct PSS source and never assigns its ratio to Hostplus", () => {
  assert.match(coreSource, /const washTaxableShare = election\.lumpSum > 0\s*\?\s*election\.lumpTaxableTaxed \/ election\.lumpSum\s*:\s*0/);
  assert.match(coreSource, /taxableStart: rail\.lumpTaxableTaxed/);
  assert.match(coreSource, /Math\.min\(annualAmount, dirty\)/);
  assert.match(dashboard, /calculateCanonicalWashOutcome/);
  assert.match(dashboard, /Hostplus components remain unresolved/);
  assert.match(dashboard, /Confirm Hostplus can maintain the required separate interests before acting/);
  assert.doesNotMatch(dashboard, /const taxableStart = rail\.poolA \* rail\.washTaxableShare/);
});

test("V23 executes the shared Rail B scenario on the same launch timing", () => {
  const core = [...v23.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/gi)]
    .map((match) => match[1])
    .find((script) => script.includes("const PROFILES ="));
  assert.ok(core);

  const noop = () => {};
  function Chart() {}
  Chart.register = noop;
  Chart.defaults = { plugins: { legend: { labels: {} } } };
  const context = vm.createContext({
    console,
    document: { addEventListener: noop, getElementById: () => null, querySelector: () => null, querySelectorAll: () => [] },
    window: {},
    localStorage: { getItem: () => null, setItem: noop, removeItem: noop },
    getComputedStyle: () => ({ getPropertyValue: () => "" }),
    Chart,
    Blob: function Blob() {},
    URL: { createObjectURL: () => "", revokeObjectURL: noop },
    confirm: () => false,
    alert: noop,
    setTimeout: noop,
    clearTimeout: noop,
    Math,
    Intl,
    Float64Array,
    Array,
    Object,
    Number,
    String,
    JSON,
    Date,
  });
  vm.runInContext(browserEngine, context);
  context.window.RetirementEngine = context.RetirementEngine;
  vm.runInContext(core, context);
  const result = JSON.parse(vm.runInContext(`(() => {
    Object.assign(PROFILES.custom, {
      name: "Rail B shared", retireAge: 60, grossPension: 82550.89, netPension: 76302.72,
      lumpSum: 605373.22, hostplus: 317447.66, tbc: 2100000, floor: 500, target: 1000,
      strong: 1500, defaultGap: 33697.28, defaultGapBands: [{ age: 60, amount: 33697.28, unit: "dollar" }],
      poolA_day1: 774185.76, poolB_day1: 0, poolC_day1: 148635.12, tsbBuffer: 5000,
      washAge: null, washCapThrough: null, locked: false
    });
    STATE.profile = "custom";
    STATE.spendMode = "fixed";
    STATE.gapBands = [{ age: 60, amount: 33697.28, unit: "dollar" }];
    const calculate = (annualReturn) => {
      const rows = runModel({ profile: PROFILES.custom, abpReturn: annualReturn, accumReturn: annualReturn * .85 }).rows;
      return { launch: rows[0], target: rows.find((row) => row.age === 75) };
    };
    const five = calculate(.05);
    const sixFive = calculate(.065);
    STATE.profile = "michael";
    STATE.spendMode = "fixed";
    STATE.gapBands = [
      { age: 60, amount: 15_600, unit: "dollar" },
      { age: 63, amount: 31_200, unit: "dollar" },
      { age: 67, amount: 53_697, unit: "dollar" }
    ];
    const cashflowSim = runModel({ profile: PROFILES.michael, abpReturn: .065, accumReturn: .065 * .85 });
    const parentPhases = lifestylePhaseDefinitions(cashflowSim, PROFILES.michael);
    const subPhases = cashflowSubPhases(parentPhases, cashflowSim);
    const subPhaseRows = subPhases.map(phase => {
      const rows = cashflowSim.rows.filter(row => !row.launchSnapshot && row.age >= phase.start && row.age <= phase.end);
      return { routine: phase.routine, hasExtra: rows.some(row => row.extraDraw > .005), hasSurplus: rows.some(row => row.surplus > .005) };
    });
    const duplicateSchedule = normaliseGapBands([{ age: 60, amount: 10_000 }, { age: 67, amount: 20_000 }, { age: 67, amount: 22_000 }]);
    return JSON.stringify({ five, sixFive, parentPhases: parentPhases.length, subPhaseRows, duplicateSchedule });
  })()`, context));

  assert.equal(result.five.launch.launchSnapshot, true);
  assert.equal(result.five.launch.total, 922_820.88);
  assert.equal(Math.round(result.five.target.total), 1_174_942);
  assert.equal(Math.round(result.sixFive.target.total), 1_537_551);
  assert.ok(result.subPhaseRows.length > result.parentPhases);
  assert.ok(result.subPhaseRows.some((row) => row.routine === "extra"));
  assert.ok(result.subPhaseRows.some((row) => row.routine === "surplus"));
  assert.ok(result.subPhaseRows.every((row) => !(row.hasExtra && row.hasSurplus)));
  assert.equal(result.duplicateSchedule.bands.length, 2);
  assert.equal(result.duplicateSchedule.bands.find((band) => band.age === 67).amount, 22_000);
  assert.deepEqual(result.duplicateSchedule.duplicateAges, [67]);
});

test("Risk Studio makes selected-year capital routing and observed review records explicit", () => {
  assert.match(dashboard, /Selected-year three-pool money flow/);
  assert.match(dashboard, /Opening Pool A/);
  assert.match(dashboard, /Opening Pool C/);
  assert.match(dashboard, /Ending investment capital/);
  assert.match(dashboard, /Actual versus plan checkpoint/);
  assert.match(dashboard, /robinson-retirement-actual-checkpoints/);
  assert.match(dashboard, /annualForecast\?\.\[actualReviewAge\]/);
  assert.match(dashboard, /Saved forecast.*Recorded actual.*Current forecast/s);
});
