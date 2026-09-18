export interface QuickContextVisibilityInput {
  hasContextCard: boolean;
  needsRelationshipContext: boolean;
  clarificationDismissed: boolean;
  replyOptionsOpen: boolean;
  loopLoading: boolean;
  hasOpenLoop: boolean;
}

/**
 * The blue strip is an onboarding or generated-insight surface, not a permanent
 * profile summary. Once relationship context has been saved (or the prompt was
 * dismissed), the stored context still informs Claire without occupying space
 * above every conversation.
 */
export function shouldShowQuickContext(input: QuickContextVisibilityInput): boolean {
  // Saving relationship context dismisses the whole strip, including any
  // older smart card generated while the conversation was being set up. The
  // stored context still informs Claire without becoming permanent chrome.
  const hasSomethingToShow = !input.clarificationDismissed
    && (input.hasContextCard || input.needsRelationshipContext);

  return hasSomethingToShow
    && !input.replyOptionsOpen
    && !input.loopLoading
    && !input.hasOpenLoop;
}
