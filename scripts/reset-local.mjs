import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

const result = spawnSync("docker", ["compose", "down", "-v", "--remove-orphans"], {
  cwd: rootDir,
  stdio: "inherit",
  env: process.env
});

if (result.status !== 0) {
  process.exit(result.status ?? 1);
}
