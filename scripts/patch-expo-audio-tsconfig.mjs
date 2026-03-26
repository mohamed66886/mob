import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";

const target = resolve(process.cwd(), "node_modules/expo-audio/tsconfig.json");

if (!existsSync(target)) {
  process.exit(0);
}

try {
  const text = readFileSync(target, "utf8");
  const patched = text.replace(
    '"extends": "expo-module-scripts/tsconfig.base",',
    '"extends": "expo-module-scripts/tsconfig.base.json",',
  );

  if (patched !== text) {
    writeFileSync(target, patched, "utf8");
    console.log("Patched expo-audio tsconfig extends path.");
  }
} catch {
  // Keep install resilient if patch fails.
}
