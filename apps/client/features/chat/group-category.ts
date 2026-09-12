/**
 * Copy for an inferred group category.
 *
 * Kept as data in one place because the same classification drives two very
 * different surfaces: a two-word tag on an inbox row, and a sentence in the
 * banner that has to justify turning Claire on. Splitting them would let the
 * two drift into describing different things.
 */
import {
  CATEGORY_DISPLAY_THRESHOLD,
  RECOMMENDED_GROUP_CATEGORIES,
  type GroupCategory,
} from '../../types/conversationSettings';

interface CategoryCopy {
  /** Short tag for the inbox row. */
  tag: string;
  /** What Claire would do in a room like this, addressed to the user. */
  pitch: string;
}

const COPY: Record<GroupCategory, CategoryCopy> = {
  work: {
    tag: 'Work',
    pitch: 'Claire can track action items and what you owe here.',
  },
  planning: {
    tag: 'Planning',
    pitch: "Claire can keep the dates, bookings and who's doing what straight.",
  },
  family: {
    tag: 'Family',
    pitch: 'Claire can summarise what you missed and draft replies.',
  },
  friends: {
    tag: 'Friends',
    pitch: 'Claire can summarise what you missed and draft replies.',
  },
  community: {
    tag: 'Community',
    pitch: 'Claire can summarise what you missed.',
  },
  announcement: {
    tag: 'Updates',
    pitch: 'Claire can summarise what you missed.',
  },
  unknown: {
    tag: 'Group',
    pitch: 'Claire can summarise what you missed and draft replies.',
  },
};

/**
 * The label to show, or null when we would only be guessing. Showing nothing
 * is better than showing a wrong category: the tag is a claim about the user's
 * own life, and a wrong one is more annoying than an absent one.
 */
export function groupCategoryTag(
  category: GroupCategory | null | undefined,
  confidence: number | null | undefined,
): string | null {
  if (!category) return null;
  if ((confidence ?? 0) < CATEGORY_DISPLAY_THRESHOLD) return null;
  return COPY[category]?.tag ?? null;
}

export interface GroupBannerCopy {
  title: string;
  body: string;
  /** True where turning Claire on is worth actively suggesting. */
  recommended: boolean;
}

export function groupBannerCopy(
  category: GroupCategory | null | undefined,
  confidence: number | null | undefined,
  memberCount: number | null | undefined,
): GroupBannerCopy {
  const confident = !!category && (confidence ?? 0) >= CATEGORY_DISPLAY_THRESHOLD;
  const copy = confident ? COPY[category!] : null;
  const people = memberCount && memberCount > 0 ? ` · ${memberCount} people` : '';

  if (!copy) {
    return {
      title: `Group chat${people}`,
      body: "Claire isn't reading this one. Turn on AI for summaries, replies and follow-ups.",
      recommended: false,
    };
  }

  return {
    title: `${copy.tag} group${people}`,
    body: copy.pitch,
    recommended: RECOMMENDED_GROUP_CATEGORIES.includes(category!),
  };
}
