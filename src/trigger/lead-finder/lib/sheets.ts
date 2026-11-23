import { OAuth2Client } from "google-auth-library";
import type { Lead } from "./types.js";

const SHEETS_API = "https://sheets.googleapis.com/v4/spreadsheets";
export const SHEETS_SCOPE = "https://www.googleapis.com/auth/spreadsheets";

export const LEADS_TAB = "Leads";
export const RUNS_TAB = "Runs";

export const LEAD_HEADERS = [
  "Date Found",
  "Search",
  "Business Name",
  "Category",
  "Phone",
  "Website",
  "Address",
  "Rating",
  "Reviews",
  "Distance (km)",
  "Lead Score",
  "Signals",
  "Google Maps Link",
  "Place ID",
] as const;

export const RUN_HEADERS = [
  "Run At",
  "Search",
  "Center",
  "Radius (km)",
  "Found In Radius",
  "New Leads",
  "Google Requests",
  "Tiled Search",
] as const;

export type Cell = string | number;

export interface SheetsCredentials {
  clientId: string;
  clientSecret: string;
  refreshToken: string;
  sheetId: string;
}

/** 0 → "A", 13 → "N", 26 → "AA" */
export function columnLetter(index: number): string {
  const letter = String.fromCharCode(65 + (index % 26));
  return index < 26 ? letter : columnLetter(Math.floor(index / 26) - 1) + letter;
}

const PLACE_ID_COLUMN = columnLetter(LEAD_HEADERS.indexOf("Place ID"));

export function leadToRow(lead: Lead, search: string, foundAt: string): Cell[] {
  return [
    foundAt,
    search,
    lead.name,
    lead.category,
    lead.phone,
    lead.website,
    lead.address,
    lead.rating ?? "",
    lead.reviewCount,
    lead.distanceKm,
    lead.score,
    lead.signals.join("; "),
    lead.mapsUrl,
    lead.placeId,
  ];
}

export function createSheetsClient(credentials: SheetsCredentials) {
  const auth = new OAuth2Client({ clientId: credentials.clientId, clientSecret: credentials.clientSecret });
  auth.setCredentials({ refresh_token: credentials.refreshToken });
  const baseUrl = `${SHEETS_API}/${credentials.sheetId}`;

  async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
    const { token } = await auth.getAccessToken();
    if (!token) throw new Error("Could not get a Google access token — re-run the Google sign-in setup");

    const response = await fetch(`${baseUrl}${path}`, {
      ...init,
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    });
    if (!response.ok) {
      const body = (await response.text()).slice(0, 300);
      const hint =
        response.status === 403 || response.status === 404
          ? " — check GOOGLE_SHEET_ID and that the signed-in Google account can edit the sheet"
          : "";
      throw new Error(`Google Sheets request failed (HTTP ${response.status})${hint}: ${body}`);
    }
    return (await response.json()) as T;
  }

  const range = (a1: string) => `/values/${encodeURIComponent(a1)}`;

  async function ensureTab(existingTabs: string[], tab: string, headers: readonly string[]) {
    if (!existingTabs.includes(tab)) {
      await request(":batchUpdate", {
        method: "POST",
        body: JSON.stringify({ requests: [{ addSheet: { properties: { title: tab } } }] }),
      });
    }
    const firstRow = await request<{ values?: Cell[][] }>(range(`${tab}!1:1`));
    if (!firstRow.values?.length) {
      await request(`${range(`${tab}!A1`)}?valueInputOption=RAW`, {
        method: "PUT",
        body: JSON.stringify({ values: [headers] }),
      });
    }
  }

  return {
    /** Creates the Leads and Runs tabs (with header rows) if they don't exist yet. */
    async ensureTabs(): Promise<void> {
      const meta = await request<{ sheets?: Array<{ properties?: { title?: string } }> }>(
        "?fields=sheets.properties.title",
      );
      const existingTabs = (meta.sheets ?? []).map((sheet) => sheet.properties?.title ?? "");
      await ensureTab(existingTabs, LEADS_TAB, LEAD_HEADERS);
      await ensureTab(existingTabs, RUNS_TAB, RUN_HEADERS);
    },

    /** Place IDs already in the Leads tab — used to append only new businesses. */
    async readExistingPlaceIds(): Promise<Set<string>> {
      const data = await request<{ values?: Cell[][] }>(
        range(`${LEADS_TAB}!${PLACE_ID_COLUMN}2:${PLACE_ID_COLUMN}`),
      );
      return new Set((data.values ?? []).map((row) => String(row[0] ?? "")).filter(Boolean));
    },

    async appendRows(tab: string, rows: Cell[][]): Promise<void> {
      if (rows.length === 0) return;
      await request(`${range(`${tab}!A1`)}:append?valueInputOption=RAW&insertDataOption=INSERT_ROWS`, {
        method: "POST",
        body: JSON.stringify({ values: rows }),
      });
    },
  };
}
