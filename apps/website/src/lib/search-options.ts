// SPDX-License-Identifier: Apache-2.0
import type { Options } from 'minisearch';

export type SearchChunk = {
  id: string;
  url: string;
  docTitle: string;
  heading: string;
  section: string;
  status: string;
  excerpt: string;
  text: string;
};

export const SEARCH_INDEX_URL = '/docs-search-index.json';

/**
 * Shared by the build script that serializes the index and the client that
 * loads it — MiniSearch requires both sides to agree on these options exactly.
 */
export const searchOptions: Options<SearchChunk> = {
  fields: ['docTitle', 'heading', 'text'],
  storeFields: ['url', 'docTitle', 'heading', 'section', 'status', 'excerpt'],
  searchOptions: {
    boost: { docTitle: 3, heading: 2 },
    prefix: true,
    fuzzy: 0.2,
    combineWith: 'AND',
  },
};
