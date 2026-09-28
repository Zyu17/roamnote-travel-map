const base = process.env.ROAMNOTE_URL ?? "https://roamnote-travel-map.lizeyu17.workers.dev";
const email = `release-check-${Date.now()}@example.invalid`;

async function request(path, expectedStatus, init, validate) {
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const response = await fetch(`${base}${path}`, { ...init, cache: "no-store", signal: AbortSignal.timeout(15_000) });
      if (response.status !== expectedStatus) throw new Error(`${path}: expected ${expectedStatus}, received ${response.status}`);
      if (validate) await validate(response.clone());
      return response;
    } catch (error) {
      if (attempt === 3) throw error;
      await new Promise((resolve) => setTimeout(resolve, 3_000));
    }
  }
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

for (const [path, text] of [["/login", "欢迎回来"], ["/register", "邀请注册码"]]) {
  await request(path, 200, undefined, async response => {
    const html = await response.text();
    assert(html.includes(text), `${path}: expected account page was not served`);
    assert(/id="auth-password"[^>]*minlength="8"/i.test(html), `${path}: expected 8-character password minimum`);
    if (path === "/register") assert(/id="auth-confirm"[^>]*minlength="8"/i.test(html), `${path}: confirmation password minimum mismatch`);
  });
  console.log(`${path}: OK`);
}
const me = await (await request("/api/auth/me", 200)).json();
assert(me.account === null, "Anonymous request unexpectedly received an account");
const salt = await (await request(`/api/auth/salt?email=${encodeURIComponent(email)}`, 200)).json();
assert(typeof salt.salt === "string" && /^[a-f0-9]{32}$/.test(salt.salt), "Database-backed login salt lookup failed");
await request("/api/trips", 401);
await request("/api/map-config", 200);
await request("/api/amap-route?origin=116.434307,39.90909&destination=116.46424,40.020642&mode=driving", 401);
await request("/api/amap-route?origin=invalid&destination=116.46424,40.020642&mode=driving", 400);
await request("/api/auth/register", 403, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ email, proof: "0".repeat(64), clientSalt: "0".repeat(32), registrationCode: "release-check-invalid-invitation" }),
});
await request("/api/auth/login", 401, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ email, proof: "0".repeat(64) }),
});
console.log("Live account, D1, invitation, and authorization checks passed. No account or trip was created.");
