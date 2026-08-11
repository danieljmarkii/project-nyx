// Runtime-neutral, synchronous UUIDv5 (SHA-1, RFC 4122) — no dependencies.
//
// Why hand-rolled rather than the `uuid` npm package (B-271, demo-account seed):
// this module is imported by three consumers across two runtimes — the SQL
// emitter + jest test (Node) and the Deno detection validation
// (`supabase/functions/generate-signal/demoStory.detection.test.ts`, run under
// `deno test --cached-only` with NO node_modules resolution). A bare
// `import { v5 } from 'uuid'` resolves in Node but not in that Deno graph, so a
// shared deterministic-id helper cannot depend on it. Web Crypto's SHA-1 exists
// in both runtimes but is ASYNC (`crypto.subtle.digest`), and the story module
// needs a pure, synchronous `id = uuidV5(slotKey, petId)` it can compute inline.
// So SHA-1 is implemented here in portable JS. It is verified byte-for-byte
// against the `uuid` package in scripts/demo/demoStory.test.ts (the golden
// vectors), which is what keeps this correct despite being hand-rolled.
//
// The seed's row ids are `uuidV5(storySlotKey, demoPetId)`: the demo pet id is
// the namespace, the story-slot key (e.g. 'meal-venison-D-16-am') the name. Same
// pet + same slot ⇒ same id, so a re-seed UPSERTs in place (B-271 §8, R-7) — no
// ghost rows, no deletes.

/** SHA-1 of a byte array, returned as 20 bytes (RFC 3174). Pure, synchronous. */
function sha1(bytes: number[]): number[] {
  const ml = bytes.length * 8;
  // Padding: append 0x80, then 0x00 until length ≡ 56 (mod 64), then 64-bit length.
  const msg = bytes.slice();
  msg.push(0x80);
  while (msg.length % 64 !== 56) msg.push(0x00);
  // 64-bit big-endian message length in bits. Lengths here are tiny, so the high
  // 32 bits are always 0; write the low 32 bits big-endian.
  msg.push(0, 0, 0, 0);
  msg.push((ml >>> 24) & 0xff, (ml >>> 16) & 0xff, (ml >>> 8) & 0xff, ml & 0xff);

  let h0 = 0x67452301;
  let h1 = 0xefcdab89;
  let h2 = 0x98badcfe;
  let h3 = 0x10325476;
  let h4 = 0xc3d2e1f0;

  const rotl = (n: number, c: number): number => ((n << c) | (n >>> (32 - c))) >>> 0;

  const w = new Array<number>(80);
  for (let i = 0; i < msg.length; i += 64) {
    for (let j = 0; j < 16; j++) {
      w[j] =
        ((msg[i + j * 4] << 24) |
          (msg[i + j * 4 + 1] << 16) |
          (msg[i + j * 4 + 2] << 8) |
          msg[i + j * 4 + 3]) >>>
        0;
    }
    for (let j = 16; j < 80; j++) {
      w[j] = rotl((w[j - 3] ^ w[j - 8] ^ w[j - 14] ^ w[j - 16]) >>> 0, 1);
    }

    let a = h0;
    let b = h1;
    let c = h2;
    let d = h3;
    let e = h4;

    for (let j = 0; j < 80; j++) {
      let f: number;
      let k: number;
      if (j < 20) {
        f = (b & c) | (~b & d);
        k = 0x5a827999;
      } else if (j < 40) {
        f = b ^ c ^ d;
        k = 0x6ed9eba1;
      } else if (j < 60) {
        f = (b & c) | (b & d) | (c & d);
        k = 0x8f1bbcdc;
      } else {
        f = b ^ c ^ d;
        k = 0xca62c1d6;
      }
      const temp = (rotl(a, 5) + f + e + k + w[j]) >>> 0;
      e = d;
      d = c;
      c = rotl(b, 30);
      b = a;
      a = temp;
    }

    h0 = (h0 + a) >>> 0;
    h1 = (h1 + b) >>> 0;
    h2 = (h2 + c) >>> 0;
    h3 = (h3 + d) >>> 0;
    h4 = (h4 + e) >>> 0;
  }

  const out: number[] = [];
  for (const h of [h0, h1, h2, h3, h4]) {
    out.push((h >>> 24) & 0xff, (h >>> 16) & 0xff, (h >>> 8) & 0xff, h & 0xff);
  }
  return out;
}

/** UTF-8 encode a string to a byte array (portable — no TextEncoder needed). */
function utf8Bytes(str: string): number[] {
  const out: number[] = [];
  for (let i = 0; i < str.length; i++) {
    let code = str.charCodeAt(i);
    if (code < 0x80) {
      out.push(code);
    } else if (code < 0x800) {
      out.push(0xc0 | (code >> 6), 0x80 | (code & 0x3f));
    } else if (code >= 0xd800 && code <= 0xdbff) {
      // Surrogate pair → one code point.
      const hi = code;
      const lo = str.charCodeAt(++i);
      code = 0x10000 + ((hi - 0xd800) << 10) + (lo - 0xdc00);
      out.push(
        0xf0 | (code >> 18),
        0x80 | ((code >> 12) & 0x3f),
        0x80 | ((code >> 6) & 0x3f),
        0x80 | (code & 0x3f),
      );
    } else {
      out.push(0xe0 | (code >> 12), 0x80 | ((code >> 6) & 0x3f), 0x80 | (code & 0x3f));
    }
  }
  return out;
}

/** Parse a canonical UUID string into its 16 bytes. Throws on a malformed value. */
function uuidBytes(uuid: string): number[] {
  const hex = uuid.replace(/-/g, '');
  if (!/^[0-9a-fA-F]{32}$/.test(hex)) {
    throw new Error(`uuidV5: namespace is not a valid UUID: ${JSON.stringify(uuid)}`);
  }
  const out: number[] = [];
  for (let i = 0; i < 16; i++) out.push(parseInt(hex.slice(i * 2, i * 2 + 2), 16));
  return out;
}

/**
 * Deterministic RFC 4122 v5 (SHA-1 name-based) UUID: `SHA1(namespace ++ name)`,
 * with the version (5) and variant (RFC 4122) bits stamped. `namespace` is a
 * canonical UUID string (the demo pet id, in this project); `name` is the
 * story-slot key. Pure and synchronous.
 */
export function uuidV5(name: string, namespace: string): string {
  const bytes = sha1(uuidBytes(namespace).concat(utf8Bytes(name)));
  bytes[6] = (bytes[6] & 0x0f) | 0x50; // version 5
  bytes[8] = (bytes[8] & 0x3f) | 0x80; // RFC 4122 variant
  const hex = bytes.slice(0, 16).map((b) => b.toString(16).padStart(2, '0'));
  return (
    hex.slice(0, 4).join('') +
    '-' +
    hex.slice(4, 6).join('') +
    '-' +
    hex.slice(6, 8).join('') +
    '-' +
    hex.slice(8, 10).join('') +
    '-' +
    hex.slice(10, 16).join('')
  );
}
