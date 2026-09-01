import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import vm from "node:vm";
import ts from "typescript";

const normalise = (source) => source.replace(/\r\n/g, "\n");
const dashboardSource = normalise(await readFile(new URL("../app/retirement-dashboard.tsx", import.meta.url), "utf8"));
const coreSource = normalise(await readFile(new URL("../app/retirement-core.ts", import.meta.url), "utf8"));
const atlasSource = normalise(await readFile(new URL("../public/atlas.js", import.meta.url), "utf8"));
const v23Source = normalise(await readFile(new URL("../public/deep-model.html", import.meta.url), "utf8"));

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
const reactStub = { useEffect: () => undefined, useMemo: (factory) => factory(), useRef: () => ({ current: null }), useState: (value) => [value, () => undefined] };
const dashboard = runCommonJs(
  compile(`${dashboardSource}\nmodule.exports = { RAILS, PSS_ELECTIONS, PSS_PRUDENT_ELECTIONS, PSS_ELECTION_ORDER, PSS_PROJECTION_BASES, normaliseProjectionBasis, normaliseElectionForBasis, railBForElection, washOutcome, operationalLedger, monteCarloFan };`),
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
const atlasContext = { Math, Number, String, Array, Object };
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
  window: { location: { search: "" } }, Chart: makeChartStub,
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
  },
};
assert.deepEqual(Array.from(dashboard.PSS_ELECTION_ORDER), ["60-40", "65-35", "70-30", "100"], "Command Centre election order");
const close = (actual, expected, message) => assert.ok(Math.abs(Number(actual) - expected) < 0.011, `${message}: expected ${expected}, got ${actual}`);

const expectedBases = {
  "source-825": { fundEarnings: .082, salaryGrowth: .05, cpi: .025, realFundEarnings: 1.082 / 1.025 - 1, realSalaryGrowth: 1.05 / 1.025 - 1, status: "source-backed", elections: 4 },
  "prudent-630": { fundEarnings: .06, salaryGrowth: .05, cpi: .03, realFundEarnings: 1.06 / 1.03 - 1, realSalaryGrowth: 1.05 / 1.03 - 1, status: "partial-source", elections: 3 },
};

for (const [key, expected] of Object.entries(expectedBases)) {
  const surfaces = [
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
assert.equal(dashboard.normaliseElectionForBasis("prudent-630", "100"), "60-40", "Command Centre rejects missing prudent 100% election");
assert.equal(atlas.normaliseElectionForBasis("prudent-630", "100"), "60-40", "Atlas rejects missing prudent 100% election");
assert.equal(v23('normaliseElectionForBasis("prudent-630","100")'), "60-40", "V23 rejects missing prudent 100% election");

for (const [basisKey, expectedElections] of Object.entries(expectedElectionsByBasis)) {
 for (const [key, expected] of Object.entries(expectedElections)) {
  const commandElection = dashboard.PSS_PROJECTION_BASES[basisKey].elections[key];
  const atlasElection = atlas.PSS_PROJECTION_BASES[basisKey].elections[key];
  const commandRail = dashboard.railBForElection(key, basisKey);
  const atlasRail = atlas.railBForElection(key, basisKey);
  const v23Election = v23(`PSS_PROJECTION_BASES[${JSON.stringify(basisKey)}].elections[${JSON.stringify(key)}]`);
  const v23Rail = v23(`railBProfileForElection(${JSON.stringify(key)},${JSON.stringify(basisKey)})`);
  for (const field of ["grossPension", "netPension", "lumpSum", "lumpTaxFree", "lumpTaxableTaxed"]) {
    close(commandElection[field], expected[field], `Command Centre ${basisKey} ${key} ${field}`);
    close(atlasElection[field], expected[field], `Atlas ${basisKey} ${key} ${field}`);
    close(v23Election[field], expected[field], `V23 ${basisKey} ${key} ${field}`);
  }
  close(commandElection.fas, expected.fas, `Command Centre ${basisKey} ${key} FAS`);
  close(atlasElection.fas, expected.fas, `Atlas ${basisKey} ${key} FAS`);
  close(v23Rail.fas, expected.fas, `V23 ${basisKey} ${key} FAS`);
  assert.ok(Math.abs(commandElection.lumpTaxFree + commandElection.lumpTaxableTaxed + commandElection.lumpTaxableUntaxed - commandElection.lumpSum) <= .011, `Command Centre ${basisKey} ${key} source components reconcile within one cent`);
  for (const [field, expectedField] of [["poolA", "poolA"], ["poolC", "poolC"], ["dbSpecialValue", "dbSpecialValue"]]) {
    close(commandRail[field], expected[expectedField], `Command Centre ${basisKey} ${key} ${field}`);
    close(atlasRail[field], expected[expectedField], `Atlas ${basisKey} ${key} ${field}`);
  }
  close(v23Rail.poolA_day1, expected.poolA, `V23 ${key} poolA`);
  close(v23Rail.poolC_day1, expected.poolC, `V23 ${key} poolC`);
  close(v23Rail.dbSpecialValue, expected.dbSpecialValue, `V23 ${key} special value`);
  assert.equal(dashboard.washOutcome(commandRail, 99).maxCycles, expected.maxCycles, `Command Centre ${basisKey} ${key} wash limit`);
  assert.equal(atlas.washOutcome(atlasRail, 99).maxCycles, expected.maxCycles, `Atlas ${basisKey} ${key} wash limit`);
  assert.equal(v23Rail.washMax, expected.maxCycles, `V23 ${basisKey} ${key} wash limit`);
 }
}

const expectedRailA = { lumpTaxFree: 141_581.47, lumpTaxableTaxed: 433_220.20, lumpTaxableUntaxed: 0 };
for (const [field, value] of Object.entries(expectedRailA)) {
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

assert.match(atlasSource, /pss:\s*state\.pssElection/, "Atlas shared links carry the PSS election");
assert.match(atlasSource, /basis:\s*state\.pssProjectionBasis/, "Atlas shared links carry the PSS projection basis");
assert.match(v23Source, /pss:scenario\.pssElection/, "V23 shared links carry the PSS election");
assert.match(v23Source, /basis:normaliseProjectionBasis\(scenario\.pssProjectionBasis\)/, "V23 shared links carry the PSS projection basis");
assert.match(v23Source, /version:7/, "V23 stores the current shared-scenario schema");
assert.match(dashboardSource, /version: 7/, "Command Centre stores the current shared-scenario schema");
assert.match(atlasSource, /version: 7/, "Atlas stores the current shared-scenario schema");
assert.match(dashboardSource, /basis:\s*scenario\.pssProjectionBasis/, "Command Centre shared links carry the PSS projection basis");
assert.doesNotMatch(dashboardSource, /<option value="prudent-630" disabled>/, "Command Centre prudent provider basis is enabled");
assert.doesNotMatch(v23Source, /id="pss-basis-prudent" disabled/, "V23 prudent provider basis is enabled");
assert.match(v23Source, /const LS_KEY="v23_4_state"/, "V23 uses the partial-basis state schema");
assert.match(dashboardSource, /Frontier decision point/, "Command Centre exposes the selected Frontier age on mobile");
assert.match(dashboardSource, /continues to age 95/, "Command Centre distinguishes target age from projection horizon");
assert.match(dashboardSource, /const marginalScale = Math\.max\(1, \.\.\.marginalCost\)/, "Frontier marginal bars scale to late target ages without overflow");
assert.doesNotMatch(dashboardSource, /cost \/ 2_600/, "Frontier no longer uses the age-75-only fixed bar scale");
assert.match(v23Source, /range\.setAttribute\("aria-label"/, "V23 enhanced range controls retain accessible names");
console.log("Retirement dual-basis registry, partial-source gate, target-age clarity, source-limited wash, surplus routing and zero-volatility invariants passed across Command Centre, Atlas and V23.");
