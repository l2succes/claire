/**
 * Unread derivation for a seeded demo account.
 *
 * Seeded history is ingested as backfill, which deliberately increments no
 * unread counters — otherwise replaying three weeks of messages would fire a
 * push notification per message. The counts therefore have to be derived after
 * the fact, and this is the rule:
 *
 *   an unread count is the run of incoming messages at the end of a thread.
 *
 * That is what an unread badge actually means in a messaging app. A thread the
 * user answered last is read; a thread where the other person got the last word
 * shows however many messages they sent since.
 */

/**
 * A message row, as loosely typed as the untyped Supabase client returns it.
 * A missing `from_me` is treated as incoming, which errs toward showing a badge
 * rather than silently hiding a conversation.
 */
export interface UnreadCandidate {
  from_me?: boolean | null;
}

/**
 * Count the trailing run of incoming messages.
 *
 * `tail` is oldest-first. Anything the account owner sent ends the run, because
 * replying is what marks a conversation read.
 */
export function countTrailingIncoming(tail: UnreadCandidate[]): number {
  let count = 0;
  for (let index = tail.length - 1; index >= 0; index -= 1) {
    if (tail[index].from_me) break;
    count += 1;
  }
  return count;
}
