import { tileCenters } from "./geo.js";
import type { Business, LatLng } from "./types.js";

const SEARCH_TEXT_URL = "https://places.googleapis.com/v1/places:searchText";
const PAGE_SIZE = 20;
const MAX_PAGES = 3; // Google returns at most 60 results (3 pages of 20) per query
const MAX_RESULTS_PER_QUERY = PAGE_SIZE * MAX_PAGES;
const METERS_PER_KM = 1000;
const MAX_BIAS_RADIUS_M = 50_000;

const BUSINESS_FIELD_MASK = [
  "places.id",
  "places.displayName",
  "places.formattedAddress",
  "places.location",
  "places.nationalPhoneNumber",
  "places.internationalPhoneNumber",
  "places.websiteUri",
  "places.rating",
  "places.userRatingCount",
  "places.googleMapsUri",
  "places.businessStatus",
  "places.primaryTypeDisplayName",
  "nextPageToken",
].join(",");

const GEOCODE_FIELD_MASK = "places.location,places.formattedAddress";

interface PlacesApiPlace {
  id?: string;
  displayName?: { text?: string };
  formattedAddress?: string;
  location?: { latitude?: number; longitude?: number };
  nationalPhoneNumber?: string;
  internationalPhoneNumber?: string;
  websiteUri?: string;
  rating?: number;
  userRatingCount?: number;
  googleMapsUri?: string;
  businessStatus?: string;
  primaryTypeDisplayName?: { text?: string };
}

interface SearchTextResponse {
  places?: PlacesApiPlace[];
  nextPageToken?: string;
}

export interface AreaSearchResult {
  businesses: Business[];
  requests: number;
  tiled: boolean;
}

function readGoogleError(body: string): string {
  try {
    const parsed = JSON.parse(body) as { error?: { message?: string; status?: string } };
    return parsed.error?.message ?? parsed.error?.status ?? body.slice(0, 300);
  } catch {
    return body.slice(0, 300);
  }
}

async function searchText(
  apiKey: string,
  fieldMask: string,
  body: Record<string, unknown>,
): Promise<SearchTextResponse> {
  const response = await fetch(SEARCH_TEXT_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Goog-Api-Key": apiKey,
      "X-Goog-FieldMask": fieldMask,
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const message = readGoogleError(await response.text());
    throw new Error(`Google Places request failed (HTTP ${response.status}): ${message}`);
  }
  return (await response.json()) as SearchTextResponse;
}

/** Turns a place name like "Koramangala, Bengaluru" into coordinates. */
export async function geocode(
  apiKey: string,
  location: string,
): Promise<{ center: LatLng; address: string }> {
  const data = await searchText(apiKey, GEOCODE_FIELD_MASK, { textQuery: location, pageSize: 1 });
  const place = data.places?.[0];
  const lat = place?.location?.latitude;
  const lng = place?.location?.longitude;
  if (lat === undefined || lng === undefined) {
    throw new Error(`Google Maps could not find the location "${location}". Make it more specific.`);
  }
  return { center: { lat, lng }, address: place?.formattedAddress ?? location };
}

/** Normalises a Places API record; drops records without an ID/location and closed businesses. */
export function toBusiness(place: PlacesApiPlace): Business | null {
  const lat = place.location?.latitude;
  const lng = place.location?.longitude;
  if (!place.id || lat === undefined || lng === undefined) return null;
  if (place.businessStatus === "CLOSED_PERMANENTLY") return null;

  return {
    placeId: place.id,
    name: place.displayName?.text ?? "(no name)",
    category: place.primaryTypeDisplayName?.text ?? "",
    phone: place.internationalPhoneNumber ?? place.nationalPhoneNumber ?? "",
    website: place.websiteUri ?? "",
    address: place.formattedAddress ?? "",
    rating: place.rating ?? null,
    reviewCount: place.userRatingCount ?? 0,
    mapsUrl: place.googleMapsUri ?? "",
    location: { lat, lng },
  };
}

/** One query around one circle, following up to 3 pages. */
async function searchCircle(
  apiKey: string,
  niche: string,
  center: LatLng,
  radiusKm: number,
  maxRequests: number,
): Promise<{ places: PlacesApiPlace[]; requests: number }> {
  const baseBody = {
    textQuery: niche,
    pageSize: PAGE_SIZE,
    locationBias: {
      circle: {
        center: { latitude: center.lat, longitude: center.lng },
        radius: Math.min(radiusKm * METERS_PER_KM, MAX_BIAS_RADIUS_M),
      },
    },
  };

  let places: PlacesApiPlace[] = [];
  let pageToken: string | undefined;
  let requests = 0;

  do {
    const data = await searchText(
      apiKey,
      BUSINESS_FIELD_MASK,
      pageToken ? { ...baseBody, pageToken } : baseBody,
    );
    requests += 1;
    places = [...places, ...(data.places ?? [])];
    pageToken = data.nextPageToken;
  } while (pageToken && requests < MAX_PAGES && requests < maxRequests);

  return { places, requests };
}

function uniqueBusinesses(places: PlacesApiPlace[]): Business[] {
  const byId = new Map<string, Business>();
  for (const place of places) {
    const business = toBusiness(place);
    if (business && !byId.has(business.placeId)) byId.set(business.placeId, business);
  }
  return [...byId.values()];
}

/**
 * Finds every business matching `niche` around `center`.
 * Google caps a query at 60 results, so when the whole circle hits that cap it is split into
 * smaller tiles and each tile is searched too (bounded by maxRequests to control cost).
 */
export async function searchArea(options: {
  apiKey: string;
  niche: string;
  center: LatLng;
  radiusKm: number;
  maxRequests: number;
}): Promise<AreaSearchResult> {
  const { apiKey, niche, center, radiusKm, maxRequests } = options;

  const first = await searchCircle(apiKey, niche, center, radiusKm, maxRequests);
  const isSaturated = first.places.length >= MAX_RESULTS_PER_QUERY;
  if (!isSaturated || first.requests >= maxRequests) {
    return { businesses: uniqueBusinesses(first.places), requests: first.requests, tiled: false };
  }

  const tileRadiusKm = radiusKm / 2;
  let places = first.places;
  let requests = first.requests;

  for (const tile of tileCenters(center, radiusKm, tileRadiusKm)) {
    const remaining = maxRequests - requests;
    if (remaining <= 0) break;
    const result = await searchCircle(apiKey, niche, tile, tileRadiusKm, remaining);
    places = [...places, ...result.places];
    requests += result.requests;
  }

  return { businesses: uniqueBusinesses(places), requests, tiled: true };
}
