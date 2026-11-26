export const HOSTPLUS_STARTING_BALANCE = 24_522;
export const HOSTPLUS_BASELINE_RETURN = 0.08;

type ProjectionPeriod = {
  sacrificeFraction: number;
  directFraction: number;
  growthFraction: number;
};

// This is intentionally the same annual convention used in the governed
// HostplusProjection workbook. It is a planning projection, not a forecast.
const HOSTPLUS_WORKBOOK_PERIODS: ProjectionPeriod[] = [
  { sacrificeFraction: 0, directFraction: 0, growthFraction: 1 },
  { sacrificeFraction: 1, directFraction: 0, growthFraction: 1 },
  { sacrificeFraction: 0.75, directFraction: 0.25, growthFraction: 0.75 },
  { sacrificeFraction: 1, directFraction: 1, growthFraction: 1 },
  { sacrificeFraction: 1, directFraction: 1, growthFraction: 1 },
  { sacrificeFraction: 1, directFraction: 1, growthFraction: 1 },
  { sacrificeFraction: 1, directFraction: 1, growthFraction: 1 },
  { sacrificeFraction: 1, directFraction: 1, growthFraction: 1 },
  { sacrificeFraction: 0.5, directFraction: 0.5, growthFraction: 0.5 },
];

export function projectHostplusAt60(
  phase2SalarySacrificePerFortnight: number,
  phase3TotalPerFortnight: number,
  nominalReturn: number,
  startingBalance = HOSTPLUS_STARTING_BALANCE,
) {
  const directPhase3PerFortnight = Math.max(0, phase3TotalPerFortnight - phase2SalarySacrificePerFortnight);
  let balance = startingBalance;

  for (const period of HOSTPLUS_WORKBOOK_PERIODS) {
    const netConcessional = phase2SalarySacrificePerFortnight * 26 * period.sacrificeFraction * 0.85;
    const netNonConcessional = directPhase3PerFortnight * 26 * period.directFraction;
    const netAdded = netConcessional + netNonConcessional;
    const investmentGrowth = (balance * nominalReturn + netAdded * nominalReturn / 2) * period.growthFraction;
    balance += netAdded + investmentGrowth;
  }

  return balance;
}

export function abpMinimumRateAtAgeOn1July(age: number) {
  if (age < 65) return 0.04;
  if (age < 75) return 0.05;
  if (age < 80) return 0.06;
  if (age < 85) return 0.07;
  if (age < 90) return 0.09;
  if (age < 95) return 0.11;
  return 0.14;
}

export function firstFinancialYearMinimum(
  openingPensionBalance: number,
  ageAtCommencement: number,
  daysRemainingInFinancialYear = 192,
  daysInYear = 365,
) {
  return openingPensionBalance
    * abpMinimumRateAtAgeOn1July(ageAtCommencement)
    * (daysRemainingInFinancialYear / daysInYear);
}

const CALENDAR_DAY = 86_400_000;
export const PLANNED_RETIREMENT_DATE = "2033-12-21";
const calendarStamp = (stamp: number) => new Date(stamp).toISOString().slice(0, 10);

function calendarDate(value: string, label = "calendar date") {
  const stamp = Date.parse(`${value}T00:00:00.000Z`);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || value < "1900-01-01" || value > "9997-12-31"
    || !Number.isFinite(stamp) || calendarStamp(stamp) !== value) {
    throw new Error(`Enter a valid ${label}.`);
  }
  return stamp;
}

function financialYearEnd(stamp: number) {
  const date = new Date(stamp);
  return date.getUTCFullYear() + (date.getUTCMonth() >= 6 ? 1 : 0);
}

/** Schedule 7 illustration using a dated pension commencement and today's rates. */
export function firstPensionFinancialYear(openingBalance: number, age: number, commencement: string) {
  const start = calendarDate(commencement, "pension commencement date");
  const month = new Date(start).getUTCMonth();
  const endYear = financialYearEnd(start);
  const elapsedDays = (Date.UTC(endYear, 6, 1) - start) / CALENDAR_DAY;
  const financialYearDays = (Date.UTC(endYear, 6, 1) - Date.UTC(endYear - 1, 6, 1)) / CALENDAR_DAY;
  const raw = month === 5 ? 0 : firstFinancialYearMinimum(openingBalance, age, elapsedDays, financialYearDays);
  return { commencement, endDate: `${endYear}-06-30`, elapsedDays, financialYearDays, minimum: Math.round(raw / 10) * 10 };
}

export type RetirementCalendarInputs = {
  retirementDate: string;
  abpStart: string;
  abpOpening: number;
  abpAge: number;
  nextJulyBalance: number | null;
  nextJulyAge: number;
  firstPssPayday: string | null;
  annualLivingCosts: number;
  netPensionPerFortnight: number;
};

/** Two financial years, using current minimums and a user-supplied PSS schedule anchor. */
export function retirementPaymentCalendar(input: RetirementCalendarInputs) {
  const retire = calendarDate(input.retirementDate);
  const abpStart = calendarDate(input.abpStart);
  const firstPay = input.firstPssPayday ? calendarDate(input.firstPssPayday) : null;
  if (abpStart < retire || (firstPay !== null && firstPay < retire)) throw new Error("A pension start or first payday must be on or after retirement.");
  if ([input.abpOpening, input.annualLivingCosts, input.netPensionPerFortnight, input.nextJulyBalance ?? 0]
    .some(amount => !Number.isFinite(amount) || amount < 0)) throw new Error("Enter non-negative dollar amounts.");
  if ([input.abpAge, input.nextJulyAge].some(age => !Number.isInteger(age) || age < 0 || age > 120)) throw new Error("Enter whole ages between 0 and 120.");
  const baseYear = financialYearEnd(retire);
  return [baseYear, baseYear + 1].map(year => {
    const july = Date.UTC(year - 1, 6, 1);
    const end = Date.UTC(year, 6, 1);
    const from = Math.max(retire, july);
    const days = (end - from) / CALENDAR_DAY;
    const yearDays = (end - july) / CALENDAR_DAY;
    const interval = 14 * CALENDAR_DAY;
    const dates: string[] = [];
    if (firstPay !== null) {
      const firstInYear = firstPay + Math.max(0, Math.ceil((from - firstPay) / interval)) * interval;
      for (let stamp = firstInYear; stamp < end; stamp += interval) dates.push(calendarStamp(stamp));
    }
    const firstYear = abpStart >= from && abpStart < end;
    const minimum = firstYear ? firstPensionFinancialYear(input.abpOpening, input.abpAge, input.abpStart).minimum
      : abpStart < from && input.nextJulyBalance !== null
        ? firstPensionFinancialYear(input.nextJulyBalance, input.nextJulyAge, calendarStamp(july)).minimum
        : null;
    return {
      from: calendarStamp(from), to: calendarStamp(end - CALENDAR_DAY), days, yearDays,
      livingCosts: input.annualLivingCosts * days / yearDays,
      pssDates: firstPay === null ? null : dates,
      estimatedPssPayments: firstPay === null ? null : dates.length * input.netPensionPerFortnight,
      abpMinimum: minimum, abpBasis: firstYear ? "commencement" : abpStart >= end ? "starts-later" : "july-balance",
    };
  });
}

export type PoolCSpendingPolicy = "preserve" | "after-abp" | "above-reserve";

export const COMMAND_CENTRE_DEFAULT_FLOOR = 500_000;
export const COMMAND_CENTRE_GOALS_STORAGE_KEY = "robinson-retirement-command-goals";

export function optionalNonNegative(value: unknown): number | null {
  if (typeof value !== "number" && (typeof value !== "string" || value.trim() === "")) return null;
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 ? number : null;
}

export function laterInvestmentCheckAge(value: unknown, targetAge: number): number | null {
  const age = optionalNonNegative(value);
  return age !== null && Number.isInteger(age) && age > targetAge && age <= 95 ? age : null;
}

export function poolCWithdrawalCapacity(balance: number, policy: PoolCSpendingPolicy, reserve: number | null) {
  if (policy === "after-abp") return Math.max(0, balance);
  return policy === "above-reserve" && reserve !== null && Number.isFinite(reserve) && reserve >= 0
    ? Math.max(0, balance - reserve) : 0;
}

export type PlanReceiptInput = {
  workspace: "v23" | "command-centre";
  modelRevision: string;
  source: string;
  sourceDate: string | null;
  poolCPolicy: PoolCSpendingPolicy;
  periodConvention: string;
  simulationSeed: number;
  assumptions: Record<string, unknown>;
};

export function planReceipt({ assumptions, ...about }: PlanReceiptInput) {
  const canonical = JSON.stringify({ ...about, modelRevision: undefined, assumptions }, (_key, value) => {
    if (!value || typeof value !== "object" || Array.isArray(value)) return value;
    return Object.fromEntries(Object.keys(value).sort().map(key => [key, value[key]]));
  });
  // A plan ID is a stable identifier for comparing saved inputs and exports.
  let hash = 0xcbf29ce484222325n;
  for (let i = 0; i < canonical.length; i += 1) {
    hash = BigInt.asUintN(64, (hash ^ BigInt(canonical.charCodeAt(i))) * 0x100000001b3n);
  }
  return { schema: 1, ...about, planId: `${about.workspace}-${hash.toString(16).padStart(16, "0")}` };
}

export const FUNDING_TOLERANCE = 0.005;

export function commandCentreSpend(amount: unknown) {
  const value = Number(amount);
  return Number.isFinite(value) ? Math.min(300_000, Math.max(76_000, value)) : 110_000;
}

export type SpendingYear = { age: number; capital: number; planned: number; funded: number };

/** Rows start with a capital-only opening snapshot and end on each birthday. */
export function assessSpending(rows: SpendingYear[], age: number, floor: number, essentials: number | null) {
  let checkpoint: SpendingYear | undefined;
  let planned = 0, funded = 0, years = 0;
  let firstBudgetMiss: SpendingYear | undefined, firstEssentialMiss: SpendingYear | undefined;
  for (const [index, row] of rows.entries()) {
    if (row.age > age) break;
    if (row.age === age) checkpoint = row;
    if (index === 0) continue;
    years += 1;
    planned += row.planned;
    funded += row.funded;
    if (row.planned - row.funded >= FUNDING_TOLERANCE) firstBudgetMiss ??= row;
    if (essentials !== null && essentials - row.funded >= FUNDING_TOLERANCE) firstEssentialMiss ??= row;
  }
  return {
    age, years, planned, funded, firstBudgetMiss, firstEssentialMiss,
    capital: checkpoint?.capital ?? null,
    floorMargin: checkpoint ? checkpoint.capital - floor : null,
  };
}

export type PathFundingCounts = {
  capital: number;
  lifestyle: number;
  lifestyleAndCapital: number;
  essentials: number;
  essentialsAndCapital: number;
};

export function fundingPathCounts(years: number): PathFundingCounts[] {
  return Array.from({ length: years }, () => ({
    capital: 0, lifestyle: 0, lifestyleAndCapital: 0, essentials: 0, essentialsAndCapital: 0,
  }));
}

export function countFundingPath(
  counts: PathFundingCounts[], path: SpendingYear[], floor: number, essentials: number | null,
) {
  let lifestyleMet = true;
  let essentialsMet = essentials !== null;
  for (let index = 1; index < path.length; index += 1) {
    const row = path[index];
    const result = counts[index];
    const capitalMet = row.capital >= floor;
    lifestyleMet &&= row.planned - row.funded < FUNDING_TOLERANCE;
    if (essentials !== null) essentialsMet &&= essentials - row.funded < FUNDING_TOLERANCE;
    if (capitalMet) result.capital += 1;
    if (lifestyleMet) result.lifestyle += 1;
    if (lifestyleMet && capitalMet) result.lifestyleAndCapital += 1;
    if (essentialsMet) result.essentials += 1;
    if (essentialsMet && capitalMet) result.essentialsAndCapital += 1;
  }
}

/**
 * Canonical retirement-engine domains.
 *
 * The framework-free core owns source-backed PSS inputs, retirement-day
 * opening positions, the flat comparable-spend ledger used by Command Centre
 * and Atlas, and PSS wash arithmetic. V23 retains its separate age-band,
 * Pool B, one-off and policy-aware workbench ledger until that richer domain
 * can be migrated with its own parity contract.
 */
export const RETIREMENT_ENGINE_VERSION = "2026-11-26.3";
export const TRANSFER_BALANCE_CAP = 2_100_000;
export const TRANSFER_BALANCE_BUFFER = 5_000;
export const HOSTPLUS_OPENING_ANCHOR = 317_447.66;
export const PSS_WASH_ANNUAL_LIMIT = 130_000;
export const POOL_C_MODELLED_DRAG = 0.0035;

export type PssElectionKey = "60-40" | "65-35" | "70-30" | "100";
export type PssProjectionBasisKey = "source-825" | "prudent-630";

export function pssEstimateDate(rail: "A" | "B", basis: PssProjectionBasisKey, election: PssElectionKey | null) {
  if (rail === "A") return "March 2026";
  return basis === "prudent-630" && election === "100" ? "9 September 2026" : "1 September 2026";
}

export type PssElection = {
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

export type PssProjectionBasis = {
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

export type RailBOpeningPosition = PssElection & {
  basisKey: PssProjectionBasisKey;
  basisLabel: string;
  hostplus: number;
  capital: number;
  dbSpecialValue: number;
  poolA: number;
  poolC: number;
  tbcHeadroom: number;
  tbcExcess: number;
  washTaxableShare: number;
  washEvidence: string;
};

export type WashInput = Pick<
  RailBOpeningPosition,
  "lumpSum" | "lumpTaxableTaxed" | "washTaxableShare"
>;

export type WashOutcome = {
  taxableStart: number;
  taxableRemaining: number;
  washed: number;
  applied: number[];
  maxCycles: number;
};

export const PSS_ELECTION_ORDER: readonly PssElectionKey[] = [
  "60-40",
  "65-35",
  "70-30",
  "100",
];

export const PSS_ELECTIONS: Record<PssElectionKey, PssElection> = {
  "60-40": { key: "60-40", label: "60% pension / 40% lump", pensionPercent: 60, lumpPercent: 40, grossPension: 91_776.03, netPensionPf: 3_316.93, netPension: 86_240.18, lumpSum: 673_024.21, lumpTaxFree: 160_278.23, lumpTaxableTaxed: 512_745.98, lumpTaxableUntaxed: 0, fas: 168_256.05, source: "1 Sep 2026 CSC iEstimator · 60/40" },
  "65-35": { key: "65-35", label: "65% pension / 35% lump", pensionPercent: 65, lumpPercent: 35, grossPension: 99_424.03, netPensionPf: 3_611.09, netPension: 93_888.34, lumpSum: 588_896.19, lumpTaxFree: 140_243.46, lumpTaxableTaxed: 448_652.73, lumpTaxableUntaxed: 0, fas: 168_256.05, source: "1 Sep 2026 CSC iEstimator · 65/35" },
  "70-30": { key: "70-30", label: "70% pension / 30% lump", pensionPercent: 70, lumpPercent: 30, grossPension: 107_072.03, netPensionPf: 3_905.24, netPension: 101_536.24, lumpSum: 504_768.16, lumpTaxFree: 120_208.67, lumpTaxableTaxed: 384_559.49, lumpTaxableUntaxed: 0, fas: 168_256.05, source: "1 Sep 2026 CSC iEstimator · 70/30" },
  "100": { key: "100", label: "100% pension / no lump", pensionPercent: 100, lumpPercent: 0, grossPension: 152_960.05, netPensionPf: 5_504.01, netPension: 143_104.26, lumpSum: 0, lumpTaxFree: 0, lumpTaxableTaxed: 0, lumpTaxableUntaxed: 0, fas: 168_256.05, source: "1 Sep 2026 CSC iEstimator · 100% pension" },
};

export const PSS_PRUDENT_ELECTIONS: Partial<Record<PssElectionKey, PssElection>> = {
  "60-40": { key: "60-40", label: "60% pension / 40% lump", pensionPercent: 60, lumpPercent: 40, grossPension: 88_571.01, netPensionPf: 3_102.79, netPension: 80_672.54, lumpSum: 649_520.78, lumpTaxFree: 177_975.75, lumpTaxableTaxed: 471_545.03, lumpTaxableUntaxed: 0, fas: 162_380.20, source: "1 Sep 2026 CSC iEstimator · 60/40 · 6/5/3" },
  "65-35": { key: "65-35", label: "65% pension / 35% lump", pensionPercent: 65, lumpPercent: 35, grossPension: 95_951.93, netPensionPf: 3_386.67, netPension: 88_053.42, lumpSum: 568_330.69, lumpTaxFree: 155_728.77, lumpTaxableTaxed: 412_601.91, lumpTaxableUntaxed: 0, fas: 162_380.20, source: "1 Sep 2026 CSC iEstimator · 65/35 · 6/5/3" },
  "70-30": { key: "70-30", label: "70% pension / 30% lump", pensionPercent: 70, lumpPercent: 30, grossPension: 103_332.85, netPensionPf: 3_670.55, netPension: 95_434.30, lumpSum: 487_140.59, lumpTaxFree: 133_481.80, lumpTaxableTaxed: 353_658.78, lumpTaxableUntaxed: 0, fas: 162_380.20, source: "1 Sep 2026 CSC iEstimator · 70/30 · 6/5/3" },
  "100": { key: "100", label: "100% pension / no lump", pensionPercent: 100, lumpPercent: 0, grossPension: 147_713.96, netPensionPf: 5_214.45, netPension: 135_575.70, lumpSum: 0, lumpTaxFree: 0, lumpTaxableTaxed: 0, lumpTaxableUntaxed: 0, fas: 162_485.36, source: "9 Sep 2026 CSC iEstimator · 100% pension · 6/5/3" },
};

export const PSS_PROJECTION_BASES: Record<PssProjectionBasisKey, PssProjectionBasis> = {
  "source-825": {
    key: "source-825", label: "Current CSC source basis", shortLabel: "8.2 / 5 / 2.5",
    fundEarnings: 0.082, salaryGrowth: 0.05, cpi: 0.025,
    realFundEarnings: (1.082 / 1.025) - 1, realSalaryGrowth: (1.05 / 1.025) - 1,
    sourceStatus: "source-backed", sourceDate: "1 September 2026", elections: PSS_ELECTIONS,
    note: "All four election outputs and their tax components are read directly from the active CSC iEstimator PDFs.",
  },
  "prudent-630": {
    key: "prudent-630", label: "Prudent sensitivity basis", shortLabel: "6 / 5 / 3",
    fundEarnings: 0.06, salaryGrowth: 0.05, cpi: 0.03,
    realFundEarnings: (1.06 / 1.03) - 1, realSalaryGrowth: (1.05 / 1.03) - 1,
    sourceStatus: "source-backed", sourceDate: "1 and 9 September 2026", elections: PSS_PRUDENT_ELECTIONS,
    note: "All four elections are direct CSC outputs. The 60/40, 65/35 and 70/30 estimates use the 1 September snapshot and FAS $162,380.20; the 100% pension estimate uses the later 9 September snapshot and FAS $162,485.36.",
  },
};

export const RAIL_A_SOURCE = {
  grossPension: 78_382.04,
  netPension: 76_041.68,
  lumpSum: 574_801.66,
  hostplus: HOSTPLUS_OPENING_ANCHOR,
  capital: 892_249.32,
  dbSpecialValue: 1_254_112.64,
  poolA: 840_887.36,
  poolC: 51_361.96,
  fas: 143_700.42,
  lumpTaxFree: 141_581.47,
  lumpTaxableTaxed: 433_220.2,
  lumpTaxableUntaxed: 0,
  tbcHeadroom: 845_887.36,
  tbcExcess: 0,
  washTaxableShare: 433_220.2 / 574_801.66,
} as const;

export function normaliseProjectionBasis(value: unknown): PssProjectionBasisKey {
  return value === "prudent-630" ? "prudent-630" : "source-825";
}

export function electionKeysForBasis(basisKey: PssProjectionBasisKey): PssElectionKey[] {
  const elections = PSS_PROJECTION_BASES[basisKey].elections;
  return PSS_ELECTION_ORDER.filter((key) => Boolean(elections[key]));
}

export function normaliseElectionForBasis(
  basisKey: PssProjectionBasisKey,
  value: unknown,
): PssElectionKey {
  const requested = PSS_ELECTION_ORDER.includes(value as PssElectionKey)
    ? value as PssElectionKey
    : "60-40";
  const elections = PSS_PROJECTION_BASES[basisKey].elections;
  return elections[requested] ? requested : electionKeysForBasis(basisKey)[0] ?? "60-40";
}

export function railBOpeningPosition(
  requestedElection: PssElectionKey,
  requestedBasis: PssProjectionBasisKey = "source-825",
): RailBOpeningPosition {
  const basisKey = normaliseProjectionBasis(requestedBasis);
  const basis = PSS_PROJECTION_BASES[basisKey];
  const electionKey = normaliseElectionForBasis(basisKey, requestedElection);
  const election = basis.elections[electionKey];
  if (!election) throw new Error(`PSS projection basis ${basisKey} has no verified elections`);
  const capital = election.lumpSum + HOSTPLUS_OPENING_ANCHOR;
  const dbSpecialValue = election.grossPension * 16;
  const tbcHeadroom = Math.max(0, TRANSFER_BALANCE_CAP - dbSpecialValue);
  const poolA = Math.min(capital, Math.max(0, tbcHeadroom - TRANSFER_BALANCE_BUFFER));
  const poolC = capital - poolA;
  const washTaxableShare = election.lumpSum > 0
    ? election.lumpTaxableTaxed / election.lumpSum
    : 0;
  return {
    ...election,
    basisKey,
    basisLabel: basis.label,
    hostplus: HOSTPLUS_OPENING_ANCHOR,
    capital,
    dbSpecialValue,
    poolA,
    poolC,
    tbcHeadroom,
    tbcExcess: Math.max(0, dbSpecialValue - TRANSFER_BALANCE_CAP),
    washTaxableShare,
    washEvidence: election.lumpSum > 0
      ? `Direct CSC component split from the selected election's provider estimate: ${(washTaxableShare * 100).toFixed(2)}% taxable-taxed, ${((election.lumpTaxFree / election.lumpSum) * 100).toFixed(2)}% tax-free and 0% untaxed. Washing is limited to the original PSS lump; Hostplus components remain unresolved.`
      : "The 100% pension election has no PSS lump sum and therefore no PSS lump component available for NCC washing.",
  };
}

export function calculateWashOutcome(
  rail: WashInput,
  cycles: number,
  annualAmount = PSS_WASH_ANNUAL_LIMIT,
): WashOutcome {
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
  return {
    taxableStart: rail.lumpTaxableTaxed,
    taxableRemaining: taxable,
    washed,
    applied,
    maxCycles: rail.lumpSum > 0 ? Math.ceil(rail.lumpSum / annualAmount) : 0,
  };
}

/**
 * Deterministic flat-spend retirement comparison ledger.
 *
 * This is deliberately narrower than V23: it has a flat real annual spend,
 * two retirement pools and mandatory ABP draw rules. Pool C is a reserve
 * unless the caller explicitly uses it to cover a spending gap.
 * It gives Command Centre and its visual explorer one audited result for equivalent
 * scenarios without pretending to replace V23's age-banded workbench.
 */
export type FlatRetirementLedgerInput = {
  poolA: number;
  poolC: number;
  netPension: number;
  spend: number;
  realReturn: number;
  poolCDrag?: number;
  drawPoolCForShortfall?: boolean;
  startAge?: number;
  endAge?: number;
  annualReturns?: readonly number[];
};

export type FlatRetirementLedgerRow = {
  age: number;
  isOpening: boolean;
  annualReturn: number;
  openingPoolA: number;
  openingPoolC: number;
  opening: number;
  pension: number;
  mandatoryDraw: number;
  lifestyleGap: number;
  draw: number;
  poolCDraw?: number;
  spend: number;
  fundedSpend: number;
  shortfall: number;
  reinvestment: number;
  externalTaxDrag: number;
  investmentGrowth: number;
  netIncome: number;
  poolA: number;
  poolC: number;
  ending: number;
};

export function calculateFlatRetirementLedger(input: FlatRetirementLedgerInput): FlatRetirementLedgerRow[] {
  const startAge = input.startAge ?? 60;
  const endAge = input.endAge ?? 95;
  const poolCDrag = input.poolCDrag ?? POOL_C_MODELLED_DRAG;
  let poolA = input.poolA;
  let poolC = input.poolC;
  const rows: FlatRetirementLedgerRow[] = [{
    age: startAge,
    isOpening: true,
    annualReturn: 0,
    openingPoolA: poolA,
    openingPoolC: poolC,
    opening: poolA + poolC,
    pension: 0,
    mandatoryDraw: 0,
    lifestyleGap: 0,
    draw: 0,
    ...(input.drawPoolCForShortfall ? { poolCDraw: 0 } : {}),
    spend: 0,
    fundedSpend: 0,
    shortfall: 0,
    reinvestment: 0,
    externalTaxDrag: 0,
    investmentGrowth: 0,
    netIncome: 0,
    poolA,
    poolC,
    ending: poolA + poolC,
  }];

  for (let age = startAge + 1; age <= endAge; age += 1) {
    const annualReturn = input.annualReturns?.[age - startAge - 1] ?? input.realReturn;
    const openingPoolA = poolA;
    const openingPoolC = poolC;
    const poolABeforeDraw = openingPoolA * (1 + annualReturn);
    const mandatoryDraw = openingPoolA * abpMinimumRateAtAgeOn1July(Math.max(0, age - 1));
    const lifestyleGap = Math.max(0, input.spend - input.netPension);
    // Retain the opening-balance cap on gains and respect available capital on losses.
    const draw = Math.min(openingPoolA, Math.max(0, poolABeforeDraw), Math.max(mandatoryDraw, lifestyleGap));
    const incomeBeforePoolC = input.netPension + draw;
    const externalTaxDrag = openingPoolC * poolCDrag;
    const poolCBeforeDraw = openingPoolC * (1 + annualReturn) - externalTaxDrag;
    // Match Pool A's withdrawal timing: available opening capital, with a
    // further cap so an adverse return cannot leave an unfunded withdrawal.
    const poolCDraw = input.drawPoolCForShortfall
      ? Math.min(openingPoolC, Math.max(0, poolCBeforeDraw), Math.max(0, input.spend - incomeBeforePoolC))
      : 0;
    const netIncome = incomeBeforePoolC + poolCDraw;
    const fundedSpend = Math.min(input.spend, netIncome);
    const shortfall = Math.max(0, input.spend - netIncome);
    const reinvestment = Math.max(0, netIncome - input.spend);
    const investmentGrowth = (openingPoolA + openingPoolC) * annualReturn - externalTaxDrag;
    poolA = Math.max(0, poolABeforeDraw - draw);
    poolC = Math.max(0, poolCBeforeDraw + reinvestment - poolCDraw);
    rows.push({
      age,
      isOpening: false,
      annualReturn,
      openingPoolA,
      openingPoolC,
      opening: openingPoolA + openingPoolC,
      pension: input.netPension,
      mandatoryDraw,
      lifestyleGap,
      draw,
      ...(input.drawPoolCForShortfall ? { poolCDraw } : {}),
      spend: input.spend,
      fundedSpend,
      shortfall,
      reinvestment,
      externalTaxDrag,
      investmentGrowth,
      netIncome,
      poolA,
      poolC,
      ending: poolA + poolC,
    });
  }
  return rows;
}
