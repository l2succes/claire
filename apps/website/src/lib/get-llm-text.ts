// SPDX-License-Identifier: Apache-2.0
import { source } from '@/lib/source';

export async function getLLMText(page: ReturnType<typeof source.getPages>[number]) {
  const processed = await page.data.getText('processed');
  return `# ${page.data.title} (${page.url})

${page.data.description ?? ''}

${processed}`;
}
