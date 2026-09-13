export type HostplusSyncOptionKey = "australian-shares-indexed" | "international-shares-indexed";
export type HostplusSyncProjectionKey = "base" | "prudent" | "lowReturn";

export type ExternalHostplusRetirementSyncPack = {
  schemaVersion: 1;
  generatedAt: string;
  sourceSystem: "hostplus-command-centre";
  asOf: string;
  confirmedBalance: number;
  retirementDate: string;
  targetAllocation: Record<HostplusSyncOptionKey, number>;
  projections: Record<HostplusSyncProjectionKey, {
    nominalReturn: number;
    projectedBalance: number;
  }>;
  futureContributionSettings: {
    nextContributionDate: string;
    currentPersonalPerFortnight: number;
    salarySacrificeStartDate: string | null;
    grossSalarySacrificePerFortnight: number;
    phase3Date: string;
    phase3TotalPerFortnight: number;
    concessionalTaxRate: number;
  };
  provenance: {
    snapshotSource: "hostplus-confirmed" | "manual" | "imported";
    note: string;
  };
};

export type HostplusSyncReview = {
  pack: ExternalHostplusRetirementSyncPack;
  selectedProjection: HostplusSyncProjectionKey;
  projectedHostplusAtRetirement: number;
  currentConfirmedBalance: number;
  warnings: string[];
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function finiteNonNegative(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0;
}

function validDate(value: unknown): value is string {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(parsed.valueOf()) && parsed.toISOString().slice(0, 10) === value;
}

function readProjection(value: unknown, field: string) {
  if (!isRecord(value)) throw new Error(`${field} must be an object`);
  const nominalReturn = value.nominalReturn;
  const projectedBalance = value.projectedBalance;
  if (typeof nominalReturn !== "number" || !Number.isFinite(nominalReturn) || nominalReturn <= -1) {
    throw new Error(`${field}.nominalReturn must be finite and greater than -100%`);
  }
  if (!finiteNonNegative(projectedBalance)) throw new Error(`${field}.projectedBalance must be finite and non-negative`);
  return { nominalReturn, projectedBalance };
}

export function parseExternalHostplusRetirementSyncPack(input: unknown): ExternalHostplusRetirementSyncPack {
  if (!isRecord(input)) throw new Error("Hostplus sync pack must be an object");
  if (input.schemaVersion !== 1) throw new Error("Unsupported Hostplus sync-pack schema version");
  if (input.sourceSystem !== "hostplus-command-centre") throw new Error("Unexpected Hostplus sync-pack source system");
  if (typeof input.generatedAt !== "string" || Number.isNaN(Date.parse(input.generatedAt))) throw new Error("generatedAt must be an ISO timestamp");
  if (!validDate(input.asOf)) throw new Error("asOf must be a valid YYYY-MM-DD date");
  if (!validDate(input.retirementDate)) throw new Error("retirementDate must be a valid YYYY-MM-DD date");
  if (!finiteNonNegative(input.confirmedBalance)) throw new Error("confirmedBalance must be finite and non-negative");

  if (!isRecord(input.targetAllocation)) throw new Error("targetAllocation must be an object");
  const australianWeight = input.targetAllocation["australian-shares-indexed"];
  const internationalWeight = input.targetAllocation["international-shares-indexed"];
  if (typeof australianWeight !== "number" || typeof internationalWeight !== "number") throw new Error("Target allocation must contain both indexed options");
  if (australianWeight < 0 || australianWeight > 1 || internationalWeight < 0 || internationalWeight > 1) throw new Error("Target allocation weights must be in [0,1]");
  if (Math.abs(australianWeight + internationalWeight - 1) > 0.0001) throw new Error("Target allocation weights must total 1");

  if (!isRecord(input.projections)) throw new Error("projections must be an object");
  const projections = {
    base: readProjection(input.projections.base, "projections.base"),
    prudent: readProjection(input.projections.prudent, "projections.prudent"),
    lowReturn: readProjection(input.projections.lowReturn, "projections.lowReturn"),
  };

  if (!isRecord(input.futureContributionSettings)) throw new Error("futureContributionSettings must be an object");
  const contribution = input.futureContributionSettings;
  if (!validDate(contribution.nextContributionDate)) throw new Error("nextContributionDate must be a valid date");
  if (contribution.salarySacrificeStartDate !== null && !validDate(contribution.salarySacrificeStartDate)) throw new Error("salarySacrificeStartDate must be null or a valid date");
  if (!validDate(contribution.phase3Date)) throw new Error("phase3Date must be a valid date");
  for (const [field, value] of [
    ["currentPersonalPerFortnight", contribution.currentPersonalPerFortnight],
    ["grossSalarySacrificePerFortnight", contribution.grossSalarySacrificePerFortnight],
    ["phase3TotalPerFortnight", contribution.phase3TotalPerFortnight],
  ] as const) {
    if (!finiteNonNegative(value)) throw new Error(`${field} must be finite and non-negative`);
  }
  if (typeof contribution.concessionalTaxRate !== "number" || contribution.concessionalTaxRate < 0 || contribution.concessionalTaxRate > 1) {
    throw new Error("concessionalTaxRate must be in [0,1]");
  }

  if (!isRecord(input.provenance)) throw new Error("provenance must be an object");
  if (!(["hostplus-confirmed", "manual", "imported"] as const).includes(input.provenance.snapshotSource as never)) {
    throw new Error("Unexpected provenance.snapshotSource");
  }
  if (typeof input.provenance.note !== "string") throw new Error("provenance.note must be a string");

  return {
    schemaVersion: 1,
    generatedAt: input.generatedAt as string,
    sourceSystem: "hostplus-command-centre",
    asOf: input.asOf as string,
    confirmedBalance: input.confirmedBalance as number,
    retirementDate: input.retirementDate as string,
    targetAllocation: {
      "australian-shares-indexed": australianWeight,
      "international-shares-indexed": internationalWeight,
    },
    projections,
    futureContributionSettings: {
      nextContributionDate: contribution.nextContributionDate as string,
      currentPersonalPerFortnight: contribution.currentPersonalPerFortnight as number,
      salarySacrificeStartDate: contribution.salarySacrificeStartDate as string | null,
      grossSalarySacrificePerFortnight: contribution.grossSalarySacrificePerFortnight as number,
      phase3Date: contribution.phase3Date as string,
      phase3TotalPerFortnight: contribution.phase3TotalPerFortnight as number,
      concessionalTaxRate: contribution.concessionalTaxRate as number,
    },
    provenance: {
      snapshotSource: input.provenance.snapshotSource as ExternalHostplusRetirementSyncPack["provenance"]["snapshotSource"],
      note: input.provenance.note as string,
    },
  };
}

export function reviewExternalHostplusSyncPack(
  input: unknown,
  selectedProjection: HostplusSyncProjectionKey = "base",
): HostplusSyncReview {
  const pack = parseExternalHostplusRetirementSyncPack(input);
  const warnings: string[] = [];
  if (pack.provenance.snapshotSource !== "hostplus-confirmed") warnings.push("The current balance is not classified as Hostplus-confirmed.");
  if (pack.futureContributionSettings.salarySacrificeStartDate === null && pack.futureContributionSettings.grossSalarySacrificePerFortnight > 0) {
    warnings.push("Salary sacrifice is planned but no live implementation start date is confirmed.");
  }
  if (pack.projections[selectedProjection].projectedBalance < pack.confirmedBalance) {
    warnings.push("Selected projected retirement balance is below the current confirmed balance; inspect assumptions before use.");
  }
  return {
    pack,
    selectedProjection,
    projectedHostplusAtRetirement: pack.projections[selectedProjection].projectedBalance,
    currentConfirmedBalance: pack.confirmedBalance,
    warnings,
  };
}

/**
 * Deliberately does not mutate retirement-core constants.
 * The caller must surface a reviewed sync pack and explicitly elect to use its
 * projection in a scenario. CSC/PSS provider-source values are outside this contract.
 */
export function hostplusProjectionFromReviewedSync(review: HostplusSyncReview) {
  return review.projectedHostplusAtRetirement;
}
