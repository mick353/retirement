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
