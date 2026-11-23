import { describe, expect, it } from "vitest";
import { SCORE_WEIGHTS, scoreLead, toLeads } from "../src/trigger/lead-finder/lib/lead-score.js";
import type { Business } from "../src/trigger/lead-finder/lib/types.js";

const CENTER = { lat: 12.9352, lng: 77.6245 };

const business = (overrides: Partial<Business> = {}): Business => ({
  placeId: "p1",
  name: "Smile Dental",
  category: "Dentist",
  phone: "+91 98765 43210",
  website: "https://smiledental.in",
  address: "Koramangala",
  rating: 4.5,
  reviewCount: 50,
  mapsUrl: "https://maps.google.com/?cid=1",
  location: CENTER,
  ...overrides,
});

describe("scoreLead", () => {
  it("scores a business with no website and few reviews highly", () => {
    const { score, signals } = scoreLead(business({ website: "", reviewCount: 5 }));
    expect(score).toBe(SCORE_WEIGHTS.noWebsite + SCORE_WEIGHTS.fewReviews + SCORE_WEIGHTS.hasPhone);
    expect(signals).toEqual(["No website", "Few reviews (<20)", "Phone available"]);
  });

  it("flags social-only websites", () => {
    const { signals } = scoreLead(business({ website: "https://instagram.com/smile" }));
    expect(signals).toContain("Website is only a social/listing page");
  });

  it("flags low ratings and missing phone", () => {
    const { signals } = scoreLead(business({ rating: 3.2, phone: "" }));
    expect(signals).toContain("Rating below 4.0");
    expect(signals).toContain("No phone listed");
    expect(signals).not.toContain("Phone available");
  });

  it("does not treat a missing rating as low", () => {
    expect(scoreLead(business({ rating: null })).signals).not.toContain("Rating below 4.0");
  });

  it("never exceeds 100", () => {
    const { score } = scoreLead(business({ website: "", reviewCount: 0, rating: 2 }));
    expect(score).toBeLessThanOrEqual(100);
  });
});

describe("toLeads", () => {
  it("drops businesses outside the radius and sorts by score then distance", () => {
    const near = business({ placeId: "near", location: { lat: CENTER.lat + 0.01, lng: CENTER.lng } });
    const best = business({ placeId: "best", website: "", location: { lat: CENTER.lat + 0.02, lng: CENTER.lng } });
    const far = business({ placeId: "far", location: { lat: CENTER.lat + 0.2, lng: CENTER.lng } });

    const leads = toLeads([far, near, best], CENTER, 5);

    expect(leads.map((l) => l.placeId)).toEqual(["best", "near"]);
    expect(leads[1]?.distanceKm).toBeCloseTo(1.11, 1);
  });
});
