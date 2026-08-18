// SPDX-License-Identifier: Apache-2.0
import { getDocs, sectionsWithDocs } from '@/lib/docs';
import {
  sectionDescriptions,
  sectionIcons,
  sectionLabels,
  type DocsSection,
  type DocsStatus,
} from '@/lib/docs-types';
import type { HeroIconName } from '@/components/site/HeroIcon';

export type NavItem = {
  title: string;
  url: string;
  description: string;
  status: DocsStatus;
};

export type NavGroup = {
  section: DocsSection;
  label: string;
  description: string;
  icon: HeroIconName;
  items: NavItem[];
};

/**
 * Reader-facing hierarchy, derived from each document's `section` rather than
 * its position on disk. Folders exist for the people editing files; sections
 * exist for the people reading the site, and they are allowed to disagree.
 */
export function getNavigation(): NavGroup[] {
  const groups = sectionsWithDocs().map(({ section, docs }) => ({
    section,
    label: sectionLabels[section],
    description: sectionDescriptions[section],
    icon: sectionIcons[section],
    items: docs.map((doc) => ({
      title: doc.title,
      url: doc.url,
      description: doc.description,
      status: doc.status,
    })),
  }));

  const routed = new Set(groups.flatMap((group) => group.items.map((item) => item.url)));
  if (routed.size !== getDocs().length) {
    throw new Error('Documentation navigation must include every document exactly once.');
  }

  return groups;
}
