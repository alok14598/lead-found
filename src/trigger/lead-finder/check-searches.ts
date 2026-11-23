import { idempotencyKeys, logger, schedules } from "@trigger.dev/sdk";
import rawConfig from "../../../config/searches.json";
import { parseConfig } from "./lib/config.js";
import { isRunDay } from "./lib/geo.js";
import { processSearch } from "./process-search.js";

/**
 * Fires every day at 9:00 IST but only does work every `runEveryDays` days (2 = alternate days).
 * Each search in config/searches.json becomes its own process-search run.
 */
export const checkSearches = schedules.task({
  id: "lead-finder-check-searches",
  // IST — Trigger.dev only accepts the older IANA name "Asia/Calcutta", not "Asia/Kolkata"
  cron: { pattern: "0 9 * * *", timezone: "Asia/Calcutta" },
  run: async (payload) => {
    const config = parseConfig(rawConfig);

    if (!isRunDay(payload.timestamp, config.runEveryDays)) {
      logger.info("Not a run day — skipping", { everyDays: config.runEveryDays });
      return { skipped: true, dispatched: 0 };
    }

    const day = payload.timestamp.toISOString().slice(0, 10);
    const items = [];
    for (const [index, search] of config.searches.entries()) {
      // Same search on the same day is never processed twice, even if this task retries
      const idempotencyKey = await idempotencyKeys.create(`lead-finder-${day}-${index}`, {
        scope: "global",
      });
      items.push({ payload: search, options: { idempotencyKey } });
    }

    const batch = await processSearch.batchTrigger(items);
    logger.info("Dispatched searches", { count: items.length, batchId: batch.batchId });
    return { skipped: false, dispatched: items.length, batchId: batch.batchId };
  },
});
