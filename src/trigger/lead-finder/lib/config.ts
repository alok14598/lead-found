import { z } from "zod";

const MAX_RADIUS_KM = 50; // Google's location bias accepts at most 50 km
const DEFAULT_MAX_REQUESTS = 30;

export const searchSchema = z.object({
  label: z.string().trim().min(1).optional(),
  niche: z.string().trim().min(2, "niche must be at least 2 characters, e.g. \"dentist\""),
  location: z.string().trim().min(2, "location must be a place name, e.g. \"Koramangala, Bengaluru\""),
  radiusKm: z.number().positive().max(MAX_RADIUS_KM),
  /** Cost cap: the most Google Places requests this one search may make per run. */
  maxRequests: z.number().int().min(1).max(200).default(DEFAULT_MAX_REQUESTS),
});

export const configSchema = z.object({
  runEveryDays: z.number().int().min(1).max(30).default(2),
  searches: z.array(searchSchema).min(1, "add at least one search"),
});

export type Search = z.output<typeof searchSchema>;
export type LeadFinderConfig = z.output<typeof configSchema>;

export function parseConfig(raw: unknown): LeadFinderConfig {
  const result = configSchema.safeParse(raw);
  if (!result.success) {
    throw new Error(`config/searches.json is invalid:\n${z.prettifyError(result.error)}`);
  }
  return result.data;
}

export function searchLabel(search: Pick<Search, "label" | "niche" | "location" | "radiusKm">): string {
  return search.label ?? `${search.niche} · ${search.location} · ${search.radiusKm} km`;
}
