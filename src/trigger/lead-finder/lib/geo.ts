import type { LatLng } from "./types.js";

const EARTH_RADIUS_KM = 6371;
const KM_PER_DEGREE_LAT = 111.32;
const MS_PER_DAY = 86_400_000;

const toRadians = (degrees: number) => (degrees * Math.PI) / 180;

/** Great-circle distance between two points (haversine). */
export function distanceKm(a: LatLng, b: LatLng): number {
  const dLat = toRadians(b.lat - a.lat);
  const dLng = toRadians(b.lng - a.lng);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRadians(a.lat)) * Math.cos(toRadians(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.sqrt(h));
}

/** Moves a point east (dxKm) and north (dyKm). Accurate enough for city-scale offsets. */
export function offsetKm(center: LatLng, dxKm: number, dyKm: number): LatLng {
  const kmPerDegreeLng = KM_PER_DEGREE_LAT * Math.cos(toRadians(center.lat));
  return {
    lat: center.lat + dyKm / KM_PER_DEGREE_LAT,
    lng: center.lng + dxKm / kmPerDegreeLng,
  };
}

/**
 * Centres of smaller circles (radius tileRadiusKm) that together cover the big circle.
 * Each tile circle encloses one square cell of a grid, so the cells — and therefore the
 * circles — leave no gaps. Cells that cannot touch the big circle are dropped.
 */
export function tileCenters(center: LatLng, radiusKm: number, tileRadiusKm: number): LatLng[] {
  const step = tileRadiusKm * Math.SQRT2;
  const reach = radiusKm + tileRadiusKm;
  const steps = Math.ceil(reach / step);
  const indices = Array.from({ length: steps * 2 + 1 }, (_, i) => i - steps);

  return indices.flatMap((i) =>
    indices
      .filter((j) => Math.hypot(i * step, j * step) <= reach)
      .map((j) => offsetKm(center, i * step, j * step)),
  );
}

/**
 * True on every Nth calendar day (UTC), counted from 1970-01-01.
 * Unlike a "* /2" day-of-month cron, this never runs two days in a row across month ends.
 */
export function isRunDay(date: Date, everyDays: number): boolean {
  return Math.floor(date.getTime() / MS_PER_DAY) % everyDays === 0;
}
