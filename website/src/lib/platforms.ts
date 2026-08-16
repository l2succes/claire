// SPDX-License-Identifier: Apache-2.0
import { platformCatalog } from '@claire/platform-catalog';

export function getPlatform(id: string) {
  return platformCatalog.find((platform) => platform.id === id);
}
