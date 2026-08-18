// @ts-nocheck
import { browser } from 'fumadocs-mdx/runtime/browser';
import type * as Config from '../source.config';

const create = browser<typeof Config, import("fumadocs-mdx/runtime/types").InternalTypeConfig & {
  DocData: {
  }
}>();
const browserCollections = {
  docs: create.doc("docs", {"index.mdx": () => import("../content/docs/index.mdx?collection=docs"), "architecture/overview.md": () => import("../content/docs/architecture/overview.md?collection=docs"), "contributing/workflow.md": () => import("../content/docs/contributing/workflow.md?collection=docs"), "getting-started/repository-setup.md": () => import("../content/docs/getting-started/repository-setup.md?collection=docs"), "guides/desktop.md": () => import("../content/docs/guides/desktop.md?collection=docs"), "guides/loops.md": () => import("../content/docs/guides/loops.md?collection=docs"), "guides/mobile.md": () => import("../content/docs/guides/mobile.md?collection=docs"), "guides/plugins.md": () => import("../content/docs/guides/plugins.md?collection=docs"), "guides/self-hosting.md": () => import("../content/docs/guides/self-hosting.md?collection=docs"), "guides/testing.md": () => import("../content/docs/guides/testing.md?collection=docs"), "product/roadmap.md": () => import("../content/docs/product/roadmap.md?collection=docs"), "reference/environment.md": () => import("../content/docs/reference/environment.md?collection=docs"), }),
};
export default browserCollections;