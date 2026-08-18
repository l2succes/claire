// SPDX-License-Identifier: Apache-2.0
import { C, Code, Doc, P, Section } from '@/components/docs/blocks';
import type { DocMeta } from '@/lib/docs-types';

export const meta: DocMeta = {
  title: "Open-source launch plan",
  description: "Archived plan for the monorepo cleanup, website, and initial developer documentation.",
  section: 'plans',
  status: 'archived',
  lastReviewed: '2026-08-17',
  related: ['/docs/contribute/workflow', '/docs/plans/open-source-launch-handoff'],
};

export default function Page() {
  return (
    <Doc>
      <Section id="summary" title="Summary">
      <P>Prepare Claire for an open-source launch through focused, reviewable migrations rather than one oversized change.</P>
      <P>Final top-level product structure:</P>
      <Code lang="text">{"claire/\n├── mobile/                  # Expo iOS, Android, and mobile web client\n├── desktop/                 # Desktop applications and native companion code\n│   └── macos/\n├── website/                 # Next.js marketing site, docs, mockups, Storybook\n├── server/                  # Bun API and messaging services\n├── packages/\n│   ├── design-system/       # Shared tokens, contracts, and platform-neutral assets\n│   ├── platform-catalog/    # Canonical connector metadata\n│   ├── plugin-sdk/          # Plugin types, runtime helpers, and test utilities\n│   └── shared-types/        # Shared API and domain contracts\n├── examples/\n│   └── plugins/             # Working example plugins\n├── docker/                  # Local infrastructure\n├── supabase/                # Database config and migrations\n├── docs/                    # Canonical Markdown/MDX documentation\n├── scripts/                 # Repository-wide development and release tooling\n└── vendor/\n    └── mautrix-docs/        # Optional upstream documentation submodule"}</Code>
      <P><C>client/</C> becomes <C>mobile/</C>. <C>desktop/</C> remains the desktop boundary, preserving <C>desktop/macos/</C> for future desktop platforms. <C>landing/</C> is removed only after every useful design, mockup, asset, and interaction has been ported into <C>website/</C>.</P>
      </Section>
      <Section id="secure-and-license-the-repository" title="Secure and license the repository">
      <Section id="immediate-containment" title="Immediate containment" level={3}>
      <ul>
              <li>Temporarily make the already-public repository private and freeze merges.</li>
              <li>Rotate the exposed Supabase JWT secret, service-role key, and derived anon key.</li>
              <li>Remove the hardcoded service-key fallback from <C>scripts/setup-database.js</C>.</li>
              <li>Update Railway, EAS, GitHub, local environments, and deployed clients.</li>
              <li>Run Gitleaks across the current tree and full Git history.</li>
              <li>Move real production endpoints, project IDs, database proxies, usernames, and operational runbooks to a private <C>l2succes/claire-ops</C> repository.</li>
              <li>Exclude the unrelated <C>turbo-fieldfare</C> gitlink from release branches.</li>
            </ul>
      </Section>
      <Section id="history-cleanup" title="History cleanup" level={3}>
      <ul>
              <li>Back up all branches and tags.</li>
              <li>Purge historical <C>client/.env.local.backup</C> and <C>client/.env.override</C> files.</li>
              <li>Replace the historical Supabase key everywhere.</li>
              <li>Force-push rewritten branches and tags and require fresh clones.</li>
              <li>Reopen the repository only after credentials are revoked and current-tree/history scans are clean.</li>
            </ul>
      </Section>
      <Section id="licensing" title="Licensing" level={3}>
      <ul>
              <li>AGPL-3.0: <C>server/</C>, <C>docker/</C>, <C>supabase/</C>, infrastructure configuration, and operational service code.</li>
              <li>Apache-2.0: <C>mobile/</C>, <C>desktop/</C>, <C>website/</C>, <C>packages/</C>, <C>examples/</C>, and public documentation.</li>
              <li>Add path-based license guidance, SPDX metadata, complete license texts, third-party notices, and a trademark policy.</li>
              <li>Require DCO sign-off for contributions.</li>
            </ul>
      </Section>
      </Section>
      <Section id="reorganize-the-repository-in-a-dedicated-migration" title="Reorganize the repository in a dedicated migration">
      <P>Perform this as a mechanical PR from an isolated worktree after active feature branches are merged or paused:</P>
      <ul>
              <li>Use <C>git mv client mobile</C> to preserve history.</li>
              <li>Do not introduce a temporary <C>client</C> symlink.</li>
              <li>Update root scripts, Docker builds, Railway ignores, ESLint, Expo commands, EAS instructions, CI working directories, test artifact paths, agent instructions, and docs.</li>
              <li>Preserve obsolete path references only in Git history.</li>
              <li>Verify native iOS and Android references after the move.</li>
            </ul>
      <P>Expected commands:</P>
      <Code lang="bash">{"bun run dev\nbun run dev:server\nbun run dev:mobile\nbun run dev:desktop\nbun run dev:website\nbun run dev:plugin\nbun run test\nbun run lint\nbun run typecheck\nbun run check"}</Code>
      <P>Add explicit Bun workspaces for <C>mobile</C>, <C>desktop/macos</C>, <C>website</C>, <C>server</C>, <C>packages/*</C>, and <C>examples/*</C>. Keep native CocoaPods/Bundler lockfiles. Consolidate JavaScript dependency management only after clean-install parity is proven.</P>
      <P>Move the mautrix documentation submodule from <C>docs/mautrix</C> to <C>vendor/mautrix-docs</C>; make it optional for normal contributors and required only for bridge work.</P>
      <P>Move connector definitions into <C>packages/platform-catalog</C>, consumed by server, website, mobile, and desktop. Add <C>packages/shared-types</C> only for genuine cross-runtime contracts.</P>
      </Section>
      <Section id="preserve-and-port-the-existing-claire-design" title="Preserve and port the existing Claire design">
      <P>The existing <C>landing/</C> implementation is the visual source of truth. Reuse its tokens, typography, CSS, logos, Heroicons, vendor marks, homepage, business page, security page, mobile/desktop/plugin mockups, and responsive behavior.</P>
      <P>Do not replace it with a generic Next.js visual language.</P>
      <Section id="tailwind-and-component-kit" title="Tailwind and component kit" level={3}>
      <ul>
              <li>Add Tailwind CSS v4 to <C>website/</C>.</li>
              <li>Convert <C>landing/tokens.css</C> into canonical semantic variables in <C>packages/design-system</C>.</li>
              <li>Expose those values through Tailwind <C>@theme</C>.</li>
              <li>Use <C>class-variance-authority</C>, <C>clsx</C>, and <C>tailwind-merge</C> for variants.</li>
              <li>Keep scoped CSS for intricate mockup geometry where utility-only markup is less maintainable.</li>
              <li>Ban arbitrary hardcoded brand colors in new components.</li>
            </ul>
      <P>Component groups:</P>
      <ul>
              <li>Brand marks, wordmarks, vendor marks, and AI sparkle</li>
              <li>Buttons, links, icon buttons, and copy controls</li>
              <li>Badges, availability labels, and hosting labels</li>
              <li>Cards, panels, callouts, and code blocks</li>
              <li>Marketing and documentation navigation</li>
              <li>Page heroes and content sections</li>
              <li>Phone and desktop frames</li>
              <li>Conversation rows, message bubbles, AI cards, and platform badges</li>
              <li>Documentation callouts, code groups, API signatures, and diagrams</li>
            </ul>
      <P>Icon rules:</P>
      <ul>
              <li>Heroicons outline at 24px for navigation and 20px for compact controls.</li>
              <li>Solid icons only for selected or high-priority states.</li>
              <li>Official platform marks for platform identity.</li>
              <li>Vendor marks vendored locally with attribution.</li>
              <li>Claire SVG logo assets remain editable source files.</li>
              <li>Storybook documents every reusable component and meaningful state.</li>
            </ul>
      <P>Maintain a parity matrix mapping every static page to its Next.js route. Delete <C>landing/</C> only after content, responsive behavior, interactions, accessibility states, and assets are verified in <C>website/</C>.</P>
      </Section>
      </Section>
      <Section id="clean-and-reorganize-documentation" title="Clean and reorganize documentation">
      <P>Canonical tree:</P>
      <Code lang="text">{"docs/\n├── getting-started/\n├── architecture/\n├── guides/\n├── reference/\n├── contributing/\n├── product/\n└── project/"}</Code>
      <P>Content areas:</P>
      <ul>
              <li>Getting started: prerequisites, repository setup, development modes, and first contribution.</li>
              <li>Architecture: system overview, Matrix/mautrix data flow, identity, sync, AI, hosting, and privacy.</li>
              <li>Guides: mobile, desktop, plugins, connectors, self-hosting, testing, backups, and troubleshooting.</li>
              <li>Reference: API, environment variables, platform catalog, plugin manifest, database, and design system.</li>
              <li>Contributing: workflow, testing, docs, DCO, and maintainers.</li>
              <li>Product: roadmap, connector status, security status, and known limitations.</li>
            </ul>
      <P>Merge duplicate setup, environment, deployment, and architecture documents. Preserve durable decisions and delete superseded plans instead of accumulating an archive. Add frontmatter for title, description, status, audience, owner, keywords, and last-reviewed date. Keep live production details out of public docs.</P>
      </Section>
      <Section id="contributor-get-started-path" title="Contributor get-started path">
      <P>Create <C>/docs/getting-started/repository-setup</C> covering:</P>
      <ol>
              <li>Supported operating systems and prerequisites.</li>
              <li>Clone command.</li>
              <li>Optional mautrix submodule setup for bridge contributors.</li>
              <li>Bun and Docker verification.</li>
              <li>Safe environment-file setup.</li>
              <li>Dependency installation.</li>
              <li>Mock-mode startup with no third-party accounts.</li>
              <li>Test, lint, and typecheck commands.</li>
              <li>Repository map.</li>
              <li>Links to contribution tracks.</li>
            </ol>
      <P>Default path:</P>
      <Code lang="bash">{"git clone https://github.com/l2succes/claire.git\ncd claire\nbun run setup\nbun run dev"}</Code>
      <P>Mock mode must not require WhatsApp, Telegram, Instagram, Matrix, Supabase Cloud, or paid AI credentials.</P>
      <P>Document separate tracks for website/docs, mobile, desktop, backend, connectors, plugins, and design-system work.</P>
      <Section id="plugin-development" title="Plugin development" level={3}>
      <P>Create:</P>
      <Code lang="text">{"packages/plugin-sdk/\nexamples/plugins/calendar/\nexamples/plugins/task-manager/"}</Code>
      <P>Document manifests, permissions, conversation triggers, approvals, actions, fixtures, failure handling, run history, packaging, and review requirements.</P>
      <P>Provide:</P>
      <Code lang="bash">{"bun run plugin:create\nbun run dev:plugin\nbun run test:plugins"}</Code>
      <P>The calendar example uses local fixtures and creates a mock event without requiring a real external account.</P>
      </Section>
      </Section>
      <Section id="documentation-website" title="Documentation website">
      <P>Add Fumadocs under <C>/docs</C> in the existing Next.js website, themed with Claire’s shared tokens and components rather than an unrelated stock theme.</P>
      <P>Include sidebar navigation, breadcrumbs, table of contents, keyboard search, Copy Markdown, View Markdown, Edit on GitHub, Mermaid diagrams, code groups, compatibility tables, feedback, and last-reviewed metadata.</P>
      <P>Public interfaces:</P>
      <ul>
              <li><C>GET /api/search</C></li>
              <li><C>POST /api/docs/ask</C></li>
              <li><C>GET /llms.txt</C></li>
              <li><C>GET /llms-full.txt</C></li>
              <li><C>{"GET /docs/<path>.md"}</C></li>
            </ul>
      <P>Ask Claire documentation search must retrieve from the structured docs index, cite sources, default to configurable <C>gpt-5.4-mini</C>, avoid silent provider fallback, limit request/response size, rate-limit visitors, enforce an initial $50 monthly budget, cache repeated questions, and avoid retaining raw questions. Standard search must remain available if AI is disabled.</P>
      </Section>
      <Section id="open-source-community-and-readme" title="Open-source community and README">
      <P>Use the existing Claire design system and actual product references in the README:</P>
      <ul>
              <li>Logo and “All your chats. One AI.” positioning</li>
              <li>Real mobile, desktop, inbox, and plugin screenshots</li>
              <li>Current capabilities separated from roadmap</li>
              <li>Five-minute mock-mode quickstart</li>
              <li>Mermaid architecture diagram</li>
              <li>Cloud, self-hosted, BYOK, and private-desktop modes</li>
              <li>Plugin ecosystem and contribution tracks</li>
              <li>Docs, Discussions, security, roadmap, and license links</li>
              <li>Alpha status and known limitations</li>
              <li>No production endpoints or unsupported privacy guarantees</li>
            </ul>
      <P>Add <C>CONTRIBUTING.md</C>, <C>CODE_OF_CONDUCT.md</C>, <C>SECURITY.md</C>, <C>GOVERNANCE.md</C>, <C>MAINTAINERS.md</C>, <C>SUPPORT.md</C>, DCO automation, issue forms, PR template, and CODEOWNERS.</P>
      <P>{"Enable GitHub Discussions for Announcements, Q&A, Ideas, Show and Tell, Plugins, and Self-hosting. Enable Dependabot, CodeQL, dependency review, expanded secret scanning, push protection, and protected-main rules. Deploy website and PR previews through Vercel."}</P>
      </Section>
      <Section id="delivery-and-acceptance" title="Delivery and acceptance">
      <P>Recommended PR sequence:</P>
      <ol>
              <li>Credential rotation and public-repository remediation.</li>
              <li>Licensing and community health files.</li>
              <li><C>client/</C> to <C>mobile/</C> mechanical rename.</li>
              <li>Workspace scripts and shared-package boundaries.</li>
              <li>Documentation cleanup and contributor quickstart.</li>
              <li>Design-token and component extraction from <C>landing/</C>.</li>
              <li>Website page migration.</li>
              <li>Fumadocs and AI search.</li>
              <li>Mockup migration and <C>landing/</C> removal.</li>
              <li>README, screenshots, GitHub configuration, and alpha release.</li>
            </ol>
      <P>Acceptance criteria:</P>
      <ul>
              <li>No active secret alerts or verified credentials in current or rewritten history.</li>
              <li>No functional reference to <C>client/</C> remains after the rename.</li>
              <li>Root commands work from a fresh clone.</li>
              <li>Mock mode requires no external accounts.</li>
              <li>Every contribution track has a tested setup path.</li>
              <li>Plugin examples run with local fixtures.</li>
              <li>Website pages visually match the existing Claire references.</li>
              <li>Published docs are searchable and copyable as Markdown.</li>
              <li>Storybook, website, server, mobile, and desktop checks pass.</li>
              <li>CI validates paths, docs links, licenses, secrets, types, and fresh-clone setup.</li>
              <li><C>landing/</C> is deleted only after parity verification.</li>
              <li>GitHub community profile reaches 100%.</li>
              <li>Publish <C>v0.1.0-alpha.1</C> after a clean-clone rehearsal.</li>
            </ul>
      </Section>
      <Section id="assumptions" title="Assumptions">
      <ul>
              <li>Top-level names are <C>mobile</C>, <C>desktop</C>, <C>website</C>, and <C>server</C>; no <C>apps/</C> wrapper is introduced.</li>
              <li><C>desktop/macos/</C> remains nested for future desktop platforms.</li>
              <li><C>landing/</C> is authoritative until fully ported.</li>
              <li>Root <C>docs/</C> is the canonical Markdown source consumed by Fumadocs.</li>
              <li>Old plans are consolidated or deleted after their durable decisions are preserved.</li>
              <li>Migration work happens in an isolated worktree and does not disturb the current shared dirty worktree.</li>
              <li>GitHub Discussions is the canonical community venue.</li>
              <li>DCO is used instead of a CLA.</li>
              <li>Server infrastructure uses AGPL-3.0; clients, website, documentation, shared packages, and plugin SDK use Apache-2.0.</li>
            </ul>
      </Section>
    </Doc>
  );
}
