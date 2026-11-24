import { writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [{
    // Dev only: bench.html posts its results here, written to bench/last-run.json.
    name: "bench-save",
    configureServer(server) {
      server.middlewares.use("/__bench-save", (req, res) => {
        let body = "";
        req.on("data", (c) => (body += c));
        req.on("end", () => { writeFileSync(resolve(__dirname, "bench/last-run.json"), body); res.end("ok"); });
      });
    },
  }],
  // Fixtures, printouts and the doc generator change outside the app; don't reload pages for them.
  server: { watch: { ignored: ["**/bench/**", "**/tools/**", "**/.firebase/**"] } },
  build: { rollupOptions: { input: { main: resolve(__dirname, "index.html") } } },
});
