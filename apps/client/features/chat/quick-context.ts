export interface QuickContextVisibilityInput {
  hasContextCard: boolean;
  hasSavedRelationshipContext: boolean;
  needsRelationshipContext: boolean;
  clarificationDismissed: boolean;
  replyOptionsOpen: boolean;
  loopLoading: boolean;
  hasOpenLoop: boolean;
}

/**
 * The blue strip starts as onboarding or generated insight. Once relationship
 * context is saved, it becomes a concise confirmation of what Claire will
 * remember until the person explicitly dismisses it.
 */
export function shouldShowQuickContext(input: QuickContextVisibilityInput): boolean {
  // Saving relationship context dismisses the whole strip, including any
  // older smart card generated while the conversation was being set up. The
  // stored context still informs Claire without becoming permanent chrome.
  const hasSomethingToShow = !input.clarificationDismissed
    && (input.hasContextCard || input.needsRelationshipContext || input.hasSavedRelationshipContext);

  return hasSomethingToShow
    && !input.replyOptionsOpen
    && !input.loopLoading
    && !input.hasOpenLoop;
}
