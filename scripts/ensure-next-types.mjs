import { copyFileSync, existsSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";

const source = ".next/dev/types/cache-life.d.ts";
const target = ".next/types/cache-life.d.ts";

mkdirSync(dirname(target), { recursive: true });

if (existsSync(source)) {
  copyFileSync(source, target);
} else if (!existsSync(target)) {
  writeFileSync(target, "export {};\n");
}
