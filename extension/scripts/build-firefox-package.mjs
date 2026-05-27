import { cp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";

const root = new URL("..", import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1");
const dist = join(root, "dist");
const firefoxDist = join(root, "dist-firefox");

await rm(firefoxDist, { recursive: true, force: true });
await mkdir(firefoxDist, { recursive: true });
await cp(dist, firefoxDist, { recursive: true });

const manifestPath = join(firefoxDist, "manifest.json");
const manifest = JSON.parse(await readFile(manifestPath, "utf8"));

manifest.background = {
  scripts: ["background.js"],
};

manifest.browser_specific_settings = {
  gecko: {
    id: "raceday-extension@example.com",
    strict_min_version: "109.0",
  },
};

await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
