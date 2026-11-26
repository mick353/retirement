"use client";

import {
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type PointerEvent as ReactPointerEvent,
  type WheelEvent as ReactWheelEvent,
} from "react";
import RetirementAi from "./retirement-ai";
import RetirementPaymentCalendar, { readCalendarSettings, type CalendarSettings } from "./retirement-payment-calendar";
import {
  HOSTPLUS_BASELINE_RETURN,
  HOSTPLUS_STARTING_BALANCE,
  PLANNED_RETIREMENT_DATE,
  POOL_C_MODELLED_DRAG,
  TRANSFER_BALANCE_BUFFER,
  TRANSFER_BALANCE_CAP,
  abpMinimumRateAtAgeOn1July,
  calculateFlatRetirementLedger as calculateCanonicalFlatRetirementLedger,
  calculateWashOutcome as calculateCanonicalWashOutcome,
  RETIREMENT_ENGINE_VERSION,
  commandCentreSpend,
  countFundingPath,
  firstPensionFinancialYear,
  fundingPathCounts,
  normaliseElectionForBasis as normaliseCanonicalElectionForBasis,
  normaliseProjectionBasis as normaliseCanonicalProjectionBasis,
  planReceipt,
  pssEstimateDate,
  projectHostplusAt60,
  railBOpeningPosition as calculateCanonicalRailBOpeningPosition,
} from "./retirement-core";

type RailKey = "A" | "B";
type PssElectionKey = "60-40" | "65-35" | "70-30" | "100";
type PssProjectionBasisKey = "source-825" | "prudent-630";
type TaxYear = "2026-27" | "2027-28";
type SectionKey =
  | "overview"
  | "scenario"
  | "visuals"
  | "compare"
  | "pre60"
  | "pss"
  | "frontier"
  | "risk"
  | "estate"
  | "vr"
  | "benchmark"
  | "review"
  | "evidence";

type ScenarioTool = "lab" | "explore" | "compare" | "frontier" | "surface" | "risk";

type ScenarioState = {
  rail: RailKey;
  pssElection: PssElectionKey;
  pssProjectionBasis: PssProjectionBasisKey;
  spend: number;
  realReturn: number;
  targetAge: number;
  homeValue: number;
  taxYear: TaxYear;
  liquidityMonths: number;
  simulationSeed: number;
};

type Theme = "dark" | "light";

type ComparisonPlan = Pick<ScenarioState, "rail" | "spend"> & {
  label: string;
  intent: string;
};

type ReviewSnapshot = ScenarioState & {
  capturedAt: string;
  endCapital: number;
  estate: number;
  annualForecast?: Record<number, ReviewForecast>;
  plan?: ReturnType<typeof planReceipt>;
};

type SavedCommandPlan = ScenarioState & {
  plan?: ReturnType<typeof planReceipt>;
  calendar?: CalendarSettings | null;
  riskEssentials?: number | null;
  washCycles?: number;
};

type ReviewForecast = { capital: number; spending: number; pension: number };

type ActualReviewCheckpoint = {
  reviewedAt: string;
  capital: number | null;
  spending: number | null;
  pension: number | null;
  note: string;
  baseline?: ReviewForecast & { capturedAt: string; origin: "snapshot" | "first-entry" };
};

const EMPTY_CHECKPOINT: ActualReviewCheckpoint = { reviewedAt: "", capital: null, spending: null, pension: null, note: "" };
const forecastForReview = (row: { ending: number; spend: number; pension: number }): ReviewForecast => ({
  capital: row.ending, spending: row.spend, pension: row.pension,
});
const RISK_ESSENTIALS_KEY = "robinson-retirement-risk-essentials";
const PAYMENT_CALENDAR_KEY = "robinson-retirement-payment-calendar";
const WASH_CYCLES_KEY = "robinson-retirement-wash-cycles";

type Rail = {
  key: RailKey;
  short: string;
  name: string;
  purpose: string;
  source: string;
  grossPension: number;
  netPension: number;
  lumpSum: number;
  hostplus: number;
  capital: number;
  dbSpecialValue: number;
  poolA: number;
  poolC: number;
  fas: number;
  electionKey: PssElectionKey | "rail-a";
  electionLabel: string;
  pensionPercent: number;
  lumpPercent: number;
  lumpTaxFree: number;
  lumpTaxableTaxed: number;
  lumpTaxableUntaxed: number;
  tbcHeadroom: number;
  tbcExcess: number;
  washTaxableShare: number;
  washEvidence: string;
};

type PssElection = {
  key: PssElectionKey;
  label: string;
  pensionPercent: number;
  lumpPercent: number;
  grossPension: number;
  netPensionPf: number;
  netPension: number;
  lumpSum: number;
  lumpTaxFree: number;
  lumpTaxableTaxed: number;
  lumpTaxableUntaxed: number;
  fas: number;
  source: string;
};

type PssProjectionBasis = {
  key: PssProjectionBasisKey;
  label: string;
  shortLabel: string;
  fundEarnings: number;
  salaryGrowth: number;
  cpi: number;
  realFundEarnings: number;
  realSalaryGrowth: number;
  sourceStatus: "source-backed" | "partial-source";
  sourceDate: string | null;
  elections: Partial<Record<PssElectionKey, PssElection>>;
  note: string;
};

type VrMode = "immediate" | "preserve";

type VrScenario = {
  age: number;
  mode: VrMode;
  abmRatio: number;
  pensionStart: number;
  pension60: number;
  netPf60: number;
  pssLumpAtExit: number;
  pssLumpAt60: number;
  vrCashAtExit: number;
  vrCashAt60: number;
  pre60GrossPension: number;
  tbcCredit: number;
  headroom: number;
  superEligibleAt60: number;
  potentialAbpAt60: number;
  superOutsideAbp: number;
  flexibleCapitalAt60: number;
};

const TBC = 2_100_000;
const TSB_BUFFER = 5_000;
const HOME_BASELINE = 500_000;
const POOL_C_DRAG = POOL_C_MODELLED_DRAG;
const MAX_FLAT_SPEND = 300_000;
const ASFA_MARCH_2026 = {
  asAt: "March quarter 2026",
  singleComfortable: 55_923,
  coupleComfortable: 78_566,
};

const PSS_ELECTIONS: Record<PssElectionKey, PssElection> = {
  "60-40": { key: "60-40", label: "60% pension / 40% lump", pensionPercent: 60, lumpPercent: 40, grossPension: 91_776.03, netPensionPf: 3_316.93, netPension: 86_240.18, lumpSum: 673_024.21, lumpTaxFree: 160_278.23, lumpTaxableTaxed: 512_745.98, lumpTaxableUntaxed: 0, fas: 168_256.05, source: "1 Sep 2026 CSC iEstimator · 60/40" },
  "65-35": { key: "65-35", label: "65% pension / 35% lump", pensionPercent: 65, lumpPercent: 35, grossPension: 99_424.03, netPensionPf: 3_611.09, netPension: 93_888.34, lumpSum: 588_896.19, lumpTaxFree: 140_243.46, lumpTaxableTaxed: 448_652.73, lumpTaxableUntaxed: 0, fas: 168_256.05, source: "1 Sep 2026 CSC iEstimator · 65/35" },
  "70-30": { key: "70-30", label: "70% pension / 30% lump", pensionPercent: 70, lumpPercent: 30, grossPension: 107_072.03, netPensionPf: 3_905.24, netPension: 101_536.24, lumpSum: 504_768.16, lumpTaxFree: 120_208.67, lumpTaxableTaxed: 384_559.49, lumpTaxableUntaxed: 0, fas: 168_256.05, source: "1 Sep 2026 CSC iEstimator · 70/30" },
  "100": { key: "100", label: "100% pension / no lump", pensionPercent: 100, lumpPercent: 0, grossPension: 152_960.05, netPensionPf: 5_504.01, netPension: 143_104.26, lumpSum: 0, lumpTaxFree: 0, lumpTaxableTaxed: 0, lumpTaxableUntaxed: 0, fas: 168_256.05, source: "1 Sep 2026 CSC iEstimator · 100% pension" },
};
const PSS_PRUDENT_ELECTIONS: Partial<Record<PssElectionKey, PssElection>> = {
  "60-40": { key: "60-40", label: "60% pension / 40% lump", pensionPercent: 60, lumpPercent: 40, grossPension: 88_571.01, netPensionPf: 3_102.79, netPension: 80_672.54, lumpSum: 649_520.78, lumpTaxFree: 177_975.75, lumpTaxableTaxed: 471_545.03, lumpTaxableUntaxed: 0, fas: 162_380.20, source: "1 Sep 2026 CSC iEstimator · 60/40 · 6/5/3" },
  "65-35": { key: "65-35", label: "65% pension / 35% lump", pensionPercent: 65, lumpPercent: 35, grossPension: 95_951.93, netPensionPf: 3_386.67, netPension: 88_053.42, lumpSum: 568_330.69, lumpTaxFree: 155_728.77, lumpTaxableTaxed: 412_601.91, lumpTaxableUntaxed: 0, fas: 162_380.20, source: "1 Sep 2026 CSC iEstimator · 65/35 · 6/5/3" },
  "70-30": { key: "70-30", label: "70% pension / 30% lump", pensionPercent: 70, lumpPercent: 30, grossPension: 103_332.85, netPensionPf: 3_670.55, netPension: 95_434.30, lumpSum: 487_140.59, lumpTaxFree: 133_481.80, lumpTaxableTaxed: 353_658.78, lumpTaxableUntaxed: 0, fas: 162_380.20, source: "1 Sep 2026 CSC iEstimator · 70/30 · 6/5/3" },
  "100": { key: "100", label: "100% pension / no lump", pensionPercent: 100, lumpPercent: 0, grossPension: 147_713.96, netPensionPf: 5_214.45, netPension: 135_575.70, lumpSum: 0, lumpTaxFree: 0, lumpTaxableTaxed: 0, lumpTaxableUntaxed: 0, fas: 162_485.36, source: "9 Sep 2026 CSC iEstimator · 100% pension · 6/5/3" },
};
const PSS_ELECTION_ORDER: PssElectionKey[] = ["60-40", "65-35", "70-30", "100"];
const SCENARIO_DEFAULTS_VERSION = 2; // 2 = Rail B 70/30 default (2026-10-03)

const PSS_PROJECTION_BASES: Record<PssProjectionBasisKey, PssProjectionBasis> = {
  "source-825": {
    key: "source-825",
    label: "Current CSC source basis",
    shortLabel: "8.2 / 5 / 2.5",
    fundEarnings: 0.082,
    salaryGrowth: 0.05,
    cpi: 0.025,
    realFundEarnings: (1.082 / 1.025) - 1,
    realSalaryGrowth: (1.05 / 1.025) - 1,
    sourceStatus: "source-backed",
    sourceDate: "1 September 2026",
    elections: PSS_ELECTIONS,
    note: "All four election outputs and their tax components are read directly from the active CSC iEstimator PDFs.",
  },
  "prudent-630": {
    key: "prudent-630",
    label: "Prudent sensitivity basis",
    shortLabel: "6 / 5 / 3",
    fundEarnings: 0.06,
    salaryGrowth: 0.05,
    cpi: 0.03,
    realFundEarnings: (1.06 / 1.03) - 1,
    realSalaryGrowth: (1.05 / 1.03) - 1,
    sourceStatus: "source-backed",
    sourceDate: "1 and 9 September 2026",
    elections: PSS_PRUDENT_ELECTIONS,
    note: "All four elections are direct CSC outputs. The 60/40, 65/35 and 70/30 estimates use the 1 September snapshot and FAS $162,380.20; the 100% pension estimate uses the later 9 September snapshot and FAS $162,485.36.",
  },
};

function normaliseProjectionBasis(value: unknown): PssProjectionBasisKey {
  return normaliseCanonicalProjectionBasis(value);
}

function electionsForBasis(basisKey: PssProjectionBasisKey) {
  return PSS_PROJECTION_BASES[basisKey].elections;
}

function electionKeysForBasis(basisKey: PssProjectionBasisKey) {
  const elections = electionsForBasis(basisKey);
  return PSS_ELECTION_ORDER.filter((key) => Boolean(elections[key]));
}

function normaliseElectionForBasis(basisKey: PssProjectionBasisKey, value: unknown): PssElectionKey {
  return normaliseCanonicalElectionForBasis(basisKey, value);
}

function lowerFirst(value: string): string {
  return value.charAt(0).toLowerCase() + value.slice(1);
}

function railBForElection(electionKey: PssElectionKey, basisKey: PssProjectionBasisKey = "source-825"): Rail {
  const engine = calculateCanonicalRailBOpeningPosition(electionKey, basisKey);
  return {
    key: "B",
    short: `Spending frontier · ${engine.label}`,
    name: `Rail B — ${engine.label}`,
    purpose: `Tests the selected ${lowerFirst(engine.basisLabel)} election against spending, TBC, drawdown, tax and estate objectives.`,
    source: engine.source,
    grossPension: engine.grossPension,
    netPension: engine.netPension,
    lumpSum: engine.lumpSum,
    hostplus: engine.hostplus,
    capital: engine.capital,
    dbSpecialValue: engine.dbSpecialValue,
    poolA: engine.poolA,
    poolC: engine.poolC,
    fas: engine.fas,
    electionKey: engine.key,
    electionLabel: engine.label,
    pensionPercent: engine.pensionPercent,
    lumpPercent: engine.lumpPercent,
    lumpTaxFree: engine.lumpTaxFree,
    lumpTaxableTaxed: engine.lumpTaxableTaxed,
    lumpTaxableUntaxed: engine.lumpTaxableUntaxed,
    tbcHeadroom: engine.tbcHeadroom,
    tbcExcess: engine.tbcExcess,
    washTaxableShare: engine.washTaxableShare,
    washEvidence: engine.washEvidence,
  };
}

const RAILS: Record<RailKey, Rail> = {
  A: {
    key: "A",
    short: "Conservative wealth rail",
    name: "Rail A — conservative wealth / investment benchmark",
    purpose: "Tests the V5.0 three-pool engine against investment-only age-75 targets.",
    source: "March iEstimator / V5.0 / V23",
    grossPension: 78_382.04,
    netPension: 76_041.68,
    lumpSum: 574_801.66,
    hostplus: 317_447.66,
    capital: 892_249.32,
    dbSpecialValue: 1_254_112.64,
    poolA: 840_887.36,
    poolC: 51_361.96,
    fas: 143_700.42,
    electionKey: "rail-a",
    electionLabel: "March 2026 60/40 control",
    pensionPercent: 60,
    lumpPercent: 40,
    lumpTaxFree: 141_581.47,
    lumpTaxableTaxed: 433_220.20,
    lumpTaxableUntaxed: 0,
    tbcHeadroom: 845_887.36,
    tbcExcess: 0,
    washTaxableShare: 433_220.20 / 574_801.66,
    washEvidence: "Direct March 2026 CSC component split: 75.37% taxable-taxed, 24.63% tax-free and 0% untaxed. Washing is limited to the original PSS lump; Hostplus components remain unresolved.",
  },
  B: railBForElection("60-40"),
};

function railFor(railKey: RailKey, electionKey: PssElectionKey, basisKey: PssProjectionBasisKey = "source-825") {
  return railKey === "A" ? RAILS.A : railBForElection(electionKey, basisKey);
}

function washOutcome(rail: Rail, cycles: number, annualAmount = 130_000) {
  return calculateCanonicalWashOutcome(rail, cycles, annualAmount);
}

const NAV: { key: SectionKey; label: string; group: string }[] = [
  { key: "overview", label: "Command Centre", group: "Decide" },
  { key: "scenario", label: "Scenario", group: "Decide" },
  { key: "pre60", label: "Present → 60", group: "Build" },
  { key: "pss", label: "PSS & three pools", group: "Build" },
  { key: "estate", label: "Tax & estate", group: "Protect" },
  { key: "vr", label: "VR option", group: "Protect" },
  { key: "benchmark", label: "Global position", group: "Context" },
  { key: "review", label: "Annual review", group: "Context" },
  { key: "evidence", label: "Evidence & audit", group: "Context" },
];

const SCENARIO_TOOLS: { key: ScenarioTool; label: string; hint: string }[] = [
  { key: "lab", label: "Lab", hint: "Adjust one plan and see its immediate income, capital and estate effects." },
  { key: "explore", label: "Explore", hint: "See the plan as six interactive illustrations, annual income, return paths or a strategy map." },
  { key: "compare", label: "Compare", hint: "Compare the balanced, lifestyle-led and estate-first presets on like-for-like assumptions." },
  { key: "frontier", label: "Frontier", hint: "Trade annual spending against later investment capital and estate." },
  { key: "surface", label: "Surface", hint: "Compare what stays invested after spending from your pension and both investment pools." },
  { key: "risk", label: "Risk", hint: "Stress sequence, volatility and capital-routing outcomes." },
];

type GuideCopy = { use: string; read: string; limit: string };
const SECTION_GUIDES: Partial<Record<SectionKey, GuideCopy>> = {
  overview: { use: "Check the active rail, pension election and flat spending above, then read the opening pools and annual ledger.", read: "Compare planned spending with funded spending; a shortfall means the model did not supply the full target.", limit: "The gross estate includes the selected home value and is before estate costs and residual death-benefit tax." },
  pre60: { use: "Follow the dated contribution phases and change the contribution inputs to test the balance at 60.", read: "Compare the projected Hostplus balance with the source-backed retirement opening; a sensitivity is not a new provider estimate.", limit: "Contribution timing and investment returns are assumptions. Check actual balances and contribution records before using a result." },
  pss: { use: "Select one CSC projection basis and one PSS election, then inspect the pension, lump sum and Pool A/B/C opening.", read: "A larger pension may leave a smaller lump and less Pool A headroom; compare spending support as well as capital.", limit: "The two provider bases use different source snapshots. Hostplus tax components and future provider execution remain unresolved." },
  estate: { use: "Review gross and illustrative after-tax estate separately, then inspect the source-limited NCC wash assumptions.", read: "Notice which assets are in super, outside super and in the home before comparing outcomes.", limit: "Beneficiary status, actual tax components, gains and contribution eligibility must be confirmed; these are modelled tax comparisons." },
  vr: { use: "Choose an age and pathway, then inspect the age-60 source anchor and the illustrated bridge from earlier retirement.", read: "Compare pension start, investable cash and the capital at 60 for each pathway.", limit: "Ages 57–59 are illustrations, not CSC quotations. Obtain formal estimates and tax components before deciding." },
  benchmark: { use: "Use the external spending figures as context beside your own after-tax cashflow and active plan.", read: "Compare household type and assumptions before drawing a conclusion from a benchmark.", limit: "Population benchmarks do not tell you what your household needs or what this plan can fund." },
  review: { use: "Capture a dated plan snapshot, record confirmed actuals, work through the checklist and export the result.", read: "The actual-versus-plan checkpoint shows differences; it does not silently replace the projection.", limit: "Data here is stored on this device. Confirm source dates and keep an exported copy for the review record." },
  evidence: { use: "Check the source register and the EXACT, ESTIMATED, MODELLED and SPECULATIVE labels.", read: "Trace an important figure to its active rail, election, provider basis and dated source.", limit: "The site publishes derived figures, not the private source PDFs; revisit source and rule changes before acting." },
};
const SCENARIO_GUIDES: Record<ScenarioTool, GuideCopy> = {
  lab: { use: "Adjust your plan and inspect the annual ledger. In Solve and spend, choose a question, enter a Pool A balance and age, and calculate the assumptions that could reach it.", read: "Compare the result with your current plan. For two targets, keep the first balance and age, then enter a second at a different age. Apply a result only if you want to update the shared plan.", limit: "Results use a constant real return and flat annual net spending in today's dollars. Pool A is one part of your investments. V23 keeps your separate age-band plan." },
  explore: { use: "Choose an illustration or income view, then select an age to inspect the same active plan.", read: "Use Income by year for funding and the exact table for annual values; return comparison changes the assumed return, not the odds.", limit: "Visual shapes and return sensitivities are model outputs, not forecasts." },
  compare: { use: "Compare the labelled preset cards under the active return and target-age assumptions; select a card only if you want its spend and rail.", read: "Read spending, capital and gross estate together. The simulated frequency is the share of this model's sampled paths above its stated threshold.", limit: "The presets express different preferences. A higher capital result can come from spending less." },
  frontier: { use: "Move the flat spending point and choose the comparison age.", read: "Read the investment-capital cost of additional spending alongside gross estate, which adds the selected home value.", limit: "The coloured investment bands and property-inclusive estate floor answer different questions; neither is a personal guarantee." },
  surface: { use: "Compare the two withdrawal rules for your current plan. Tap a point to preview both rules with another spending amount and return.", read: "Check spending funded and any shortfall alongside the investment balance at your selected age. Holding Pool C in reserve is the same rule Lab uses.", limit: "The chart uses Pool C for spending gaps and marks shortfalls in grey. Applying a point updates spending and return. Each tab uses its own withdrawal rule." },
  risk: { use: "Keep the same plan while varying volatility, return sequence or stress inputs.", read: "Inspect the percentile fan and exact target test; compare lower-tail outcomes with spending shortfalls.", limit: "Sample frequencies depend on the chosen model, volatility and seed. They omit unmodelled future events." },
};

const FRONTIER_SPENDS = [90_000, 100_000, 110_000, 120_000, 130_000];
const RETURNS = [0.04, 0.05, 0.065];
const VR_AGES = [57, 58, 59, 60] as const;
const VR_AGE_FACTORS: Record<number, { abmRatio: number; pcf: number }> = {
  57: { abmRatio: 0.907, pcf: 11.6 },
  58: { abmRatio: 0.938, pcf: 11.4 },
  59: { abmRatio: 0.969, pcf: 11.2 },
  60: { abmRatio: 1, pcf: 11 },
};
const VR_CURRENT_SALARY = 143_099;
const VR_PACKAGE_WEEKS = 48;

function definedBenefitAt60(rail: Rail) {
  const pensionShare = rail.pensionPercent / 100;
  const lumpShare = rail.lumpPercent / 100;
  if (pensionShare > 0) return rail.grossPension * 11 / pensionShare;
  if (lumpShare > 0) return rail.lumpSum / lumpShare;
  return rail.fas * 10;
}

function vrScenarioPath(rail: Rail, _basis: PssProjectionBasis, realReturn: number, age: number, mode: VrMode): VrScenario {
  const factors = VR_AGE_FACTORS[age] ?? VR_AGE_FACTORS[60];
  const years = Math.max(0, 60 - age);
  const pensionShare = rail.pensionPercent / 100;
  const lumpShare = rail.lumpPercent / 100;
  const definedAt60 = definedBenefitAt60(rail);
  const definedAtExit = definedAt60 * factors.abmRatio;
  // Every rail is already a CPI-reduced, today-dollar provider result. Keep the
  // VR bridge on that same price basis: indexed pension is flat in real terms,
  // while investable cash compounds only at the selected real return.
  const investmentGrowth = Math.pow(1 + realReturn, years);
  const vrCashAtExit = age < 60 ? VR_CURRENT_SALARY * VR_PACKAGE_WEEKS / 52 : 0;
  const vrCashAt60 = vrCashAtExit * investmentGrowth;
  const pensionStart = age === 60 ? rail.grossPension : definedAtExit * pensionShare / factors.pcf;
  const immediatePension60 = pensionStart;
  const immediateLumpAtExit = age === 60 ? rail.lumpSum : definedAtExit * lumpShare;
  const preservedDefinedAt60 = definedAtExit;
  const preservedPension60 = age === 60 ? rail.grossPension : preservedDefinedAt60 * pensionShare / 11;
  const preservedLumpAt60 = age === 60 ? rail.lumpSum : preservedDefinedAt60 * lumpShare;
  const pension60 = mode === "immediate" ? immediatePension60 : preservedPension60;
  const pssLumpAtExit = mode === "immediate" ? immediateLumpAtExit : 0;
  const pssLumpAt60 = mode === "immediate" ? immediateLumpAtExit * investmentGrowth : preservedLumpAt60;
  const tbcPension = mode === "immediate" ? pensionStart : pension60;
  const tbcCredit = tbcPension * 16;
  const headroom = Math.max(0, TBC - tbcCredit);
  const superEligibleAt60 = rail.hostplus + pssLumpAt60;
  const potentialAbpAt60 = Math.min(superEligibleAt60, Math.max(0, headroom - TSB_BUFFER));
  const pre60GrossPension = mode === "immediate"
    ? pensionStart * years
    : 0;
  return {
    age,
    mode,
    abmRatio: factors.abmRatio,
    pensionStart: mode === "immediate" ? pensionStart : 0,
    pension60,
    netPf60: rail.grossPension > 0 ? pension60 * (rail.netPension / rail.grossPension) / 26 : 0,
    pssLumpAtExit,
    pssLumpAt60,
    vrCashAtExit,
    vrCashAt60,
    pre60GrossPension,
    tbcCredit,
    headroom,
    superEligibleAt60,
    potentialAbpAt60,
    superOutsideAbp: Math.max(0, superEligibleAt60 - potentialAbpAt60),
    flexibleCapitalAt60: pssLumpAt60 + vrCashAt60,
  };
}

const SOURCES = [
  ["00_READ_FIRST_RETIREMENT_BASELINE_2026-09-09.md", "Authority map", "Current"],
  ["Robinson_Retirement_Master_2026-09-09.md", "Dual-rail master reference", "Authoritative"],
  ["Robinson_Retirement_Spending_Estate_Frontier_Analysis_2026-07-18.md", "Historical Rail B spending / estate research", "Superseded inputs"],
  ["Robinson_Retirement_V23_Workbench_OFFLINE.html", "2 September offline reference snapshot", "Reference"],
  ["Robinson_Retirement_ModelV5.0_Baseline_2026-07-18.xlsx", "Historical three-pool optimiser workbook", "Rail A mechanics"],
  ["PSS_Defined_Benefit_Calculator_V8_Baseline_2026-07-18.xlsx", "Historical net-pension calculator", "Rail A mechanics"],
  ["00_SUPPLEMENTARY/PSS_Source_Docs/README_CURRENT_SOURCE_STATUS_2026-09-09.md", "Current PSS source and evidence-status guide", "Current"],
  ["00_SUPPLEMENTARY/PSS_Source_Docs/i-Estimator-1-9-2026_60-40.pdf", "September 60/40 election source", "Rail B source"],
  ["00_SUPPLEMENTARY/PSS_Source_Docs/i-Estimator-1-9-2026_65-35.pdf", "September 65/35 election source", "Rail B source"],
  ["00_SUPPLEMENTARY/PSS_Source_Docs/i-Estimator-1-9-2026_70-30.pdf", "September 70/30 election source", "Rail B source"],
  ["00_SUPPLEMENTARY/PSS_Source_Docs/i-Estimator-1-9-2026_100percent.pdf", "September 100% pension election source", "Rail B source"],
  ["00_SUPPLEMENTARY/PSS_Source_Docs/i-Estimator-1-9-2026-diffCPIandReturns-60-40.pdf", "Prudent 6/5/3 September 60/40 election source", "Rail B source"],
  ["00_SUPPLEMENTARY/PSS_Source_Docs/i-Estimator-1-9-2026-diffCPIandReturns-65-35.pdf", "Prudent 6/5/3 September 65/35 election source", "Rail B source"],
  ["00_SUPPLEMENTARY/PSS_Source_Docs/i-Estimator-1-9-2026-diffCPIandReturns-70-30.pdf", "Prudent 6/5/3 September 70/30 election source", "Rail B source"],
  ["00_SUPPLEMENTARY/PSS_Source_Docs/i-Estimator 2026Aug29_100--6-5-3.pdf", "9 September prudent 100% pension source; filename retains its Aug29 label", "Rail B source"],
  ["00_SUPPLEMENTARY/PSS_Source_Docs/Paystub_2026_09_09.pdf", "Latest payroll evidence: $143,099 salary, $138,394 PSS super salary and $2,908.56 net after payroll deductions", "Supporting evidence"],
  ["00_SUPPLEMENTARY/PSS_Source_Docs/Paystub_2026_08_26.pdf", "Prior payroll and backpay evidence supporting the corrected salary lineage", "Supporting evidence"],
  ["00_SUPPLEMENTARY/PSS_Source_Docs/PSS_Annual_Statement_2025_2025-12-20.pdf", "Prior FAS, ABM and benefit components", "Historical source"],
  ["00_SUPPLEMENTARY/PSS_Source_Docs/Statement 2026.pdf", "Annual statement still reports the superseded $131,437 birthday salary; retain as disputed until CSC reissues", "Pending reissue"],
  ["00_SUPPLEMENTARY/Research_Reports/Robinson_PSSDB_VR_Deep_Research_2026-07-18.md", "VR mechanics and models", "Specialist"],
  ["00_SUPPLEMENTARY/Research_Reports/Robinson_NCC_Wash_Drawdown_Research_2026-07-18.md", "NCC wash and draw sequencing", "Specialist"],
  ["00_SUPPLEMENTARY/Research_Reports/Australian_Salary_Net_Gross_Analysis_2026-07-18.md", "Salary-equivalent bridge", "Reference"],
  ["00_SUPPLEMENTARY/Research_Reports/Robinson_Global_Position_Deep_Analysis_2026-07-18.md", "Comparative retirement position", "Reference"],
  ["00_SUPPLEMENTARY/Research_Reports/Robinson_Source_Folder_Recheck_2026-09-09.md", "Reconciliation and mismatch audit", "Audit"],
  ["00_SUPPLEMENTARY/Research_Reports/Retirement_Analysis_AU_US_UK_2026-05-31.pdf", "International system comparison", "Reference"],
  ["03-Robinson_Retirement_App_Link_2026-07-18.txt", "Current published site links", "Current"],
];

const fmt = new Intl.NumberFormat("en-AU", { style: "currency", currency: "AUD", maximumFractionDigits: 0 });
const fmt1 = new Intl.NumberFormat("en-AU", { style: "currency", currency: "AUD", maximumFractionDigits: 1 });
const pct = (n: number, d = 0) => `${(n * 100).toFixed(d)}%`;
const money = (n: number) => fmt.format(Number.isFinite(n) ? n : 0);
const compactMoney = (n: number) => n >= 1_000_000 ? `$${(n / 1_000_000).toFixed(2)}m` : `$${Math.round(n / 1_000)}k`;
const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

function normaliseCommandPlan(candidate: Partial<ScenarioState>): ScenarioState {
  const basis = normaliseProjectionBasis(candidate.pssProjectionBasis);
  const finite = (value: unknown, fallback: number) => (
    (typeof value === "number" || typeof value === "string" && value.trim() !== "") && Number.isFinite(Number(value))
      ? Number(value) : fallback
  );
  return {
    rail: candidate.rail === "A" ? "A" : "B",
    pssElection: normaliseElectionForBasis(basis, candidate.pssElection),
    pssProjectionBasis: basis,
    spend: commandCentreSpend(finite(candidate.spend, 110_000)),
    realReturn: clamp(finite(candidate.realReturn, .05), .02, .075),
    targetAge: Math.round(clamp(finite(candidate.targetAge, 75), 70, 95)),
    homeValue: clamp(finite(candidate.homeValue, HOME_BASELINE), 300_000, 1_000_000),
    taxYear: candidate.taxYear === "2027-28" ? "2027-28" : "2026-27",
    liquidityMonths: Math.round(clamp(finite(candidate.liquidityMonths, 12), 0, 24)),
    simulationSeed: Math.round(clamp(finite(candidate.simulationSeed, 20260814), 1, 2_147_483_647)),
  };
}
const THEME_STORAGE_KEY = "robinson-retirement-theme";

function normaliseTheme(value: string | null | undefined): Theme | null {
  return value === "light" || value === "dark" ? value : null;
}

function initialTheme(): Theme {
  if (typeof window === "undefined") return "dark";
  const queryTheme = normaliseTheme(new URLSearchParams(window.location.search).get("theme"));
  if (queryTheme) return queryTheme;
  try {
    return normaliseTheme(window.localStorage.getItem(THEME_STORAGE_KEY))
      ?? normaliseTheme(window.localStorage.getItem("robinson-atlas-theme"))
      ?? "dark";
  } catch {
    return "dark";
  }
}

function siteAsset(path: string) {
  const cleanPath = path.replace(/^\/+/, "");
  return `./${cleanPath}`;
}

const COMPARISON_PLANS: Record<string, ComparisonPlan> = {
  baseline: { label: "Balanced baseline", intent: "Central lifestyle and estate compromise", rail: "B", spend: 110_000 },
  lifestyle: { label: "Lifestyle-led", intent: "More active-retirement spending", rail: "B", spend: 130_000 },
  estate: { label: "Estate-first", intent: "Lower draw and conservative rail", rail: "A", spend: 90_000 },
};

function sharedScenarioParams(scenario: ScenarioState, theme?: Theme) {
  const params = new URLSearchParams({
    shared: "1",
    rail: scenario.rail,
    pss: scenario.pssElection,
    basis: scenario.pssProjectionBasis,
    spend: String(Math.round(scenario.spend)),
    return: String(scenario.realReturn),
    age: String(scenario.targetAge),
    home: String(Math.round(scenario.homeValue)),
    taxYear: scenario.taxYear,
    reserveMonths: String(scenario.liquidityMonths),
    seed: String(scenario.simulationSeed),
  });
  if (theme) params.set("theme", theme);
  return params.toString();
}

function sharedPageUrl(path: string, scenario: ScenarioState, theme?: Theme) {
  return `${siteAsset(path)}${path.includes("?") ? "&" : "?"}${sharedScenarioParams(scenario, theme)}`;
}

function seededGenerator(seed: number) {
  let state = seed >>> 0;
  return () => {
    state ^= state << 13; state ^= state >>> 17; state ^= state << 5;
    return (state >>> 0) / 4_294_967_296;
  };
}

function normalSample(random: () => number) {
  const u = Math.max(1e-9, random());
  const v = Math.max(1e-9, random());
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

function quantile(values: number[], q: number) {
  const ordered = [...values].sort((a, b) => a - b);
  const index = Math.min(ordered.length - 1, Math.max(0, Math.round((ordered.length - 1) * q)));
  return ordered[index] ?? 0;
}

function monteCarloFan(rail: Rail, spend: number, mean: number, taxYear: TaxYear, volatility = 0.12, runs = 600, seed = 20260814, essentials: number | null = null) {
  const ages = Array.from({ length: 36 }, (_, index) => 60 + index);
  const paths = Array.from({ length: ages.length }, () => [] as number[]);
  const funding = fundingPathCounts(ages.length);
  for (let run = 0; run < runs; run += 1) {
    const random = seededGenerator(seed + run * 7_919 + Math.round(rail.capital));
    const annualReturns: number[] = [];
    for (let year = 1; year < ages.length; year += 1) {
      const sampledReturn = clamp(mean + volatility * normalSample(random), -0.55, 0.45);
      annualReturns.push(sampledReturn);
    }
    // Risk paths need balances, not the table's salary-equivalent formatting.
    const path = calculateCanonicalFlatRetirementLedger({
      poolA: rail.poolA, poolC: rail.poolC, netPension: rail.netPension,
      spend, realReturn: mean, poolCDrag: POOL_C_DRAG, annualReturns,
    });
    path.forEach((row, year) => paths[year].push(row.ending));
    countFundingPath(funding, path.map(row => ({
      age: row.age, capital: row.ending, planned: row.spend, funded: row.fundedSpend,
    })), 500_000, essentials);
  }
  return {
    ages,
    p10: paths.map((values) => quantile(values, 0.10)),
    p25: paths.map((values) => quantile(values, 0.25)),
    p50: paths.map((values) => quantile(values, 0.50)),
    p75: paths.map((values) => quantile(values, 0.75)),
    p90: paths.map((values) => quantile(values, 0.90)),
    paths,
    funding,
  };
}

function endingWithShock(rail: Rail, spend: number, mean: number, targetAge: number, shockAge: number, shock: number, taxYear: TaxYear) {
  const annualReturns = Array.from({ length: 35 }, (_, index) => 61 + index === shockAge ? shock : mean);
  return ledgerEndingAtAge(rail, spend, mean, targetAge, taxYear, annualReturns);
}

function incomeTax(gross: number, year: TaxYear) {
  const lowerRate = year === "2026-27" ? 0.15 : 0.14;
  let tax = 0;
  if (gross > 18_200) tax += (Math.min(gross, 45_000) - 18_200) * lowerRate;
  if (gross > 45_000) tax += (Math.min(gross, 135_000) - 45_000) * 0.30;
  if (gross > 135_000) tax += (Math.min(gross, 190_000) - 135_000) * 0.37;
  if (gross > 190_000) tax += (gross - 190_000) * 0.45;
  return Math.max(0, tax);
}

function salaryNet(gross: number, year: TaxYear) {
  return gross - incomeTax(gross, year) - gross * 0.02;
}

function grossForNet(target: number, year: TaxYear) {
  let lo = target;
  let hi = 500_000;
  for (let i = 0; i < 70; i += 1) {
    const mid = (lo + hi) / 2;
    if (salaryNet(mid, year) < target) lo = mid; else hi = mid;
  }
  return hi;
}

function drawRate(age: number) {
  // The row ends on this birthday; do not step the planning rate up early.
  return abpMinimumRateAtAgeOn1July(Math.max(0, age - 1));
}

function operationalLedger(rail: Rail, spend: number, realReturn: number, taxYear: TaxYear, annualReturns?: number[]) {
  return calculateCanonicalFlatRetirementLedger({
    poolA: rail.poolA,
    poolC: rail.poolC,
    netPension: rail.netPension,
    spend,
    realReturn,
    poolCDrag: POOL_C_DRAG,
    startAge: 60,
    endAge: 95,
    annualReturns,
  }).map((row) => {
    if (row.isOpening) {
      return {
        year: "Opening position",
        period: "21 Dec 2033",
        ageLabel: "60",
        age: row.age,
        isOpening: true,
        opening: row.opening,
        pension: 0,
        accumulation: 0,
        abp: row.poolA,
        poolC: row.poolC,
        draw: 0,
        spend: 0,
        fundedSpend: 0,
        shortfall: 0,
        reinvestment: 0,
        tax: 0,
        investmentGrowth: 0,
        netIncome: 0,
        grossEquivalent: 0,
        ending: row.ending,
      };
    }
    const startYear = 2033 + row.age - 61;
    return {
      year: `Year ${row.age - 60}`,
      period: `21 Dec ${startYear} → 21 Dec ${startYear + 1}`,
      ageLabel: `${row.age - 1}→${row.age}`,
      age: row.age,
      isOpening: false,
      opening: row.opening,
      pension: row.pension,
      accumulation: 0,
      abp: row.poolA,
      poolC: row.poolC,
      draw: row.draw,
      spend: row.spend,
      fundedSpend: row.fundedSpend,
      shortfall: row.shortfall,
      reinvestment: row.reinvestment,
      tax: row.externalTaxDrag,
      investmentGrowth: row.investmentGrowth,
      netIncome: row.netIncome,
      grossEquivalent: grossForNet(row.netIncome, taxYear),
      ending: row.ending,
    };
  });
}

function ledgerEndingAtAge(rail: Rail, spend: number, realReturn: number, targetAge: number, taxYear: TaxYear = "2026-27", annualReturns?: number[]) {
  const rows = operationalLedger(rail, spend, realReturn, taxYear, annualReturns);
  return rows.find((row) => row.age === targetAge)?.ending ?? rows[rows.length - 1]?.ending ?? rail.capital;
}

function contributionWhatIf(phase2: number, phase3: number, nominalReturn: number) {
  return projectHostplusAt60(phase2, phase3, nominalReturn);
}

/* ---------------------------------------------------------------------------
   Scenario instruments — shared reads of the canonical ledger.
   Nothing here introduces retirement arithmetic: every number is produced by
   calculateFlatRetirementLedger in app/retirement-core.ts, or by inverting it
   numerically. Pool A is the only pool the flat ledger ever draws from, so it
   is the series these instruments plot.
--------------------------------------------------------------------------- */
type PoolPath = { age: number; poolA: number; poolC: number; total: number };

function poolPath(rail: Rail, spend: number, realReturn: number, annualReturns?: number[]): PoolPath[] {
  return calculateCanonicalFlatRetirementLedger({
    poolA: rail.poolA,
    poolC: rail.poolC,
    netPension: rail.netPension,
    spend,
    realReturn,
    poolCDrag: POOL_C_DRAG,
    startAge: 60,
    endAge: 95,
    annualReturns,
  }).map((row) => ({ age: row.age, poolA: row.poolA, poolC: row.poolC, total: row.ending }));
}

function poolAAtAge(rail: Rail, spend: number, realReturn: number, age: number) {
  const index = clamp(Math.round(age) - 60, 0, 35);
  return poolPath(rail, spend, realReturn)[index]?.poolA ?? 0;
}

/* The highest Pool A path available at a given return: spend only what the
   pension plus the statutory minimum draw already delivers. */
function poolACeilingPath(rail: Rail, realReturn: number) {
  return poolPath(rail, rail.netPension, realReturn);
}

/* At or below this spend the statutory minimum draw already covers the
   lifestyle gap, so every spend produces one identical Pool A path. */
function deadZoneCeiling(rail: Rail) {
  return rail.netPension + rail.poolA * drawRate(61);
}

/* Pool A at `age` falls monotonically in spend, so bisection is exact. */
function solveSpendForPoolA(rail: Rail, age: number, target: number, realReturn: number) {
  let lo = rail.netPension;
  let hi = 900_000;
  for (let i = 0; i < 60; i += 1) {
    const mid = (lo + hi) / 2;
    if (poolAAtAge(rail, mid, realReturn, age) > target) lo = mid; else hi = mid;
  }
  return (lo + hi) / 2;
}

function solveReturnForPoolA(rail: Rail, age: number, target: number, spend: number) {
  let lo = -0.08;
  let hi = 0.25;
  for (let i = 0; i < 60; i += 1) {
    const mid = (lo + hi) / 2;
    if (poolAAtAge(rail, spend, mid, age) < target) lo = mid; else hi = mid;
  }
  return (lo + hi) / 2;
}

/* The spend interval over which Pool A at `age` actually moves. Outside it the
   answer is either the statutory ceiling or zero, and solving is ill-posed. */
function liveSpendBand(rail: Rail, age: number, realReturn: number) {
  const ceiling = poolAAtAge(rail, rail.netPension, realReturn, age);
  if (ceiling <= 0.5) return null;
  return {
    ceiling,
    lo: solveSpendForPoolA(rail, age, ceiling - 1, realReturn),
    hi: solveSpendForPoolA(rail, age, 0.5, realReturn),
  };
}

/* Pin one Pool A level, then scan spend for a second level the same plan hits.
   The return solve is only valid over part of the spend range, so this looks
   for a bracketing pair of VALID samples instead of trusting the interval ends. */
type JointSolution =
  | { ok: true; spend: number; realReturn: number }
  | { ok: false; reason: "contradictory"; min: number; max: number; sampled: number };

function solveSpendAndReturn(rail: Rail, pin: { age: number; value: number }, point: { age: number; value: number }): JointSolution {
  const residual = (candidateSpend: number) => {
    const candidateReturn = solveReturnForPoolA(rail, pin.age, pin.value, candidateSpend);
    if (candidateReturn <= -0.0795 || candidateReturn >= 0.2495) return Number.NaN;
    return poolAAtAge(rail, candidateSpend, candidateReturn, point.age) - point.value;
  };
  const low = rail.netPension + 1;
  const high = 700_000;
  const samples = 96;
  const xs: number[] = [];
  const fs: number[] = [];
  for (let i = 0; i <= samples; i += 1) {
    const share = i / samples;
    const candidate = low + (high - low) * share * share;
    xs.push(candidate);
    fs.push(residual(candidate));
  }
  let lo: number | null = null;
  let hi = 0;
  let fLo = 0;
  let previous = -1;
  for (let i = 0; i <= samples; i += 1) {
    if (Number.isNaN(fs[i])) continue;
    if (previous >= 0 && fs[previous] * fs[i] < 0) { lo = xs[previous]; fLo = fs[previous]; hi = xs[i]; break; }
    previous = i;
  }
  if (lo === null) {
    let min = Infinity;
    let max = -Infinity;
    let sampled = 0;
    for (let i = 0; i <= samples; i += 1) {
      if (Number.isNaN(fs[i])) continue;
      sampled += 1;
      const value = fs[i] + point.value;
      if (value < min) min = value;
      if (value > max) max = value;
    }
    return { ok: false, reason: "contradictory", min: Number.isFinite(min) ? min : 0, max: Number.isFinite(max) ? max : 0, sampled };
  }
  let left = lo;
  for (let i = 0; i < 60; i += 1) {
    const mid = (left + hi) / 2;
    const value = residual(mid);
    if (Number.isNaN(value)) break;
    if (fLo * value <= 0) hi = mid; else { left = mid; fLo = value; }
  }
  const solvedSpend = (left + hi) / 2;
  const solvedReturn = solveReturnForPoolA(rail, pin.age, pin.value, solvedSpend);
  if (solvedReturn <= -0.0795 || solvedReturn >= 0.2495) return { ok: false, reason: "contradictory", min: 0, max: 0, sampled: 0 };
  return { ok: true, spend: solvedSpend, realReturn: solvedReturn };
}

/* Read a theme token off a live element so canvas drawing follows light/dark. */
function themeInk(element: Element | null, token: string, fallback: string) {
  if (!element) return fallback;
  const value = getComputedStyle(element).getPropertyValue(token).trim();
  return value || fallback;
}

type SolveMode = "spend" | "ret" | "head" | "two";

const SOLVE_MODES: { key: SolveMode; label: string; hint: string }[] = [
  { key: "spend", label: "How much can I spend?", hint: "Set the Pool A balance you want at an age. The calculation keeps your current return and estimates annual spending." },
  { key: "ret", label: "What return would I need?", hint: "Set the Pool A balance you want at an age. The calculation keeps your current spending and estimates the return needed." },
  { key: "head", label: "Opening Pool A and pension", hint: "There is a limit on how much can start in your account-based pension. Set a desired opening Pool A at age 60 to compare the available PSS elections." },
  { key: "two", label: "Meet two balance goals", hint: "Keep a first balance and age, then enter a second at a different age. The calculation searches for a spending and return combination to meet both." },
];

function InverseSolveLab({ rail, spend, realReturn, targetAge, electionOptions, onAdopt }: {
  rail: Rail;
  spend: number;
  realReturn: number;
  targetAge: number;
  electionOptions: { key: string; label: string; grossPension: number; poolA: number }[];
  onAdopt: (next: { spend?: number; realReturn?: number }) => void;
}) {
  const [mode, setMode] = useState<SolveMode>("spend");
  const [age, setAge] = useState(targetAge);
  const [target, setTarget] = useState<number | null>(null);
  const [pin, setPin] = useState<{ age: number; value: number } | null>(null);
  const [dragging, setDragging] = useState(false);
  const [ageInput, setAgeInput] = useState(String(targetAge));
  const [balanceInput, setBalanceInput] = useState("");
  const [inputError, setInputError] = useState("");
  const svgRef = useRef<SVGSVGElement>(null);

  useEffect(() => {
    if (mode !== "head") {
      setAge(targetAge);
      setAgeInput(String(targetAge));
      setBalanceInput("");
      setTarget(null);
      setPin(null);
    }
  }, [targetAge]);

  const width = 920;
  const height = 332;
  const pad = { l: 94, r: 30, t: 24, b: 48 };
  const ceiling = useMemo(() => poolACeilingPath(rail, realReturn), [rail, realReturn]);
  const planPath = useMemo(() => poolPath(rail, spend, realReturn), [rail, spend, realReturn]);
  const band = useMemo(() => liveSpendBand(rail, age, realReturn), [rail, age, realReturn]);
  const deadZone = deadZoneCeiling(rail);
  const scale = Math.max(1, ...ceiling.map((row) => row.poolA)) * 1.08;

  const xAge = (value: number) => pad.l + ((clamp(value, 60, 95) - 60) / 35) * (width - pad.l - pad.r);
  const yValue = (value: number) => pad.t + (1 - clamp(value, 0, scale) / scale) * (height - pad.t - pad.b);
  const ageAt = (x: number) => Math.round(clamp(60 + ((x - pad.l) / (width - pad.l - pad.r)) * 35, 61, 95));
  const valueAt = (y: number) => clamp((1 - (y - pad.t) / (height - pad.t - pad.b)) * scale, 0, scale);
  const pathLine = (rows: PoolPath[]) => rows.map((row) => `${xAge(row.age).toFixed(1)},${yValue(row.poolA).toFixed(1)}`).join(" ");
  const ceilingAt = (atAge: number) => ceiling[clamp(atAge - 60, 0, 35)]?.poolA ?? 0;

  const solved = useMemo(() => {
    if (target === null) return null;
    const headroomFactor = rail.grossPension > 0 ? rail.dbSpecialValue / rail.grossPension : 16;
    if (mode === "head") {
      const requiredGross = (TRANSFER_BALANCE_CAP - TRANSFER_BALANCE_BUFFER - target) / headroomFactor;
      const clearing = electionOptions.filter((option) => option.poolA + 0.5 >= target);
      return {
        kind: "head" as const,
        requiredGross,
        clearing,
      };
    }
    const reachable = ceilingAt(age);
    if (target > reachable + 1 && mode === "spend") {
      return {
        kind: "unreachable" as const,
        reachable,
        message: `At your current ${pct(realReturn, 2)} real return, Pool A reaches at most ${money(reachable)} at age ${age} when only the minimum pension withdrawal is taken. Try a lower Pool A goal or explore a different return.`,
      };
    }
    if (mode === "spend") {
      if (target <= 0.5) return { kind: "empty" as const };
      if (target >= reachable - 1) return { kind: "ceiling" as const, reachable };
      const solvedSpend = solveSpendForPoolA(rail, age, target, realReturn);
      return { kind: "spend" as const, spend: solvedSpend, path: poolPath(rail, solvedSpend, realReturn) };
    }
    if (mode === "ret") {
      if (target <= 0.5) return { kind: "empty" as const };
      const solvedReturn = solveReturnForPoolA(rail, age, target, spend);
      const pinnedToEdge = solvedReturn <= -0.0795 || solvedReturn >= 0.2495;
      return { kind: "ret" as const, realReturn: solvedReturn, pinnedToEdge, path: poolPath(rail, spend, solvedReturn) };
    }
    if (!pin) return { kind: "needpin" as const };
    if (age === pin.age) return { kind: "sameage" as const };
    if (target <= 0.5 || pin.value <= 0.5) return { kind: "joint-empty" as const };
    const joint = solveSpendAndReturn(rail, pin, { age, value: target });
    if (!joint.ok) return { kind: "joint-fail" as const, ...joint };
    return { kind: "two" as const, ...joint, path: poolPath(rail, joint.spend, joint.realReturn) };
  }, [mode, target, age, pin, rail, realReturn, spend, electionOptions, ceiling]);

  const exchange = useMemo(() => {
    if (spend <= deadZone) return null;
    const here = poolAAtAge(rail, spend, realReturn, age);
    if (here <= 0.5) return null;
    const richer = solveSpendForPoolA(rail, age, here, realReturn + 0.0025);
    return richer - spend;
  }, [rail, spend, realReturn, age, deadZone]);

  const point = (event: React.PointerEvent<SVGSVGElement>) => {
    const svg = svgRef.current;
    if (!svg) return null;
    const rect = svg.getBoundingClientRect();
    if (!rect.width || !rect.height) return null;
    return {
      x: ((event.clientX - rect.left) / rect.width) * width,
      y: ((event.clientY - rect.top) / rect.height) * height,
    };
  };

  const applyAt = (x: number, y: number) => {
    const nextAge = mode === "head" ? 60 : ageAt(x);
    const nextTarget = Math.round(valueAt(y));
    setAge(nextAge);
    setAgeInput(String(nextAge));
    setTarget(nextTarget);
    setBalanceInput(String(nextTarget));
    setInputError("");
  };

  const setGoal = (useCurrentPlan = false, keepFirst = false) => {
    const nextAge = mode === "head" ? 60 : Number(ageInput);
    if (mode !== "head" && (!ageInput.trim() || !Number.isInteger(nextAge) || nextAge < 61 || nextAge > 95)) {
      setInputError("Enter a whole age from 61 to 95.");
      return;
    }
    const nextTarget = useCurrentPlan
      ? Math.round(planPath[nextAge - 60]?.poolA ?? 0)
      : Number(balanceInput);
    if ((!useCurrentPlan && !balanceInput.trim()) || !Number.isFinite(nextTarget) || nextTarget < 0 || nextTarget > 10_000_000) {
      setInputError("Enter a Pool A balance from $0 to $10,000,000.");
      return;
    }
    setAge(nextAge);
    setAgeInput(String(nextAge));
    if (keepFirst) {
      setPin({ age: nextAge, value: nextTarget });
      setTarget(null);
      setBalanceInput("");
    } else {
      setTarget(nextTarget);
      setBalanceInput(String(nextTarget));
    }
    setInputError("");
  };

  const handleDown = (event: React.PointerEvent<SVGSVGElement>) => {
    const at = point(event);
    if (!at) return;
    setDragging(true);
    try { event.currentTarget.setPointerCapture(event.pointerId); } catch { /* pointer already released */ }
    applyAt(at.x, at.y);
  };

  const handleMove = (event: React.PointerEvent<SVGSVGElement>) => {
    if (!dragging) return;
    const at = point(event);
    if (at) applyAt(at.x, at.y);
  };

  const endDrag = () => setDragging(false);

  const nudge = (event: React.KeyboardEvent<SVGSVGElement>) => {
    if (target === null) return;
    const step = event.shiftKey ? scale / 20 : scale / 120;
    if (event.key === "ArrowUp" || event.key === "ArrowDown") {
      const nextTarget = Math.round(clamp(target + (event.key === "ArrowUp" ? step : -step), 0, scale));
      setTarget(nextTarget);
      setBalanceInput(String(nextTarget));
      event.preventDefault();
    }
    if ((event.key === "ArrowLeft" || event.key === "ArrowRight") && mode !== "head") {
      const nextAge = clamp(age + (event.key === "ArrowRight" ? 1 : -1), 61, 95);
      setAge(nextAge);
      setAgeInput(String(nextAge));
      event.preventDefault();
    }
  };

  const adoptSpend = (value: number) => {
    if (value < 76_000 || value > MAX_FLAT_SPEND) return;
    onAdopt({ spend: Math.round(value) });
  };
  const adoptReturn = (value: number) => {
    if (value < 0.02 || value > 0.075) return;
    onAdopt({ realReturn: Number(value.toFixed(4)) });
  };

  const solvedPath = solved && "path" in solved ? solved.path : null;
  const activeMode = SOLVE_MODES.find((item) => item.key === mode)!;
  const draftAge = mode === "head" ? 60 : Number(ageInput);
  const currentAtDraftAge = Number.isInteger(draftAge) && draftAge >= 60 && draftAge <= 95 ? planPath[draftAge - 60]?.poolA : undefined;

  return <section className="panel solve-lab">
    <div className="panel-head">
      <div>
        <h3>Solve and spend</h3>
        <p>Start with an amount you would like left in Pool A, then explore what your plan would need to reach it. Pool A is your account-based pension investment pool.</p>
      </div>
      <Badge tone="modelled">Explore a goal</Badge>
    </div>
    <div className="instrument-bar" role="group" aria-label="Choose a question">
      <span className="instrument-label">Choose a question</span>
      {SOLVE_MODES.map((item) => <button
        key={item.key}
        type="button"
        className={mode === item.key ? "active" : ""}
        aria-pressed={mode === item.key}
        onClick={() => { if (mode === item.key) return; const nextAge = item.key === "head" ? 60 : targetAge; setMode(item.key); setAge(nextAge); setAgeInput(String(nextAge)); setBalanceInput(""); setTarget(null); setPin(null); setInputError(""); }}
      >{item.label}</button>)}
    </div>
    <p className="solve-question">{activeMode.hint}</p>
    <p className="solve-context">Current plan: {money(spend)} net spending a year · {pct(realReturn, 2)} real return after inflation · Command Centre target age {targetAge} · {rail.electionLabel}. {currentAtDraftAge !== undefined && `Pool A at age ${draftAge}: ${money(currentAtDraftAge)}.`}</p>
    {mode === "two" && <div className="solve-step">
      {pin ? <><b>Step 2 of 2. First goal kept: {money(pin.value)} at age {pin.age}.</b> Enter a second goal at a different age and calculate. <button type="button" className="text-button" onClick={() => { setPin(null); setTarget(null); setBalanceInput(""); }}>Start again</button></>
        : <><b>Step 1 of 2.</b> Enter the first balance and age, then select “Keep first goal”.</>}
    </div>}
    <form className="solve-inputs" onSubmit={(event) => { event.preventDefault(); setGoal(false, mode === "two" && !pin); }}>
      {mode !== "head" && <label>Age for this goal<input type="number" min={61} max={95} step={1} value={ageInput} onChange={(event) => { setAgeInput(event.target.value); setTarget(null); setInputError(""); }} /></label>}
      <label>Desired Pool A balance ($)<input type="number" min={0} max={10_000_000} step={1} inputMode="numeric" value={balanceInput} placeholder={currentAtDraftAge === undefined ? "Enter an amount" : String(Math.round(currentAtDraftAge))} onChange={(event) => { setBalanceInput(event.target.value); setTarget(null); setInputError(""); }} /></label>
      <div className="solve-actions"><button type="submit" className="primary">{mode === "two" && !pin ? "Keep first goal" : "Calculate"}</button><button type="button" className="secondary" onClick={() => setGoal(true)}>Use current plan balance</button></div>
    </form>
    {inputError && <p className="solve-error" role="alert">{inputError}</p>}
    <p className="solve-chart-help">You can also click or drag on the chart to set the age and balance. The grey line shows your current plan; the green line shows a calculated plan. The dashed line shows Pool A with minimum withdrawals at your current return.</p>
    <div className="chart-shell">
      <svg
        ref={svgRef}
        viewBox={`0 0 ${width} ${height}`}
        className="solve-canvas"
        role="application"
        tabIndex={0}
        aria-label={`Pool A trajectory from age 60 to 95. Drag to set a target balance; arrow keys nudge it. Currently solving ${activeMode.label}.`}
        onPointerDown={handleDown}
        onPointerMove={handleMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
        onKeyDown={nudge}
      >
        <defs>
          <linearGradient id="solve-reachable" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stopColor="var(--blue)" stopOpacity=".18" />
            <stop offset="100%" stopColor="var(--blue)" stopOpacity=".02" />
          </linearGradient>
        </defs>
        {[0, .25, .5, .75, 1].map((fraction) => <g key={fraction}>
          <line x1={pad.l} x2={width - pad.r} y1={yValue(scale * fraction)} y2={yValue(scale * fraction)} stroke="var(--line)" />
          <text x={pad.l - 10} y={yValue(scale * fraction) + 4} textAnchor="end" fontSize="10.5" fill="var(--muted)">{compactMoney(scale * fraction)}</text>
        </g>)}
        {[60, 65, 70, 75, 80, 85, 90, 95].map((tick) => <text key={tick} x={xAge(tick)} y={height - pad.b + 20} textAnchor="middle" fontSize="10.5" fill="var(--muted)">{tick}</text>)}
        <polygon points={`${xAge(60)},${yValue(0)} ${pathLine(ceiling)} ${xAge(95)},${yValue(0)}`} fill="url(#solve-reachable)" />
        <polyline points={pathLine(ceiling)} fill="none" stroke="var(--blue)" strokeWidth="1.5" strokeDasharray="5 4" />
        <polyline points={pathLine(planPath)} fill="none" stroke="var(--muted)" strokeWidth="2" />
        {solvedPath && <polyline points={pathLine(solvedPath)} fill="none" stroke="var(--green)" strokeWidth="2.6" />}
        {band && mode !== "head" && <line x1={xAge(age)} x2={xAge(age)} y1={pad.t} y2={height - pad.b} stroke="var(--muted)" strokeDasharray="3 4" opacity=".6" />}
        {pin && <g>
          <circle cx={xAge(pin.age)} cy={yValue(pin.value)} r="6" fill="none" stroke="var(--violet)" strokeWidth="2" />
          <text x={xAge(pin.age)} y={yValue(pin.value) - 12} textAnchor="middle" fontSize="10.5" fill="var(--violet)">pinned {compactMoney(pin.value)}</text>
        </g>}
        {target !== null && <g>
          <circle cx={xAge(age)} cy={yValue(target)} r="7" fill="var(--green)" stroke="var(--panel)" strokeWidth="2" />
          <text x={xAge(age) + (age > 88 ? -12 : 12)} y={yValue(target) - 10} textAnchor={age > 88 ? "end" : "start"} fontSize="11.5" fill="var(--text)">{money(target)} at {age}</text>
        </g>}
        <text x={pad.l} y={pad.t - 8} fontSize="10.5" fill="var(--blue)">minimum draw at current return</text>
        <g fontSize="10.5">
          <line x1={width - pad.r - 232} x2={width - pad.r - 216} y1={pad.t - 11} y2={pad.t - 11} stroke="var(--muted)" strokeWidth="2" />
          <text x={width - pad.r - 211} y={pad.t - 8} fill="var(--muted)">active plan</text>
          <line x1={width - pad.r - 128} x2={width - pad.r - 112} y1={pad.t - 11} y2={pad.t - 11} stroke="var(--green)" strokeWidth="2.6" />
          <text x={width - pad.r - 107} y={pad.t - 8} fill="var(--green)">solved plan</text>
        </g>
      </svg>
    </div>
    <div className="solve-readout" aria-live="polite">
      {target === null && <p className="solve-prompt">Enter a goal above or choose a point on the chart. Your active plan changes only when you apply a result.</p>}
      {target !== null && target > scale && <p className="solve-prompt">Your entered balance is above the chart's displayed range, so its marker is shown at the top. The calculation uses the amount you entered.</p>}
      {solved?.kind === "unreachable" && <div className="note warn"><b>Unreachable by spending.</b> {solved.message}</div>}
      {solved?.kind === "ceiling" && <div className="note"><b>Several spending amounts lead to this balance.</b> Pool A reaches approximately {money(solved.reachable)} at age {age} when the minimum withdrawal already covers the spending gap. {band ? `At this return, annual spending up to about ${money(band.lo)} produces the same Pool A balance.` : "Changing spending does not identify one answer here."} Any surplus withdrawal goes to Pool C.</div>}
      {solved?.kind === "empty" && <div className="note warn"><b>A zero balance does not identify one answer.</b> Pool A may reach zero before age {age} under many assumptions. Try a positive balance to compare a specific goal.</div>}
      {solved?.kind === "spend" && <div className="solve-kv">
        <div><span>Estimated net spending per year</span><b>{money(solved.spend)}</b><small>{`${solved.spend > spend ? "+" : ""}${money(solved.spend - spend)} compared with your current plan, holding the return at ${pct(realReturn, 2)} real`}</small></div>
        <div><span>Goal at age {age}</span><b>{money(target ?? 0)}</b><small>Pool A balance in today's dollars</small></div>
        <button type="button" className="secondary" disabled={solved.spend < 76_000 || solved.spend > MAX_FLAT_SPEND} onClick={() => adoptSpend(solved.spend)}>
          {solved.spend < 76_000 || solved.spend > MAX_FLAT_SPEND ? `Outside plan range ${money(76_000)}–${money(MAX_FLAT_SPEND)}` : "Apply this spending to my plan"}
        </button>
      </div>}
      {solved?.kind === "ret" && <div className="solve-kv">
        <div><span>Real return required</span><b>{solved.pinnedToEdge ? "No solution" : pct(solved.realReturn, 2)}</b><small>{solved.pinnedToEdge ? "Not reachable inside −8% to 25% real" : `holding ${money(spend)} a year`}</small></div>
        <div><span>Against your plan</span><b>{solved.pinnedToEdge ? "—" : `${solved.realReturn > realReturn ? "+" : ""}${((solved.realReturn - realReturn) * 100).toFixed(2)} pts`}</b><small>active assumption {pct(realReturn, 1)} real</small></div>
        <button type="button" className="secondary" disabled={solved.pinnedToEdge || solved.realReturn < 0.02 || solved.realReturn > 0.075} onClick={() => adoptReturn(solved.realReturn)}>
          {!solved.pinnedToEdge && solved.realReturn >= 0.02 && solved.realReturn <= 0.075 ? "Apply this return to my plan" : "Plan return range is 2%–7.5% real"}
        </button>
      </div>}
      {solved?.kind === "head" && <>
        <div className="solve-kv">
          <div><span>Desired opening Pool A</span><b>{money(target ?? 0)}</b><small>at age 60</small></div>
          <div><span>Indicative gross pension limit</span><b>{target === 0 ? "Not needed for a $0 goal" : solved.requiredGross >= 0 ? money(solved.requiredGross) : "Above the modelled cap"}</b><small>For a positive balance, this is the headroom test using the model's cap and buffer. Your current gross pension is {money(rail.grossPension)}.</small></div>
        </div>
        <div className={solved.clearing.length ? "note" : "note warn"}>
          <b>{solved.clearing.length ? `${solved.clearing.length} modelled election${solved.clearing.length > 1 ? "s meet" : " meets"} this opening goal.` : "None of the modelled elections meets this opening goal."}</b>{" "}
          These comparisons use each election's own pension and available capital. Changing an election can change both your pension and your lump sum. {rail.key === "A" && "The options below use the selected Rail B provider basis; your current Rail A is a historical comparison."}
          <div className="solve-elections">{electionOptions.map((option) => <div key={option.key}><b>{option.label}</b><span>Opening Pool A {money(option.poolA)} · gross pension {money(option.grossPension)} / year {option.poolA + 0.5 >= (target ?? 0) ? "· meets goal" : "· below goal"}</span></div>)}</div>
          Review the full pension, lump sum and Pool C together in PSS &amp; three pools before choosing an election.
        </div>
      </>}
      {solved?.kind === "needpin" && <p className="solve-prompt">Keep this first goal above, then choose your second balance and age.</p>}
      {solved?.kind === "sameage" && <div className="note warn">Choose a different age for the second goal. Two goals at the same age cannot identify a spending and return combination.</div>}
      {solved?.kind === "joint-empty" && <div className="note warn">Choose positive balances for both goals. A zero balance can mean Pool A ran out earlier, so it does not identify a unique combination.</div>}
      {solved?.kind === "joint-fail" && <div className="note warn">
        <b>No combination found in the search.</b> The first goal is {money(pin?.value ?? 0)} at age {pin?.age}; the second is {money(target ?? 0)} at age {age}. {solved.sampled > 0 ? `For ${solved.sampled} sampled spending levels that met the first goal, the second balance ranged from ${money(solved.min)} to ${money(solved.max)}.` : "The search found no sampled spending level that met the first goal within its return range."} Try changing one goal. The search samples combinations and can miss a narrow solution.
      </div>}
      {solved?.kind === "two" && <div className="solve-kv">
        <div><span>Estimated net spending per year</span><b>{money(solved.spend)}</b><small>for both balance goals</small></div>
        <div><span>Real return needed</span><b>{pct(solved.realReturn, 2)}</b><small>after inflation, held constant</small></div>
        <button type="button" className="secondary" disabled={solved.spend < 76_000 || solved.spend > MAX_FLAT_SPEND || solved.realReturn < 0.02 || solved.realReturn > 0.075} onClick={() => onAdopt({ spend: Math.round(solved.spend), realReturn: Number(solved.realReturn.toFixed(4)) })}>{solved.spend < 76_000 || solved.spend > MAX_FLAT_SPEND || solved.realReturn < 0.02 || solved.realReturn > 0.075 ? "Outside the plan control ranges" : "Apply both to my plan"}</button>
      </div>}
      {mode !== "head" && <details className="solve-details"><summary>More about the spending range and minimum withdrawals</summary><div className="solve-facts">
        <div><span>Spending range affecting Pool A at {age}</span><b>{band && band.hi - band.lo > 1 ? `${money(band.lo)} – ${money(band.hi)}` : "No range found"}</b><small>{band && band.hi - band.lo > 1 ? "At the current return, Pool A changes across this estimated annual spending range." : "There is no distinct positive Pool A range at this age under these assumptions."}</small></div>
        <div><span>Starting minimum-draw threshold</span><b>{money(deadZone)}</b><small>At the start, spending below this amount is covered by pension and the minimum Pool A withdrawal. A lower spend can leave more to reinvest in Pool C.</small></div>
        <div><span>Effect of a higher return</span><b>{exchange === null ? "Not available here" : `${money(exchange)}/yr`}</b><small>Estimated extra annual spend with a return 0.25 percentage points higher, while retaining the current Pool A balance at age {age}.</small></div>
      </div></details>}
    </div>
    <div className="note"><b>How to interpret this:</b> Results use the same annual model as the Lab, with flat net spending in today's dollars and a constant return after inflation. Pool A is one part of your investments; check Pool C and any spending shortfall in the Lab too. The return is an assumption, not a forecast. Applying a result updates the shared Command Centre plan, while your V23 age-band plan stays separate.</div>
  </section>;
}

type SurfaceMetric = "total-target" | "poolA-target" | "poolC-target" | "poolA-95" | "exhaustion" | "poolC-95";

const SURFACE_METRICS: { key: SurfaceMetric; label: string; unit: string }[] = [
  { key: "total-target", label: "Modelled investments at target age", unit: "$" },
  { key: "poolA-target", label: "Pool A at target age", unit: "$" },
  { key: "poolC-target", label: "Pool C at target age", unit: "$" },
  { key: "exhaustion", label: "Age Pool A runs out", unit: "age" },
  { key: "poolA-95", label: "Pool A at 95", unit: "$" },
  { key: "poolC-95", label: "Pool C at 95", unit: "$" },
];

const SURFACE_COLUMNS = 116;
const SURFACE_ROWS = 70;
const SURFACE_SPEND_LOW = 76_000;
const SURFACE_SPEND_HIGH = 200_000;
const SURFACE_RETURN_LOW = 0.02;
const SURFACE_RETURN_HIGH = 0.075;

function surfaceProjection(rail: Rail, spend: number, realReturn: number, targetAge: number, drawPoolCForShortfall = true) {
  const rows = calculateCanonicalFlatRetirementLedger({
    poolA: rail.poolA, poolC: rail.poolC, netPension: rail.netPension,
    spend, realReturn, poolCDrag: POOL_C_DRAG, startAge: 60, endAge: 95, drawPoolCForShortfall,
  });
  const target = rows[clamp(Math.round(targetAge) - 60, 0, 35)];
  const final = rows[35];
  const exhaustion = rows.find((row) => row.poolA <= 0.5);
  let firstShortfallAge: number | null = null;
  let poolCDrawn = 0;
  let funded = 0;
  let unfunded = 0;
  for (const row of rows) {
    if (firstShortfallAge === null && row.shortfall >= 0.01) firstShortfallAge = row.age;
    if (row.age > target.age) continue;
    poolCDrawn += row.poolCDraw ?? 0;
    funded += row.fundedSpend;
    unfunded += row.shortfall;
  }
  return {
    poolA: target.poolA, poolC: target.poolC, total: target.ending,
    poolA95: final.poolA, poolC95: final.poolC,
    firstShortfallAge, poolCDrawn, funded, unfunded,
    exhaustionAge: exhaustion?.age ?? null,
  };
}

function SurfaceWithdrawalComparison({ age, spend, withReserveDraw, withoutReserveDraw }: {
  age: number;
  spend: number;
  withReserveDraw: ReturnType<typeof surfaceProjection>;
  withoutReserveDraw: ReturnType<typeof surfaceProjection>;
}) {
  const policies = [
    { title: "Use Pool C to cover gaps", rule: "Chart rule. The pension and Pool A pay first, then Pool C covers any gap it can.", result: withReserveDraw },
    { title: "Keep Pool C in reserve", rule: "Lab rule. Spending comes from the pension and Pool A. Pool C stays invested.", result: withoutReserveDraw },
  ];
  return <div className="surface-policy-comparison" aria-label={`Withdrawal rules through age ${age}`}>
    <p>Same target of {money(spend)} a year. Spending figures cover age 60 to {age} in today's dollars.</p>
    <div className="surface-policy-grid">
      {policies.map(({ title, rule, result }) => {
        const gapAge = result.firstShortfallAge;
        const hasGap = gapAge !== null && gapAge <= age;
        return <section className="surface-policy" key={title}>
          <h4>{title}</h4>
          <p>{rule}</p>
          <p className={hasGap ? "surface-funding warn" : "surface-funding"}>{hasGap ? `Spending shortfall starts at age ${gapAge}` : `Full spending funded through age ${age}`}</p>
          <dl>
            <div><dt>Spending actually funded</dt><dd>{money(result.funded)}</dd></div>
            <div><dt>Spending left unfunded</dt><dd>{money(result.unfunded)}</dd></div>
            <div><dt>Withdrawn from Pool C</dt><dd>{money(result.poolCDrawn)}</dd></div>
            <div><dt>Investments left at age {age}</dt><dd>{money(result.total)}</dd></div>
          </dl>
          <p>Pool A {money(result.poolA)} + Pool C {money(result.poolC)}</p>
        </section>;
      })}
    </div>
  </div>;
}

function DecisionSurface({ rail, spend, realReturn, targetAge, theme, onAdopt, draftUrl }: {
  rail: Rail;
  spend: number;
  realReturn: number;
  targetAge: number;
  theme: Theme;
  onAdopt: (next: { spend: number; realReturn: number }) => void;
  draftUrl?: (next: { spend: number; realReturn: number }) => string;
}) {
  const [metric, setMetric] = useState<SurfaceMetric>("total-target");
  const [selected, setSelected] = useState<{ spend: number; realReturn: number } | null>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => { setSelected(null); }, [spend, realReturn, targetAge, rail.key, rail.electionKey, rail.poolA, rail.poolC, rail.netPension]);

  const spendAt = (column: number) => SURFACE_SPEND_LOW + (SURFACE_SPEND_HIGH - SURFACE_SPEND_LOW) * (column / (SURFACE_COLUMNS - 1));
  const returnAt = (row: number) => SURFACE_RETURN_LOW + (SURFACE_RETURN_HIGH - SURFACE_RETURN_LOW) * (row / (SURFACE_ROWS - 1));

  /* 8,120 live ledgers. One pass produces every metric, so switching metric
     or hovering never recomputes the plane. */
  const grid = useMemo(() => {
    const cells = SURFACE_COLUMNS * SURFACE_ROWS;
    const totalTarget = new Float64Array(cells);
    const poolATarget = new Float64Array(cells);
    const poolCTarget = new Float64Array(cells);
    const poolA95 = new Float64Array(cells);
    const exhaustion = new Float64Array(cells);
    const poolC95 = new Float64Array(cells);
    const firstShortfallAge = new Uint8Array(cells);
    for (let row = 0; row < SURFACE_ROWS; row += 1) {
      const candidateReturn = returnAt(row);
      for (let column = 0; column < SURFACE_COLUMNS; column += 1) {
        const result = surfaceProjection(rail, Math.round(spendAt(column) / 1_000) * 1_000, Number(candidateReturn.toFixed(4)), targetAge);
        const index = row * SURFACE_COLUMNS + column;
        poolATarget[index] = result.poolA;
        poolCTarget[index] = result.poolC;
        totalTarget[index] = result.total;
        poolA95[index] = result.poolA95;
        poolC95[index] = result.poolC95;
        exhaustion[index] = result.exhaustionAge ?? 96;
        firstShortfallAge[index] = result.firstShortfallAge ?? 96;
      }
    }
    return { totalTarget, poolATarget, poolCTarget, poolA95, exhaustion, poolC95, firstShortfallAge };
  }, [rail, targetAge]);

  const series = metric === "total-target" ? grid.totalTarget
    : metric === "poolA-target" ? grid.poolATarget
      : metric === "poolC-target" ? grid.poolCTarget
        : metric === "poolA-95" ? grid.poolA95
          : metric === "exhaustion" ? grid.exhaustion : grid.poolC95;
  const fundingAge = metric.endsWith("-95") ? 95 : targetAge;
  const peak = useMemo(() => {
    let max = 0;
    for (let i = 0; i < series.length; i += 1) {
      if (grid.firstShortfallAge[i] > fundingAge && series[i] > max) max = series[i];
    }
    return max || 1;
  }, [series, grid.firstShortfallAge, fundingAge]);
  const current = useMemo(() => surfaceProjection(rail, spend, realReturn, targetAge), [rail, spend, realReturn, targetAge]);
  const reserveOnly = useMemo(() => surfaceProjection(rail, spend, realReturn, targetAge, false), [rail, spend, realReturn, targetAge]);
  const alternative = useMemo(() => selected ? surfaceProjection(rail, selected.spend, selected.realReturn, targetAge) : null, [rail, selected, targetAge]);
  const alternativeReserveOnly = useMemo(() => selected ? surfaceProjection(rail, selected.spend, selected.realReturn, targetAge, false) : null, [rail, selected, targetAge]);

  useEffect(() => {
    const canvas = canvasRef.current;
    const wrap = wrapRef.current;
    if (!canvas || !wrap) return;
    const context = canvas.getContext("2d");
    if (!context) return;
    const ratio = Math.min(2, window.devicePixelRatio || 1);
    const cssWidth = Math.max(240, wrap.clientWidth);
    const cssHeight = Math.round(clamp(cssWidth * 0.46, 240, 420));
    canvas.width = Math.round(cssWidth * ratio);
    canvas.height = Math.round(cssHeight * ratio);
    canvas.style.width = `${cssWidth}px`;
    canvas.style.height = `${cssHeight}px`;
    context.setTransform(ratio, 0, 0, ratio, 0, 0);
    context.clearRect(0, 0, cssWidth, cssHeight);

    const padLeft = 64;
    const padBottom = 34;
    const padTop = 14;
    const padRight = 26;
    const plotWidth = cssWidth - padLeft - padRight;
    const plotHeight = cssHeight - padTop - padBottom;
    const ink = themeInk(wrap, "--muted", "#87a0c5");
    const lineInk = themeInk(wrap, "--line", "rgba(92,137,220,.2)");
    const textInk = themeInk(wrap, "--text", "#e3ecff");
    // Annotations sit on top of the ramp, so they need the opposite ink to the page.
    const markInk = theme === "light" ? "rgba(13,22,40,.88)" : "rgba(255,255,255,.9)";
    // A phone-width plane cannot carry the full annotations without clipping.
    const compact = cssWidth < 560;

    const tile = document.createElement("canvas");
    tile.width = SURFACE_COLUMNS;
    tile.height = SURFACE_ROWS;
    const tileContext = tile.getContext("2d");
    if (!tileContext) return;
    const image = tileContext.createImageData(SURFACE_COLUMNS, SURFACE_ROWS);
    for (let row = 0; row < SURFACE_ROWS; row += 1) {
      for (let column = 0; column < SURFACE_COLUMNS; column += 1) {
        const index = row * SURFACE_COLUMNS + column;
        const pixel = ((SURFACE_ROWS - 1 - row) * SURFACE_COLUMNS + column) * 4;
        if (grid.firstShortfallAge[index] <= fundingAge) {
          image.data.set([99, 109, 125, 255], pixel);
          continue;
        }
        const value = series[index];
        // Most of the plane sits near zero, so a square-root ramp is the one
        // that keeps the mid-range legible instead of flooding it with one colour.
        const share = metric === "exhaustion"
          ? clamp((value - 61) / 35, 0, 1)
          : Math.sqrt(clamp(value / peak, 0, 1));
        // Low sits in the danger red, mid in amber, high in the plan green.
        const red = share < 0.5 ? 255 : Math.round(255 - (share - 0.5) * 2 * 184);
        const green = share < 0.5 ? Math.round(114 + share * 2 * 55) : Math.round(169 + (share - 0.5) * 2 * 45);
        const blue = share < 0.5 ? Math.round(140 - share * 2 * 60) : Math.round(80 + (share - 0.5) * 2 * 80);
        // Rows are drawn bottom-up: low return belongs at the bottom of the plot.
        image.data[pixel] = red;
        image.data[pixel + 1] = green;
        image.data[pixel + 2] = blue;
        image.data[pixel + 3] = 235;
      }
    }
    tileContext.putImageData(image, 0, 0);
    context.imageSmoothingEnabled = true;
    context.drawImage(tile, padLeft, padTop, plotWidth, plotHeight);

    const xOf = (value: number) => padLeft + ((value - SURFACE_SPEND_LOW) / (SURFACE_SPEND_HIGH - SURFACE_SPEND_LOW)) * plotWidth;
    const yOf = (value: number) => padTop + (1 - (value - SURFACE_RETURN_LOW) / (SURFACE_RETURN_HIGH - SURFACE_RETURN_LOW)) * plotHeight;

    context.font = "10.5px Arial, Helvetica, sans-serif";
    context.strokeStyle = lineInk;
    context.fillStyle = ink;
    context.textAlign = "right";
    for (let step = 2; step <= 7; step += 1) {
      const y = yOf(step / 100);
      context.beginPath();
      context.moveTo(padLeft, y);
      context.lineTo(padLeft + plotWidth, y);
      context.stroke();
      context.fillText(`${step}%`, padLeft - 8, y + 3.5);
    }
    context.textAlign = "center";
    for (let value = 80_000; value <= SURFACE_SPEND_HIGH; value += compact ? 40_000 : 20_000) {
      context.fillText(compactMoney(value), xOf(value), cssHeight - padBottom + 16);
    }
    context.fillText("Flat net annual spend", padLeft + plotWidth / 2, cssHeight - 6);
    context.textAlign = "left";
    context.fillText("real return", 4, padTop - 2);

    // Iso-lines: where the measure holds a constant value across the plane.
    context.fillStyle = "rgba(10,18,32,.5)";
    [0.2, 0.4, 0.6, 0.8].forEach((level) => {
      const threshold = metric === "exhaustion" ? 61 + level * 35 : peak * level * level;
      for (let row = 0; row < SURFACE_ROWS; row += 1) {
        for (let column = 1; column < SURFACE_COLUMNS; column += 1) {
          if (grid.firstShortfallAge[row * SURFACE_COLUMNS + column] <= fundingAge ||
              grid.firstShortfallAge[row * SURFACE_COLUMNS + column - 1] <= fundingAge) continue;
          const left = series[row * SURFACE_COLUMNS + column - 1];
          const right = series[row * SURFACE_COLUMNS + column];
          if ((left - threshold) * (right - threshold) > 0) continue;
          context.fillRect(xOf(spendAt(column)) - 0.75, yOf(returnAt(row)) - 0.75, 1.5, 1.5);
        }
      }
    });

    // The horizontal line keeps the current plan's assumed return visible.
    context.strokeStyle = markInk;
    context.lineWidth = 1.4;
    context.beginPath();
    context.moveTo(padLeft, yOf(realReturn));
    context.lineTo(padLeft + plotWidth, yOf(realReturn));
    context.stroke();
    context.fillStyle = markInk;
    context.textAlign = "left";
    context.fillText("YOUR CURRENT RETURN", padLeft + 8, yOf(realReturn) - 7);

    // The active plan.
    if (spend >= SURFACE_SPEND_LOW && spend <= SURFACE_SPEND_HIGH) {
      context.strokeStyle = textInk;
      context.lineWidth = 2;
      context.beginPath();
      context.arc(xOf(spend), yOf(realReturn), 7, 0, Math.PI * 2);
      context.stroke();
    }
    if (selected) {
      context.strokeStyle = "#17263b";
      context.fillStyle = "#ffffff";
      context.lineWidth = 2;
      context.beginPath();
      context.arc(xOf(selected.spend), yOf(selected.realReturn), 5, 0, Math.PI * 2);
      context.fill();
      context.stroke();
    }
    context.lineWidth = 1;
  }, [series, peak, metric, realReturn, spend, selected, theme, grid.firstShortfallAge, fundingAge]);

  const locate = (event: { clientX: number; clientY: number }) => {
    const canvas = canvasRef.current;
    if (!canvas) return null;
    const rect = canvas.getBoundingClientRect();
    const padLeft = 64;
    const padBottom = 34;
    const padTop = 14;
    const padRight = 26;
    const plotWidth = rect.width - padLeft - padRight;
    const plotHeight = rect.height - padTop - padBottom;
    const x = event.clientX - rect.left - padLeft;
    const y = event.clientY - rect.top - padTop;
    if (x < 0 || y < 0 || x > plotWidth || y > plotHeight) return null;
    const column = clamp(Math.round((x / plotWidth) * (SURFACE_COLUMNS - 1)), 0, SURFACE_COLUMNS - 1);
    const row = clamp(Math.round((1 - y / plotHeight) * (SURFACE_ROWS - 1)), 0, SURFACE_ROWS - 1);
    return { spend: Math.round(spendAt(column) / 1_000) * 1_000, realReturn: Number(returnAt(row).toFixed(4)) };
  };

  const activeMetric = SURFACE_METRICS.find((item) => item.key === metric)!;
  const metricLabel = (item: (typeof SURFACE_METRICS)[number]) => item.key.endsWith("-target") ? item.label.replace("target age", `age ${targetAge}`) : item.label;
  const alternativeValue = alternative && (metric === "total-target" ? money(alternative.total)
    : metric === "poolA-target" ? money(alternative.poolA)
      : metric === "poolC-target" ? money(alternative.poolC)
        : metric === "poolA-95" ? money(alternative.poolA95)
          : metric === "poolC-95" ? money(alternative.poolC95)
            : alternative.exhaustionAge === null ? "After age 95" : `Age ${alternative.exhaustionAge}`);

  return <section className="panel decision-surface">
    <div className="panel-head">
      <div>
        <h3>Your investments at age {targetAge}</h3>
        <p>Compare how much of your budget is funded and how much is left invested under each withdrawal rule.</p>
      </div>
      <Badge tone="modelled">Modelled in today's dollars</Badge>
    </div>
    <div className="surface-current" aria-label="Current plan investment balances">
      <p><b>Current plan</b> · {money(spend)} net spending a year · {pct(realReturn, 2)} real return after inflation · target age {targetAge}</p>
      <SurfaceWithdrawalComparison age={targetAge} spend={spend} withReserveDraw={current} withoutReserveDraw={reserveOnly} />
    </div>
    <p className="surface-explanation">Pool A is your account-based pension balance. Pool C is your modelled investment reserve outside super. Investments left are the two balances after withdrawals, with your home shown separately.</p>
    <div className="instrument-bar" role="group" aria-label="Surface metric">
      <span className="instrument-label">Colour the chart by</span>
      {SURFACE_METRICS.slice(0, 4).map((item) => <button key={item.key} type="button" className={metric === item.key ? "active" : ""} aria-pressed={metric === item.key} onClick={() => setMetric(item.key)}>{metricLabel(item)}</button>)}
    </div>
    <details className="surface-other-ages"><summary>Other views at age 95</summary><div className="instrument-bar" role="group" aria-label="Other surface metrics">{SURFACE_METRICS.slice(4).map((item) => <button key={item.key} type="button" className={metric === item.key ? "active" : ""} aria-pressed={metric === item.key} onClick={() => setMetric(item.key)}>{metricLabel(item)}</button>)}</div></details>
    <p className="surface-explanation"><b>The chart uses Pool C to cover spending gaps.</b> Yearly spending increases to the right and assumed return increases upwards. Tap a point to see both withdrawal rules below the chart.</p>
    <div className="surface-wrap" ref={wrapRef}>
      <canvas
        ref={canvasRef}
        className="surface-canvas"
        role="application"
        tabIndex={0}
        aria-label={`Chart of ${metricLabel(activeMetric)} across spending and real return. Tap to select an alternative, or use arrow keys to adjust one. Applying it is a separate button.`}
        onClick={(event) => { const at = locate(event); if (at) setSelected(at); }}
        onKeyDown={(event) => {
          if (!["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(event.key)) return;
          event.preventDefault();
          const base = selected ?? { spend: clamp(spend, SURFACE_SPEND_LOW, SURFACE_SPEND_HIGH), realReturn: clamp(realReturn, SURFACE_RETURN_LOW, SURFACE_RETURN_HIGH) };
          const nextSpend = base.spend + (event.key === "ArrowRight" ? 1_000 : event.key === "ArrowLeft" ? -1_000 : 0);
          const nextReturn = base.realReturn + (event.key === "ArrowUp" ? 0.0025 : event.key === "ArrowDown" ? -0.0025 : 0);
          setSelected({ spend: clamp(nextSpend, SURFACE_SPEND_LOW, SURFACE_SPEND_HIGH), realReturn: Number(clamp(nextReturn, SURFACE_RETURN_LOW, SURFACE_RETURN_HIGH).toFixed(4)) });
        }}
      />
    </div>
    <div className="surface-scale"><span>{metric === "exhaustion" ? "Runs out earlier" : "Lower balance"}</span><i aria-hidden="true" /><span>{metric === "exhaustion" ? "Runs out later or after 95" : "Higher balance"}</span></div>
    <p className="surface-explanation"><span className="surface-unfunded-key" aria-hidden="true" /> Grey means a spending shortfall by age {fundingAge}, even after drawing on both pools.</p>
    {(spend < SURFACE_SPEND_LOW || spend > SURFACE_SPEND_HIGH) && <p className="surface-explanation">Your current spending is outside the chart's {money(SURFACE_SPEND_LOW)}–{money(SURFACE_SPEND_HIGH)} range, so its circle is not shown. The current-plan values above still use your actual setting.</p>}
    {selected && alternative && alternativeReserveOnly ? <div className="surface-alternative" aria-live="polite">
      <p><b>Selected alternative</b> · {money(selected.spend)} per year · {pct(selected.realReturn, 2)} real return</p>
      {metric !== "total-target" && <p>Chart result · {metricLabel(activeMetric)} · <b>{alternativeValue}</b>{metric.endsWith("-95") && alternative.firstShortfallAge !== null && ` · Spending shortfall starts at age ${alternative.firstShortfallAge}`}</p>}
      <SurfaceWithdrawalComparison age={targetAge} spend={selected.spend} withReserveDraw={alternative} withoutReserveDraw={alternativeReserveOnly} />
      <p className="surface-explanation"><b>Before applying:</b> Command Centre uses the reserve rule shown above. Open a draft in V23 to try spending from Pool C.</p>
      <div className="surface-actions"><button type="button" className="primary" onClick={() => { onAdopt(selected); setSelected(null); }}>Apply spending and return</button>
        {draftUrl && <a className="secondary" href={draftUrl(selected)} target="_blank" rel="noreferrer">Review a Pool C draw in V23</a>}
        <button type="button" className="secondary" onClick={() => setSelected(null)}>Clear selection</button></div>
    </div> : <p className="surface-explanation">Select a point to see an alternative here. Your current plan is shown above without selecting anything.</p>}
    <div className="note">Both projections assume steady returns, flat annual spending and a {pct(POOL_C_DRAG, 2)} annual drag on Pool C. Applying an alternative updates your shared spending and return settings. Lab uses the reserve rule shown above.</div>
  </section>;
}

/* ---- minimal 4x4 helpers: the volume needs a camera, not a matrix library ---- */
function mat4Multiply(a: Float32Array, b: Float32Array) {
  const out = new Float32Array(16);
  for (let row = 0; row < 4; row += 1) {
    for (let column = 0; column < 4; column += 1) {
      out[column * 4 + row] = a[row] * b[column * 4]
        + a[4 + row] * b[column * 4 + 1]
        + a[8 + row] * b[column * 4 + 2]
        + a[12 + row] * b[column * 4 + 3];
    }
  }
  return out;
}

function mat4Perspective(fovY: number, aspect: number, near: number, far: number) {
  const f = 1 / Math.tan(fovY / 2);
  const out = new Float32Array(16);
  out[0] = f / aspect; out[5] = f; out[10] = (far + near) / (near - far);
  out[11] = -1; out[14] = (2 * far * near) / (near - far);
  return out;
}

function mat4LookAt(eye: number[], centre: number[], up: number[]) {
  const z = [eye[0] - centre[0], eye[1] - centre[1], eye[2] - centre[2]];
  let length = Math.hypot(z[0], z[1], z[2]) || 1;
  z[0] /= length; z[1] /= length; z[2] /= length;
  const x = [up[1] * z[2] - up[2] * z[1], up[2] * z[0] - up[0] * z[2], up[0] * z[1] - up[1] * z[0]];
  length = Math.hypot(x[0], x[1], x[2]) || 1;
  x[0] /= length; x[1] /= length; x[2] /= length;
  const y = [z[1] * x[2] - z[2] * x[1], z[2] * x[0] - z[0] * x[2], z[0] * x[1] - z[1] * x[0]];
  const out = new Float32Array(16);
  out[0] = x[0]; out[1] = y[0]; out[2] = z[0];
  out[4] = x[1]; out[5] = y[1]; out[6] = z[1];
  out[8] = x[2]; out[9] = y[2]; out[10] = z[2];
  out[12] = -(x[0] * eye[0] + x[1] * eye[1] + x[2] * eye[2]);
  out[13] = -(y[0] * eye[0] + y[1] * eye[1] + y[2] * eye[2]);
  out[14] = -(z[0] * eye[0] + z[1] * eye[1] + z[2] * eye[2]);
  out[15] = 1;
  return out;
}

function projectPoint(matrix: Float32Array, px: number, py: number, pz: number, width: number, height: number) {
  const w = matrix[3] * px + matrix[7] * py + matrix[11] * pz + matrix[15];
  const x = matrix[0] * px + matrix[4] * py + matrix[8] * pz + matrix[12];
  const y = matrix[1] * px + matrix[5] * py + matrix[9] * pz + matrix[13];
  const safe = Math.abs(w) < 1e-5 ? 1e-5 : w;
  return { x: (x / safe * 0.5 + 0.5) * width, y: (1 - (y / safe * 0.5 + 0.5)) * height, w: safe };
}

type VolumeMetric = "poolA" | "total" | "poolC";
type VolumeTool = "orbit" | "pan" | "slice";
type VolumeFilter = "all" | "survivors" | "failures";

const VOLUME_POINTS = 36;
const VOLUME_VERTEX_SHADER = `attribute vec3 p;attribute vec2 a;uniform mat4 m;uniform float cut;uniform float slab;uniform float vmode;varying float s;varying float d;
void main(){float vis=step(a.y,cut)*step(abs(p.z),slab);if(vmode>0.5){vis*=(vmode<1.5)?a.x:(1.0-a.x);}vec4 q=m*vec4(p,1.0);gl_Position=(vis>0.5)?q:vec4(3.0,3.0,3.0,1.0);d=clamp(q.w/6.0,0.0,1.0);s=a.x;}`;
const VOLUME_FRAGMENT_SHADER = `precision mediump float;varying float s;varying float d;uniform vec3 tint;uniform float useTint;uniform float alpha;
void main(){vec3 c=(useTint>0.5)?tint:mix(vec3(1.0,0.45,0.55),vec3(0.28,0.84,0.63),s);gl_FragColor=vec4(c*mix(1.0,0.4,d),alpha);}`;

function compileVolumeProgram(gl: WebGLRenderingContext) {
  const build = (type: number, source: string) => {
    const shader = gl.createShader(type);
    if (!shader) return null;
    gl.shaderSource(shader, source);
    gl.compileShader(shader);
    return gl.getShaderParameter(shader, gl.COMPILE_STATUS) ? shader : null;
  };
  const vertex = build(gl.VERTEX_SHADER, VOLUME_VERTEX_SHADER);
  const fragment = build(gl.FRAGMENT_SHADER, VOLUME_FRAGMENT_SHADER);
  if (!vertex || !fragment) return null;
  const program = gl.createProgram();
  if (!program) return null;
  gl.attachShader(program, vertex);
  gl.attachShader(program, fragment);
  gl.linkProgram(program);
  return gl.getProgramParameter(program, gl.LINK_STATUS) ? program : null;
}

function ProbabilityVolume({ rail, spend, realReturn, simulationSeed, theme }: {
  rail: Rail;
  spend: number;
  realReturn: number;
  simulationSeed: number;
  theme: Theme;
}) {
  const [metric, setMetric] = useState<VolumeMetric>("poolA");
  const [tool, setTool] = useState<VolumeTool>("orbit");
  const [filter, setFilter] = useState<VolumeFilter>("all");
  const [volatility, setVolatility] = useState(0.12);
  // A phone draws the same geometry on a far smaller GPU budget.
  const [pathCount, setPathCount] = useState(() => (typeof window !== "undefined" && window.innerWidth < 760 ? 1_500 : 6_000));
  const [revealAge, setRevealAge] = useState(95);
  const [slab, setSlab] = useState(1);
  const [slicePosition, setSlicePosition] = useState(0.5);
  const [spinning, setSpinning] = useState(false);
  const [showSpine, setShowSpine] = useState(true);
  const [supported, setSupported] = useState(true);
  const [sliceReadout, setSliceReadout] = useState<{ age: number; p5: number; p50: number; p95: number; failed: number } | null>(null);

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const overlayRef = useRef<HTMLCanvasElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const cameraRef = useRef({ angle: 0.58, elevation: 0.18, radius: 2.42, panX: 0, panY: 0 });
  const glRef = useRef<{ gl: WebGLRenderingContext; program: WebGLProgram; cloud: WebGLBuffer; cloudAttr: WebGLBuffer; spine: WebGLBuffer; spineAttr: WebGLBuffer; spineCount: number; count: number } | null>(null);
  const frameRef = useRef(0);

  /* Every path is a full canonical ledger, so volatility 0 collapses the cloud
     onto the deterministic plan exactly. */
  const simulation = useMemo(() => {
    const paths = pathCount;
    const poolA = new Float32Array(paths * VOLUME_POINTS);
    const poolC = new Float32Array(paths * VOLUME_POINTS);
    const realised = new Float32Array(paths);
    const survived = new Uint8Array(paths);
    for (let run = 0; run < paths; run += 1) {
      const random = seededGenerator(simulationSeed + run * 7_919 + Math.round(rail.capital));
      const annualReturns: number[] = [];
      let total = 0;
      for (let year = 1; year < VOLUME_POINTS; year += 1) {
        const sampled = clamp(realReturn + volatility * normalSample(random), -0.55, 0.45);
        annualReturns.push(sampled);
        total += sampled;
      }
      realised[run] = total / (VOLUME_POINTS - 1);
      const path = poolPath(rail, spend, realReturn, annualReturns);
      const base = run * VOLUME_POINTS;
      for (let step = 0; step < VOLUME_POINTS; step += 1) {
        poolA[base + step] = path[step]?.poolA ?? 0;
        poolC[base + step] = path[step]?.poolC ?? 0;
      }
      survived[run] = (path[VOLUME_POINTS - 1]?.poolA ?? 0) > 0.5 ? 1 : 0;
    }
    let low = Infinity;
    let high = -Infinity;
    for (let run = 0; run < paths; run += 1) {
      if (realised[run] < low) low = realised[run];
      if (realised[run] > high) high = realised[run];
    }
    let survivors = 0;
    for (let run = 0; run < paths; run += 1) survivors += survived[run];
    return { paths, poolA, poolC, realised, survived, low, high, survivors };
  }, [rail, spend, realReturn, volatility, pathCount, simulationSeed]);

  const plotted = useMemo(() => {
    const { paths, poolA, poolC } = simulation;
    if (metric === "poolA") return poolA;
    if (metric === "poolC") return poolC;
    const total = new Float32Array(paths * VOLUME_POINTS);
    for (let i = 0; i < total.length; i += 1) total[i] = poolA[i] + poolC[i];
    return total;
  }, [simulation, metric]);

  const deterministic = useMemo(() => {
    const path = poolPath(rail, spend, realReturn);
    return path.map((row) => metric === "poolA" ? row.poolA : metric === "poolC" ? row.poolC : row.total);
  }, [rail, spend, realReturn, metric]);

  const ceilingValue = useMemo(() => {
    const sample: number[] = [];
    const stride = Math.max(1, Math.floor(simulation.paths / 1_400));
    for (let run = 0; run < simulation.paths; run += stride) {
      for (let step = 0; step < VOLUME_POINTS; step += 2) sample.push(plotted[run * VOLUME_POINTS + step]);
    }
    sample.sort((a, b) => a - b);
    const quantileShare = metric === "poolA" ? 0.985 : 0.95;
    const deterministicPeak = Math.max(...deterministic);
    return Math.max(200_000, deterministicPeak * 1.25, sample[Math.floor(sample.length * quantileShare)] ?? 1_000_000);
  }, [plotted, simulation.paths, metric, deterministic]);

  const percentiles = useMemo(() => {
    const low: number[] = [];
    const mid: number[] = [];
    const high: number[] = [];
    const column: number[] = new Array(simulation.paths);
    for (let step = 0; step < VOLUME_POINTS; step += 1) {
      for (let run = 0; run < simulation.paths; run += 1) column[run] = plotted[run * VOLUME_POINTS + step];
      const ordered = [...column].sort((a, b) => a - b);
      low.push(ordered[Math.floor(ordered.length * 0.05)] ?? 0);
      mid.push(ordered[Math.floor(ordered.length * 0.5)] ?? 0);
      high.push(ordered[Math.floor(ordered.length * 0.95)] ?? 0);
    }
    return { low, mid, high };
  }, [plotted, simulation.paths]);

  const sliceAge = 60 + Math.round(slicePosition * 35);

  useEffect(() => {
    const column: number[] = [];
    const step = clamp(sliceAge - 60, 0, 35);
    let failed = 0;
    for (let run = 0; run < simulation.paths; run += 1) {
      const value = plotted[run * VOLUME_POINTS + step];
      column.push(value);
      if ((simulation.poolA[run * VOLUME_POINTS + step] ?? 0) <= 0.5) failed += 1;
    }
    column.sort((a, b) => a - b);
    setSliceReadout({
      age: sliceAge,
      p5: column[Math.floor(column.length * 0.05)] ?? 0,
      p50: column[Math.floor(column.length * 0.5)] ?? 0,
      p95: column[Math.floor(column.length * 0.95)] ?? 0,
      failed: failed / Math.max(1, simulation.paths),
    });
  }, [sliceAge, plotted, simulation]);

  /* ---- geometry ---- */
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const gl = (canvas.getContext("webgl", { antialias: true, alpha: true }) || canvas.getContext("experimental-webgl")) as WebGLRenderingContext | null;
    if (!gl) { setSupported(false); return; }
    const program = compileVolumeProgram(gl);
    if (!program) { setSupported(false); return; }
    const segments = VOLUME_POINTS - 1;
    const positions = new Float32Array(simulation.paths * segments * 6);
    const attributes = new Float32Array(simulation.paths * segments * 4);
    const spread = Math.max(1e-6, simulation.high - simulation.low);
    let cursor = 0;
    let attributeCursor = 0;
    for (let run = 0; run < simulation.paths; run += 1) {
      const depth = ((simulation.realised[run] - simulation.low) / spread) * 2 - 1;
      const alive = simulation.survived[run];
      for (let step = 0; step < segments; step += 1) {
        for (let end = 0; end < 2; end += 1) {
          const index = step + end;
          positions[cursor] = (index / segments) * 2 - 1;
          positions[cursor + 1] = clamp(plotted[run * VOLUME_POINTS + index] / ceilingValue, 0, 1.06) * 2 - 1;
          positions[cursor + 2] = depth;
          cursor += 3;
          attributes[attributeCursor] = alive;
          attributes[attributeCursor + 1] = 60 + index;
          attributeCursor += 2;
        }
      }
    }
    const spinePoints = [percentiles.low, percentiles.mid, percentiles.high, deterministic];
    const spinePositions = new Float32Array(spinePoints.length * segments * 6);
    const spineAttributes = new Float32Array(spinePoints.length * segments * 4);
    let spineCursor = 0;
    let spineAttributeCursor = 0;
    spinePoints.forEach((line) => {
      for (let step = 0; step < segments; step += 1) {
        for (let end = 0; end < 2; end += 1) {
          const index = step + end;
          spinePositions[spineCursor] = (index / segments) * 2 - 1;
          spinePositions[spineCursor + 1] = clamp((line[index] ?? 0) / ceilingValue, 0, 1.06) * 2 - 1;
          spinePositions[spineCursor + 2] = 0;
          spineCursor += 3;
          spineAttributes[spineAttributeCursor] = 1;
          spineAttributes[spineAttributeCursor + 1] = 60 + index;
          spineAttributeCursor += 2;
        }
      }
    });
    const cloud = gl.createBuffer();
    const cloudAttr = gl.createBuffer();
    const spine = gl.createBuffer();
    const spineAttr = gl.createBuffer();
    if (!cloud || !cloudAttr || !spine || !spineAttr) { setSupported(false); return; }
    gl.bindBuffer(gl.ARRAY_BUFFER, cloud);
    gl.bufferData(gl.ARRAY_BUFFER, positions, gl.STATIC_DRAW);
    gl.bindBuffer(gl.ARRAY_BUFFER, cloudAttr);
    gl.bufferData(gl.ARRAY_BUFFER, attributes, gl.STATIC_DRAW);
    gl.bindBuffer(gl.ARRAY_BUFFER, spine);
    gl.bufferData(gl.ARRAY_BUFFER, spinePositions, gl.STATIC_DRAW);
    gl.bindBuffer(gl.ARRAY_BUFFER, spineAttr);
    gl.bufferData(gl.ARRAY_BUFFER, spineAttributes, gl.STATIC_DRAW);
    glRef.current = {
      gl, program, cloud, cloudAttr, spine, spineAttr,
      count: simulation.paths * segments * 2,
      spineCount: spinePoints.length * segments * 2,
    };
    setSupported(true);
    return () => {
      gl.deleteBuffer(cloud); gl.deleteBuffer(cloudAttr); gl.deleteBuffer(spine); gl.deleteBuffer(spineAttr);
      gl.deleteProgram(program);
      glRef.current = null;
    };
  }, [simulation, plotted, ceilingValue, percentiles, deterministic]);

  /* ---- draw loop ---- */
  useEffect(() => {
    let active = true;
    const render = () => {
      if (!active) return;
      frameRef.current = requestAnimationFrame(render);
      const state = glRef.current;
      const canvas = canvasRef.current;
      const overlay = overlayRef.current;
      const wrap = wrapRef.current;
      if (!state || !canvas || !overlay || !wrap) return;
      const ratio = Math.min(2, window.devicePixelRatio || 1);
      const cssWidth = Math.max(240, wrap.clientWidth);
      const cssHeight = Math.round(clamp(cssWidth * 0.64, 300, 540));
      [canvas, overlay].forEach((target) => {
        if (target.style.width !== `${cssWidth}px`) { target.style.width = `${cssWidth}px`; target.style.height = `${cssHeight}px`; }
        const wantWidth = Math.round(cssWidth * ratio);
        const wantHeight = Math.round(cssHeight * ratio);
        if (target.width !== wantWidth || target.height !== wantHeight) { target.width = wantWidth; target.height = wantHeight; }
      });
      const camera = cameraRef.current;
      if (spinning) camera.angle += 0.0035;
      const { gl, program } = state;
      gl.viewport(0, 0, canvas.width, canvas.height);
      gl.clearColor(0, 0, 0, 0);
      gl.clear(gl.COLOR_BUFFER_BIT);
      gl.enable(gl.BLEND);
      gl.useProgram(program);
      const eye = [
        Math.sin(camera.angle) * Math.cos(camera.elevation) * camera.radius,
        Math.sin(camera.elevation) * camera.radius + camera.panY,
        Math.cos(camera.angle) * Math.cos(camera.elevation) * camera.radius,
      ];
      const matrix = mat4Multiply(
        mat4Perspective(0.95, canvas.width / Math.max(1, canvas.height), 0.1, 40),
        // The plotted band runs from -1 to about +1.12, so the camera aims a little high.
        mat4LookAt(eye, [camera.panX, camera.panY + 0.07, 0], [0, 1, 0]),
      );
      const uniform = (name: string) => gl.getUniformLocation(program, name);
      gl.uniformMatrix4fv(uniform("m"), false, matrix);
      gl.uniform1f(uniform("cut"), revealAge);
      gl.uniform1f(uniform("slab"), slab);
      gl.uniform1f(uniform("vmode"), filter === "all" ? 0 : filter === "survivors" ? 1 : 2);
      const position = gl.getAttribLocation(program, "p");
      const attribute = gl.getAttribLocation(program, "a");
      gl.enableVertexAttribArray(position);
      gl.enableVertexAttribArray(attribute);

      gl.blendFunc(gl.SRC_ALPHA, gl.ONE);
      gl.uniform1f(uniform("useTint"), 0);
      // Additive blending means brightness is lines per pixel: hold that constant
      // so a phone-sized canvas does not blow out at the same path count.
      const density = (cssWidth * cssHeight) / (900 * 560);
      gl.uniform1f(uniform("alpha"), clamp(0.5 * density / (simulation.paths / 1_500), 0.02, 0.3));
      gl.bindBuffer(gl.ARRAY_BUFFER, state.cloud);
      gl.vertexAttribPointer(position, 3, gl.FLOAT, false, 0, 0);
      gl.bindBuffer(gl.ARRAY_BUFFER, state.cloudAttr);
      gl.vertexAttribPointer(attribute, 2, gl.FLOAT, false, 0, 0);
      gl.drawArrays(gl.LINES, 0, state.count);

      if (showSpine) {
        gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
        gl.uniform1f(uniform("useTint"), 1);
        gl.uniform1f(uniform("alpha"), 0.95);
        gl.uniform1f(uniform("vmode"), 0);
        gl.bindBuffer(gl.ARRAY_BUFFER, state.spine);
        gl.vertexAttribPointer(position, 3, gl.FLOAT, false, 0, 0);
        gl.bindBuffer(gl.ARRAY_BUFFER, state.spineAttr);
        gl.vertexAttribPointer(attribute, 2, gl.FLOAT, false, 0, 0);
        const quarter = state.spineCount / 4;
        const tints = [[0.55, 0.63, 1], [0.44, 0.55, 1], [0.55, 0.63, 1], [0.93, 0.95, 1]];
        tints.forEach((tint, index) => {
          gl.uniform3f(uniform("tint"), tint[0], tint[1], tint[2]);
          gl.uniform1f(uniform("alpha"), index === 3 ? 1 : 0.55);
          gl.drawArrays(gl.LINES, index * quarter, quarter);
        });
      }

      /* ---- 2D overlay: axes, the slice plane and its distribution ---- */
      const context = overlay.getContext("2d");
      if (!context) return;
      context.setTransform(ratio, 0, 0, ratio, 0, 0);
      context.clearRect(0, 0, cssWidth, cssHeight);
      const ink = themeInk(wrap, "--muted", "#87a0c5");
      const textInk = themeInk(wrap, "--text", "#e3ecff");
      const to2d = (x: number, y: number, z: number) => projectPoint(matrix, x, y, z, cssWidth, cssHeight);
      context.font = "10.5px Arial, Helvetica, sans-serif";
      context.fillStyle = ink;
      context.textAlign = "center";
      // Ticks belong on the edge nearest the camera, or they hide inside the cloud.
      const nearZ = (eye[2] >= 0 ? 1 : -1) * Math.min(1, slab);
      [60, 70, 80, 90, 95].forEach((ageTick) => {
        if (ageTick > revealAge) return;
        const at = to2d(((ageTick - 60) / 35) * 2 - 1, -1, nearZ);
        if (at.w <= 0 || at.x < 4 || at.x > cssWidth - 4) return;
        context.fillText(String(ageTick), at.x, clamp(at.y + 15, 12, cssHeight - 4));
      });
      context.textAlign = "left";
      [0, 0.5, 1].forEach((share) => {
        const at = to2d(-1, share * 2 - 1, 0);
        if (at.w <= 0 || at.y < 8 || at.y > cssHeight - 8) return;
        context.fillText(compactMoney(ceilingValue * share), clamp(at.x - 44, 2, cssWidth - 50), at.y);
      });

      // Fixed captions, so the axes stay readable from any camera angle.
      context.textAlign = "left";
      context.fillStyle = textInk;
      context.fillText(`height = ${metricLabel}`, 10, 16);
      context.fillStyle = ink;
      context.fillText("depth = realised average return", 10, 30);
      context.fillText("age 60 → 95", 10, cssHeight - 10);

      const sliceX = ((sliceAge - 60) / 35) * 2 - 1;
      const corners = [to2d(sliceX, -1, -slab), to2d(sliceX, 1, -slab), to2d(sliceX, 1, slab), to2d(sliceX, -1, slab)];
      if (corners.every((corner) => corner.w > 0)) {
        context.beginPath();
        context.moveTo(corners[0].x, corners[0].y);
        corners.slice(1).forEach((corner) => context.lineTo(corner.x, corner.y));
        context.closePath();
        context.fillStyle = "rgba(111,140,255,.12)";
        context.strokeStyle = "rgba(111,140,255,.65)";
        context.fill();
        context.stroke();
      }
      // The inset distribution needs room; on a phone the readouts below carry it.
      if (sliceReadout && cssWidth >= 560) {
        const boxWidth = 168;
        const boxHeight = 92;
        const left = cssWidth - boxWidth - 12;
        const top = 12;
        context.fillStyle = "rgba(7,19,33,.82)";
        context.strokeStyle = "rgba(111,140,255,.45)";
        context.fillRect(left, top, boxWidth, boxHeight);
        context.strokeRect(left, top, boxWidth, boxHeight);
        const column: number[] = [];
        const step = clamp(sliceAge - 60, 0, 35);
        for (let run = 0; run < simulation.paths; run += 1) column.push(plotted[run * VOLUME_POINTS + step]);
        const bins = new Array(26).fill(0);
        column.forEach((value) => { bins[clamp(Math.floor((value / ceilingValue) * 26), 0, 25)] += 1; });
        const tallest = Math.max(...bins, 1);
        bins.forEach((count, index) => {
          const barHeight = (count / tallest) * 44;
          context.fillStyle = index === 0 ? "rgba(255,114,140,.9)" : "rgba(71,214,160,.75)";
          context.fillRect(left + 8 + index * 6, top + 52 - barHeight, 5, barHeight);
        });
        context.fillStyle = textInk;
        context.textAlign = "left";
        context.fillText(`Age ${sliceReadout.age} distribution`, left + 8, top + 14);
        context.fillStyle = ink;
        context.fillText(`P5 ${compactMoney(sliceReadout.p5)} · P50 ${compactMoney(sliceReadout.p50)}`, left + 8, top + 68);
        context.fillText(`P95 ${compactMoney(sliceReadout.p95)} · ${pct(sliceReadout.failed, 0)} broken`, left + 8, top + 82);
      }
    };
    frameRef.current = requestAnimationFrame(render);
    return () => { active = false; cancelAnimationFrame(frameRef.current); };
  }, [spinning, revealAge, slab, filter, showSpine, sliceAge, sliceReadout, ceilingValue, plotted, simulation, theme]);

  const dragRef = useRef<{ x: number; y: number } | null>(null);
  const onPointerDown = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    dragRef.current = { x: event.clientX, y: event.clientY };
    try { event.currentTarget.setPointerCapture(event.pointerId); } catch { /* pointer already released */ }
  };
  const onPointerMove = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    const from = dragRef.current;
    if (!from) return;
    const dx = event.clientX - from.x;
    const dy = event.clientY - from.y;
    dragRef.current = { x: event.clientX, y: event.clientY };
    const camera = cameraRef.current;
    if (tool === "orbit" && !event.shiftKey) {
      camera.angle -= dx * 0.006;
      camera.elevation = clamp(camera.elevation + dy * 0.005, -1.35, 1.35);
    } else if (tool === "slice") {
      setSlicePosition((value) => clamp(value + dx / 420, 0, 1));
    } else {
      camera.panX = clamp(camera.panX - dx * 0.004, -1.6, 1.6);
      camera.panY = clamp(camera.panY + dy * 0.004, -1.6, 1.6);
    }
  };
  const endPointer = () => { dragRef.current = null; };
  const onWheel = (event: ReactWheelEvent<HTMLCanvasElement>) => {
    const camera = cameraRef.current;
    camera.radius = clamp(camera.radius * (event.deltaY > 0 ? 1.08 : 0.93), 0.9, 6);
  };
  const applyView = (view: "iso" | "front" | "depth" | "top") => {
    const camera = cameraRef.current;
    if (view === "iso") { camera.angle = 0.58; camera.elevation = 0.18; camera.radius = 2.42; }
    if (view === "front") { camera.angle = 0; camera.elevation = 0.04; camera.radius = 2.12; }
    if (view === "depth") { camera.angle = Math.PI / 2; camera.elevation = 0.08; camera.radius = 2.05; }
    if (view === "top") { camera.angle = 0.001; camera.elevation = 0.9; camera.radius = 2.5; }
    camera.panX = 0; camera.panY = 0;
  };
  const onKeyDown = (event: ReactKeyboardEvent<HTMLCanvasElement>) => {
    const camera = cameraRef.current;
    const keys: Record<string, () => void> = {
      ArrowLeft: () => { camera.angle -= 0.08; },
      ArrowRight: () => { camera.angle += 0.08; },
      ArrowUp: () => { camera.elevation = clamp(camera.elevation + 0.06, -1.35, 1.35); },
      ArrowDown: () => { camera.elevation = clamp(camera.elevation - 0.06, -1.35, 1.35); },
      "+": () => { camera.radius = clamp(camera.radius * 0.92, 0.9, 6); },
      "=": () => { camera.radius = clamp(camera.radius * 0.92, 0.9, 6); },
      "-": () => { camera.radius = clamp(camera.radius * 1.08, 0.9, 6); },
      "1": () => applyView("iso"),
      "2": () => applyView("front"),
      "3": () => applyView("depth"),
      "4": () => applyView("top"),
      r: () => { applyView("iso"); setRevealAge(95); setSlab(1); setFilter("all"); },
    };
    const action = keys[event.key];
    if (action) { action(); event.preventDefault(); }
  };

  const survivalShare = simulation.survivors / Math.max(1, simulation.paths);
  const metricLabel = metric === "poolA" ? "Pool A" : metric === "poolC" ? "Pool C" : "total capital";

  return <section className="panel probability-volume">
    <div className="panel-head">
      <div>
        <h3>Probability volume</h3>
        <p>Each line is one sampled path. Height is {metricLabel}; depth is that path’s realised average return. A zero balance in one pool does not by itself mean essential spending failed. This view has its own path count and volatility controls; the fan above stays at 600 paths and 12% volatility.</p>
      </div>
      <Badge tone="modelled">{simulation.paths.toLocaleString()} paths · seed {simulationSeed}</Badge>
    </div>
    {!supported && <div className="note warn"><b>WebGL is unavailable in this browser.</b> The simulation still ran and the percentile readouts below are live. The fan above provides a separate 2D comparison at 600 paths and 12% volatility.</div>}
    <div className="instrument-bar" role="group" aria-label="Volume controls">
      <span className="instrument-label">Height</span>
      <button type="button" className={metric === "poolA" ? "active" : ""} aria-pressed={metric === "poolA"} onClick={() => setMetric("poolA")}>Pool A</button>
      <button type="button" className={metric === "total" ? "active" : ""} aria-pressed={metric === "total"} onClick={() => setMetric("total")}>Total capital</button>
      <button type="button" className={metric === "poolC" ? "active" : ""} aria-pressed={metric === "poolC"} onClick={() => setMetric("poolC")}>Pool C</button>
      <span className="instrument-sep" />
      <span className="instrument-label">Drag</span>
      <button type="button" className={tool === "orbit" ? "active" : ""} aria-pressed={tool === "orbit"} onClick={() => setTool("orbit")}>Orbit</button>
      <button type="button" className={tool === "pan" ? "active" : ""} aria-pressed={tool === "pan"} onClick={() => setTool("pan")}>Pan</button>
      <button type="button" className={tool === "slice" ? "active" : ""} aria-pressed={tool === "slice"} onClick={() => setTool("slice")}>Slice</button>
      <span className="instrument-sep" />
      <span className="instrument-label">Show</span>
      <button type="button" className={filter === "all" ? "active" : ""} aria-pressed={filter === "all"} onClick={() => setFilter("all")}>All</button>
      <button type="button" className={filter === "survivors" ? "active" : ""} aria-pressed={filter === "survivors"} onClick={() => setFilter("survivors")}>Survivors</button>
      <button type="button" className={filter === "failures" ? "active" : ""} aria-pressed={filter === "failures"} onClick={() => setFilter("failures")}>Failures</button>
    </div>
    <div className="instrument-bar" role="group" aria-label="Volume view">
      <span className="instrument-label">View</span>
      <button type="button" onClick={() => applyView("iso")}>Iso</button>
      <button type="button" onClick={() => applyView("front")}>Front</button>
      <button type="button" onClick={() => applyView("depth")}>Return axis</button>
      <button type="button" onClick={() => applyView("top")}>Top</button>
      <button type="button" className={spinning ? "active" : ""} aria-pressed={spinning} onClick={() => setSpinning(!spinning)}>Auto-orbit</button>
      <button type="button" className={showSpine ? "active" : ""} aria-pressed={showSpine} onClick={() => setShowSpine(!showSpine)}>Percentile spine</button>
      <button type="button" onClick={() => { applyView("iso"); setRevealAge(95); setSlab(1); setFilter("all"); }}>Reset view</button>
      <span className="instrument-sep" />
      <span className="instrument-label">Paths</span>
      {[1_500, 6_000, 12_000].map((count) => <button key={count} type="button" className={pathCount === count ? "active" : ""} aria-pressed={pathCount === count} onClick={() => setPathCount(count)}>{count.toLocaleString()}</button>)}
    </div>
    <div className="volume-sliders">
      <label>Reveal to age <b>{revealAge}</b><input type="range" min={61} max={95} step={1} value={revealAge} onChange={(event) => setRevealAge(Number(event.target.value))} /></label>
      <label>Luck band (depth slab) <b>{slab >= 1 ? "all paths" : `±${(slab * 100).toFixed(0)}%`}</b><input type="range" min={0.06} max={1} step={0.02} value={slab} onChange={(event) => setSlab(Number(event.target.value))} /></label>
      <label>Volatility σ <b>{pct(volatility, 0)}</b><input type="range" min={0} max={0.2} step={0.01} value={volatility} onChange={(event) => setVolatility(Number(event.target.value))} /></label>
      <label>Slice age <b>{sliceAge}</b><input type="range" min={0} max={1} step={1 / 35} value={slicePosition} onChange={(event) => setSlicePosition(Number(event.target.value))} /></label>
    </div>
    <div className="volume-wrap" ref={wrapRef}>
      <canvas ref={canvasRef} className="volume-canvas" tabIndex={0}
        aria-label={`Three-dimensional probability volume of ${metricLabel} from age 60 to 95. Drag to ${tool}, scroll to zoom, arrow keys rotate, 1 to 4 select views.`}
        onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={endPointer} onPointerCancel={endPointer}
        onWheel={onWheel} onDoubleClick={() => applyView("iso")} onKeyDown={onKeyDown} />
      <canvas ref={overlayRef} className="volume-overlay" aria-hidden="true" />
    </div>
    <div className="volume-readout">
      <div><span>Paths with Pool A left at 95</span><b>{pct(survivalShare, 0)}</b><small>{simulation.survivors.toLocaleString()} of {simulation.paths.toLocaleString()} · not a forecast probability</small></div>
      <div><span>At age {sliceReadout?.age ?? sliceAge}</span><b>{sliceReadout ? `${compactMoney(sliceReadout.p5)} – ${compactMoney(sliceReadout.p95)}` : "—"}</b><small>P5 to P95 of {metricLabel}; median {sliceReadout ? money(sliceReadout.p50) : "—"}</small></div>
      <div><span>Broken by that age</span><b>{sliceReadout ? pct(sliceReadout.failed, 0) : "—"}</b><small>share of paths with Pool A already exhausted</small></div>
    </div>
    <div className="note"><b>Set σ to 0</b> and the cloud collapses onto the single bright deterministic line, because every path is a full canonical ledger with the sampled returns removed — the zero-volatility parity your gate enforces, made visible. The same 12% default, capped normal distribution and seeded sampling as the fan above apply; this does not forecast regimes, fees, legislation or spending shocks.</div>
  </section>;
}

function LineChart({ labels, series, height = 280 }: { labels: (string | number)[]; series: { name: string; values: number[]; color: string }[]; height?: number }) {
  const width = 920;
  const pad = { l: 78, r: 26, t: 28, b: 50 };
  const values = series.flatMap((s) => s.values).filter(Number.isFinite);
  const max = Math.max(...values, 1) * 1.08;
  const min = Math.min(0, ...values);
  const x = (i: number) => pad.l + (i / Math.max(1, labels.length - 1)) * (width - pad.l - pad.r);
  const y = (v: number) => pad.t + (1 - (v - min) / Math.max(1, max - min)) * (height - pad.t - pad.b);
  const ticks = [0, 0.25, 0.5, 0.75, 1];
  return (
    <div className="chart-shell" role="img" aria-label={`${series.map((s) => s.name).join(", ")} chart`}>
      <svg viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none">
        {ticks.map((t) => {
          const yy = pad.t + t * (height - pad.t - pad.b);
          const val = max - t * (max - min);
          return <g key={t}><line x1={pad.l} y1={yy} x2={width - pad.r} y2={yy} className="chart-grid" /><text x={pad.l - 12} y={yy + 4} textAnchor="end" className="chart-label">{compactMoney(val)}</text></g>;
        })}
        {labels.map((label, i) => (i % Math.max(1, Math.ceil(labels.length / 7)) === 0 || i === labels.length - 1) ? <text key={`${label}-${i}`} x={x(i)} y={height - 15} textAnchor="middle" className="chart-label">{label}</text> : null)}
        {series.map((s) => {
          const points = s.values.map((v, i) => `${x(i)},${y(v)}`).join(" ");
          return <g key={s.name}><polyline points={points} fill="none" stroke={s.color} strokeWidth="4" vectorEffect="non-scaling-stroke" /><g>{s.values.map((v, i) => <circle key={i} cx={x(i)} cy={y(v)} r="4.5" fill={s.color} vectorEffect="non-scaling-stroke"><title>{`${s.name}, ${labels[i]}: ${money(v)}`}</title></circle>)}</g></g>;
        })}
      </svg>
      <div className="chart-legend">{series.map((s) => <span key={s.name}><i style={{ background: s.color }} />{s.name}</span>)}</div>
    </div>
  );
}


function FanChart({ fan, targetAge }: { fan: ReturnType<typeof monteCarloFan>; targetAge: number }) {
  const width = 920;
  const height = 330;
  const pad = { l: 78, r: 24, t: 24, b: 46 };
  const max = Math.max(...fan.p90, 1) * 1.08;
  const x = (index: number) => pad.l + (index / Math.max(1, fan.ages.length - 1)) * (width - pad.l - pad.r);
  const y = (value: number) => pad.t + (1 - value / max) * (height - pad.t - pad.b);
  const area = (upper: number[], lower: number[]) => [
    ...upper.map((value, index) => `${x(index)},${y(value)}`),
    ...lower.map((value, index) => `${x(lower.length - 1 - index)},${y(lower[lower.length - 1 - index])}`),
  ].join(" ");
  const median = fan.p50.map((value, index) => `${x(index)},${y(value)}`).join(" ");
  const targetIndex = clamp(targetAge - 60, 0, fan.ages.length - 1);
  const [selectedIndex, setSelectedIndex] = useState(targetIndex);
  const selected = {
    age: fan.ages[selectedIndex],
    p10: fan.p10[selectedIndex],
    p25: fan.p25[selectedIndex],
    p50: fan.p50[selectedIndex],
    p75: fan.p75[selectedIndex],
    p90: fan.p90[selectedIndex],
  };
  const selectIndex = (index: number) => setSelectedIndex(clamp(index, 0, fan.ages.length - 1));
  const selectFromChartPosition = (clientX: number, element: SVGRectElement) => {
    const rect = element.getBoundingClientRect();
    const viewX = (clientX - rect.left) / Math.max(1, rect.width) * width;
    selectIndex(Math.round((viewX - pad.l) / Math.max(1, width - pad.l - pad.r) * (fan.ages.length - 1)));
  };
  return (
    <div className="chart-shell fan-chart">
      <svg viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none">
        {[0, .25, .5, .75, 1].map((tick) => {
          const yy = pad.t + tick * (height - pad.t - pad.b);
          return <g key={tick}><line x1={pad.l} y1={yy} x2={width - pad.r} y2={yy} className="chart-grid" /><text x={pad.l - 12} y={yy + 4} textAnchor="end" className="chart-label">{compactMoney(max * (1 - tick))}</text></g>;
        })}
        <polygon points={area(fan.p90, fan.p10)} className="fan-band fan-outer" />
        <polygon points={area(fan.p75, fan.p25)} className="fan-band fan-inner" />
        <polyline points={median} className="fan-median" />
        <line x1={x(targetIndex)} y1={pad.t} x2={x(targetIndex)} y2={height - pad.b} className="fan-target" />
        <circle cx={x(targetIndex)} cy={y(fan.p50[targetIndex])} r="6" className="fan-target-dot"><title>{`Median at age ${targetAge}: ${money(fan.p50[targetIndex])}`}</title></circle>
        <line x1={x(selectedIndex)} y1={pad.t} x2={x(selectedIndex)} y2={height - pad.b} className="fan-inspector-line" />
        <circle cx={x(selectedIndex)} cy={y(selected.p50)} r="5" className="fan-inspector-dot" />
        {fan.ages.map((age, index) => age % 5 === 0 || age === 95 ? <text key={age} x={x(index)} y={height - 14} textAnchor="middle" className="chart-label">{age}</text> : null)}
        <rect x={pad.l} y={pad.t} width={width - pad.l - pad.r} height={height - pad.t - pad.b} className="fan-hit-area" role="slider" tabIndex={0} aria-label="Capital simulation year inspector" aria-valuemin={fan.ages[0]} aria-valuemax={fan.ages[fan.ages.length - 1]} aria-valuenow={selected.age} aria-valuetext={`Age ${selected.age}: median ${money(selected.p50)}, 10th to 90th percentile ${money(selected.p10)} to ${money(selected.p90)}`} onClick={(event) => selectFromChartPosition(event.clientX, event.currentTarget)} onKeyDown={(event) => { if (event.key === "ArrowLeft" || event.key === "ArrowDown") { event.preventDefault(); selectIndex(selectedIndex - 1); } if (event.key === "ArrowRight" || event.key === "ArrowUp") { event.preventDefault(); selectIndex(selectedIndex + 1); } if (event.key === "Home") { event.preventDefault(); selectIndex(0); } if (event.key === "End") { event.preventDefault(); selectIndex(fan.ages.length - 1); } }}><title>Click or tap a year for exact percentile figures. With keyboard focus, use the arrow keys.</title></rect>
      </svg>
      <div className="chart-legend"><span><i className="legend-outer" />P10–P90</span><span><i className="legend-inner" />P25–P75</span><span><i className="legend-median" />Median</span><span><i className="legend-target" />Age {targetAge}</span></div>
      <div className="fan-inspector" aria-live="polite">
        <div className="fan-inspector-heading"><span>Selected year</span><b>Age {selected.age}</b><small>{selectedIndex === targetIndex ? "Selected target age" : `Year ${selectedIndex} of retirement`}</small></div>
        <div><span>P10</span><b>{money(selected.p10)}</b></div>
        <div><span>P25</span><b>{money(selected.p25)}</b></div>
        <div><span>Median</span><b>{money(selected.p50)}</b></div>
        <div><span>P75</span><b>{money(selected.p75)}</b></div>
        <div><span>P90</span><b>{money(selected.p90)}</b></div>
      </div>
      <p className="fan-inspector-hint">Click or tap the chart to inspect a year. Keyboard: focus the chart, then use the arrow keys.</p>
    </div>
  );
}

function FrontierCurve({ rail, selectedSpend, homeValue, realReturn, targetAge, taxYear, onSelect }: { rail: Rail; selectedSpend: number; homeValue: number; realReturn: number; targetAge: number; taxYear: TaxYear; onSelect: (value: number) => void }) {
  const spendValues = [...new Set([selectedSpend, ...Array.from({ length: 13 }, (_, index) => 80_000 + index * 5_000)])].sort((a, b) => a - b);
  const points = spendValues.map((candidateSpend) => {
    const capital = ledgerEndingAtAge(rail, candidateSpend, realReturn, targetAge, taxYear);
    return { spend: candidateSpend, capital, estate: capital + homeValue };
  });
  const width = 920;
  const height = 300;
  const pad = { l: 78, r: 28, t: 22, b: 52 };
  const minEstate = Math.min(...points.map((point) => point.estate)) * .92;
  const maxEstate = Math.max(...points.map((point) => point.estate)) * 1.03;
  const minSpend = Math.min(...spendValues);
  const maxSpend = Math.max(...spendValues);
  const x = (candidateSpend: number) => pad.l + ((candidateSpend - minSpend) / Math.max(1, maxSpend - minSpend)) * (width - pad.l - pad.r);
  const y = (candidateEstate: number) => pad.t + (1 - (candidateEstate - minEstate) / Math.max(1, maxEstate - minEstate)) * (height - pad.t - pad.b);
  const line = points.map((point) => `${x(point.spend)},${y(point.estate)}`).join(" ");
  const nearest = points.reduce((best, point) => Math.abs(point.spend - selectedSpend) < Math.abs(best.spend - selectedSpend) ? point : best, points[0]);
  return (
    <div className="frontier-curve">
      <div className="chart-shell" role="img" aria-label={`Interactive spending and age-${targetAge} estate frontier at ${pct(realReturn, 1)} real return`}>
        <svg viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none">
          {[0, .5, 1].map((tick) => { const yy = pad.t + tick * (height - pad.t - pad.b); return <g key={tick}><line x1={pad.l} y1={yy} x2={width - pad.r} y2={yy} className="chart-grid" /><text x={pad.l - 12} y={yy + 4} textAnchor="end" className="chart-label">{compactMoney(maxEstate - tick * (maxEstate - minEstate))}</text></g>; })}
          <polyline points={line} className="frontier-line" />
          {points.map((point) => {
            const active = point.spend === nearest.spend;
            const tone = point.capital >= 1_000_000 ? "safe" : point.capital >= 500_000 ? "watch" : "risk";
            return <circle key={point.spend} cx={x(point.spend)} cy={y(point.estate)} r={active ? 8 : 5} className={`frontier-point ${tone} ${active ? "active" : ""}`} role="button" tabIndex={0} aria-label={`${money(point.spend)} spending, ${money(point.estate)} estate`} onClick={() => onSelect(point.spend)} onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") onSelect(point.spend); }}><title>{`${money(point.spend)} spend → ${money(point.estate)} estate`}</title></circle>;
          })}
          {[...new Set([minSpend, 90_000, 100_000, 110_000, 120_000, 130_000, 140_000, maxSpend])].filter((value) => value >= minSpend && value <= maxSpend).sort((a, b) => a - b).map((candidateSpend) => <text key={candidateSpend} x={x(candidateSpend)} y={height - 16} textAnchor="middle" className="chart-label">${candidateSpend / 1000}k</text>)}
        </svg>
      </div>
      <label className="frontier-drag"><span>Drag annual spending <b>{money(selectedSpend)}</b></span><input type="range" min="76000" max={MAX_FLAT_SPEND} step="1000" value={selectedSpend} onChange={(event) => onSelect(Number(event.target.value))} /></label>
      <div className="frontier-readout"><span>Selected age-{targetAge} investments · {pct(realReturn, 1)} real <b>{money(nearest.capital)}</b></span><span>Property-inclusive estate <b>{money(nearest.estate)}</b></span></div>
    </div>
  );
}

function AdjustableControl({ label, value, min, max, step, baseline, scale = 1, format, onChange }: { label: string; value: number; min: number; max: number; step: number; baseline: number; scale?: number; format: (value: number) => string; onChange: (value: number) => void }) {
  const displayValue = Number((value * scale).toFixed(4));
  const set = (next: number) => onChange(clamp(Number((next / scale).toFixed(6)), min, max));
  return (
    <label className="precision-control">
      <span>{label}<b>{format(value)}</b></span>
      <input type="range" min={min} max={max} step={step} value={value} onChange={(event) => onChange(Number(event.target.value))} />
      <div className="precision-entry">
        <button type="button" aria-label={`Decrease ${label}`} onClick={() => onChange(clamp(value - step, min, max))}>−</button>
        <input aria-label={`${label} precise value`} inputMode="decimal" type="number" min={min * scale} max={max * scale} step={step * scale} value={displayValue} onChange={(event) => set(Number(event.target.value))} />
        <button type="button" aria-label={`Increase ${label}`} onClick={() => onChange(clamp(value + step, min, max))}>+</button>
        <small className={value === baseline ? "" : value > baseline ? "positive" : "negative"}>{value === baseline ? "Baseline" : `${value > baseline ? "+" : ""}${format(value - baseline)} vs baseline`}</small>
      </div>
    </label>
  );
}

function Metric({ label, value, sub, tone = "blue" }: { label: string; value: string; sub: string; tone?: "blue" | "green" | "amber" | "violet" }) {
  return <article className={`metric tone-${tone}`}><div className="metric-label">{label}</div><div className="metric-value">{value}</div><div className="metric-sub">{sub}</div><details className="metric-info"><summary aria-label={`Explain ${label}`}>Explain</summary><p><b>{label}</b> is shown for the active rail and assumptions. {sub}. Modelled outcomes are decision-support estimates rather than guaranteed results.</p></details></article>;
}

function Badge({ children, tone = "exact" }: { children: React.ReactNode; tone?: "exact" | "modelled" | "estimated" | "speculative" | "good" | "warn" }) {
  return <span className={`badge badge-${tone}`}>{children}</span>;
}

function SectionHeading({ eyebrow, title, copy }: { eyebrow: string; title: string; copy: string }) {
  return <div className="section-heading"><div className="eyebrow">{eyebrow}</div><h2>{title}</h2><p>{copy}</p></div>;
}

function CollapsiblePanel({ title, copy, meta, badge, children, className = "" }: { title: string; copy: string; meta: string; badge?: React.ReactNode; children: React.ReactNode; className?: string }) {
  const [open, setOpen] = useState(false);
  return <details className={`panel collapsible-panel ${className}`.trim()} open={open}>
    <summary onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); setOpen((value) => !value); } }} onClick={(event) => { event.preventDefault(); setOpen((value) => !value); }}>
      <div className="collapsible-heading"><h3>{title}</h3><p>{copy}</p><small>{meta}</small></div>
      <div className="collapsible-action">{badge}<span aria-hidden="true">⌄</span><b>{open ? "Hide details" : "Show details"}</b></div>
    </summary>
    <div className="collapsible-body">{children}</div>
  </details>;
}

function PlanNumberInput({value,min,max,step=1,onChange}: {value:number;min:number;max:number;step?:number;onChange:(n:number)=>void}) {
  const [draft,setDraft]=useState(String(value));
  useEffect(()=>setDraft(String(value)),[value]);
  const n=Number(draft);
  const valid=draft.trim()!=="" && Number.isFinite(n) && n>=min && n<=max && (step<1 || Number.isInteger(n));
  return <><input type="number" min={min} max={max} step={step} value={draft} aria-invalid={!valid}
    onChange={event=>{const text=event.target.value;setDraft(text);const number=Number(text);if(text!=="" && Number.isFinite(number) && number>=min && number<=max && (step<1 || Number.isInteger(number)))onChange(number);}}
    onBlur={()=>{if(!valid)setDraft(String(value));}} />
    {!valid && <small role="status">Enter {min.toLocaleString("en-AU")}–{max.toLocaleString("en-AU")}. The plan keeps its last valid value.</small>}</>;
}

type ExplorerPanel = "studio" | "cashflow" | "returns" | "map" | "trade";
const EXPLORER_PANELS: { key: ExplorerPanel; label: string; copy: string }[] = [
  {key:"studio",label:"Visual studio",copy:"Six illustrations of the same plan. Change the illustration or inspect an age without changing your assumptions."},
  {key:"cashflow",label:"Income by year",copy:"See pension income, portfolio draws, funded spending and any shortfall year by year."},
  {key:"returns",label:"Return comparison",copy:"Compare real-return paths with the same pension election and spending. This is sensitivity analysis, not a probability forecast."},
  {key:"map",label:"How it fits together",copy:"Follow the pension, investment pools, objectives and retirement milestones."},
];
function VisualExplorerPanel({scenario, theme, panel, view, onSpend, onView}: {
  scenario: ScenarioState; theme: Theme; panel: ExplorerPanel; view: string;
  onSpend: (value:number)=>void; onView: (value:string)=>void;
}) {
  const frameRef = useRef<HTMLIFrameElement>(null);
  const [height,setHeight]=useState(900);
  const [ready,setReady]=useState(false);
  const [expanded,setExpanded]=useState(false);
  const [source]=useState(()=>sharedPageUrl(`atlas.html?embedded=1&panel=${panel}&view=${view}`,scenario,theme));
  const sendScenario=()=>frameRef.current?.contentWindow?.postMessage({channel:"retirement-explorer-v1",type:"scenario",scenario,theme},window.location.origin);
  useLayoutEffect(()=>{
    const receive=(event:MessageEvent)=>{
      if(event.origin!==window.location.origin || event.source!==frameRef.current?.contentWindow || event.data?.channel!=="retirement-explorer-v1")return;
      const data=event.data;
      if(data.type==="ready"){setReady(true);sendScenario();}
      if(data.type==="close-focus")setExpanded(false);
      if(data.type==="height" && Number.isFinite(data.height))setHeight(clamp(Math.ceil(data.height),240,14000));
      if(data.type==="spend" && Number.isFinite(data.spend))onSpend(clamp(data.spend,76000,MAX_FLAT_SPEND));
      if(data.type==="view" && ["horizon","river","orbit","waterfall","sunburst","table"].includes(data.view))onView(data.view);
    };
    window.addEventListener("message",receive);
    sendScenario();
    return()=>window.removeEventListener("message",receive);
  },[scenario,theme,onSpend,onView]);
  useEffect(()=>{
    if(!expanded)return;
    const previous=document.body.style.overflow;
    document.body.style.overflow="hidden";
    const escape=(event:KeyboardEvent)=>{if(event.key==="Escape")setExpanded(false);};
    window.addEventListener("keydown",escape);
    return()=>{document.body.style.overflow=previous;window.removeEventListener("keydown",escape);};
  },[expanded]);
  return <section className={`integrated-explorer ${expanded?"expanded":""}`} aria-label="Interactive plan explorer">
    <div className="explorer-frame-toolbar"><span>{ready?"Uses your active Command Centre plan":"Loading the interactive view…"}<br/><b>Rail {scenario.rail} · {scenario.rail==="A"?"March control":scenario.pssElection==="100"?"100% pension":scenario.pssElection} · {money(scenario.spend)}/yr · {pct(scenario.realReturn,1)} real return · target age {scenario.targetAge}</b></span><button className="secondary" type="button" aria-pressed={expanded} onClick={()=>setExpanded(!expanded)}>{expanded?"Close focus view":"Focus view"}</button></div>
    <iframe ref={frameRef} src={source} title={`Retirement ${panel==="studio"?"six-view visual studio":panel}`} style={{height}} inert={!ready} aria-busy={!ready} onLoad={sendScenario} />
    {!ready && <p className="explorer-loading">Your scenario is being applied. If this stays here, <button type="button" className="secondary" onClick={()=>{const frame=frameRef.current;if(frame)frame.src=source;}}>retry the view</button>.</p>}
  </section>;
}

export default function RetirementDashboard() {
  const [section, setSection] = useState<SectionKey>("overview");
  const [scenarioTool,setScenarioTool]=useState<ScenarioTool>("lab");
  const [explorerPanel,setExplorerPanel]=useState<ExplorerPanel>("studio");
  const [visualView,setVisualView]=useState("horizon");
  const [railKey, setRailKey] = useState<RailKey>("B");
  const [pssElection, setPssElection] = useState<PssElectionKey>("70-30");
  const [pssProjectionBasis, setPssProjectionBasis] = useState<PssProjectionBasisKey>("source-825");
  const [spend, setSpend] = useState(110_000);
  const [riskEssentials, setRiskEssentials] = useState<number | null>(null);
  const [calendar, setCalendar] = useState<CalendarSettings | null>(null);
  const [importedPlan, setImportedPlan] = useState<{ planId?: string; modelRevision?: string } | null>(null);
  const [realReturn, setRealReturn] = useState(0.05);
  const [targetAge, setTargetAge] = useState(75);
  const [homeValue, setHomeValue] = useState(HOME_BASELINE);
  const [taxYear, setTaxYear] = useState<TaxYear>("2026-27");
  const [liquidityMonths, setLiquidityMonths] = useState(12);
  const [simulationSeed, setSimulationSeed] = useState(20260814);
  const [scenarioHydrated, setScenarioHydrated] = useState(false);
  const [theme, setTheme] = useState<Theme>(initialTheme);
  const [navOpen, setNavOpen] = useState(false);
  const [navCollapsed, setNavCollapsed] = useState<boolean>(() => {
    if (typeof window === "undefined") return false;
    try { return window.localStorage.getItem("robinson-retirement-nav-collapsed") === "1"; } catch { return false; }
  });

  useEffect(() => {
    try { window.localStorage.setItem("robinson-retirement-nav-collapsed", navCollapsed ? "1" : "0"); } catch { /* storage unavailable */ }
  }, [navCollapsed]);

  useEffect(() => {
    try { window.localStorage.setItem(THEME_STORAGE_KEY, theme); } catch { /* preference only */ }
    const pageUrl = new URL(window.location.href);
    if (pageUrl.searchParams.get("theme") !== theme) {
      pageUrl.searchParams.set("theme", theme);
      window.history.replaceState(null, "", `${pageUrl.pathname}${pageUrl.search}${pageUrl.hash}`);
    }
    document.querySelector('meta[name="theme-color"]')?.setAttribute("content", theme === "dark" ? "#071321" : "#eef3fb");
  }, [theme]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      const typing = !!target && (target.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName));
      if (event.key === "Escape" && navOpen) {
        setNavOpen(false);
        document.getElementById("nav-menu-button")?.focus();
        return;
      }
      if (typing || event.metaKey || event.ctrlKey || event.altKey) return;
      if (event.key === "[") { event.preventDefault(); setNavCollapsed((value) => !value); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [navOpen]);
  const [showLedger, setShowLedger] = useState(false);
  const [washCycles, setWashCycles] = useState(6);
  const [vrAge, setVrAge] = useState(57);
  const [vrMode, setVrMode] = useState<VrMode>("immediate");
  const [phase2, setPhase2] = useState(650);
  const [phase3, setPhase3] = useState(1_200);
  const [nominalReturn, setNominalReturn] = useState(HOSTPLUS_BASELINE_RETURN);
  const [cashflowAge, setCashflowAge] = useState(65);
  const [saved, setSaved] = useState<Record<string, SavedCommandPlan>>({});
  const [reviewSnapshot, setReviewSnapshot] = useState<ReviewSnapshot | null>(null);
  const [reviewChecks, setReviewChecks] = useState<Record<string, boolean>>({});
  const [actualReviewAge, setActualReviewAge] = useState(75);
  const [actualCheckpoints, setActualCheckpoints] = useState<Record<number, ActualReviewCheckpoint>>({});
  const importRef = useRef<HTMLInputElement>(null);

  const projectionBasis = PSS_PROJECTION_BASES[pssProjectionBasis];
  const activePssElections = electionsForBasis(pssProjectionBasis);
  const activePssElectionKeys = electionKeysForBasis(pssProjectionBasis);
  const effectivePssElection = normaliseElectionForBasis(pssProjectionBasis, pssElection);
  const rail = useMemo(() => railFor(railKey, effectivePssElection, pssProjectionBasis), [railKey, effectivePssElection, pssProjectionBasis]);
  const portfolioDraw = Math.max(0, spend - rail.netPension);
  const firstYearStatutoryMinimum = firstPensionFinancialYear(rail.poolA, 60, PLANNED_RETIREMENT_DATE).minimum;
  const pssSurplus = Math.max(0, rail.netPension - spend);
  const ledger = useMemo(() => operationalLedger(rail, spend, realReturn, taxYear), [rail, spend, realReturn, taxYear]);
  const firstUnfundedYear = ledger.find((row) => !row.isOpening && row.shortfall > 0);
  const endCapital = ledger.find((row) => row.age === targetAge)?.ending ?? rail.capital;
  const estate = endCapital + homeValue;
  const grossEquivalent = grossForNet(spend, taxYear);
  const fan = useMemo(() => monteCarloFan(rail, spend, realReturn, taxYear, .12, 600, simulationSeed, riskEssentials), [rail, spend, realReturn, taxYear, simulationSeed, riskEssentials]);
  const trajectoryLabels = Array.from({ length: Math.max(1, targetAge - 60 + 1) }, (_, i) => 60 + i);
  const trajectoryReturns = [...new Set([0.04, realReturn, 0.065].map((value) => Number(value.toFixed(4))))].sort((a, b) => a - b);
  const trajectorySeries = trajectoryReturns.map((r, i) => ({
    name: `${pct(r, 1)} real${r === realReturn ? " · active" : " · comparison"}`,
    color: r === realReturn ? "#47d6a0" : ["#f3a950", "#6f8cff", "#9d79ff"][i],
    values: trajectoryLabels.map((age) => ledgerEndingAtAge(rail, spend, r, age, taxYear)),
  }));
  const currentPf = 2_908.56;
  const retirementPf = spend / 26;
  const liquidityTarget = portfolioDraw * liquidityMonths / 12;
  const liquidityGap = Math.max(0, liquidityTarget - rail.poolC);
  const currentScenario = useMemo<ScenarioState>(() => ({ rail: railKey, pssElection: effectivePssElection, pssProjectionBasis, spend, realReturn, targetAge, homeValue, taxYear, liquidityMonths, simulationSeed }), [railKey, effectivePssElection, pssProjectionBasis, spend, realReturn, targetAge, homeValue, taxYear, liquidityMonths, simulationSeed]);
  const commandPlan = useMemo(() => planReceipt({
    workspace: "command-centre", modelRevision: RETIREMENT_ENGINE_VERSION, source: rail.source,
    sourceDate: pssEstimateDate(currentScenario.rail, currentScenario.pssProjectionBasis, currentScenario.pssElection),
    poolCPolicy: "preserve", periodConvention: "Birthday to birthday · opening balance at age 60",
    simulationSeed: currentScenario.simulationSeed,
    assumptions: { ...currentScenario, netPension: rail.netPension, openingA: rail.poolA, openingC: rail.poolC, riskEssentials, washCycles, calendar },
  }), [currentScenario, rail, riskEssentials, washCycles, calendar]);
  const applyCommandPlan = (candidate: Partial<ScenarioState>) => {
    const s = normaliseCommandPlan(candidate);
    setRailKey(s.rail); setPssElection(s.pssElection); setPssProjectionBasis(s.pssProjectionBasis);
    setSpend(s.spend); setRealReturn(s.realReturn); setTargetAge(s.targetAge); setHomeValue(s.homeValue);
    setTaxYear(s.taxYear); setLiquidityMonths(s.liquidityMonths); setSimulationSeed(s.simulationSeed);
  };
  const vrBasis = railKey === "A" ? PSS_PROJECTION_BASES["source-825"] : projectionBasis;
  const vrImmediatePaths = VR_AGES.map((age) => vrScenarioPath(rail, vrBasis, realReturn, age, "immediate"));
  const vrPreservePaths = VR_AGES.map((age) => vrScenarioPath(rail, vrBasis, realReturn, age, "preserve"));
  const selectedVrImmediate = vrImmediatePaths.find((row) => row.age === vrAge)!;
  const selectedVrPreserve = vrPreservePaths.find((row) => row.age === vrAge)!;
  const selectedVrPath = vrMode === "immediate" ? selectedVrImmediate : selectedVrPreserve;
  const v23SpendPlanUrl = sharedPageUrl("deep-model.html?page=income", currentScenario, theme);
  const v23DecisionUrl = sharedPageUrl("deep-model.html?page=decisionbrief", currentScenario, theme);
  const v23PolicyUrl = sharedPageUrl("deep-model.html?page=guardrails", currentScenario, theme);
  const atlasUrl = sharedPageUrl("?section=scenario&tool=explore", currentScenario, theme);
  const targetIndex = clamp(targetAge - 60, 0, fan.ages.length - 1);
  const targetProbability = fan.paths[targetIndex].filter((value) => value >= 500_000).length / Math.max(1, fan.paths[targetIndex].length);
  const wash = washOutcome(rail, washCycles);
  const taxableStart = wash.taxableStart;
  const taxableRemaining = wash.taxableRemaining;
  const dbtStart = taxableStart * 0.17;
  const dbtRemaining = taxableRemaining * 0.17;
  const dbtSaved = dbtStart - dbtRemaining;
  const aiContext: Record<string, unknown> = {
    metadata: {
      modelVersion: "2026-09-02.vr-scenario-aware.1",
      baselineDate: "September 2026 PSS election release",
      currency: "AUD",
      valueBasis: "Real dollars unless specifically labelled nominal",
      activeSection: section,
      retirementDate: "2033-12-21",
      retirementAge: 60,
    },
    activeScenario: {
      rail: railKey,
      pssElection: effectivePssElection,
      pssProjectionBasis,
      pssProjectionBasisLabel: projectionBasis.label,
      pssElectionLabel: rail.electionLabel,
      railName: rail.name,
      railPurpose: rail.purpose,
      railSource: rail.source,
      annualNetSpending: spend,
      realReturn,
      targetAge,
      homeValue,
      taxYear,
      liquidityMonths,
      liquidityTarget,
      simulationSeed,
      annualPortfolioDraw: portfolioDraw,
      annualPssSurplusBeforePortfolioDraw: pssSurplus,
      firstUnfundedPlanningYear: firstUnfundedYear?.year ?? null,
      firstUnfundedPlanningYearShortfall: firstUnfundedYear?.shortfall ?? 0,
      firstFinancialYearMinimumIllustration: firstYearStatutoryMinimum,
      modelledInvestmentCapitalAtTarget: endCapital,
      modelledGrossEstateAtTarget: estate,
      salaryGrossEquivalent: grossEquivalent,
      retirementNetPerFortnight: retirementPf,
      currentVisibleBankReceiptPerFortnight: currentPf,
    },
    governedRails: RAILS,
    governedPssElections: activePssElections,
    governedPssProjectionBases: PSS_PROJECTION_BASES,
    controls: {
      generalTransferBalanceCap: TBC,
      transferBalanceBuffer: TSB_BUFFER,
      poolCModelledDistributionDrag: POOL_C_DRAG,
      retirementDollarBasis: "real",
      railDifference: "Rail B uses the selected 1 September 2026 CSC election. Rail A preserves the March/V5 control baseline. Spending does not create the pension difference.",
      providerProjectionAssumptions: `${projectionBasis.label}: ${pct(projectionBasis.fundEarnings, 1)} fund earnings, ${pct(projectionBasis.salaryGrowth, 1)} salary growth and ${pct(projectionBasis.cpi, 1)} CPI before retirement. This source basis is separate from the active post-retirement ${pct(realReturn, 1)} real-return assumption.`,
    },
    deterministicTrajectories: trajectorySeries.map((series) => ({ name: series.name, ages: trajectoryLabels, values: series.values })),
    probabilityLens: {
      method: "600 reproducible three-pool simulations with the selected flat-spend lens, annual statutory draws, Pool C routing, a constant selected mean and 12% annual volatility",
      seed: simulationSeed,
      targetThreshold: 500_000,
      probabilityAtSelectedTarget: targetProbability,
      ages: fan.ages,
      percentile10: fan.p10,
      percentile25: fan.p25,
      percentile50: fan.p50,
      percentile75: fan.p75,
      percentile90: fan.p90,
      limitation: "A stress-test frequency, not a forecast probability. It preserves the Command Centre's flat-spend, three-pool routing but excludes market regimes, product fees, future legislation, provider financial-year payment timing and personal spending shocks. Raw paths are omitted from the chat payload; governed percentile curves and the exact target test are supplied.",
    },
    operationalLedger: ledger,
    nccWash: {
      componentEvidence: rail.washEvidence,
      completedCycles: washCycles,
      availableCycles: wash.maxCycles,
      totalPssLumpWashed: wash.washed,
      annualWash: 130_000,
      taxableShare: rail.washTaxableShare,
      deathBenefitTaxRate: 0.17,
      taxableComponentAtStart: taxableStart,
      taxableComponentRemaining: taxableRemaining,
      illustrativeDeathBenefitTaxAtStart: dbtStart,
      illustrativeDeathBenefitTaxRemaining: dbtRemaining,
      illustrativeDeathBenefitTaxSaved: dbtSaved,
      executionControl: "Commute from the original taxable interest and recontribute as a distinct tax-free interest. Confirm Hostplus can maintain the required separate interests before acting.",
      comparators: ["Separate-interest strategy", "Merged-interest warning comparator"],
    },
    voluntaryRedundancy: {
      classification: "Illustrative scenario calibrated to the March/V5 age factors; not a CSC estimate",
      selectedAge: vrAge,
      selectedMode: vrMode,
      activeRail: railKey,
      activeElection: rail.electionLabel,
      providerBasis: railKey === "A" ? "March/V5 historical control" : projectionBasis.label,
      providerCpi: vrBasis.cpi,
      postRetirementRealReturn: realReturn,
      immediatePensionPath: vrImmediatePaths,
      preserveTo60Path: vrPreservePaths,
      formalEvidenceRequired: "CSC VR estimates at ages 57, 58 and 59 for each election under consideration, including pension and lump tax components",
    },
    preRetirement: { phase2ContributionPerFortnight: phase2, phase3ContributionPerFortnight: phase3, nominalReturn, hostplusStartingBalance: HOSTPLUS_STARTING_BALANCE, workbookReconciledAt8Percent: projectHostplusAt60(650, 1_200, HOSTPLUS_BASELINE_RETURN), upperPlanningAnchor: 317_447.66 },
    savedScenarios: saved,
    annualReview: { snapshot: reviewSnapshot, checks: reviewChecks, actualCheckpoints },
    comparisonPlans: COMPARISON_PLANS,
    sourceRegister: SOURCES,
    links: { activeV23Scenario: v23SpendPlanUrl, activeAtlasScenario: atlasUrl, modelReference: "/model-reference.html", modelReferenceText: "/model-reference.txt" },
  };

  useEffect(() => {
    const normalised = normaliseElectionForBasis(pssProjectionBasis, pssElection);
    if (normalised !== pssElection) setPssElection(normalised);
  }, [pssProjectionBasis, pssElection]);

  useEffect(() => {
    const timer = setTimeout(() => {
      try {
        const params = new URLSearchParams(window.location.search);
        const requestedSection=params.get("section");
        const legacyTool:Partial<Record<SectionKey,ScenarioTool>>={scenario:"lab",visuals:"explore",compare:"compare",frontier:"frontier",risk:"risk"};
        if(requestedSection && legacyTool[requestedSection as SectionKey]){
          setSection("scenario");
          const requestedTool=params.get("tool");
          setScenarioTool(SCENARIO_TOOLS.some(item=>item.key===requestedTool)?requestedTool as ScenarioTool:legacyTool[requestedSection as SectionKey]!);
        }else if(NAV.some(item=>item.key===requestedSection))setSection(requestedSection as SectionKey);
        if(EXPLORER_PANELS.some(item=>item.key===params.get("panel")))setExplorerPanel(params.get("panel") as ExplorerPanel);
        if(["horizon","river","orbit","waterfall","sunburst","table"].includes(params.get("view")||""))setVisualView(params.get("view")!);
        const activeScenario = localStorage.getItem("robinson-retirement-shared-scenario");
        const raw = localStorage.getItem("robinson-retirement-scenarios");
        const snapshot = localStorage.getItem("robinson-retirement-review-snapshot");
        const checks = localStorage.getItem("robinson-retirement-review-checks");
        const actuals = localStorage.getItem("robinson-retirement-actual-checkpoints");
        const savedCalendar = localStorage.getItem(PAYMENT_CALENDAR_KEY);
        if (savedCalendar) {
          try { setCalendar(readCalendarSettings(JSON.parse(savedCalendar))); } catch { /* use the modelled calendar */ }
        }
        const storedWashCycles = localStorage.getItem(WASH_CYCLES_KEY);
        if (storedWashCycles !== null && Number.isInteger(Number(storedWashCycles)) && Number(storedWashCycles) >= 0) setWashCycles(Number(storedWashCycles));
        const savedEssentials = localStorage.getItem(RISK_ESSENTIALS_KEY);
        if (savedEssentials !== null && Number.isFinite(Number(savedEssentials)) && Number(savedEssentials)>=0) {
          setRiskEssentials(Number(savedEssentials));
        }
        if (params.get("shared") === "1") {
          const optionalNumber = (key: string) => params.has(key) && params.get(key) !== "" ? Number(params.get(key)) : undefined;
          applyCommandPlan({ rail: params.get("rail") === "A" ? "A" : "B", pssElection: (["60-40", "65-35", "70-30", "100"] as string[]).includes(String(params.get("pss"))) ? params.get("pss") as PssElectionKey : "70-30", pssProjectionBasis: normaliseProjectionBasis(params.get("basis")), spend: optionalNumber("spend"), realReturn: optionalNumber("return"), targetAge: optionalNumber("age"), homeValue: optionalNumber("home"), taxYear: params.get("taxYear") === "2027-28" ? "2027-28" : "2026-27", liquidityMonths: optionalNumber("reserveMonths"), simulationSeed: optionalNumber("seed") });
        } else if (activeScenario) {
          const cached = JSON.parse(activeScenario) as Partial<ScenarioState> & { defaultsVersion?: number };
          // Default operating basis since 2026-10-03: Rail B 70/30. Caches written before defaultsVersion 2 that still
          // sit on the old defaults (Rail A, or Rail B 60/40 on the current source basis) migrate once; later choices are kept.
          const legacyDefault = Number(cached.defaultsVersion || 0) < SCENARIO_DEFAULTS_VERSION && (cached.rail === "A" || ((cached.pssElection ?? "60-40") === "60-40" && normaliseProjectionBasis(cached.pssProjectionBasis) === "source-825"));
          applyCommandPlan(legacyDefault ? { ...cached, rail: "B", pssElection: "70-30", pssProjectionBasis: "source-825" } : cached);
        }
        if (raw) setSaved(JSON.parse(raw));
        if (snapshot) setReviewSnapshot(JSON.parse(snapshot));
        if (checks) setReviewChecks(JSON.parse(checks));
        if (actuals) setActualCheckpoints(JSON.parse(actuals));
      } catch { /* local preference only */ }
      setScenarioHydrated(true);
    }, 0);
    if ("serviceWorker" in navigator) navigator.serviceWorker.register(siteAsset("sw.js")).catch(() => undefined);
    return () => clearTimeout(timer);
  }, []);

  useEffect(() => {
    if (!scenarioHydrated) return;
    try {
      localStorage.setItem("robinson-retirement-shared-scenario", JSON.stringify({ version: 7, defaultsVersion: SCENARIO_DEFAULTS_VERSION, updatedAt: new Date().toISOString(), ...currentScenario }));
      localStorage.setItem(WASH_CYCLES_KEY, String(washCycles));
    } catch { /* local preference only */ }
    const query=new URLSearchParams(sharedScenarioParams(currentScenario,theme));
    query.set("section",section);
    if(section==="scenario"){
      query.set("tool",scenarioTool);
      if(scenarioTool==="explore"){query.set("panel",explorerPanel);query.set("view",visualView);}
    }
    window.history.replaceState(null,"",`${window.location.pathname}?${query}`);
  }, [currentScenario, scenarioHydrated, theme, section, scenarioTool, explorerPanel, visualView, washCycles]);

  useEffect(() => {
    const closeOnEscape = (event: KeyboardEvent) => { if (event.key === "Escape") setNavOpen(false); };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, []);

  const go = (key: SectionKey) => {
    const tools:Partial<Record<SectionKey,ScenarioTool>>={scenario:"lab",visuals:"explore",compare:"compare",frontier:"frontier",risk:"risk"};
    if(tools[key]){setScenarioTool(tools[key]!);setSection("scenario");}
    else setSection(key);
    setNavOpen(false);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const openScenarioTool=(tool:ScenarioTool)=>{
    setScenarioTool(tool);
    setSection("scenario");
    setNavOpen(false);
    window.scrollTo({top:0,behavior:"smooth"});
  };

  const saveSlot = (slot: string) => {
    const next = { ...saved, [slot]: { ...currentScenario, plan: commandPlan, calendar, riskEssentials, washCycles } };
    setSaved(next);
    localStorage.setItem("robinson-retirement-scenarios", JSON.stringify(next));
  };

  const loadSlot = (slot: string) => {
    const s = saved[slot];
    if (!s) return;
    applyCommandPlan(s);
    if (s.calendar !== undefined) applyCalendar(s.calendar);
    if (s.riskEssentials !== undefined) applyRiskEssentials(s.riskEssentials);
    if (typeof s.washCycles === "number") setWashCycles(s.washCycles);
  };

  const applyComparisonPlan = (plan: ComparisonPlan) => {
    setRailKey(plan.rail);
    setSpend(plan.spend);
  };

  const chooseProjectionBasis = (basisKey: PssProjectionBasisKey) => {
    const nextBasis = normaliseProjectionBasis(basisKey);
    const nextElection = normaliseElectionForBasis(nextBasis, effectivePssElection);
    const nextRail = railBForElection(nextElection, nextBasis);
    setPssProjectionBasis(nextBasis);
    setPssElection(nextElection);
    setRailKey("B");
    setWashCycles(nextRail.lumpSum > 0 ? Math.ceil(nextRail.lumpSum / 130_000) : 0);
  };

  const captureReview = () => {
    const annualForecast = Object.fromEntries(ledger.filter(row=>!row.isOpening).map(row=>[row.age,forecastForReview(row)]));
    const snapshot: ReviewSnapshot = { ...currentScenario, capturedAt: new Date().toISOString(), endCapital, estate, annualForecast, plan: commandPlan };
    setReviewSnapshot(snapshot);
    localStorage.setItem("robinson-retirement-review-snapshot", JSON.stringify(snapshot));
  };

  const toggleReviewCheck = (key: string) => {
    const next = { ...reviewChecks, [key]: !reviewChecks[key] };
    setReviewChecks(next);
    localStorage.setItem("robinson-retirement-review-checks", JSON.stringify(next));
  };

  const updateActualCheckpoint = (field: "capital" | "spending" | "pension", rawValue: string) => {
    const value = rawValue === "" ? null : Number(rawValue);
    if (value !== null && (!Number.isFinite(value) || value < 0)) return;
    const current = actualCheckpoints[actualReviewAge] ?? EMPTY_CHECKPOINT;
    const reviewedAt = new Date().toISOString();
    const hasActual = [current.capital,current.spending,current.pension].some(item=>typeof item==="number");
    const snapshotRow = reviewSnapshot?.annualForecast?.[actualReviewAge];
    const ledgerRow = ledger.find(row=>row.age===actualReviewAge&&!row.isOpening);
    let baseline = current.baseline;
    if (!baseline && !hasActual && value !== null && ledgerRow) {
      baseline = snapshotRow && reviewSnapshot
        ? { ...snapshotRow, capturedAt: reviewSnapshot.capturedAt, origin: "snapshot" }
        : { ...forecastForReview(ledgerRow), capturedAt: reviewedAt, origin: "first-entry" };
    }
    const next = { ...actualCheckpoints, [actualReviewAge]: { ...current, [field]: value, reviewedAt, baseline } };
    setActualCheckpoints(next);
    localStorage.setItem("robinson-retirement-actual-checkpoints", JSON.stringify(next));
  };

  const updateActualCheckpointNote = (note: string) => {
    const current = actualCheckpoints[actualReviewAge] ?? EMPTY_CHECKPOINT;
    const next = { ...actualCheckpoints, [actualReviewAge]: { ...current, note, reviewedAt: new Date().toISOString() } };
    setActualCheckpoints(next);
    localStorage.setItem("robinson-retirement-actual-checkpoints", JSON.stringify(next));
  };

  const applyRiskEssentials = (value: number | null) => {
    setRiskEssentials(value);
    if (value === null) localStorage.removeItem(RISK_ESSENTIALS_KEY);
    else localStorage.setItem(RISK_ESSENTIALS_KEY, String(value));
  };
  const applyCalendar = (value: CalendarSettings | null) => {
    setCalendar(value);
    try {
      if (value === null) localStorage.removeItem(PAYMENT_CALENDAR_KEY);
      else localStorage.setItem(PAYMENT_CALENDAR_KEY, JSON.stringify(value));
    } catch { /* the calendar remains usable in this session */ }
  };

  const exportSettings = () => {
    const payload = { version: "2026-11-26.review.9", exportedAt: new Date().toISOString(), current: currentScenario, plan: commandPlan, saved, reviewSnapshot, reviewChecks, actualCheckpoints, riskEssentials, calendar, washCycles };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href = url; a.download = `robinson-retirement-${commandPlan.planId}.json`; a.click(); URL.revokeObjectURL(url);
  };

  const importSettings = async (file?: File) => {
    if (!file) return;
    try {
      const parsed = JSON.parse(await file.text());
      if (parsed.plan?.workspace === "v23" || parsed.state && !parsed.current) {
        alert("Open this detailed plan export in V23.");
        return;
      }
      if (parsed.current) applyCommandPlan(parsed.current);
      if (parsed.saved && typeof parsed.saved === "object") {
        setSaved(parsed.saved); localStorage.setItem("robinson-retirement-scenarios", JSON.stringify(parsed.saved));
      }
      if (parsed.reviewSnapshot) {
        setReviewSnapshot(parsed.reviewSnapshot); localStorage.setItem("robinson-retirement-review-snapshot", JSON.stringify(parsed.reviewSnapshot));
      }
      if (parsed.reviewChecks && typeof parsed.reviewChecks === "object") {
        setReviewChecks(parsed.reviewChecks); localStorage.setItem("robinson-retirement-review-checks", JSON.stringify(parsed.reviewChecks));
      }
      if (parsed.actualCheckpoints && typeof parsed.actualCheckpoints === "object") {
        setActualCheckpoints(parsed.actualCheckpoints); localStorage.setItem("robinson-retirement-actual-checkpoints", JSON.stringify(parsed.actualCheckpoints));
      }
      if (parsed.riskEssentials === null || (Number.isFinite(parsed.riskEssentials) && parsed.riskEssentials >= 0)) applyRiskEssentials(parsed.riskEssentials);
      if (parsed.calendar === null) applyCalendar(null);
      else if (parsed.calendar) applyCalendar(readCalendarSettings(parsed.calendar));
      if (Number.isInteger(parsed.washCycles) && parsed.washCycles >= 0) setWashCycles(parsed.washCycles);
      setImportedPlan(parsed.plan ?? {});
    } catch { alert("That file is not a valid retirement scenario export."); }
  };

  const renderOverview = () => (
    <>
      <section className="hero">
        <div className="hero-copy">
          <div className="eyebrow">Integrated retirement command centre · September 2026 PSS election release</div>
          <h1>Your pension provides an indexed base.<br /><span>Your capital supports choices.</span></h1>
          <p>Use the model to test how today's spending affects later capital and estate value, then check the assumptions and shortfall years before choosing a plan.</p>
          <div className="hero-actions">
            <button className="primary" onClick={() => go("scenario")}>Run a scenario</button>
            <button className="secondary" onClick={() => go("frontier")}>Inspect the frontier</button>
            <a className="secondary" href={v23SpendPlanUrl} target="_blank" rel="noreferrer">Set age-band spending in V23 ↗</a>
            <a className="secondary" href={v23DecisionUrl} target="_blank" rel="noreferrer">Open V23 Decision Brief</a>
            <button className="secondary" onClick={() => go("visuals")}>Explore the plan</button>
          </div>
        </div>
        <div className="hero-rail">
          <div className="rail-switch" role="group" aria-label="Select modelling rail">
            {(["A", "B"] as RailKey[]).map((key) => <button type="button" key={key} className={railKey === key ? "active" : ""} aria-pressed={railKey === key} onClick={() => setRailKey(key)}><b>Rail {key}</b><span>{key === "A" ? RAILS.A.short : railBForElection(effectivePssElection, pssProjectionBasis).short}</span></button>)}
          </div>
          <div className="rail-note"><Badge tone={railKey === "A" ? "modelled" : "exact"}>{rail.source}</Badge><p>{rail.purpose}</p><p><b>Two return systems:</b> Rail B’s pension and lump figures come from the {lowerFirst(projectionBasis.label)} ({pct(projectionBasis.fundEarnings, 1)} fund earnings · {pct(projectionBasis.salaryGrowth, 1)} salary growth · {pct(projectionBasis.cpi, 1)} CPI before retirement). The site’s {pct(realReturn, 1)} control begins at retirement and is a separate real investment return.</p></div>
          <div className="projection-basis-compact" aria-label="Active PSS projection basis">
            <div><span>Before retirement · CSC source</span><b>{projectionBasis.shortLabel}%</b><small>Fund / salary / CPI · {pct(projectionBasis.realFundEarnings, 2)} real fund equivalent</small></div>
            <i aria-hidden="true">→</i>
            <div><span>After retirement · site model</span><b>{pct(realReturn, 1)} real</b><small>Active portfolio return · automatically updates projections</small></div>
          </div>
          <div className="election-switch" role="group" aria-label="Select PSS retirement election">
            {activePssElectionKeys.map((key) => activePssElections[key]!).map((option) => <button type="button" key={option.key} className={effectivePssElection === option.key && railKey === "B" ? "active" : ""} aria-pressed={effectivePssElection === option.key && railKey === "B"} onClick={() => { setPssElection(option.key); setRailKey("B"); setWashCycles(option.lumpSum > 0 ? Math.ceil(option.lumpSum / 130_000) : 0); }}><b>{option.key === "100" ? "100% pension" : option.key}</b><span>{money(option.netPension)} net · {money(option.lumpSum)} lump</span></button>)}
          </div>
        </div>
      </section>

      <div className="metrics four">
        <Metric label="Indexed PSS net floor" value={money(rail.netPension)} sub={`${fmt1.format(rail.netPension / 26)} per fortnight · ${rail.electionLabel}`} tone="violet" />
        <Metric label="Flexible capital at 60" value={money(rail.capital)} sub={`${money(rail.lumpSum)} PSS lump + ${money(rail.hostplus)} Hostplus`} />
        <Metric label={`Investments at ${targetAge}`} value={money(endCapital)} sub={`${pct(realReturn, 1)} real · reconciled age-${targetAge} ledger`} tone="green" />
        <Metric label={`Gross modelled estate at ${targetAge}`} value={money(estate)} sub={`${pct(realReturn, 1)} real · includes ${money(homeValue)} home · before costs and residual DBT`} tone="amber" />
      </div>

      <section className="panel decision-banner">
        <div><Badge tone="modelled">Reference spending range</Badge><h3>$100,000–$110,000 net a year</h3><p>A useful flat-spending comparison under the stated assumptions. Check funded spending, later capital and your own needs before choosing a target.</p></div>
        <div className="comparison-stat"><span>Selected spend</span><strong>{fmt1.format(retirementPf)} / pf</strong><small>{money(grossEquivalent)} salary equivalent</small></div>
        <div className="comparison-stat"><span>Current cash after all expenses</span><strong>{fmt1.format(currentPf)} / pf</strong><small>After current expenses, commitments and deductions</small></div>
        <div className="comparison-stat positive"><span>Cashflow uplift</span><strong>+{fmt1.format(retirementPf - currentPf)} / pf</strong><small>{pct(retirementPf / currentPf - 1)} above current after-expense cashflow</small></div>
      </section>

      <section className="panel explorer-intro"><div><Badge tone="good">Now together in Command Centre</Badge><h3>Your whole plan, six ways to see it.</h3><p>Explore the 3D horizon, financial river, legacy orbit, waterfall, sunburst and exact annual table. They use this same {pct(realReturn,1)} real return and {money(spend)} flat annual spend.</p></div><button type="button" className="primary" onClick={()=>go("visuals")}>Open interactive explorer</button></section>

      <section className="panel spending-handoff" aria-labelledby="spending-handoff-title">
        <div className="spending-handoff-copy">
          <Badge tone="modelled">Two-level spending plan</Badge>
          <h3 id="spending-handoff-title">Command Centre tests a flat annual-spending lens.</h3>
          <p>The selected {money(spend)} is held constant in real dollars for every retirement year here. That makes the capital, estate and risk trade-offs comparable, but it is a starting point—not your detailed spending schedule.</p>
        </div>
        <div className="spending-handoff-cta">
          <span>Fine-tune the actual plan in V23</span>
          <b>Set the gap and drawdown periods by age</b>
          <small>For example, set different gaps from ages 60, 63 and 75. V23 applies those bands across its income, drawdown and capital views.</small>
          <a className="primary" href={v23SpendPlanUrl} target="_blank" rel="noreferrer">Set age bands in Income &amp; draws ↗</a>
        </div>
      </section>

      <section className="next-actions" aria-label="Recommended next actions">
        <button onClick={() => go("compare")}><span>1</span><div><b>Compare three plans</b><small>Baseline · lifestyle · estate</small></div></button>
        <button onClick={() => go("risk")}><span>2</span><div><b>Stress the plan</b><small>Simulations · sequence · cashflow</small></div></button>
        <button onClick={() => go("review")}><span>3</span><div><b>Complete annual review</b><small>Changes · sources · action checklist</small></div></button>
      </section>

      <CollapsiblePanel title="Quick capital comparison" copy={`Same spending · ${pct(realReturn,1)} real active return · home excluded`} meta="Open return paths">
        <LineChart labels={trajectoryLabels} series={trajectorySeries} />
      </CollapsiblePanel>
    </>
  );

  const renderScenario = () => (
    <>
      <SectionHeading eyebrow="Decision engine" title="Scenario lab" copy="Test one flat real annual-spend assumption at a time, preserve rail identity, and see capital, income and estate effects immediately. Set an age-by-age schedule in V23." />
      <section className="scenario-layout">
        <aside className="control-panel">
          <div className="control-hint"><Badge tone="modelled">Flat comparison lens</Badge><p>The spending control below is held constant in real dollars each year. Use V23 when the plan needs different age bands or drawdown periods.</p><a href={v23SpendPlanUrl} target="_blank" rel="noreferrer">Set age bands in V23 ↗</a></div>
          <label>Modelling rail<select value={railKey} onChange={(e) => setRailKey(e.target.value as RailKey)}><option value="A">Rail A — conservative wealth</option><option value="B">Rail B — spending frontier</option></select></label>
          <label>PSS projection basis<select value={pssProjectionBasis} onChange={(e) => chooseProjectionBasis(normaliseProjectionBasis(e.target.value))}><option value="source-825">Current source · 8.2% / 5% / 2.5% · 4 elections</option><option value="prudent-630">Prudent · 6% / 5% / 3% · 4 elections</option></select><small className="control-help">This provider basis creates the retirement-day PSS figures. It does not replace the separate real-return control below.</small></label>
          <label>PSS election<select value={effectivePssElection} onChange={(e) => { const next = normaliseElectionForBasis(pssProjectionBasis, e.target.value); const option = activePssElections[next]!; setPssElection(next); setRailKey("B"); setWashCycles(option.lumpSum > 0 ? Math.ceil(option.lumpSum / 130_000) : 0); }}>{activePssElectionKeys.map((key) => activePssElections[key]!).map((option) => <option key={option.key} value={option.key}>{option.label}</option>)}</select><small className="control-help">Selecting an election updates pension, lump, TBC, pools, drawdown, surplus and wash capacity everywhere. Both provider bases have four direct elections; the prudent 100% pension estimate is from 9 September, after the other prudent estimates.</small></label>
          <AdjustableControl label="Flat net annual spend" value={spend} min={76_000} max={MAX_FLAT_SPEND} step={1_000} baseline={110_000} format={money} onChange={setSpend} />
          <AdjustableControl label="Real investment return" value={realReturn} min={0.02} max={0.075} step={0.005} baseline={0.05} scale={100} format={(value) => pct(value, 1)} onChange={setRealReturn} />
          <AdjustableControl label="Liquid reserve target" value={liquidityMonths} min={0} max={24} step={3} baseline={12} format={(value) => `${Math.round(value)} months of starting gap`} onChange={setLiquidityMonths} />
          <AdjustableControl label="Target age" value={targetAge} min={70} max={95} step={1} baseline={75} format={(value) => `${Math.round(value)}`} onChange={setTargetAge} />
          <AdjustableControl label="Real home value" value={homeValue} min={300_000} max={1_000_000} step={25_000} baseline={HOME_BASELINE} format={money} onChange={setHomeValue} />
          <label>Salary-equivalent tax year<select value={taxYear} onChange={(e) => setTaxYear(e.target.value as TaxYear)}><option>2026-27</option><option>2027-28</option></select></label>
          <button className="secondary wide" onClick={() => { setRailKey("B"); setPssProjectionBasis("source-825"); setPssElection("70-30"); setWashCycles(4); setSpend(110_000); setRealReturn(0.05); setLiquidityMonths(12); setTargetAge(75); setHomeValue(HOME_BASELINE); setTaxYear("2026-27"); setSimulationSeed(20260814); }}>Reset central baseline</button>
        </aside>
        <div className="scenario-results">
          <div className="metrics three">
            <Metric label={pssSurplus > 0 ? "PSS surplus to reinvest" : "Portfolio draw required"} value={money(pssSurplus > 0 ? pssSurplus : portfolioDraw)} sub={pssSurplus > 0 ? `PSS covers ${pct(rail.netPension / spend, 1)} of spending; Pool A draw is $0 unless a statutory minimum applies` : `${pct(rail.netPension / spend, 1)} of spending covered by PSS`} tone="violet" />
            <Metric label={`Ending investment capital @${targetAge}`} value={money(endCapital)} sub={`${pct(realReturn, 1)} real return · ${money(endCapital - 500_000)} vs $500k investment floor`} tone={endCapital >= 500_000 ? "green" : "amber"} />
            <Metric label="Selected spend gross equivalent" value={money(grossEquivalent)} sub={`${taxYear} resident rates + 2% Medicare`} />
          </div>
          <section className="assumption-brief" aria-label="Active scenario assumptions">
            <article><span>Active return basis</span><b>{pct(realReturn, 1)} real p.a.</b><p>After inflation. Choose a rate net of fees: Pool A uses the stated rate; Pool C applies a separate {pct(POOL_C_DRAG, 2)} annual drag.</p></article>
            <article><span>Reserve policy</span><b>{liquidityMonths} months = {money(liquidityTarget)}</b><p>Measured against the starting portfolio gap. Pool C currently holds {money(rail.poolC)} and is an invested ETF reserve, not cash.{liquidityGap > 0 ? ` The policy gap is ${money(liquidityGap)}.` : ""}</p></article>
            <article><span>Election and hand-off</span><b>{rail.electionLabel}</b><p>{projectionBasis.label}: {pct(projectionBasis.fundEarnings, 1)} fund earnings, {pct(projectionBasis.salaryGrowth, 1)} salary growth and {pct(projectionBasis.cpi, 1)} CPI before retirement. V23 receives this basis plus the separate {pct(realReturn, 1)} post-retirement real return.</p></article>
          </section>
          <section className="panel compact"><LineChart labels={trajectoryLabels} series={trajectorySeries} height={260} /></section>
          <div className="scenario-actions">
            {["A", "B", "C"].map((slot) => <div key={slot}><button className="secondary" onClick={() => saveSlot(slot)}>Save {slot}</button><button className="text-button" disabled={!saved[slot]} onClick={() => loadSlot(slot)}>Load</button></div>)}
            <button className="secondary" onClick={exportSettings}>Export JSON</button>
            <button className="secondary" onClick={() => importRef.current?.click()}>Import</button>
            <a className="primary" href={v23SpendPlanUrl} target="_blank" rel="noreferrer">Continue to V23 spending plan ↗</a>
            <input ref={importRef} hidden type="file" accept="application/json" onChange={(e) => importSettings(e.target.files?.[0])} />
          </div>
        </div>
      </section>

      <section className="panel">
        <div className="panel-head"><div><h3>Reconciled annual planning ledger</h3><p>The opening position is capital on retirement day before annual cashflow. Each following row is a birthday-to-birthday planning year, not a fund payment instruction.</p></div><button className="secondary" onClick={() => setShowLedger(!showLedger)}>{showLedger ? "Hide table" : "Show full retirement ledger"}</button></div>
        <div className="first-year-explainer"><Badge tone="exact">OPENING POSITION</Badge><span>{money(ledger[0].ending)} on 21 Dec 2033</span><b>→</b><Badge tone="modelled">FIRST PLANNING YEAR</Badge><span>{money(ledger[1].pension)} PSSDB + {money(ledger[1].draw)} planning portfolio draw funds {money(ledger[1].fundedSpend)} spending{ledger[1].reinvestment > 0 ? ` and reinvests ${money(ledger[1].reinvestment)} surplus` : ""}</span></div>
        <RetirementPaymentCalendar settings={calendar} openingPoolA={rail.poolA} annualBudget={spend} netPension={rail.netPension} planningMinimum={rail.poolA * abpMinimumRateAtAgeOn1July(60)} onChange={applyCalendar} />
        {firstUnfundedYear ? <div className="note warn"><b>Funding shortfall:</b> {firstUnfundedYear.year} has {money(firstUnfundedYear.shortfall)} of the selected spending target unfunded after PSSDB and Pool A draw. Pool C is deliberately not spent automatically—choose and model a separate draw policy before treating it as income.</div> : <div className="note"><b>Funding check:</b> all displayed planning years are funded by PSSDB plus Pool A at this setting. Pool C remains a reserve and is not silently counted as spending money.</div>}
        <div className="table-wrap desktop-ledger"><table><thead><tr><th>Period</th><th>Age span</th><th>Opening capital</th><th>PSSDB pension</th><th>Hostplus accumulation</th><th>Hostplus pension</th><th>Pool C</th><th>Planning portfolio draw</th><th>Target spend</th><th>Funded spend</th><th>Shortfall</th><th>Reinvestment</th><th>Net investment growth</th><th>Pool C drag</th><th>Net income</th><th>Gross equivalent of income</th><th>Capital at period end</th></tr></thead><tbody>{ledger.slice(0, showLedger ? ledger.length : 6).map((r) => <tr key={r.age} className={r.isOpening ? "opening-row" : ""}><td><b>{r.year}</b><small className="ledger-period">{r.period}</small></td><td>{r.ageLabel}</td><td>{money(r.opening)}</td><td>{r.isOpening ? "—" : money(r.pension)}</td><td>{money(r.accumulation)}</td><td>{money(r.abp)}</td><td>{money(r.poolC)}</td><td>{r.isOpening ? "—" : money(r.draw)}</td><td>{r.isOpening ? "—" : money(r.spend)}</td><td>{r.isOpening ? "—" : money(r.fundedSpend)}</td><td>{r.isOpening ? "—" : r.shortfall > 0 ? money(r.shortfall) : "—"}</td><td>{r.isOpening ? "—" : money(r.reinvestment)}</td><td>{r.isOpening ? "—" : money(r.investmentGrowth)}</td><td>{r.isOpening ? "—" : money(r.tax)}</td><td>{r.isOpening ? "—" : money(r.netIncome)}</td><td>{r.isOpening ? "—" : money(r.grossEquivalent)}</td><td><b>{money(r.ending)}</b></td></tr>)}</tbody></table></div>
        <div className="mobile-ledger">{ledger.slice(0, showLedger ? ledger.length : 6).map((row) => row.isOpening ? <article className="opening-position" key={row.age}><header><div><span>Opening position</span><b>Age 60 · 21 Dec 2033</b></div><strong>{money(row.ending)}<small>opening capital</small></strong></header><p>No annual income or spending belongs in this snapshot. Your first retirement-year cashflow starts in the next card.</p><dl><div><dt>Hostplus pension</dt><dd>{money(row.abp)}</dd></div><div><dt>Pool C</dt><dd>{money(row.poolC)}</dd></div></dl></article> : <article key={row.age}><header><div><span>{row.year} · {row.period}</span><b>Age {row.ageLabel}</b></div><strong>{money(row.ending)}<small>ending capital</small></strong></header><dl><div><dt>PSSDB pension received</dt><dd>{money(row.pension)}</dd></div><div><dt>Planning portfolio draw</dt><dd>{money(row.draw)}</dd></div><div><dt>Target annual spending</dt><dd>{money(row.spend)}</dd></div><div><dt>Funded spending</dt><dd>{money(row.fundedSpend)}</dd></div>{row.shortfall > 0 && <div><dt>Unfunded target</dt><dd>{money(row.shortfall)}</dd></div>}<div><dt>Reinvested surplus</dt><dd>{money(row.reinvestment)}</dd></div><div><dt>Net investment growth</dt><dd>{money(row.investmentGrowth)}</dd></div><div><dt>Net income received</dt><dd>{money(row.netIncome)}</dd></div><div><dt>Gross salary equivalent</dt><dd>{money(row.grossEquivalent)}</dd></div><div><dt>Pool C at year end</dt><dd>{money(row.poolC)}</dd></div></dl></article>)}</div>
        <div className="ledger-equation"><b>Annual reconciliation:</b> ending capital = opening capital + net investment growth − planning portfolio draw + reinvested surplus. The table separates the target spend from the amount actually funded; Pool C is a reserve unless an explicit draw policy is modelled.</div>
        <div className="assumption-row"><Badge tone="modelled">Birthday-year planning bands</Badge><Badge tone="modelled">Current ABP rates, provider-calculated by FY</Badge><Badge tone="modelled">Pool C 0.35% annual drag</Badge><Badge tone="modelled">Real dollars</Badge><Badge tone="speculative">Current law held constant</Badge></div>
      </section>

      <InverseSolveLab
        rail={rail}
        spend={spend}
        realReturn={realReturn}
        targetAge={targetAge}
        electionOptions={activePssElectionKeys.map((key) => {
          const option = railBForElection(key, pssProjectionBasis);
          return { key, label: option.electionLabel, grossPension: option.grossPension, poolA: option.poolA };
        })}
        onAdopt={(next) => {
          if (next.spend !== undefined) setSpend(clamp(next.spend, 76_000, MAX_FLAT_SPEND));
          if (next.realReturn !== undefined) setRealReturn(clamp(next.realReturn, 0.02, 0.075));
        }}
      />
    </>
  );

  const renderCompare = () => {
    const comparisonTargetIndex = clamp(targetAge - 60, 0, 35);
    const scenarios = Object.entries(COMPARISON_PLANS).map(([key, plan]) => {
      const scenario = plan;
      const scenarioRail = railFor(scenario.rail, pssElection, pssProjectionBasis);
      const draw = Math.max(0, scenario.spend - scenarioRail.netPension);
      const capitalAtTarget = ledgerEndingAtAge(scenarioRail, scenario.spend, realReturn, targetAge, taxYear);
      const capital85 = ledgerEndingAtAge(scenarioRail, scenario.spend, realReturn, 85, taxYear);
      const scenarioFan = monteCarloFan(scenarioRail, scenario.spend, realReturn, taxYear, .12, 360, simulationSeed);
      const probability = scenarioFan.paths[comparisonTargetIndex].filter((value) => value >= 500_000).length / scenarioFan.paths[comparisonTargetIndex].length;
      return { key, ...scenario, draw, capitalAtTarget, capital85, estateAtTarget: capitalAtTarget + homeValue, probability };
    });
    const baseline = scenarios[0];
    return <>
      <SectionHeading eyebrow="Decision workspace" title="Compare flat spending examples" copy={`Each card keeps its labelled annual spend and rail fixed, so the trade-offs are comparable. Your active Adjust assumptions rerun every capital, estate and simulation result below: ${pct(realReturn, 1)} real return p.a. after inflation, target age ${targetAge} and a ${money(homeValue)} real home. Using a card changes only its spend and rail; it does not reset those assumptions. For age-banded spending and drawdown periods, continue in V23.`} />
      <section className="compare-cards">{scenarios.map((scenario, index) => <article key={scenario.key} className={scenario.key === "baseline" ? "recommended" : ""}>
        <div className="compare-head"><div><Badge tone={scenario.key === "baseline" ? "good" : scenario.key === "lifestyle" ? "estimated" : "modelled"}>{scenario.key === "baseline" ? "Reference" : `Option ${index + 1}`}</Badge><h3>{scenario.label}</h3><p>{scenario.intent}</p></div><span>Rail {scenario.rail}{scenario.rail === "B" ? ` · ${activePssElections[effectivePssElection]!.label} · ${projectionBasis.shortLabel}% basis` : ""}</span></div>
        <div className="compare-spend"><span>Flat net annual spend</span><strong>{money(scenario.spend)}</strong><small>{fmt1.format(scenario.spend / 26)} per fortnight · held constant in real dollars each retirement year</small><small className="compare-assumption">Active assumptions: <b>{pct(realReturn, 1)} real return p.a.</b> after inflation · target age {targetAge} · {money(homeValue)} real home</small></div>
        <dl className="compare-outcomes"><div><dt>Capital @{targetAge}</dt><dd>{money(scenario.capitalAtTarget)}</dd></div><div><dt>Capital @85</dt><dd>{money(scenario.capital85)}</dd></div><div><dt>Gross estate @{targetAge} · incl. home</dt><dd>{money(scenario.estateAtTarget)}</dd></div><div><dt>Sim. frequency ≥$500k @{targetAge}</dt><dd>{pct(scenario.probability, 0)}</dd></div></dl>
        <div className="compare-delta"><span>Versus baseline</span><b>{scenario.key === "baseline" ? "Reference plan" : `${scenario.capitalAtTarget >= baseline.capitalAtTarget ? "+" : ""}${money(scenario.capitalAtTarget - baseline.capitalAtTarget)} capital @${targetAge}`}</b></div>
        <div className="compare-actions"><button className="secondary" onClick={() => { applyComparisonPlan(scenario); go("scenario"); }}>Use spend & rail</button><a className="text-button" href={v23SpendPlanUrl} target="_blank" rel="noreferrer">Set age bands in V23 ↗</a></div>
      </article>)}</section>
      <section className="panel comparison-matrix">
        <div className="panel-head"><div><h3>Trade-off matrix</h3><p>Active assumptions: {pct(realReturn, 1)} real return p.a. after inflation · target age {targetAge} · {money(homeValue)} real home. Longer bars are better within each row; spending is preference, not a score.</p></div><Badge tone="modelled">Active assumptions</Badge></div>
        {[{ label: "Lifestyle spending", field: "spend" as const }, { label: `Age-${targetAge} investments`, field: "capitalAtTarget" as const }, { label: "Age-85 investments", field: "capital85" as const }, { label: `Age-${targetAge} gross estate · incl. home`, field: "estateAtTarget" as const }].map((metric) => {
          const maximum = Math.max(...scenarios.map((scenario) => scenario[metric.field]));
          return <div className="matrix-row" key={metric.label}><b>{metric.label}</b>{scenarios.map((scenario) => <div key={scenario.key}><span>{scenario.label}</span><i><em style={{ width: `${scenario[metric.field] / maximum * 100}%` }} /></i><strong>{money(scenario[metric.field])}</strong></div>)}</div>;
        })}
      </section>
      <div className="note"><b>How to interpret:</b> compare each example's funded spending, age-{targetAge} investments and gross estate under the active {pct(realReturn, 1)} real-return assumption. More spending usually leaves less capital. The simulated frequency is a model stress measure; use Risk and V23 to inspect downside paths and spending by age.</div>
    </>;
  };

  const renderPre60 = () => {
    const projected = contributionWhatIf(phase2, phase3, nominalReturn);
    return <>
      <SectionHeading eyebrow="Accumulation runway" title="Present → age 60" copy="The pre-retirement plan protects liquidity first, then increases Hostplus contributions after the bank and loan targets are complete." />
      <div className="metrics four">
        <Metric label="Hostplus opening balance" value={money(HOSTPLUS_STARTING_BALANCE)} sub="April 2026 statement balance; refresh when a current Hostplus statement arrives" />
        <Metric label="Workbook-reconciled Hostplus @60" value={money(projectHostplusAt60(650, 1_200, HOSTPLUS_BASELINE_RETURN))} sub="8.0% nominal central case; $317,448 is an upper planning anchor, not the baseline" tone="green" />
        <Metric label="Latest visible net pay" value={fmt1.format(2_908.56)} sub="Per fortnight after all payslip deductions: tax, PSS and child support" tone="violet" />
        <Metric label="PSS contribution rate" value="10%" sub="Maintain until ABM caps near mid-2032" tone="amber" />
      </div>
      <section className="timeline">
        <article><span>1</span><div><Badge tone="modelled">Plan phase</Badge><h3>Liquidity base</h3><p>Bank to $30k; home loan to $10k. The historical plan assumed no new Hostplus contributions during this phase; check actual records.</p></div><strong>To Jul 2026</strong></article>
        <article><span>2</span><div><Badge tone="modelled">Active control</Badge><h3>Salary sacrifice</h3><p>{money(phase2)} per fortnight under the selected Phase 2 contribution setting.</p></div><strong>Jul 2026 → Mar 2028</strong></article>
        <article><span>3</span><div><Badge tone="modelled">Active control</Badge><h3>Contribution acceleration</h3><p>{money(phase3)} total per fortnight under the selected Phase 3 contribution setting.</p></div><strong>Mar 2028 → Dec 2033</strong></article>
      </section>
      <section className="panel">
        <div className="panel-head"><div><h3>Contribution sensitivity</h3><p>The calculator starts at the April 2026 {money(HOSTPLUS_STARTING_BALANCE)} balance, follows the workbook’s fractional contribution timing, nets 15% contributions tax from salary sacrifice, and treats the balance of Phase 3 as direct NCC.</p></div><Badge tone="modelled">Active {pct(nominalReturn, 1)} nominal · separate from real retirement models</Badge></div>
        <div className="sensitivity-layout">
          <div className="control-panel inline">
            <label><span>Phase 2 / fortnight <b>{money(phase2)}</b></span><input type="range" min="400" max="1000" step="50" value={phase2} onChange={(e) => setPhase2(Number(e.target.value))} /></label>
            <label><span>Phase 3 / fortnight <b>{money(phase3)}</b></span><input type="range" min="800" max="1600" step="50" value={phase3} onChange={(e) => setPhase3(Number(e.target.value))} /></label>
            <label><span>Nominal accumulation return <b>{pct(nominalReturn, 1)}</b></span><input type="range" min="0.04" max="0.10" step="0.005" value={nominalReturn} onChange={(e) => setNominalReturn(Number(e.target.value))} /></label>
          </div>
          <div className="whatif-result"><span>Workbook-timed Hostplus at 60</span><strong>{money(projected)}</strong><small>{projected >= 289_620.63 ? "+" : ""}{money(projected - 289_620.63)} versus the workbook-reconciled 8.0% central case · $317,448 remains an upper planning anchor</small></div>
        </div>
        <div className="note warn"><b>Control point:</b> payroll and CSC employment history now show a $138,394 birthday super salary, while the 2026 annual statement remains pending correction/reissue. The September iEstimators use the updated $143,099 current salary prospectively from the next birthday. Nominal and real returns are not mixed in this block.</div>
      </section>
    </>;
  };

  const renderPss = () => (
    <>
      <SectionHeading eyebrow="Source-backed election studio" title="PSS election, TBC and the three pools" copy="Choose an exact September CSC estimate. Pension income, lump sum, TBC headroom, pools, spending draw, reinvested surplus, estate and wash capacity all update together." />
      <section className="panel projection-basis-studio" aria-labelledby="projection-basis-title">
        <div className="panel-head"><div><Badge tone="modelled">Provider projection basis</Badge><h3 id="projection-basis-title">Keep pre-retirement source assumptions separate from retirement returns</h3><p>The CSC basis generates the pension, lump sum and tax components at retirement. The site’s real-return control starts from that retirement-day position and projects what happens afterwards.</p></div><Badge tone="exact">Active · {projectionBasis.shortLabel}%</Badge></div>
        <div className="projection-basis-options">
          {(Object.values(PSS_PROJECTION_BASES) as PssProjectionBasis[]).map((basis) => {
            const availableCount = electionKeysForBasis(basis.key).length;
            const active = basis.key === pssProjectionBasis;
            return <button type="button" key={basis.key} className={active ? "active" : ""} aria-pressed={active} onClick={() => chooseProjectionBasis(basis.key)}>
              <span>{basis.label}</span><b>{pct(basis.fundEarnings, 1)} fund · {pct(basis.salaryGrowth, 1)} salary · {pct(basis.cpi, 1)} CPI</b>
              <small>{pct(basis.realFundEarnings, 2)} real fund · {pct(basis.realSalaryGrowth, 2)} real salary</small>
              <em>Verified · {availableCount} of 4 elections · {basis.sourceDate}</em>
            </button>;
          })}
        </div>
        <div className="projection-flow" role="note"><span><b>1 · CSC before retirement</b>{projectionBasis.shortLabel}% source basis</span><i>→</i><span><b>2 · Retirement-day opening</b>PSS pension, lump and components</span><i>→</i><span><b>3 · Site after retirement</b>{pct(realReturn, 1)} real return · active everywhere</span></div>
        <div className="note warn"><b>6% / 5% / 3% source boundary:</b> all four elections are direct CSC outputs. The 60/40, 65/35 and 70/30 estimates use the 1 September snapshot and FAS $162,380.20; 100% pension uses the later 9 September snapshot and FAS $162,485.36. Values are never inferred or mixed between them.</div>
      </section>
      <section className="pss-election-grid">
        {PSS_ELECTION_ORDER.map((key) => { const option = activePssElections[key]; if (!option) return <article key={key} className="unavailable" aria-disabled="true"><div className="rail-card-head"><Badge tone="warn">Source required</Badge></div><h3>{key}</h3><p>This provider basis has no matching source for the selected election. No figures are borrowed from another source set.</p></article>; const optionRail = railBForElection(option.key, pssProjectionBasis); const selected = railKey === "B" && effectivePssElection === option.key; return <article key={option.key} className={selected ? "selected" : ""}>
          <div className="rail-card-head"><Badge tone="exact">CSC · {projectionBasis.sourceDate}</Badge><button type="button" onClick={() => { setPssElection(option.key); setRailKey("B"); setWashCycles(optionRail.lumpSum > 0 ? Math.ceil(optionRail.lumpSum / 130_000) : 0); }}>{selected ? "Selected" : "Use option"}</button></div>
          <h3>{option.label}</h3><p>{money(option.netPension)} estimated net income · {fmt1.format(option.netPensionPf)} per fortnight</p>
          <dl><div><dt>Gross PSS</dt><dd>{money(option.grossPension)}</dd></div><div><dt>PSS lump</dt><dd>{money(option.lumpSum)}</dd></div><div><dt>Pool A</dt><dd>{money(optionRail.poolA)}</dd></div><div><dt>Pool C</dt><dd>{money(optionRail.poolC)}</dd></div><div><dt>TBC headroom</dt><dd>{money(optionRail.tbcHeadroom)}</dd></div><div><dt>PSS wash source</dt><dd>{money(option.lumpSum)}</dd></div></dl>
          {optionRail.tbcExcess > 0 && <div className="option-warning">DB special value is {money(optionRail.tbcExcess)} above the current {money(TBC)} planning anchor. The model uses CSC’s net pension estimate; confirm defined-benefit income-cap treatment before acting.</div>}
        </article>; })}
      </section>
      <section className="panel rail-a-control"><div><Badge tone="modelled">Rail A control</Badge><h3>March/V5 historical benchmark</h3><p>{money(RAILS.A.netPension)} net pension · {money(RAILS.A.lumpSum)} lump · preserved for comparison and not blended with September estimates.</p></div><button className="secondary" type="button" onClick={() => setRailKey("A")}>{railKey === "A" ? "Rail A selected" : "Use Rail A"}</button></section>
      <CollapsiblePanel title="Transfer-balance allocation" copy={rail.name} meta={`Pool A ${money(rail.poolA)} · Pool C ${money(rail.poolC)}`} badge={<Badge tone="exact">TBC anchor {money(TBC)}</Badge>}>
        <div className="waterfall">
          <div style={{ flex: rail.dbSpecialValue }} className="wf pension"><span>DB special value</span><b>{money(rail.dbSpecialValue)}</b><small>Gross pension ×16</small></div>
          {rail.poolA > 0 && <div style={{ flex: rail.poolA }} className="wf poola"><span>Pool A · ABP</span><b>{money(rail.poolA)}</b><small>0% pension-phase earnings tax</small></div>}
          {rail.tbcExcess === 0 && <div style={{ flex: TSB_BUFFER }} className="wf buffer"><span>Buffer</span><b>$5k</b></div>}
        </div>
        <div className="metrics four">
          <Metric label={rail.tbcExcess > 0 ? "DB value above TBC anchor" : "Raw TBC headroom"} value={money(rail.tbcExcess > 0 ? rail.tbcExcess : rail.tbcHeadroom)} sub={rail.tbcExcess > 0 ? "Defined-benefit treatment requires confirmation" : "Before the planning $5k buffer"} tone={rail.tbcExcess > 0 ? "amber" : "blue"} />
          <Metric label="Pool A Day 1" value={money(rail.poolA)} sub="Primary compounding engine" tone="green" />
          <Metric label="Pool C Day 1" value={money(rail.poolC)} sub="External ETF · deposit only" tone="amber" />
          <Metric label="PSS surplus / portfolio gap" value={money(pssSurplus > 0 ? pssSurplus : portfolioDraw)} sub={pssSurplus > 0 ? "Annual PSS surplus before any mandatory ABP draw" : "Annual spending gap before mandatory ABP rules"} tone="violet" />
        </div>
      </CollapsiblePanel>
      <CollapsiblePanel title="How the three pools work" copy="Open the operating roles and tax treatment behind the selected election." meta="Pool A · Pool B transit · Pool C">
        <div className="pool-grid">
          <article><i className="pool-dot a" /><h3>Pool A</h3><strong>{money(rail.poolA)}</strong><p>Account-based pension. Earnings taxed at 0%; mandatory draws apply; commutations restore TBC headroom.</p></article>
          <article><i className="pool-dot b" /><h3>Pool B</h3><strong>$0 Day 1</strong><p>Hostplus accumulation is a transit bucket for NCC wash transactions, not a standing balance.</p></article>
          <article><i className="pool-dot c" /><h3>Pool C</h3><strong>{money(rail.poolC)}</strong><p>External indexed ETF overflow and legacy reserve. It has a 0.35% modelled distribution drag and is outside super death-benefit tax; it is not automatically used to fund spending.</p></article>
        </div>
      </CollapsiblePanel>
      <section className="panel comparator"><div><Badge tone="modelled">How 100% works here</Badge><h3>PSS surplus becomes investable cashflow</h3><p>When the selected net PSS pension exceeds spending, the ledger requires no voluntary ABP draw. Any PSS surplus—and any unavoidable statutory ABP minimum—is routed to Pool C and compounds there. With no PSS lump, the 100% option has no PSS NCC-wash source; Hostplus components remain unclassified.</p></div><strong>{effectivePssElection === "100" && railKey === "B" ? `${money(pssSurplus)} current annual surplus` : "Select 100% to model"}</strong></section>
    </>
  );

  const renderFrontier = () => {
    const rows = FRONTIER_SPENDS.map((s) => ({
      spend: s,
      draw: Math.max(0, s - rail.netPension),
      gross: grossForNet(s, taxYear),
      values: RETURNS.map((r) => ledgerEndingAtAge(rail, s, r, targetAge, taxYear)),
      activeCapital: ledgerEndingAtAge(rail, s, realReturn, targetAge, taxYear),
    }));
    const marginalCost = RETURNS.map((_, index) => Math.max(0, rows[0].values[index] - rows[1].values[index]));
    const marginalScale = Math.max(1, ...marginalCost);
    const activeCapitalAtTarget = ledgerEndingAtAge(rail, spend, realReturn, targetAge, taxYear);
    const activeEstateAtTarget = activeCapitalAtTarget + homeValue;
    return <>
      <SectionHeading eyebrow="Lifestyle ↔ legacy" title="Spending–estate frontier" copy="The same secure pension supports several valid retirement profiles. Each point holds one real annual spend flat across retirement, so the cost of higher spending is lower future capital plus foregone compounding. Use V23 to shape the spending timing by age." />
      <section className="frontier-target-context" aria-label="Active frontier target age"><div><span>Frontier decision point</span><strong>Age {targetAge}</strong><small>This is your selected comparison age—not the end of the retirement projection, which continues to age 95.</small></div><button type="button" className="secondary" onClick={() => go("scenario")}>Change target age in Adjust</button></section>
      <section className="profile-strip">{FRONTIER_SPENDS.map((v, i) => <button key={v} className={spend === v ? "active" : ""} onClick={() => setSpend(v)}><span>{["Estate max", "Strong compromise", "Balanced", "Lifestyle-led", "High optionality"][i]}</span><b>{money(v)}</b><small>{fmt1.format(v / 26)} / pf</small></button>)}</section>
      <div className="metrics four">
        <Metric label="PSS coverage" value={pct(rail.netPension / spend, 1)} sub={`${money(portfolioDraw)} annual portfolio draw`} tone="violet" />
        <Metric label="Selected spend gross equivalent" value={money(grossEquivalent)} sub={`${taxYear} rates`} />
        <Metric label={`Investments @${targetAge} · ${pct(realReturn, 1)}`} value={money(activeCapitalAtTarget)} sub="[MODELLED] Selected real return · home excluded" tone="green" />
            <Metric label={`Gross estate @${targetAge} · ${pct(realReturn, 1)}`} value={money(activeEstateAtTarget)} sub={`[MODELLED] Includes ${money(homeValue)} home · before estate costs / residual DBT`} tone="amber" />
      </div>
      <section className="panel">
        <div className="panel-head"><div><h3>Interactive efficient frontier</h3><p>Drag spending or select a point. Each point is a flat real annual-spend comparison; colour shows the investment buffer at age {targetAge}: green ≥ $1m, amber ≥ $500k, red below the floor.</p></div><Badge tone="modelled">{pct(realReturn, 1)} real · age {targetAge}</Badge></div>
        <FrontierCurve rail={rail} selectedSpend={spend} homeValue={homeValue} realReturn={realReturn} targetAge={targetAge} taxYear={taxYear} onSelect={setSpend} />
      </section>
      <VisualExplorerPanel scenario={currentScenario} theme={theme} panel="trade" view="table" onSpend={setSpend} onView={setVisualView}/>
      <CollapsiblePanel title="Detailed return comparison matrix" copy="Fixed comparison rates alongside the active scenario" meta={`Active ${pct(realReturn,1)} real · age ${targetAge}`}>
        <div className="panel-head"><div><h3>Full age-{targetAge} outcome matrix</h3><p>Birthday-year planning path using current ABP rate bands and Pool C drag. The fund calculates legal financial-year payments; current selected rail: {rail.short}.</p></div><Badge tone="modelled">Active {pct(realReturn, 1)} real</Badge></div>
        <div className="table-wrap"><table><thead><tr><th>Net spend</th><th>Per fortnight</th><th>Gross equivalent</th><th>Portfolio draw</th>{RETURNS.map((r) => <th key={r}>Investments · {pct(r, 1)}</th>)}<th>Estate · active {pct(realReturn, 1)}</th></tr></thead><tbody>{rows.map((r) => <tr key={r.spend} className={spend === r.spend ? "selected-row" : ""} onClick={() => setSpend(r.spend)}><td><b>{money(r.spend)}</b></td><td>{fmt1.format(r.spend / 26)}</td><td>{money(r.gross)}</td><td>{money(r.draw)}</td>{r.values.map((v, i) => <td key={i}>{money(v)}</td>)}<td><b>{money(r.activeCapital + homeValue)}</b></td></tr>)}</tbody></table></div>
      </CollapsiblePanel>
      <section className="panel tradeoff">
        <div><Badge tone="warn">Marginal cost</Badge><h3>Each extra $10,000 of annual spending</h3><p>Reduces age-{targetAge} investment capital by approximately {money(marginalCost[0])} at 4%, {money(marginalCost[1])} at 5%, and {money(marginalCost[2])} at 6.5% on the selected rail.</p></div>
        <div className="tradeoff-bars">{RETURNS.map((r, i) => { const cost = marginalCost[i]; return <div key={r}><span>{pct(r, 1)}</span><i style={{ width: `${cost / marginalScale * 100}%` }} /><b>{money(cost)}</b></div>; })}</div>
      </section>
      <section className="panel two-models"><article><Badge tone="modelled">Fixed comparison</Badge><h3>Investment benchmarks</h3><p>$1.2m / $1.5m / $1.75m age-75 investments at 4% / 5% / 6.5%. Home excluded; these remain fixed framework benchmarks, not active-scenario outputs.</p></article><article><Badge tone="good">Model B</Badge><h3>Spending frontier</h3><p>At least $500k investments + $500k home = $1m property-inclusive gross estate floor.</p></article><div><strong>Active selected position · age {targetAge}</strong><p>{money(spend)} spend · {money(activeCapitalAtTarget)} investments · {money(activeEstateAtTarget)} estate at {pct(realReturn, 1)} real.</p></div></section>
    </>;
  };

  const renderRisk = () => {
    const row = ledger.find((item) => item.age === cashflowAge && !item.isOpening) ?? ledger[1];
    const rowIndex = ledger.findIndex((item) => item.age === row.age && !item.isOpening);
    const priorRow = ledger[Math.max(0, rowIndex - 1)] ?? ledger[0];
    const openingPoolC = priorRow.poolC;
    const openingPoolA = Math.max(0, row.opening - openingPoolC);
    const p10 = fan.p10[targetIndex];
    const p50 = fan.p50[targetIndex];
    const p90 = fan.p90[targetIndex];
    const shockAges = [61, 63, 65, 67, 70];
    const shocks = [-.10, -.20, -.30, -.40];
    const counts = fan.funding[targetIndex];
    const paths = fan.paths[targetIndex].length;
    const frequency = (value: number) => `${value} of ${paths} paths`;
    return <>
      <SectionHeading eyebrow="Uncertainty made visible" title="Risk studio" copy="See how often the pension and permitted withdrawals fund the budget, and how often your investments clear the floor." />
      <section className="panel risk-funding" aria-labelledby="risk-funding-heading">
        <div className="panel-head">
          <div><h3 id="risk-funding-heading">Spending and investment floor through age {targetAge}</h3><p>Each spending check covers every year through this age. Investment capital is measured at age {targetAge}. These tests use the same paths and preserve Pool C.</p></div>
          <label htmlFor="cc-risk-essentials">Essential spending ($/yr)
            <input key={riskEssentials ?? "unset"} id="cc-risk-essentials" type="number" defaultValue={riskEssentials ?? ""} min={0} step="any" inputMode="decimal" placeholder="Optional"
              onBlur={event => {
                const input = event.currentTarget;
                if (!input.checkValidity()) { input.value = String(riskEssentials ?? ""); return; }
                const value = input.valueAsNumber;
                applyRiskEssentials(Number.isFinite(value) ? value : null);
              }}
              onKeyDown={event => { if (event.key === "Enter") event.currentTarget.blur(); }} />
          </label>
        </div>
        {targetIndex>0 ? <div className="metrics four">
          <Metric label="Investment floor reached" value={pct(counts.capital / paths, 1)} sub={`${frequency(counts.capital)} reached $500,000`} />
          <Metric label="Full budget every year" value={pct(counts.lifestyle / paths, 1)} sub={frequency(counts.lifestyle)} />
          <Metric label="Full budget and investment floor" value={pct(counts.lifestyleAndCapital / paths, 1)} sub={frequency(counts.lifestyleAndCapital)} />
          {riskEssentials !== null && <Metric label="Essentials and investment floor" value={pct(counts.essentialsAndCapital / paths, 1)} sub={`${frequency(counts.essentialsAndCapital)} also funded ${money(riskEssentials)}/yr`} />}
        </div> : <p>Age 60 is the opening snapshot. Choose a later age to check funded spending.</p>}
        {targetIndex>0 && riskEssentials !== null && <p className="note">{frequency(counts.essentials)} funded the essential budget each year, regardless of the investment floor.</p>}
      </section>
      <div className="metrics three">
        <Metric label={`P10 capital @${targetAge}`} value={money(p10)} sub="Nine in ten paths finish above this level" tone="amber" />
        <Metric label={`Median capital @${targetAge}`} value={money(p50)} sub="Middle stochastic outcome" />
        <Metric label={`P90 capital @${targetAge}`} value={money(p90)} sub="Strong-path reference, not a forecast" tone="green" />
      </div>
      <section className="panel">
        <div className="panel-head"><div><h3>Capital simulation fan</h3><p>Each path runs the same PSS income, Pool A draw and Pool C reinvestment ledger as the Scenario lab. The vertical marker follows the selected target age.</p></div><div className="panel-actions"><Badge tone="modelled">{pct(realReturn, 1)} real mean · 12% volatility</Badge><button className="secondary" onClick={() => setSimulationSeed((value) => value >= 2_147_000_000 ? 20260814 : value + 1)}>New repeatable sample</button></div></div>
        <FanChart key={`fan-${targetAge}`} fan={fan} targetAge={targetAge} />
        <div className="note warn"><b>Read the band, not just the median:</b> 600 seeded paths use a constant real mean, 12% annual volatility and a capped normal distribution. They preserve the three-pool ledger but do not forecast regimes, fees, legislation, provider financial-year payment timing or personal spending shocks. Sample seed: {simulationSeed}.</div>
      </section>

      <ProbabilityVolume rail={rail} spend={spend} realReturn={realReturn} simulationSeed={simulationSeed} theme={theme} />
      <section className="panel">
        <div className="panel-head"><div><h3>Sequence-risk heatmap</h3><p>Prescribed single-shock library: ending investment capital after one adverse return at different early-retirement ages; all other years use the selected real return.</p></div><Badge tone="modelled">Timing sensitivity</Badge></div>
        <div className="heatmap" role="table" aria-label="Sequence risk heatmap">
          <div className="heatmap-corner">Shock</div>{shockAges.map((age) => <div className="heatmap-head" key={age}>Age {age}</div>)}
          {shocks.flatMap((shock) => [<div className="heatmap-head row" key={`label-${shock}`}>{pct(shock, 0)}</div>, ...shockAges.map((age) => {
            const outcome = endingWithShock(rail, spend, realReturn, targetAge, age, shock, taxYear);
            const severity = clamp(1 - outcome / Math.max(1, endCapital), 0, 1);
            return <div key={`${shock}-${age}`} className={`heat-cell ${outcome >= 1_000_000 ? "safe" : outcome >= 500_000 ? "watch" : "risk"}`} style={{ opacity: .72 + severity * .28 }}><b>{compactMoney(outcome)}</b><small>{money(outcome - endCapital)} vs smooth</small></div>;
          })])}
        </div>
      </section>
      <section className="panel">
        <div className="panel-head"><div><h3>Selected-year three-pool money flow</h3><p>Choose a planning year to see PSSDB income, Pool A draw, lifestyle spending, Pool C routing and the resulting investment position. The retirement-day opening snapshot is capital only.</p></div><label className="age-select">Year<select value={cashflowAge} onChange={(event) => setCashflowAge(Number(event.target.value))}>{ledger.filter((item) => !item.isOpening).map((item) => <option key={item.age} value={item.age}>{item.year} · age {item.ageLabel}</option>)}</select></label></div>
        <div className="cashflow-map">
          <div className="flow-source pension"><span>Indexed PSS pension</span><strong>{money(row.pension)}</strong><small>Lifetime income floor</small></div>
          <div className="flow-source draw"><span>Planning portfolio draw</span><strong>{money(row.draw)}</strong><small>{pct(drawRate(row.age), 0)} current-law rate band · provider calculates FY minimum</small></div>
          <div className="flow-total"><span>Cash received</span><strong>{money(row.netIncome)}</strong><small>Before any recycled surplus</small></div>
          <div className="flow-use spend"><span>Funded lifestyle spending</span><strong>{money(row.fundedSpend)}</strong><small>{row.shortfall > 0 ? `${money(row.shortfall)} target remains unfunded` : "Selected real-dollar plan fully funded"}</small></div>
          <div className="flow-use recycle"><span>Reinvested to Pool C</span><strong>{money(row.reinvestment)}</strong><small>Unspent draw remains invested</small></div>
          <div className="flow-use drag"><span>Pool C tax drag</span><strong>{money(row.tax)}</strong><small>0.35% modelled distribution drag</small></div>
        </div>
        <div className="cashflow-capital-grid" aria-label={`Capital movement in ${row.year}`}>
          <article><span>Opening Pool A</span><b>{money(openingPoolA)}</b><small>Hostplus pension capital before the year&apos;s draw</small></article>
          <article><span>Opening Pool C</span><b>{money(openingPoolC)}</b><small>External ETF reserve before growth and drag</small></article>
          <article><span>Net investment growth</span><b>{money(row.investmentGrowth)}</b><small>{pct(realReturn, 1)} real return less Pool C drag</small></article>
          <article><span>Ending investment capital</span><b>{money(row.ending)}</b><small>Pool A {money(row.abp)} + Pool C {money(row.poolC)}</small></article>
        </div>
      </section>
      <section className="retirement-runway" aria-label="Retirement runway">
        {[{ age: 57, title: "Optional VR window", detail: "Request formal CSC estimates" }, { age: 60, title: "Retirement transition", detail: `${rail.electionLabel} · Pool A/B/C launch` }, { age: 61, title: "NCC wash cycle", detail: rail.lumpSum > 0 ? "Source-limited separate-interest execution" : "No PSS lump wash under 100% election" }, { age: 75, title: "Primary decision target", detail: `${money(ledgerEndingAtAge(rail, spend, realReturn, 75, taxYear))} investments at ${pct(realReturn, 1)} real` }, { age: 85, title: "Longevity checkpoint", detail: "Review care and estate capacity" }, { age: 95, title: "Late-life horizon", detail: "PSS floor continues for life" }].map((milestone) => <article key={milestone.age}><span>{milestone.age}</span><div><b>{milestone.title}</b><small>{milestone.detail}</small></div></article>)}
      </section>
    </>;
  };

  const renderEstate = () => {
    const activeWash = washOutcome(rail, washCycles);
    const taxableStart = activeWash.taxableStart;
    const removedPerWash = Math.min(130_000, rail.lumpSum) * rail.washTaxableShare;
    const taxableRemaining = activeWash.taxableRemaining;
    const dbtStart = taxableStart * 0.17;
    const dbtRemaining = taxableRemaining * 0.17;
    const dbtSaved = dbtStart - dbtRemaining;
    return <>
      <SectionHeading eyebrow="After-tax legacy" title="Tax, NCC wash and estate" copy="The estate question is not gross wealth alone. Super components, death-benefit tax and the location of capital determine what beneficiaries actually receive." />
      <div className="metrics four">
        <Metric label="Starting taxable share" value={pct(rail.washTaxableShare, 2)} sub={rail.washEvidence} tone="amber" />
        <Metric label="DBT rate on taxable component" value="17%" sub="Adult non-tax dependant planning rate" tone="violet" />
        <Metric label="DBT saved / full wash" value={money(removedPerWash * 0.17)} sub={rail.lumpSum > 0 ? `${money(removedPerWash)} taxable component removed from the original PSS lump` : "No PSS lump is available under the 100% election"} tone="green" />
        <Metric label="Pool C DBT exposure" value="$0" sub="External estate capital; ordinary tax rules remain" />
      </div>
      <section className="panel">
        <div className="panel-head"><div><h3>NCC wash simulator</h3><p>Separate-interest model: commute from the original interest; recontribute $130k as a distinct tax-free interest.</p></div><Badge tone="modelled">Modelled · provider confirmation required</Badge></div>
        <div className="wash-layout">
          <div className="control-panel inline"><label><span>Completed source-limited wash cycles <b>{activeWash.applied.length}</b></span><input type="range" min="0" max={Math.max(0, activeWash.maxCycles)} step="1" value={Math.min(washCycles, activeWash.maxCycles)} disabled={activeWash.maxCycles === 0} onChange={(e) => setWashCycles(Number(e.target.value))} /></label><div className="cycle-dots">{Array.from({ length: activeWash.maxCycles }, (_, i) => <i key={i} className={i < activeWash.applied.length ? "done" : ""}>{i + 1}</i>)}</div></div>
          <div className="wash-result"><div><span>Modelled DBT saved</span><strong>{money(dbtSaved)}</strong></div><div><span>Remaining DBT</span><strong>{money(dbtRemaining)}</strong></div><div><span>Taxable component remaining</span><strong>{money(taxableRemaining)}</strong></div></div>
        </div>
        <div className="note"><b>Execution dependency:</b> the engine now uses the direct CSC lump components for the active source and stops when that original PSS lump is exhausted. It does not assign those components to Hostplus. Confirm eligibility and whether Hostplus can preserve each clean NCC amount as a separate interest before acting.</div>
      </section>
      <section className="panel estate-composition">
        <div><h3>Selected gross estate at {targetAge}</h3><strong>{money(estate)}</strong><p>{money(endCapital)} investments + {money(homeValue)} home at {pct(realReturn, 1)} real return p.a.</p></div>
        <div className="estate-bar"><i className="investment" style={{ width: `${(endCapital / estate) * 100}%` }}><span>Investments {pct(endCapital / estate)}</span></i><i className="home" style={{ width: `${(homeValue / estate) * 100}%` }}><span>Home {pct(homeValue / estate)}</span></i></div>
        <div className="split-grid"><div><span>Gross per child · 2-way</span><b>{money(estate / 2)}</b></div><div><span>Illustrative residual DBT</span><b>−{money(dbtRemaining)}</b></div><div><span>After that DBT only</span><b>{money(estate - dbtRemaining)}</b></div></div>
        <small>Does not deduct administration, transaction costs, personal debts or tax arising outside super.</small>
      </section>
    </>;
  };

  const renderVr = () => {
    const activeSourceLabel = railKey === "A" ? "March/V5 60/40 control" : `${projectionBasis.label} · ${rail.electionLabel}`;
    const age60Headroom = Math.max(0, TBC - rail.grossPension * 16);
    const headroomDelta = selectedVrPath.headroom - age60Headroom;
    const selectedPathName = vrMode === "immediate" ? "Start PSS immediately" : "Preserve whole PSS to 60";
    const selectedLumpLabel = vrMode === "immediate" ? "PSS lump + VR cash at 60" : "Preserved PSS lump + VR cash at 60";
    return <>
      <SectionHeading eyebrow="Illustrative early-retirement lab · active scenario" title="Voluntary retirement / redundancy at 57–59" copy="See how the timing trade-off changes for the PSS basis and pension/lump election you have actually selected. The age-60 anchor is source-backed; ages 57–59 are transparent illustrations until CSC supplies formal VR estimates." />
      <section className="panel vr-source-boundary" aria-labelledby="vr-source-title">
        <div><Badge tone="modelled">Active anchor · {activeSourceLabel}</Badge><h3 id="vr-source-title">Current choices now drive the VR illustration</h3><p>The selected age-60 pension, lump and FAS form the anchor. March/V5 research supplies only the early-age ABM pattern and published pension-conversion factors. Provider CPI is already reflected in the CPI-reduced source anchor; the PSS pension therefore stays flat in real terms, while your selected {pct(realReturn, 1)} real return grows investable lump and illustrative VR cash to age 60.</p></div>
        <div className="vr-source-actions"><span><b>Direct source</b>age-60 {rail.electionLabel} values</span><span><b>Illustrative layer</b>ages 57–59 timing and cash-growth bridge</span><span><b>Before relying on it</b>obtain formal CSC VR estimates and tax components</span></div>
      </section>

      <section className="panel vr-scenario-studio" aria-label="VR scenario foundation">
        <div className="panel-head"><div><h3>1 · Choose the age-60 source anchor</h3><p>Changing either control recalculates every VR card, chart and table below.</p></div><Badge tone="exact">{activeSourceLabel}</Badge></div>
        <div className="vr-basis-grid" role="group" aria-label="Select VR provider projection basis">
          {(Object.values(PSS_PROJECTION_BASES) as PssProjectionBasis[]).map((basis) => <button type="button" key={basis.key} className={railKey === "B" && pssProjectionBasis === basis.key ? "active" : ""} aria-pressed={railKey === "B" && pssProjectionBasis === basis.key} onClick={() => chooseProjectionBasis(basis.key)}><span>{basis.label}</span><b>{basis.shortLabel}%</b><small>{electionKeysForBasis(basis.key).length} sourced elections · CPI {pct(basis.cpi, 1)}</small></button>)}
          <button type="button" className={railKey === "A" ? "active" : ""} aria-pressed={railKey === "A"} onClick={() => setRailKey("A")}><span>Historical control</span><b>March/V5</b><small>60/40 research anchor · CPI 2.5%</small></button>
        </div>
        <div className="vr-election-grid" role="group" aria-label="Select VR pension and lump election">
          {PSS_ELECTION_ORDER.map((key) => { const option = activePssElections[key]; const selected = railKey === "B" && effectivePssElection === key; return <button type="button" key={key} disabled={!option} className={selected ? "active" : ""} aria-pressed={selected} onClick={() => { if (!option) return; setPssElection(key); setRailKey("B"); }}><b>{key === "100" ? "100% pension" : key.replace("-", "/")}</b><span>{option ? `${money(option.netPension)} net · ${money(option.lumpSum)} lump` : "No matching provider PDF"}</span></button>; })}
        </div>
      </section>

      <section className="vr-controls" aria-label="Choose VR pathway and age"><div><span className="control-kicker">2 · Pathway</span><div className="segmented"><button className={vrMode === "immediate" ? "active" : ""} aria-pressed={vrMode === "immediate"} onClick={() => setVrMode("immediate")}>Start PSS immediately</button><button className={vrMode === "preserve" ? "active" : ""} aria-pressed={vrMode === "preserve"} onClick={() => setVrMode("preserve")}>Preserve whole PSS to 60</button></div></div><div><span className="control-kicker">3 · Exit / pension decision age</span><div className="segmented ages">{VR_AGES.map((age) => <button key={age} className={vrAge === age ? "active" : ""} aria-pressed={vrAge === age} onClick={() => setVrAge(age)}>Age {age}</button>)}</div></div></section>

      <section className="vr-reading-guide" aria-label="How to read this result"><div><span>Selected comparison</span><b>Age {vrAge} · {selectedPathName}</b></div><i aria-hidden="true">→</i><div><span>PSS source basis</span><b>{railKey === "A" ? "March/V5" : projectionBasis.shortLabel}% · {rail.electionLabel}</b></div><i aria-hidden="true">→</i><div><span>Real-dollar bridge to 60</span><b>{pct(realReturn, 1)} real on cash · pension flat in real $</b></div></section>

      <div className="metrics four">
        <Metric label={vrMode === "immediate" ? `Gross pension starting at ${vrAge}` : "Gross pension starting at 60"} value={money(vrMode === "immediate" ? selectedVrPath.pensionStart : selectedVrPath.pension60)} sub={vrMode === "immediate" ? `${money(selectedVrPath.pre60GrossPension)} gross pension before 60 · today's dollars` : "No PSS pension is paid before age 60"} tone="violet" />
        <Metric label="PSS pension by age 60" value={money(selectedVrPath.pension60)} sub={`${fmt1.format(selectedVrPath.netPf60)} indicative net / fortnight at 60`} />
        <Metric label="Raw TBC headroom" value={money(selectedVrPath.headroom)} sub={headroomDelta === 0 ? "No additional headroom versus the same election starting at 60" : `${headroomDelta > 0 ? "+" : "−"}${money(Math.abs(headroomDelta))} versus the same election starting at 60`} tone="green" />
        <Metric label={selectedLumpLabel} value={money(selectedVrPath.flexibleCapitalAt60)} sub={`Includes ${money(selectedVrPath.vrCashAt60)} illustrative VR cash · excludes existing Hostplus`} tone="amber" />
      </div>

      <section className="vr-path-comparison" aria-label={`Compare VR pathways at age ${vrAge}`}>
        {[selectedVrImmediate, selectedVrPreserve].map((path) => { const isActive = vrMode === path.mode; const pathTitle = path.mode === "immediate" ? "Start PSS immediately" : "Preserve whole PSS to 60"; return <button type="button" key={path.mode} className={isActive ? "active" : ""} aria-pressed={isActive} onClick={() => setVrMode(path.mode)}><div><Badge tone={path.mode === "immediate" ? "good" : "modelled"}>{path.mode === "immediate" ? "TBC timing strategy" : "Pension preservation strategy"}</Badge><h3>{pathTitle}</h3><p>{path.mode === "immediate" ? `Pension and ${rail.lumpPercent}% lump begin at ${vrAge}; the TBC credit locks then.` : `The whole PSS remains preserved; the selected ${rail.pensionPercent}/${rail.lumpPercent} election is illustrated at 60.`}</p></div><dl><div><dt>Pension by 60</dt><dd>{money(path.pension60)}</dd></div><div><dt>Raw TBC headroom</dt><dd>{money(path.headroom)}</dd></div><div><dt>Potential ABP at 60</dt><dd>{money(path.potentialAbpAt60)}</dd></div><div><dt>Super kept outside ABP</dt><dd>{money(path.superOutsideAbp)}</dd></div></dl></button>; })}
      </section>

      {selectedVrPath.headroom === 0 && <div className="note warn"><b>No ABP headroom on this illustration:</b> the selected PSS pension’s ×16 special value uses the full {money(TBC)} planning cap (or exceeds it). Existing Hostplus can remain in accumulation, but this model does not place it in a new retirement-phase ABP without headroom.</div>}
      <div className="note"><b>Money-bucket boundary:</b> “Potential ABP at 60” includes existing Hostplus plus the illustrated PSS lump, capped by raw TBC headroom less the {money(TSB_BUFFER)} planning buffer. The VR employment payment is shown separately and is not assumed to be a super rollover.</div>

      <CollapsiblePanel title="TBC headroom and pension by decision age" copy={`Active ${rail.electionLabel} · ${railKey === "A" ? "March/V5" : projectionBasis.shortLabel + "%"} provider basis · today's dollars.`} meta="Open the interactive timing curves" badge={<Badge tone="modelled">Illustrative ages 57–59</Badge>}><div className="vr-chart-stack"><div><h4>Raw TBC headroom</h4><LineChart height={240} labels={[...VR_AGES]} series={[{ name: "Start PSS immediately", values: vrImmediatePaths.map((row) => row.headroom), color: "#47d6a0" }, { name: "Preserve to 60", values: vrPreservePaths.map((row) => row.headroom), color: "#6f8cff" }]} /></div><div><h4>Gross PSS pension by age 60</h4><LineChart height={240} labels={[...VR_AGES]} series={[{ name: "Immediate start, flat in real terms", values: vrImmediatePaths.map((row) => row.pension60), color: "#9d79ff" }, { name: "Preserve whole PSS to 60", values: vrPreservePaths.map((row) => row.pension60), color: "#f3a950" }]} /></div></div></CollapsiblePanel>

      <CollapsiblePanel title="Age-by-age VR comparison" copy="The same active source anchor, election and assumptions are applied consistently across ages 57–60." meta="Open exact illustrated figures" badge={<Badge tone="exact">Scenario-aware</Badge>}><p className="mobile-scroll-cue">Swipe sideways inside the table to compare every figure.</p><div className="table-scroll" role="region" aria-label="Age-by-age VR comparison table; scroll horizontally for all columns" tabIndex={0}><table className="vr-table"><thead><tr><th>Age</th><th>Path</th><th>Gross pension at start</th><th>Pension by 60</th><th>PSS lump at 60</th><th>VR cash at 60</th><th>Raw TBC headroom</th><th>Potential ABP at 60</th></tr></thead><tbody>{VR_AGES.flatMap((age) => [vrImmediatePaths.find((row) => row.age === age)!, vrPreservePaths.find((row) => row.age === age)!]).map((path) => <tr key={`${path.age}-${path.mode}`} className={path.age === vrAge && path.mode === vrMode ? "selected" : ""}><td>{path.age}</td><td>{path.mode === "immediate" ? "Immediate" : "Preserve"}</td><td>{path.mode === "immediate" ? money(path.pensionStart) : "—"}</td><td>{money(path.pension60)}</td><td>{money(path.pssLumpAt60)}</td><td>{money(path.vrCashAt60)}</td><td>{money(path.headroom)}</td><td>{money(path.potentialAbpAt60)}</td></tr>)}</tbody></table></div></CollapsiblePanel>

      <CollapsiblePanel title="How the illustration is calculated" copy="Clear separation between sourced age-60 values and scenario assumptions." meta="Open formulas, assumptions and limitations" badge={<Badge tone="speculative">Formal CSC estimate required</Badge>}><div className="decision-grid"><article><h3>Source-backed anchor</h3><p>{activeSourceLabel}: gross pension {money(rail.grossPension)}, lump {money(rail.lumpSum)}, FAS {money(rail.fas)}. Those age-60 values are CPI-reduced provider outputs and are not interpolated between bases.</p></article><article><h3>Early-age calibration</h3><p>March/V5 research supplies ABM ratios of 90.7%, 93.8%, 96.9% and 100%, with pension-conversion factors 11.6, 11.4, 11.2 and 11.0 at ages 57–60.</p></article><article><h3>Real-dollar growth bridge</h3><p>The CPI-indexed PSS pension is held flat in today's dollars. Invested PSS lump and the illustrative 48-week VR payment grow only at the selected {pct(realReturn, 1)} real return to age 60; the provider's {pct(vrBasis.cpi, 1)} CPI assumption is not applied a second time.</p></article><article><h3>What is not assumed</h3><p>No under-60 tax-component split, ETP rollover, personal cap indexation, preserved member-component return or formal CSC redundancy quote is invented.</p></article></div></CollapsiblePanel>
      <CollapsiblePanel title="Decision logic and confirmations" copy="The pathways answer different objectives; neither is automatically better." meta="Open benefits, costs and evidence required" badge={<Badge tone="speculative">Decision gate</Badge>}><div className="decision-grid"><article><h3>Start PSS immediately</h3><p><b>Potential benefit:</b> earlier indexed income and a lower ×16 credit may leave more ABP headroom.</p><p><b>Trade-off:</b> a permanently lower pension base and uncertain under-60 tax until CSC supplies components.</p></article><article><h3>Preserve whole PSS</h3><p><b>Potential benefit:</b> keeps the whole PSS for a later pension/lump election.</p><p><b>Trade-off:</b> the TBC credit occurs at 60 and the exact preserved result depends on personal components.</p></article><article><h3>Required confirmation</h3><p>Formal CSC estimates at 57, 58 and 59 for each election being considered; pension and lump tax components; post-1995 transfer amounts; preservation growth; and written election sequencing.</p></article></div></CollapsiblePanel>
    </>;
  };

  const renderBenchmark = () => (
    <>
      <SectionHeading eyebrow="Comparative context" title="Retirement position in context" copy="The structure is unusually resilient because lifetime indexed income, flexible capital and a mortgage-free home solve different risks rather than forcing one portfolio to solve all of them." />
      <div className="benchmark-hero"><div><span>Structural assessment</span><strong>Advantaged</strong><p>Lifetime indexed income, flexible capital and owned housing create a strong structure. This site deliberately makes no personal percentile claim: it has no representative peer sample or comparable household methodology.</p></div><div><span>Economic-equivalence frame · Rail {railKey}</span><strong>~{money(1_800_000 * (rail.netPension / RAILS.A.netPension) + rail.capital + homeValue)}</strong><p>[ESTIMATED] Pension replacement value scaled to the selected rail + flexible capital + selected real home value; not liquid wealth or estate value.</p></div></div>
      <section className="risk-grid">
        {[ ["Longevity", "Transferred", "Indexed PSS pension payable for life"], ["Sequence risk", "Income neutralised", "Markets affect optionality and bequest more than the floor"], ["Inflation", "Strong hedge", "PSS floor indexed; growth capital targets real returns"], ["Depletion", "Floor protected", "Capital is not required to sustain basic income"], ["Estate tax", "Actively managed", "NCC wash targets taxable super components"], ["Liquidity", liquidityGap > 0 ? "Policy gap" : "Policy aligned", `Pool C is invested, not cash. ${liquidityMonths}-month starting-gap target is ${money(liquidityTarget)}; current Pool C is ${money(rail.poolC)}.`] ].map(([name, state, copy]) => <article key={name}><div><span>{name}</span><Badge tone={state === "Policy gap" ? "warn" : "good"}>{state}</Badge></div><p>{copy}</p></article>)}
      </section>
      <section className="panel calibration-panel"><div className="panel-head"><div><h3>Independent spending calibration</h3><p>Context only, not a target, recommendation or substitute for your own tracked spending.</p></div><Badge tone="estimated">ASFA · {ASFA_MARCH_2026.asAt}</Badge></div><div className="calibration-grid"><article><span>Single, comfortable</span><b>{money(ASFA_MARCH_2026.singleComfortable)} p.a.</b><small>Homeowner aged 65–84</small></article><article><span>Couple, comfortable</span><b>{money(ASFA_MARCH_2026.coupleComfortable)} p.a.</b><small>Homeowner aged 65–84</small></article><article><span>Your active flat lens</span><b>{money(spend)} p.a.</b><small>Net, real dollars; use V23 for changing age bands</small></article></div><p className="calibration-footnote">ASFA is a population spending benchmark with its own household assumptions. It does not include the particular pension, capital, health, housing or lifestyle choices in this plan.</p></section>
      <section className="panel"><div className="panel-head"><div><h3>Retirement income versus current working cashflow</h3><p>The comparison must be made after current deductions and savings behaviour, not against headline salary alone.</p></div><Badge tone="estimated">Cashflow context</Badge></div><div className="cashflow-bars"><div><span>Current cash after all expenses</span><i style={{ width: `${(currentPf / 5_000) * 100}%` }} /><b>{fmt1.format(currentPf)} / pf</b></div>{[90_000, 100_000, 110_000, 120_000, 130_000].map((v) => <div key={v}><span>{money(v)} retirement spend</span><i style={{ width: `${(v / 26 / 5_000) * 100}%` }} /><b>{fmt1.format(v / 26)} / pf</b></div>)}</div></section>
      <div className="note"><b>Interpretation:</b> the pension’s replacement value is not an estate asset. It finances consumption for life. The portfolio and home create the transferable estate separately.</div>
    </>
  );

  const renderReview = () => {
    const checklist = [
      ["pss", "Refresh formal PSS estimate", "Confirm pension, lump sum, component split and transfer-balance credit."],
      ["balances", "Update Hostplus and cash balances", "Use actual statement balances before changing contribution settings."],
      ["spending", "Reconcile twelve-month spending", "Replace aspirational bands with observed lifestyle costs."],
      ["tax", "Confirm tax, TBC and NCC rules", "Review thresholds and caps before any transaction."],
      ["estate", "Review beneficiaries and estate documents", "Confirm nominations, will, powers of attorney and intended split."],
      ["risk", "Run downside and sequence tests", "Check floor margin before one-offs or permanent spending increases."],
      ["backup", "Export the new baseline", "Keep the dated JSON with the source statements used for the review."],
    ];
    const completed = checklist.filter(([key]) => reviewChecks[key]).length;
    const priorComparableCapital = reviewSnapshot
      ? ledgerEndingAtAge(railFor(reviewSnapshot.rail, reviewSnapshot.pssElection ?? "60-40", normaliseProjectionBasis(reviewSnapshot.pssProjectionBasis)), reviewSnapshot.spend, reviewSnapshot.realReturn, targetAge, reviewSnapshot.taxYear ?? "2026-27")
      : 0;
    const priorComparableEstate = reviewSnapshot ? priorComparableCapital + reviewSnapshot.homeValue : 0;
    const deltas = reviewSnapshot ? [
      { label: "Annual spending", value: spend - reviewSnapshot.spend, format: money },
      { label: "Real return assumption", value: realReturn - reviewSnapshot.realReturn, format: (value: number) => pct(value, 1) },
      { label: "Target age", value: targetAge - reviewSnapshot.targetAge, format: (value: number) => `${Math.round(value)} years` },
      { label: `Capital @${targetAge} · like-for-like horizon`, value: endCapital - priorComparableCapital, format: money },
      { label: `Gross estate @${targetAge} · incl. home`, value: estate - priorComparableEstate, format: money },
    ] : [];
    const actualReviewRow = ledger.find((row) => row.age === actualReviewAge && !row.isOpening) ?? ledger[1];
    const actualCheckpoint = actualCheckpoints[actualReviewAge] ?? EMPTY_CHECKPOINT;
    const original = actualCheckpoint.baseline;
    const revised = forecastForReview(actualReviewRow);
    const actualComparisons = [
      ["capital", "Investment capital"],
      ["pension", "PSSDB pension received"],
      ["spending", "Lifestyle spending"],
    ] as const;
    return <>
      <SectionHeading eyebrow="Governed update cycle" title="Annual retirement review" copy="Turn a complex model into a repeatable professional process: refresh evidence, compare changes, decide actions and preserve a dated baseline." />
      <section className="review-hero panel">
        <div><Badge tone={completed === checklist.length ? "good" : "warn"}>{completed === checklist.length ? "Review complete" : `${completed} of ${checklist.length} complete`}</Badge><h3>2026–27 baseline review</h3><p>Source baseline: September 2026 PSS election release. Local review data stays on this device and is included in the JSON export.</p></div>
        <div className="review-progress" aria-label={`${completed} of ${checklist.length} review tasks complete`}><i style={{ width: `${completed / checklist.length * 100}%` }} /><span>{Math.round(completed / checklist.length * 100)}%</span></div>
        <div className="review-actions"><button className="primary" onClick={captureReview}>{reviewSnapshot ? "Replace review snapshot" : "Capture current snapshot"}</button><button className="secondary" onClick={exportSettings}>Export review pack</button></div>
      </section>
      <section className="panel">
        <div className="panel-head"><div><h3>What changed?</h3><p>{reviewSnapshot ? `Compared with the local snapshot captured ${new Date(reviewSnapshot.capturedAt).toLocaleDateString("en-AU", { day: "numeric", month: "long", year: "numeric" })}.` : "Capture a snapshot now; future reviews will display the exact changes here."}</p></div><Badge tone="modelled">Device-local comparison</Badge></div>
        {reviewSnapshot ? <div className="delta-grid">{deltas.map((delta) => <article key={delta.label} className={delta.value === 0 ? "neutral" : delta.value > 0 ? "up" : "down"}><span>{delta.label}</span><strong>{delta.value > 0 ? "+" : ""}{delta.format(delta.value)}</strong><small>{delta.value === 0 ? "No change" : "Since captured baseline"}</small></article>)}</div> : <div className="empty-state"><b>No earlier snapshot on this device</b><p>The site will not invent a comparison. Capture the governed current settings when you are ready to start the review cycle.</p></div>}
      </section>
      <section className="panel actual-plan-review">
        <div className="panel-head"><div><h3>Actual versus plan checkpoint</h3><p>Record the confirmed outcome after each planning year. The first entry keeps a copy of the saved forecast, or the forecast at entry when no dated snapshot is available.</p></div><label className="age-select">Planning year<select value={actualReviewAge} onChange={(event) => setActualReviewAge(Number(event.target.value))}>{ledger.filter((row) => !row.isOpening).map((row) => <option key={row.age} value={row.age}>{row.year} · age {row.ageLabel}</option>)}</select></label></div>
        <div className="actual-plan-layout">
          <div className="actual-plan-inputs">
            <label><span>Actual investment capital at year end</span><input inputMode="decimal" type="number" min="0" placeholder={String(Math.round(actualReviewRow.ending))} value={actualCheckpoint.capital ?? ""} onChange={(event) => updateActualCheckpoint("capital", event.target.value)} /><small>Combined Pool A and Pool C; enter a confirmed statement value.</small></label>
            <label><span>Actual PSSDB pension received</span><input inputMode="decimal" type="number" min="0" placeholder={String(Math.round(actualReviewRow.pension))} value={actualCheckpoint.pension ?? ""} onChange={(event) => updateActualCheckpoint("pension", event.target.value)} /><small>Total net amount actually received for that planning year.</small></label>
            <label><span>Actual lifestyle spending</span><input inputMode="decimal" type="number" min="0" placeholder={String(Math.round(actualReviewRow.spend))} value={actualCheckpoint.spending ?? ""} onChange={(event) => updateActualCheckpoint("spending", event.target.value)} /><small>Observed annual spend, not the future spending control.</small></label>
            <label className="actual-plan-note"><span>Review note</span><textarea placeholder="Source, timing or explanation for any variance" value={actualCheckpoint.note} onChange={(event) => updateActualCheckpointNote(event.target.value)} /></label>
          </div>
          <div className="actual-plan-results" aria-live="polite">{actualComparisons.map(([field,label]) => {
            const actual = actualCheckpoint[field];
            const baseline = original?.[field];
            const variance = actual === null || baseline === undefined ? null : actual - baseline;
            return <article key={field} data-review-field={field}>
              <h4>{label}</h4>
              <dl>
                <div><dt>Saved forecast</dt><dd>{baseline===undefined?"Unavailable":money(baseline)}</dd></div>
                <div><dt>Recorded actual</dt><dd>{actual===null?"Not entered":money(actual)}</dd></div>
                <div><dt>Current forecast</dt><dd>{money(revised[field])}</dd></div>
              </dl>
              {variance!==null && <small>{variance>0?"+":""}{money(variance)} vs saved forecast</small>}
            </article>;
          })}</div>
        </div>
        <p className="actual-plan-footnote">{original
          ?`Forecast saved ${new Date(original.capturedAt).toLocaleDateString("en-AU")} ${original.origin==="snapshot"?"in the plan snapshot":"when the first actual was entered"}.`
          :"Earlier actuals can have no saved forecast. Capture a dated plan snapshot before recording future years."} Records are device-local and included in the review export.</p>
      </section>
      <section className="review-grid">
        <div className="panel checklist-panel"><div className="panel-head"><div><h3>Review checklist</h3><p>Complete in order; each task preserves an auditable decision trail.</p></div><button className="text-button" onClick={() => { setReviewChecks({}); localStorage.removeItem("robinson-retirement-review-checks"); }}>Reset</button></div>{checklist.map(([key, label, detail], index) => <label className={reviewChecks[key] ? "done" : ""} key={key}><input type="checkbox" checked={Boolean(reviewChecks[key])} onChange={() => toggleReviewCheck(key)} /><span>{index + 1}</span><div><b>{label}</b><small>{detail}</small></div></label>)}</div>
        <div className="review-side">
          <section className="panel"><div className="panel-head"><div><h3>Command Centre comparison lens</h3><p>Flat assumptions shown here; the detailed V23 spending plan stays independently managed.</p></div><Badge tone={railKey === "A" ? "modelled" : "exact"}>Rail {railKey}</Badge></div><dl className="review-baseline"><div><dt>Flat spending lens</dt><dd>{money(spend)}</dd></div><div><dt>Return</dt><dd>{pct(realReturn, 1)}</dd></div><div><dt>Target</dt><dd>Age {targetAge}</dd></div><div><dt>Home</dt><dd>{money(homeValue)}</dd></div></dl><a className="primary wide-link" href={v23SpendPlanUrl} target="_blank" rel="noreferrer">Review age bands in V23 ↗</a></section>
          <section className="panel source-freshness"><div className="panel-head"><div><h3>Source freshness</h3><p>Inputs that require annual confirmation.</p></div></div>{[["PSS current-basis elections", "1 Sep 2026 · 8.2 / 5 / 2.5 · four options", "Current"], ["PSS prudent-basis elections", "1 & 9 Sep 2026 · 6 / 5 / 3 · four options", "Current"], ["Payroll / CSC salary record", "$138,394 birthday salary", "Current"], ["PSS annual statement", "2026 statement", "Pending reissue"], ["Tax and super caps", "2026–27", "Confirm annually"]].map(([name, date, status]) => <div key={name}><span><b>{name}</b><small>{date}</small></span><Badge tone={status === "Current" ? "good" : "warn"}>{status}</Badge></div>)}</section>
        </div>
      </section>
    </>;
  };

  const renderEvidence = () => (
    <>
      <SectionHeading eyebrow="Governance" title="Evidence, classifications and audit" copy="Every major figure is traceable to a supplied source, a verified rule, or an explicitly labelled model. The two rails remain separate by design." />
      <section className="classification-grid"><article><Badge tone="exact">EXACT</Badge><h3>Documented inputs</h3><p>PSS iEstimator figures, annual-statement values, supplied balances and directly calculated arithmetic.</p></article><article><Badge tone="estimated">ESTIMATED</Badge><h3>External pricing</h3><p>Economic replacement values, market comparisons and provider-dependent implementation costs.</p></article><article><Badge tone="modelled">MODELLED</Badge><h3>Scenario outputs</h3><p>Returns, drawdowns, spending paths, VR values, capital projections and death-tax wash effects.</p></article><article><Badge tone="speculative">SPECULATIVE</Badge><h3>Unknown future state</h3><p>Future legislation, market sequences, exact preserved PSS components, longevity and future tax.</p></article></section>
      <section className="panel audit-alert"><Badge tone="warn">Reconciliation control</Badge><div><h3>Do not mix rails, elections or projection bases silently</h3><p>Rail A remains the March/V5 historical control. Rail B uses one explicitly selected CSC election from one verified provider basis. Every output carries the rail, election and basis through shared links and local scenario state.</p></div></section>
      <CollapsiblePanel title="Source register" copy="Raw personal PDFs are not re-published by this site; only the governed financial inputs are integrated." meta={`${SOURCES.length} reviewed files`}><div className="source-list">{SOURCES.map(([name, role, status]) => <article key={name}><div><code>{name}</code><p>{role}</p></div><Badge tone={status === "Authoritative" ? "good" : status.includes("Rail B") ? "exact" : "modelled"}>{status}</Badge></article>)}</div></CollapsiblePanel>
      <section className="panel"><div className="panel-head"><div><h3>Known mismatch controls</h3><p>Explicitly resolved in this integrated view.</p></div><Badge tone="good">Controlled</Badge></div><div className="control-register"><div><b>Direct component evidence</b><p>Rail A uses its March CSC split; every Rail B lump option uses the direct components from its selected basis and election. Provider one-cent component-display residuals are retained rather than rewritten. Hostplus components remain unresolved.</p></div><div><b>Source-limited wash execution</b><p>Each cycle is capped by the remaining original PSS lump and the selected annual amount. Clean NCC money is assumed to remain separate; provider and eligibility confirmation remains mandatory.</p></div><div><b>PSS election evidence</b><p>Both provider bases now supply four direct elections. The prudent 100% estimate is a later 9 September snapshot with FAS $162,485.36; the other prudent elections retain their 1 September FAS $162,380.20.</p></div><div><b>Projection-basis boundary</b><p>Each provider estimate carries its own FAS, pension, lump and tax components. No value is inferred or mixed across bases or source dates, and the post-retirement site return remains a separate control.</p></div><div><b>Salary evidence</b><p>The corrected birthday super salary is $138,394. September estimates prospectively use the current $143,099 salary; the annual statement remains pending reissue.</p></div><div><b>Gross vs net</b><p>Gross pension, estimated net pension, net spending and salary gross-equivalent are distinct fields everywhere.</p></div><div><b>Return assumptions</b><p>The active provider basis is a pre-retirement estimate input. Site controls are separate post-retirement real returns and are labelled alongside every material projection.</p></div></div></section>
      <section className="official-links"><a href="https://www.ato.gov.au/tax-rates-and-codes/tax-rates-australian-residents" target="_blank" rel="noreferrer"><span>ATO</span><b>Resident tax rates</b><small>2026–27 and later ↗</small></a><a href="https://www.ato.gov.au/individuals-and-families/super-for-individuals-and-families/super/growing-and-keeping-track-of-your-super/caps-limits-and-tax-on-super-contributions/non-concessional-contributions-cap" target="_blank" rel="noreferrer"><span>ATO</span><b>NCC caps</b><small>$130k from 1 July 2026 ↗</small></a><a href="https://www.ato.gov.au/individuals-and-families/super-for-individuals-and-families/self-managed-super-funds-smsf/smsf-newsroom/general-transfer-balance-cap-indexation-on-1-july-2026" target="_blank" rel="noreferrer"><span>ATO</span><b>TBC indexation</b><small>$2.1m from 1 July 2026 ↗</small></a><a href="https://www.csc.gov.au/defined-benefit-members/funds/pss" target="_blank" rel="noreferrer"><span>CSC</span><b>PSS scheme</b><small>Formula and access options ↗</small></a><a href="https://www.superannuation.asn.au/consumers/retirement-standard/" target="_blank" rel="noreferrer"><span>ASFA</span><b>Retirement Standard</b><small>Independent spending context ↗</small></a><a href="https://www.ato.gov.au/individuals-and-families/super-for-individuals-and-families/super/in-detail/superannuation-and-tax/defined-benefit-income-cap" target="_blank" rel="noreferrer"><span>ATO</span><b>Defined benefit cap</b><small>Confirm annual tax treatment ↗</small></a></section>
      <div className="disclaimer">Decision-support model only. It does not replace CSC benefit estimates, licensed personal financial advice, tax advice, legal advice or annual confirmation of legislation.</div>
    </>
  );

  const renderExplorer=()=> <>
    <SectionHeading eyebrow="Explore the plan" title="One plan. Different ways to understand it." copy="The former Atlas illustrations now live here. All views use the active plan above; only the way you inspect it changes. V23 remains your age-band workbench." />
    <div className="explorer-panel-tabs" role="group" aria-label="Choose plan exploration">
      {EXPLORER_PANELS.map(item=><button type="button" key={item.key} aria-pressed={explorerPanel===item.key} className={explorerPanel===item.key?"active":""} onClick={()=>setExplorerPanel(item.key)}>{item.label}</button>)}
    </div>
    <p className="explorer-panel-copy">{EXPLORER_PANELS.find(item=>item.key===explorerPanel)?.copy}</p>
    <VisualExplorerPanel key={explorerPanel} scenario={currentScenario} theme={theme} panel={explorerPanel} view={visualView} onSpend={setSpend} onView={setVisualView}/>
  </>;

  const renderSurface = () => <>
    <SectionHeading eyebrow="Decision workspace" title="Compare spending and returns" copy={`See your investments at age ${targetAge} under your current plan, then explore other spending and return assumptions.`} />
    <DecisionSurface
      rail={rail}
      spend={spend}
      realReturn={realReturn}
      targetAge={targetAge}
      theme={theme}
      draftUrl={(next) => sharedPageUrl("deep-model.html?page=decisionbrief&poolC=after-abp", { ...currentScenario, ...next }, theme)}
      onAdopt={({ spend: nextSpend, realReturn: nextReturn }) => {
        setSpend(clamp(nextSpend, 76_000, MAX_FLAT_SPEND));
        setRealReturn(clamp(nextReturn, 0.02, 0.075));
      }}
    />
  </>;

  const renderScenarioWorkspace=()=>{
    const selected=SCENARIO_TOOLS.find(item=>item.key===scenarioTool)!;
    const body=scenarioTool==="explore"?renderExplorer():scenarioTool==="compare"?renderCompare():scenarioTool==="frontier"?renderFrontier():scenarioTool==="surface"?renderSurface():scenarioTool==="risk"?renderRisk():renderScenario();
    return <>
      <section className="scenario-hub" aria-labelledby="scenario-hub-title">
        <div><span>Scenario workspace</span><h2 id="scenario-hub-title">One active plan. Six ways to work with it.</h2><p>{selected.hint} The active comparison plan above applies to every tab.</p></div>
        <div className="scenario-hub-tabs" role="tablist" aria-label="Scenario tools">
          {SCENARIO_TOOLS.map(item=><button type="button" role="tab" aria-selected={scenarioTool===item.key} className={scenarioTool===item.key?"active":""} key={item.key} onClick={()=>openScenarioTool(item.key)}><b>{item.label}</b><small>{item.hint}</small></button>)}
        </div>
      </section>
      <div role="tabpanel" aria-label={`Scenario ${selected.label}`}>{body}</div>
    </>;
  };

  const planControls=<details className="shared-plan-controls">
    <summary><span className="plan-summary-title">Active comparison plan <small>Expand to adjust · applies to every Command Centre view</small></span><span className="plan-summary-values"><b>Rail {railKey} · {railKey==="B"?rail.electionLabel:"March control"}</b><b>{money(spend)}/yr</b><b>{pct(realReturn,1)} real return</b><b>Target {targetAge}</b></span></summary>
    <div className="shared-plan-fields">
      <label>Modelling rail<select value={railKey} onChange={e=>setRailKey(e.target.value as RailKey)}><option value="B">Rail B · current CSC elections</option><option value="A">Rail A · March control</option></select></label>
      <label>CSC projection basis<select value={pssProjectionBasis} disabled={railKey==="A"} onChange={e=>chooseProjectionBasis(e.target.value as PssProjectionBasisKey)}><option value="source-825">8.2% fund / 5% salary / 2.5% CPI</option><option value="prudent-630">6% fund / 5% salary / 3% CPI</option></select></label>
      <label>PSS election<select value={effectivePssElection} disabled={railKey==="A"} onChange={e=>setPssElection(e.target.value as PssElectionKey)}>{activePssElectionKeys.map(key=><option key={key} value={key}>{activePssElections[key]!.label}</option>)}</select></label>
      <label>Flat net spending / year<PlanNumberInput value={spend} min={76000} max={MAX_FLAT_SPEND} step={1000} onChange={setSpend}/></label>
      <label>Real return after inflation (%)<PlanNumberInput value={Number((realReturn*100).toFixed(2))} min={2} max={7.5} step={0.25} onChange={n=>setRealReturn(n/100)}/></label>
      <label>Target age<PlanNumberInput value={targetAge} min={70} max={95} onChange={setTargetAge}/></label>
      <label>Real home value<PlanNumberInput value={homeValue} min={300000} max={1000000} step={10000} onChange={setHomeValue}/></label>
    </div>
    <p>These outputs hold total spending flat in today’s dollars. For changing spending by age, <a href={v23SpendPlanUrl}>open Income &amp; draws in V23</a>. Your saved V23 age bands remain separate. The CSC basis is before retirement; the real-return control applies afterwards.</p>
    <p className="command-plan-id"><b>Plan ID </b><code>{commandPlan.planId}</code> · engine {commandPlan.modelRevision} · {commandPlan.sourceDate} pension source · Pool C kept in reserve · seed {simulationSeed}. Each year runs from one birthday to the next.</p>
    {importedPlan && <p role="status">{!importedPlan.planId ? "Older settings loaded. Use the current plan ID for future exports."
      : importedPlan.planId !== commandPlan.planId ? `The current plan ID differs from the imported ID ${importedPlan.planId}.`
      : importedPlan.modelRevision !== commandPlan.modelRevision ? `Plan ID matches. The file used calculation version ${importedPlan.modelRevision}.`
      : "Imported plan ID and calculation version match."}</p>}
  </details>;

  if(!scenarioHydrated)return <div className={`retirement-app ${theme}`}><main className="panel" role="status"><h1>Robinson Retirement</h1><p>Loading your saved plan and shared assumptions…</p><noscript>Enable JavaScript for the interactive model, or <a href="./model-reference.html">read the model reference</a>.</noscript></main></div>;

  const content = section === "overview" ? renderOverview() : section === "scenario" ? renderScenarioWorkspace() : section === "pre60" ? renderPre60() : section === "pss" ? renderPss() : section === "estate" ? renderEstate() : section === "vr" ? renderVr() : section === "benchmark" ? renderBenchmark() : section === "review" ? renderReview() : renderEvidence();
  const pageGuide = section === "scenario" ? SCENARIO_GUIDES[scenarioTool] : SECTION_GUIDES[section];
  const pageGuideName = section === "scenario" ? `Scenario → ${SCENARIO_TOOLS.find(item => item.key === scenarioTool)?.label}` : NAV.find(item => item.key === section)?.label;

  return (
    <div className={`retirement-app ${theme}`}>
      <header className="topbar">
        <div className="brand"><div className="brandmark">R</div><div><b>Robinson Retirement</b><span>Command Centre · real dollars</span></div></div>
        <div className="top-actions">{section === "vr" ? <Badge tone="modelled">VR · Rail {railKey}{railKey === "B" ? ` · ${effectivePssElection === "100" ? "100% pension" : effectivePssElection} · ${projectionBasis.shortLabel}` : " · March/V5"}</Badge> : <Badge tone={railKey === "A" ? "modelled" : "exact"}>Rail {railKey}{railKey === "B" ? ` · ${effectivePssElection === "100" ? "100% pension" : effectivePssElection} · ${projectionBasis.shortLabel}` : ""}</Badge>}<button aria-label="Toggle colour theme" className="icon-button" onClick={() => setTheme(theme === "dark" ? "light" : "dark")}>{theme === "dark" ? "Light" : "Dark"}</button><button aria-label={navCollapsed ? "Show navigation sidebar" : "Hide navigation sidebar"} title={navCollapsed ? "Show sidebar ( [ )" : "Hide sidebar ( [ )"} aria-controls="retirement-sidebar" aria-expanded={!navCollapsed} className="icon-button desktop-only" onClick={() => setNavCollapsed(!navCollapsed)}>{navCollapsed ? "» Menu" : "« Hide"}</button><button aria-label={navOpen ? "Close navigation" : "Open navigation"} aria-controls="retirement-sidebar" aria-expanded={navOpen} id="nav-menu-button" className="icon-button mobile-only menu-button" onClick={() => setNavOpen(!navOpen)}>{navOpen ? "Close" : "Menu"}</button></div>
      </header>
      <div className={`app-layout ${navCollapsed ? "nav-collapsed" : ""}`.trim()}>
        {navOpen && <button className="nav-backdrop" aria-label="Close navigation" onClick={() => setNavOpen(false)} />}
        <aside id="retirement-sidebar" aria-label="Retirement sections" inert={navCollapsed && !navOpen} className={`sidebar ${navOpen ? "open" : ""}`}>
          <div className="sidebar-context"><span>Retirement date</span><b>21 December 2033</b><small>Age 60 · preservation age 60</small></div>
          <nav>{NAV.map((item, index) => { const showGroup = index === 0 || item.group !== NAV[index - 1].group; return <div key={item.key}>{showGroup && <div className="nav-group">{item.group}</div>}<button aria-current={section === item.key ? "page" : undefined} className={section === item.key ? "active" : ""} onClick={() => go(item.key)}><span>{item.label}</span></button></div>; })}</nav>
          <a className="deep-link spending-deep-link" href={v23SpendPlanUrl} target="_blank" rel="noreferrer"><span>Set spending plan in V23</span><small>Fine-tune age-by-age gaps and drawdown periods. Command Centre spending is a flat comparison lens.</small><b>Open Income &amp; draws ↗</b></a>
          <a className="deep-link" href="./model-reference.html" target="_blank" rel="noreferrer"><span>Model reference</span><small>Static formulas, assumptions, controls and source lineage</small><b>Readable without JavaScript ↗</b></a>
          <div className="version">September 2026 · unified Command Centre + V23</div>
        </aside>
        <main className="content" id="command-content">
          {planControls}
          <details className="workspace-guide">
            <summary>Help · how to use {pageGuideName || "this page"}</summary>
            {pageGuide && <><p><b>Start here:</b> {pageGuide.use}</p><p><b>Read the result:</b> {pageGuide.read}</p><p><b>Keep in mind:</b> {pageGuide.limit}</p></>}
            <p><b>Across Command Centre:</b> The active comparison plan above holds total annual net spending flat in today's dollars. Its CSC source basis creates retirement-day PSS figures; the real-return control applies after retirement. Scenario's six tabs share this plan. Lab solves assumptions from a target; Surface lets you adopt a spending and return pair; Risk's 3D controls apply to that view only.</p>
            <p><b>For spending by age:</b> V23 Income &amp; draws holds your detailed age-band plan. Its Guardrail spending page compares advisory and opt-in adaptive policies; enter essential total spending first, then read spending and capital together. Opening either page does not replace your saved V23 plan.</p>
            <a href={v23SpendPlanUrl}>Open V23 Income &amp; draws ↗</a>{" · "}<a href={v23PolicyUrl}>Open V23 Policy Comparator ↗</a>{" · "}<a href="./model-reference.html">Read model reference ↗</a>
          </details>
          {content}
        </main>
      </div>
      <nav className="mobile-dock" aria-label="Primary mobile navigation">{[["overview", "Home"], ["scenario", "Scenario"], ["pss", "PSS"], ["estate", "Estate"], ["review", "Review"]].map(([key, label]) => <button key={key} aria-current={section === key ? "page" : undefined} className={section === key ? "active" : ""} onClick={() => go(key as SectionKey)}>{label}</button>)}</nav>
      <RetirementAi context={aiContext} />
    </div>
  );
}
