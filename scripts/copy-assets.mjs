import { cpSync, existsSync } from "node:fs";

const src = "src/web/public";
const dest = "dist/web/public";

if (existsSync(src)) {
  cpSync(src, dest, { recursive: true });
}
