import { env } from "cloudflare:workers";
import { drizzle } from "drizzle-orm/d1";
import * as schema from "./schema";

export function getDb() {
  if (!env.DB) {
    throw new Error(
      "Cloudflare D1 binding `DB` is unavailable. Create the roamnote D1 database and bind it as `DB` in wrangler.jsonc before using persisted travel data."
    );
  }

  return drizzle(env.DB, { schema });
}
