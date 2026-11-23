import { describe, expect, it } from "vitest";
import { distanceKm, isRunDay, offsetKm, tileCenters } from "../src/trigger/lead-finder/lib/geo.js";

const BENGALURU = { lat: 12.9352, lng: 77.6245 };

describe("distanceKm", () => {
  it("returns ~111 km for one degree of latitude", () => {
    expect(distanceKm({ lat: 0, lng: 0 }, { lat: 1, lng: 0 })).toBeCloseTo(111.19, 1);
  });

  it("returns 0 for the same point", () => {
    expect(distanceKm(BENGALURU, BENGALURU)).toBe(0);
  });
});

describe("offsetKm", () => {
  it("moves a point by the requested distance", () => {
    const moved = offsetKm(BENGALURU, 3, 4);
    expect(distanceKm(BENGALURU, moved)).toBeCloseTo(5, 1);
  });
});

describe("tileCenters", () => {
  it("covers every point inside the search circle", () => {
    const radiusKm = 5;
    const tileRadiusKm = 2.5;
    const tiles = tileCenters(BENGALURU, radiusKm, tileRadiusKm);

    // Sample points across the whole circle, including its edge
    const samples = Array.from({ length: 36 }, (_, a) => a * 10).flatMap((deg) =>
      [0, 1.7, 3.4, 5].map((r) =>
        offsetKm(BENGALURU, r * Math.cos((deg * Math.PI) / 180), r * Math.sin((deg * Math.PI) / 180)),
      ),
    );

    for (const point of samples) {
      const nearest = Math.min(...tiles.map((tile) => distanceKm(tile, point)));
      expect(nearest).toBeLessThanOrEqual(tileRadiusKm + 0.05);
    }
  });

  it("drops tiles that cannot touch the circle", () => {
    const tiles = tileCenters(BENGALURU, 5, 2.5);
    for (const tile of tiles) {
      expect(distanceKm(BENGALURU, tile)).toBeLessThanOrEqual(7.5 + 0.05);
    }
    expect(tiles.length).toBe(13);
  });
});

describe("isRunDay", () => {
  it("alternates day by day, including across a month boundary", () => {
    const days = ["2026-01-30", "2026-01-31", "2026-02-01", "2026-02-02"].map((d) =>
      isRunDay(new Date(`${d}T03:30:00Z`), 2),
    );
    expect(days).toEqual([days[0], !days[0], days[0], !days[0]]);
  });

  it("runs every day when everyDays is 1", () => {
    expect(isRunDay(new Date("2026-03-07T03:30:00Z"), 1)).toBe(true);
  });
});
