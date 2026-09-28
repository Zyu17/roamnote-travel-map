// Read-only provider checks: public coordinates, no account/trip creation.
// Keep the API key inside this process; never print request URLs or raw errors.
import { readFileSync } from "node:fs";
import ts from "typescript";
const key = process.env.AMAP_WEB_SERVICE_KEY;
if (!key) throw new Error("AMAP_WEB_SERVICE_KEY is missing");
const source = ts.transpileModule(readFileSync(new URL("../lib/amap-route.ts", import.meta.url), "utf8"), { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText;
const { queryAmapRoute } = await import(`data:text/javascript;base64,${Buffer.from(source).toString("base64")}`);
let failed = false;
for (const mode of ["walking", "driving", "transit"]) {
  try {
    const result = await queryAmapRoute([116.434307, 39.90909], [116.46424, 40.020642], mode, key, AbortSignal.timeout(15_000));
    if (result.status !== "ready") throw new Error("No route");
    console.log(`${mode}: provider returned distance ${result.distance} m, estimated duration ${result.duration} s`);
  } catch {
    failed = true;
    console.error(`${mode}: provider check failed; check AMap permissions, quota, IP restrictions or connectivity. No secret was logged.`);
  }
}
if (failed) process.exitCode = 1;
