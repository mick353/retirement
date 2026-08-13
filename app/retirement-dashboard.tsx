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
  spend: number;
  realReturn: number;
  targetAge: number;
  homeValue: number;
  taxYear: TaxYear;
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
  washTaxableShare: number;
  washEvidence: string;
};

const TBC = 2_100_000;
const TSB_BUFFER = 5_000;
const HOME_BASELINE = 500_000;
const POOL_C_DRAG = 0.0035;

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
    washTaxableShare: 0.709677,
    washEvidence: "Master-locked planning convention: 70.97% taxable-taxed, 29.03% tax-free and 0% untaxed. This convention is held across rails pending a deliberate master revision; confirm provider execution and account components before acting.",
  },
  B: {
    key: "B",
    short: "Spending frontier rail",
    name: "Rail B — spending frontier / lifestyle optionality",
    purpose: "Tests higher active-retirement spending against the property-inclusive estate floor.",
    source: "July 2026 iEstimator / frontier report",
    grossPension: 82_550.89,
    netPension: 76_302.72,
    lumpSum: 605_373.22,
    hostplus: 317_447.66,
    capital: 922_820.88,
    dbSpecialValue: 1_320_814.24,
    poolA: 774_185.76,
    poolC: 148_635.12,
    fas: 151_343.31,
    washTaxableShare: 0.709677,
    washEvidence: "Master-locked 60/40 engine convention: 70.97% taxable-taxed, 29.03% tax-free and 0% untaxed. The July PSS lump agrees; confirm provider execution and account components before acting.",
  },
};

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

const VR_IMMEDIATE = [
  { age: 57, pensionStart: 67_415, pension60: 72_599, netPf60: 2_709, lump: 521_345, capital60: 814_483, tbcCredit: 1_078_645, headroom: 1_021_355 },
  { age: 58, pensionStart: 70_943, pension60: 74_534, netPf60: 2_781, lump: 539_164, capital60: 777_419, tbcCredit: 1_135_082, headroom: 964_918 },
  { age: 59, pensionStart: 74_596, pension60: 76_461, netPf60: 2_853, lump: 556_983, capital60: 741_518, tbcCredit: 1_193_535, headroom: 906_465 },
  { age: 60, pensionStart: 78_382, pension60: 78_382, netPf60: 2_924.68, lump: 574_802, capital60: 574_802, tbcCredit: 1_254_113, headroom: 845_887 },
];

const VR_PRESERVE = [
  { age: 57, pension60: 76_559, netPf60: 2_857, lump60: 561_432, headroom: 875_058 },
  { age: 58, pension60: 77_244, netPf60: 2_882, lump60: 566_459, headroom: 864_089 },
  { age: 59, pension60: 77_851, netPf60: 2_905, lump60: 570_907, headroom: 854_384 },
  { age: 60, pension60: 78_382, netPf60: 2_924.68, lump60: 574_802, headroom: 845_887 },
];

const SOURCES = [
  ["00_READ_FIRST_RETIREMENT_BASELINE_2026-07-18.md", "Authority map", "Current"],
  ["Robinson_Retirement_Master_2026-07-18.md", "Dual-rail master reference", "Authoritative"],
  ["Robinson_Retirement_Spending_Estate_Frontier_Analysis_2026-07-18.md", "Rail B spending / estate model", "Current"],
  ["Robinson_Retirement_Dashboard_V23_2026-07-18.html", "Rail A interactive engine", "Integrated"],
  ["Robinson_Retirement_ModelV5.0_Baseline_2026-07-18.xlsx", "Three-pool optimiser workbook", "Rail A"],
  ["PSS_Defined_Benefit_Calculator_V8_Baseline_2026-07-18.xlsx", "PSS net pension calculator", "Rail A"],
  ["PSS_iEstimator_60-40_2026-07-02.pdf", "July 60/40 source estimate", "Rail B source"],
  ["PSS_iEstimator_100_2026-07-02.pdf", "100% pension comparator", "Source only"],
  ["PSS_Annual_Statement_2025_2025-12-20.pdf", "Prior FAS, ABM and benefit components", "Historical source"],
  ["Statement 2026.pdf", "Current PSS statement — correction requested; do not use for revised retirement estimate until CSC reissues", "Pending reissue"],
  ["Robinson_PSSDB_VR_Deep_Research_2026-07-18.md", "VR mechanics and models", "Specialist"],
  ["Robinson_NCC_Wash_Drawdown_Research_2026-07-18.md", "NCC wash and draw sequencing", "Specialist"],
  ["Australian_Salary_Net_Gross_Analysis_2026-07-18.md", "Salary-equivalent bridge", "Reference"],
  ["Robinson_Global_Position_Deep_Analysis_2026-07-18.md", "Comparative retirement position", "Reference"],
  ["Robinson_Source_Folder_Recheck_2026-07-18.md", "Reconciliation and mismatch audit", "Audit"],
  ["Retirement_Analysis_AU_US_UK_2026-05-31.pdf", "International system comparison", "Reference"],
  ["Robinson_Retirement_App_Link_2026-07-18.txt", "Prior published app", "Legacy link"],
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
    spend: String(Math.round(scenario.spend)),
    return: String(scenario.realReturn),
    age: String(scenario.targetAge),
    home: String(Math.round(scenario.homeValue)),
    taxYear: scenario.taxYear,
  });
  return params.toString();
}

function sharedPageUrl(path: string, scenario: ScenarioState) {
  return `${siteAsset(path)}?${sharedScenarioParams(scenario)}`;
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

function monteCarloFan(rail: Rail, spend: number, mean: number, volatility = 0.12, runs = 600) {
  const ages = Array.from({ length: 36 }, (_, index) => 60 + index);
  const paths = Array.from({ length: ages.length }, () => [] as number[]);
  const seed = Math.round(rail.capital + spend + mean * 1_000_000);
  const random = seededGenerator(seed);
  const annualDraw = Math.max(0, spend - rail.netPension);
  for (let run = 0; run < runs; run += 1) {
    let capital = rail.capital;
    paths[0].push(capital);
    for (let year = 1; year < ages.length; year += 1) {
      const sampledReturn = clamp(mean + volatility * normalSample(random), -0.55, 0.45);
      capital = Math.max(0, capital * (1 + sampledReturn) - annualDraw);
      paths[year].push(capital);
    }
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

function endingWithShock(rail: Rail, spend: number, mean: number, targetAge: number, shockAge: number, shock: number) {
  let capital = rail.capital;
  const draw = Math.max(0, spend - rail.netPension);
  for (let age = 61; age <= targetAge; age += 1) capital = Math.max(0, capital * (1 + (age === shockAge ? shock : mean)) - draw);
  return capital;
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

function operationalLedger(rail: Rail, spend: number, realReturn: number, taxYear: TaxYear) {
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
    const investmentGrowth = (openingA + openingC) * realReturn - externalTaxDrag;
    poolA = Math.max(0, openingA * (1 + realReturn) - draw);
    poolC = Math.max(0, openingC * (1 + realReturn) - externalTaxDrag + reinvestment);
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

function ledgerEndingAtAge(rail: Rail, spend: number, realReturn: number, targetAge: number, taxYear: TaxYear = "2026-27") {
  const rows = operationalLedger(rail, spend, realReturn, taxYear);
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
  return (
    <div className="chart-shell fan-chart" role="img" aria-label="Monte Carlo capital fan chart with 10th to 90th percentile bands">
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
        {fan.ages.map((age, index) => age % 5 === 0 || age === 95 ? <text key={age} x={x(index)} y={height - 14} textAnchor="middle" className="chart-label">{age}</text> : null)}
      </svg>
      <div className="chart-legend"><span><i className="legend-outer" />P10–P90</span><span><i className="legend-inner" />P25–P75</span><span><i className="legend-median" />Median</span><span><i className="legend-target" />Age {targetAge}</span></div>
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

export default function RetirementDashboard() {
  const [section, setSection] = useState<SectionKey>("overview");
  const [railKey, setRailKey] = useState<RailKey>("B");
  const [spend, setSpend] = useState(110_000);
  const [realReturn, setRealReturn] = useState(0.05);
  const [targetAge, setTargetAge] = useState(75);
  const [homeValue, setHomeValue] = useState(HOME_BASELINE);
  const [taxYear, setTaxYear] = useState<TaxYear>("2026-27");
  const [scenarioHydrated, setScenarioHydrated] = useState(false);
  const [theme, setTheme] = useState<"dark" | "light">("dark");
  const [navOpen, setNavOpen] = useState(false);
  const [showLedger, setShowLedger] = useState(false);
  const [washCycles, setWashCycles] = useState(6);
  const [vrAge, setVrAge] = useState(57);
  const [vrMode, setVrMode] = useState<"immediate" | "preserve">("immediate");
  const [phase2, setPhase2] = useState(650);
  const [phase3, setPhase3] = useState(1_200);
  const [nominalReturn, setNominalReturn] = useState(HOSTPLUS_BASELINE_RETURN);
  const [cashflowAge, setCashflowAge] = useState(65);
  const [saved, setSaved] = useState<Record<string, ScenarioState>>({});
  const [reviewSnapshot, setReviewSnapshot] = useState<ReviewSnapshot | null>(null);
  const [reviewChecks, setReviewChecks] = useState<Record<string, boolean>>({});
  const importRef = useRef<HTMLInputElement>(null);

  const rail = RAILS[railKey];
  const portfolioDraw = Math.max(0, spend - rail.netPension);
  const ledger = useMemo(() => operationalLedger(rail, spend, realReturn, taxYear), [rail, spend, realReturn, taxYear]);
  const firstUnfundedYear = ledger.find((row) => !row.isOpening && row.shortfall > 0);
  const firstYearStatutoryMinimum = firstFinancialYearMinimum(rail.poolA, 60);
  const endCapital = ledger.find((row) => row.age === targetAge)?.ending ?? rail.capital;
  const estate = endCapital + homeValue;
  const grossEquivalent = grossForNet(spend, taxYear);
  const fan = useMemo(() => monteCarloFan(rail, spend, realReturn), [rail, spend, realReturn]);
  const trajectoryLabels = Array.from({ length: Math.max(1, targetAge - 60 + 1) }, (_, i) => 60 + i);
  const trajectoryReturns = [...new Set([0.04, realReturn, 0.065].map((value) => Number(value.toFixed(4))))].sort((a, b) => a - b);
  const trajectorySeries = trajectoryReturns.map((r, i) => ({
    name: `${pct(r, 1)} real${r === realReturn ? " · active" : " · comparison"}`,
    color: r === realReturn ? "#47d6a0" : ["#f3a950", "#6f8cff", "#9d79ff"][i],
    values: trajectoryLabels.map((age) => ledgerEndingAtAge(rail, spend, r, age, taxYear)),
  }));
  const currentPf = 2_795.57;
  const retirementPf = spend / 26;
  const currentScenario = useMemo<ScenarioState>(() => ({ rail: railKey, spend, realReturn, targetAge, homeValue, taxYear }), [railKey, spend, realReturn, targetAge, homeValue, taxYear]);
  const v23SpendPlanUrl = siteAsset("deep-model.html?page=income");
  const atlasUrl = sharedPageUrl("atlas.html", currentScenario);
  const targetIndex = clamp(targetAge - 60, 0, fan.ages.length - 1);
  const targetProbability = fan.paths[targetIndex].filter((value) => value >= 500_000).length / Math.max(1, fan.paths[targetIndex].length);
  const taxableStart = rail.poolA * rail.washTaxableShare;
  const removedPerWash = 130_000 * rail.washTaxableShare;
  const taxableRemaining = Math.max(0, taxableStart - washCycles * removedPerWash);
  const dbtStart = taxableStart * 0.17;
  const dbtRemaining = taxableRemaining * 0.17;
  const dbtSaved = dbtStart - dbtRemaining;
  const aiContext: Record<string, unknown> = {
    metadata: {
      modelVersion: "2026-08-13.reconciled.1",
      baselineDate: "2026-07-18 · reconciled 13 Aug 2026",
      currency: "AUD",
      valueBasis: "Real dollars unless specifically labelled nominal",
      activeSection: section,
      retirementDate: "2033-12-21",
      retirementAge: 60,
    },
    activeScenario: {
      rail: railKey,
      railName: rail.name,
      railPurpose: rail.purpose,
      railSource: rail.source,
      annualNetSpending: spend,
      realReturn,
      targetAge,
      homeValue,
      taxYear,
      annualPortfolioDraw: portfolioDraw,
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
    controls: {
      generalTransferBalanceCap: TBC,
      transferBalanceBuffer: TSB_BUFFER,
      poolCModelledDistributionDrag: POOL_C_DRAG,
      retirementDollarBasis: "real",
      railDifference: "Rail B uses the newer 2 July 2026 iEstimator and higher FAS. Rail A preserves the March/V5 control baseline. Spending does not cause the PSS uplift.",
    },
    deterministicTrajectories: trajectorySeries.map((series) => ({ name: series.name, ages: trajectoryLabels, values: series.values })),
    probabilityLens: {
      method: "600 deterministic-seed simulations with constant selected mean and 12% annual volatility",
      targetThreshold: 500_000,
      probabilityAtSelectedTarget: targetProbability,
      ages: fan.ages,
      percentile10: fan.p10,
      percentile25: fan.p25,
      percentile50: fan.p50,
      percentile75: fan.p75,
      percentile90: fan.p90,
      limitation: "A simplified model success frequency, not a forecast probability. It excludes market regimes, fees, legislation, account routing and personal spending shocks. Raw paths are omitted from the chat payload; governed percentile curves and the exact target test are supplied.",
    },
    operationalLedger: ledger,
    nccWash: {
      componentEvidence: rail.washEvidence,
      completedCycles: washCycles,
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
    voluntaryRedundancy: { selectedAge: vrAge, selectedMode: vrMode, immediatePensionPath: VR_IMMEDIATE, preserveTo60Path: VR_PRESERVE },
    preRetirement: { phase2ContributionPerFortnight: phase2, phase3ContributionPerFortnight: phase3, nominalReturn, hostplusStartingBalance: HOSTPLUS_STARTING_BALANCE, workbookReconciledAt8Percent: projectHostplusAt60(650, 1_200, HOSTPLUS_BASELINE_RETURN), upperPlanningAnchor: 317_447.66 },
    savedScenarios: saved,
    annualReview: { snapshot: reviewSnapshot, checks: reviewChecks },
    comparisonPlans: COMPARISON_PLANS,
    sourceRegister: SOURCES,
    links: { activeV23Scenario: v23SpendPlanUrl, activeAtlasScenario: atlasUrl, modelReference: "/model-reference.html", modelReferenceText: "/model-reference.txt" },
  };

  useEffect(() => {
    const timer = setTimeout(() => {
      try {
        const params = new URLSearchParams(window.location.search);
        const activeScenario = localStorage.getItem("robinson-retirement-shared-scenario");
        const raw = localStorage.getItem("robinson-retirement-scenarios");
        const snapshot = localStorage.getItem("robinson-retirement-review-snapshot");
        const checks = localStorage.getItem("robinson-retirement-review-checks");
        const loadScenario = (candidate: Partial<ScenarioState>) => {
          setRailKey(candidate.rail === "A" ? "A" : "B");
          setSpend(clamp(Number(candidate.spend) || 110_000, 76_000, 150_000));
          setRealReturn(clamp(Number(candidate.realReturn) || 0.05, 0.02, 0.075));
          setTargetAge(clamp(Number(candidate.targetAge) || 75, 70, 95));
          setHomeValue(clamp(Number(candidate.homeValue) || HOME_BASELINE, 300_000, 1_000_000));
          setTaxYear(candidate.taxYear === "2027-28" ? "2027-28" : "2026-27");
        };
        if (params.get("shared") === "1") {
          loadScenario({ rail: params.get("rail") === "A" ? "A" : "B", spend: Number(params.get("spend")), realReturn: Number(params.get("return")), targetAge: Number(params.get("age")), homeValue: Number(params.get("home")), taxYear: params.get("taxYear") === "2027-28" ? "2027-28" : "2026-27" });
        } else if (activeScenario) {
          loadScenario(JSON.parse(activeScenario));
        }
        if (raw) setSaved(JSON.parse(raw));
        if (snapshot) setReviewSnapshot(JSON.parse(snapshot));
        if (checks) setReviewChecks(JSON.parse(checks));
      } catch { /* local preference only */ }
      setScenarioHydrated(true);
    }, 0);
    if ("serviceWorker" in navigator) navigator.serviceWorker.register(siteAsset("sw.js")).catch(() => undefined);
    return () => clearTimeout(timer);
  }, []);

  useEffect(() => {
    if (!scenarioHydrated) return;
    try {
      localStorage.setItem("robinson-retirement-shared-scenario", JSON.stringify({ version: 2, updatedAt: new Date().toISOString(), ...currentScenario }));
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
    const next = { ...saved, [slot]: { rail: railKey, spend, realReturn, targetAge, homeValue, taxYear } };
    setSaved(next);
    localStorage.setItem("robinson-retirement-scenarios", JSON.stringify(next));
  };

  const loadSlot = (slot: string) => {
    const s = saved[slot];
    if (!s) return;
    setRailKey(s.rail); setSpend(s.spend); setRealReturn(s.realReturn); setTargetAge(s.targetAge); setHomeValue(s.homeValue); setTaxYear(s.taxYear ?? "2026-27");
  };

  const applyComparisonPlan = (plan: ComparisonPlan) => {
    setRailKey(plan.rail);
    setSpend(plan.spend);
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

  const exportSettings = () => {
    const payload = { version: "2026-07-18.integrated.3", exportedAt: new Date().toISOString(), current: { rail: railKey, spend, realReturn, targetAge, homeValue, taxYear }, saved, reviewSnapshot, reviewChecks };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href = url; a.download = "robinson-retirement-scenarios.json"; a.click(); URL.revokeObjectURL(url);
  };

  const importSettings = async (file?: File) => {
    if (!file) return;
    try {
      const parsed = JSON.parse(await file.text());
      if (parsed.current) {
        setRailKey(parsed.current.rail === "A" ? "A" : "B");
        setSpend(clamp(Number(parsed.current.spend) || 110_000, 76_000, 150_000));
        setRealReturn(clamp(Number(parsed.current.realReturn) || 0.05, 0.02, 0.075));
        setTargetAge(clamp(Number(parsed.current.targetAge) || 75, 70, 95));
        setHomeValue(clamp(Number(parsed.current.homeValue) || HOME_BASELINE, 300_000, 1_000_000));
        setTaxYear(parsed.current.taxYear === "2027-28" ? "2027-28" : "2026-27");
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
    } catch { alert("That file is not a valid retirement scenario export."); }
  };

  const renderOverview = () => (
    <>
      <section className="hero">
        <div className="hero-copy">
          <div className="eyebrow">Integrated retirement command centre · 18 July baseline · reconciled 13 Aug 2026</div>
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
            {(["A", "B"] as RailKey[]).map((key) => <button type="button" key={key} className={railKey === key ? "active" : ""} aria-pressed={railKey === key} onClick={() => setRailKey(key)}><b>Rail {key}</b><span>{RAILS[key].short}</span></button>)}
          </div>
          <div className="rail-note"><Badge tone={railKey === "A" ? "modelled" : "exact"}>{rail.source}</Badge><p>{rail.purpose}</p><p><b>Why the PSS figures differ:</b> Rail B uses the newer 2 July iEstimator and higher FAS; Rail A preserves the March/V5 control baseline. The spending objective determines which lens to use—it does not create the pension uplift.</p></div>
        </div>
      </section>

      <div className="metrics four">
        <Metric label="Indexed PSS net floor" value={money(rail.netPension)} sub={`${fmt1.format(rail.netPension / 26)} per fortnight · for life`} tone="violet" />
        <Metric label="Flexible capital at 60" value={money(rail.capital)} sub={`${money(rail.lumpSum)} PSS lump + ${money(rail.hostplus)} Hostplus`} />
        <Metric label={`Investments at ${targetAge}`} value={money(endCapital)} sub={`${pct(realReturn, 1)} real · reconciled age-${targetAge} ledger`} tone="green" />
        <Metric label={`Gross modelled estate at ${targetAge}`} value={money(estate)} sub={`Includes ${money(homeValue)} real home · before costs and residual DBT`} tone="amber" />
      </div>

      <section className="panel decision-banner">
        <div><Badge tone="good">Central operating band</Badge><h3>$100,000–$110,000 net a year</h3><p>Best structural balance across spending power, capital, tax, estate, liquidity and flexibility.</p></div>
        <div className="comparison-stat"><span>Selected spend</span><strong>{fmt1.format(retirementPf)} / pf</strong><small>{money(grossEquivalent)} salary equivalent</small></div>
        <div className="comparison-stat"><span>Visible current bank receipt</span><strong>{fmt1.format(currentPf)} / pf</strong><small>Before the retirement release of current obligations</small></div>
        <div className="comparison-stat positive"><span>Cashflow uplift</span><strong>+{fmt1.format(retirementPf - currentPf)} / pf</strong><small>{pct(retirementPf / currentPf - 1)} above current bank inflow</small></div>
      </section>

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
            ["Tax efficiency", washCycles >= 6 ? 0.92 : 0.65, "NCC wash model · master-locked"],
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
          <AdjustableControl label="Flat net annual spend" value={spend} min={76_000} max={150_000} step={1_000} baseline={110_000} format={money} onChange={setSpend} />
          <AdjustableControl label="Real investment return" value={realReturn} min={0.02} max={0.075} step={0.005} baseline={0.05} scale={100} format={(value) => pct(value, 1)} onChange={setRealReturn} />
          <AdjustableControl label="Target age" value={targetAge} min={70} max={95} step={1} baseline={75} format={(value) => `${Math.round(value)}`} onChange={setTargetAge} />
          <AdjustableControl label="Real home value" value={homeValue} min={300_000} max={1_000_000} step={25_000} baseline={HOME_BASELINE} format={money} onChange={setHomeValue} />
          <label>Salary-equivalent tax year<select value={taxYear} onChange={(e) => setTaxYear(e.target.value as TaxYear)}><option>2026-27</option><option>2027-28</option></select></label>
          <button className="secondary wide" onClick={() => { setRailKey("B"); setSpend(110_000); setRealReturn(0.05); setTargetAge(75); setHomeValue(HOME_BASELINE); setTaxYear("2026-27"); }}>Reset central baseline</button>
        </aside>
        <div className="scenario-results">
          <div className="metrics three">
            <Metric label="Portfolio draw required" value={money(portfolioDraw)} sub={`${pct(rail.netPension / spend, 1)} of spending covered by PSS`} tone="violet" />
            <Metric label={`Ending investment capital @${targetAge}`} value={money(endCapital)} sub={`${pct(realReturn, 1)} real return · ${money(endCapital - 500_000)} vs $500k investment floor`} tone={endCapital >= 500_000 ? "green" : "amber"} />
            <Metric label="Selected spend gross equivalent" value={money(grossEquivalent)} sub={`${taxYear} resident rates + 2% Medicare`} />
          </div>
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
        <div className="first-year-explainer"><Badge tone="exact">OPENING POSITION</Badge><span>{money(ledger[0].ending)} on 21 Dec 2033</span><b>→</b><Badge tone="modelled">FIRST PLANNING YEAR</Badge><span>{money(ledger[1].pension)} PSSDB + {money(ledger[1].draw)} planning portfolio draw funds up to {money(ledger[1].fundedSpend)} of the {money(ledger[1].spend)} target</span></div>
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
      const scenarioRail = RAILS[scenario.rail];
      const draw = Math.max(0, scenario.spend - scenarioRail.netPension);
      const capitalAtTarget = ledgerEndingAtAge(scenarioRail, scenario.spend, realReturn, targetAge, taxYear);
      const capital85 = ledgerEndingAtAge(scenarioRail, scenario.spend, realReturn, 85, taxYear);
      const scenarioFan = monteCarloFan(scenarioRail, scenario.spend, realReturn, .12, 360);
      const probability = scenarioFan.paths[comparisonTargetIndex].filter((value) => value >= 500_000).length / scenarioFan.paths[comparisonTargetIndex].length;
      return { key, ...scenario, draw, capitalAtTarget, capital85, estateAtTarget: capitalAtTarget + homeValue, probability };
    });
    const baseline = scenarios[0];
    return <>
      <SectionHeading eyebrow="Decision workspace" title="Compare complete retirement plans" copy={`Each card keeps its labelled annual spend and rail fixed, so the trade-offs are comparable. Your active Adjust assumptions rerun every capital, estate and simulation result below: ${pct(realReturn, 1)} real return p.a. after inflation, target age ${targetAge}, ${money(homeValue)} real home and ${taxYear} tax rates. Using a card changes only its spend and rail; it does not reset those assumptions. For age-banded spending and drawdown periods, continue in V23.`} />
      <section className="compare-cards">{scenarios.map((scenario, index) => <article key={scenario.key} className={scenario.key === "baseline" ? "recommended" : ""}>
        <div className="compare-head"><div><Badge tone={scenario.key === "baseline" ? "good" : scenario.key === "lifestyle" ? "estimated" : "modelled"}>{scenario.key === "baseline" ? "Recommended" : `Option ${index + 1}`}</Badge><h3>{scenario.label}</h3><p>{scenario.intent}</p></div><span>Rail {scenario.rail}</span></div>
        <div className="compare-spend"><span>Flat net annual spend</span><strong>{money(scenario.spend)}</strong><small>{fmt1.format(scenario.spend / 26)} per fortnight · held constant in real dollars each retirement year</small><small className="compare-assumption">Active assumptions: <b>{pct(realReturn, 1)} real return p.a.</b> after inflation · target age {targetAge} · {money(homeValue)} real home</small></div>
        <dl className="compare-outcomes"><div><dt>Capital @{targetAge}</dt><dd>{money(scenario.capitalAtTarget)}</dd></div><div><dt>Capital @85</dt><dd>{money(scenario.capital85)}</dd></div><div><dt>Estate @{targetAge}</dt><dd>{money(scenario.estateAtTarget)}</dd></div><div><dt>Sim. frequency ≥$500k @{targetAge}</dt><dd>{pct(scenario.probability, 0)}</dd></div></dl>
        <div className="compare-delta"><span>Versus baseline</span><b>{scenario.key === "baseline" ? "Reference plan" : `${scenario.capitalAtTarget >= baseline.capitalAtTarget ? "+" : ""}${money(scenario.capitalAtTarget - baseline.capitalAtTarget)} capital @${targetAge}`}</b></div>
        <div className="compare-actions"><button className="secondary" onClick={() => { applyComparisonPlan(scenario); go("scenario"); }}>Use spend & rail</button><a className="text-button" href={v23SpendPlanUrl} target="_blank" rel="noreferrer">Set age bands in V23 ↗</a></div>
      </article>)}</section>
      <section className="panel comparison-matrix">
        <div className="panel-head"><div><h3>Trade-off matrix</h3><p>Active assumptions: {pct(realReturn, 1)} real return p.a. after inflation · target age {targetAge} · {money(homeValue)} real home. Longer bars are better within each row; spending is preference, not a score.</p></div><Badge tone="modelled">Active assumptions</Badge></div>
        {[{ label: "Lifestyle spending", field: "spend" as const }, { label: `Age-${targetAge} investments`, field: "capitalAtTarget" as const }, { label: "Age-85 investments", field: "capital85" as const }, { label: `Age-${targetAge} estate`, field: "estateAtTarget" as const }].map((metric) => {
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
        <div className="note warn"><b>Control point:</b> the 2026 PSS statement is pending payroll/CSC correction and reissue. Do not replace the locked retirement iEstimator inputs or finalise a changed sacrifice plan until that corrected source is issued. Nominal and real returns are not mixed in this block.</div>
      </section>
    </>;
  };

  const renderPss = () => (
    <>
      <SectionHeading eyebrow="Tier 1–3 architecture" title="PSS, TBC and the three pools" copy="The defined-benefit pension creates the permanent income floor. The transfer-balance cap then determines how the flexible capital is deployed." />
      <section className="rail-compare">
        {(["A", "B"] as RailKey[]).map((key) => { const r = RAILS[key]; return <article key={key} className={railKey === key ? "selected" : ""} onClick={() => setRailKey(key)}><div className="rail-card-head"><Badge tone={key === "A" ? "modelled" : "exact"}>Rail {key}</Badge><button>Select</button></div><h3>{r.short}</h3><dl><div><dt>FAS</dt><dd>{money(r.fas)}</dd></div><div><dt>Gross pension</dt><dd>{money(r.grossPension)}</dd></div><div><dt>Net pension / pf</dt><dd>{fmt1.format(r.netPension / 26)}</dd></div><div><dt>40% lump</dt><dd>{money(r.lumpSum)}</dd></div><div><dt>Capital @60</dt><dd>{money(r.capital)}</dd></div></dl></article>; })}
      </section>
      <section className="panel">
        <div className="panel-head"><div><h3>Transfer-balance allocation</h3><p>{rail.name}</p></div><Badge tone="exact">TBC anchor {money(TBC)}</Badge></div>
        <div className="waterfall">
          <div style={{ flex: rail.dbSpecialValue }} className="wf pension"><span>DB special value</span><b>{money(rail.dbSpecialValue)}</b><small>Gross pension ×16</small></div>
          <div style={{ flex: rail.poolA }} className="wf poola"><span>Pool A · ABP</span><b>{money(rail.poolA)}</b><small>0% pension-phase earnings tax</small></div>
          <div style={{ flex: TSB_BUFFER }} className="wf buffer"><span>Buffer</span><b>$5k</b></div>
        </div>
        <div className="metrics three">
          <Metric label="Raw TBC headroom" value={money(TBC - rail.dbSpecialValue)} sub="Before mandatory $5k buffer" />
          <Metric label="Pool A Day 1" value={money(rail.poolA)} sub="Primary compounding engine" tone="green" />
          <Metric label="Pool C Day 1" value={money(rail.poolC)} sub="External ETF · deposit only" tone="amber" />
        </div>
      </section>
      <section className="pool-grid">
        <article><i className="pool-dot a" /><h3>Pool A</h3><strong>{money(rail.poolA)}</strong><p>Account-based pension. Earnings taxed at 0%; mandatory draws apply; commutations restore TBC headroom.</p></article>
        <article><i className="pool-dot b" /><h3>Pool B</h3><strong>$0 Day 1</strong><p>Hostplus accumulation is a transit bucket for NCC wash transactions, not a standing balance.</p></article>
        <article><i className="pool-dot c" /><h3>Pool C</h3><strong>{money(rail.poolC)}</strong><p>External indexed ETF overflow and legacy reserve. It has a 0.35% modelled distribution drag and is outside super death-benefit tax; it is not automatically used to fund spending.</p></article>
      </section>
      <section className="panel comparator"><div><Badge tone="exact">Source-only comparator</Badge><h3>July 100% pension estimate</h3><p>Gross {money(137_584.82)} · net {fmt1.format(4_941.65)} per fortnight ({money(128_482.90)} a year). The selected 60/40 Rail B path nets {money(76_302.72)} a year and retains {money(605_373.22)} as a lump: the extra 100% pension is {money(52_180.18)} a year net, with a simple no-return income/lump comparison of about 11.6 years. The election remains settled because flexible capital and estate optionality dominate for this objective set.</p></div><strong>Not reopened</strong></section>
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
    const activeCapitalAtTarget = ledgerEndingAtAge(rail, spend, realReturn, targetAge, taxYear);
    const activeEstateAtTarget = activeCapitalAtTarget + homeValue;
    return <>
      <SectionHeading eyebrow="Lifestyle ↔ legacy" title="Spending–estate frontier" copy="The same secure pension supports several valid retirement profiles. Each point holds one real annual spend flat across retirement, so the cost of higher spending is lower future capital plus foregone compounding. Use V23 to shape the spending timing by age." />
      <section className="profile-strip">{FRONTIER_SPENDS.map((v, i) => <button key={v} className={spend === v ? "active" : ""} onClick={() => setSpend(v)}><span>{["Estate max", "Strong compromise", "Balanced", "Lifestyle-led", "High optionality"][i]}</span><b>{money(v)}</b><small>{fmt1.format(v / 26)} / pf</small></button>)}</section>
      <div className="metrics four">
        <Metric label="PSS coverage" value={pct(rail.netPension / spend, 1)} sub={`${money(portfolioDraw)} annual portfolio draw`} tone="violet" />
        <Metric label="Selected spend gross equivalent" value={money(grossEquivalent)} sub={`${taxYear} rates`} />
        <Metric label={`Investments @${targetAge} · ${pct(realReturn, 1)}`} value={money(activeCapitalAtTarget)} sub="[MODELLED] Selected real return · home excluded" tone="green" />
        <Metric label={`Gross estate @${targetAge} · ${pct(realReturn, 1)}`} value={money(activeEstateAtTarget)} sub="[MODELLED] Before estate costs / residual DBT" tone="amber" />
      </div>
      <section className="panel">
        <div className="panel-head"><div><h3>Interactive efficient frontier</h3><p>Drag spending or select a point. Each point is a flat real annual-spend comparison; colour shows the investment buffer at age {targetAge}: green ≥ $1m, amber ≥ $500k, red below the floor.</p></div><Badge tone="modelled">{pct(realReturn, 1)} real · age {targetAge}</Badge></div>
        <FrontierCurve rail={rail} selectedSpend={spend} homeValue={homeValue} realReturn={realReturn} targetAge={targetAge} taxYear={taxYear} onSelect={setSpend} />
      </section>
      <section className="panel">
        <div className="panel-head"><div><h3>Full age-{targetAge} outcome matrix</h3><p>Birthday-year planning path using current ABP rate bands and Pool C drag. The fund calculates legal financial-year payments; current selected rail: {rail.short}.</p></div><Badge tone="modelled">Deterministic</Badge></div>
        <div className="table-wrap"><table><thead><tr><th>Net spend</th><th>Per fortnight</th><th>Gross equivalent</th><th>Portfolio draw</th>{RETURNS.map((r) => <th key={r}>Investments · {pct(r, 1)}</th>)}<th>Estate · active {pct(realReturn, 1)}</th></tr></thead><tbody>{rows.map((r) => <tr key={r.spend} className={spend === r.spend ? "selected-row" : ""} onClick={() => setSpend(r.spend)}><td><b>{money(r.spend)}</b></td><td>{fmt1.format(r.spend / 26)}</td><td>{money(r.gross)}</td><td>{money(r.draw)}</td>{r.values.map((v, i) => <td key={i}>{money(v)}</td>)}<td><b>{money(r.activeCapital + homeValue)}</b></td></tr>)}</tbody></table></div>
      </section>
      <section className="panel tradeoff">
        <div><Badge tone="warn">Marginal cost</Badge><h3>Each extra $10,000 of annual spending</h3><p>Reduces age-{targetAge} investment capital by approximately {money(marginalCost[0])} at 4%, {money(marginalCost[1])} at 5%, and {money(marginalCost[2])} at 6.5% on the selected rail.</p></div>
        <div className="tradeoff-bars">{RETURNS.map((r, i) => { const cost = marginalCost[i]; return <div key={r}><span>{pct(r, 1)}</span><i style={{ width: `${cost / 2_600}%` }} /><b>{money(cost)}</b></div>; })}</div>
      </section>
      <section className="panel two-models"><article><Badge tone="modelled">Fixed comparison</Badge><h3>Investment benchmarks</h3><p>$1.2m / $1.5m / $1.75m age-75 investments at 4% / 5% / 6.5%. Home excluded; these remain fixed framework benchmarks, not active-scenario outputs.</p></article><article><Badge tone="good">Model B</Badge><h3>Spending frontier</h3><p>At least $500k investments + $500k home = $1m property-inclusive gross estate floor.</p></article><div><strong>Active selected position · age {targetAge}</strong><p>{money(spend)} spend · {money(activeCapitalAtTarget)} investments · {money(activeEstateAtTarget)} estate at {pct(realReturn, 1)} real.</p></div></section>
    </>;
  };

  const renderRisk = () => {
    const row = ledger.find((item) => item.age === cashflowAge && !item.isOpening) ?? ledger[1];
    const p10 = fan.p10[targetIndex];
    const p50 = fan.p50[targetIndex];
    const p90 = fan.p90[targetIndex];
    const shockAges = [61, 63, 65, 67, 70];
    const shocks = [-.10, -.20, -.30, -.40];
    return <>
      <SectionHeading eyebrow="Uncertainty made visible" title="Risk studio" copy="The pension protects essential income. These views show how markets change optionality, recovery margin and estate—not whether the lifetime floor keeps paying." />
      <div className="metrics four">
        <Metric label={`Model success frequency ≥$500k at ${targetAge}`} value={pct(targetProbability, 0)} sub="600 seeded simplified simulations · 12% volatility · not a forecast probability" tone={targetProbability >= .8 ? "green" : "amber"} />
        <Metric label={`P10 capital @${targetAge}`} value={money(p10)} sub="Nine in ten paths finish above this level" tone="amber" />
        <Metric label={`Median capital @${targetAge}`} value={money(p50)} sub="Middle stochastic outcome" />
        <Metric label={`P90 capital @${targetAge}`} value={money(p90)} sub="Strong-path reference, not a forecast" tone="green" />
      </div>
      <section className="panel">
        <div className="panel-head"><div><h3>Capital simulation fan</h3><p>Percentile ranges widen over time. The vertical marker follows the selected target age.</p></div><Badge tone="modelled">{pct(realReturn, 1)} real mean · 12% volatility</Badge></div>
        <FanChart fan={fan} targetAge={targetAge} />
        <div className="note warn"><b>Read the band, not just the median:</b> this is a simplified uncertainty lens using a constant mean and 12% annual volatility, not a forecast probability. It does not model market regimes, fees, legislation, statutory payment timing, account routing or personal spending shocks.</div>
      </section>
      <section className="panel">
        <div className="panel-head"><div><h3>Sequence-risk heatmap</h3><p>Ending investment capital after one adverse return at different early-retirement ages; all other years use the selected real return.</p></div><Badge tone="modelled">Timing sensitivity</Badge></div>
        <div className="heatmap" role="table" aria-label="Sequence risk heatmap">
          <div className="heatmap-corner">Shock</div>{shockAges.map((age) => <div className="heatmap-head" key={age}>Age {age}</div>)}
          {shocks.flatMap((shock) => [<div className="heatmap-head row" key={`label-${shock}`}>{pct(shock, 0)}</div>, ...shockAges.map((age) => {
            const outcome = endingWithShock(rail, spend, realReturn, targetAge, age, shock);
            const severity = clamp(1 - outcome / Math.max(1, endCapital), 0, 1);
            return <div key={`${shock}-${age}`} className={`heat-cell ${outcome >= 1_000_000 ? "safe" : outcome >= 500_000 ? "watch" : "risk"}`} style={{ opacity: .72 + severity * .28 }}><b>{compactMoney(outcome)}</b><small>{money(outcome - endCapital)} vs smooth</small></div>;
          })])}
        </div>
      </section>
      <section className="panel">
        <div className="panel-head"><div><h3>Selected-year cashflow map</h3><p>Choose a planning year to see how the PSSDB pension and portfolio draw map to the spending target. The retirement-day opening snapshot is capital only.</p></div><label className="age-select">Year<select value={cashflowAge} onChange={(event) => setCashflowAge(Number(event.target.value))}>{ledger.filter((item) => !item.isOpening).map((item) => <option key={item.age} value={item.age}>{item.year} · age {item.ageLabel}</option>)}</select></label></div>
        <div className="cashflow-map">
          <div className="flow-source pension"><span>Indexed PSS pension</span><strong>{money(row.pension)}</strong><small>Lifetime income floor</small></div>
          <div className="flow-source draw"><span>Planning portfolio draw</span><strong>{money(row.draw)}</strong><small>{pct(drawRate(row.age), 0)} current-law rate band · provider calculates FY minimum</small></div>
          <div className="flow-total"><span>Cash received</span><strong>{money(row.netIncome)}</strong><small>Before any recycled surplus</small></div>
          <div className="flow-use spend"><span>Funded lifestyle spending</span><strong>{money(row.fundedSpend)}</strong><small>{row.shortfall > 0 ? `${money(row.shortfall)} target remains unfunded` : "Selected real-dollar plan fully funded"}</small></div>
          <div className="flow-use recycle"><span>Reinvested to Pool C</span><strong>{money(row.reinvestment)}</strong><small>Unspent draw remains invested</small></div>
          <div className="flow-use drag"><span>Pool C tax drag</span><strong>{money(row.tax)}</strong><small>0.35% modelled distribution drag</small></div>
        </div>
      </section>
      <section className="retirement-runway" aria-label="Retirement runway">
        {[{ age: 57, title: "Optional VR window", detail: "Request formal CSC estimates" }, { age: 60, title: "Retirement transition", detail: "PSS 60/40 · Pool A/B/C launch" }, { age: 61, title: "NCC wash cycle", detail: "Separate-interest execution" }, { age: 75, title: "Primary decision target", detail: `${money(ledgerEndingAtAge(rail, spend, realReturn, 75, taxYear))} modelled investments` }, { age: 85, title: "Longevity checkpoint", detail: "Review care and estate capacity" }, { age: 95, title: "Late-life horizon", detail: "PSS floor continues for life" }].map((milestone) => <article key={milestone.age}><span>{milestone.age}</span><div><b>{milestone.title}</b><small>{milestone.detail}</small></div></article>)}
      </section>
    </>;
  };

  const renderEstate = () => {
    const taxableStart = rail.poolA * rail.washTaxableShare;
    const removedPerWash = 130_000 * rail.washTaxableShare;
    const taxableRemaining = Math.max(0, taxableStart - washCycles * removedPerWash);
    const dbtStart = taxableStart * 0.17;
    const dbtRemaining = taxableRemaining * 0.17;
    const dbtSaved = dbtStart - dbtRemaining;
    return <>
      <SectionHeading eyebrow="After-tax legacy" title="Tax, NCC wash and estate" copy="The estate question is not gross wealth alone. Super components, death-benefit tax and the location of capital determine what beneficiaries actually receive." />
      <div className="metrics four">
        <Metric label="Starting taxable share" value={pct(rail.washTaxableShare, 2)} sub={rail.washEvidence} tone="amber" />
        <Metric label="DBT rate on taxable component" value="17%" sub="Adult non-tax dependant planning rate" tone="violet" />
        <Metric label="DBT saved / full wash" value={money(removedPerWash * 0.17)} sub={`${money(removedPerWash)} modelled taxable component removed`} tone="green" />
        <Metric label="Pool C DBT exposure" value="$0" sub="External estate capital; ordinary tax rules remain" />
      </div>
      <section className="panel">
        <div className="panel-head"><div><h3>NCC wash simulator</h3><p>Separate-interest model: commute from the original interest; recontribute $130k as a distinct tax-free interest.</p></div><Badge tone="modelled">Modelled · provider confirmation required</Badge></div>
        <div className="wash-layout">
          <div className="control-panel inline"><label><span>Completed wash cycles <b>{washCycles}</b></span><input type="range" min="0" max="7" step="1" value={washCycles} onChange={(e) => setWashCycles(Number(e.target.value))} /></label><div className="cycle-dots">{Array.from({ length: 7 }, (_, i) => <i key={i} className={i < washCycles ? "done" : ""}>{i + 1}</i>)}</div></div>
          <div className="wash-result"><div><span>Modelled DBT saved</span><strong>{money(dbtSaved)}</strong></div><div><span>Remaining DBT</span><strong>{money(dbtRemaining)}</strong></div><div><span>Taxable component remaining</span><strong>{money(taxableRemaining)}</strong></div></div>
        </div>
        <div className="note"><b>Execution dependency:</b> the decision-support engine uses the master-locked 70.97% taxable share on both rails. Confirm Hostplus can preserve the clean NCC money as a separate pension interest and refresh account components before acting.</div>
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
    const immediate = VR_IMMEDIATE.find((r) => r.age === vrAge)!;
    const preserve = VR_PRESERVE.find((r) => r.age === vrAge)!;
    const current = vrMode === "immediate" ? immediate : preserve;
    return <>
      <SectionHeading eyebrow="Optional pathway · not active baseline" title="Voluntary redundancy at 57–59" copy="An earlier PSS start can lock a lower ×16 transfer-balance credit and create more future ABP headroom, but permanently reduces the pension floor." />
      <section className="vr-controls"><div className="segmented"><button className={vrMode === "immediate" ? "active" : ""} onClick={() => setVrMode("immediate")}>Immediate PSS pension</button><button className={vrMode === "preserve" ? "active" : ""} onClick={() => setVrMode("preserve")}>Preserve whole PSS to 60</button></div><div className="segmented ages">{[57, 58, 59, 60].map((age) => <button key={age} className={vrAge === age ? "active" : ""} onClick={() => setVrAge(age)}>Age {age}</button>)}</div></section>
      <div className="metrics four">
        <Metric label="Gross pension by age 60" value={money(current.pension60)} sub={vrMode === "immediate" ? `${money(immediate.pensionStart)} at commencement` : "CPI-only preserved lower-bound"} tone="violet" />
        <Metric label="Indicative net / fortnight @60" value={fmt1.format(current.netPf60)} sub="Modelled; CSC tax split required" />
        <Metric label="Remaining TBC headroom" value={money(current.headroom)} sub={`${money(current.headroom - RAILS.A.poolA - TSB_BUFFER)} vs age-60 raw headroom`} tone="green" />
        <Metric label={vrMode === "immediate" ? "Capital @60 · lump + VR" : "40% lump @60"} value={money(vrMode === "immediate" ? immediate.capital60 : preserve.lump60)} sub={vrMode === "immediate" ? "Excludes pre-60 pension cashflows" : "Preserved outcome is component-sensitive"} tone="amber" />
      </div>
      <section className="panel"><div className="panel-head"><div><h3>TBC headroom by start age</h3><p>Normalised to the $2.1m planning cap.</p></div><Badge tone="modelled">PSS gross pension ×16</Badge></div><LineChart height={250} labels={VR_IMMEDIATE.map((r) => r.age)} series={[{ name: "Immediate-start headroom", values: VR_IMMEDIATE.map((r) => r.headroom), color: "#47d6a0" }, { name: "Preserve-to-60 headroom", values: VR_PRESERVE.map((r) => r.headroom), color: "#6f8cff" }]} /></section>
      <section className="panel"><div className="panel-head"><div><h3>Decision logic</h3><p>The two pathways answer different objectives.</p></div><Badge tone="speculative">Formal CSC estimates required</Badge></div><div className="decision-grid"><article><h3>Immediate pension</h3><p><b>Benefit:</b> materially more ABP headroom, earlier pension cashflow, earlier lump and VR investment.</p><p><b>Cost:</b> lower indexed pension for life; under-60 net tax is uncertain until CSC provides components.</p></article><article><h3>Preserve whole PSS</h3><p><b>Benefit:</b> retains a later 60/40 election and may preserve more pension value.</p><p><b>Cost:</b> forfeits the main TBC-locking advantage; exact outcome depends on preserved component growth.</p></article><article><h3>Required confirmation</h3><p>CSC formal redundancy estimates at 57/58/59, component splits, post-1995 transfer amounts, and written confirmation of election sequencing.</p></article></div></section>
    </>;
  };

  const renderBenchmark = () => (
    <>
      <SectionHeading eyebrow="Comparative context" title="Global retirement position" copy="The structure ranks unusually strongly because lifetime indexed income, flexible capital and a mortgage-free home solve different risks rather than forcing one portfolio to solve all of them." />
      <div className="benchmark-hero"><div><span>Defensible overall band</span><strong>Top 5–10%</strong><p>Australian retirement security and structure. Precision beyond this band would be false accuracy.</p></div><div><span>Economic-equivalence frame · Rail {railKey}</span><strong>~{money(1_800_000 * (rail.netPension / RAILS.A.netPension) + rail.capital + homeValue)}</strong><p>[ESTIMATED] Pension replacement value scaled to the selected rail + flexible capital + selected real home value; not liquid wealth or estate value.</p></div></div>
      <section className="risk-grid">
        {[ ["Longevity", "Transferred", "Indexed PSS pension payable for life"], ["Sequence risk", "Income neutralised", "Markets affect optionality and bequest more than the floor"], ["Inflation", "Strong hedge", "PSS floor indexed; growth capital targets real returns"], ["Depletion", "Floor protected", "Capital is not required to sustain basic income"], ["Estate tax", "Actively managed", "NCC wash targets taxable super components"], ["Liquidity", "Strong", "Three pools plus mortgage-free home"] ].map(([name, state, copy]) => <article key={name}><div><span>{name}</span><Badge tone="good">{state}</Badge></div><p>{copy}</p></article>)}
      </section>
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
      ? ledgerEndingAtAge(RAILS[reviewSnapshot.rail], reviewSnapshot.spend, reviewSnapshot.realReturn, targetAge, reviewSnapshot.taxYear ?? "2026-27")
      : 0;
    const priorComparableEstate = reviewSnapshot ? priorComparableCapital + reviewSnapshot.homeValue : 0;
    const deltas = reviewSnapshot ? [
      { label: "Annual spending", value: spend - reviewSnapshot.spend, format: money },
      { label: "Real return assumption", value: realReturn - reviewSnapshot.realReturn, format: (value: number) => pct(value, 1) },
      { label: "Target age", value: targetAge - reviewSnapshot.targetAge, format: (value: number) => `${Math.round(value)} years` },
      { label: `Capital @${targetAge} · like-for-like horizon`, value: endCapital - priorComparableCapital, format: money },
      { label: `Estate @${targetAge} · like-for-like horizon`, value: estate - priorComparableEstate, format: money },
    ] : [];
    return <>
      <SectionHeading eyebrow="Governed update cycle" title="Annual retirement review" copy="Turn a complex model into a repeatable professional process: refresh evidence, compare changes, decide actions and preserve a dated baseline." />
      <section className="review-hero panel">
        <div><Badge tone={completed === checklist.length ? "good" : "warn"}>{completed === checklist.length ? "Review complete" : `${completed} of ${checklist.length} complete`}</Badge><h3>2026–27 baseline review</h3><p>Source baseline: 18 July 2026. Local review data stays on this device and is included in the JSON export.</p></div>
        <div className="review-progress" aria-label={`${completed} of ${checklist.length} review tasks complete`}><i style={{ width: `${completed / checklist.length * 100}%` }} /><span>{Math.round(completed / checklist.length * 100)}%</span></div>
        <div className="review-actions"><button className="primary" onClick={captureReview}>{reviewSnapshot ? "Replace review snapshot" : "Capture current snapshot"}</button><button className="secondary" onClick={exportSettings}>Export review pack</button></div>
      </section>
      <section className="panel">
        <div className="panel-head"><div><h3>What changed?</h3><p>{reviewSnapshot ? `Compared with the local snapshot captured ${new Date(reviewSnapshot.capturedAt).toLocaleDateString("en-AU", { day: "numeric", month: "long", year: "numeric" })}.` : "Capture a snapshot now; future reviews will display the exact changes here."}</p></div><Badge tone="modelled">Device-local comparison</Badge></div>
        {reviewSnapshot ? <div className="delta-grid">{deltas.map((delta) => <article key={delta.label} className={delta.value === 0 ? "neutral" : delta.value > 0 ? "up" : "down"}><span>{delta.label}</span><strong>{delta.value > 0 ? "+" : ""}{delta.format(delta.value)}</strong><small>{delta.value === 0 ? "No change" : "Since captured baseline"}</small></article>)}</div> : <div className="empty-state"><b>No earlier snapshot on this device</b><p>The site will not invent a comparison. Capture the governed current settings when you are ready to start the review cycle.</p></div>}
      </section>
      <section className="review-grid">
        <div className="panel checklist-panel"><div className="panel-head"><div><h3>Review checklist</h3><p>Complete in order; each task preserves an auditable decision trail.</p></div><button className="text-button" onClick={() => { setReviewChecks({}); localStorage.removeItem("robinson-retirement-review-checks"); }}>Reset</button></div>{checklist.map(([key, label, detail], index) => <label className={reviewChecks[key] ? "done" : ""} key={key}><input type="checkbox" checked={Boolean(reviewChecks[key])} onChange={() => toggleReviewCheck(key)} /><span>{index + 1}</span><div><b>{label}</b><small>{detail}</small></div></label>)}</div>
        <div className="review-side">
          <section className="panel"><div className="panel-head"><div><h3>Command Centre comparison lens</h3><p>Flat assumptions shown here; the detailed V23 spending plan stays independently managed.</p></div><Badge tone={railKey === "A" ? "modelled" : "exact"}>Rail {railKey}</Badge></div><dl className="review-baseline"><div><dt>Flat spending lens</dt><dd>{money(spend)}</dd></div><div><dt>Return</dt><dd>{pct(realReturn, 1)}</dd></div><div><dt>Target</dt><dd>Age {targetAge}</dd></div><div><dt>Home</dt><dd>{money(homeValue)}</dd></div></dl><a className="primary wide-link" href={v23SpendPlanUrl} target="_blank" rel="noreferrer">Review age bands in V23 ↗</a></section>
          <section className="panel source-freshness"><div className="panel-head"><div><h3>Source freshness</h3><p>Inputs that require annual confirmation.</p></div></div>{[["PSS iEstimator", "2 Jul 2026", "Current"], ["Master baseline", "18 Jul 2026", "Current"], ["PSS annual statement", "20 Dec 2025", "Refresh when issued"], ["Tax and super caps", "2026–27", "Confirm annually"]].map(([name, date, status]) => <div key={name}><span><b>{name}</b><small>{date}</small></span><Badge tone={status === "Current" ? "good" : "warn"}>{status}</Badge></div>)}</section>
        </div>
      </section>
    </>;
  };

  const renderEvidence = () => (
    <>
      <SectionHeading eyebrow="Governance" title="Evidence, classifications and audit" copy="Every major figure is traceable to a supplied source, a verified rule, or an explicitly labelled model. The two rails remain separate by design." />
      <section className="classification-grid"><article><Badge tone="exact">EXACT</Badge><h3>Documented inputs</h3><p>PSS iEstimator figures, annual-statement values, supplied balances and directly calculated arithmetic.</p></article><article><Badge tone="estimated">ESTIMATED</Badge><h3>External pricing</h3><p>Economic replacement values, market comparisons and provider-dependent implementation costs.</p></article><article><Badge tone="modelled">MODELLED</Badge><h3>Scenario outputs</h3><p>Returns, drawdowns, spending paths, VR values, capital projections and death-tax wash effects.</p></article><article><Badge tone="speculative">SPECULATIVE</Badge><h3>Unknown future state</h3><p>Future legislation, market sequences, exact preserved PSS components, longevity and future tax.</p></article></section>
      <section className="panel audit-alert"><Badge tone="warn">Reconciliation control</Badge><div><h3>Do not mix the rails silently</h3><p>Rail A controls the V5 workbook and V23 dashboard. Rail B controls the July spending frontier. The July source is newer, but the conservative rail remains a valid benchmark model.</p></div></section>
      <section className="panel"><div className="panel-head"><div><h3>Source register</h3><p>Raw personal PDFs are not re-published by this site; only the governed financial inputs are integrated.</p></div><span>{SOURCES.length} reviewed files</span></div><div className="source-list">{SOURCES.map(([name, role, status]) => <article key={name}><div><code>{name}</code><p>{role}</p></div><Badge tone={status === "Authoritative" ? "good" : status.includes("Rail B") ? "exact" : "modelled"}>{status}</Badge></article>)}</div></section>
      <section className="panel"><div className="panel-head"><div><h3>Known mismatch controls</h3><p>Explicitly resolved in this integrated view.</p></div><Badge tone="good">Controlled</Badge></div><div className="control-register"><div><b>DBT component convention</b><p>The engine is master-locked at 70.97% taxable-taxed, 29.03% tax-free and 0% untaxed for both rails. Rail B’s July PSS lump agrees; actual account components and provider execution remain an annual implementation check.</p></div><div><b>Wash execution</b><p>Six cycles assume clean NCC money remains in a separate pension interest. Confirm provider capability before acting; merging interests weakens later washes.</p></div><div><b>July PSS uplift</b><p>Visible in Rail B without overwriting Rail A’s workbook values.</p></div><div><b>Gross vs net</b><p>Gross pension, net pension, net spending and salary gross-equivalent are distinct fields everywhere.</p></div><div><b>Real vs nominal</b><p>Retirement scenarios use real dollars and real returns. The pre-60 sensitivity block is separately labelled nominal.</p></div></div></section>
      <section className="official-links"><a href="https://www.ato.gov.au/tax-rates-and-codes/tax-rates-australian-residents" target="_blank" rel="noreferrer"><span>ATO</span><b>Resident tax rates</b><small>2026–27 and later ↗</small></a><a href="https://www.ato.gov.au/individuals-and-families/super-for-individuals-and-families/super/growing-and-keeping-track-of-your-super/caps-limits-and-tax-on-super-contributions/non-concessional-contributions-cap" target="_blank" rel="noreferrer"><span>ATO</span><b>NCC caps</b><small>$130k from 1 July 2026 ↗</small></a><a href="https://www.ato.gov.au/individuals-and-families/super-for-individuals-and-families/self-managed-super-funds-smsf/smsf-newsroom/general-transfer-balance-cap-indexation-on-1-july-2026" target="_blank" rel="noreferrer"><span>ATO</span><b>TBC indexation</b><small>$2.1m from 1 July 2026 ↗</small></a><a href="https://www.csc.gov.au/defined-benefit-members/funds/pss" target="_blank" rel="noreferrer"><span>CSC</span><b>PSS scheme</b><small>Formula and access options ↗</small></a></section>
      <div className="disclaimer">Decision-support model only. It does not replace CSC benefit estimates, licensed personal financial advice, tax advice, legal advice or annual confirmation of legislation.</div>
    </>
  );

  const content = section === "overview" ? renderOverview() : section === "scenario" ? renderScenario() : section === "compare" ? renderCompare() : section === "pre60" ? renderPre60() : section === "pss" ? renderPss() : section === "frontier" ? renderFrontier() : section === "risk" ? renderRisk() : section === "estate" ? renderEstate() : section === "vr" ? renderVr() : section === "benchmark" ? renderBenchmark() : section === "review" ? renderReview() : renderEvidence();

  return (
    <div className={`retirement-app ${theme}`}>
      <header className="topbar">
        <div className="brand"><div className="brandmark">R</div><div><b>Robinson Retirement</b><span>Command centre · real dollars</span></div></div>
        <div className="top-actions"><Badge tone={railKey === "A" ? "modelled" : "exact"}>Rail {railKey}</Badge><button aria-label="Toggle colour theme" className="icon-button" onClick={() => setTheme(theme === "dark" ? "light" : "dark")}>{theme === "dark" ? "Light" : "Dark"}</button><button aria-label={navOpen ? "Close navigation" : "Open navigation"} aria-controls="retirement-sidebar" aria-expanded={navOpen} className="icon-button mobile-only menu-button" onClick={() => setNavOpen(!navOpen)}>{navOpen ? "Close" : "Menu"}</button></div>
      </header>
      <div className="app-layout">
        {navOpen && <button className="nav-backdrop" aria-label="Close navigation" onClick={() => setNavOpen(false)} />}
        <aside id="retirement-sidebar" aria-label="Retirement sections" className={`sidebar ${navOpen ? "open" : ""}`}>
          <div className="sidebar-context"><span>Retirement date</span><b>21 December 2033</b><small>Age 60 · preservation age 60</small></div>
          <nav>{NAV.map((item, index) => { const showGroup = index === 0 || item.group !== NAV[index - 1].group; return <div key={item.key}>{showGroup && <div className="nav-group">{item.group}</div>}<button aria-current={section === item.key ? "page" : undefined} className={section === item.key ? "active" : ""} onClick={() => go(item.key)}><span>{item.label}</span></button></div>; })}</nav>
          <a className="deep-link spending-deep-link" href={v23SpendPlanUrl} target="_blank" rel="noreferrer"><span>Set spending plan in V23</span><small>Fine-tune age-by-age gaps and drawdown periods. Command Centre spending is a flat comparison lens.</small><b>Open Income &amp; draws ↗</b></a>
          <a className="deep-link" href={atlasUrl} target="_blank" rel="noreferrer"><span>Retirement Atlas</span><small>Strategy map linking the floor, pools, tax, trajectory and estate</small><b>Open Atlas ↗</b></a>
          <a className="deep-link" href="./model-reference.html" target="_blank" rel="noreferrer"><span>Model reference</span><small>Static formulas, assumptions, controls and source lineage</small><b>Readable without JavaScript ↗</b></a>
          <div className="version">Baseline 2026-07-18 · integrated v3</div>
        </aside>
        <main className="content">{content}</main>
      </div>
      <nav className="mobile-dock" aria-label="Primary mobile navigation">{[["overview", "Home"], ["scenario", "Adjust"], ["compare", "Compare"], ["risk", "Risk"], ["review", "Review"]].map(([key, label]) => <button key={key} aria-current={section === key ? "page" : undefined} className={section === key ? "active" : ""} onClick={() => go(key as SectionKey)}>{label}</button>)}</nav>
      <RetirementAi context={aiContext} />
    </div>
  );
}
