import { copyFileSync, existsSync } from "node:fs";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const envFiles = [
  [".env.example", ".env"],
  [".env.dev.example", ".env.dev"],
  [".env.prod.example", ".env.prod"]
];

for (const [source, target] of envFiles) {
  const sourcePath = path.join(rootDir, source);
  const targetPath = path.join(rootDir, target);

  if (!existsSync(targetPath)) {
    copyFileSync(sourcePath, targetPath);
    console.log(`Arquivo criado: ${target}`);
  }
}

const result = spawnSync("docker", ["compose", "up", "-d", "--build"], {
  cwd: rootDir,
  stdio: "inherit",
  env: process.env
});

if (result.status !== 0) {
  process.exit(result.status ?? 1);
}
