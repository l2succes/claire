import { eligibleTrialDays } from '../services/billing-trial';

describe('billing trial copy', () => {
  const threeDayOffer = { price: 0, periodUnit: 'DAY', periodNumberOfUnits: 3, cycles: 1 };

  it('shows the duration only for a confirmed eligible free trial', () => {
    expect(eligibleTrialDays(threeDayOffer, true)).toBe(3);
    expect(eligibleTrialDays(threeDayOffer, false)).toBeUndefined();
  });

  it('does not call paid or unknown introductory offers free', () => {
    expect(eligibleTrialDays({ ...threeDayOffer, price: 1.99 }, true)).toBeUndefined();
    expect(eligibleTrialDays(null, true)).toBeUndefined();
    expect(eligibleTrialDays({ ...threeDayOffer, periodUnit: 'MONTH' }, true)).toBeUndefined();
  });
});
