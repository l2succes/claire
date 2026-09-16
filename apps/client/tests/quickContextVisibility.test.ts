import { shouldShowQuickContext } from '../features/chat/quick-context';

const baseline = {
  hasContextCard: false,
  needsRelationshipContext: true,
  clarificationDismissed: false,
  replyOptionsOpen: false,
  loopLoading: false,
  hasOpenLoop: false,
};

describe('quick conversation context visibility', () => {
  it('shows the setup prompt before relationship context is configured', () => {
    expect(shouldShowQuickContext(baseline)).toBe(true);
  });

  it('goes away after the setup prompt is satisfied or dismissed', () => {
    expect(shouldShowQuickContext({ ...baseline, needsRelationshipContext: false })).toBe(false);
    expect(shouldShowQuickContext({ ...baseline, clarificationDismissed: true })).toBe(false);
  });

  it('shows a generated context card before setup has been dismissed', () => {
    expect(shouldShowQuickContext({
      ...baseline,
      hasContextCard: true,
      needsRelationshipContext: false,
    })).toBe(true);
  });

  it('hides old generated cards after relationship context is configured', () => {
    expect(shouldShowQuickContext({
      ...baseline,
      hasContextCard: true,
      needsRelationshipContext: false,
      clarificationDismissed: true,
    })).toBe(false);
  });

  it('yields the strip to an open loop or reply options', () => {
    expect(shouldShowQuickContext({ ...baseline, hasOpenLoop: true })).toBe(false);
    expect(shouldShowQuickContext({ ...baseline, replyOptionsOpen: true })).toBe(false);
  });
});
