// @ts-nocheck
import * as __fd_glob_18 from "../content/docs/reference/environment.md?collection=docs"
import * as __fd_glob_17 from "../content/docs/product/roadmap.md?collection=docs"
import * as __fd_glob_16 from "../content/docs/guides/testing.md?collection=docs"
import * as __fd_glob_15 from "../content/docs/guides/self-hosting.md?collection=docs"
import * as __fd_glob_14 from "../content/docs/guides/plugins.md?collection=docs"
import * as __fd_glob_13 from "../content/docs/guides/mobile.md?collection=docs"
import * as __fd_glob_12 from "../content/docs/guides/loops.md?collection=docs"
import * as __fd_glob_11 from "../content/docs/guides/desktop.md?collection=docs"
import * as __fd_glob_10 from "../content/docs/getting-started/repository-setup.md?collection=docs"
import * as __fd_glob_9 from "../content/docs/contributing/workflow.md?collection=docs"
import * as __fd_glob_8 from "../content/docs/architecture/overview.md?collection=docs"
import * as __fd_glob_7 from "../content/docs/index.mdx?collection=docs"
import { default as __fd_glob_6 } from "../content/docs/reference/meta.json?collection=docs"
import { default as __fd_glob_5 } from "../content/docs/product/meta.json?collection=docs"
import { default as __fd_glob_4 } from "../content/docs/guides/meta.json?collection=docs"
import { default as __fd_glob_3 } from "../content/docs/getting-started/meta.json?collection=docs"
import { default as __fd_glob_2 } from "../content/docs/contributing/meta.json?collection=docs"
import { default as __fd_glob_1 } from "../content/docs/architecture/meta.json?collection=docs"
import { default as __fd_glob_0 } from "../content/docs/meta.json?collection=docs"
import { server } from 'fumadocs-mdx/runtime/server';
import type * as Config from '../source.config';

const create = server<typeof Config, import("fumadocs-mdx/runtime/types").InternalTypeConfig & {
  DocData: {
  }
}>({"doc":{"passthroughs":["extractedReferences"]}});

export const docs = await create.docs("docs", "content/docs", {"meta.json": __fd_glob_0, "architecture/meta.json": __fd_glob_1, "contributing/meta.json": __fd_glob_2, "getting-started/meta.json": __fd_glob_3, "guides/meta.json": __fd_glob_4, "product/meta.json": __fd_glob_5, "reference/meta.json": __fd_glob_6, }, {"index.mdx": __fd_glob_7, "architecture/overview.md": __fd_glob_8, "contributing/workflow.md": __fd_glob_9, "getting-started/repository-setup.md": __fd_glob_10, "guides/desktop.md": __fd_glob_11, "guides/loops.md": __fd_glob_12, "guides/mobile.md": __fd_glob_13, "guides/plugins.md": __fd_glob_14, "guides/self-hosting.md": __fd_glob_15, "guides/testing.md": __fd_glob_16, "product/roadmap.md": __fd_glob_17, "reference/environment.md": __fd_glob_18, });