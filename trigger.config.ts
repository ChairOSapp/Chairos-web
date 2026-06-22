import { defineConfig } from "@trigger.dev/sdk"

export default defineConfig({
  project: "proj_zxubrpvpyqbnldmxlinf",
  // wait.for() is a durable pause — actual compute time is short for all tasks
  maxDuration: 300,
  dirs: ["./src/trigger"],
})
