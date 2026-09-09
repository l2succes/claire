/**
 * The People directory walk.
 *
 * This is the screen's instability, pinned: a local-first list that painted
 * from cache and was then immediately replaced by the first network page, so
 * 21,000 rows collapsed to 1,000 and re-grew a thousand at a time.
 */
import { mergeDirectoryPage } from '../services/contacts';
import type { PersonContact } from '../services/contacts';

const person = (id: string): PersonContact => ({
  id,
  name: `Person ${id}`,
  phone_number: null,
  is_group: false,
});

const ids = (contacts: PersonContact[]) => contacts.map((contact) => contact.id);

describe('mergeDirectoryPage', () => {
  it('keeps the cached remainder when the first page is smaller', () => {
    // The actual bug: without this the list drops from 3 people to 1 the
    // instant the first of many pages lands.
    const cached = [person('a'), person('b'), person('c')];
    const firstPage = [person('a')];
    expect(ids(mergeDirectoryPage(firstPage, cached, false))).toEqual(['a', 'b', 'c']);
  });

  it('puts freshly fetched people first, so their order is the server\'s', () => {
    const cached = [person('a'), person('b'), person('c')];
    const page = [person('c'), person('a')];
    expect(ids(mergeDirectoryPage(page, cached, false))).toEqual(['c', 'a', 'b']);
  });

  it('never duplicates a person present in both', () => {
    const cached = [person('a'), person('b')];
    const page = [person('a')];
    expect(ids(mergeDirectoryPage(page, cached, false))).toEqual(['a', 'b']);
  });

  it('lets the final page shrink the list, so deletions take effect', () => {
    // The last page is authoritative. Without this exception a contact removed
    // upstream would linger forever, which is the bug the whole-set replace in
    // replaceCachedContacts exists to avoid.
    const cached = [person('a'), person('b'), person('c')];
    const finalPage = [person('a')];
    expect(ids(mergeDirectoryPage(finalPage, cached, true))).toEqual(['a']);
  });

  it('passes the page straight through when nothing is on screen yet', () => {
    const page = [person('a'), person('b')];
    expect(ids(mergeDirectoryPage(page, undefined, false))).toEqual(['a', 'b']);
    expect(ids(mergeDirectoryPage(page, [], false))).toEqual(['a', 'b']);
  });

  it('stops merging once the walk has overtaken what was cached', () => {
    // Mid-walk the merged list stays at its high-water mark; once the fetched
    // set is larger there is nothing left to preserve and the result is clean.
    const cached = [person('a'), person('b')];
    const page = [person('a'), person('b'), person('c')];
    expect(ids(mergeDirectoryPage(page, cached, false))).toEqual(['a', 'b', 'c']);
  });

  it('does not mutate either input', () => {
    const cached = [person('a'), person('b')];
    const page = [person('c')];
    mergeDirectoryPage(page, cached, false);
    expect(ids(cached)).toEqual(['a', 'b']);
    expect(ids(page)).toEqual(['c']);
  });
});
