import { readFile, readdir } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = fileURLToPath(new URL("../", import.meta.url));
let checked = 0;
for (const file of await readdir(root)) {
  if (!/\.(?:html|js)$/.test(file)) continue;
  const source = await readFile(path.join(root, file), "utf8");
  const scripts = file.endsWith(".js")
    ? [source]
    : [...source.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)]
        .filter(match => !/\bsrc\s*=/i.test(match[1]) && !/application\/(?:ld\+)?json/i.test(match[1]))
        .map(match => match[2]);
  for (const [index, script] of scripts.entries()) {
    if (!script.trim()) continue;
    const result = spawnSync(process.execPath, ["--check", "--input-type=module"], {
      input: script,
      encoding: "utf8",
    });
    if (result.status !== 0) {
      console.error(file, index, result.stderr);
      process.exit(1);
    }
    checked++;
  }
}
console.log(`Checked ${checked} JavaScript files and inline scripts.`);
