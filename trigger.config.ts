import { defineConfig } from "@trigger.dev/sdk"

export default defineConfig({
  project: "proj_zxubrpvpyqbnldmxlinf",
  runtime: "node-22",
  // wait.for() is a durable pause — actual compute time is short for all tasks
  maxDuration: 300,
  dirs: ["./src/trigger"],
  build: {
    // jsdom (via isomorphic-dompurify in lib/emailTemplates.ts) reads its
    // own asset files at runtime and breaks when bundled — the Trigger
    // deploy failed while loading campaignSend with ENOENT on jsdom's
    // browser/default-stylesheet.css. Keep both external so they install
    // normally instead of being bundled. (Fix found by Bear's local
    // Claude Code during the Oct 16 deploy attempt; committed here so
    // every future deploy carries it.)
    external: ["isomorphic-dompurify", "jsdom"],
  },
})
