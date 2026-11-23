import { defineConfig } from "@trigger.dev/sdk";

export default defineConfig({
  // Your project ref from cloud.trigger.dev → Project settings (looks like "proj_abc123")
  project: "proj_wejgnwvfgfcrryfxjsda",
  dirs: ["./src/trigger"],
  maxDuration: 600,
  retries: {
    enabledInDev: true,
    default: {
      maxAttempts: 3,
      factor: 2,
      minTimeoutInMs: 5_000,
      maxTimeoutInMs: 30_000,
    },
  },
});
