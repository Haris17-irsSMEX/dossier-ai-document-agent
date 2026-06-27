import { defineConfig } from "@trigger.dev/sdk/v3";

export default defineConfig({
  project: process.env.TRIGGER_PROJECT_REF || "applicationops-ai",
  dirs: ["./src/trigger"],
  runtime: "node",
  maxDuration: 300
});
