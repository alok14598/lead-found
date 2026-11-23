import { describe, expect, it } from "vitest";
import { readEnv } from "../src/trigger/lead-finder/lib/env.js";

const FULL = {
  GOOGLE_PLACES_API_KEY: "key",
  GOOGLE_OAUTH_CLIENT_ID: "client.apps.googleusercontent.com",
  GOOGLE_OAUTH_CLIENT_SECRET: "secret",
  GOOGLE_OAUTH_REFRESH_TOKEN: "refresh",
  GOOGLE_SHEET_ID: " sheet123 ",
};

describe("readEnv", () => {
  it("returns all values, trimmed", () => {
    expect(readEnv(FULL)).toMatchObject({ sheetId: "sheet123", oauthRefreshToken: "refresh" });
  });

  it("lists every missing variable by name", () => {
    expect(() => readEnv({ ...FULL, GOOGLE_SHEET_ID: "", GOOGLE_PLACES_API_KEY: undefined })).toThrow(
      "Missing env vars: GOOGLE_PLACES_API_KEY, GOOGLE_SHEET_ID",
    );
  });
});
