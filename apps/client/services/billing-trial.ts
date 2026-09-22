type IntroPrice = {
  price: number;
  periodUnit: string;
  periodNumberOfUnits: number;
  cycles: number;
};

/** A trial claim is safe only when the store offers it to this customer. */
export function eligibleTrialDays(intro: IntroPrice | null | undefined, eligible: boolean): number | undefined {
  if (!eligible || !intro || intro.price !== 0 || intro.periodUnit !== 'DAY') return undefined;
  const days = intro.periodNumberOfUnits * intro.cycles;
  return Number.isInteger(days) && days > 0 ? days : undefined;
}
