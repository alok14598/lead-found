import { describe, expect, it } from "vitest";
import { columnLetter, LEAD_HEADERS, leadToRow } from "../src/trigger/lead-finder/lib/sheets.js";

describe("columnLetter", () => {
  it("converts indexes to spreadsheet columns", () => {
    expect([0, 13, 25, 26, 27].map(columnLetter)).toEqual(["A", "N", "Z", "AA", "AB"]);
  });
});

describe("leadToRow", () => {
  it("produces one cell per header, with Place ID last", () => {
    const row = leadToRow(
      {
        placeId: "abc",
        name: "Smile Dental",
        category: "Dentist",
        phone: "+91 1",
        website: "",
        address: "Koramangala",
        rating: null,
        reviewCount: 3,
        mapsUrl: "https://maps",
        location: { lat: 0, lng: 0 },
        distanceKm: 1.2,
        score: 65,
        signals: ["No website", "Phone available"],
      },
      "Dentists",
      "2026-11-23T03:30:00Z",
    );
    expect(row).toHaveLength(LEAD_HEADERS.length);
    expect(row.at(-1)).toBe("abc");
    expect(row[7]).toBe("");
    expect(row[11]).toBe("No website; Phone available");
  });
});
