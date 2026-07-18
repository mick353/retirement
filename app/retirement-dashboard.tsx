"use client";

import { useEffect, useMemo, useRef, useState } from "react";

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
  ["PSS_Annual_Statement_2025_2025-12-20.pdf", "FAS, ABM and benefit components", "Source"],
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
  if (typeof document === "undefined") return `/${cleanPath}`;
  return new URL(cleanPath, document.baseURI).toString();
}

const SCENARIO_PRESETS: Record<string, ScenarioState & { label: string; intent: string }> = {
  baseline: { label: "Balanced baseline", intent: "Central lifestyle and estate compromise", rail: "B", spend: 110_000, realReturn: 0.05, targetAge: 75, homeValue: 500_000 },
  lifestyle: { label: "Lifestyle-led", intent: "More active-retirement spending", rail: "B", spend: 130_000, realReturn: 0.05, targetAge: 75, homeValue: 500_000 },
  estate: { label: "Estate-first", intent: "Lower draw and conservative rail", rail: "A", spend: 90_000, realReturn: 0.05, targetAge: 75, homeValue: 500_000 },
};

function sharedModelUrl(scenario: ScenarioState) {
  const params = new URLSearchParams({
    shared: "1",
    rail: scenario.rail,
    spend: String(Math.round(scenario.spend)),
    return: String(scenario.realReturn),
    age: String(scenario.targetAge),
    home: String(Math.round(scenario.homeValue)),
  });
  return `${siteAsset("deep-model.html")}?${params.toString()}`;
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

function monthlyEndingBalance(start: number, annualReturn: number, annualDraw: number, years: number) {
  const months = Math.max(0, years * 12);
  const mr = Math.pow(1 + annualReturn, 1 / 12) - 1;
  const draw = Math.max(0, annualDraw) / 12;
  if (mr === 0) return Math.max(0, start - draw * months);
  const growth = Math.pow(1 + mr, months);
  return Math.max(0, start * growth - draw * ((growth - 1) / mr));
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
  if (age < 65) return 0.04;
  if (age < 75) return 0.05;
  if (age < 80) return 0.06;
  if (age < 85) return 0.07;
  if (age < 90) return 0.09;
  if (age < 95) return 0.11;
  return 0.14;
}

function operationalLedger(rail: Rail, spend: number, realReturn: number, taxYear: TaxYear) {
  let poolA = rail.poolA;
  let poolC = rail.poolC;
  const rows = [];
  for (let age = 60; age <= 95; age += 1) {
    const openingA = poolA;
    const openingC = poolC;
    const mandatory = openingA * drawRate(age);
    const lifestyleGap = Math.max(0, spend - rail.netPension);
    const draw = Math.min(openingA, Math.max(mandatory, lifestyleGap));
    const reinvestment = Math.max(0, rail.netPension + draw - spend);
    const externalTaxDrag = openingC * POOL_C_DRAG;
    poolA = Math.max(0, openingA * (1 + realReturn) - draw);
    poolC = Math.max(0, openingC * (1 + realReturn) - externalTaxDrag + reinvestment);
    rows.push({
      year: `${2033 + age - 60}-${String(34 + age - 60).slice(-2)}`,
      age,
      pension: rail.netPension,
      accumulation: 0,
      abp: poolA,
      poolC,
      draw,
      spend,
      reinvestment,
      tax: externalTaxDrag,
      netIncome: rail.netPension + draw,
      grossEquivalent: grossForNet(spend, taxYear),
      ending: poolA + poolC,
    });
  }
  return rows;
}

function contributionWhatIf(phase2: number, phase3: number, nominalReturn: number) {
  const q = Math.pow(1 + nominalReturn, 1 / 26) - 1;
  const project = (p2: number, p3: number) => {
    let balance = 24_522;
    for (let i = 0; i < 43; i += 1) balance = balance * (1 + q) + p2;
    for (let i = 0; i < 157; i += 1) balance = balance * (1 + q) + p3;
    return balance;
  };
  return 317_447.66 + project(phase2, phase3) - project(650, 1_200);
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

function FrontierCurve({ rail, selectedSpend, homeValue, onSelect }: { rail: Rail; selectedSpend: number; homeValue: number; onSelect: (value: number) => void }) {
  const points = Array.from({ length: 13 }, (_, index) => 80_000 + index * 5_000).map((candidateSpend) => {
    const capital = monthlyEndingBalance(rail.capital, 0.05, Math.max(0, candidateSpend - rail.netPension), 15);
    return { spend: candidateSpend, capital, estate: capital + homeValue };
  });
  const width = 920;
  const height = 300;
  const pad = { l: 78, r: 28, t: 22, b: 52 };
  const minEstate = Math.min(...points.map((point) => point.estate)) * .92;
  const maxEstate = Math.max(...points.map((point) => point.estate)) * 1.03;
  const x = (candidateSpend: number) => pad.l + ((candidateSpend - 80_000) / 60_000) * (width - pad.l - pad.r);
  const y = (candidateEstate: number) => pad.t + (1 - (candidateEstate - minEstate) / Math.max(1, maxEstate - minEstate)) * (height - pad.t - pad.b);
  const line = points.map((point) => `${x(point.spend)},${y(point.estate)}`).join(" ");
  const nearest = points.reduce((best, point) => Math.abs(point.spend - selectedSpend) < Math.abs(best.spend - selectedSpend) ? point : best, points[0]);
  return (
    <div className="frontier-curve">
      <div className="chart-shell" role="img" aria-label="Interactive spending and age-75 estate frontier">
        <svg viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none">
          {[0, .5, 1].map((tick) => { const yy = pad.t + tick * (height - pad.t - pad.b); return <g key={tick}><line x1={pad.l} y1={yy} x2={width - pad.r} y2={yy} className="chart-grid" /><text x={pad.l - 12} y={yy + 4} textAnchor="end" className="chart-label">{compactMoney(maxEstate - tick * (maxEstate - minEstate))}</text></g>; })}
          <polyline points={line} className="frontier-line" />
          {points.map((point) => {
            const active = point.spend === nearest.spend;
            const tone = point.capital >= 1_000_000 ? "safe" : point.capital >= 500_000 ? "watch" : "risk";
            return <circle key={point.spend} cx={x(point.spend)} cy={y(point.estate)} r={active ? 8 : 5} className={`frontier-point ${tone} ${active ? "active" : ""}`} role="button" tabIndex={0} aria-label={`${money(point.spend)} spending, ${money(point.estate)} estate`} onClick={() => onSelect(point.spend)} onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") onSelect(point.spend); }}><title>{`${money(point.spend)} spend → ${money(point.estate)} estate`}</title></circle>;
          })}
          {[80_000, 90_000, 100_000, 110_000, 120_000, 130_000, 140_000].map((candidateSpend) => <text key={candidateSpend} x={x(candidateSpend)} y={height - 16} textAnchor="middle" className="chart-label">${candidateSpend / 1000}k</text>)}
        </svg>
      </div>
      <label className="frontier-drag"><span>Drag annual spending <b>{money(selectedSpend)}</b></span><input type="range" min="80000" max="140000" step="5000" value={nearest.spend} onChange={(event) => onSelect(Number(event.target.value))} /></label>
      <div className="frontier-readout"><span>Selected age-75 investments <b>{money(nearest.capital)}</b></span><span>Property-inclusive estate <b>{money(nearest.estate)}</b></span></div>
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
  const [theme, setTheme] = useState<"dark" | "light">("dark");
  const [navOpen, setNavOpen] = useState(false);
  const [showLedger, setShowLedger] = useState(false);
  const [washCycles, setWashCycles] = useState(6);
  const [vrAge, setVrAge] = useState(57);
  const [vrMode, setVrMode] = useState<"immediate" | "preserve">("immediate");
  const [phase2, setPhase2] = useState(650);
  const [phase3, setPhase3] = useState(1_200);
  const [nominalReturn, setNominalReturn] = useState(0.07);
  const [cashflowAge, setCashflowAge] = useState(65);
  const [saved, setSaved] = useState<Record<string, ScenarioState>>({});
  const [reviewSnapshot, setReviewSnapshot] = useState<ReviewSnapshot | null>(null);
  const [reviewChecks, setReviewChecks] = useState<Record<string, boolean>>({});
  const importRef = useRef<HTMLInputElement>(null);

  const rail = RAILS[railKey];
  const portfolioDraw = Math.max(0, spend - rail.netPension);
  const endCapital = monthlyEndingBalance(rail.capital, realReturn, portfolioDraw, targetAge - 60);
  const estate = endCapital + homeValue;
  const grossEquivalent = grossForNet(spend, taxYear);
  const ledger = useMemo(() => operationalLedger(rail, spend, realReturn, taxYear), [rail, spend, realReturn, taxYear]);
  const fan = useMemo(() => monteCarloFan(rail, spend, realReturn), [rail, spend, realReturn]);
  const trajectoryLabels = Array.from({ length: 16 }, (_, i) => 60 + i);
  const trajectorySeries = RETURNS.map((r, i) => ({
    name: `${pct(r, 1)} real`,
    color: ["#f3a950", "#47d6a0", "#6f8cff"][i],
    values: trajectoryLabels.map((age) => monthlyEndingBalance(rail.capital, r, portfolioDraw, age - 60)),
  }));
  const currentPf = 2_795.57;
  const retirementPf = spend / 26;
  const currentScenario = useMemo<ScenarioState>(() => ({ rail: railKey, spend, realReturn, targetAge, homeValue }), [railKey, spend, realReturn, targetAge, homeValue]);
  const deepModelUrl = sharedModelUrl(currentScenario);
  const targetIndex = clamp(targetAge - 60, 0, fan.ages.length - 1);
  const targetProbability = fan.paths[targetIndex].filter((value) => value >= 500_000).length / Math.max(1, fan.paths[targetIndex].length);

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      const raw = localStorage.getItem("robinson-retirement-scenarios");
      const snapshot = localStorage.getItem("robinson-retirement-review-snapshot");
      const checks = localStorage.getItem("robinson-retirement-review-checks");
      timer = setTimeout(() => {
        if (raw) setSaved(JSON.parse(raw));
        if (snapshot) setReviewSnapshot(JSON.parse(snapshot));
        if (checks) setReviewChecks(JSON.parse(checks));
      }, 0);
    } catch { /* local preference only */ }
    if ("serviceWorker" in navigator) navigator.serviceWorker.register(siteAsset("sw.js")).catch(() => undefined);
    return () => { if (timer) clearTimeout(timer); };
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem("robinson-retirement-shared-scenario", JSON.stringify({ version: 2, updatedAt: new Date().toISOString(), ...currentScenario }));
    } catch { /* local preference only */ }
  }, [currentScenario]);

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
    const next = { ...saved, [slot]: { rail: railKey, spend, realReturn, targetAge, homeValue } };
    setSaved(next);
    localStorage.setItem("robinson-retirement-scenarios", JSON.stringify(next));
  };

  const loadSlot = (slot: string) => {
    const s = saved[slot];
    if (!s) return;
    setRailKey(s.rail); setSpend(s.spend); setRealReturn(s.realReturn); setTargetAge(s.targetAge); setHomeValue(s.homeValue);
  };

  const applyScenario = (scenario: ScenarioState) => {
    setRailKey(scenario.rail);
    setSpend(scenario.spend);
    setRealReturn(scenario.realReturn);
    setTargetAge(scenario.targetAge);
    setHomeValue(scenario.homeValue);
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
    const payload = { version: "2026-07-18.integrated.2", exportedAt: new Date().toISOString(), current: { rail: railKey, spend, realReturn, targetAge, homeValue, taxYear }, saved, reviewSnapshot, reviewChecks };
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
        setSpend(Number(parsed.current.spend) || 110_000);
        setRealReturn(Number(parsed.current.realReturn) || 0.05);
        setTargetAge(Number(parsed.current.targetAge) || 75);
        setHomeValue(Number(parsed.current.homeValue) || HOME_BASELINE);
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
          <div className="eyebrow">Integrated retirement command centre · 18 July 2026 baseline</div>
          <h1>Your pension secures the floor.<br /><span>Your capital buys optionality.</span></h1>
          <p>The core decision is no longer whether retirement works. It is how deliberately to trade present lifestyle against later capital and estate value.</p>
          <div className="hero-actions">
            <button className="primary" onClick={() => go("scenario")}>Run a scenario</button>
            <button className="secondary" onClick={() => go("frontier")}>Inspect the frontier</button>
            <a className="secondary" href={deepModelUrl} target="_blank" rel="noreferrer">Open this scenario in V23 ↗</a>
          </div>
        </div>
        <div className="hero-rail">
          <div className="rail-switch" aria-label="Select modelling rail">
            {(["A", "B"] as RailKey[]).map((key) => <button key={key} className={railKey === key ? "active" : ""} onClick={() => setRailKey(key)}><b>Rail {key}</b><span>{RAILS[key].short}</span></button>)}
          </div>
          <div className="rail-note"><Badge tone={railKey === "A" ? "modelled" : "exact"}>{rail.source}</Badge><p>{rail.purpose}</p></div>
        </div>
      </section>

      <div className="metrics four">
        <Metric label="Indexed PSS net floor" value={money(rail.netPension)} sub={`${fmt1.format(rail.netPension / 26)} per fortnight · for life`} tone="violet" />
        <Metric label="Flexible capital at 60" value={money(rail.capital)} sub={`${money(rail.lumpSum)} PSS lump + ${money(rail.hostplus)} Hostplus`} />
        <Metric label={`Investments at ${targetAge}`} value={money(endCapital)} sub={`${pct(realReturn, 1)} real · ${money(spend)} net spending`} tone="green" />
        <Metric label={`Full estate at ${targetAge}`} value={money(estate)} sub={`Includes ${money(homeValue)} real home`} tone="amber" />
      </div>

      <section className="panel decision-banner">
        <div><Badge tone="good">Central operating band</Badge><h3>$100,000–$110,000 net a year</h3><p>Best structural balance across spending power, capital, tax, estate, liquidity and flexibility.</p></div>
        <div className="comparison-stat"><span>Selected spend</span><strong>{fmt1.format(retirementPf)} / pf</strong><small>{money(grossEquivalent)} salary equivalent</small></div>
        <div className="comparison-stat"><span>Visible current bank receipt</span><strong>{fmt1.format(currentPf)} / pf</strong><small>Before the retirement release of current obligations</small></div>
        <div className="comparison-stat positive"><span>Cashflow uplift</span><strong>+{fmt1.format(retirementPf - currentPf)} / pf</strong><small>{pct(retirementPf / currentPf - 1)} above current bank inflow</small></div>
      </section>

      <section className="next-actions" aria-label="Recommended next actions">
        <button onClick={() => go("compare")}><span>1</span><div><b>Compare three plans</b><small>Baseline · lifestyle · estate</small></div></button>
        <button onClick={() => go("risk")}><span>2</span><div><b>Stress the plan</b><small>Probability · sequence · cashflow</small></div></button>
        <button onClick={() => go("review")}><span>3</span><div><b>Complete annual review</b><small>Changes · sources · action checklist</small></div></button>
      </section>

      <section className="panel">
        <div className="panel-head"><div><h3>Spending choice → investment capital</h3><p>Monthly deterministic frontier, selected rail; home excluded from the lines.</p></div><div className="quick-spend">{FRONTIER_SPENDS.map((v) => <button key={v} className={spend === v ? "active" : ""} onClick={() => setSpend(v)}>${v / 1000}k</button>)}</div></div>
        <LineChart labels={trajectoryLabels} series={trajectorySeries} />
      </section>

      <section className="panel">
        <div className="panel-head"><div><h3>Eight-objective decision test</h3><p>Current selected scenario against the retirement framework.</p></div><Badge tone="modelled">Modelled assessment</Badge></div>
        <div className="objective-grid">
          {[
            ["Income security", rail.netPension / spend, "Pension coverage"],
            ["Spending power", Math.min(1, spend / 110_000), "Lifestyle capacity"],
            ["Capital", Math.min(1, endCapital / 1_500_000), `Investments @${targetAge}`],
            ["Age-75 wealth", Math.min(1, monthlyEndingBalance(rail.capital, realReturn, portfolioDraw, 15) / 1_500_000), "Investment target"],
            ["Age-85 wealth", Math.min(1, monthlyEndingBalance(rail.capital, realReturn, portfolioDraw, 25) / 1_500_000), "Longevity capital"],
            ["Estate", Math.min(1, estate / 2_000_000), "Property-inclusive"],
            ["Tax efficiency", washCycles >= 6 ? 0.92 : 0.65, "NCC wash enabled"],
            ["Optionality", spend <= 120_000 ? 0.9 : 0.68, "Liquidity / reversibility"],
          ].map(([name, score, detail]) => <div className="objective" key={String(name)}><div><span>{name}</span><b>{Math.round(Number(score) * 100)}</b></div><div className="meter"><i style={{ width: `${Math.min(100, Number(score) * 100)}%` }} /></div><small>{detail}</small></div>)}
        </div>
      </section>
    </>
  );

  const renderScenario = () => (
    <>
      <SectionHeading eyebrow="Decision engine" title="Scenario lab" copy="Change one assumption at a time, preserve rail identity, and see capital, income and estate effects immediately." />
      <section className="scenario-layout">
        <aside className="control-panel">
          <label>Modelling rail<select value={railKey} onChange={(e) => setRailKey(e.target.value as RailKey)}><option value="A">Rail A — conservative wealth</option><option value="B">Rail B — spending frontier</option></select></label>
          <AdjustableControl label="Net annual spending" value={spend} min={76_000} max={150_000} step={1_000} baseline={110_000} format={money} onChange={setSpend} />
          <AdjustableControl label="Real investment return" value={realReturn} min={0.02} max={0.075} step={0.005} baseline={0.05} scale={100} format={(value) => pct(value, 1)} onChange={setRealReturn} />
          <AdjustableControl label="Target age" value={targetAge} min={70} max={95} step={1} baseline={75} format={(value) => `${Math.round(value)}`} onChange={setTargetAge} />
          <AdjustableControl label="Real home value" value={homeValue} min={300_000} max={1_000_000} step={25_000} baseline={HOME_BASELINE} format={money} onChange={setHomeValue} />
          <label>Salary-equivalent tax year<select value={taxYear} onChange={(e) => setTaxYear(e.target.value as TaxYear)}><option>2026-27</option><option>2027-28</option></select></label>
          <button className="secondary wide" onClick={() => { setRailKey("B"); setSpend(110_000); setRealReturn(0.05); setTargetAge(75); setHomeValue(HOME_BASELINE); }}>Reset central baseline</button>
        </aside>
        <div className="scenario-results">
          <div className="metrics three">
            <Metric label="Portfolio draw required" value={money(portfolioDraw)} sub={`${pct(rail.netPension / spend, 1)} of spending covered by PSS`} tone="violet" />
            <Metric label={`Ending investment capital @${targetAge}`} value={money(endCapital)} sub={`${money(endCapital - 500_000)} vs $500k investment floor`} tone={endCapital >= 500_000 ? "green" : "amber"} />
            <Metric label="Salary gross equivalent" value={money(grossEquivalent)} sub={`${taxYear} resident rates + 2% Medicare`} />
          </div>
          <section className="panel compact"><LineChart labels={trajectoryLabels} series={trajectorySeries} height={260} /></section>
          <div className="scenario-actions">
            {["A", "B", "C"].map((slot) => <div key={slot}><button className="secondary" onClick={() => saveSlot(slot)}>Save {slot}</button><button className="text-button" disabled={!saved[slot]} onClick={() => loadSlot(slot)}>Load</button></div>)}
            <button className="secondary" onClick={exportSettings}>Export JSON</button>
            <button className="secondary" onClick={() => importRef.current?.click()}>Import</button>
            <a className="primary" href={deepModelUrl} target="_blank" rel="noreferrer">Continue in V23 ↗</a>
            <input ref={importRef} hidden type="file" accept="application/json" onChange={(e) => importSettings(e.target.files?.[0])} />
          </div>
        </div>
      </section>

      <section className="panel">
        <div className="panel-head"><div><h3>Reconciled annual operating ledger</h3><p>Three-pool deterministic ledger; every ending-capital row equals Hostplus pension + accumulation + Pool C.</p></div><button className="secondary" onClick={() => setShowLedger(!showLedger)}>{showLedger ? "Hide table" : "Show ages 60–95"}</button></div>
        <div className="table-wrap desktop-ledger"><table><thead><tr><th>Year</th><th>Age</th><th>PSSDB pension</th><th>Hostplus accumulation</th><th>Hostplus pension</th><th>Pool C</th><th>Draw</th><th>Spend</th><th>Reinvestment</th><th>Tax drag</th><th>Net income</th><th>Gross equivalent</th><th>Ending capital</th></tr></thead><tbody>{ledger.slice(0, showLedger ? ledger.length : 6).map((r) => <tr key={r.age}><td>{r.year}</td><td>{r.age}</td><td>{money(r.pension)}</td><td>{money(r.accumulation)}</td><td>{money(r.abp)}</td><td>{money(r.poolC)}</td><td>{money(r.draw)}</td><td>{money(r.spend)}</td><td>{money(r.reinvestment)}</td><td>{money(r.tax)}</td><td>{money(r.netIncome)}</td><td>{money(r.grossEquivalent)}</td><td><b>{money(r.ending)}</b></td></tr>)}</tbody></table></div>
        <div className="mobile-ledger">{ledger.slice(0, showLedger ? ledger.length : 6).map((row) => <article key={row.age}><header><div><span>{row.year}</span><b>Age {row.age}</b></div><strong>{money(row.ending)}</strong></header><dl><div><dt>PSS pension</dt><dd>{money(row.pension)}</dd></div><div><dt>Portfolio draw</dt><dd>{money(row.draw)}</dd></div><div><dt>Annual spend</dt><dd>{money(row.spend)}</dd></div><div><dt>Pool C</dt><dd>{money(row.poolC)}</dd></div></dl></article>)}</div>
        <div className="assumption-row"><Badge tone="modelled">4–14% statutory draw bands</Badge><Badge tone="modelled">Pool C 0.35% annual drag</Badge><Badge tone="modelled">Real dollars</Badge><Badge tone="speculative">Current law held constant</Badge></div>
      </section>
    </>
  );

  const renderCompare = () => {
    const scenarios = Object.entries(SCENARIO_PRESETS).map(([key, scenario]) => {
      const scenarioRail = RAILS[scenario.rail];
      const draw = Math.max(0, scenario.spend - scenarioRail.netPension);
      const capital75 = monthlyEndingBalance(scenarioRail.capital, scenario.realReturn, draw, 15);
      const capital85 = monthlyEndingBalance(scenarioRail.capital, scenario.realReturn, draw, 25);
      const scenarioFan = monteCarloFan(scenarioRail, scenario.spend, scenario.realReturn, .12, 360);
      const probability = scenarioFan.paths[15].filter((value) => value >= 500_000).length / scenarioFan.paths[15].length;
      return { key, ...scenario, draw, capital75, capital85, estate75: capital75 + scenario.homeValue, probability };
    });
    const baseline = scenarios[0];
    return <>
      <SectionHeading eyebrow="Decision workspace" title="Compare complete retirement plans" copy="Read the trade-offs side by side before changing the baseline. Every card can be loaded into the command centre or handed to V23 with the same assumptions." />
      <section className="compare-cards">{scenarios.map((scenario, index) => <article key={scenario.key} className={scenario.key === "baseline" ? "recommended" : ""}>
        <div className="compare-head"><div><Badge tone={scenario.key === "baseline" ? "good" : scenario.key === "lifestyle" ? "estimated" : "modelled"}>{scenario.key === "baseline" ? "Recommended" : `Option ${index + 1}`}</Badge><h3>{scenario.label}</h3><p>{scenario.intent}</p></div><span>Rail {scenario.rail}</span></div>
        <div className="compare-spend"><span>Net annual spending</span><strong>{money(scenario.spend)}</strong><small>{fmt1.format(scenario.spend / 26)} per fortnight</small></div>
        <dl className="compare-outcomes"><div><dt>Capital @75</dt><dd>{money(scenario.capital75)}</dd></div><div><dt>Capital @85</dt><dd>{money(scenario.capital85)}</dd></div><div><dt>Estate @75</dt><dd>{money(scenario.estate75)}</dd></div><div><dt>P(floor @75)</dt><dd>{pct(scenario.probability, 0)}</dd></div></dl>
        <div className="compare-delta"><span>Versus baseline</span><b>{scenario.key === "baseline" ? "Reference plan" : `${scenario.capital75 >= baseline.capital75 ? "+" : ""}${money(scenario.capital75 - baseline.capital75)} capital @75`}</b></div>
        <div className="compare-actions"><button className="secondary" onClick={() => { applyScenario(scenario); go("scenario"); }}>Use this plan</button><a className="text-button" href={sharedModelUrl(scenario)} target="_blank" rel="noreferrer">Open in V23 ↗</a></div>
      </article>)}</section>
      <section className="panel comparison-matrix">
        <div className="panel-head"><div><h3>Trade-off matrix</h3><p>Longer bars are better within each row; spending is preference, not a score.</p></div><Badge tone="modelled">Like-for-like assumptions</Badge></div>
        {[{ label: "Lifestyle spending", field: "spend" as const }, { label: "Age-75 investments", field: "capital75" as const }, { label: "Age-85 investments", field: "capital85" as const }, { label: "Age-75 estate", field: "estate75" as const }].map((metric) => {
          const maximum = Math.max(...scenarios.map((scenario) => scenario[metric.field]));
          return <div className="matrix-row" key={metric.label}><b>{metric.label}</b>{scenarios.map((scenario) => <div key={scenario.key}><span>{scenario.label}</span><i><em style={{ width: `${scenario[metric.field] / maximum * 100}%` }} /></i><strong>{money(scenario[metric.field])}</strong></div>)}</div>;
        })}
      </section>
      <div className="note"><b>Professional interpretation:</b> the balanced plan is structurally strongest when the objective is both present lifestyle and a durable estate. Lifestyle-led is affordable in many paths but creates materially less recovery margin after an early market shock.</div>
    </>;
  };

  const renderPre60 = () => {
    const projected = contributionWhatIf(phase2, phase3, nominalReturn);
    return <>
      <SectionHeading eyebrow="Accumulation runway" title="Present → age 60" copy="The pre-retirement plan protects liquidity first, then increases Hostplus contributions after the bank and loan targets are complete." />
      <div className="metrics four">
        <Metric label="Current Hostplus baseline" value={money(24_522)} sub="April 2026 source value" />
        <Metric label="Working Hostplus @60" value={money(317_447.66)} sub="Canonical real working figure" tone="green" />
        <Metric label="Current visible net pay" value={fmt1.format(2_795.57)} sub="Per fortnight after tax, PSS and child support" tone="violet" />
        <Metric label="PSS contribution rate" value="10%" sub="Maintain until ABM caps near mid-2032" tone="amber" />
      </div>
      <section className="timeline">
        <article><span>1</span><div><Badge tone="good">Near completion</Badge><h3>Liquidity base</h3><p>Bank to $30k; home loan to $10k. No Hostplus contributions while these targets finish.</p></div><strong>Now → Jul 2026</strong></article>
        <article><span>2</span><div><Badge tone="modelled">Concessional</Badge><h3>Salary sacrifice</h3><p>$650 per fortnight salary sacrifice; optional $900 ramp after the EL1 increment.</p></div><strong>Jul 2026 → Mar 2028</strong></article>
        <article><span>3</span><div><Badge tone="modelled">Full build</Badge><h3>Contribution acceleration</h3><p>$650 salary sacrifice + $550 direct contribution = $1,200 per fortnight after child support ends.</p></div><strong>Mar 2028 → Dec 2033</strong></article>
      </section>
      <section className="panel">
        <div className="panel-head"><div><h3>Contribution sensitivity</h3><p>The locked $317,448 working figure remains the anchor; sliders show the incremental effect of changing contributions.</p></div><Badge tone="modelled">7% nominal default · separate from real retirement models</Badge></div>
        <div className="sensitivity-layout">
          <div className="control-panel inline">
            <label><span>Phase 2 / fortnight <b>{money(phase2)}</b></span><input type="range" min="400" max="1000" step="50" value={phase2} onChange={(e) => setPhase2(Number(e.target.value))} /></label>
            <label><span>Phase 3 / fortnight <b>{money(phase3)}</b></span><input type="range" min="800" max="1600" step="50" value={phase3} onChange={(e) => setPhase3(Number(e.target.value))} /></label>
            <label><span>Nominal accumulation return <b>{pct(nominalReturn, 1)}</b></span><input type="range" min="0.04" max="0.09" step="0.005" value={nominalReturn} onChange={(e) => setNominalReturn(Number(e.target.value))} /></label>
          </div>
          <div className="whatif-result"><span>What-if Hostplus at 60</span><strong>{money(projected)}</strong><small>{projected >= 317_447.66 ? "+" : ""}{money(projected - 317_447.66)} versus locked working figure</small></div>
        </div>
        <div className="note warn"><b>Control point:</b> verify the exact PSS defined-benefit concessional amount on the August 2026 statement before finalising salary sacrifice. Nominal and real returns are not mixed in this block.</div>
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
        <article><i className="pool-dot c" /><h3>Pool C</h3><strong>{money(rail.poolC)}</strong><p>External indexed ETF overflow. Canonical annual distribution drag 0.35%; outside super death-benefit tax.</p></article>
      </section>
      <section className="panel comparator"><div><Badge tone="exact">Source-only comparator</Badge><h3>July 100% pension estimate</h3><p>Gross {money(137_584.82)} · net {fmt1.format(4_941.65)} per fortnight. The 60/40 election remains settled because the flexible capital and estate optionality dominate the extra pension for this objective set.</p></div><strong>Not reopened</strong></section>
    </>
  );

  const renderFrontier = () => {
    const rows = FRONTIER_SPENDS.map((s) => ({ spend: s, draw: Math.max(0, s - rail.netPension), gross: grossForNet(s, taxYear), values: RETURNS.map((r) => monthlyEndingBalance(rail.capital, r, Math.max(0, s - rail.netPension), 15)) }));
    const selected = rows.find((r) => r.spend === Math.round(spend / 10_000) * 10_000) ?? rows[2];
    return <>
      <SectionHeading eyebrow="Lifestyle ↔ legacy" title="Spending–estate frontier" copy="The same secure pension supports several valid retirement profiles. The cost of higher spending is lower future capital plus foregone compounding." />
      <section className="profile-strip">{FRONTIER_SPENDS.map((v, i) => <button key={v} className={spend === v ? "active" : ""} onClick={() => setSpend(v)}><span>{["Estate max", "Strong compromise", "Balanced", "Lifestyle-led", "High optionality"][i]}</span><b>{money(v)}</b><small>{fmt1.format(v / 26)} / pf</small></button>)}</section>
      <div className="metrics four">
        <Metric label="PSS coverage" value={pct(rail.netPension / spend, 1)} sub={`${money(portfolioDraw)} annual portfolio draw`} tone="violet" />
        <Metric label="Salary gross equivalent" value={money(grossEquivalent)} sub={`${taxYear} rates`} />
        <Metric label="Investments @75 · 5%" value={money(monthlyEndingBalance(rail.capital, 0.05, portfolioDraw, 15))} sub="Home excluded" tone="green" />
        <Metric label="Gross estate @75 · 5%" value={money(monthlyEndingBalance(rail.capital, 0.05, portfolioDraw, 15) + homeValue)} sub="Before estate costs / residual DBT" tone="amber" />
      </div>
      <section className="panel">
        <div className="panel-head"><div><h3>Interactive efficient frontier</h3><p>Drag spending or select a point. Colour shows the investment buffer at age 75: green ≥ $1m, amber ≥ $500k, red below the floor.</p></div><Badge tone="modelled">5% real · age 75</Badge></div>
        <FrontierCurve rail={rail} selectedSpend={spend} homeValue={homeValue} onSelect={setSpend} />
      </section>
      <section className="panel">
        <div className="panel-head"><div><h3>Full age-75 outcome matrix</h3><p>Monthly compounding and monthly withdrawals. Current selected rail: {rail.short}.</p></div><Badge tone="modelled">Deterministic</Badge></div>
        <div className="table-wrap"><table><thead><tr><th>Net spend</th><th>Per fortnight</th><th>Gross equivalent</th><th>Portfolio draw</th>{RETURNS.map((r) => <th key={r}>Investments · {pct(r, 1)}</th>)}<th>Estate · 5%</th></tr></thead><tbody>{rows.map((r) => <tr key={r.spend} className={spend === r.spend ? "selected-row" : ""} onClick={() => setSpend(r.spend)}><td><b>{money(r.spend)}</b></td><td>{fmt1.format(r.spend / 26)}</td><td>{money(r.gross)}</td><td>{money(r.draw)}</td>{r.values.map((v, i) => <td key={i}>{money(v)}</td>)}<td><b>{money(r.values[1] + homeValue)}</b></td></tr>)}</tbody></table></div>
      </section>
      <section className="panel tradeoff">
        <div><Badge tone="warn">Marginal cost</Badge><h3>Each extra $10,000 of annual spending</h3><p>Reduces age-75 investment capital by approximately $203,881 at 4%, $220,687 at 5%, and $248,944 at 6.5% under the 15-year Rail B frontier.</p></div>
        <div className="tradeoff-bars">{RETURNS.map((r, i) => { const cost = [203_881, 220_687, 248_944][i]; return <div key={r}><span>{pct(r, 1)}</span><i style={{ width: `${cost / 2_600}%` }} /><b>{money(cost)}</b></div>; })}</div>
      </section>
      <section className="panel two-models"><article><Badge tone="modelled">Model A</Badge><h3>Investment benchmark</h3><p>$1.2m / $1.5m / $1.75m age-75 investments at 4% / 5% / 6.5%. Home excluded.</p></article><article><Badge tone="good">Model B</Badge><h3>Spending frontier</h3><p>At least $500k investments + $500k home = $1m property-inclusive gross estate floor.</p></article><div><strong>Selected position</strong><p>{money(selected.spend)} spend · {money(selected.values[1])} investments · {money(selected.values[1] + homeValue)} estate at 5%.</p></div></section>
    </>;
  };

  const renderRisk = () => {
    const row = ledger.find((item) => item.age === cashflowAge) ?? ledger[0];
    const p10 = fan.p10[targetIndex];
    const p50 = fan.p50[targetIndex];
    const p90 = fan.p90[targetIndex];
    const shockAges = [61, 63, 65, 67, 70];
    const shocks = [-.10, -.20, -.30, -.40];
    return <>
      <SectionHeading eyebrow="Uncertainty made visible" title="Risk studio" copy="The pension protects essential income. These views show how markets change optionality, recovery margin and estate—not whether the lifetime floor keeps paying." />
      <div className="metrics four">
        <Metric label={`P(≥$500k) at ${targetAge}`} value={pct(targetProbability, 0)} sub="600 seeded stochastic paths · 12% volatility" tone={targetProbability >= .8 ? "green" : "amber"} />
        <Metric label={`P10 capital @${targetAge}`} value={money(p10)} sub="Nine in ten paths finish above this level" tone="amber" />
        <Metric label={`Median capital @${targetAge}`} value={money(p50)} sub="Middle stochastic outcome" />
        <Metric label={`P90 capital @${targetAge}`} value={money(p90)} sub="Strong-path reference, not a forecast" tone="green" />
      </div>
      <section className="panel">
        <div className="panel-head"><div><h3>Capital probability fan</h3><p>Percentile ranges widen over time. The vertical marker follows the selected target age.</p></div><Badge tone="modelled">600 deterministic-seed simulations</Badge></div>
        <FanChart fan={fan} targetAge={targetAge} />
        <div className="note warn"><b>Read the band, not just the median:</b> this is an uncertainty lens using a constant mean and 12% annual volatility. It does not forecast market regimes, fees, legislation or personal spending shocks.</div>
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
        <div className="panel-head"><div><h3>Selected-year cashflow map</h3><p>Choose an age to see where the pension and compulsory/voluntary portfolio draw flow.</p></div><label className="age-select">Age<select value={cashflowAge} onChange={(event) => setCashflowAge(Number(event.target.value))}>{ledger.map((item) => <option key={item.age}>{item.age}</option>)}</select></label></div>
        <div className="cashflow-map">
          <div className="flow-source pension"><span>Indexed PSS pension</span><strong>{money(row.pension)}</strong><small>Lifetime income floor</small></div>
          <div className="flow-source draw"><span>Portfolio draw</span><strong>{money(row.draw)}</strong><small>{pct(drawRate(row.age), 0)} statutory band</small></div>
          <div className="flow-total"><span>Cash received</span><strong>{money(row.netIncome)}</strong><small>Before any recycled surplus</small></div>
          <div className="flow-use spend"><span>Lifestyle spending</span><strong>{money(row.spend)}</strong><small>Selected real-dollar plan</small></div>
          <div className="flow-use recycle"><span>Reinvested to Pool C</span><strong>{money(row.reinvestment)}</strong><small>Unspent draw remains invested</small></div>
          <div className="flow-use drag"><span>Pool C tax drag</span><strong>{money(row.tax)}</strong><small>0.35% modelled distribution drag</small></div>
        </div>
      </section>
      <section className="retirement-runway" aria-label="Retirement runway">
        {[{ age: 57, title: "Optional VR window", detail: "Request formal CSC estimates" }, { age: 60, title: "Retirement transition", detail: "PSS 60/40 · Pool A/B/C launch" }, { age: 61, title: "NCC wash cycle", detail: "Separate-interest execution" }, { age: 75, title: "Primary decision target", detail: `${money(monthlyEndingBalance(rail.capital, realReturn, portfolioDraw, 15))} modelled investments` }, { age: 85, title: "Longevity checkpoint", detail: "Review care and estate capacity" }, { age: 95, title: "Late-life horizon", detail: "PSS floor continues for life" }].map((milestone) => <article key={milestone.age}><span>{milestone.age}</span><div><b>{milestone.title}</b><small>{milestone.detail}</small></div></article>)}
      </section>
    </>;
  };

  const renderEstate = () => {
    const taxableStart = rail.poolA * 0.7097;
    const removedPerWash = 130_000 * 0.7097;
    const taxableRemaining = Math.max(0, taxableStart - washCycles * removedPerWash);
    const dbtStart = taxableStart * 0.17;
    const dbtRemaining = taxableRemaining * 0.17;
    const dbtSaved = dbtStart - dbtRemaining;
    return <>
      <SectionHeading eyebrow="After-tax legacy" title="Tax, NCC wash and estate" copy="The estate question is not gross wealth alone. Super components, death-benefit tax and the location of capital determine what beneficiaries actually receive." />
      <div className="metrics four">
        <Metric label="Starting taxable share" value="70.97%" sub="60/40 lump taxable-taxed; untaxed = 0%" tone="amber" />
        <Metric label="DBT rate on taxable component" value="17%" sub="Adult non-tax dependant planning rate" tone="violet" />
        <Metric label="DBT saved / full wash" value={money(15_683.86)} sub="$92,258 taxable component removed" tone="green" />
        <Metric label="Pool C DBT exposure" value="$0" sub="External estate capital; ordinary tax rules remain" />
      </div>
      <section className="panel">
        <div className="panel-head"><div><h3>NCC wash simulator</h3><p>Separate-interest method: commute from the original taxable interest; recontribute $130k as a distinct tax-free interest.</p></div><Badge tone="modelled">Current-law mechanics</Badge></div>
        <div className="wash-layout">
          <div className="control-panel inline"><label><span>Completed wash cycles <b>{washCycles}</b></span><input type="range" min="0" max="7" step="1" value={washCycles} onChange={(e) => setWashCycles(Number(e.target.value))} /></label><div className="cycle-dots">{Array.from({ length: 7 }, (_, i) => <i key={i} className={i < washCycles ? "done" : ""}>{i + 1}</i>)}</div></div>
          <div className="wash-result"><div><span>Modelled DBT saved</span><strong>{money(dbtSaved)}</strong></div><div><span>Remaining DBT</span><strong>{money(dbtRemaining)}</strong></div><div><span>Taxable component remaining</span><strong>{money(taxableRemaining)}</strong></div></div>
        </div>
        <div className="note"><b>Execution dependency:</b> if the clean NCC money is merged back into the original interest, the pool re-blends and later washes become less effective. The separate-interest implementation is essential.</div>
      </section>
      <section className="panel estate-composition">
        <div><h3>Selected gross estate at {targetAge}</h3><strong>{money(estate)}</strong><p>{money(endCapital)} investments + {money(homeValue)} home.</p></div>
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
      <div className="benchmark-hero"><div><span>Defensible overall band</span><strong>Top 5–10%</strong><p>Australian retirement security and structure. Precision beyond this band would be false accuracy.</p></div><div><span>Economic-equivalence frame</span><strong>~$3.19m</strong><p>Illustrative pension replacement value + flexible capital + home; not liquid wealth or estate value.</p></div></div>
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
    const deltas = reviewSnapshot ? [
      { label: "Annual spending", value: spend - reviewSnapshot.spend, format: money },
      { label: "Real return assumption", value: realReturn - reviewSnapshot.realReturn, format: (value: number) => pct(value, 1) },
      { label: `Capital @${targetAge}`, value: endCapital - reviewSnapshot.endCapital, format: money },
      { label: `Estate @${targetAge}`, value: estate - reviewSnapshot.estate, format: money },
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
          <section className="panel"><div className="panel-head"><div><h3>Current baseline</h3><p>Settings that will be handed to V23.</p></div><Badge tone={railKey === "A" ? "modelled" : "exact"}>Rail {railKey}</Badge></div><dl className="review-baseline"><div><dt>Spending</dt><dd>{money(spend)}</dd></div><div><dt>Return</dt><dd>{pct(realReturn, 1)}</dd></div><div><dt>Target</dt><dd>Age {targetAge}</dd></div><div><dt>Home</dt><dd>{money(homeValue)}</dd></div></dl><a className="primary wide-link" href={deepModelUrl} target="_blank" rel="noreferrer">Review this baseline in V23 ↗</a></section>
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
      <section className="panel"><div className="panel-head"><div><h3>Known mismatch controls</h3><p>Explicitly resolved in this integrated view.</p></div><Badge tone="good">Controlled</Badge></div><div className="control-register"><div><b>DBT component source</b><p>Use the 60/40 lump split: 29.03% tax-free / 70.97% taxable-taxed / 0% untaxed. Do not apply the PSS statement’s 19/38/44 whole-interest split to Pool A/B.</p></div><div><b>July PSS uplift</b><p>Visible in Rail B without overwriting Rail A’s workbook values.</p></div><div><b>Gross vs net</b><p>Gross pension, net pension, net spending and salary gross-equivalent are distinct fields everywhere.</p></div><div><b>Real vs nominal</b><p>Retirement scenarios use real dollars and real returns. The pre-60 sensitivity block is separately labelled nominal.</p></div></div></section>
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
          <a className="deep-link" href={deepModelUrl} target="_blank" rel="noreferrer"><span>Full V23 model</span><small>Opens with this rail, return, spending and target age</small><b>Continue exact scenario ↗</b></a>
          <div className="version">Baseline 2026-07-18 · integrated v2</div>
        </aside>
        <main className="content">{content}</main>
      </div>
      <nav className="mobile-dock" aria-label="Primary mobile navigation">{[["overview", "Home"], ["scenario", "Adjust"], ["compare", "Compare"], ["risk", "Risk"], ["review", "Review"]].map(([key, label]) => <button key={key} aria-current={section === key ? "page" : undefined} className={section === key ? "active" : ""} onClick={() => go(key as SectionKey)}>{label}</button>)}</nav>
    </div>
  );
}
