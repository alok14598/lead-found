import { logger, schemaTask } from "@trigger.dev/sdk";
import { searchLabel, searchSchema } from "./lib/config.js";
import { readEnv } from "./lib/env.js";
import { geocode, searchArea } from "./lib/google-places.js";
import { toLeads } from "./lib/lead-score.js";
import { createSheetsClient, leadToRow, LEADS_TAB, RUNS_TAB } from "./lib/sheets.js";

/**
 * Runs one search (niche + location + radius) and appends the new leads to the Google Sheet.
 * Triggered by check-searches on schedule, or manually from the dashboard with a payload like:
 * { "niche": "dentist", "location": "Koramangala, Bengaluru", "radiusKm": 5 }
 */
export const processSearch = schemaTask({
  id: "lead-finder-process-search",
  schema: searchSchema,
  // One at a time, so two searches never race while de-duplicating against the sheet
  queue: { concurrencyLimit: 1 },
  maxDuration: 600,
  run: async (search) => {
    const env = readEnv();
    const label = searchLabel(search);

    const { center, address } = await geocode(env.googlePlacesApiKey, search.location);
    logger.info("Resolved location", { label, address, center });

    const { businesses, requests, tiled } = await searchArea({
      apiKey: env.googlePlacesApiKey,
      niche: search.niche,
      center,
      radiusKm: search.radiusKm,
      maxRequests: search.maxRequests,
    });
    const leads = toLeads(businesses, center, search.radiusKm);
    logger.info("Google Maps search done", {
      label,
      returned: businesses.length,
      insideRadius: leads.length,
      requests,
      tiled,
    });

    const sheets = createSheetsClient({
      clientId: env.oauthClientId,
      clientSecret: env.oauthClientSecret,
      refreshToken: env.oauthRefreshToken,
      sheetId: env.sheetId,
    });
    await sheets.ensureTabs();
    const existingIds = await sheets.readExistingPlaceIds();
    const newLeads = leads.filter((lead) => !existingIds.has(lead.placeId));

    const now = new Date().toISOString();
    await sheets.appendRows(
      LEADS_TAB,
      newLeads.map((lead) => leadToRow(lead, label, now)),
    );
    await sheets.appendRows(RUNS_TAB, [
      [now, label, address, search.radiusKm, leads.length, newLeads.length, requests, tiled ? "yes" : "no"],
    ]);

    logger.info("Sheet updated", { label, newLeads: newLeads.length });
    return {
      search: label,
      foundInRadius: leads.length,
      newLeads: newLeads.length,
      googleRequests: requests,
      tiled,
      topNewLeads: newLeads.slice(0, 5).map((lead) => ({ name: lead.name, score: lead.score })),
    };
  },
});
