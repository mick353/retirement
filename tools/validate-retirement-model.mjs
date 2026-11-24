import assert from "node:assert/strict";
import { validateLedgerMigration } from "./validate-ledger-migration.mjs";
import { readFile } from "node:fs/promises";
import vm from "node:vm";
import ts from "typescript";

const normalise = (source) => source.replace(/\r\n/g, "\n");
const dashboardSource = normalise(await readFile(new URL("../app/retirement-dashboard.tsx", import.meta.url), "utf8"));
const coreSource = normalise(await readFile(new URL("../app/retirement-core.ts", import.meta.url), "utf8"));
const browserEngineSource = normalise(await readFile(new URL("../public/retirement-engine.js", import.meta.url), "utf8"));
const atlasHtml = normalise(await readFile(new URL("../public/atlas.html", import.meta.url), "utf8"));
const atlasSource = normalise(await readFile(new URL("../public/atlas.js", import.meta.url), "utf8"));
const v23Source = normalise(await readFile(new URL("../public/deep-model.html", import.meta.url), "utf8"));
assert.match(atlasHtml, /id="tradeAssumptions" aria-live="polite"/, "Trade-off context is announced accessibly");
assert.match(atlasSource, /\$\("tradeAssumptions"\)\.textContent = .*pct\(state\.realReturn\)/, "Trade-off context uses the active real return");

function compile(source, options = {}) {
  return ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX, ...options },
  }).outputText;
}

function runCommonJs(source, require) {
  const commonJsModule = { exports: {} };
  vm.runInNewContext(source, { module: commonJsModule, exports: commonJsModule.exports, require, console, Math, Number, String, Boolean, Array, Object, Set, Map, Date, JSON, Intl, URLSearchParams });
  return commonJsModule.exports;
}

const core = runCommonJs(compile(coreSource), () => { throw new Error("retirement-core has no external runtime dependencies"); });
const browserEngineContext = { Math, Number, String, Boolean, Array, Object, Set, Map, Date, JSON };
browserEngineContext.globalThis = browserEngineContext;
vm.createContext(browserEngineContext);
vm.runInContext(browserEngineSource, browserEngineContext);
const browserEngine = browserEngineContext.RetirementEngine;
assert.ok(browserEngine, "Browser retirement engine must register on globalThis");
assert.equal(browserEngine.RETIREMENT_ENGINE_VERSION, core.RETIREMENT_ENGINE_VERSION, "Browser retirement engine version");
assert.match(atlasHtml, /<script src="\.\/retirement-engine\.js\?v=2"><\/script>/, "Atlas loads the canonical browser engine beside its legacy calculations");
assert.match(v23Source, /<script src="\.\/retirement-engine\.js\?v=2"><\/script>/, "V23 loads the canonical browser engine beside its legacy calculations");
const reactStub = { useEffect: () => undefined, useMemo: (factory) => factory(), useRef: () => ({ current: null }), useState: (value) => [value, () => undefined] };
const dashboard = runCommonJs(
  compile(`${dashboardSource}\nmodule.exports = { RAILS, PSS_ELECTIONS, PSS_PRUDENT_ELECTIONS, PSS_ELECTION_ORDER, PSS_PROJECTION_BASES, VR_AGES, VR_AGE_FACTORS, normaliseProjectionBasis, normaliseElectionForBasis, railBForElection, definedBenefitAt60, vrScenarioPath, washOutcome, operationalLedger, monteCarloFan };`),
  (name) => {
    if (name === "react") return reactStub;
    if (name === "react/jsx-runtime") return { Fragment: Symbol("Fragment"), jsx: () => null, jsxs: () => null };
    if (name === "./retirement-core") return core;
    if (name === "./retirement-ai") return { default: () => null };
    throw new Error(`Unexpected dashboard dependency: ${name}`);
  },
);

const atlasPrefix = atlasSource.match(/\n  (const TBC = [\s\S]*?function washOutcome\([\s\S]*?\n  \})\n\n  const \$/)?.[1];
assert.ok(atlasPrefix, "Could not locate the Atlas model registry");
const atlasContext = { Math, Number, String, Array, Object, RetirementEngine: browserEngine };
atlasContext.globalThis = atlasContext;
vm.createContext(atlasContext);
vm.runInContext(`${atlasPrefix}\nthis.MODEL={RAILS,PSS_ELECTIONS,PSS_PRUDENT_ELECTIONS,PSS_PROJECTION_BASES,normaliseProjectionBasis,normaliseElectionForBasis,railBForElection,washOutcome};`, atlasContext);
const atlas = atlasContext.MODEL;

function makeChartStub() {}
makeChartStub.register = () => undefined;
makeChartStub.defaults = { plugins: { legend: { labels: {} }, tooltip: {} }, color: "", borderColor: "", backgroundColor: "" };
const v23Scripts = [...v23Source.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/gi)].map((match) => match[1]).filter((source) => source.trim());
const v23Context = {
  console, Math, Date, JSON, Number, String, Boolean, Array, Object, Map, Set, Intl, URLSearchParams,
  setTimeout: () => 0, clearTimeout: () => undefined, alert: () => undefined, requestAnimationFrame: () => undefined,
  localStorage: { getItem: () => null, setItem: () => undefined, removeItem: () => undefined },
  document: { addEventListener: () => undefined, getElementById: () => null, querySelector: () => null, querySelectorAll: () => [], documentElement: { setAttribute: () => undefined } },
  window: { location: { search: "" }, RetirementEngine: browserEngine }, Chart: makeChartStub,
};
vm.createContext(v23Context);
vm.runInContext(v23Scripts[0], v23Context);
const v23 = (expression) => vm.runInContext(expression, v23Context);

const expectedElectionsByBasis = {
  "source-825": {
    "60-40": { grossPension: 91_776.03, netPension: 86_240.18, lumpSum: 673_024.21, lumpTaxFree: 160_278.23, lumpTaxableTaxed: 512_745.98, poolA: 626_583.52, poolC: 363_888.35, dbSpecialValue: 1_468_416.48, fas: 168_256.05, maxCycles: 6 },
    "65-35": { grossPension: 99_424.03, netPension: 93_888.34, lumpSum: 588_896.19, lumpTaxFree: 140_243.46, lumpTaxableTaxed: 448_652.73, poolA: 504_215.52, poolC: 402_128.33, dbSpecialValue: 1_590_784.48, fas: 168_256.05, maxCycles: 5 },
    "70-30": { grossPension: 107_072.03, netPension: 101_536.24, lumpSum: 504_768.16, lumpTaxFree: 120_208.67, lumpTaxableTaxed: 384_559.49, poolA: 381_847.52, poolC: 440_368.30, dbSpecialValue: 1_713_152.48, fas: 168_256.05, maxCycles: 4 },
    "100": { grossPension: 152_960.05, netPension: 143_104.26, lumpSum: 0, lumpTaxFree: 0, lumpTaxableTaxed: 0, poolA: 0, poolC: 317_447.66, dbSpecialValue: 2_447_360.80, fas: 168_256.05, maxCycles: 0 },
  },
  "prudent-630": {
    "60-40": { grossPension: 88_571.01, netPension: 80_672.54, lumpSum: 649_520.78, lumpTaxFree: 177_975.75, lumpTaxableTaxed: 471_545.03, poolA: 677_863.84, poolC: 289_104.60, dbSpecialValue: 1_417_136.16, fas: 162_380.20, maxCycles: 5 },
    "65-35": { grossPension: 95_951.93, netPension: 88_053.42, lumpSum: 568_330.69, lumpTaxFree: 155_728.77, lumpTaxableTaxed: 412_601.91, poolA: 559_769.12, poolC: 326_009.23, dbSpecialValue: 1_535_230.88, fas: 162_380.20, maxCycles: 5 },
    "70-30": { grossPension: 103_332.85, netPension: 95_434.30, lumpSum: 487_140.59, lumpTaxFree: 133_481.80, lumpTaxableTaxed: 353_658.78, poolA: 441_674.40, poolC: 362_913.85, dbSpecialValue: 1_653_325.60, fas: 162_380.20, maxCycles: 4 },
    "100": { grossPension: 147_713.96, netPension: 135_575.70, lumpSum: 0, lumpTaxFree: 0, lumpTaxableTaxed: 0, poolA: 0, poolC: 317_447.66, dbSpecialValue: 2_363_423.36, fas: 162_485.36, maxCycles: 0 },
  },
};
assert.deepEqual(Array.from(dashboard.PSS_ELECTION_ORDER), ["60-40", "65-35", "70-30", "100"], "Command Centre election order");
assert.deepEqual(Array.from(core.PSS_ELECTION_ORDER), ["60-40", "65-35", "70-30", "100"], "Canonical engine election order");
const close = (actual, expected, message) => assert.ok(Math.abs(Number(actual) - expected) < 0.011, `${message}: expected ${expected}, got ${actual}`);

const expectedBases = {
  "source-825": { fundEarnings: .082, salaryGrowth: .05, cpi: .025, realFundEarnings: 1.082 / 1.025 - 1, realSalaryGrowth: 1.05 / 1.025 - 1, status: "source-backed", elections: 4 },
  "prudent-630": { fundEarnings: .06, salaryGrowth: .05, cpi: .03, realFundEarnings: 1.06 / 1.03 - 1, realSalaryGrowth: 1.05 / 1.03 - 1, status: "source-backed", elections: 4 },
};

for (const [key, expected] of Object.entries(expectedBases)) {
  const surfaces = [
    ["Canonical engine", core.PSS_PROJECTION_BASES[key]],
    ["Browser engine", browserEngine.PSS_PROJECTION_BASES[key]],
    ["Command Centre", dashboard.PSS_PROJECTION_BASES[key]],
    ["Atlas", atlas.PSS_PROJECTION_BASES[key]],
    ["V23", v23(`PSS_PROJECTION_BASES[${JSON.stringify(key)}]`)],
  ];
  for (const [surface, basis] of surfaces) {
    close(basis.fundEarnings, expected.fundEarnings, `${surface} ${key} fund earnings`);
    close(basis.salaryGrowth, expected.salaryGrowth, `${surface} ${key} salary growth`);
    close(basis.cpi, expected.cpi, `${surface} ${key} CPI`);
    close(basis.realFundEarnings, expected.realFundEarnings, `${surface} ${key} real fund earnings`);
    close(basis.realSalaryGrowth, expected.realSalaryGrowth, `${surface} ${key} real salary growth`);
    assert.equal(basis.sourceStatus, expected.status, `${surface} ${key} source status`);
    assert.equal(Object.keys(basis.elections).length, expected.elections, `${surface} ${key} source-backed election count`);
  }
}
assert.equal(dashboard.normaliseProjectionBasis("prudent-630"), "prudent-630", "Command Centre accepts sourced prudent basis");
assert.equal(atlas.normaliseProjectionBasis("prudent-630"), "prudent-630", "Atlas accepts sourced prudent basis");
assert.equal(v23('normaliseProjectionBasis("prudent-630")'), "prudent-630", "V23 accepts sourced prudent basis");
assert.equal(dashboard.normaliseElectionForBasis("prudent-630", "100"), "100", "Command Centre accepts sourced prudent 100% election");
assert.equal(atlas.normaliseElectionForBasis("prudent-630", "100"), "100", "Atlas accepts sourced prudent 100% election");
assert.equal(v23('normaliseElectionForBasis("prudent-630","100")'), "100", "V23 accepts sourced prudent 100% election");

for (const [basisKey, expectedElections] of Object.entries(expectedElectionsByBasis)) {
 for (const [key, expected] of Object.entries(expectedElections)) {
  const coreElection = core.PSS_PROJECTION_BASES[basisKey].elections[key];
  const browserElection = browserEngine.PSS_PROJECTION_BASES[basisKey].elections[key];
  const commandElection = dashboard.PSS_PROJECTION_BASES[basisKey].elections[key];
  const atlasElection = atlas.PSS_PROJECTION_BASES[basisKey].elections[key];
  const coreRail = core.railBOpeningPosition(key, basisKey);
  const browserRail = browserEngine.railBOpeningPosition(key, basisKey);
  const commandRail = dashboard.railBForElection(key, basisKey);
  const atlasRail = atlas.railBForElection(key, basisKey);
  const v23Election = v23(`PSS_PROJECTION_BASES[${JSON.stringify(basisKey)}].elections[${JSON.stringify(key)}]`);
  const v23Rail = v23(`railBProfileForElection(${JSON.stringify(key)},${JSON.stringify(basisKey)})`);
  for (const field of ["grossPension", "netPension", "lumpSum", "lumpTaxFree", "lumpTaxableTaxed"]) {
    close(coreElection[field], expected[field], `Canonical engine ${basisKey} ${key} ${field}`);
    close(browserElection[field], expected[field], `Browser engine ${basisKey} ${key} ${field}`);
    close(commandElection[field], expected[field], `Command Centre ${basisKey} ${key} ${field}`);
    close(atlasElection[field], expected[field], `Atlas ${basisKey} ${key} ${field}`);
    close(v23Election[field], expected[field], `V23 ${basisKey} ${key} ${field}`);
  }
  close(coreElection.fas, expected.fas, `Canonical engine ${basisKey} ${key} FAS`);
  close(browserElection.fas, expected.fas, `Browser engine ${basisKey} ${key} FAS`);
  close(commandElection.fas, expected.fas, `Command Centre ${basisKey} ${key} FAS`);
  close(atlasElection.fas, expected.fas, `Atlas ${basisKey} ${key} FAS`);
  close(v23Rail.fas, expected.fas, `V23 ${basisKey} ${key} FAS`);
  assert.ok(Math.abs(commandElection.lumpTaxFree + commandElection.lumpTaxableTaxed + commandElection.lumpTaxableUntaxed - commandElection.lumpSum) <= .011, `Command Centre ${basisKey} ${key} source components reconcile within one cent`);
  for (const [field, expectedField] of [["poolA", "poolA"], ["poolC", "poolC"], ["dbSpecialValue", "dbSpecialValue"]]) {
    close(coreRail[field], expected[expectedField], `Canonical engine ${basisKey} ${key} ${field}`);
    close(browserRail[field], expected[expectedField], `Browser engine ${basisKey} ${key} ${field}`);
    close(commandRail[field], expected[expectedField], `Command Centre ${basisKey} ${key} ${field}`);
    close(atlasRail[field], expected[expectedField], `Atlas ${basisKey} ${key} ${field}`);
  }
  close(v23Rail.poolA_day1, expected.poolA, `V23 ${key} poolA`);
  close(v23Rail.poolC_day1, expected.poolC, `V23 ${key} poolC`);
  close(v23Rail.dbSpecialValue, expected.dbSpecialValue, `V23 ${key} special value`);
  assert.equal(core.calculateWashOutcome(coreRail, 99).maxCycles, expected.maxCycles, `Canonical engine ${basisKey} ${key} wash limit`);
  assert.equal(browserEngine.calculateWashOutcome(browserRail, 99).maxCycles, expected.maxCycles, `Browser engine ${basisKey} ${key} wash limit`);
  assert.equal(dashboard.washOutcome(commandRail, 99).maxCycles, expected.maxCycles, `Command Centre ${basisKey} ${key} wash limit`);
  assert.equal(atlas.washOutcome(atlasRail, 99).maxCycles, expected.maxCycles, `Atlas ${basisKey} ${key} wash limit`);
  assert.equal(v23Rail.washMax, expected.maxCycles, `V23 ${basisKey} ${key} wash limit`);
 }
}

const expectedRailA = { lumpTaxFree: 141_581.47, lumpTaxableTaxed: 433_220.20, lumpTaxableUntaxed: 0 };
for (const [field, value] of Object.entries(expectedRailA)) {
  close(core.RAIL_A_SOURCE[field], value, `Canonical engine Rail A ${field}`);
  close(dashboard.RAILS.A[field], value, `Command Centre Rail A ${field}`);
  close(atlas.RAILS.A[field], value, `Atlas Rail A ${field}`);
}
close(v23("PROFILES.michael.lumpTaxFree"), expectedRailA.lumpTaxFree, "V23 Rail A tax-free component");
close(v23("PROFILES.michael.lumpTaxableTaxed"), expectedRailA.lumpTaxableTaxed, "V23 Rail A taxable-taxed component");

for (const [basisKey, expectedElections] of Object.entries(expectedElectionsByBasis)) {
 for (const key of Object.keys(expectedElections)) {
  const rail = dashboard.railBForElection(key, basisKey);
  for (const spend of [90_000, 100_000, 110_000, 130_000]) {
    for (const taxYear of ["2026-27", "2027-28"]) {
      const deterministic = Array.from(dashboard.operationalLedger(rail, spend, 0.05, taxYear), (row) => row.ending);
      const fan = dashboard.monteCarloFan(rail, spend, 0.05, taxYear, 0, 9, 20260814);
      assert.deepEqual(Array.from(fan.p50), deterministic, `Zero-volatility median (${basisKey}, ${key}, ${spend}, ${taxYear})`);
      fan.paths.forEach((yearValues, index) => assert.ok(Array.from(yearValues).every((value) => value === deterministic[index]), `Zero-volatility paths (${basisKey}, ${key}, ${spend}, ${taxYear}, age ${60 + index})`));
    }
  }
 }
}

const hundred = dashboard.railBForElection("100");
for (const spend of [90_000, 100_000, 110_000, 130_000]) {
  const row = dashboard.operationalLedger(hundred, spend, 0.05, "2026-27")[1];
  close(row.draw, 0, `Command Centre 100% ${spend} portfolio draw`);
  close(row.fundedSpend, spend, `Command Centre 100% ${spend} funded spend`);
  close(row.reinvestment, hundred.netPension - spend, `Command Centre 100% ${spend} PSS surplus`);
  const v23Row = v23(`(()=>{const p=railBProfileForElection("100");STATE.totalSpendTarget=${spend};STATE.gapBands=[{age:60,amount:0,unit:"dollar"}];return runModel({profile:p,abpReturn:.05,accumReturn:.0425}).rows[1]})()`);
  close(v23Row.realExit + v23Row.extraDraw, 0, `V23 100% ${spend} portfolio draw`);
  close(v23Row.fundedTotalSpend, spend, `V23 100% ${spend} funded spend`);
  close(v23Row.pensionSurplus, hundred.netPension - spend, `V23 100% ${spend} PSS surplus`);
  close(v23Row.pensionToPoolC, hundred.netPension - spend, `V23 100% ${spend} Pool C routing`);
}

const preservedElectionPlan = JSON.parse(v23(`JSON.stringify((()=>{
  STATE.totalSpendTarget=null;
  STATE.gapBands=[{age:60,amount:15600,unit:"dollar"},{age:63,amount:31200,unit:"dollar"},{age:75,amount:53697,unit:"dollar"}];
  STATE.spendMode="fixed";
  STATE.spendReturnPct=.5;
  selectPssElection("70-30",{spendTarget:110000,preserveSpendingPlan:true});
  return {totalSpendTarget:STATE.totalSpendTarget,gapBands:STATE.gapBands,spendMode:STATE.spendMode};
})())`));
assert.equal(preservedElectionPlan.totalSpendTarget, null, "Changing a PSS election preserves the native V23 spending mode");
assert.deepEqual(preservedElectionPlan.gapBands, [
  { age: 60, amount: 15600, unit: "dollar" },
  { age: 63, amount: 31200, unit: "dollar" },
  { age: 75, amount: 53697, unit: "dollar" },
], "Changing a PSS election preserves every manual age band");

const explicitFlatPlan = JSON.parse(v23(`JSON.stringify((()=>{
  STATE.totalSpendTarget=null;
  STATE.gapBands=[{age:60,amount:15600,unit:"dollar"},{age:63,amount:31200,unit:"dollar"}];
  selectPssElection("60-40",{spendTarget:110000});
  return {totalSpendTarget:STATE.totalSpendTarget,gapBands:STATE.gapBands};
})())`));
assert.equal(explicitFlatPlan.totalSpendTarget, 110000, "An explicit flat-spend import remains available");
assert.equal(explicitFlatPlan.gapBands.length, 1, "An explicit flat-spend import creates one derived gap band");

const customProfileStorage = new Map();
const customFieldHandlers = new Map();
const customHostplusField = { value: "", addEventListener: (event, handler) => customFieldHandlers.set(event, handler) };
const customProfileSummary = { innerHTML: "" };
const customProfileBadgeClasses = new Set();
const customProfileBadge = {
  textContent: "",
  classList: { toggle: (name, active) => active ? customProfileBadgeClasses.add(name) : customProfileBadgeClasses.delete(name) },
};
const customResetHandlers = new Map();
const customResetButton = { disabled: true, addEventListener: (event, handler) => customResetHandlers.set(event, handler) };
v23Context.localStorage = {
  getItem: (key) => customProfileStorage.get(key) ?? null,
  setItem: (key, value) => customProfileStorage.set(key, value),
};
v23Context.document.getElementById = (id) => ({
  cf_hostplus: customHostplusField,
  "profile-summary": customProfileSummary,
  "profile-input-status": customProfileBadge,
  "reset-custom-profile": customResetButton,
})[id] ?? null;
v23(`currentPage=""; selectPssElection("70-30",{spendTarget:110000}); wireProfile(); updateLabels();`);
assert.equal(customProfileBadge.textContent, "Source figures active", "The sourced profile has a clear default status");
assert.equal(customResetButton.disabled, true, "Reset is disabled with no overrides");
customHostplusField.value = "800000";
customFieldHandlers.get("change")();
const customOpening = v23("runModel({profile:getProfile(),abpReturn:.05,accumReturn:.0425}).rows[0]");
close(customOpening.abp, 381_847.52, "V23 custom Hostplus respects the capped Pool A");
close(customOpening.acc, 0, "V23 custom Hostplus retains zero Pool B");
close(customOpening.poolC, 922_920.64, "V23 custom Hostplus feeds uncapped capital into Pool C");
close(customOpening.total, 1_304_768.16, "V23 model opening includes the custom Hostplus amount");
assert.match(customProfileSummary.innerHTML, /922,920\.64/, "The profile summary shows the same opening pools");
assert.equal(customProfileBadge.textContent, "Custom figures active", "The profile summary indicates when overrides are in use");
assert.equal(customProfileBadgeClasses.has("is-custom"), true, "The custom figure status is highlighted");
assert.equal(customResetButton.disabled, false, "Reset is enabled for custom figures");
assert.equal(v23("getProfile().pssElection"), "70-30", "Hostplus does not clear the PSS source");
close(v23("getProfile().lumpTaxableTaxed"), expectedElectionsByBasis["source-825"]["70-30"].lumpTaxableTaxed,
  "Hostplus does not replace the sourced PSS tax components");
assert.equal(v23("STATE.totalSpendTarget"), 110000, "Hostplus preserves the active spending rule");
close(v23("scenarioStateResult(captureScenarioState()).sim.rows[0].total"), 1_304_768.16, "Saved scenarios model the edited opening balance");
v23('const savedCustomScenario = captureScenarioState(); selectPssElection("60-40"); loadState();');
close(v23("getProfile().hostplus"), 800_000, "Custom Hostplus survives a reload");
customHostplusField.value = "";
customFieldHandlers.get("change")();
close(v23("getProfile().hostplus"), 800_000, "An empty edit cannot silently turn Hostplus into zero");
customHostplusField.value = "0";
customFieldHandlers.get("change")();
close(v23("getProfile().hostplus"), 0, "A deliberate zero is accepted");
v23("applyScenarioState(savedCustomScenario)");
close(v23("getProfile().hostplus"), 800_000, "Opening a saved scenario restores its Hostplus assumption");
v23('selectPssElection("60-40",{preserveCustomProfile:true})');
close(v23("getProfile().hostplus"), 800_000, "Trying a different election preserves the custom Hostplus balance");
close(v23('profileWithCustomInputs(getProfile(),{lumpSum:500000}).washMax'), 0, "A custom PSS lump cannot reuse the source wash component split");
v23(`STATE.pssProjectionBasis="prudent-630"; selectPssElection("65-35",{spendTarget:104000,preserveCustomProfile:true});
      STATE.likely=.06; STATE.targetAge=75; updateLabels();`);
customResetHandlers.get("click")();
const resetProfile = v23("getProfile()");
const resetSource = v23('railBProfileForElection("65-35","prudent-630")');
close(resetProfile.hostplus, resetSource.hostplus, "Reset restores Hostplus from the selected source");
close(resetProfile.poolA_day1, resetSource.poolA_day1, "Reset restores the sourced Pool A opening");
close(resetProfile.poolC_day1, resetSource.poolC_day1, "Reset restores the sourced Pool C opening");
assert.equal(resetProfile.pssElection, "65-35", "Reset retains the selected election");
assert.equal(resetProfile.pssProjectionBasis, "prudent-630", "Reset retains the selected source basis");
assert.equal(v23("STATE.totalSpendTarget"), 104000, "Reset retains the spending target");
assert.equal(v23("STATE.likely"), .06, "Reset retains the return");
assert.equal(v23("STATE.targetAge"), 75, "Reset retains the target age");
assert.equal(customProfileBadge.textContent, "Source figures active", "Reset removes the custom status");
assert.equal(customProfileBadgeClasses.has("is-custom"), false, "Reset removes the custom highlight");
assert.equal(customResetButton.disabled, true, "Reset is disabled when source figures are active again");
v23("loadState()");
assert.equal(v23("getProfile().customInputs"), undefined, "Reset survives a reload");

const sharedHandoff = "?shared=1&rail=B&pss=70-30&basis=source-825&spend=122000&return=0.06&age=75&reserveMonths=0";
const importHandoff = (query = sharedHandoff) => v23(`importSharedV23Scenario(${JSON.stringify(query)})`);
const sharedBanner = { hidden: true, classList: { toggle: () => undefined } };
const sharedTitle = { textContent: "" };
const sharedActive = { textContent: "" };
const sharedOriginal = { textContent: "" };
const sharedRestore = { hidden: true };
const originalV23Lookup = v23Context.document.getElementById;
v23Context.document.getElementById = (id) => ({
  "v23-shared-banner": sharedBanner,
  "v23-shared-title": sharedTitle,
  "v23-shared-active": sharedActive,
  "v23-shared-original": sharedOriginal,
  "v23-restore-shared": sharedRestore,
})[id] ?? originalV23Lookup(id);
importHandoff();
v23("updateLabels(); saveState();");
assert.equal(v23("STATE.liquidityMonths"), 0, "A shared zero-month reserve remains zero");
assert.equal(sharedTitle.textContent, "Imported Command Centre plan active in V23");
assert.match(sharedActive.textContent, /70 \/ 30.*\$122,000 flat total spending/);
const capitalAtTarget = () => v23("runModel({}).rows[tIdx()].total");
const importedCapital = capitalAtTarget();
v23('selectPssElection("100",{preserveSpendingPlan:true,preserveCustomProfile:true}); updateLabels(); saveState();');
assert.notEqual(capitalAtTarget(), importedCapital, "Changing the election recalculates the Capital Trajectory ledger");
assert.equal(v23("STATE.totalSpendTarget"), 122000, "An election change retains the active total spending budget");
assert.equal(v23("STATE.gapBands[0].amount"), 0, "The displayed portfolio gap follows the new pension");
assert.match(sharedActive.textContent, /100% pension.*\$122,000/);
assert.match(sharedOriginal.textContent, /70 \/ 30/);
assert.equal(sharedTitle.textContent, "V23 profile and plan controls take precedence");
assert.equal(sharedRestore.hidden, false);
v23("loadState()");
importHandoff(sharedHandoff.replace("0.06","0.05999999999999999"));
assert.equal(v23("getProfile().pssElection"), "100", "Reloading an equivalent hand-off URL retains the V23 election");
v23('STATE.gapBands=[{age:60,amount:18000,unit:"dollar"}]; STATE.oneOff=10000; onBandChange();');
assert.match(sharedActive.textContent, /V23 age-band spending/);
v23("loadState()");
importHandoff();
assert.equal(v23("STATE.totalSpendTarget"), null, "Reloading the hand-off retains the locally edited age bands");
v23("restoreSharedV23Plan()");
close(capitalAtTarget(), importedCapital, "Restoring the import restores the original trajectory");
assert.equal(sharedTitle.textContent, "Imported Command Centre plan active in V23");
assert.equal(sharedRestore.hidden, true);
v23('STATE.totalSpendTarget=null; STATE.gapBands=[{age:60,amount:12345,unit:"dollar"}];');
importHandoff(sharedHandoff.replace("spend=122000","spend=130000"));
assert.equal(v23("STATE.gapBands[0].amount"), 12345, "A different hand-off keeps saved V23 age bands until an explicit restore");
assert.equal(v23("STATE.sharedImport.scenario.spend"), 130000, "A different hand-off updates the restore point");

const flatSpendField = { value: "", valueAsNumber: 130000 };
let submitFlatSpend;
const flatSpendForm = { hidden: true, addEventListener: (name, handler) => { if (name === "submit") submitFlatSpend = handler; } };
const ageBandEditor = { hidden: false };
const spendingRuleSelect = { value: "" };
const sharedV23Lookup = v23Context.document.getElementById;
v23Context.document.getElementById = (id) => ({
  "v23-flat-spend-form": flatSpendForm,
  "v23-flat-spend": flatSpendField,
  "v23-age-band-editor": ageBandEditor,
  sel_spendmode: spendingRuleSelect,
})[id] ?? sharedV23Lookup(id);
const pensionHandoff = "?shared=1&rail=B&pss=100&basis=prudent-630&spend=122000&return=0.05&age=75";
importHandoff(pensionHandoff);
v23("restoreSharedV23Plan(); wireBandEditor();");
assert.equal(spendingRuleSelect.value, "flatTotal", "The imported plan displays the total spending rule");
assert.equal(flatSpendField.value, "122000", "The imported amount is directly editable");
assert.equal(ageBandEditor.hidden, true, "Age-band controls are hidden while total spending is active");
const initialHealthCapital = v23('runHealth("none")[1].poolC');
const initialShockCapital = v23("runCPI()[1].poolC");
submitFlatSpend({ preventDefault: () => undefined });
close(v23("STATE.totalSpendTarget"), 130000, "The V23 form replaces the imported annual budget");
close(v23("runModel({}).rows[1].fundedTotalSpend"), 130000, "The ledger uses the edited budget");
close(v23("runModel({}).rows[1].pensionToPoolC"), 5575.70, "The remaining pension is invested");
close(v23('runHealth("none")[1].poolC'), initialHealthCapital - 8000, "The health-stress ledger uses the edited pension surplus");
close(v23("runCPI()[1].poolC"), initialShockCapital - 8000, "The inflation-stress ledger uses the edited pension surplus");
assert.match(sharedActive.textContent, /\$130,000 flat total spending/);
assert.match(sharedOriginal.textContent, /\$122,000 flat total spending/);
v23("loadState()");
importHandoff(pensionHandoff);
assert.equal(v23("STATE.totalSpendTarget"), 130000, "A local flat edit survives a reload of the original URL");
v23('setV23SpendingRule("fixed");');
assert.equal(v23("STATE.gapBands[0].amount"), 12345, "Switching back to bands restores the previously saved schedule");
assert.equal(ageBandEditor.hidden, false);
v23('setV23SpendingRule("flatTotal");');
assert.equal(v23("STATE.totalSpendTarget"), 130000, "Switching back to total spending recalls the edited annual budget");
v23("restoreSharedV23Plan()");
assert.equal(v23("STATE.totalSpendTarget"), 122000, "Only an explicit restore brings back the imported amount");
flatSpendField.valueAsNumber = 0;
submitFlatSpend({ preventDefault: () => undefined });
assert.equal(v23("STATE.totalSpendTarget"), 0, "An intentional zero budget is valid");

v23(`STATE.pssProjectionBasis="prudent-630"; selectPssElection("70-30",{spendTarget:null});
  STATE.gapGrowth=0; STATE.oneOff=0; STATE.gapBands=[{age:60,amount:24000,unit:"dollar"}];
  updateLabels();`);
assert.match(customProfileSummary.innerHTML, /Net PSS.*\$95,434\.30.*Gross PSS.*\$103,332\.85/);
const screenshotRows = v23("runModel({}).rows.slice(1)");
close(screenshotRows[0].targetSpend, 119_434.30, "Screenshot legacy band's desired spend is net pension plus $24,000");
close(screenshotRows.reduce((sum,row)=>sum+row.fundedTotalSpend,0)/screenshotRows.length, 119_434.30, "Screenshot legacy band's lifetime average is fully funded");
v23('convertBandUnit(0,"totalDollar");');
close(v23("STATE.gapBands[0].amount"), 119_434.30, "Changing a dollar gap to total preserves the existing first-year budget");
v23(`STATE.gapBands=[{age:60,amount:90000,unit:"totalDollar"},{age:70,amount:99000,unit:"totalDollar"}]; onBandChange();`);
const totalBandRows = v23("runModel({}).rows");
close(totalBandRows[1].fundedTotalSpend, 90_000, "A band can plan total spending below the pension");
close(totalBandRows[1].pensionToPoolC, 5_434.30, "The unspent pension is invested in Pool C");
close(totalBandRows[10].targetSpend, 90_000, "The first budget covers the year ending on the 70th birthday");
close(totalBandRows[11].targetSpend, 99_000, "The next budget begins on the 70th birthday");
close(totalBandRows[11].gap, 3_565.70, "Only the amount above the pension comes from investments");
assert.equal(v23("lifestylePhaseDefinitions(runModel({}),getProfile())[1].start"), 71, "Income phases use the same age transition as the ledger");
close(v23('runMC({mean:STATE.likely,sd:0,runs:1}).percentiles[2][11]'), totalBandRows[11].total, "Monte Carlo consumes the total-budget schedule");
close(v23('runHealth("none")[1].poolC'), totalBandRows[1].poolC, "Health stress carries pension surplus from a total-dollar band");
close(v23('runCPI()[1].poolC'), totalBandRows[1].poolC, "Inflation stress carries pension surplus outside the shock");
const comparedTotals = v23('comparatorCandidates(getProfile(),"total","100").map(c=>runModel(c.options).rows[1].targetSpend)');
assert.equal(comparedTotals[0], 90_000);
assert.equal(comparedTotals[1], 90_000);
const comparedGaps = v23('comparatorCandidates(getProfile(),"gap","100").map(c=>runModel(c.options).rows[11].gap)');
close(comparedGaps[0], 3_565.70, "Same-gap comparison preserves the reference election's additional spending");
close(comparedGaps[1], 3_565.70, "Same-gap comparison carries that amount across elections");
v23("loadState()");
assert.equal(v23("STATE.gapBands[0].unit"), "totalDollar", "Total age bands survive reload");

v23(`STATE.pssProjectionBasis="prudent-630"; selectPssElection("100",{spendTarget:122000});
  STATE.targetAge=75; STATE.poolCPolicy="preserve"; STATE.oneOff=0; STATE.gapGrowth=0;`);
const unavailableOneOff = v23("runModel({oneOff:190000}).rows[0]");
close(unavailableOneOff.oneOffRequested, 190_000, "The ledger records the request even when it cannot be paid");
close(unavailableOneOff.oneOffFunded, 0, "A preserved Pool C cannot fund the request");
close(unavailableOneOff.oneOffShortfall, 190_000, "An inaccessible withdrawal shows a separate shortfall");
assert.equal(v23("findMaxOneOff()"), 0, "One-off capacity does not count an unfunded withdrawal as affordable");
const availableOneOff = v23('runModel({oneOff:190000,poolCPolicy:"after-abp"}).rows[0]');
close(availableOneOff.oneOffFunded, 190_000, "An explicitly available Pool C funds the one-off");
close(availableOneOff.poolC, 127_447.66, "A funded one-off reconciles to the remaining opening capital");
assert.equal(v23('findMaxOneOff({floor:0,poolCPolicy:"after-abp"})'), 317_447, "One-off capacity is bounded by spendable opening funds");
const spreadOneOff = v23('runModel({oneOff:350000,oneOffSpread:2,poolCPolicy:"preserve"}).rows.slice(0,2)');
close(spreadOneOff.reduce((sum,row)=>sum+row.oneOffShortfall,0), 350_000, "Separate unfunded instalments reconcile to the original one-off");
const majorPreserved = v23('runHealth("major").find(row=>row.age===70)');
assert.equal(majorPreserved.healthCostRequested, 150_000);
assert.equal(majorPreserved.healthCostFunded, 0);
assert.equal(majorPreserved.healthCostUnfunded, 150_000);
const majorPayable = v23(`["none","major"].map(key=>runHealth(key,{poolCPolicy:"after-abp"}).find(row=>row.age===70))`);
assert.equal(majorPayable[1].healthCostFunded, 150_000);
assert.equal(majorPayable[1].healthCostUnfunded, 0);
close(majorPayable[0].total-majorPayable[1].total, 150_000, "Only funded care reduces capital");
const launchEvent = v23('runHealth("minor",{startAge:63,poolCPolicy:"after-abp"})[0]');
assert.equal(launchEvent.healthCostFunded, 25_000, "An event at retirement is charged once");

v23('selectPssElection("70-30",{spendTarget:122000});');
const neutralStress = v23(`(()=>{
  const cpi={cpi:STATE.cpi,cpiDrag:STATE.cpiDrag};
  const scenario={oneOff:80000,oneOffSpread:2};
  STATE.cpi=0; STATE.cpiDrag=0;
  const paths=[runModel(scenario).rows,runHealth("none",scenario),runCPI(scenario)];
  Object.assign(STATE,cpi);
  return paths.map(rows=>rows.map(r=>[r.poolA,r.poolB,r.poolC,r.oneOffFunded,r.fundedTotalSpend]));
})()`);
assert.equal(neutralStress[0][0][3], 40_000, "An actual opening instalment is present in the reference");
assert.deepEqual(neutralStress[1], neutralStress[0], "A no-event health path matches all three pools and spending");
assert.deepEqual(neutralStress[2], neutralStress[0], "A zero CPI shock matches the full baseline");
const pensionDuringShock = v23(`(()=>{
  const cpi={cpi:STATE.cpi,cpiDrag:STATE.cpiDrag,cpiDur:STATE.cpiDur,cpiAge:STATE.cpiAge};
  Object.assign(STATE,{cpi:10,cpiDrag:0,cpiDur:2,cpiAge:63});
  const rows=runCPI({totalSpendTarget:null,gapBands:makeBandsFromGap(24000,60)}).slice(2,6);
  Object.assign(STATE,cpi);
  return rows.map(({inShock,pension,targetSpend,gap})=>({inShock,pension,targetSpend,gap}));
})()`);
assert.deepEqual(Array.from(pensionDuringShock, row=>row.inShock), [false,true,true,false]);
close(pensionDuringShock[1].pension, 95_434.30*.9, "Indexation lag lowers pension in each shock year");
for (const row of pensionDuringShock) {
  close(row.targetSpend,119_434.30,"CPI stress holds the planned dollar budget");
  close(row.gap,row.targetSpend-row.pension,"Actual pension determines the planned portfolio draw");
}
const sequences = v23(`["worst","best","smooth"].map(order=>runWithSequence(order,{endAge:75,mean:.065,sd:.12}).rows.slice(1).map(r=>r.rA))`);
assert.equal(sequences[0].length, 15);
assert.deepEqual([...sequences[0]], [...sequences[1]].reverse(), "Same returns in opposite order");
close(sequences[0].reduce((sum,rate)=>sum+rate,0)/15,.065,"Reordering retains the assumed arithmetic mean");
assert.ok(sequences[2].every(rate=>rate===.065),"Smooth sequence stays at the assumed return");
const breakevenCases = v23(`(()=>{
  const profile={...getProfile(),netPension:0,poolA_day1:0,poolB_day1:0,poolC_day1:100000};
  const opts={profile,targetAge:61,totalSpendTarget:0,oneOff:0,poolCDrag:0};
  return [findBreakevenReturn(100000,opts),findBreakevenReturn(110000,opts),findBreakevenReturn(120000,opts)];
})()`);
assert.equal(breakevenCases[0],0);
close(breakevenCases[1],.1,"One year at 10% turns $100,000 into $110,000");
assert.equal(breakevenCases[2],null,"The search marks a target beyond the modelled rate range");
const pre60Partial = v23("projectPre60(59.9,0,0).at(-1)");
assert.equal(pre60Partial.age,60);
close(pre60Partial.balance,2_866.50,"One tenth of a year credits net contributions with zero balance and return");
close(v23("projectPre60(51,10000,.065).find(row=>row.age===52).balance"),10_650,"The tracker applies the entered effective annual return");
const recalculatedAlternative = (gap) => v23(`runMC({mean:.04,sd:0,runs:1,endAge:75,gapBands:makeBandsFromGap(${gap},60),totalSpendTarget:null,gapGrowth:0}).percentiles[2][15]`);
assert.ok(recalculatedAlternative(20000)>recalculatedAlternative(60000), "An explicit alternative spending rule reaches the Monte Carlo ledger");
assert.equal(v23("STATE.totalSpendTarget"), 122000, "Testing an alternative retains the active shared plan");
v23Context.URL = URL;
const resetDestination = v23('v23ResetUrl("https://example.test/deep-model.html?page=oneoff&theme=light&shared=1&rail=B&pss=100&spend=122000#chart").href');
assert.equal(resetDestination, "https://example.test/deep-model.html?page=oneoff&theme=light#chart", "Reset keeps the page and theme and removes the import parameters");
v23('selectPssElection("70-30",{spendTarget:null}); STATE.gapBands=[{age:60,amount:160,unit:"drawPct"}];');
const cappedDrawBand = v23("runModel({}).rows[1]");
close(cappedDrawBand.gap, cappedDrawBand.mandDraw, "A previously saved band cannot spend more than 100% of the mandatory draw");

const moves = v23(`["70-30","100"].flatMap(election=>{
  selectPssElection(election,{spendTarget:122000});
  return ["preserve","after-abp"].map(poolCPolicy=>{
    const {rows}=runModel({poolCPolicy,oneOff:190000,annualReturns:[{A:-.15,B:-.1275}]});
    return capitalMovement(rows,15);
  });
})`);
for(const change of moves){
  close(change.opening+change.investmentGrowth+change.pensionSaved-change.portfolioSpent-change.oneOffPaid,
    change.closing,"The capital breakdown reconciles a loss, pension savings and spending under each policy");
}
assert.equal(moves[2].oneOffPaid,0,"The capital breakdown excludes an unfunded request");
assert.equal(moves[3].oneOffPaid,190_000,"The capital breakdown includes a funded one-off once");

const auditCases = v23(`(()=>{
  const p=railBProfileForElection("70-30","prudent-630");
  const bands=normaliseGapBands([{age:60,amount:10000,unit:"dollar"},{age:70,amount:20000,unit:"dollar"}]).bands;
  const paths=[bands,[...bands,{age:90,amount:125000,unit:"totalDollar",startOnBirthday:true}]]
    .map(gapBands=>runModel({profile:p,gapBands,totalSpendTarget:null,spendMode:"fixed",gapGrowth:0,oneOff:0}).rows);
  const pending=profileWithCustomInputs(p,{retireAge:55});
  const permitted=profileWithCustomInputs(p,{retireAge:55,grossPension:80000,netPension:75000,lumpSum:50000,hostplus:0});
  const inaccessible=profileWithCustomInputs(p,{retireAge:55,grossPension:80000,netPension:75000,lumpSum:50000,hostplus:300000});
  const synthetic={...p,netPension:100000,poolA_day1:15000,poolB_day1:0,poolC_day1:0};
  const funded=fundedSpendingSummary(runModel({profile:synthetic,totalSpendTarget:120000,gapGrowth:0,oneOff:5500,abpReturn:0,poolCDrag:0,poolCPolicy:"preserve"}).rows);
  const estateRows=runModel({profile:p,oneOff:400000,totalSpendTarget:245000,poolCPolicy:"after-abp",abpReturn:0}).rows;
  const wash=computeWashPath(p,estateRows,{...STATE.wash,enabled:true});
  return {sameEarlierYears:paths[0].slice(0,30).every((r,i)=>r.total===paths[1][i].total&&r.targetSpend===paths[1][i].targetSpend),
    legacyAge70:paths[0][10].gap,birthdayAge91:paths[1][31].targetSpend,pending:pending.pendingRetireAge,
    pendingModelAge:pending.retireAge,permittedModelAge:permitted.retireAge,inaccessibleModelAge:inaccessible.retireAge,
    funded,wash,saved:captureScenarioState(),unreachableOneOff:findMaxOneOff({profile:synthetic,floor:100000})};
})()`);
assert.equal(auditCases.sameEarlierYears,true,"A later total band preserves the migrated legacy schedule");
assert.equal(auditCases.legacyAge70,20_000);
assert.equal(auditCases.birthdayAge91,125_000);
assert.equal(auditCases.pending,55);
assert.equal(auditCases.pendingModelAge,60,"An age field alone cannot move dated source inputs");
assert.equal(auditCases.permittedModelAge,55,"Dated manual inputs support a separate early-age illustration");
assert.equal(auditCases.inaccessibleModelAge,60,"An early-age forecast cannot assume Hostplus access");
assert.equal(auditCases.funded.years,35);
close(auditCases.funded.funded,3_509_500,"Lifetime funding excludes the one-off and includes every operating year");
close(auditCases.funded.average,3_509_500/35,"Average funded spending includes depleted years");
close(auditCases.funded.planned/35,120_000,"Planned spending is separate from funded spending");
assert.equal(auditCases.unreachableOneOff,null,"An already-breached floor has no feasible one-off");
assert.ok(auditCases.wash.some(row=>row.superBal===0));
assert.ok(auditCases.wash.every(row=>row.taxable<=row.superBal && (row.superBal>0||row.dbt===0)),"Wash caps taxable principal at remaining super");
assert.ok(Number.isInteger(auditCases.saved.simulationSeed));
assert.ok(auditCases.saved.wash&&auditCases.saved.wash.schedule);

assert.match(atlasSource, /pss:\s*state\.pssElection/, "Atlas shared links carry the PSS election");
assert.match(atlasSource, /basis:\s*state\.pssProjectionBasis/, "Atlas shared links carry the PSS projection basis");
assert.match(atlasSource, /theme:\s*activeTheme\(\)/, "Atlas shared links carry the selected colour theme");
assert.match(v23Source, /pss:scenario\.pssElection/, "V23 shared links carry the PSS election");
assert.match(v23Source, /basis:normaliseProjectionBasis\(scenario\.pssProjectionBasis\)/, "V23 shared links carry the PSS projection basis");
assert.match(v23Source, /theme:STATE\.theme/, "V23 shared links carry the selected colour theme");
assert.match(v23Source, /version:7/, "V23 stores the current shared-scenario schema");
assert.match(dashboardSource, /version: 7/, "Command Centre stores the current shared-scenario schema");
assert.match(atlasSource, /version: 7/, "Atlas stores the current shared-scenario schema");
assert.match(dashboardSource, /basis:\s*scenario\.pssProjectionBasis/, "Command Centre shared links carry the PSS projection basis");
assert.match(dashboardSource, /THEME_STORAGE_KEY = "robinson-retirement-theme"/, "Command Centre stores the shared theme preference");
assert.match(dashboardSource, /sharedScenarioParams\(scenario, theme\)/, "Command Centre hand-offs carry the selected colour theme");
assert.match(v23Source, /RETIREMENT_THEME_STORAGE_KEY="robinson-retirement-theme"/, "V23 reads the shared theme preference");
assert.match(dashboardSource, /const MAX_FLAT_SPEND = 300_000/, "Command Centre accepts the high-PSS V23 hand-off range");
assert.match(atlasSource, /const MAX_FLAT_SPEND = 300_000/, "Atlas accepts the high-PSS V23 hand-off range");
assert.match(dashboardSource, /calculateCanonicalRailBOpeningPosition/, "Command Centre Rail B opening positions must use the canonical retirement engine");
assert.match(dashboardSource, /calculateCanonicalWashOutcome/, "Command Centre wash outcomes must use the canonical retirement engine");
assert.match(atlasSource, /const retirementEngine = globalThis\.RetirementEngine/, "Atlas must receive the canonical browser engine");
assert.match(atlasSource, /retirementEngine\.railBOpeningPosition/, "Atlas Rail B opening positions must use the canonical retirement engine");
assert.match(atlasSource, /retirementEngine\.calculateWashOutcome/, "Atlas wash outcomes must use the canonical retirement engine");
assert.match(v23Source, /const RETIREMENT_ENGINE = window\.RetirementEngine/, "V23 must receive the canonical browser engine");
assert.match(v23Source, /RETIREMENT_ENGINE\.railBOpeningPosition/, "V23 Rail B opening positions must use the canonical retirement engine");
assert.doesNotMatch(dashboardSource, /<option value="prudent-630" disabled>/, "Command Centre prudent provider basis is enabled");
assert.doesNotMatch(v23Source, /id="pss-basis-prudent" disabled/, "V23 prudent provider basis is enabled");
assert.match(v23Source, /const LS_KEY="v23_4_state"/, "V23 uses the partial-basis state schema");
assert.match(dashboardSource, /Frontier decision point/, "Command Centre exposes the selected Frontier age on mobile");
assert.match(dashboardSource, /continues to age 95/, "Command Centre distinguishes target age from projection horizon");
assert.match(dashboardSource, /const marginalScale = Math\.max\(1, \.\.\.marginalCost\)/, "Frontier marginal bars scale to late target ages without overflow");
assert.match(dashboardSource, /scenario=\{currentScenario\} theme=\{theme\}/, "Integrated visual views receive the active scenario and theme");
assert.match(dashboardSource, /V23 remains your age-band workbench/, "Integrated explorer distinguishes flat comparisons from V23 age bands");
assert.match(dashboardSource, /Current choices now drive the VR illustration/, "VR page must disclose that the active source anchor drives the illustration");
assert.match(dashboardSource, /ages 57–59 are transparent illustrations/, "VR page must distinguish illustrative early ages from the sourced age-60 anchor");
assert.match(dashboardSource, /No under-60 tax-component split, ETP rollover/, "VR page must identify assumptions it refuses to invent");
assert.match(dashboardSource, /obtain formal CSC VR estimates and tax components/, "VR page must identify the missing evidence required before reliance");
assert.match(dashboardSource, /CPI is already reflected in the CPI-reduced source anchor/, "VR page explains why provider CPI is not reapplied");
assert.match(dashboardSource, /pension flat in real \$/, "VR result summary states the real-dollar pension treatment");
assert.doesNotMatch(dashboardSource, /const nominalReturn = \(1 \+ realReturn\) \* \(1 \+ basis\.cpi\) - 1/, "VR bridge cannot mix real return and provider CPI");

const railAHistorical57 = dashboard.vrScenarioPath(dashboard.RAILS.A, dashboard.PSS_PROJECTION_BASES["source-825"], .05, 57, "immediate");
close(railAHistorical57.pensionStart, 67_415.31, "Rail A VR age-57 calibration pension");
close(railAHistorical57.headroom, 1_021_355.02, "Rail A VR age-57 calibration TBC headroom");
const railAHistorical60 = dashboard.vrScenarioPath(dashboard.RAILS.A, dashboard.PSS_PROJECTION_BASES["source-825"], .05, 60, "immediate");
close(railAHistorical60.pensionStart, dashboard.RAILS.A.grossPension, "Rail A VR age-60 pension reconciles to source");
close(railAHistorical60.pssLumpAt60, dashboard.RAILS.A.lumpSum, "Rail A VR age-60 lump reconciles to source");
const current7030 = dashboard.railBForElection("70-30", "source-825");
const current7030At60 = dashboard.vrScenarioPath(current7030, dashboard.PSS_PROJECTION_BASES["source-825"], .065, 60, "preserve");
close(current7030At60.pension60, current7030.grossPension, "Current 70/30 VR age-60 pension reconciles to provider source");
close(current7030At60.pssLumpAt60, current7030.lumpSum, "Current 70/30 VR age-60 lump reconciles to provider source");
const current7030At57Low = dashboard.vrScenarioPath(current7030, dashboard.PSS_PROJECTION_BASES["source-825"], .04, 57, "immediate");
const current7030At57High = dashboard.vrScenarioPath(current7030, dashboard.PSS_PROJECTION_BASES["source-825"], .075, 57, "immediate");
assert.ok(current7030At57High.flexibleCapitalAt60 > current7030At57Low.flexibleCapitalAt60, "VR capital bridge responds to the selected post-retirement real return");
const current7030At57 = dashboard.vrScenarioPath(current7030, dashboard.PSS_PROJECTION_BASES["source-825"], .065, 57, "immediate");
close(current7030At57.pension60, current7030At57.pensionStart, "VR CPI-indexed pension remains flat in real dollars to age 60");
close(current7030At57.pre60GrossPension, current7030At57.pensionStart * 3, "VR pre-60 pension total remains in today dollars");
close(current7030At57.pssLumpAt60, current7030At57.pssLumpAtExit * Math.pow(1.065, 3), "VR PSS lump grows only at the selected real return");
close(current7030At57.vrCashAt60, current7030At57.vrCashAtExit * Math.pow(1.065, 3), "VR employment cash grows only at the selected real return");
const current7030At57OtherCpi = dashboard.vrScenarioPath(current7030, dashboard.PSS_PROJECTION_BASES["prudent-630"], .065, 57, "immediate");
for (const field of ["pension60", "pre60GrossPension", "pssLumpAt60", "vrCashAt60", "headroom"]) {
  close(current7030At57OtherCpi[field], current7030At57[field], `VR ${field} does not reapply provider CPI to a fixed real source anchor`);
}
const current7030Preserve57 = dashboard.vrScenarioPath(current7030, dashboard.PSS_PROJECTION_BASES["source-825"], .065, 57, "preserve");
const expectedPreservedDefined57 = dashboard.definedBenefitAt60(current7030) * .907;
close(current7030Preserve57.pension60, expectedPreservedDefined57 * .7 / 11, "VR preserve lower-bound pension remains on the real-dollar basis");
close(current7030Preserve57.pssLumpAt60, expectedPreservedDefined57 * .3, "VR preserve lower-bound lump remains on the real-dollar basis");
const vrRailCases = [
  ["Rail A", dashboard.RAILS.A, dashboard.PSS_PROJECTION_BASES["source-825"]],
  ...Object.entries(expectedElectionsByBasis).flatMap(([basisKey, elections]) => Object.keys(elections).map((electionKey) => [
    `${basisKey} ${electionKey}`,
    dashboard.railBForElection(electionKey, basisKey),
    dashboard.PSS_PROJECTION_BASES[basisKey],
  ])),
];
for (const [label, vrRail, vrBasis] of vrRailCases) {
  for (const age of dashboard.VR_AGES) {
    const years = 60 - age;
    const factor = dashboard.VR_AGE_FACTORS[age];
    const immediate = dashboard.vrScenarioPath(vrRail, vrBasis, .065, age, "immediate");
    const preserve = dashboard.vrScenarioPath(vrRail, vrBasis, .065, age, "preserve");
    for (const path of [immediate, preserve]) {
      for (const field of ["pension60", "pssLumpAt60", "vrCashAt60", "headroom", "potentialAbpAt60", "flexibleCapitalAt60"]) {
        assert.ok(Number.isFinite(path[field]) && path[field] >= 0, `${label} age ${age} ${path.mode} ${field} is finite and non-negative`);
      }
    }
    if (age === 60) {
      close(immediate.pension60, vrRail.grossPension, `${label} age-60 immediate pension reconciles to source`);
      close(preserve.pension60, vrRail.grossPension, `${label} age-60 preserve pension reconciles to source`);
      close(immediate.pssLumpAt60, vrRail.lumpSum, `${label} age-60 immediate lump reconciles to source`);
      close(preserve.pssLumpAt60, vrRail.lumpSum, `${label} age-60 preserve lump reconciles to source`);
    } else {
      const definedAtExit = dashboard.definedBenefitAt60(vrRail) * factor.abmRatio;
      close(immediate.pension60, immediate.pensionStart, `${label} age ${age} immediate pension stays flat in real dollars`);
      close(immediate.pre60GrossPension, immediate.pensionStart * years, `${label} age ${age} pre-60 pension is summed in real dollars`);
      close(immediate.pssLumpAt60, immediate.pssLumpAtExit * Math.pow(1.065, years), `${label} age ${age} immediate lump uses real growth only`);
      close(immediate.vrCashAt60, immediate.vrCashAtExit * Math.pow(1.065, years), `${label} age ${age} VR cash uses real growth only`);
      close(preserve.pension60, definedAtExit * (vrRail.pensionPercent / 100) / 11, `${label} age ${age} preserve pension uses the real lower bound`);
      close(preserve.pssLumpAt60, definedAtExit * (vrRail.lumpPercent / 100), `${label} age ${age} preserve lump uses the real lower bound`);
    }
  }
}
const source100At57 = dashboard.vrScenarioPath(dashboard.railBForElection("100", "source-825"), dashboard.PSS_PROJECTION_BASES["source-825"], .05, 57, "immediate");
close(source100At57.pssLumpAt60, 0, "100% pension VR illustration has no PSS lump");
close(source100At57.potentialAbpAt60, 0, "100% pension VR illustration does not invent ABP headroom");
assert.match(dashboardSource, /function CollapsiblePanel/, "Command Centre provides progressive disclosure for secondary detail");
assert.doesNotMatch(dashboardSource, /cost \/ 2_600/, "Frontier no longer uses the age-75-only fixed bar scale");
assert.match(v23Source, /range\.setAttribute\("aria-label"/, "V23 enhanced range controls retain accessible names");
assert.match(v23Source, /syncV23PrecisionControls/, "V23 synchronises exact-number fields after programmatic control changes");
assert.match(v23Source, /syncV23AssumptionLedger/, "V23 synchronises the sticky assumptions ledger without a polling delay");
assert.match(v23Source, /V23 profile and plan controls take precedence/, "The live banner discloses when saved V23 inputs take precedence");
close(v23("safePercent(4377,36000,{cap:true})"), 12.1583333333, "V23 target funding percentage uses funded gap divided by planned gap");
close(v23("safePercent(9066,9066,{cap:true})"), 100, "V23 mandatory-use percentage reads 100% when the compulsory payment is fully consumed");
assert.equal(v23("safePercent(0,0,{cap:true})"), null, "V23 zero-denominator comparisons return N/A rather than a misleading 0%");
assert.equal(v23("safePercent(52000,46783) > 100"), true, "V23 gap-versus-earnings comparison identifies capital consumption");
assert.match(v23Source, /"Target funded","Avg shortfall","Mandatory used","Gap ÷ portfolio earnings"/, "V23 lifestyle table leads with decision-useful funding measures");
assert.doesNotMatch(v23Source, /"Spend % of mand\. draw"/, "V23 removes the easily misread funded-gap-versus-minimum heading");
assert.match(v23Source, /“Target funded” shows how much of your planned gap was actually delivered/, "V23 explains funding percentages in plain English");
assert.match(v23Source, /CSC basis \$\{basis\.shortLabel\}/, "V23 repeats the selected CSC provider basis beside the phase results");
const v23NavSource = v23Source.match(/<nav class="side" id="side-nav">([\s\S]*?)<\/nav>/)?.[1] || "";
const v23PageIds = [...v23NavSource.matchAll(/data-page="([^"]+)"/g)].map((match) => match[1]);
assert.equal(v23PageIds.length, 33, "V23 retains all 33 navigable analysis pages");
assert.equal(new Set(v23PageIds).size, v23PageIds.length, "V23 navigation contains no duplicated destinations");
assert.match(v23NavSource, /<details class="nav-advanced"/, "V23 uses progressive disclosure for specialist analysis");
validateLedgerMigration({ core, browserEngine, dashboard, atlasSource, compile, runCommonJs });
console.log("Retirement dual-basis registry, canonical PSS-opening engine, age-band preservation, control synchronisation, plain-English funding measures, navigation disclosure, source-limited wash, surplus routing and zero-volatility invariants passed across Command Centre, Atlas and V23.");
