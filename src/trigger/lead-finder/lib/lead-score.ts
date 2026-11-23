import { distanceKm } from "./geo.js";
import type { Business, LatLng, Lead } from "./types.js";

const FEW_REVIEWS = 20;
const ESTABLISHED_REVIEWS = 100;
const LOW_RATING = 4.0;
const MAX_SCORE = 100;

const SOCIAL_ONLY_DOMAINS = [
  "facebook.com",
  "instagram.com",
  "linktr.ee",
  "wa.me",
  "whatsapp.com",
  "business.site",
  "justdial.com",
];

export const SCORE_WEIGHTS = {
  noWebsite: 35,
  socialOnlyWebsite: 25,
  fewReviews: 15,
  lowRating: 15,
  hasPhone: 15,
  established: 10,
} as const;

function isSocialOnly(website: string): boolean {
  const lower = website.toLowerCase();
  return SOCIAL_ONLY_DOMAINS.some((domain) => lower.includes(domain));
}

/**
 * How promising a business is as a buyer of AI automation (0–100), with the reasons.
 * Weak online presence and reputation gaps are what you pitch; a phone number is how you reach them.
 */
export function scoreLead(business: Business): { score: number; signals: string[] } {
  const checks: Array<[boolean, number, string]> = [
    [!business.website, SCORE_WEIGHTS.noWebsite, "No website"],
    [
      Boolean(business.website) && isSocialOnly(business.website),
      SCORE_WEIGHTS.socialOnlyWebsite,
      "Website is only a social/listing page",
    ],
    [business.reviewCount < FEW_REVIEWS, SCORE_WEIGHTS.fewReviews, `Few reviews (<${FEW_REVIEWS})`],
    [
      business.rating !== null && business.rating < LOW_RATING,
      SCORE_WEIGHTS.lowRating,
      `Rating below ${LOW_RATING.toFixed(1)}`,
    ],
    [Boolean(business.phone), SCORE_WEIGHTS.hasPhone, "Phone available"],
    [
      business.reviewCount >= ESTABLISHED_REVIEWS,
      SCORE_WEIGHTS.established,
      `Established (${ESTABLISHED_REVIEWS}+ reviews)`,
    ],
  ];

  const matched = checks.filter(([applies]) => applies);
  const score = Math.min(
    MAX_SCORE,
    matched.reduce((total, [, weight]) => total + weight, 0),
  );
  const signals = matched.map(([, , reason]) => reason);
  return { score, signals: business.phone ? signals : [...signals, "No phone listed"] };
}

/** Keeps businesses inside the radius, scores them, and sorts best-first (then nearest). */
export function toLeads(businesses: Business[], center: LatLng, radiusKm: number): Lead[] {
  return businesses
    .map((business) => ({
      ...business,
      distanceKm: Math.round(distanceKm(center, business.location) * 100) / 100,
      ...scoreLead(business),
    }))
    .filter((lead) => lead.distanceKm <= radiusKm)
    .sort((a, b) => b.score - a.score || a.distanceKm - b.distanceKm);
}
