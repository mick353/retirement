"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import RetirementAi from "./retirement-ai";
import {
  HOSTPLUS_BASELINE_RETURN,
  HOSTPLUS_STARTING_BALANCE,
  abpMinimumRateAtAgeOn1July,
  firstFinancialYearMinimum,
  projectHostplusAt60,
} from "./retirement-core";

type RailKey = "A" | "B";
type PssElectionKey = "60-40" | "65-35" | "70-30" | "100";
type PssProjectionBasisKey = "source-825" | "prudent-630";
type TaxYear = "2026-27" | "2027-28";
type SectionKey =
  | "overview"
  | "scenario"
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

type ComparisonPlan = Pick<ScenarioState, "rail" | "spend"> & {
  label: string;
  intent: string;
};

type ReviewSnapshot = ScenarioState & {
  capturedAt: string;
  endCapital: number;
  estate: number;
};

type ActualReviewCheckpoint = {
  reviewedAt: string;
  capital: number | null;
  spending: number | null;
  pension: number | null;
  note: string;
};

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
const POOL_C_DRAG = 0.0035;
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
};
const PSS_ELECTION_ORDER: PssElectionKey[] = ["60-40", "65-35", "70-30", "100"];

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
    sourceStatus: "partial-source",
    sourceDate: "1 September 2026",
    elections: PSS_PRUDENT_ELECTIONS,
    note: "Direct CSC outputs are available for 60/40, 65/35 and 70/30. The 100% pension option remains unavailable on this basis until its matching provider PDF is supplied.",
  },
};

function normaliseProjectionBasis(value: unknown): PssProjectionBasisKey {
  return value === "prudent-630" ? "prudent-630" : "source-825";
}

function electionsForBasis(basisKey: PssProjectionBasisKey) {
  return PSS_PROJECTION_BASES[basisKey].elections;
}

function electionKeysForBasis(basisKey: PssProjectionBasisKey) {
  const elections = electionsForBasis(basisKey);
  return PSS_ELECTION_ORDER.filter((key) => Boolean(elections[key]));
}

function normaliseElectionForBasis(basisKey: PssProjectionBasisKey, value: unknown): PssElectionKey {
  const requested = (["60-40", "65-35", "70-30", "100"] as unknown[]).includes(value) ? value as PssElectionKey : "60-40";
  return electionsForBasis(basisKey)[requested] ? requested : electionKeysForBasis(basisKey)[0] ?? "60-40";
}

function railBForElection(electionKey: PssElectionKey, basisKey: PssProjectionBasisKey = "source-825"): Rail {
  const effectiveElectionKey = normaliseElectionForBasis(basisKey, electionKey);
  const election = electionsForBasis(basisKey)[effectiveElectionKey];
  if (!election) throw new Error(`PSS projection basis ${basisKey} has no verified elections`);
  const basis = PSS_PROJECTION_BASES[basisKey];
  const hostplus = 317_447.66;
  const capital = election.lumpSum + hostplus;
  const dbSpecialValue = election.grossPension * 16;
  const tbcHeadroom = Math.max(0, TBC - dbSpecialValue);
  const poolA = Math.min(capital, Math.max(0, tbcHeadroom - TSB_BUFFER));
  const poolC = capital - poolA;
  const washTaxableShare = election.lumpSum > 0 ? election.lumpTaxableTaxed / election.lumpSum : 0;
  return {
    key: "B",
    short: `Spending frontier · ${election.label}`,
    name: `Rail B — ${election.label}`,
    purpose: `Tests the selected ${basis.label.toLowerCase()} election against spending, TBC, drawdown, tax and estate objectives.`,
    source: election.source,
    grossPension: election.grossPension,
    netPension: election.netPension,
    lumpSum: election.lumpSum,
    hostplus,
    capital,
    dbSpecialValue,
    poolA,
    poolC,
    fas: election.fas,
    electionKey: effectiveElectionKey,
    electionLabel: election.label,
    pensionPercent: election.pensionPercent,
    lumpPercent: election.lumpPercent,
    lumpTaxFree: election.lumpTaxFree,
    lumpTaxableTaxed: election.lumpTaxableTaxed,
    lumpTaxableUntaxed: election.lumpTaxableUntaxed,
    tbcHeadroom,
    tbcExcess: Math.max(0, dbSpecialValue - TBC),
    washTaxableShare,
    washEvidence: election.lumpSum > 0
      ? `Direct 1 September 2026 CSC component split: ${(washTaxableShare * 100).toFixed(2)}% taxable-taxed, ${((election.lumpTaxFree / election.lumpSum) * 100).toFixed(2)}% tax-free and 0% untaxed. Washing is limited to the original PSS lump; Hostplus components remain unresolved.`
      : "The 100% pension election has no PSS lump sum and therefore no PSS lump component available for NCC washing.",
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
  let dirty = rail.lumpSum;
  let taxable = rail.lumpTaxableTaxed;
  let washed = 0;
  const applied: number[] = [];
  for (let index = 0; index < Math.max(0, cycles) && dirty > 0; index += 1) {
    const amount = Math.min(annualAmount, dirty);
    dirty -= amount;
    taxable = Math.max(0, taxable - amount * rail.washTaxableShare);
    washed += amount;
    applied.push(amount);
  }
  return { taxableStart: rail.lumpTaxableTaxed, taxableRemaining: taxable, washed, applied, maxCycles: rail.lumpSum > 0 ? Math.ceil(rail.lumpSum / annualAmount) : 0 };
}

const NAV: { key: SectionKey; label: string; group: string }[] = [
  { key: "overview", label: "Command centre", group: "Decide" },
  { key: "scenario", label: "Scenario lab", group: "Decide" },
  { key: "compare", label: "Scenario compare", group: "Decide" },
  { key: "frontier", label: "Spending frontier", group: "Decide" },
  { key: "risk", label: "Risk studio", group: "Decide" },
  { key: "pre60", label: "Present → 60", group: "Build" },
  { key: "pss", label: "PSS & three pools", group: "Build" },
  { key: "estate", label: "Tax & estate", group: "Protect" },
  { key: "vr", label: "VR option", group: "Protect" },
  { key: "benchmark", label: "Global position", group: "Context" },
  { key: "review", label: "Annual review", group: "Context" },
  { key: "evidence", label: "Evidence & audit", group: "Context" },
];

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

function vrScenarioPath(rail: Rail, basis: PssProjectionBasis, realReturn: number, age: number, mode: VrMode): VrScenario {
  const factors = VR_AGE_FACTORS[age] ?? VR_AGE_FACTORS[60];
  const years = Math.max(0, 60 - age);
  const pensionShare = rail.pensionPercent / 100;
  const lumpShare = rail.lumpPercent / 100;
  const definedAt60 = definedBenefitAt60(rail);
  const definedAtExit = definedAt60 * factors.abmRatio;
  const nominalReturn = (1 + realReturn) * (1 + basis.cpi) - 1;
  const investmentGrowth = Math.pow(1 + nominalReturn, years);
  const cpiGrowth = Math.pow(1 + basis.cpi, years);
  const vrCashAtExit = age < 60 ? VR_CURRENT_SALARY * VR_PACKAGE_WEEKS / 52 : 0;
  const vrCashAt60 = vrCashAtExit * investmentGrowth;
  const pensionStart = age === 60 ? rail.grossPension : definedAtExit * pensionShare / factors.pcf;
  const immediatePension60 = pensionStart * cpiGrowth;
  const immediateLumpAtExit = age === 60 ? rail.lumpSum : definedAtExit * lumpShare;
  const preservedDefinedAt60 = definedAtExit * cpiGrowth;
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
    ? Array.from({ length: years }, (_, index) => pensionStart * Math.pow(1 + basis.cpi, index)).reduce((sum, value) => sum + value, 0)
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
  ["00_READ_FIRST_RETIREMENT_BASELINE_2026-07-18.md", "Authority map", "Current"],
  ["Robinson_Retirement_Master_2026-07-18.md", "Dual-rail master reference", "Authoritative"],
  ["Robinson_Retirement_Spending_Estate_Frontier_Analysis_2026-07-18.md", "Historical Rail B spending / estate research", "Superseded inputs"],
  ["Robinson_Retirement_V23_Workbench_OFFLINE.html", "Current offline V23 mirror", "Integrated"],
  ["Robinson_Retirement_ModelV5.0_Baseline_2026-07-18.xlsx", "Three-pool optimiser workbook", "Rail A"],
  ["PSS_Defined_Benefit_Calculator_V8_Baseline_2026-07-18.xlsx", "PSS net pension calculator", "Rail A"],
  ["i-Estimator-1-9-2026_60-40.pdf", "September 60/40 election source", "Rail B source"],
  ["i-Estimator-1-9-2026_65-35.pdf", "September 65/35 election source", "Rail B source"],
  ["i-Estimator-1-9-2026_70-30.pdf", "September 70/30 election source", "Rail B source"],
  ["i-Estimator-1-9-2026_100percent.pdf", "September 100% pension election source", "Rail B source"],
  ["i-Estimator-1-9-2026-diffCPIandReturns-60-40.pdf", "Prudent 6/5/3 September 60/40 election source", "Rail B source"],
  ["i-Estimator-1-9-2026-diffCPIandReturns-65-35.pdf", "Prudent 6/5/3 September 65/35 election source", "Rail B source"],
  ["i-Estimator-1-9-2026-diffCPIandReturns-70-30.pdf", "Prudent 6/5/3 September 70/30 election source", "Rail B source"],
  ["6/5/3 100% pension iEstimator", "Matching provider PDF not supplied; election unavailable", "Awaiting source"],
  ["Paystub_2026_08_26.pdf", "Payroll evidence: $143,099 current salary and $138,394 PSS super salary", "Supporting evidence"],
  ["PSS_Annual_Statement_2025_2025-12-20.pdf", "Prior FAS, ABM and benefit components", "Historical source"],
  ["Statement 2026.pdf", "Annual statement still reports the superseded $131,437 birthday salary; retain as disputed until CSC reissues", "Pending reissue"],
  ["Robinson_PSSDB_VR_Deep_Research_2026-07-18.md", "VR mechanics and models", "Specialist"],
  ["Robinson_NCC_Wash_Drawdown_Research_2026-07-18.md", "NCC wash and draw sequencing", "Specialist"],
  ["Australian_Salary_Net_Gross_Analysis_2026-07-18.md", "Salary-equivalent bridge", "Reference"],
  ["Robinson_Global_Position_Deep_Analysis_2026-07-18.md", "Comparative retirement position", "Reference"],
  ["Robinson_Source_Folder_Recheck_2026-07-18.md", "Reconciliation and mismatch audit", "Audit"],
  ["Retirement_Analysis_AU_US_UK_2026-05-31.pdf", "International system comparison", "Reference"],
  ["03-Robinson_Retirement_App_Link_2026-07-18.txt", "Current published site links", "Current"],
];

const fmt = new Intl.NumberFormat("en-AU", { style: "currency", currency: "AUD", maximumFractionDigits: 0 });
const fmt1 = new Intl.NumberFormat("en-AU", { style: "currency", currency: "AUD", maximumFractionDigits: 1 });
const pct = (n: number, d = 0) => `${(n * 100).toFixed(d)}%`;
const money = (n: number) => fmt.format(Number.isFinite(n) ? n : 0);
const compactMoney = (n: number) => n >= 1_000_000 ? `$${(n / 1_000_000).toFixed(2)}m` : `$${Math.round(n / 1_000)}k`;
const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

function siteAsset(path: string) {
  const cleanPath = path.replace(/^\/+/, "");
  return `./${cleanPath}`;
}

const COMPARISON_PLANS: Record<string, ComparisonPlan> = {
  baseline: { label: "Balanced baseline", intent: "Central lifestyle and estate compromise", rail: "B", spend: 110_000 },
  lifestyle: { label: "Lifestyle-led", intent: "More active-retirement spending", rail: "B", spend: 130_000 },
  estate: { label: "Estate-first", intent: "Lower draw and conservative rail", rail: "A", spend: 90_000 },
};

function sharedScenarioParams(scenario: ScenarioState) {
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
  return params.toString();
}

function sharedPageUrl(path: string, scenario: ScenarioState) {
  return `${siteAsset(path)}${path.includes("?") ? "&" : "?"}${sharedScenarioParams(scenario)}`;
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

function monteCarloFan(rail: Rail, spend: number, mean: number, taxYear: TaxYear, volatility = 0.12, runs = 600, seed = 20260814) {
  const ages = Array.from({ length: 36 }, (_, index) => 60 + index);
  const paths = Array.from({ length: ages.length }, () => [] as number[]);
  for (let run = 0; run < runs; run += 1) {
    const random = seededGenerator(seed + run * 7_919 + Math.round(rail.capital));
    const annualReturns: number[] = [];
    for (let year = 1; year < ages.length; year += 1) {
      const sampledReturn = clamp(mean + volatility * normalSample(random), -0.55, 0.45);
      annualReturns.push(sampledReturn);
    }
    const path = operationalLedger(rail, spend, mean, taxYear, annualReturns).map((row) => row.ending);
    path.forEach((capital, year) => paths[year].push(capital));
  }
  return {
    ages,
    p10: paths.map((values) => quantile(values, 0.10)),
    p25: paths.map((values) => quantile(values, 0.25)),
    p50: paths.map((values) => quantile(values, 0.50)),
    p75: paths.map((values) => quantile(values, 0.75)),
    p90: paths.map((values) => quantile(values, 0.90)),
    paths,
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
  let poolA = rail.poolA;
  let poolC = rail.poolC;
  const rows = [{
    year: "Opening position",
    period: "21 Dec 2033",
    ageLabel: "60",
    age: 60,
    isOpening: true,
    opening: poolA + poolC,
    pension: 0,
    accumulation: 0,
    abp: poolA,
    poolC,
    draw: 0,
    spend: 0,
    fundedSpend: 0,
    shortfall: 0,
    reinvestment: 0,
    tax: 0,
    investmentGrowth: 0,
    netIncome: 0,
    grossEquivalent: 0,
    ending: poolA + poolC,
  }];
  for (let age = 61; age <= 95; age += 1) {
    const annualReturn = annualReturns?.[age - 61] ?? realReturn;
    const openingA = poolA;
    const openingC = poolC;
    const mandatory = openingA * drawRate(age);
    const lifestyleGap = Math.max(0, spend - rail.netPension);
    const draw = Math.min(openingA, Math.max(mandatory, lifestyleGap));
    const netIncome = rail.netPension + draw;
    const fundedSpend = Math.min(spend, netIncome);
    const shortfall = Math.max(0, spend - netIncome);
    const reinvestment = Math.max(0, netIncome - spend);
    const externalTaxDrag = openingC * POOL_C_DRAG;
    const investmentGrowth = (openingA + openingC) * annualReturn - externalTaxDrag;
    poolA = Math.max(0, openingA * (1 + annualReturn) - draw);
    poolC = Math.max(0, openingC * (1 + annualReturn) - externalTaxDrag + reinvestment);
    const startYear = 2033 + age - 61;
    rows.push({
      year: `Year ${age - 60}`,
      period: `21 Dec ${startYear} → 21 Dec ${startYear + 1}`,
      ageLabel: `${age - 1}→${age}`,
      age,
      isOpening: false,
      opening: openingA + openingC,
      pension: rail.netPension,
      accumulation: 0,
      abp: poolA,
      poolC,
      draw,
      spend,
      fundedSpend,
      shortfall,
      reinvestment,
      tax: externalTaxDrag,
      investmentGrowth,
      netIncome,
      grossEquivalent: grossForNet(netIncome, taxYear),
      ending: poolA + poolC,
    });
  }
  return rows;
}

function ledgerEndingAtAge(rail: Rail, spend: number, realReturn: number, targetAge: number, taxYear: TaxYear = "2026-27", annualReturns?: number[]) {
  const rows = operationalLedger(rail, spend, realReturn, taxYear, annualReturns);
  return rows.find((row) => row.age === targetAge)?.ending ?? rows[rows.length - 1]?.ending ?? rail.capital;
}

function contributionWhatIf(phase2: number, phase3: number, nominalReturn: number) {
  return projectHostplusAt60(phase2, phase3, nominalReturn);
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

function HorizonTerrainCanvas({ rows, rail, spend, realReturn, taxYear, selectedIndex, perspective, onSelect }: { rows: ReturnType<typeof operationalLedger>; rail: Rail; spend: number; realReturn: number; taxYear: TaxYear; selectedIndex: number; perspective: boolean; onSelect: (index: number) => void }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const geometryRef = useRef({ left: 62, width: 800 });

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const appRoot = canvas.closest(".retirement-app") as HTMLElement | null;
    const draw = () => {
      const rect = canvas.getBoundingClientRect();
      if (!rect.width || !rect.height) return;
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const width = Math.max(420, Math.round(rect.width));
      const height = Math.max(350, Math.round(rect.height));
      canvas.width = Math.round(width * dpr);
      canvas.height = Math.round(height * dpr);
      const context = canvas.getContext("2d");
      if (!context) return;
      context.setTransform(dpr, 0, 0, dpr, 0, 0);
      const style = getComputedStyle(appRoot || document.documentElement);
      const dark = !appRoot?.classList.contains("light");
      const palette = {
        bg: dark ? "#061321" : "#eef5ff",
        text: style.getPropertyValue("--text").trim() || (dark ? "#eaf2ff" : "#11203a"),
        muted: style.getPropertyValue("--muted").trim() || "#7186a6",
        blue: style.getPropertyValue("--blue").trim() || "#5f8dff",
        green: style.getPropertyValue("--green").trim() || "#45d5a4",
        amber: style.getPropertyValue("--amber").trim() || "#f0aa54",
        violet: style.getPropertyValue("--violet").trim() || "#b878ff",
        line: style.getPropertyValue("--line").trim() || "rgba(90,130,190,.22)",
      };
      const alpha = (hex: string, opacity: number) => /^#[0-9a-f]{6}$/i.test(hex) ? `${hex}${Math.round(opacity * 255).toString(16).padStart(2, "0")}` : hex;
      const pad = { l: width < 680 ? 52 : 70, r: width < 680 ? 34 : 75, t: 42, b: 72 };
      const capitalBottom = height - 116;
      const cashflowTop = height - 92;
      const plotWidth = width - pad.l - pad.r;
      geometryRef.current = { left: pad.l, width: plotWidth };
      const x = (index: number) => pad.l + index / Math.max(1, rows.length - 1) * plotWidth;
      const rates = [...new Set([Math.max(.02, realReturn - .03), Math.max(.02, realReturn - .015), realReturn, Math.min(.075, realReturn + .01), .075].map((value) => Number(value.toFixed(4))))].sort((a, b) => a - b);
      const paths = rates.map((rate) => operationalLedger(rail, spend, rate, taxYear));
      const maximum = Math.max(...paths.flatMap((path) => path.map((row) => row.ending)), 1) * 1.06;
      const y = (value: number, index = 0, layer = 0) => pad.t + (1 - value / maximum) * (capitalBottom - pad.t) - (perspective ? layer * 5 + index * .06 : 0);
      const gradient = context.createLinearGradient(0, 0, 0, height);
      gradient.addColorStop(0, dark ? "#0a2440" : "#f8fbff");
      gradient.addColorStop(1, palette.bg);
      context.fillStyle = gradient;
      context.fillRect(0, 0, width, height);

      context.strokeStyle = alpha(palette.blue, dark ? .16 : .12);
      context.lineWidth = 1;
      for (let grid = 0; grid <= 7; grid += 1) {
        const xx = pad.l + grid / 7 * plotWidth;
        context.beginPath(); context.moveTo(xx, capitalBottom); context.lineTo(width / 2 + (xx - width / 2) * (perspective ? .76 : 1), capitalBottom - (perspective ? 45 : 0)); context.stroke();
      }
      for (let tick = 0; tick <= 3; tick += 1) {
        const yy = pad.t + tick / 3 * (capitalBottom - pad.t);
        context.beginPath(); context.moveTo(pad.l, yy); context.lineTo(width - pad.r, yy); context.stroke();
        context.fillStyle = palette.muted; context.font = "700 9px Arial, sans-serif"; context.textAlign = "right"; context.fillText(compactMoney(maximum * (1 - tick / 3)), pad.l - 8, yy + 3);
      }

      const trace = (values: number[], layer: number) => {
        context.beginPath(); values.forEach((value, index) => index ? context.lineTo(x(index), y(value, index, layer)) : context.moveTo(x(index), y(value, index, layer)));
      };
      const values = paths.map((path) => path.map((row) => row.ending));
      for (let layer = 0; layer < values.length - 1; layer += 1) {
        context.beginPath();
        values[layer + 1].forEach((value, index) => index ? context.lineTo(x(index), y(value, index, layer)) : context.moveTo(x(index), y(value, index, layer)));
        for (let index = values[layer].length - 1; index >= 0; index -= 1) context.lineTo(x(index), y(values[layer][index], index, layer));
        context.closePath(); context.fillStyle = alpha(layer % 2 ? palette.blue : palette.violet, dark ? .13 + layer * .03 : .09 + layer * .025); context.fill();
      }
      values.forEach((path, layer) => {
        const active = rates[layer] === realReturn;
        trace(path, layer);
        context.strokeStyle = active ? palette.green : [palette.violet, palette.blue, palette.blue, palette.amber, palette.violet][layer];
        context.lineWidth = active ? 4 : 1.5; context.globalAlpha = active ? 1 : .58; context.shadowColor = active ? palette.green : "transparent"; context.shadowBlur = active ? 12 : 0; context.stroke(); context.shadowBlur = 0; context.globalAlpha = 1;
        const last = path.length - 1; context.fillStyle = active ? palette.green : palette.muted; context.font = active ? "900 9px Arial, sans-serif" : "700 8px Arial, sans-serif"; context.textAlign = "left"; context.fillText(`${pct(rates[layer], 1)}${active ? " active" : ""}`, x(last) + 6, y(path[last], last, layer) + 3);
      });

      const selectedX = x(selectedIndex);
      const selectedPathLayer = Math.max(0, rates.indexOf(realReturn));
      context.fillStyle = alpha(palette.blue, .12); context.fillRect(selectedX - 5, pad.t, 10, height - pad.t - pad.b);
      context.strokeStyle = palette.blue; context.lineWidth = 2; context.beginPath(); context.moveTo(selectedX, pad.t); context.lineTo(selectedX, height - pad.b); context.stroke();
      context.beginPath(); context.arc(selectedX, y(rows[selectedIndex].ending, selectedIndex, selectedPathLayer), 7, 0, Math.PI * 2); context.fillStyle = palette.green; context.shadowColor = palette.green; context.shadowBlur = 14; context.fill(); context.shadowBlur = 0;

      const cashMax = Math.max(spend, rail.netPension, ...rows.map((row) => row.draw), 1) * 1.08;
      const cashY = (value: number) => height - pad.b - value / cashMax * (height - pad.b - cashflowTop);
      const pss = rows.map(() => rail.netPension);
      const draws = rows.map((row) => row.isOpening ? Math.max(0, spend - rail.netPension) : row.draw);
      const traceCash = (series: number[], color: string, dashed = false) => { context.beginPath(); series.forEach((value, index) => index ? context.lineTo(x(index), cashY(value)) : context.moveTo(x(index), cashY(value))); context.strokeStyle = color; context.lineWidth = 2; if (dashed) context.setLineDash([6, 5]); context.stroke(); context.setLineDash([]); };
      traceCash(pss, palette.violet); traceCash(draws, palette.amber, true);
      context.fillStyle = palette.muted; context.font = "800 8px Arial, sans-serif"; context.textAlign = "left"; context.fillText("ANNUAL CASHFLOW · SEPARATE SCALE", pad.l, cashflowTop - 8);
      context.textAlign = "center"; rows.forEach((row, index) => { if (row.age % 5 === 0 || row.age === 95) context.fillText(String(row.age), x(index), height - 17); });
    };
    draw();
    const observer = new ResizeObserver(draw);
    observer.observe(canvas);
    const themeObserver = new MutationObserver(draw);
    if (appRoot) themeObserver.observe(appRoot, { attributes: true, attributeFilter: ["class"] });
    return () => { observer.disconnect(); themeObserver.disconnect(); };
  }, [rows, rail, spend, realReturn, taxYear, selectedIndex, perspective]);

  const selectFromClientX = (clientX: number) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const index = Math.round(((clientX - rect.left) / Math.max(1, rect.width) * rect.width - geometryRef.current.left) / Math.max(1, geometryRef.current.width) * (rows.length - 1));
    onSelect(clamp(index, 0, rows.length - 1));
  };

  return <canvas ref={canvasRef} className="horizon-terrain-canvas" role="slider" tabIndex={0} aria-label="Interactive three-dimensional retirement capital horizon" aria-valuemin={60} aria-valuemax={95} aria-valuenow={rows[selectedIndex]?.age ?? 60} aria-valuetext={`Age ${rows[selectedIndex]?.age ?? 60}: ${money(rows[selectedIndex]?.ending ?? 0)} investments using ${pct(realReturn, 1)} real return`} onPointerDown={(event) => { event.currentTarget.setPointerCapture?.(event.pointerId); selectFromClientX(event.clientX); }} onPointerMove={(event) => { if (event.buttons === 1) selectFromClientX(event.clientX); }} onKeyDown={(event) => { if (event.key === "ArrowLeft" || event.key === "ArrowDown") { event.preventDefault(); onSelect(clamp(selectedIndex - 1, 0, rows.length - 1)); } if (event.key === "ArrowRight" || event.key === "ArrowUp") { event.preventDefault(); onSelect(clamp(selectedIndex + 1, 0, rows.length - 1)); } if (event.key === "Home") { event.preventDefault(); onSelect(0); } if (event.key === "End") { event.preventDefault(); onSelect(rows.length - 1); } }} />;
}

function HorizonExplorer({ rows, rail, spend, realReturn, targetAge, homeValue, taxYear, atlasUrl, onRailChange, onReturnChange }: { rows: ReturnType<typeof operationalLedger>; rail: Rail; spend: number; realReturn: number; targetAge: number; homeValue: number; taxYear: TaxYear; atlasUrl: string; onRailChange: (rail: RailKey) => void; onReturnChange: (value: number) => void }) {
  const targetIndex = clamp(targetAge - 60, 0, rows.length - 1);
  const [selectedIndex, setSelectedIndex] = useState(targetIndex);
  const [perspective, setPerspective] = useState(true);
  const [focused, setFocused] = useState(false);
  useEffect(() => {
    document.body.classList.toggle("horizon-focus-open", focused);
    const closeOnEscape = (event: KeyboardEvent) => { if (event.key === "Escape") setFocused(false); };
    window.addEventListener("keydown", closeOnEscape);
    return () => { document.body.classList.remove("horizon-focus-open"); window.removeEventListener("keydown", closeOnEscape); };
  }, [focused]);
  const selected = rows[selectedIndex] ?? rows[0];
  const milestoneAges = [...new Set([60, 61, targetAge, 85, 95])].filter((age) => age >= 60 && age <= 95).sort((a, b) => a - b);
  const selectAge = (age: number) => setSelectedIndex(clamp(age - 60, 0, rows.length - 1));
  const higherSpend = Math.min(150_000, spend + 10_000);
  const lowerSpend = Math.max(76_000, spend - 10_000);
  const higherSpendCapital = ledgerEndingAtAge(rail, higherSpend, realReturn, selected.age, taxYear);
  const lowerSpendCapital = ledgerEndingAtAge(rail, lowerSpend, realReturn, selected.age, taxYear);
  const targetCapital = rows[targetIndex]?.ending ?? selected.ending;
  const targetEstate = ledgerEndingAtAge(rail, spend, realReturn, 95, taxYear) + homeValue;
  const stageCopy = selected.isOpening
    ? "Opening capital on retirement day. Annual pension and drawdown begin in the next planning year."
    : `The age ${selected.age - 1}→${selected.age} planning year closes with the capital shown here.`;
  const atlasVisualUrl = `${atlasUrl}${atlasUrl.includes("?") ? "&" : "?"}view=horizon#trajectory`;
  return (
    <section className={`panel horizon-explorer ${focused ? "focused" : ""}`} aria-labelledby="horizon-title">
      <div className="horizon-header">
        <div><Badge tone="good">Interactive retirement observatory</Badge><h3 id="horizon-title">See the whole plan move—not just its end point.</h3><p>The upper terrain compares deterministic real-return paths; the illuminated path uses your active {pct(realReturn, 1)} assumption. PSS and portfolio draw remain on a separate annual-cashflow lane below.</p></div>
        <div className="horizon-header-actions"><button type="button" className={`secondary horizon-focus-toggle ${focused ? "active" : ""}`} aria-pressed={focused} onClick={() => setFocused(!focused)}>{focused ? "Close focus" : "Focus view"}</button><div className="horizon-view-toggle" role="group" aria-label="Horizon dimension"><button type="button" className={perspective ? "active" : ""} aria-pressed={perspective} onClick={() => setPerspective(true)}>3D</button><button type="button" className={!perspective ? "active" : ""} aria-pressed={!perspective} onClick={() => setPerspective(false)}>2D</button></div><a className="secondary" href={atlasVisualUrl} target="_blank" rel="noreferrer">Open six-view Atlas ↗</a></div>
      </div>
      <div className="horizon-focus-metrics" aria-label="Active Horizon assumptions and outcomes"><div><span>Starting capital</span><b>{money(rail.capital)}</b></div><div><span>Net spending</span><b>{money(spend)} p.a.</b></div><div><span>Real return used</span><b>{pct(realReturn, 1)} p.a.</b></div><div><span>Target age</span><b>{targetAge}</b></div><div><span>Home, real</span><b>{money(homeValue)}</b></div><div><span>Indexed PSS floor</span><b>{money(rail.netPension)} p.a.</b></div></div>
      <div className="horizon-command-bar" aria-label="Horizon scenario controls">
        <div className="horizon-rail-control"><span>Rail</span><div role="group" aria-label="Horizon rail"><button type="button" className={rail.key === "A" ? "active" : ""} aria-pressed={rail.key === "A"} onClick={() => onRailChange("A")}>Rail A</button><button type="button" className={rail.key === "B" ? "active" : ""} aria-pressed={rail.key === "B"} onClick={() => onRailChange("B")}>Rail B · {money(spend)}/yr</button></div></div>
        <div className="horizon-return-control"><span>Active real return</span><div><button type="button" aria-label="Decrease real return" onClick={() => onReturnChange(clamp(Number((realReturn - .005).toFixed(4)), .02, .075))}>−</button><b>{pct(realReturn, 1)} real p.a.</b><button type="button" aria-label="Increase real return" onClick={() => onReturnChange(clamp(Number((realReturn + .005).toFixed(4)), .02, .075))}>+</button></div><small>After inflation · all Horizon figures recalculate</small></div>
        <div className="horizon-method"><span>Live scenario</span><b>Rail {rail.key} · {money(spend)} flat real spend</b><small>Return, rail and spending are inherited by Atlas and V23.</small></div>
      </div>
      <div className="horizon-main">
        <div>
          <div className="horizon-chart"><HorizonTerrainCanvas rows={rows} rail={rail} spend={spend} realReturn={realReturn} taxYear={taxYear} selectedIndex={selectedIndex} perspective={perspective} onSelect={setSelectedIndex} /></div>
          <div className="horizon-legend"><span><i className="capital" />Active capital path · {pct(realReturn, 1)} real</span><span><i className="scenario" />Alternative return slices · not probabilities</span><span><i className="draw" />Planning draw · annual lane</span><span><i className="floor" />Indexed PSS floor · annual lane</span></div>
        </div>
        <aside className="horizon-whatif" aria-live="polite"><span>At age {selected.age}</span><h4>What if annual spending changes by $10,000?</h4><div><i className="up">↑</i><p><b>Spend $10,000 more</b><small>{money(higherSpend)} / year</small></p><strong>{higherSpendCapital >= selected.ending ? "+" : "−"}{money(Math.abs(higherSpendCapital - selected.ending))}</strong></div><div><i className="down">↓</i><p><b>Spend $10,000 less</b><small>{money(lowerSpend)} / year</small></p><strong>+{money(Math.max(0, lowerSpendCapital - selected.ending))}</strong></div><small className="horizon-whatif-note">Change in investment capital versus the active plan, using the same {pct(realReturn, 1)} real return.</small></aside>
      </div>
      <div className="horizon-controls">
        <label><span>Move through retirement</span><input aria-label="Select retirement horizon age" type="range" min="60" max="95" step="1" value={selected.age} onChange={(event) => selectAge(Number(event.target.value))} /></label>
        <div className="horizon-milestones" role="group" aria-label="Retirement horizon milestones">{milestoneAges.map((age) => <button type="button" key={age} className={age === selected.age ? "active" : ""} aria-pressed={age === selected.age} onClick={() => selectAge(age)}>Age {age}</button>)}</div>
      </div>
      <div className="horizon-bottom-grid"><div className="horizon-insight" aria-live="polite"><div><span>At age {selected.age}</span><b>{stageCopy}</b></div><small>The active scenario holds {money(spend)} spending flat in real dollars; V23 remains the place to set different age-band gaps.</small></div><div className="horizon-outcomes"><div><span>Capital at target age {targetAge}</span><b>{money(targetCapital)}</b></div><div><span>Estate at 95</span><b>{money(targetEstate)}</b></div><div><span>PSS coverage</span><b>{pct(rail.netPension / spend, 1)}</b></div></div></div>
    </section>
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
      <label className="frontier-drag"><span>Drag annual spending <b>{money(selectedSpend)}</b></span><input type="range" min="76000" max="150000" step="1000" value={selectedSpend} onChange={(event) => onSelect(Number(event.target.value))} /></label>
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

export default function RetirementDashboard() {
  const [section, setSection] = useState<SectionKey>("overview");
  const [railKey, setRailKey] = useState<RailKey>("B");
  const [pssElection, setPssElection] = useState<PssElectionKey>("60-40");
  const [pssProjectionBasis, setPssProjectionBasis] = useState<PssProjectionBasisKey>("source-825");
  const [spend, setSpend] = useState(110_000);
  const [realReturn, setRealReturn] = useState(0.05);
  const [targetAge, setTargetAge] = useState(75);
  const [homeValue, setHomeValue] = useState(HOME_BASELINE);
  const [taxYear, setTaxYear] = useState<TaxYear>("2026-27");
  const [liquidityMonths, setLiquidityMonths] = useState(12);
  const [simulationSeed, setSimulationSeed] = useState(20260814);
  const [scenarioHydrated, setScenarioHydrated] = useState(false);
  const [theme, setTheme] = useState<"dark" | "light">("dark");
  const [navOpen, setNavOpen] = useState(false);
  const [showLedger, setShowLedger] = useState(false);
  const [washCycles, setWashCycles] = useState(6);
  const [vrAge, setVrAge] = useState(57);
  const [vrMode, setVrMode] = useState<VrMode>("immediate");
  const [phase2, setPhase2] = useState(650);
  const [phase3, setPhase3] = useState(1_200);
  const [nominalReturn, setNominalReturn] = useState(HOSTPLUS_BASELINE_RETURN);
  const [cashflowAge, setCashflowAge] = useState(65);
  const [saved, setSaved] = useState<Record<string, ScenarioState>>({});
  const [reviewSnapshot, setReviewSnapshot] = useState<ReviewSnapshot | null>(null);
  const [reviewChecks, setReviewChecks] = useState<Record<string, boolean>>({});
  const [actualReviewAge, setActualReviewAge] = useState(75);
  const [actualCheckpoints, setActualCheckpoints] = useState<Record<number, ActualReviewCheckpoint>>({});
  const importRef = useRef<HTMLInputElement>(null);

  const projectionBasis = PSS_PROJECTION_BASES[pssProjectionBasis];
  const activePssElections = electionsForBasis(pssProjectionBasis);
  const activePssElectionKeys = electionKeysForBasis(pssProjectionBasis);
  const effectivePssElection = normaliseElectionForBasis(pssProjectionBasis, pssElection);
  const rail = railFor(railKey, effectivePssElection, pssProjectionBasis);
  const portfolioDraw = Math.max(0, spend - rail.netPension);
  const pssSurplus = Math.max(0, rail.netPension - spend);
  const ledger = useMemo(() => operationalLedger(rail, spend, realReturn, taxYear), [rail, spend, realReturn, taxYear]);
  const firstUnfundedYear = ledger.find((row) => !row.isOpening && row.shortfall > 0);
  const firstYearStatutoryMinimum = firstFinancialYearMinimum(rail.poolA, 60);
  const endCapital = ledger.find((row) => row.age === targetAge)?.ending ?? rail.capital;
  const estate = endCapital + homeValue;
  const grossEquivalent = grossForNet(spend, taxYear);
  const fan = useMemo(() => monteCarloFan(rail, spend, realReturn, taxYear, .12, 600, simulationSeed), [rail, spend, realReturn, taxYear, simulationSeed]);
  const trajectoryLabels = Array.from({ length: Math.max(1, targetAge - 60 + 1) }, (_, i) => 60 + i);
  const trajectoryReturns = [...new Set([0.04, realReturn, 0.065].map((value) => Number(value.toFixed(4))))].sort((a, b) => a - b);
  const trajectorySeries = trajectoryReturns.map((r, i) => ({
    name: `${pct(r, 1)} real${r === realReturn ? " · active" : " · comparison"}`,
    color: r === realReturn ? "#47d6a0" : ["#f3a950", "#6f8cff", "#9d79ff"][i],
    values: trajectoryLabels.map((age) => ledgerEndingAtAge(rail, spend, r, age, taxYear)),
  }));
  const currentPf = 2_795.57;
  const retirementPf = spend / 26;
  const liquidityTarget = portfolioDraw * liquidityMonths / 12;
  const liquidityGap = Math.max(0, liquidityTarget - rail.poolC);
  const currentScenario = useMemo<ScenarioState>(() => ({ rail: railKey, pssElection: effectivePssElection, pssProjectionBasis, spend, realReturn, targetAge, homeValue, taxYear, liquidityMonths, simulationSeed }), [railKey, effectivePssElection, pssProjectionBasis, spend, realReturn, targetAge, homeValue, taxYear, liquidityMonths, simulationSeed]);
  const vrBasis = railKey === "A" ? PSS_PROJECTION_BASES["source-825"] : projectionBasis;
  const vrImmediatePaths = VR_AGES.map((age) => vrScenarioPath(rail, vrBasis, realReturn, age, "immediate"));
  const vrPreservePaths = VR_AGES.map((age) => vrScenarioPath(rail, vrBasis, realReturn, age, "preserve"));
  const selectedVrImmediate = vrImmediatePaths.find((row) => row.age === vrAge)!;
  const selectedVrPreserve = vrPreservePaths.find((row) => row.age === vrAge)!;
  const selectedVrPath = vrMode === "immediate" ? selectedVrImmediate : selectedVrPreserve;
  const v23SpendPlanUrl = sharedPageUrl("deep-model.html?page=income", currentScenario);
  const atlasUrl = sharedPageUrl("atlas.html", currentScenario);
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
        const activeScenario = localStorage.getItem("robinson-retirement-shared-scenario");
        const raw = localStorage.getItem("robinson-retirement-scenarios");
        const snapshot = localStorage.getItem("robinson-retirement-review-snapshot");
        const checks = localStorage.getItem("robinson-retirement-review-checks");
        const actuals = localStorage.getItem("robinson-retirement-actual-checkpoints");
        const loadScenario = (candidate: Partial<ScenarioState>) => {
          const basis = normaliseProjectionBasis(candidate.pssProjectionBasis);
          setRailKey(candidate.rail === "A" ? "A" : "B");
          setPssElection(normaliseElectionForBasis(basis, candidate.pssElection));
          setPssProjectionBasis(basis);
          setSpend(clamp(Number(candidate.spend) || 110_000, 76_000, 150_000));
          setRealReturn(clamp(Number(candidate.realReturn) || 0.05, 0.02, 0.075));
          setTargetAge(clamp(Number(candidate.targetAge) || 75, 70, 95));
          setHomeValue(clamp(Number(candidate.homeValue) || HOME_BASELINE, 300_000, 1_000_000));
          setTaxYear(candidate.taxYear === "2027-28" ? "2027-28" : "2026-27");
          setLiquidityMonths(clamp(Number(candidate.liquidityMonths) || 12, 0, 24));
          setSimulationSeed(Math.round(clamp(Number(candidate.simulationSeed) || 20260814, 1, 2_147_483_647)));
        };
        if (params.get("shared") === "1") {
          loadScenario({ rail: params.get("rail") === "A" ? "A" : "B", pssElection: (["60-40", "65-35", "70-30", "100"] as string[]).includes(String(params.get("pss"))) ? params.get("pss") as PssElectionKey : "60-40", pssProjectionBasis: normaliseProjectionBasis(params.get("basis")), spend: Number(params.get("spend")), realReturn: Number(params.get("return")), targetAge: Number(params.get("age")), homeValue: Number(params.get("home")), taxYear: params.get("taxYear") === "2027-28" ? "2027-28" : "2026-27", liquidityMonths: Number(params.get("reserveMonths")), simulationSeed: Number(params.get("seed")) });
        } else if (activeScenario) {
          loadScenario(JSON.parse(activeScenario));
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
      localStorage.setItem("robinson-retirement-shared-scenario", JSON.stringify({ version: 7, updatedAt: new Date().toISOString(), ...currentScenario }));
    } catch { /* local preference only */ }
  }, [currentScenario, scenarioHydrated]);

  useEffect(() => {
    const closeOnEscape = (event: KeyboardEvent) => { if (event.key === "Escape") setNavOpen(false); };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, []);

  const go = (key: SectionKey) => {
    setSection(key);
    setNavOpen(false);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const saveSlot = (slot: string) => {
    const next = { ...saved, [slot]: currentScenario };
    setSaved(next);
    localStorage.setItem("robinson-retirement-scenarios", JSON.stringify(next));
  };

  const loadSlot = (slot: string) => {
    const s = saved[slot];
    if (!s) return;
    const basis = normaliseProjectionBasis(s.pssProjectionBasis);
    setRailKey(s.rail); setPssElection(normaliseElectionForBasis(basis, s.pssElection)); setPssProjectionBasis(basis); setSpend(s.spend); setRealReturn(s.realReturn); setTargetAge(s.targetAge); setHomeValue(s.homeValue); setTaxYear(s.taxYear ?? "2026-27"); setLiquidityMonths(s.liquidityMonths ?? 12); setSimulationSeed(s.simulationSeed ?? 20260814);
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
    const snapshot: ReviewSnapshot = { ...currentScenario, capturedAt: new Date().toISOString(), endCapital, estate };
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
    const current = actualCheckpoints[actualReviewAge] ?? { reviewedAt: "", capital: null, spending: null, pension: null, note: "" };
    const next = { ...actualCheckpoints, [actualReviewAge]: { ...current, [field]: value, reviewedAt: new Date().toISOString() } };
    setActualCheckpoints(next);
    localStorage.setItem("robinson-retirement-actual-checkpoints", JSON.stringify(next));
  };

  const updateActualCheckpointNote = (note: string) => {
    const current = actualCheckpoints[actualReviewAge] ?? { reviewedAt: "", capital: null, spending: null, pension: null, note: "" };
    const next = { ...actualCheckpoints, [actualReviewAge]: { ...current, note, reviewedAt: new Date().toISOString() } };
    setActualCheckpoints(next);
    localStorage.setItem("robinson-retirement-actual-checkpoints", JSON.stringify(next));
  };

  const exportSettings = () => {
    const payload = { version: "2026-09-01.projection-basis.7", exportedAt: new Date().toISOString(), current: currentScenario, saved, reviewSnapshot, reviewChecks, actualCheckpoints };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href = url; a.download = "robinson-retirement-scenarios.json"; a.click(); URL.revokeObjectURL(url);
  };

  const importSettings = async (file?: File) => {
    if (!file) return;
    try {
      const parsed = JSON.parse(await file.text());
      if (parsed.current) {
        const basis = normaliseProjectionBasis(parsed.current.pssProjectionBasis);
        setRailKey(parsed.current.rail === "A" ? "A" : "B");
        setPssElection(normaliseElectionForBasis(basis, parsed.current.pssElection));
        setPssProjectionBasis(basis);
        setSpend(clamp(Number(parsed.current.spend) || 110_000, 76_000, 150_000));
        setRealReturn(clamp(Number(parsed.current.realReturn) || 0.05, 0.02, 0.075));
        setTargetAge(clamp(Number(parsed.current.targetAge) || 75, 70, 95));
        setHomeValue(clamp(Number(parsed.current.homeValue) || HOME_BASELINE, 300_000, 1_000_000));
        setTaxYear(parsed.current.taxYear === "2027-28" ? "2027-28" : "2026-27");
        setLiquidityMonths(clamp(Number(parsed.current.liquidityMonths) || 12, 0, 24));
        setSimulationSeed(Math.round(clamp(Number(parsed.current.simulationSeed) || 20260814, 1, 2_147_483_647)));
      }
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
    } catch { alert("That file is not a valid retirement scenario export."); }
  };

  const renderOverview = () => (
    <>
      <section className="hero">
        <div className="hero-copy">
          <div className="eyebrow">Integrated retirement command centre · September 2026 PSS election release</div>
          <h1>Your pension secures the floor.<br /><span>Your capital buys optionality.</span></h1>
          <p>The core decision is no longer whether retirement works. It is how deliberately to trade present lifestyle against later capital and estate value.</p>
          <div className="hero-actions">
            <button className="primary" onClick={() => go("scenario")}>Run a scenario</button>
            <button className="secondary" onClick={() => go("frontier")}>Inspect the frontier</button>
            <a className="secondary" href={v23SpendPlanUrl} target="_blank" rel="noreferrer">Set age-band spending in V23 ↗</a>
            <a className="secondary" href={atlasUrl} target="_blank" rel="noreferrer">Explore Atlas ↗</a>
          </div>
        </div>
        <div className="hero-rail">
          <div className="rail-switch" role="group" aria-label="Select modelling rail">
            {(["A", "B"] as RailKey[]).map((key) => <button type="button" key={key} className={railKey === key ? "active" : ""} aria-pressed={railKey === key} onClick={() => setRailKey(key)}><b>Rail {key}</b><span>{key === "A" ? RAILS.A.short : railBForElection(effectivePssElection, pssProjectionBasis).short}</span></button>)}
          </div>
          <div className="rail-note"><Badge tone={railKey === "A" ? "modelled" : "exact"}>{rail.source}</Badge><p>{rail.purpose}</p><p><b>Two return systems:</b> Rail B’s pension and lump figures come from the {projectionBasis.label.toLowerCase()} ({pct(projectionBasis.fundEarnings, 1)} fund earnings · {pct(projectionBasis.salaryGrowth, 1)} salary growth · {pct(projectionBasis.cpi, 1)} CPI before retirement). The site’s {pct(realReturn, 1)} control begins at retirement and is a separate real investment return.</p></div>
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
        <div><Badge tone="good">Central operating band</Badge><h3>$100,000–$110,000 net a year</h3><p>Best structural balance across spending power, capital, tax, estate, liquidity and flexibility.</p></div>
        <div className="comparison-stat"><span>Selected spend</span><strong>{fmt1.format(retirementPf)} / pf</strong><small>{money(grossEquivalent)} salary equivalent</small></div>
        <div className="comparison-stat"><span>Visible current bank receipt</span><strong>{fmt1.format(currentPf)} / pf</strong><small>Before the retirement release of current obligations</small></div>
        <div className="comparison-stat positive"><span>Cashflow uplift</span><strong>+{fmt1.format(retirementPf - currentPf)} / pf</strong><small>{pct(retirementPf / currentPf - 1)} above current bank inflow</small></div>
      </section>

      <HorizonExplorer key={`horizon-${targetAge}`} rows={ledger} rail={rail} spend={spend} realReturn={realReturn} targetAge={targetAge} homeValue={homeValue} taxYear={taxYear} atlasUrl={atlasUrl} onRailChange={setRailKey} onReturnChange={setRealReturn} />

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

      <section className="panel">
        <div className="panel-head"><div><h3>Spending choice → investment capital</h3><p>Reconciled annual three-pool frontier, selected rail; home excluded from the lines.</p></div><div className="quick-spend">{FRONTIER_SPENDS.map((v) => <button key={v} className={spend === v ? "active" : ""} onClick={() => setSpend(v)}>${v / 1000}k</button>)}</div></div>
        <LineChart labels={trajectoryLabels} series={trajectorySeries} />
      </section>

      <section className="panel">
        <div className="panel-head"><div><h3>Eight-objective decision test</h3><p>Current selected scenario against the retirement framework.</p></div><Badge tone="modelled">Modelled assessment</Badge></div>
        <div className="objective-grid">
          {[
            ["Income security", rail.netPension / spend, "Pension coverage"],
            ["Spending power", Math.min(1, spend / 110_000), "Lifestyle capacity"],
            ["Capital", Math.min(1, endCapital / 1_500_000), `Investments @${targetAge}`],
            ["Age-75 wealth", Math.min(1, ledgerEndingAtAge(rail, spend, realReturn, 75, taxYear) / 1_500_000), "Investment target"],
            ["Age-85 wealth", Math.min(1, ledgerEndingAtAge(rail, spend, realReturn, 85, taxYear) / 1_500_000), "Longevity capital"],
            ["Estate", Math.min(1, estate / 2_000_000), "Property-inclusive"],
            ["Tax efficiency", rail.lumpSum === 0 ? 0.72 : wash.applied.length >= wash.maxCycles ? 0.92 : 0.65, rail.lumpSum === 0 ? "No PSS lump to wash" : "Source-limited NCC wash"],
            ["Optionality", spend <= 120_000 ? 0.9 : 0.68, "Liquidity / reversibility"],
          ].map(([name, score, detail]) => <div className="objective" key={String(name)}><div><span>{name}</span><b>{Math.round(Number(score) * 100)}</b></div><div className="meter"><i style={{ width: `${Math.min(100, Number(score) * 100)}%` }} /></div><small>{detail}</small></div>)}
        </div>
      </section>
    </>
  );

  const renderScenario = () => (
    <>
      <SectionHeading eyebrow="Decision engine" title="Scenario lab" copy="Test one flat real annual-spend assumption at a time, preserve rail identity, and see capital, income and estate effects immediately. Set an age-by-age schedule in V23." />
      <section className="scenario-layout">
        <aside className="control-panel">
          <div className="control-hint"><Badge tone="modelled">Flat comparison lens</Badge><p>The spending control below is held constant in real dollars each year. Use V23 when the plan needs different age bands or drawdown periods.</p><a href={v23SpendPlanUrl} target="_blank" rel="noreferrer">Set age bands in V23 ↗</a></div>
          <label>Modelling rail<select value={railKey} onChange={(e) => setRailKey(e.target.value as RailKey)}><option value="A">Rail A — conservative wealth</option><option value="B">Rail B — spending frontier</option></select></label>
          <label>PSS projection basis<select value={pssProjectionBasis} onChange={(e) => chooseProjectionBasis(normaliseProjectionBasis(e.target.value))}><option value="source-825">Current source · 8.2% / 5% / 2.5% · 4 elections</option><option value="prudent-630">Prudent · 6% / 5% / 3% · 3 elections</option></select><small className="control-help">This provider basis creates the retirement-day PSS figures. It does not replace the separate real-return control below.</small></label>
          <label>PSS election<select value={effectivePssElection} onChange={(e) => { const next = normaliseElectionForBasis(pssProjectionBasis, e.target.value); const option = activePssElections[next]!; setPssElection(next); setRailKey("B"); setWashCycles(option.lumpSum > 0 ? Math.ceil(option.lumpSum / 130_000) : 0); }}>{activePssElectionKeys.map((key) => activePssElections[key]!).map((option) => <option key={option.key} value={option.key}>{option.label}</option>)}</select><small className="control-help">Selecting an election updates pension, lump, TBC, pools, drawdown, surplus and wash capacity everywhere. 100% pension currently exists only in the 8.2/5/2.5 source set.</small></label>
          <AdjustableControl label="Flat net annual spend" value={spend} min={76_000} max={150_000} step={1_000} baseline={110_000} format={money} onChange={setSpend} />
          <AdjustableControl label="Real investment return" value={realReturn} min={0.02} max={0.075} step={0.005} baseline={0.05} scale={100} format={(value) => pct(value, 1)} onChange={setRealReturn} />
          <AdjustableControl label="Liquid reserve target" value={liquidityMonths} min={0} max={24} step={3} baseline={12} format={(value) => `${Math.round(value)} months of starting gap`} onChange={setLiquidityMonths} />
          <AdjustableControl label="Target age" value={targetAge} min={70} max={95} step={1} baseline={75} format={(value) => `${Math.round(value)}`} onChange={setTargetAge} />
          <AdjustableControl label="Real home value" value={homeValue} min={300_000} max={1_000_000} step={25_000} baseline={HOME_BASELINE} format={money} onChange={setHomeValue} />
          <label>Salary-equivalent tax year<select value={taxYear} onChange={(e) => setTaxYear(e.target.value as TaxYear)}><option>2026-27</option><option>2027-28</option></select></label>
          <button className="secondary wide" onClick={() => { setRailKey("B"); setPssProjectionBasis("source-825"); setPssElection("60-40"); setWashCycles(6); setSpend(110_000); setRealReturn(0.05); setLiquidityMonths(12); setTargetAge(75); setHomeValue(HOME_BASELINE); setTaxYear("2026-27"); setSimulationSeed(20260814); }}>Reset central baseline</button>
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
        <div className="note"><b>ABP payment control:</b> the first statutory minimum is an illustrative {money(firstYearStatutoryMinimum)} for 21 Dec 2033–30 Jun 2034, pro-rated from the Pool A opening balance under current-law assumptions. Your fund calculates the actual financial-year minimum; this birthday-year ledger is for planning only.</div>
        {firstUnfundedYear ? <div className="note warn"><b>Funding shortfall:</b> {firstUnfundedYear.year} has {money(firstUnfundedYear.shortfall)} of the selected spending target unfunded after PSSDB and Pool A draw. Pool C is deliberately not spent automatically—choose and model a separate draw policy before treating it as income.</div> : <div className="note"><b>Funding check:</b> all displayed planning years are funded by PSSDB plus Pool A at this setting. Pool C remains a reserve and is not silently counted as spending money.</div>}
        <div className="table-wrap desktop-ledger"><table><thead><tr><th>Period</th><th>Age span</th><th>Opening capital</th><th>PSSDB pension</th><th>Hostplus accumulation</th><th>Hostplus pension</th><th>Pool C</th><th>Planning portfolio draw</th><th>Target spend</th><th>Funded spend</th><th>Shortfall</th><th>Reinvestment</th><th>Net investment growth</th><th>Pool C drag</th><th>Net income</th><th>Gross equivalent of income</th><th>Capital at period end</th></tr></thead><tbody>{ledger.slice(0, showLedger ? ledger.length : 6).map((r) => <tr key={r.age} className={r.isOpening ? "opening-row" : ""}><td><b>{r.year}</b><small className="ledger-period">{r.period}</small></td><td>{r.ageLabel}</td><td>{money(r.opening)}</td><td>{r.isOpening ? "—" : money(r.pension)}</td><td>{money(r.accumulation)}</td><td>{money(r.abp)}</td><td>{money(r.poolC)}</td><td>{r.isOpening ? "—" : money(r.draw)}</td><td>{r.isOpening ? "—" : money(r.spend)}</td><td>{r.isOpening ? "—" : money(r.fundedSpend)}</td><td>{r.isOpening ? "—" : r.shortfall > 0 ? money(r.shortfall) : "—"}</td><td>{r.isOpening ? "—" : money(r.reinvestment)}</td><td>{r.isOpening ? "—" : money(r.investmentGrowth)}</td><td>{r.isOpening ? "—" : money(r.tax)}</td><td>{r.isOpening ? "—" : money(r.netIncome)}</td><td>{r.isOpening ? "—" : money(r.grossEquivalent)}</td><td><b>{money(r.ending)}</b></td></tr>)}</tbody></table></div>
        <div className="mobile-ledger">{ledger.slice(0, showLedger ? ledger.length : 6).map((row) => row.isOpening ? <article className="opening-position" key={row.age}><header><div><span>Opening position</span><b>Age 60 · 21 Dec 2033</b></div><strong>{money(row.ending)}<small>opening capital</small></strong></header><p>No annual income or spending belongs in this snapshot. Your first retirement-year cashflow starts in the next card.</p><dl><div><dt>Hostplus pension</dt><dd>{money(row.abp)}</dd></div><div><dt>Pool C</dt><dd>{money(row.poolC)}</dd></div></dl></article> : <article key={row.age}><header><div><span>{row.year} · {row.period}</span><b>Age {row.ageLabel}</b></div><strong>{money(row.ending)}<small>ending capital</small></strong></header><dl><div><dt>PSSDB pension received</dt><dd>{money(row.pension)}</dd></div><div><dt>Planning portfolio draw</dt><dd>{money(row.draw)}</dd></div><div><dt>Target annual spending</dt><dd>{money(row.spend)}</dd></div><div><dt>Funded spending</dt><dd>{money(row.fundedSpend)}</dd></div>{row.shortfall > 0 && <div><dt>Unfunded target</dt><dd>{money(row.shortfall)}</dd></div>}<div><dt>Reinvested surplus</dt><dd>{money(row.reinvestment)}</dd></div><div><dt>Net investment growth</dt><dd>{money(row.investmentGrowth)}</dd></div><div><dt>Net income received</dt><dd>{money(row.netIncome)}</dd></div><div><dt>Gross salary equivalent</dt><dd>{money(row.grossEquivalent)}</dd></div><div><dt>Pool C at year end</dt><dd>{money(row.poolC)}</dd></div></dl></article>)}</div>
        <div className="ledger-equation"><b>Annual reconciliation:</b> ending capital = opening capital + net investment growth − planning portfolio draw + reinvested surplus. The table separates the target spend from the amount actually funded; Pool C is a reserve unless an explicit draw policy is modelled.</div>
        <div className="assumption-row"><Badge tone="modelled">Birthday-year planning bands</Badge><Badge tone="modelled">Current ABP rates, provider-calculated by FY</Badge><Badge tone="modelled">Pool C 0.35% annual drag</Badge><Badge tone="modelled">Real dollars</Badge><Badge tone="speculative">Current law held constant</Badge></div>
      </section>
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
      <SectionHeading eyebrow="Decision workspace" title="Compare complete retirement plans" copy={`Each card keeps its labelled annual spend and rail fixed, so the trade-offs are comparable. Your active Adjust assumptions rerun every capital, estate and simulation result below: ${pct(realReturn, 1)} real return p.a. after inflation, target age ${targetAge} and a ${money(homeValue)} real home. Using a card changes only its spend and rail; it does not reset those assumptions. For age-banded spending and drawdown periods, continue in V23.`} />
      <section className="compare-cards">{scenarios.map((scenario, index) => <article key={scenario.key} className={scenario.key === "baseline" ? "recommended" : ""}>
        <div className="compare-head"><div><Badge tone={scenario.key === "baseline" ? "good" : scenario.key === "lifestyle" ? "estimated" : "modelled"}>{scenario.key === "baseline" ? "Recommended" : `Option ${index + 1}`}</Badge><h3>{scenario.label}</h3><p>{scenario.intent}</p></div><span>Rail {scenario.rail}{scenario.rail === "B" ? ` · ${activePssElections[effectivePssElection]!.label} · ${projectionBasis.shortLabel}% basis` : ""}</span></div>
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
      <div className="note"><b>Professional interpretation:</b> under the active {pct(realReturn, 1)} real-return assumption, the balanced plan is structurally strongest when the objective is both present lifestyle and a durable estate. Lifestyle-led is affordable in many paths but creates materially less recovery margin after an early market shock.</div>
    </>;
  };

  const renderPre60 = () => {
    const projected = contributionWhatIf(phase2, phase3, nominalReturn);
    return <>
      <SectionHeading eyebrow="Accumulation runway" title="Present → age 60" copy="The pre-retirement plan protects liquidity first, then increases Hostplus contributions after the bank and loan targets are complete." />
      <div className="metrics four">
        <Metric label="Hostplus opening balance" value={money(HOSTPLUS_STARTING_BALANCE)} sub="April 2026 statement balance; refresh when a current Hostplus statement arrives" />
        <Metric label="Workbook-reconciled Hostplus @60" value={money(projectHostplusAt60(650, 1_200, HOSTPLUS_BASELINE_RETURN))} sub="8.0% nominal central case; $317,448 is an upper planning anchor, not the baseline" tone="green" />
        <Metric label="Current visible net pay" value={fmt1.format(2_795.57)} sub="Per fortnight after tax, PSS and child support" tone="violet" />
        <Metric label="PSS contribution rate" value="10%" sub="Maintain until ABM caps near mid-2032" tone="amber" />
      </div>
      <section className="timeline">
        <article><span>1</span><div><Badge tone="good">Near completion</Badge><h3>Liquidity base</h3><p>Bank to $30k; home loan to $10k. No Hostplus contributions while these targets finish.</p></div><strong>Now → Jul 2026</strong></article>
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
        <div className="note warn"><b>6% / 5% / 3% source boundary:</b> 60/40, 65/35 and 70/30 are direct CSC outputs with their own FAS, pension, lump and tax components. A matching 100% pension PDF is not present, so only that election is unavailable on this basis.</div>
      </section>
      <section className="pss-election-grid">
        {PSS_ELECTION_ORDER.map((key) => { const option = activePssElections[key]; if (!option) return <article key={key} className="unavailable" aria-disabled="true"><div className="rail-card-head"><Badge tone="warn">Source required</Badge></div><h3>100% pension / no lump</h3><p>The 6% / 5% / 3% provider basis has no matching 100% pension PDF yet. No figures are borrowed from the other source set.</p></article>; const optionRail = railBForElection(option.key, pssProjectionBasis); const selected = railKey === "B" && effectivePssElection === option.key; return <article key={option.key} className={selected ? "selected" : ""}>
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
      <section className="panel comparator"><div><Badge tone="modelled">How 100% works here</Badge><h3>PSS surplus becomes investable cashflow</h3><p>When the selected net PSS pension exceeds spending, the ledger requires no voluntary ABP draw. Any PSS surplus—and any unavoidable statutory ABP minimum—is routed to Pool C and compounds there. With no PSS lump, the 100% option has no PSS NCC-wash source; Hostplus components remain unclassified.</p></div><strong>{effectivePssElection === "100" && railKey === "B" ? `${money(pssSurplus)} current annual surplus` : pssProjectionBasis === "prudent-630" ? "100% 6/5/3 source still required" : "Select 100% to model"}</strong></section>
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
      <section className="panel">
        <div className="panel-head"><div><h3>Full age-{targetAge} outcome matrix</h3><p>Birthday-year planning path using current ABP rate bands and Pool C drag. The fund calculates legal financial-year payments; current selected rail: {rail.short}.</p></div><Badge tone="modelled">Active {pct(realReturn, 1)} real</Badge></div>
        <div className="table-wrap"><table><thead><tr><th>Net spend</th><th>Per fortnight</th><th>Gross equivalent</th><th>Portfolio draw</th>{RETURNS.map((r) => <th key={r}>Investments · {pct(r, 1)}</th>)}<th>Estate · active {pct(realReturn, 1)}</th></tr></thead><tbody>{rows.map((r) => <tr key={r.spend} className={spend === r.spend ? "selected-row" : ""} onClick={() => setSpend(r.spend)}><td><b>{money(r.spend)}</b></td><td>{fmt1.format(r.spend / 26)}</td><td>{money(r.gross)}</td><td>{money(r.draw)}</td>{r.values.map((v, i) => <td key={i}>{money(v)}</td>)}<td><b>{money(r.activeCapital + homeValue)}</b></td></tr>)}</tbody></table></div>
      </section>
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
    return <>
      <SectionHeading eyebrow="Uncertainty made visible" title="Risk studio" copy="The pension protects essential income. These views show how markets change optionality, recovery margin and estate—not whether the lifetime floor keeps paying." />
      <div className="metrics four">
        <Metric label={`Model success frequency ≥$500k at ${targetAge}`} value={pct(targetProbability, 0)} sub={`${pct(realReturn, 1)} real mean · three-pool ledger · not a forecast probability`} tone={targetProbability >= .8 ? "green" : "amber"} />
        <Metric label={`P10 capital @${targetAge}`} value={money(p10)} sub="Nine in ten paths finish above this level" tone="amber" />
        <Metric label={`Median capital @${targetAge}`} value={money(p50)} sub="Middle stochastic outcome" />
        <Metric label={`P90 capital @${targetAge}`} value={money(p90)} sub="Strong-path reference, not a forecast" tone="green" />
      </div>
      <section className="panel">
        <div className="panel-head"><div><h3>Capital simulation fan</h3><p>Each path runs the same PSS income, Pool A draw and Pool C reinvestment ledger as the Scenario lab. The vertical marker follows the selected target age.</p></div><div className="panel-actions"><Badge tone="modelled">{pct(realReturn, 1)} real mean · 12% volatility</Badge><button className="secondary" onClick={() => setSimulationSeed((value) => value >= 2_147_000_000 ? 20260814 : value + 1)}>New repeatable sample</button></div></div>
        <FanChart key={`fan-${targetAge}`} fan={fan} targetAge={targetAge} />
        <div className="note warn"><b>Read the band, not just the median:</b> 600 seeded paths use a constant real mean, 12% annual volatility and a capped normal distribution. They preserve the three-pool ledger but do not forecast regimes, fees, legislation, provider financial-year payment timing or personal spending shocks. Sample seed: {simulationSeed}.</div>
      </section>
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
        <div><Badge tone="modelled">Active anchor · {activeSourceLabel}</Badge><h3 id="vr-source-title">Current choices now drive the VR illustration</h3><p>The selected age-60 pension, lump and FAS form the anchor. March/V5 research supplies only the early-age ABM pattern and published pension-conversion factors. Your selected provider CPI indexes the PSS path; your selected {pct(realReturn, 1)} real return grows investable lump and illustrative VR cash to age 60.</p></div>
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

      <section className="vr-reading-guide" aria-label="How to read this result"><div><span>Selected comparison</span><b>Age {vrAge} · {selectedPathName}</b></div><i aria-hidden="true">→</i><div><span>PSS source basis</span><b>{railKey === "A" ? "March/V5" : projectionBasis.shortLabel}% · {rail.electionLabel}</b></div><i aria-hidden="true">→</i><div><span>Growth to age 60</span><b>{pct(realReturn, 1)} real + {pct(vrBasis.cpi, 1)} CPI</b></div></section>

      <div className="metrics four">
        <Metric label={vrMode === "immediate" ? `Gross pension starting at ${vrAge}` : "Gross pension starting at 60"} value={money(vrMode === "immediate" ? selectedVrPath.pensionStart : selectedVrPath.pension60)} sub={vrMode === "immediate" ? `${money(selectedVrPath.pre60GrossPension)} gross pension before 60` : "No PSS pension is paid before age 60"} tone="violet" />
        <Metric label="PSS pension by age 60" value={money(selectedVrPath.pension60)} sub={`${fmt1.format(selectedVrPath.netPf60)} indicative net / fortnight at 60`} />
        <Metric label="Raw TBC headroom" value={money(selectedVrPath.headroom)} sub={headroomDelta === 0 ? "No additional headroom versus the same election starting at 60" : `${headroomDelta > 0 ? "+" : "−"}${money(Math.abs(headroomDelta))} versus the same election starting at 60`} tone="green" />
        <Metric label={selectedLumpLabel} value={money(selectedVrPath.flexibleCapitalAt60)} sub={`Includes ${money(selectedVrPath.vrCashAt60)} illustrative VR cash · excludes existing Hostplus`} tone="amber" />
      </div>

      <section className="vr-path-comparison" aria-label={`Compare VR pathways at age ${vrAge}`}>
        {[selectedVrImmediate, selectedVrPreserve].map((path) => { const isActive = vrMode === path.mode; const pathTitle = path.mode === "immediate" ? "Start PSS immediately" : "Preserve whole PSS to 60"; return <button type="button" key={path.mode} className={isActive ? "active" : ""} aria-pressed={isActive} onClick={() => setVrMode(path.mode)}><div><Badge tone={path.mode === "immediate" ? "good" : "modelled"}>{path.mode === "immediate" ? "TBC timing strategy" : "Pension preservation strategy"}</Badge><h3>{pathTitle}</h3><p>{path.mode === "immediate" ? `Pension and ${rail.lumpPercent}% lump begin at ${vrAge}; the TBC credit locks then.` : `The whole PSS remains preserved; the selected ${rail.pensionPercent}/${rail.lumpPercent} election is illustrated at 60.`}</p></div><dl><div><dt>Pension by 60</dt><dd>{money(path.pension60)}</dd></div><div><dt>Raw TBC headroom</dt><dd>{money(path.headroom)}</dd></div><div><dt>Potential ABP at 60</dt><dd>{money(path.potentialAbpAt60)}</dd></div><div><dt>Super kept outside ABP</dt><dd>{money(path.superOutsideAbp)}</dd></div></dl></button>; })}
      </section>

      {selectedVrPath.headroom === 0 && <div className="note warn"><b>No ABP headroom on this illustration:</b> the selected PSS pension’s ×16 special value uses the full {money(TBC)} planning cap (or exceeds it). Existing Hostplus can remain in accumulation, but this model does not place it in a new retirement-phase ABP without headroom.</div>}
      <div className="note"><b>Money-bucket boundary:</b> “Potential ABP at 60” includes existing Hostplus plus the illustrated PSS lump, capped by raw TBC headroom less the {money(TSB_BUFFER)} planning buffer. The VR employment payment is shown separately and is not assumed to be a super rollover.</div>

      <CollapsiblePanel title="TBC headroom and pension by decision age" copy={`Active ${rail.electionLabel} · ${railKey === "A" ? "March/V5" : projectionBasis.shortLabel + "%"} provider basis.`} meta="Open the interactive timing curves" badge={<Badge tone="modelled">Illustrative ages 57–59</Badge>}><div className="vr-chart-stack"><div><h4>Raw TBC headroom</h4><LineChart height={240} labels={[...VR_AGES]} series={[{ name: "Start PSS immediately", values: vrImmediatePaths.map((row) => row.headroom), color: "#47d6a0" }, { name: "Preserve to 60", values: vrPreservePaths.map((row) => row.headroom), color: "#6f8cff" }]} /></div><div><h4>Gross PSS pension by age 60</h4><LineChart height={240} labels={[...VR_AGES]} series={[{ name: "Immediate start, indexed to 60", values: vrImmediatePaths.map((row) => row.pension60), color: "#9d79ff" }, { name: "Preserve whole PSS to 60", values: vrPreservePaths.map((row) => row.pension60), color: "#f3a950" }]} /></div></div></CollapsiblePanel>

      <CollapsiblePanel title="Age-by-age VR comparison" copy="The same active source anchor, election and assumptions are applied consistently across ages 57–60." meta="Open exact illustrated figures" badge={<Badge tone="exact">Scenario-aware</Badge>}><div className="table-scroll"><table className="vr-table"><thead><tr><th>Age</th><th>Path</th><th>Gross pension at start</th><th>Pension by 60</th><th>PSS lump at 60</th><th>VR cash at 60</th><th>Raw TBC headroom</th><th>Potential ABP at 60</th></tr></thead><tbody>{VR_AGES.flatMap((age) => [vrImmediatePaths.find((row) => row.age === age)!, vrPreservePaths.find((row) => row.age === age)!]).map((path) => <tr key={`${path.age}-${path.mode}`} className={path.age === vrAge && path.mode === vrMode ? "selected" : ""}><td>{path.age}</td><td>{path.mode === "immediate" ? "Immediate" : "Preserve"}</td><td>{path.mode === "immediate" ? money(path.pensionStart) : "—"}</td><td>{money(path.pension60)}</td><td>{money(path.pssLumpAt60)}</td><td>{money(path.vrCashAt60)}</td><td>{money(path.headroom)}</td><td>{money(path.potentialAbpAt60)}</td></tr>)}</tbody></table></div></CollapsiblePanel>

      <CollapsiblePanel title="How the illustration is calculated" copy="Clear separation between sourced age-60 values and scenario assumptions." meta="Open formulas, assumptions and limitations" badge={<Badge tone="speculative">Formal CSC estimate required</Badge>}><div className="decision-grid"><article><h3>Source-backed anchor</h3><p>{activeSourceLabel}: gross pension {money(rail.grossPension)}, lump {money(rail.lumpSum)}, FAS {money(rail.fas)}. Those age-60 values are not interpolated between provider bases.</p></article><article><h3>Early-age calibration</h3><p>March/V5 research supplies ABM ratios of 90.7%, 93.8%, 96.9% and 100%, with pension-conversion factors 11.6, 11.4, 11.2 and 11.0 at ages 57–60.</p></article><article><h3>Growth bridge</h3><p>PSS pension and the preserve lower-bound use {pct(vrBasis.cpi, 1)} CPI. Invested PSS lump and the illustrative 48-week VR payment use {pct(realReturn, 1)} real plus CPI to age 60.</p></article><article><h3>What is not assumed</h3><p>No under-60 tax-component split, ETP rollover, personal cap indexation, preserved member-component return or formal CSC redundancy quote is invented.</p></article></div></CollapsiblePanel>
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
      <section className="panel"><div className="panel-head"><div><h3>Retirement income versus current working cashflow</h3><p>The comparison must be made after current deductions and savings behaviour, not against headline salary alone.</p></div><Badge tone="estimated">Cashflow context</Badge></div><div className="cashflow-bars"><div><span>Current visible bank receipt</span><i style={{ width: `${(currentPf / 5_000) * 100}%` }} /><b>{fmt1.format(currentPf)} / pf</b></div>{[90_000, 100_000, 110_000, 120_000, 130_000].map((v) => <div key={v}><span>{money(v)} retirement spend</span><i style={{ width: `${(v / 26 / 5_000) * 100}%` }} /><b>{fmt1.format(v / 26)} / pf</b></div>)}</div></section>
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
    const actualCheckpoint = actualCheckpoints[actualReviewAge] ?? { reviewedAt: "", capital: null, spending: null, pension: null, note: "" };
    const actualComparisons = [
      { label: "Investment capital", planned: actualReviewRow.ending, actual: actualCheckpoint.capital },
      { label: "PSSDB pension received", planned: actualReviewRow.pension, actual: actualCheckpoint.pension },
      { label: "Lifestyle spending", planned: actualReviewRow.spend, actual: actualCheckpoint.spending },
    ];
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
        <div className="panel-head"><div><h3>Actual versus plan checkpoint</h3><p>After a retirement planning year closes, record the confirmed outcome here. It compares observed values with that year&apos;s governed ledger without changing any forecast input.</p></div><label className="age-select">Planning year<select value={actualReviewAge} onChange={(event) => setActualReviewAge(Number(event.target.value))}>{ledger.filter((row) => !row.isOpening).map((row) => <option key={row.age} value={row.age}>{row.year} · age {row.ageLabel}</option>)}</select></label></div>
        <div className="actual-plan-layout">
          <div className="actual-plan-inputs">
            <label><span>Actual investment capital at year end</span><input inputMode="decimal" type="number" min="0" placeholder={String(Math.round(actualReviewRow.ending))} value={actualCheckpoint.capital ?? ""} onChange={(event) => updateActualCheckpoint("capital", event.target.value)} /><small>Combined Pool A and Pool C; enter a confirmed statement value.</small></label>
            <label><span>Actual PSSDB pension received</span><input inputMode="decimal" type="number" min="0" placeholder={String(Math.round(actualReviewRow.pension))} value={actualCheckpoint.pension ?? ""} onChange={(event) => updateActualCheckpoint("pension", event.target.value)} /><small>Total net amount actually received for that planning year.</small></label>
            <label><span>Actual lifestyle spending</span><input inputMode="decimal" type="number" min="0" placeholder={String(Math.round(actualReviewRow.spend))} value={actualCheckpoint.spending ?? ""} onChange={(event) => updateActualCheckpoint("spending", event.target.value)} /><small>Observed annual spend, not the future spending control.</small></label>
            <label className="actual-plan-note"><span>Review note</span><textarea placeholder="Source, timing or explanation for any variance" value={actualCheckpoint.note} onChange={(event) => updateActualCheckpointNote(event.target.value)} /></label>
          </div>
          <div className="actual-plan-results" aria-live="polite">{actualComparisons.map((item) => {
            const variance = item.actual === null ? null : item.actual - item.planned;
            return <article key={item.label} className={variance === null ? "neutral" : variance === 0 ? "neutral" : variance > 0 ? "up" : "down"}><span>{item.label}</span><b>{money(item.planned)} plan</b><strong>{item.actual === null ? "Not entered" : money(item.actual)}</strong><small>{variance === null ? "Enter confirmed value" : `${variance > 0 ? "+" : ""}${money(variance)} vs plan`}</small></article>;
          })}</div>
        </div>
        <p className="actual-plan-footnote">Device-local and included in the review export. It is an observed record for the selected year, not a live account feed and not a change to the retirement model.</p>
      </section>
      <section className="review-grid">
        <div className="panel checklist-panel"><div className="panel-head"><div><h3>Review checklist</h3><p>Complete in order; each task preserves an auditable decision trail.</p></div><button className="text-button" onClick={() => { setReviewChecks({}); localStorage.removeItem("robinson-retirement-review-checks"); }}>Reset</button></div>{checklist.map(([key, label, detail], index) => <label className={reviewChecks[key] ? "done" : ""} key={key}><input type="checkbox" checked={Boolean(reviewChecks[key])} onChange={() => toggleReviewCheck(key)} /><span>{index + 1}</span><div><b>{label}</b><small>{detail}</small></div></label>)}</div>
        <div className="review-side">
          <section className="panel"><div className="panel-head"><div><h3>Command Centre comparison lens</h3><p>Flat assumptions shown here; the detailed V23 spending plan stays independently managed.</p></div><Badge tone={railKey === "A" ? "modelled" : "exact"}>Rail {railKey}</Badge></div><dl className="review-baseline"><div><dt>Flat spending lens</dt><dd>{money(spend)}</dd></div><div><dt>Return</dt><dd>{pct(realReturn, 1)}</dd></div><div><dt>Target</dt><dd>Age {targetAge}</dd></div><div><dt>Home</dt><dd>{money(homeValue)}</dd></div></dl><a className="primary wide-link" href={v23SpendPlanUrl} target="_blank" rel="noreferrer">Review age bands in V23 ↗</a></section>
          <section className="panel source-freshness"><div className="panel-head"><div><h3>Source freshness</h3><p>Inputs that require annual confirmation.</p></div></div>{[["PSS current-basis elections", "1 Sep 2026 · 8.2 / 5 / 2.5 · four options", "Current"], ["PSS prudent-basis elections", "1 Sep 2026 · 6 / 5 / 3 · three options", "Current"], ["PSS prudent 100% election", "Matching PDF not supplied", "Awaiting source"], ["Payroll / CSC salary record", "$138,394 birthday salary", "Current"], ["PSS annual statement", "2026 statement", "Pending reissue"], ["Tax and super caps", "2026–27", "Confirm annually"]].map(([name, date, status]) => <div key={name}><span><b>{name}</b><small>{date}</small></span><Badge tone={status === "Current" ? "good" : "warn"}>{status}</Badge></div>)}</section>
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
      <section className="panel"><div className="panel-head"><div><h3>Known mismatch controls</h3><p>Explicitly resolved in this integrated view.</p></div><Badge tone="good">Controlled</Badge></div><div className="control-register"><div><b>Direct component evidence</b><p>Rail A uses its March CSC split; every available Rail B lump option uses the direct components from its selected basis and election. Provider one-cent component-display residuals are retained rather than rewritten. Hostplus components remain unresolved.</p></div><div><b>Source-limited wash execution</b><p>Each cycle is capped by the remaining original PSS lump and the selected annual amount. Clean NCC money is assumed to remain separate; provider and eligibility confirmation remains mandatory.</p></div><div><b>PSS election evidence</b><p>The 8.2/5/2.5 basis supplies four direct elections. The 6/5/3 basis supplies direct 60/40, 65/35 and 70/30 elections; its missing 100% PDF is unavailable rather than interpolated.</p></div><div><b>Projection-basis boundary</b><p>Each provider basis carries its own FAS, pension, lump and tax components. No value is inferred or mixed across bases, and the post-retirement site return remains a separate control.</p></div><div><b>Salary evidence</b><p>The corrected birthday super salary is $138,394. September estimates prospectively use the current $143,099 salary; the annual statement remains pending reissue.</p></div><div><b>Gross vs net</b><p>Gross pension, estimated net pension, net spending and salary gross-equivalent are distinct fields everywhere.</p></div><div><b>Return assumptions</b><p>The active provider basis is a pre-retirement estimate input. Site controls are separate post-retirement real returns and are labelled alongside every material projection.</p></div></div></section>
      <section className="official-links"><a href="https://www.ato.gov.au/tax-rates-and-codes/tax-rates-australian-residents" target="_blank" rel="noreferrer"><span>ATO</span><b>Resident tax rates</b><small>2026–27 and later ↗</small></a><a href="https://www.ato.gov.au/individuals-and-families/super-for-individuals-and-families/super/growing-and-keeping-track-of-your-super/caps-limits-and-tax-on-super-contributions/non-concessional-contributions-cap" target="_blank" rel="noreferrer"><span>ATO</span><b>NCC caps</b><small>$130k from 1 July 2026 ↗</small></a><a href="https://www.ato.gov.au/individuals-and-families/super-for-individuals-and-families/self-managed-super-funds-smsf/smsf-newsroom/general-transfer-balance-cap-indexation-on-1-july-2026" target="_blank" rel="noreferrer"><span>ATO</span><b>TBC indexation</b><small>$2.1m from 1 July 2026 ↗</small></a><a href="https://www.csc.gov.au/defined-benefit-members/funds/pss" target="_blank" rel="noreferrer"><span>CSC</span><b>PSS scheme</b><small>Formula and access options ↗</small></a><a href="https://www.superannuation.asn.au/consumers/retirement-standard/" target="_blank" rel="noreferrer"><span>ASFA</span><b>Retirement Standard</b><small>Independent spending context ↗</small></a><a href="https://www.ato.gov.au/individuals-and-families/super-for-individuals-and-families/super/in-detail/superannuation-and-tax/defined-benefit-income-cap" target="_blank" rel="noreferrer"><span>ATO</span><b>Defined benefit cap</b><small>Confirm annual tax treatment ↗</small></a></section>
      <div className="disclaimer">Decision-support model only. It does not replace CSC benefit estimates, licensed personal financial advice, tax advice, legal advice or annual confirmation of legislation.</div>
    </>
  );

  const content = section === "overview" ? renderOverview() : section === "scenario" ? renderScenario() : section === "compare" ? renderCompare() : section === "pre60" ? renderPre60() : section === "pss" ? renderPss() : section === "frontier" ? renderFrontier() : section === "risk" ? renderRisk() : section === "estate" ? renderEstate() : section === "vr" ? renderVr() : section === "benchmark" ? renderBenchmark() : section === "review" ? renderReview() : renderEvidence();

  return (
    <div className={`retirement-app ${theme}`}>
      <header className="topbar">
        <div className="brand"><div className="brandmark">R</div><div><b>Robinson Retirement</b><span>Command centre · real dollars</span></div></div>
        <div className="top-actions">{section === "vr" ? <Badge tone="modelled">VR · Rail {railKey}{railKey === "B" ? ` · ${effectivePssElection === "100" ? "100% pension" : effectivePssElection} · ${projectionBasis.shortLabel}` : " · March/V5"}</Badge> : <Badge tone={railKey === "A" ? "modelled" : "exact"}>Rail {railKey}{railKey === "B" ? ` · ${effectivePssElection === "100" ? "100% pension" : effectivePssElection} · ${projectionBasis.shortLabel}` : ""}</Badge>}<button aria-label="Toggle colour theme" className="icon-button" onClick={() => setTheme(theme === "dark" ? "light" : "dark")}>{theme === "dark" ? "Light" : "Dark"}</button><button aria-label={navOpen ? "Close navigation" : "Open navigation"} aria-controls="retirement-sidebar" aria-expanded={navOpen} className="icon-button mobile-only menu-button" onClick={() => setNavOpen(!navOpen)}>{navOpen ? "Close" : "Menu"}</button></div>
      </header>
      <div className="app-layout">
        {navOpen && <button className="nav-backdrop" aria-label="Close navigation" onClick={() => setNavOpen(false)} />}
        <aside id="retirement-sidebar" aria-label="Retirement sections" className={`sidebar ${navOpen ? "open" : ""}`}>
          <div className="sidebar-context"><span>Retirement date</span><b>21 December 2033</b><small>Age 60 · preservation age 60</small></div>
          <nav>{NAV.map((item, index) => { const showGroup = index === 0 || item.group !== NAV[index - 1].group; return <div key={item.key}>{showGroup && <div className="nav-group">{item.group}</div>}<button aria-current={section === item.key ? "page" : undefined} className={section === item.key ? "active" : ""} onClick={() => go(item.key)}><span>{item.label}</span></button></div>; })}</nav>
          <a className="deep-link spending-deep-link" href={v23SpendPlanUrl} target="_blank" rel="noreferrer"><span>Set spending plan in V23</span><small>Fine-tune age-by-age gaps and drawdown periods. Command Centre spending is a flat comparison lens.</small><b>Open Income &amp; draws ↗</b></a>
          <a className="deep-link" href={atlasUrl} target="_blank" rel="noreferrer"><span>Retirement Atlas</span><small>Strategy map linking the floor, pools, tax, trajectory and estate</small><b>Open Atlas ↗</b></a>
          <a className="deep-link" href="./model-reference.html" target="_blank" rel="noreferrer"><span>Model reference</span><small>Static formulas, assumptions, controls and source lineage</small><b>Readable without JavaScript ↗</b></a>
          <div className="version">September 2026 scenario-aware VR release · v8</div>
        </aside>
        <main className="content">{content}</main>
      </div>
      <nav className="mobile-dock" aria-label="Primary mobile navigation">{[["overview", "Home"], ["scenario", "Adjust"], ["compare", "Compare"], ["risk", "Risk"], ["review", "Review"]].map(([key, label]) => <button key={key} aria-current={section === key ? "page" : undefined} className={section === key ? "active" : ""} onClick={() => go(key as SectionKey)}>{label}</button>)}</nav>
      <RetirementAi context={aiContext} />
    </div>
  );
}
