// SPDX-License-Identifier: Apache-2.0
/**
 * The vocabulary every documentation module is written in.
 *
 * Docs are React modules rather than Markdown, so this barrel is the whole
 * authoring surface: if something cannot be expressed with these blocks, add a
 * block rather than reaching for raw markup, and every page inherits the
 * improvement.
 */
export { Callout, type CalloutKind } from '@/components/docs/blocks/callout';
export { Card, Cards } from '@/components/docs/blocks/cards';
export { C, Code, Terminal } from '@/components/docs/blocks/code';
export { Diagram } from '@/components/docs/blocks/diagram';
export { DocLink, Related } from '@/components/docs/blocks/doc-link';
export { Figure } from '@/components/docs/blocks/figure';
export { Mockup, MockupStrip } from '@/components/docs/blocks/mockup';
export { Platforms } from '@/components/docs/blocks/platforms';
export { Definitions, Divider, Doc, Facts, P, Section, Table } from '@/components/docs/blocks/prose';
export { Roadmap, RoadmapTeaser } from '@/components/docs/blocks/roadmap';
export { Step, Steps } from '@/components/docs/blocks/steps';
export { Tab, Tabs } from '@/components/docs/blocks/tabs';
