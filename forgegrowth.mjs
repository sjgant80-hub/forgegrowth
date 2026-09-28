// forgegrowth.mjs — the estate's GROWTH ORGAN (witness-gated).
//
// It turns a REAL fallforgemint scorecard receipt into promotional copy + a shareable "scorecard-ad",
// under two hard rules that make it the honest inverse of the crypto hype machine:
//   1. PROOF-NOT-HYPE: every number an ad states must be a value carried by the receipt, or the ad is
//      REFUSED. Fabrication is structurally impossible — an unbacked figure fails the audit.
//   2. WALL: every EXTERNAL publish is prepared as PENDING_KEY and never executed here. Simon's key fires
//      the actual post — the same wall the live dispatcher enforces (mesh-and-pub / signals-feed / money).
//
// Pure, total, deterministic. Garbage in -> { ok:false, why }, never a throw. The mint/receipt it consumes
// is fallforgemint's, built on the Konomi architecture created by Thomas Frumkin (see NOTICE).

const isObj = (x) => x !== null && typeof x === 'object' && !Array.isArray(x);
const isInt = Number.isInteger;
const VERDICTS = ['BEATS', 'LOSES', 'TIES'];

// pure-JS SHA-256 (vendored from fallforgemint) — isomorphic: same result in Node and the browser, no
// node:crypto import (which the browser cannot load). A receipt re-hashes identically to how it was issued.
const K256 = new Uint32Array([
  0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
  0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
  0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
  0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
  0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
  0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
  0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
  0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
]);
function sha256hex(text) {
  const data = new TextEncoder().encode(String(text));
  const len = data.length;
  const padded = new Uint8Array((((len + 8) >> 6) << 6) + 64);
  padded.set(data); padded[len] = 0x80;
  const dv = new DataView(padded.buffer);
  const bitLen = len * 8;
  dv.setUint32(padded.length - 8, Math.floor(bitLen / 4294967296));
  dv.setUint32(padded.length - 4, bitLen >>> 0);
  let h0 = 0x6a09e667, h1 = 0xbb67ae85, h2 = 0x3c6ef372, h3 = 0xa54ff53a;
  let h4 = 0x510e527f, h5 = 0x9b05688c, h6 = 0x1f83d9ab, h7 = 0x5be0cd19;
  const w = new Uint32Array(64);
  for (let i = 0; i < padded.length; i += 64) {
    for (let t = 0; t < 16; t++) w[t] = dv.getUint32(i + t * 4);
    for (let t = 16; t < 64; t++) {
      const x = w[t - 15], y = w[t - 2];
      const s0 = (((x >>> 7) | (x << 25)) ^ ((x >>> 18) | (x << 14)) ^ (x >>> 3)) >>> 0;
      const s1 = (((y >>> 17) | (y << 15)) ^ ((y >>> 19) | (y << 13)) ^ (y >>> 10)) >>> 0;
      w[t] = (w[t - 16] + s0 + w[t - 7] + s1) >>> 0;
    }
    let a = h0, b = h1, c = h2, d = h3, e = h4, f = h5, g = h6, hh = h7;
    for (let t = 0; t < 64; t++) {
      const S1 = (((e >>> 6) | (e << 26)) ^ ((e >>> 11) | (e << 21)) ^ ((e >>> 25) | (e << 7))) >>> 0;
      const ch = ((e & f) ^ (~e & g)) >>> 0;
      const t1 = (hh + S1 + ch + K256[t] + w[t]) >>> 0;
      const S0 = (((a >>> 2) | (a << 30)) ^ ((a >>> 13) | (a << 19)) ^ ((a >>> 22) | (a << 10))) >>> 0;
      const maj = ((a & b) ^ (a & c) ^ (b & c)) >>> 0;
      const t2 = (S0 + maj) >>> 0;
      hh = g; g = f; f = e; e = (d + t1) >>> 0; d = c; c = b; b = a; a = (t1 + t2) >>> 0;
    }
    h0 = (h0 + a) >>> 0; h1 = (h1 + b) >>> 0; h2 = (h2 + c) >>> 0; h3 = (h3 + d) >>> 0;
    h4 = (h4 + e) >>> 0; h5 = (h5 + f) >>> 0; h6 = (h6 + g) >>> 0; h7 = (h7 + hh) >>> 0;
  }
  const hex = (n) => n.toString(16).padStart(8, '0');
  return hex(h0) + hex(h1) + hex(h2) + hex(h3) + hex(h4) + hex(h5) + hex(h6) + hex(h7);
}

// canonical JSON (sorted keys) — vendored verbatim from fallforgemint so a receipt re-hashes identically
export function canon(v) {
  if (v === null || typeof v === 'number' || typeof v === 'boolean') return JSON.stringify(v);
  if (typeof v === 'string') return JSON.stringify(v);
  if (Array.isArray(v)) return '[' + v.map(canon).join(',') + ']';
  if (typeof v === 'object') return '{' + Object.keys(v).sort().map((k) => JSON.stringify(k) + ':' + canon(v[k])).join(',') + '}';
  return '"?"';
}

// verifyReceipt — re-hash + score invariant + verdict-consistency. A tampered or lying receipt is REFUSED,
// so no ad can ever be built on a fake. (The same three checks fallforgemint verifies, re-implemented.)
export function verifyReceipt(r) {
  // one check per line — each is individually killable and no compound guard hides a leak
  if (!isObj(r)) return { ok: false, why: 'not a fallforgemint scorecard' };
  if (r.kind !== 'fallforgemint-scorecard') return { ok: false, why: 'not a fallforgemint scorecard' };
  if (typeof r.hash !== 'string') return { ok: false, why: 'the receipt has no hash' };
  const body = { ...r }; delete body.hash; delete body.signature;
  if (sha256hex(canon(body)) !== r.hash) return { ok: false, why: 'receipt hash does not match its contents — changed after it was issued' };
  if (!isInt(r.heldOut)) return { ok: false, why: 'the held-out count must be a whole number' };
  if (r.heldOut < 1) return { ok: false, why: 'the held-out count must be at least one' };
  if (!isInt(r.baseHits)) return { ok: false, why: 'the base hit count must be a whole number' };
  if (!isInt(r.mintedHits)) return { ok: false, why: 'the minted hit count must be a whole number' };
  if (r.baseHits < 0) return { ok: false, why: 'hit counts cannot be negative' };
  if (r.mintedHits < 0) return { ok: false, why: 'hit counts cannot be negative' };
  if (r.mintedHits > r.heldOut) return { ok: false, why: 'a hit count exceeds the held-out count' };
  if (r.baseHits > r.heldOut) return { ok: false, why: 'a hit count exceeds the held-out count' };
  if (r.score !== r.mintedHits / r.heldOut) return { ok: false, why: 'the score does not match the hit counts' };
  if (!VERDICTS.includes(r.verdict)) return { ok: false, why: 'the verdict is not one of BEATS / LOSES / TIES' };
  const consistent = (r.verdict === 'BEATS' && r.mintedHits > r.baseHits)
    || (r.verdict === 'LOSES' && r.mintedHits < r.baseHits)
    || (r.verdict === 'TIES' && r.mintedHits === r.baseHits);
  if (!consistent) return { ok: false, why: 'the verdict contradicts the hit counts' };
  return { ok: true };
}

// the ONLY values an ad may state as numbers — drawn straight from a verified receipt
export function backedFacts(r) {
  const v = verifyReceipt(r);
  if (!v.ok) return { ok: false, why: v.why };
  return { ok: true, base: r.base, heldOut: r.heldOut, baseHits: r.baseHits, mintedHits: r.mintedHits, verdict: r.verdict, smallSample: r.heldOut < 5, hash: r.hash };
}

// hype words a proof-not-hype ad may never contain — DATA-BOUND TEMPLATING: the organ states measured
// values, never unbacked superlatives ("latency dropped 64%" yes; "blazing fast" never).
const HYPE = ['blazing', 'fastest', 'best-in-class', 'guaranteed', 'revolutionary', 'game-chang', 'unbeatable',
  'insane', 'magic', 'mind-blow', 'world-class', '10x', '100x', 'to the moon', 'trust me', 'no-brainer'];

// THE ANTI-FABRICATION GATE. (1) every standalone number (after removing the receipt's own base name, hash,
// and any given link) must be a receipt-backed value; (2) no hype superlative may appear. Else: refused.
export function auditAd(text, r, opts = {}) {
  if (typeof text !== 'string') return { ok: false, why: 'the ad must be a string' };
  const f = backedFacts(r);
  if (!f.ok) return { ok: false, why: f.why };
  let scrub = text.split(r.hash).join(' ').split(r.base).join(' ');
  for (const u of [opts.reverifyUrl, opts.rerun]) if (typeof u === 'string' && u) scrub = scrub.split(u).join(' ');
  const backed = new Set([f.heldOut, f.baseHits, f.mintedHits].map((n) => String(n)));
  const nums = scrub.match(/\d+(?:\.\d+)?/g) || [];
  const unbacked = nums.filter((n) => !backed.has(n));
  if (unbacked.length > 0) return { ok: false, why: 'unbacked number(s) in the ad: ' + unbacked.join(', '), unbacked };
  const low = text.toLowerCase();
  const hype = HYPE.filter((w) => low.includes(w));
  if (hype.length > 0) return { ok: false, why: 'unbacked hype word(s): ' + hype.join(', '), hype };
  return { ok: true };
}

const headline = (verdict) => verdict === 'BEATS' ? 'A model you own just beat the one you were renting — on your own data.'
  : verdict === 'LOSES' ? 'We minted a model, measured it honestly, and it lost. So keep renting — here is the receipt.'
  : 'Owned and rented tied on your task — here is the honest receipt.';

// generateAd — a deterministic scorecard-ad from a VERIFIED receipt. Numbers come only from the receipt;
// the result is audited, so a fabricated figure can never ship.
export function generateAd(r, opts = {}) {
  const f = backedFacts(r);
  if (!f.ok) return { ok: false, why: 'refused: ' + f.why };
  // the re-run linchpin: prefer the receipt's own CI re-run URL, else a given re-verify link
  const rerun = (typeof r.rerun === 'string' && r.rerun) ? r.rerun
    : (typeof opts.reverifyUrl === 'string' ? opts.reverifyUrl : '');
  const claim = 'On ' + f.heldOut + ' held-out examples it never saw, the minted model scored ' + f.mintedHits
    + ' and the base "' + f.base + '" scored ' + f.baseHits + '. Verdict: ' + f.verdict + '.';
  const honesty = f.verdict === 'LOSES' ? 'It lost. On this task, keep renting — we publish the number even when it is against us.'
    : (f.smallSample ? 'Small sample — indicative, re-run it to be sure.' : 'This receipt can fail. Do not trust it — re-run it.');
  // honest key-class line ONLY when the receipt states it (never overclaim the signature)
  const keyLine = r.keyClass === 'software-ed25519' ? 'Signed with a software key: the issuer could fabricate this — which is exactly why it is re-runnable.' : '';
  const cta = rerun ? ('Re-run it yourself: ' + rerun) : 'Re-run it yourself — it verifies in your browser.';
  const ad = [headline(f.verdict), claim, honesty, keyLine, cta].filter(Boolean).join('\n');
  const audit = auditAd(ad, r, { reverifyUrl: opts.reverifyUrl, rerun });
  if (!audit.ok) return { ok: false, why: 'refused: ' + audit.why, unbacked: audit.unbacked, hype: audit.hype };
  return { ok: true, ad, verdict: f.verdict, receiptHash: f.hash, rerun };
}

// generateCopy — channel-specific launch copy, same proof-not-hype audit
export function generateCopy(r, channel, opts = {}) {
  const g = generateAd(r, opts);
  if (!g.ok) return g;
  const f = backedFacts(r);
  let title, body;
  if (channel === 'show-hn') {
    title = 'Show HN: win the OpenAI-bill argument with your CFO — mint a private model, prove it on your own data';
    body = g.ad + '\nFor the eng lead tired of that argument: run it against YOUR task, get the exact own-vs-rent math. Nothing leaves your browser. It tells you to keep renting when that is genuinely cheaper.';
  } else if (channel === 'indie-hackers') {
    title = 'I built a thing that mints you a private model and then tries to beat what you are renting';
    body = g.ad + '\nBuilt in public, sovereign, MIT. The growth engine that made this post physically cannot publish without a human signature — and it cannot state a number that is not on the receipt.';
  } else if (channel === 'x-thread') {
    title = 'Own the AI you are renting.';
    body = g.ad;
  } else {
    return { ok: false, why: 'unknown channel: ' + String(channel) };
  }
  const audit = auditAd(title + '\n' + body, r, opts);
  if (!audit.ok) return { ok: false, why: 'refused: ' + audit.why, unbacked: audit.unbacked };
  return { ok: true, channel, title, body, verdict: f.verdict };
}

// planPublish — prepare external posts as PENDING_KEY. NEVER executes; Simon's key fires the launch.
export function planPublish(ad, channels) {
  if (typeof ad !== 'string' || ad.length === 0) return { ok: false, why: 'there is nothing to publish' };
  const list = (Array.isArray(channels) && channels.length) ? channels : ['show-hn', 'indie-hackers', 'x-thread'];
  const actions = list.map((c) => ({ channel: c, status: 'PENDING_KEY', action: 'publish externally', needs: 'simon-key', preview: ad.slice(0, 80) }));
  return { ok: true, actions, executed: 0 };
}

export default { canon, verifyReceipt, backedFacts, auditAd, generateAd, generateCopy, planPublish };
