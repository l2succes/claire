import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

type RcItem = Record<string, unknown> & { id: string };

type CatalogProduct = {
  storeId: string;
  displayName: string;
  title: string;
  duration: 'P1M';
  usd: string;
  plan: 'pro';
  packageKey: string;
};

const catalog: CatalogProduct[] = [
  {
    storeId: 'claire_pro_monthly',
    displayName: 'Claire Monthly',
    title: 'Claire Monthly',
    duration: 'P1M',
    usd: '19.99',
    plan: 'pro',
    packageKey: 'pro_monthly',
  },
];

const root = resolve(import.meta.dir, '..');
const clientEnvPath = resolve(root, 'apps/client/.env.local');
const cliPrefix = ['bunx', '@revenuecat/cli'];
const iosBundleId = 'com.claire.app';

async function rc(args: string[]): Promise<Record<string, unknown>> {
  const child = Bun.spawn([...cliPrefix, ...args, '--json', '--no-input'], {
    cwd: root,
    stdout: 'pipe',
    stderr: 'pipe',
    env: process.env,
  });
  const [exitCode, stdout, stderr] = await Promise.all([
    child.exited,
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
  ]);
  if (exitCode !== 0) {
    let message = stderr.trim() || 'RevenueCat CLI command failed';
    try {
      const parsed = JSON.parse(stdout) as { error?: { message?: string } };
      message = parsed.error?.message || message;
    } catch {
      // The CLI may emit a plain-text validation error.
    }
    throw new Error(`${args.slice(0, 2).join(' ')}: ${message}`);
  }
  return JSON.parse(stdout) as Record<string, unknown>;
}

function data<T>(payload: Record<string, unknown>): T {
  return payload.data as T;
}

async function list(command: string[]): Promise<RcItem[]> {
  const result = data<{ items?: RcItem[] | null }>(await rc(command));
  return result.items || [];
}

function findBy(items: RcItem[], key: string, value: string): RcItem | undefined {
  return items.find((item) => item[key] === value);
}

async function projectId(): Promise<string> {
  const configured = process.env.RC_PROJECT_ID?.trim();
  if (configured) return configured;

  const projects = await list(['projects', 'list']);
  if (projects.length === 1) return projects[0].id;
  const claire = findBy(projects, 'name', 'Claire');
  if (claire) return claire.id;
  if (projects.length > 1) {
    throw new Error(
      'Multiple RevenueCat projects exist. Set RC_PROJECT_ID to the Claire project before running setup.'
    );
  }
  const created = data<RcItem>(await rc(['projects', 'create', '--name', 'Claire']));
  return created.id;
}

async function ensureProduct(
  project: string,
  app: string,
  desired: CatalogProduct,
  existing: RcItem[],
  store: 'test_store' | 'app_store'
): Promise<RcItem> {
  let item = existing.find(
    (product) => product.app_id === app && product.store_identifier === desired.storeId
  );
  if (!item) {
    const storeFields =
      store === 'test_store' ? ['--title', desired.title, '--duration', desired.duration] : [];
    item = data<RcItem>(
      await rc([
        'products',
        'create',
        '--project-id',
        project,
        '--app-id',
        app,
        '--store-id',
        desired.storeId,
        '--type',
        'subscription',
        '--title',
        desired.title,
        '--display-name',
        desired.displayName,
        ...storeFields,
      ])
    );
    existing.push(item);
    console.log(
      `Created ${desired.displayName} for ${store === 'test_store' ? 'Test Store' : 'iOS'}.`
    );
  }
  if (store === 'test_store') {
    await rc([
      'products',
      'prices',
      'set',
      item.id,
      '--project-id',
      project,
      '--price',
      `USD=${desired.usd}`,
    ]);
  }
  return item;
}

async function ensureIosApp(project: string, existing: RcItem[]): Promise<RcItem> {
  const app = existing.find(
    (item) =>
      item.type === 'app_store' &&
      (item.app_store as { bundle_id?: string } | undefined)?.bundle_id === iosBundleId
  );
  if (app) return app;
  const created = data<RcItem>(
    await rc([
      'apps',
      'create',
      '--project-id',
      project,
      '--name',
      'Claire iOS',
      '--type',
      'app_store',
      '--bundle-id',
      iosBundleId,
    ])
  );
  console.log(`Created the Claire iOS app (${iosBundleId}).`);
  return created;
}

async function ensureEntitlement(
  project: string,
  lookupKey: 'plus' | 'pro',
  existing: RcItem[]
): Promise<RcItem> {
  let item = findBy(existing, 'lookup_key', lookupKey);
  if (!item) {
    item = data<RcItem>(
      await rc([
        'entitlements',
        'create',
        '--project-id',
        project,
        '--lookup-key',
        lookupKey,
        '--display-name',
        `Claire ${lookupKey === 'plus' ? 'Plus' : 'Pro'}`,
      ])
    );
    existing.push(item);
    console.log(`Created the ${lookupKey} entitlement.`);
  }
  return item;
}

async function ensureOffering(project: string): Promise<RcItem> {
  const offerings = await list(['offerings', 'list', '--project-id', project]);
  let offering = findBy(offerings, 'lookup_key', 'claire');
  if (!offering) {
    offering = data<RcItem>(
      await rc([
        'offerings',
        'create',
        '--project-id',
        project,
        '--lookup-key',
        'claire',
        '--display-name',
        'Claire',
      ])
    );
    console.log('Created the single-plan Claire offering.');
  }
  if (offering.is_current !== true) {
    await rc(['offerings', 'set-current', offering.id, '--project-id', project, '--yes']);
  }
  return offering;
}

async function ensurePackage(
  project: string,
  offering: RcItem,
  desired: CatalogProduct,
  product: RcItem,
  existing: RcItem[]
): Promise<void> {
  let item = existing.find(
    (candidate) =>
      candidate.lookup_key === desired.packageKey && candidate.offering_id === offering.id
  );
  if (!item) {
    item = data<RcItem>(
      await rc([
        'packages',
        'create',
        offering.id,
        '--project-id',
        project,
        '--lookup-key',
        desired.packageKey,
        '--display-name',
        desired.displayName,
      ])
    );
    item = { ...item, offering_id: offering.id };
    existing.push(item);
    console.log(`Created the ${desired.packageKey} package.`);
  }
  await rc(['packages', 'attach', item.id, product.id, '--project-id', project]);
}

function setEnv(source: string, name: string, value: string): string {
  const line = `${name}=${value}`;
  const pattern = new RegExp(`^${name}=.*$`, 'm');
  if (pattern.test(source)) return source.replace(pattern, line);
  return `${source.replace(/\s*$/, '')}\n${line}\n`;
}

async function publicKey(project: string, app: RcItem, prefix: string): Promise<string> {
  const keys = data<{ items?: Array<{ key?: string }> | null }>(
    await rc(['apps', 'keys', app.id, '--project-id', project])
  ).items;
  const key = keys?.find((item) => item.key?.startsWith(prefix))?.key;
  if (!key) throw new Error(`RevenueCat did not return a ${prefix} public SDK key.`);
  return key;
}

async function syncClientKeys(project: string, testStore: RcItem, iosApp: RcItem): Promise<void> {
  const [testKey, iosKey] = await Promise.all([
    publicKey(project, testStore, 'test_'),
    publicKey(project, iosApp, 'appl_'),
  ]);
  if (!testKey) throw new Error('RevenueCat did not return a Test Store public SDK key.');

  let env = '';
  try {
    env = await readFile(clientEnvPath, 'utf8');
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
  }
  env = setEnv(env, 'EXPO_PUBLIC_REVENUECAT_TEST_API_KEY', testKey);
  env = setEnv(env, 'EXPO_PUBLIC_REVENUECAT_IOS_API_KEY', iosKey);
  await writeFile(clientEnvPath, env, { mode: 0o600 });
  console.log('Synced the Test Store and iOS public keys to apps/client/.env.local.');
}

type VerifiedPackage = {
  package?: { lookup_key?: string };
  products?: Array<{
    product?: { app_id?: string; subscription?: { duration?: string | null } };
  }>;
};

async function verify(
  project: string,
  offering: RcItem,
  testStore: RcItem,
  iosApp: RcItem
): Promise<void> {
  const result = data<{ packages?: VerifiedPackage[]; issues?: string[] }>(
    await rc(['offerings', 'verify', offering.id, '--project-id', project])
  );
  const blockingIssues = (result.issues || []).filter(
    (issue) => issue !== 'offering has no attached paywall'
  );

  if (!result.packages?.some((item) => item.package?.lookup_key === 'pro_monthly'))
    blockingIssues.push('current offering does not contain the Claire monthly package');
  for (const desired of catalog) {
    const item = result.packages?.find(
      (candidate) => candidate.package?.lookup_key === desired.packageKey
    );
    const appIds = new Set(item?.products?.map((product) => product.product?.app_id));
    if (!appIds.has(testStore.id))
      blockingIssues.push(`${desired.packageKey} is missing its Test Store product`);
    if (!appIds.has(iosApp.id))
      blockingIssues.push(`${desired.packageKey} is missing its App Store product`);
    const iosProduct = item?.products?.find(
      (product) => product.product?.app_id === iosApp.id
    )?.product;
    if (iosProduct && iosProduct.subscription?.duration !== desired.duration)
      blockingIssues.push(`${desired.storeId} has not been synced from App Store Connect`);
  }

  const apple = iosApp.app_store as
    | {
        app_store_connect_api_key_configured?: boolean;
        subscription_key_configured?: boolean;
      }
    | undefined;
  if (!apple?.app_store_connect_api_key_configured)
    blockingIssues.push(
      'the iOS app has no App Store Connect API key (run `bun run revenuecat:apple`)'
    );
  if (!apple?.subscription_key_configured)
    blockingIssues.push(
      'the iOS app has no in-app purchase key (run `bun run revenuecat:apple`)'
    );

  if (blockingIssues.length) {
    throw new Error(
      `RevenueCat production readiness failed:\n- ${blockingIssues.join('\n- ')}`
    );
  }
  console.log('Verified the current Claire monthly offering and Apple credentials.');
}

async function main() {
  const project = await projectId();
  await rc(['projects', 'use', project]);
  const apps = await list(['apps', 'list', '--project-id', project]);
  const testStore = findBy(apps, 'type', 'test_store');
  if (!testStore) {
    throw new Error(
      'This project has no Test Store. RevenueCat currently requires that one-time provider creation in Apps > Test configuration; then rerun this command.'
    );
  }

  const iosApp = await ensureIosApp(project, apps);

  const offering = await ensureOffering(project);
  if (process.argv.includes('--verify-only')) {
    await verify(project, offering, testStore, iosApp);
    return;
  }

  const [products, entitlements] = await Promise.all([
    list(['products', 'list', '--project-id', project]),
    list(['entitlements', 'list', '--project-id', project]),
  ]);
  const productByStoreId = new Map<string, RcItem[]>();
  for (const desired of catalog) {
    const storeProducts = await Promise.all([
      ensureProduct(project, testStore.id, desired, products, 'test_store'),
      ensureProduct(project, iosApp.id, desired, products, 'app_store'),
    ]);
    productByStoreId.set(desired.storeId, storeProducts);
  }

  for (const lookupKey of ['pro'] as const) {
    const entitlement = await ensureEntitlement(project, lookupKey, entitlements);
    const attached = catalog
      .filter((item) => item.plan === lookupKey)
      .flatMap((item) => productByStoreId.get(item.storeId)?.map((product) => product.id) || [])
      .filter((id): id is string => Boolean(id));
    await rc(['entitlements', 'attach', entitlement.id, ...attached, '--project-id', project]);
  }

  const packages = await list(['packages', 'list', offering.id, '--project-id', project]);
  for (const desired of catalog) {
    const storeProducts = productByStoreId.get(desired.storeId);
    if (!storeProducts?.length) throw new Error(`Missing RevenueCat product ${desired.storeId}.`);
    for (const product of storeProducts) {
      await ensurePackage(project, offering, desired, product, packages);
    }
  }

  await verify(project, offering, testStore, iosApp);
  if (!process.argv.includes('--no-sync-client-env'))
    await syncClientKeys(project, testStore, iosApp);
  console.log(`RevenueCat Test Store and iOS catalogs are ready for project ${project}.`);
}

await main();
