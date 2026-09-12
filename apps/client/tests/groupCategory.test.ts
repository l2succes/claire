/**
 * Category copy. The tag is a claim about the user's own life, so the rule that
 * matters most here is when we say nothing at all.
 */
import { groupCategoryTag, groupBannerCopy } from '../features/chat/group-category';

describe('groupCategoryTag', () => {
  it('labels a confident category', () => {
    expect(groupCategoryTag('work', 0.75)).toBe('Work');
  });

  it('says nothing when the classifier is unsure', () => {
    // Showing a wrong category is worse than showing none: a mislabelled group
    // reads as Claire misunderstanding you, an unlabelled one reads as nothing.
    expect(groupCategoryTag('work', 0.4)).toBeNull();
  });

  it('says nothing when there is no classification at all', () => {
    expect(groupCategoryTag(null, null)).toBeNull();
    expect(groupCategoryTag('work', null)).toBeNull();
  });
});

describe('groupBannerCopy', () => {
  it('names the category and the size', () => {
    const copy = groupBannerCopy('work', 0.8, 12);
    expect(copy.title).toBe('Work group · 12 people');
    expect(copy.body).toContain('action items');
    expect(copy.recommended).toBe(true);
  });

  it('omits the size when it is unknown', () => {
    // member_count went unwritten for a long time, so null is common on
    // existing rows and must not render as "· null people".
    expect(groupBannerCopy('work', 0.8, null).title).toBe('Work group');
    expect(groupBannerCopy('work', 0.8, 0).title).toBe('Work group');
  });

  it('falls back to generic copy when unclassified', () => {
    const copy = groupBannerCopy(null, null, 6);
    expect(copy.title).toBe('Group chat · 6 people');
    expect(copy.body).toContain("isn't reading this one");
    expect(copy.recommended).toBe(false);
  });

  it('falls back to generic copy when the classifier is unsure', () => {
    expect(groupBannerCopy('work', 0.3, 12).title).toBe('Group chat · 12 people');
  });

  it('does not recommend turning on a community or announcement group', () => {
    // These are the groups the whole feature exists to keep quiet, so the
    // banner must describe them without nudging.
    expect(groupBannerCopy('community', 0.9, 40).recommended).toBe(false);
    expect(groupBannerCopy('announcement', 0.9, 200).recommended).toBe(false);
    expect(groupBannerCopy('friends', 0.9, 5).recommended).toBe(false);
  });

  it('recommends work and planning groups', () => {
    expect(groupBannerCopy('planning', 0.8, 5).recommended).toBe(true);
  });
});
