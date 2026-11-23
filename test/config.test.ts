import { describe, expect, it } from "vitest";
import rawConfig from "../config/searches.json";
import { parseConfig, searchLabel } from "../src/trigger/lead-finder/lib/config.js";

describe("parseConfig", () => {
  it("accepts the shipped config/searches.json", () => {
    const config = parseConfig(rawConfig);
    expect(config.runEveryDays).toBe(2);
    expect(config.searches.length).toBeGreaterThan(0);
  });

  it("applies defaults", () => {
    const config = parseConfig({ searches: [{ niche: "cafe", location: "Indiranagar", radiusKm: 2 }] });
    expect(config.runEveryDays).toBe(2);
    expect(config.searches[0]?.maxRequests).toBe(30);
  });

  it("rejects a bad radius with a readable message", () => {
    expect(() => parseConfig({ searches: [{ niche: "cafe", location: "Indiranagar", radiusKm: 0 }] })).toThrow(
      /searches\.json is invalid[\s\S]*radiusKm/,
    );
  });

  it("rejects an empty search list", () => {
    expect(() => parseConfig({ searches: [] })).toThrow(/at least one search/);
  });
});

describe("searchLabel", () => {
  it("uses the label when present, otherwise builds one", () => {
    expect(searchLabel({ label: "My dentists", niche: "dentist", location: "X", radiusKm: 5 })).toBe("My dentists");
    expect(searchLabel({ niche: "dentist", location: "X", radiusKm: 5 })).toBe("dentist · X · 5 km");
  });
});
