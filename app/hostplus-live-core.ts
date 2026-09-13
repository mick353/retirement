export const HOSTPLUS_LIVE_SCHEMA_VERSION = 1 as const;

export type HostplusOptionKey = "australian-shares-indexed" | "international-shares-indexed" | string;
export type SnapshotSource = "hostplus-confirmed" | "manual" | "imported";

export type HostplusHoldingSnapshot = {
  optionKey: HostplusOptionKey;
  label: string;
  units: number;
  unitPrice: number;
  balance?: number;
  balanceWeight?: number;
  futureTransactionWeight?: number;
};

export type HostplusSnapshot = {
  schemaVersion: typeof HOSTPLUS_LIVE_SCHEMA_VERSION;
  asOf: string; // YYYY-MM-DD, the Hostplus fund-price date.
  capturedAt?: string; // ISO timestamp for audit/provenance.
  source: SnapshotSource;
  totalBalance?: number;
  holdings: HostplusHoldingSnapshot[];
  notes?: string;
};

export type HostplusCashFlowKind =
  | "concessional-contribution"
  | "non-concessional-contribution"
  | "withdrawal"
  | "fee"
  | "insurance";

export type HostplusCashFlow = {
  date: string;
  kind: HostplusCashFlowKind;
  amount: number; // Always store a positive magnitude; kind determines direction.
  note?: string;
};

export type SnapshotReconciliation = {
  previousAsOf: string;
  currentAsOf: string;
  previousBalance: number;
  currentBalance: number;
  accountMovement: number;
  contributions: number;
  withdrawals: number;
  fees: number;
  insurance: number;
  netExternalCashFlow: number;
  investmentMovementBeforeCharges: number;
  investmentMovementAfterCharges: number;
  holdingUnitChanges: Array<{
    optionKey: HostplusOptionKey;
    previousUnits: number;
    currentUnits: number;
    unitChange: number;
  }>;
};

export type ContributionAllocation = {
  optionKey: HostplusOptionKey;
  weight: number; // decimal; allocations for a phase should total 1.
};

export type ContributionPhase = {
  id: string;
  startDate: string;
  endDate?: string; // inclusive. Omit for open-ended phase.
  grossSalarySacrificePerFortnight: number;
  directAfterTaxPerFortnight: number;
  allocation?: ContributionAllocation[];
};

export type ProjectionShock = {
  date: string;
  drawdown: number; // decimal: -0.30 means an instantaneous 30% fall.
  label?: string;
};

export type PointInTimeProjectionInput = {
  snapshot: HostplusSnapshot;
  retirementDate: string;
  nextContributionDate: string;
  phases: ContributionPhase[];
  nominalAnnualReturn: number;
  concessionalContributionTaxRate?: number;
  shocks?: ProjectionShock[];
};

export type ProjectionEvent = {
  date: string;
  kind: "contribution" | "shock" | "retirement";
  openingBalance: number;
  growthSincePreviousEvent: number;
  contributionGrossSalarySacrifice?: number;
  contributionNetSalarySacrifice?: number;
  contributionDirect?: number;
  contributionTotal?: number;
  shockReturn?: number;
  closingBalance: number;
  phaseId?: string;
  label?: string;
};

export type PointInTimeProjectionResult = {
  asOf: string;
  retirementDate: string;
  startingBalance: number;
  projectedBalanceAtRetirement: number;
  totalGrossSalarySacrifice: number;
  totalNetSalarySacrifice: number;
  totalDirectContributions: number;
  totalNetContributions: number;
  projectedInvestmentGrowth: number;
  eventCount: number;
  events: ProjectionEvent[];
};

export type RetirementSyncPack = {
  schemaVersion: typeof HOSTPLUS_LIVE_SCHEMA_VERSION;
  generatedFrom: "hostplus-live-core";
  asOf: string;
  confirmedBalance: number;
  projectedBalanceAtRetirement: number;
  retirementDate: string;
  nominalAnnualReturnAssumption: number;
  totalNetFutureContributions: number;
  targetAllocation: Array<{ optionKey: HostplusOptionKey; weight: number }>;
  evidence: {
    snapshotSource: SnapshotSource;
    snapshotCapturedAt?: string;
    note: string;
  };
};

const DAY_MS = 86_400_000;
const DAYS_PER_YEAR = 365.2425;

function requireFiniteNonNegative(value: number, field: string) {
  if (!Number.isFinite(value) || value < 0) throw new Error(`${field} must be a finite non-negative number`);
}

function parseDate(date: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new Error(`Expected YYYY-MM-DD date, received ${date}`);
  const parsed = new Date(`${date}T00:00:00Z`);
  if (Number.isNaN(parsed.valueOf()) || parsed.toISOString().slice(0, 10) !== date) {
    throw new Error(`Invalid calendar date: ${date}`);
  }
  return parsed;
}

function formatDate(date: Date) {
  return date.toISOString().slice(0, 10);
}

function addDays(date: Date, days: number) {
  return new Date(date.valueOf() + days * DAY_MS);
}

function daysBetween(from: Date, to: Date) {
  return Math.max(0, (to.valueOf() - from.valueOf()) / DAY_MS);
}

function growthFactor(annualReturn: number, days: number) {
  if (annualReturn <= -1) throw new Error("nominalAnnualReturn must be greater than -100%");
  return Math.pow(1 + annualReturn, days / DAYS_PER_YEAR);
}

export function snapshotBalance(snapshot: HostplusSnapshot) {
  validateSnapshot(snapshot);
  if (snapshot.totalBalance !== undefined) return snapshot.totalBalance;
  return snapshot.holdings.reduce((sum, holding) => sum + holding.units * holding.unitPrice, 0);
}

export function snapshotAllocation(snapshot: HostplusSnapshot) {
  const total = snapshotBalance(snapshot);
  if (total <= 0) return snapshot.holdings.map((holding) => ({ optionKey: holding.optionKey, weight: 0 }));
  return snapshot.holdings.map((holding) => ({
    optionKey: holding.optionKey,
    weight: (holding.balance ?? holding.units * holding.unitPrice) / total,
  }));
}

export function futureTransactionAllocation(snapshot: HostplusSnapshot) {
  const explicit = snapshot.holdings
    .filter((holding) => holding.futureTransactionWeight !== undefined)
    .map((holding) => ({ optionKey: holding.optionKey, weight: holding.futureTransactionWeight ?? 0 }));
  if (!explicit.length) return snapshotAllocation(snapshot);
  const total = explicit.reduce((sum, row) => sum + row.weight, 0);
  if (Math.abs(total - 1) > 0.0001) throw new Error(`Future transaction weights must total 1; received ${total}`);
  return explicit;
}

export function validateSnapshot(snapshot: HostplusSnapshot) {
  if (snapshot.schemaVersion !== HOSTPLUS_LIVE_SCHEMA_VERSION) throw new Error("Unsupported Hostplus live schema version");
  parseDate(snapshot.asOf);
  if (!snapshot.holdings.length) throw new Error("Snapshot must include at least one holding");
  for (const holding of snapshot.holdings) {
    requireFiniteNonNegative(holding.units, `${holding.optionKey}.units`);
    requireFiniteNonNegative(holding.unitPrice, `${holding.optionKey}.unitPrice`);
    if (holding.balance !== undefined) requireFiniteNonNegative(holding.balance, `${holding.optionKey}.balance`);
    if (holding.balanceWeight !== undefined && (holding.balanceWeight < 0 || holding.balanceWeight > 1)) {
      throw new Error(`${holding.optionKey}.balanceWeight must be between 0 and 1`);
    }
    if (holding.futureTransactionWeight !== undefined && (holding.futureTransactionWeight < 0 || holding.futureTransactionWeight > 1)) {
      throw new Error(`${holding.optionKey}.futureTransactionWeight must be between 0 and 1`);
    }
  }
  if (snapshot.totalBalance !== undefined) requireFiniteNonNegative(snapshot.totalBalance, "snapshot.totalBalance");
  return snapshot;
}

export function reconcileSnapshots(
  previous: HostplusSnapshot,
  current: HostplusSnapshot,
  cashFlows: HostplusCashFlow[] = [],
): SnapshotReconciliation {
  const previousBalance = snapshotBalance(previous);
  const currentBalance = snapshotBalance(current);
  if (parseDate(current.asOf) < parseDate(previous.asOf)) throw new Error("Current snapshot must not predate previous snapshot");

  let contributions = 0;
  let withdrawals = 0;
  let fees = 0;
  let insurance = 0;

  for (const flow of cashFlows) {
    requireFiniteNonNegative(flow.amount, `cashFlow(${flow.kind}).amount`);
    const date = parseDate(flow.date);
    if (date < parseDate(previous.asOf) || date > parseDate(current.asOf)) continue;
    if (flow.kind === "concessional-contribution" || flow.kind === "non-concessional-contribution") contributions += flow.amount;
    if (flow.kind === "withdrawal") withdrawals += flow.amount;
    if (flow.kind === "fee") fees += flow.amount;
    if (flow.kind === "insurance") insurance += flow.amount;
  }

  const netExternalCashFlow = contributions - withdrawals;
  const accountMovement = currentBalance - previousBalance;
  const investmentMovementAfterCharges = accountMovement - netExternalCashFlow;
  const investmentMovementBeforeCharges = investmentMovementAfterCharges + fees + insurance;

  const previousByKey = new Map(previous.holdings.map((holding) => [holding.optionKey, holding]));
  const currentByKey = new Map(current.holdings.map((holding) => [holding.optionKey, holding]));
  const optionKeys = [...new Set([...previousByKey.keys(), ...currentByKey.keys()])];
  const holdingUnitChanges = optionKeys.map((optionKey) => {
    const previousUnits = previousByKey.get(optionKey)?.units ?? 0;
    const currentUnits = currentByKey.get(optionKey)?.units ?? 0;
    return { optionKey, previousUnits, currentUnits, unitChange: currentUnits - previousUnits };
  });

  return {
    previousAsOf: previous.asOf,
    currentAsOf: current.asOf,
    previousBalance,
    currentBalance,
    accountMovement,
    contributions,
    withdrawals,
    fees,
    insurance,
    netExternalCashFlow,
    investmentMovementBeforeCharges,
    investmentMovementAfterCharges,
    holdingUnitChanges,
  };
}

function validateAllocation(allocation: ContributionAllocation[] | undefined) {
  if (!allocation?.length) return;
  const total = allocation.reduce((sum, row) => sum + row.weight, 0);
  if (allocation.some((row) => row.weight < 0 || row.weight > 1) || Math.abs(total - 1) > 0.0001) {
    throw new Error(`Contribution allocation must contain weights in [0,1] totalling 1; received ${total}`);
  }
}

function activePhase(phases: ContributionPhase[], date: string) {
  const when = parseDate(date);
  return phases.find((phase) => {
    const starts = parseDate(phase.startDate);
    const ends = phase.endDate ? parseDate(phase.endDate) : null;
    return when >= starts && (!ends || when <= ends);
  });
}

export function projectFromPointInTime(input: PointInTimeProjectionInput): PointInTimeProjectionResult {
  const startingBalance = snapshotBalance(input.snapshot);
  const start = parseDate(input.snapshot.asOf);
  const retirement = parseDate(input.retirementDate);
  let nextContribution = parseDate(input.nextContributionDate);
  if (retirement < start) throw new Error("retirementDate must not predate the snapshot");
  if (nextContribution < start) throw new Error("nextContributionDate must not predate the snapshot");
  const contributionTaxRate = input.concessionalContributionTaxRate ?? 0.15;
  if (contributionTaxRate < 0 || contributionTaxRate > 1) throw new Error("concessionalContributionTaxRate must be between 0 and 1");

  for (const phase of input.phases) {
    parseDate(phase.startDate);
    if (phase.endDate) parseDate(phase.endDate);
    requireFiniteNonNegative(phase.grossSalarySacrificePerFortnight, `${phase.id}.grossSalarySacrificePerFortnight`);
    requireFiniteNonNegative(phase.directAfterTaxPerFortnight, `${phase.id}.directAfterTaxPerFortnight`);
    validateAllocation(phase.allocation);
  }

  const shockMap = new Map<string, ProjectionShock[]>();
  for (const shock of input.shocks ?? []) {
    parseDate(shock.date);
    if (!Number.isFinite(shock.drawdown) || shock.drawdown <= -1) throw new Error("Shock drawdown must be finite and greater than -100%");
    shockMap.set(shock.date, [...(shockMap.get(shock.date) ?? []), shock]);
  }

  const eventDates = new Set<string>();
  while (nextContribution <= retirement) {
    eventDates.add(formatDate(nextContribution));
    nextContribution = addDays(nextContribution, 14);
  }
  for (const shock of input.shocks ?? []) {
    const date = parseDate(shock.date);
    if (date >= start && date <= retirement) eventDates.add(shock.date);
  }
  eventDates.add(input.retirementDate);

  const orderedDates = [...eventDates].sort();
  const events: ProjectionEvent[] = [];
  let balance = startingBalance;
  let cursor = start;
  let totalGrossSalarySacrifice = 0;
  let totalNetSalarySacrifice = 0;
  let totalDirectContributions = 0;

  for (const dateText of orderedDates) {
    const eventDate = parseDate(dateText);
    const openingBalance = balance;
    const days = daysBetween(cursor, eventDate);
    const grown = balance * growthFactor(input.nominalAnnualReturn, days);
    const growthSincePreviousEvent = grown - balance;
    balance = grown;

    const phase = activePhase(input.phases, dateText);
    let grossSalarySacrifice = 0;
    let netSalarySacrifice = 0;
    let direct = 0;
    let contributionTotal = 0;

    // A date is a contribution date if it lies on the 14-day cadence from nextContributionDate.
    const firstContribution = parseDate(input.nextContributionDate);
    const elapsedDays = Math.round(daysBetween(firstContribution, eventDate));
    const isContributionDate = eventDate >= firstContribution && elapsedDays % 14 === 0;

    if (isContributionDate && phase && eventDate <= retirement) {
      grossSalarySacrifice = phase.grossSalarySacrificePerFortnight;
      netSalarySacrifice = grossSalarySacrifice * (1 - contributionTaxRate);
      direct = phase.directAfterTaxPerFortnight;
      contributionTotal = netSalarySacrifice + direct;
      balance += contributionTotal;
      totalGrossSalarySacrifice += grossSalarySacrifice;
      totalNetSalarySacrifice += netSalarySacrifice;
      totalDirectContributions += direct;
    }

    const shocks = shockMap.get(dateText) ?? [];
    for (const shock of shocks) {
      const beforeShock = balance;
      balance *= 1 + shock.drawdown;
      events.push({
        date: dateText,
        kind: "shock",
        openingBalance: beforeShock,
        growthSincePreviousEvent: 0,
        shockReturn: shock.drawdown,
        closingBalance: balance,
        label: shock.label,
      });
    }

    if (isContributionDate && phase) {
      events.push({
        date: dateText,
        kind: "contribution",
        openingBalance,
        growthSincePreviousEvent,
        contributionGrossSalarySacrifice: grossSalarySacrifice,
        contributionNetSalarySacrifice: netSalarySacrifice,
        contributionDirect: direct,
        contributionTotal,
        closingBalance: balance,
        phaseId: phase.id,
      });
    } else if (dateText === input.retirementDate) {
      events.push({
        date: dateText,
        kind: "retirement",
        openingBalance,
        growthSincePreviousEvent,
        closingBalance: balance,
      });
    }
    cursor = eventDate;
  }

  const totalNetContributions = totalNetSalarySacrifice + totalDirectContributions;
  return {
    asOf: input.snapshot.asOf,
    retirementDate: input.retirementDate,
    startingBalance,
    projectedBalanceAtRetirement: balance,
    totalGrossSalarySacrifice,
    totalNetSalarySacrifice,
    totalDirectContributions,
    totalNetContributions,
    projectedInvestmentGrowth: balance - startingBalance - totalNetContributions,
    eventCount: events.length,
    events,
  };
}

export function buildRetirementSyncPack(
  projection: PointInTimeProjectionResult,
  input: PointInTimeProjectionInput,
): RetirementSyncPack {
  const allocation = input.phases
    .slice()
    .reverse()
    .find((phase) => phase.allocation?.length)?.allocation
    ?? futureTransactionAllocation(input.snapshot);
  return {
    schemaVersion: HOSTPLUS_LIVE_SCHEMA_VERSION,
    generatedFrom: "hostplus-live-core",
    asOf: input.snapshot.asOf,
    confirmedBalance: projection.startingBalance,
    projectedBalanceAtRetirement: projection.projectedBalanceAtRetirement,
    retirementDate: projection.retirementDate,
    nominalAnnualReturnAssumption: input.nominalAnnualReturn,
    totalNetFutureContributions: projection.totalNetContributions,
    targetAllocation: allocation.map(({ optionKey, weight }) => ({ optionKey, weight })),
    evidence: {
      snapshotSource: input.snapshot.source,
      snapshotCapturedAt: input.snapshot.capturedAt,
      note: "Live Hostplus balance is source data; retirement balance is a point-in-time projection and must not overwrite CSC/PSS provider sources.",
    },
  };
}
