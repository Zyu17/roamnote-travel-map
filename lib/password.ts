const ALGORITHM = "client-pbkdf2-sha256";
const ITERATIONS = 600_000;
const SALT_BYTES = 16;
const HASH_BYTES = 32;

function toHex(bytes: Uint8Array) {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function isHex(value: unknown, bytes: number): value is string {
  return typeof value === "string" && new RegExp(`^[a-f0-9]{${bytes * 2}}$`).test(value);
}

function fromHex(value: string) {
  return Uint8Array.from(value.match(/.{2}/g) ?? [], (byte) => Number.parseInt(byte, 16));
}

export function validPassword(value: unknown): value is string {
  return typeof value === "string" && value.length >= 12 && new TextEncoder().encode(value).byteLength <= 256;
}

export function randomPasswordSalt() {
  return toHex(crypto.getRandomValues(new Uint8Array(SALT_BYTES)));
}

export function validPasswordSalt(value: unknown): value is string {
  return isHex(value, SALT_BYTES);
}

export function validPasswordProof(value: unknown): value is string {
  return isHex(value, HASH_BYTES);
}

// The expensive derivation runs in the browser. The server never stores this
// reusable credential: it hashes it again with an independent server salt.
export async function derivePasswordProof(password: string, clientSalt: string) {
  if (!validPasswordSalt(clientSalt)) throw new Error("密码参数不正确");
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(password), "PBKDF2", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits({ name: "PBKDF2", hash: "SHA-256", salt: fromHex(clientSalt), iterations: ITERATIONS }, key, HASH_BYTES * 8);
  return toHex(new Uint8Array(bits));
}

async function digestProof(proof: string, serverSalt: string) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(`${serverSalt}:${proof}`));
  return toHex(new Uint8Array(digest));
}

export async function hashPasswordProof(proof: string, clientSalt: string) {
  if (!validPasswordProof(proof) || !validPasswordSalt(clientSalt)) throw new Error("密码参数不正确");
  const serverSalt = randomPasswordSalt();
  return `${ALGORITHM}$${ITERATIONS}$${clientSalt}$${serverSalt}$${await digestProof(proof, serverSalt)}`;
}

export function clientSaltFromHash(stored: string | null) {
  const [algorithm, iterations, clientSalt, serverSalt, expected, extra] = (stored ?? "").split("$");
  return extra === undefined && algorithm === ALGORITHM && iterations === String(ITERATIONS) &&
    validPasswordSalt(clientSalt) && validPasswordSalt(serverSalt) && validPasswordProof(expected)
    ? clientSalt : null;
}

export async function verifyPasswordProof(proof: string, stored: string | null) {
  if (!validPasswordProof(proof)) return false;
  const clientSalt = clientSaltFromHash(stored);
  if (!clientSalt) return false;
  const [, , , serverSalt, expected] = stored!.split("$");
  const actual = await digestProof(proof, serverSalt);
  let difference = 0;
  for (let index = 0; index < actual.length; index++) difference |= actual.charCodeAt(index) ^ expected.charCodeAt(index);
  return difference === 0;
}
