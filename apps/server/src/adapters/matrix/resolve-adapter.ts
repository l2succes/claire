import type { IPlatformAdapter } from '../types';
import { DemoBridgeAdapter } from '../demo';
import { MatrixBridgeAdapter } from './index';

/** Demo mode decorates the live transport; it does not change its capabilities. */
export function matrixBridgeFor(adapter: IPlatformAdapter | undefined): MatrixBridgeAdapter | null {
  const transport = adapter instanceof DemoBridgeAdapter ? adapter.getDelegate() : adapter;
  return transport instanceof MatrixBridgeAdapter ? transport : null;
}
