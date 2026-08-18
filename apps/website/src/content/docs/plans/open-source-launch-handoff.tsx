// SPDX-License-Identifier: Apache-2.0
import { C, Code, Doc, P, Section } from '@/components/docs/blocks';
import type { DocMeta } from '@/lib/docs-types';

export const meta: DocMeta = {
  title: "Open-source launch handoff prompt",
  description: "Archived handoff instructions for the Claire open-source launch.",
  section: 'plans',
  status: 'archived',
  lastReviewed: '2026-08-17',
  related: ['/docs/plans/open-source-launch'],
};

export default function Page() {
  return (
    <Doc>
      <P lede>You are taking over implementation of the Claire open-source launch and repository organization plan.</P>
      <Section id="repository-rules" title="Repository rules">
      <ul>
              <li>Work in an isolated worktree or branch based on updated <C>main</C>.</li>
              <li>The shared workspace may contain unrelated dirty changes from other agents. Do not stash, reset, checkout, or overwrite them.</li>
              <li>Use <C>apply_patch</C> for tracked file edits.</li>
              <li>Preserve existing work unless it is explicitly in the current phase.</li>
              <li>Never expose or print secret values.</li>
              <li>Before any destructive Git history operation, back up refs and confirm the exact scope.</li>
            </ul>
      </Section>
      <Section id="source-of-truth" title="Source of truth">
      <P>Read the complete plan at:</P>
      <P><C>docs/plans/open-source-launch/PLAN.md</C></P>
      <P>The website is the visual source of truth. Reuse its tokens, CSS, assets, logos, Heroicons, platform marks, mockups, and responsive behavior. Do not replace Claire’s visual language with generic Next.js or generic Fumadocs styling.</P>
      </Section>
      <Section id="required-sequence" title="Required sequence">
      <P>Implement in focused phases:</P>
      <ol>
              <li>Security and credential remediation.</li>
              <li>Licensing and community files.</li>
              <li>Rename <C>client/</C> to <C>mobile/</C> and update all references.</li>
              <li>Establish workspace/package boundaries.</li>
              <li>Reorganize public documentation.</li>
              <li>Extract the existing Claire design system into shared tokens and Tailwind components.</li>
              <li>Port the website and mockups faithfully.</li>
              <li>Add Fumadocs, Markdown export, <C>llms.txt</C>, and Ask Claire docs search.</li>
              <li>Add plugin SDK examples and contributor setup.</li>
              <li>Validate website parity before removing obsolete static references.</li>
            </ol>
      </Section>
      <Section id="final-structure" title="Final structure">
      <Code lang="text">{"mobile/ desktop/ website/ server/ packages/ examples/ docker/ supabase/ docs/ scripts/ vendor/"}</Code>
      <P>The desktop application lives under <C>apps/desktop/</C>. Move the mautrix docs submodule from <C>docs/mautrix</C> to <C>vendor/mautrix-docs</C>.</P>
      </Section>
      <Section id="contributor-experience-to-deliver" title="Contributor experience to deliver">
      <P>The developer docs must explain how to:</P>
      <ul>
              <li>Clone Claire.</li>
              <li>Run <C>bun run setup</C>.</li>
              <li>Start mock mode with <C>bun run dev</C>.</li>
              <li>Run tests, lint, typecheck, and Storybook.</li>
              <li>Work on mobile, desktop, server, website, connectors, or plugins independently.</li>
              <li>Create and test a local plugin with fixtures.</li>
            </ul>
      <P>Create <C>packages/plugin-sdk/</C> and local calendar/task-manager examples with:</P>
      <Code lang="bash">{"bun run plugin:create\nbun run dev:plugin\nbun run test:plugins"}</Code>
      <P>Do not require real messaging accounts, cloud credentials, or third-party calendar accounts for the basic contributor path.</P>
      </Section>
      <Section id="design-system-requirements" title="Design-system requirements">
      <ul>
              <li>Tailwind CSS v4 is the composition layer.</li>
              <li>The Claire token system becomes canonical semantic tokens.</li>
              <li>Existing landing colors, typography, spacing, shadows, borders, logo vectors, Heroicons, and platform marks must be reused.</li>
              <li>Use scoped CSS for complex phone, desktop, and plugin mockup geometry when appropriate.</li>
              <li>Add Storybook stories for reusable components and important states.</li>
              <li>Include visual parity checks at desktop and 390px mobile widths.</li>
            </ul>
      </Section>
      <Section id="documentation-requirements" title="Documentation requirements">
      <P>Use Fumadocs at <C>/docs</C> in the existing Next.js website, themed with Claire’s shared components. Provide:</P>
      <ul>
              <li>Search</li>
              <li>Copy Markdown</li>
              <li>View Markdown</li>
              <li>Edit on GitHub</li>
              <li>Mermaid diagrams</li>
              <li><C>/llms.txt</C></li>
              <li><C>/llms-full.txt</C></li>
              <li>Per-page <C>.md</C> routes</li>
              <li><C>GET /api/search</C></li>
              <li><C>POST /api/docs/ask</C></li>
            </ul>
      <P>Ask Claire must retrieve from the docs index, cite sources, default to configurable <C>gpt-5.4-mini</C>, rate-limit, enforce a $50 monthly budget, avoid raw-query retention, and fall back to ordinary search when unavailable.</P>
      </Section>
      <Section id="validation-before-handoff" title="Validation before handoff">
      <P>Run and report:</P>
      <ul>
              <li>Current-tree and full-history secret scans.</li>
              <li>License/path validation.</li>
              <li>Fresh-clone mock-mode setup.</li>
              <li>Website, Storybook, server, mobile, and desktop checks.</li>
              <li>Documentation link and Markdown endpoint checks.</li>
              <li>Plugin fixture tests.</li>
              <li>Visual parity checks against the original landing pages.</li>
              <li><C>git diff --check</C>.</li>
            </ul>
      <P>Report changed files, tests, unresolved risks, and the next recommended phase. Do not claim the repository is ready for public promotion while the open secret alert or historical credentials remain unresolved.</P>
      </Section>
    </Doc>
  );
}
