export interface LeadFinderEnv {
  googlePlacesApiKey: string;
  oauthClientId: string;
  oauthClientSecret: string;
  oauthRefreshToken: string;
  sheetId: string;
}

const REQUIRED = {
  googlePlacesApiKey: "GOOGLE_PLACES_API_KEY",
  oauthClientId: "GOOGLE_OAUTH_CLIENT_ID",
  oauthClientSecret: "GOOGLE_OAUTH_CLIENT_SECRET",
  oauthRefreshToken: "GOOGLE_OAUTH_REFRESH_TOKEN",
  sheetId: "GOOGLE_SHEET_ID",
} as const;

type EnvKey = keyof typeof REQUIRED;

/** Reads and validates every env var up front so a run fails fast with a clear message. */
export function readEnv(source: NodeJS.ProcessEnv = process.env): LeadFinderEnv {
  const missing = Object.values(REQUIRED).filter((name) => !source[name]?.trim());
  if (missing.length > 0) {
    throw new Error(
      `Missing env vars: ${missing.join(", ")}. Add them to .env (local) and the Trigger.dev dashboard (production).`,
    );
  }
  const read = (key: EnvKey) => source[REQUIRED[key]]!.trim();
  return {
    googlePlacesApiKey: read("googlePlacesApiKey"),
    oauthClientId: read("oauthClientId"),
    oauthClientSecret: read("oauthClientSecret"),
    oauthRefreshToken: read("oauthRefreshToken"),
    sheetId: read("sheetId"),
  };
}
