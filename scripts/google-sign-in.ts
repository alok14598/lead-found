// One-time setup: signs in to Google with credentials.json (OAuth desktop client),
// saves a refresh token to .env, and creates the leads spreadsheet if GOOGLE_SHEET_ID is empty.
// Run: npm run google:sign-in
import { spawn } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { OAuth2Client } from "google-auth-library";

const CREDENTIALS_FILE = "credentials.json";
const ENV_FILE = ".env";
const SHEETS_SCOPE = "https://www.googleapis.com/auth/spreadsheets";
const SPREADSHEET_TITLE = "Local Business Leads";
const SIGN_IN_TIMEOUT_MS = 5 * 60 * 1000;

interface OAuthClientFile {
  installed?: { client_id?: string; client_secret?: string };
  web?: { client_id?: string; client_secret?: string };
}

function readClient(): { clientId: string; clientSecret: string } {
  if (!existsSync(CREDENTIALS_FILE)) throw new Error(`${CREDENTIALS_FILE} not found in the project folder`);
  const file = JSON.parse(readFileSync(CREDENTIALS_FILE, "utf8")) as OAuthClientFile;
  const client = file.installed ?? file.web;
  if (!client?.client_id || !client.client_secret) {
    throw new Error(`${CREDENTIALS_FILE} is not an OAuth client file (expected "installed.client_id")`);
  }
  return { clientId: client.client_id, clientSecret: client.client_secret };
}

function readEnvFile(): Map<string, string> {
  const text = existsSync(ENV_FILE) ? readFileSync(ENV_FILE, "utf8") : "";
  const entries = text
    .split("\n")
    .map((line) => line.match(/^([A-Z0-9_]+)=(.*)$/))
    .filter((match): match is RegExpMatchArray => match !== null)
    .map((match) => [match[1]!, match[2]!.replace(/^"(.*)"$/, "$1")] as const);
  return new Map(entries);
}

function writeEnvFile(values: Record<string, string>): void {
  const content = `# Google Places API (New) key — console.cloud.google.com → APIs & Services → Credentials
GOOGLE_PLACES_API_KEY=${values.GOOGLE_PLACES_API_KEY ?? ""}

# Google sign-in for Sheets (from credentials.json + npm run google:sign-in)
GOOGLE_OAUTH_CLIENT_ID=${values.GOOGLE_OAUTH_CLIENT_ID ?? ""}
GOOGLE_OAUTH_CLIENT_SECRET=${values.GOOGLE_OAUTH_CLIENT_SECRET ?? ""}
GOOGLE_OAUTH_REFRESH_TOKEN=${values.GOOGLE_OAUTH_REFRESH_TOKEN ?? ""}

# The long ID in your sheet URL: docs.google.com/spreadsheets/d/<THIS_PART>/edit
GOOGLE_SHEET_ID=${values.GOOGLE_SHEET_ID ?? ""}
`;
  writeFileSync(ENV_FILE, content);
}

/** Opens Google's consent page and waits for the redirect back to a local port. */
async function signIn(clientId: string, clientSecret: string): Promise<OAuth2Client> {
  let client: OAuth2Client | undefined;
  return new Promise<OAuth2Client>((resolve, reject) => {
    const server = createServer(async (req, res) => {
      const url = new URL(req.url ?? "/", "http://127.0.0.1");
      const code = url.searchParams.get("code");
      const error = url.searchParams.get("error");
      if (!code && !error) {
        res.writeHead(404).end();
        return;
      }
      res.writeHead(200, { "Content-Type": "text/html" });
      res.end(
        error
          ? `<h2>Google sign-in failed: ${error}</h2>`
          : "<h2>Signed in. You can close this tab and go back to the terminal.</h2>",
      );
      server.close();
      clearTimeout(timer);
      if (error || !code) {
        reject(new Error(`Google sign-in was not completed: ${error}`));
        return;
      }
      try {
        const { tokens } = await client!.getToken(code);
        if (!tokens.refresh_token) throw new Error("Google did not return a refresh token");
        client!.setCredentials(tokens);
        resolve(client!);
      } catch (err) {
        reject(err);
      }
    });

    const timer = setTimeout(() => {
      server.close();
      reject(new Error("Timed out waiting for Google sign-in (5 minutes)"));
    }, SIGN_IN_TIMEOUT_MS);

    server.listen(0, "127.0.0.1", () => {
      const { port } = server.address() as AddressInfo;
      client = new OAuth2Client({ clientId, clientSecret, redirectUri: `http://127.0.0.1:${port}` });
      const authUrl = client.generateAuthUrl({ access_type: "offline", prompt: "consent", scope: [SHEETS_SCOPE] });
      process.stdout.write(`\nOpening Google sign-in in your browser. If it doesn't open, visit:\n${authUrl}\n\n`);
      spawn("open", [authUrl], { stdio: "ignore", detached: true }).unref();
    });
  });
}

async function createSpreadsheet(client: OAuth2Client): Promise<{ id: string; url: string }> {
  const { token } = await client.getAccessToken();
  const response = await fetch("https://sheets.googleapis.com/v4/spreadsheets", {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      properties: { title: SPREADSHEET_TITLE },
      sheets: [{ properties: { title: "Leads" } }, { properties: { title: "Runs" } }],
    }),
  });
  if (!response.ok) {
    throw new Error(`Could not create the spreadsheet (HTTP ${response.status}): ${(await response.text()).slice(0, 300)}`);
  }
  const data = (await response.json()) as { spreadsheetId: string; spreadsheetUrl: string };
  return { id: data.spreadsheetId, url: data.spreadsheetUrl };
}

async function main(): Promise<void> {
  const { clientId, clientSecret } = readClient();
  const client = await signIn(clientId, clientSecret);
  const refreshToken = client.credentials.refresh_token ?? "";
  process.stdout.write("Signed in to Google. Refresh token saved to .env (not shown).\n");

  const env = readEnvFile();
  let sheetId = env.get("GOOGLE_SHEET_ID") ?? "";
  if (!sheetId) {
    const sheet = await createSpreadsheet(client);
    sheetId = sheet.id;
    process.stdout.write(`Created spreadsheet "${SPREADSHEET_TITLE}": ${sheet.url}\n`);
  }

  writeEnvFile({
    GOOGLE_PLACES_API_KEY: env.get("GOOGLE_PLACES_API_KEY") ?? "",
    GOOGLE_OAUTH_CLIENT_ID: clientId,
    GOOGLE_OAUTH_CLIENT_SECRET: clientSecret,
    GOOGLE_OAUTH_REFRESH_TOKEN: refreshToken,
    GOOGLE_SHEET_ID: sheetId,
  });
  process.stdout.write(".env updated.\n");
}

main().catch((error: unknown) => {
  process.stderr.write(`\n${error instanceof Error ? error.message : String(error)}\n`);
  process.exit(1);
});
