/**
 * Position Monitoring
 */

import type { PositionState } from "../utils/types";
import { closePosition, getPositionState } from "./position";

export type MonitorPositionOptions = {
  intervalMs?: number;
  stopLoss?: number;
  takeProfit?: number;
  onUpdate?: (state: PositionState) => void;
};

export async function monitorPosition(
  positionAddress: string,
  options: MonitorPositionOptions = {}
): Promise<() => void> {
  const intervalMs = options.intervalMs ?? 5_000;

  let stopped = false;

  const tick = async () => {
    if (stopped) return;

    try {
      const state = await getPositionState(positionAddress);
      options.onUpdate?.(state);

      const price = state.currentPrice;
      if (price === undefined) return;

      if (options.stopLoss !== undefined) {
        const hit =
          state.direction === "long"
            ? price <= options.stopLoss
            : price >= options.stopLoss;
        if (hit) {
          await closePosition(positionAddress, 100);
          stopped = true;
        }
      }

      if (!stopped && options.takeProfit !== undefined) {
        const hit =
          state.direction === "long"
            ? price >= options.takeProfit
            : price <= options.takeProfit;
        if (hit) {
          await closePosition(positionAddress, 100);
          stopped = true;
        }
      }
    } catch (error) {
      console.warn(
        `⚠️  monitorPosition tick failed: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  };

  const handle = setInterval(() => {
    tick().catch(() => undefined);
  }, intervalMs);

  tick().catch(() => undefined);

  return () => {
    stopped = true;
    clearInterval(handle);
  };
}
