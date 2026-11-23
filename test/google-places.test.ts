import { afterEach, describe, expect, it, vi } from "vitest";
import { geocode, searchArea, toBusiness } from "../src/trigger/lead-finder/lib/google-places.js";

const CENTER = { lat: 12.9352, lng: 77.6245 };

const place = (id: string) => ({
  id,
  displayName: { text: `Biz ${id}` },
  location: { latitude: CENTER.lat, longitude: CENTER.lng },
});

const page = (ids: string[], nextPageToken?: string) => ({ places: ids.map(place), nextPageToken });
const ids = (prefix: string, n: number) => Array.from({ length: n }, (_, i) => `${prefix}${i}`);

function mockFetch(responses: unknown[]) {
  const fetchMock = vi.fn();
  for (const body of responses) {
    fetchMock.mockResolvedValueOnce(new Response(JSON.stringify(body), { status: 200 }));
  }
  fetchMock.mockImplementation(async () => new Response(JSON.stringify({ places: [] }), { status: 200 }));
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

afterEach(() => vi.unstubAllGlobals());

describe("toBusiness", () => {
  it("maps API fields and prefers the international phone", () => {
    const business = toBusiness({
      ...place("x"),
      nationalPhoneNumber: "098765",
      internationalPhoneNumber: "+91 98765",
      userRatingCount: 12,
      rating: 4.1,
      primaryTypeDisplayName: { text: "Dentist" },
    });
    expect(business).toMatchObject({ placeId: "x", phone: "+91 98765", reviewCount: 12, category: "Dentist" });
  });

  it("drops permanently closed businesses and records without location", () => {
    expect(toBusiness({ ...place("x"), businessStatus: "CLOSED_PERMANENTLY" })).toBeNull();
    expect(toBusiness({ id: "y" })).toBeNull();
  });
});

describe("geocode", () => {
  it("returns coordinates of the first match", async () => {
    mockFetch([{ places: [{ location: { latitude: 1, longitude: 2 }, formattedAddress: "Somewhere" }] }]);
    await expect(geocode("key", "Somewhere")).resolves.toEqual({ center: { lat: 1, lng: 2 }, address: "Somewhere" });
  });

  it("explains when the location is not found", async () => {
    mockFetch([{}]);
    await expect(geocode("key", "Nowhere")).rejects.toThrow(/could not find the location "Nowhere"/);
  });

  it("surfaces Google's error message without leaking the key", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ error: { message: "API key not valid" } }), { status: 400 }),
      ),
    );
    await expect(geocode("secret-key", "X")).rejects.toThrow("Google Places request failed (HTTP 400): API key not valid");
  });
});

describe("searchArea", () => {
  it("follows page tokens and de-duplicates", async () => {
    const fetchMock = mockFetch([page(["a", "b"], "t1"), page(["b", "c"])]);
    const result = await searchArea({ apiKey: "k", niche: "dentist", center: CENTER, radiusKm: 2, maxRequests: 30 });

    expect(result.businesses.map((b) => b.placeId)).toEqual(["a", "b", "c"]);
    expect(result).toMatchObject({ requests: 2, tiled: false });
    const secondBody = JSON.parse(fetchMock.mock.calls[1]?.[1].body);
    expect(secondBody).toMatchObject({ textQuery: "dentist", pageToken: "t1" });
  });

  it("splits into tiles when the first query hits Google's 60-result cap", async () => {
    mockFetch([page(ids("a", 20), "t1"), page(ids("b", 20), "t2"), page(ids("c", 20)), page(["tile-only"])]);
    const result = await searchArea({ apiKey: "k", niche: "cafe", center: CENTER, radiusKm: 5, maxRequests: 100 });

    expect(result.tiled).toBe(true);
    expect(result.businesses).toHaveLength(61);
    expect(result.requests).toBe(3 + 13); // 3 pages + one request per tile
  });

  it("never exceeds maxRequests", async () => {
    mockFetch([page(ids("a", 20), "t1"), page(ids("b", 20), "t2"), page(ids("c", 20))]);
    const result = await searchArea({ apiKey: "k", niche: "cafe", center: CENTER, radiusKm: 5, maxRequests: 5 });
    expect(result.requests).toBe(5);
  });
});
