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

// What the receipt shows, and nothing it does not: it measured the minted model against ITS OWN base on held-out
// examples. It does not measure a rented model, and a demo task is not the reader's data, so no headline says either.
const headline = (verdict) => verdict === 'BEATS' ? 'The minted model beat its base model on held-out examples.'
  : verdict === 'LOSES' ? 'The minted model lost to its base model on held-out examples, and the receipt says so.'
  : 'The minted model tied its base model on held-out examples.';

// generateAd — a deterministic scorecard-ad from a VERIFIED receipt. Numbers come only from the receipt;
// the result is audited, so a fabricated figure can never ship. The held-out wording stays narrow-true: the held-out
// examples were not in the spec the model was given — never "it never saw them".
export function generateAd(r, opts = {}) {
  const f = backedFacts(r);
  if (!f.ok) return { ok: false, why: 'refused: ' + f.why };
  const measured = (typeof r.rerun === 'string' && r.rerun) ? r.rerun : '';
  const reverify = typeof opts.reverifyUrl === 'string' ? opts.reverifyUrl : '';
  const claim = 'On ' + f.heldOut + ' held-out examples that were not in the spec it was given, the minted model scored ' + f.mintedHits
    + ' and its base "' + f.base + '", given the same inputs without the spec, scored ' + f.baseHits + '. Verdict: ' + f.verdict + '.';
  const honesty = f.verdict === 'LOSES' ? 'It lost. On this task, keep the base — we publish the number even when it is against us.'
    : (f.smallSample ? 'Small sample — indicative, re-run it to be sure.' : 'This receipt can fail. Do not trust it — re-run it.');
  // honest key-class line ONLY when the receipt states it (never overclaim the signature)
  const keyLine = r.keyClass === 'software-ed25519' ? 'Signed with a software key: the issuer could fabricate this — which is exactly why it is re-runnable.' : '';
  const where = measured ? 'Measured on a GitHub runner: ' + measured : '';
  const cta = reverify ? 'Re-run it yourself: ' + reverify : (measured ? '' : 'Re-run it yourself — it verifies in your browser.');
  const ad = [headline(f.verdict), claim, honesty, keyLine, where, cta].filter(Boolean).join('\n');
  const audit = auditAd(ad, r, { reverifyUrl: reverify, rerun: measured });
  if (!audit.ok) return { ok: false, why: 'refused: ' + audit.why, unbacked: audit.unbacked, hype: audit.hype };
  return { ok: true, ad, verdict: f.verdict, receiptHash: f.hash, rerun: measured };
}

// Channel limits. The fixed titles are pinned under them by the tests; the X post, which carries receipt values and a
// link, is checked here every time, so a one-click link never lands on a form that rejects it.
export const LIMITS = { hnTitle: 80, xPost: 280, xUrl: 23, phTagline: 60, phDescription: 260 };
// X counts every link as 23 characters, whatever its length.
export function xLength(text) {
  if (typeof text !== 'string') return -1;
  const urls = text.match(/https?:\/\/\S+/g) || [];
  return urls.reduce((n, u) => n - u.length + LIMITS.xUrl, text.length);
}

// generateCopy — channel-specific launch copy, every word audited against the receipt (numbers) and the hype list.
// opts.reverifyUrl is the product page every channel links to.
export function generateCopy(r, channel, opts = {}) {
  const g = generateAd(r, opts);
  if (!g.ok) return g;
  const f = backedFacts(r);
  const page = typeof opts.reverifyUrl === 'string' ? opts.reverifyUrl : '';
  const what = 'Bring one job and a few examples. It mints an Ollama model you run on your own machine, holds some examples out, and scores the minted model against its base. The scorecard is signed, and anyone can re-run it on a clean GitHub runner: an edited number, a borrowed CI link or a result that does not reproduce fails the job. The own-vs-rent calculator says keep renting when renting is cheaper. The mint runs in your browser. MIT.';
  const credit = 'Powered by the Konomi architecture, created by Thomas Frumkin.';
  let out;
  if (channel === 'show-hn') {
    out = { title: 'Show HN: FallForge Mint – own a model, with a scorecard anyone can re-run', body: g.ad + '\n\n' + what };
  } else if (channel === 'indie-hackers') {
    out = { title: 'I built a model minter whose scorecards can fail, and a CI job that re-runs them', body: g.ad + '\n\n' + what
      + '\n\nThis post came out of forgegrowth, which refuses any number that is not on the receipt and cannot publish on its own.\n' + credit };
  } else if (channel === 'x-thread') {
    out = { title: 'A model you own, and a scorecard that can say it lost.', body: g.ad };
  } else if (channel === 'x-post') {
    const text = 'On held-out examples that were not in its spec, the minted model scored ' + f.mintedHits + '/' + f.heldOut + '; its base ' + f.base
      + ', given no spec, scored ' + f.baseHits + '/' + f.heldOut + ': ' + f.verdict + '. The scorecard is signed, and anyone can re-run it on a clean GitHub runner. A forged one fails. ' + page;
    out = { title: '', body: text };
    if (xLength(text) > LIMITS.xPost) return { ok: false, why: 'the X post is longer than X allows' };
  } else if (channel === 'product-hunt') {
    out = { title: 'FallForge Mint', tagline: 'Mint a model you own, with a scorecard anyone can re-run',
      description: 'Bring one job and a few examples. It mints an Ollama model for your own machine, scores it against its base on held-out examples, and signs the result. Anyone can re-run the scorecard on a clean GitHub runner.',
      body: g.ad + '\n\n' + what + '\n\n' + credit };
  } else {
    return { ok: false, why: 'unknown channel: ' + String(channel) };
  }
  const audit = auditAd(Object.values(out).join('\n'), r, { reverifyUrl: page, rerun: g.rerun });   // every field a channel shows
  if (!audit.ok) return { ok: false, why: 'refused: ' + audit.why, unbacked: audit.unbacked, hype: audit.hype };
  return { ok: true, channel, verdict: f.verdict, ...out };
}

// shareLink — the one-click door for an account-bound channel. It opens the channel's own form, prefilled where the
// channel allows it; a person signed in to that channel presses post. Nothing here posts.
export const DOORS = { hn: 'https://news.ycombinator.com/submitlink', x: 'https://x.com/intent/post', ih: 'https://www.indiehackers.com/new-post', ph: 'https://www.producthunt.com/posts/new' };
export function shareLink(copy, pageUrl) {
  if (!isObj(copy) || copy.ok !== true) return { ok: false, why: 'shareLink needs audited copy' };
  if (typeof pageUrl !== 'string' || !/^https:\/\/\S+$/.test(pageUrl)) return { ok: false, why: 'shareLink needs the https page the post points at' };
  const e = encodeURIComponent;
  if (copy.channel === 'show-hn') return { ok: true, channel: copy.channel, url: DOORS.hn + '?u=' + e(pageUrl) + '&t=' + e(copy.title), paste: copy.body, prefilled: true };
  if (copy.channel === 'x-post') return { ok: true, channel: copy.channel, url: DOORS.x + '?text=' + e(copy.body), paste: '', prefilled: true };
  if (copy.channel === 'indie-hackers') return { ok: true, channel: copy.channel, url: DOORS.ih, paste: copy.title + '\n\n' + copy.body, prefilled: false };
  if (copy.channel === 'product-hunt') return { ok: true, channel: copy.channel, url: DOORS.ph, paste: copy.body, prefilled: false };
  return { ok: false, why: 'no one-click door for ' + String(copy.channel) };
}

// planPublish — prepare external posts as PENDING_KEY. NEVER executes; Simon's key fires the launch.
export function planPublish(ad, channels) {
  if (typeof ad !== 'string' || ad.length === 0) return { ok: false, why: 'there is nothing to publish' };
  const list = (Array.isArray(channels) && channels.length) ? channels : ['show-hn', 'indie-hackers', 'x-thread'];
  const actions = list.map((c) => ({ channel: c, status: 'PENDING_KEY', action: 'publish externally', needs: 'simon-key', preview: ad.slice(0, 80) }));
  return { ok: true, actions, executed: 0 };
}

// fireReceipt — the record that a queued action was fired: which channel, the public URL it produced, when, on whose
// key, and which scorecard it advertised. Self-hashed. It records a firing; it never performs one.
export function fireReceipt(input) {
  if (!isObj(input)) return { ok: false, why: 'fireReceipt takes an object' };
  const { channel, url, firedAt, key, receiptHash } = input;
  if (typeof channel !== 'string' || channel.length === 0) return { ok: false, why: 'the channel is required' };
  if (typeof url !== 'string' || !/^https:\/\/\S+$/.test(url)) return { ok: false, why: 'the public https URL the firing produced is required' };
  if (typeof firedAt !== 'string' || !Number.isFinite(Date.parse(firedAt))) return { ok: false, why: 'firedAt must be a timestamp' };
  if (typeof key !== 'string' || key.length === 0) return { ok: false, why: 'the key that fired it is required — nothing fires without one' };
  if (typeof receiptHash !== 'string' || !/^[0-9a-f]{64}$/.test(receiptHash)) return { ok: false, why: 'the scorecard hash it advertised is required' };
  const body = { v: 1, kind: 'forgegrowth-fire', channel, status: 'FIRED', url, firedAt, key, receiptHash };
  return { ok: true, fire: { ...body, hash: sha256hex(canon(body)) } };
}
export function verifyFire(x) {
  if (!isObj(x) || x.kind !== 'forgegrowth-fire' || typeof x.hash !== 'string') return { ok: false, why: 'not a forgegrowth fire receipt' };
  const body = { ...x }; delete body.hash;
  return { ok: true, valid: sha256hex(canon(body)) === x.hash };
}

export default { canon, verifyReceipt, backedFacts, auditAd, generateAd, generateCopy, planPublish, xLength, shareLink, fireReceipt, verifyFire, LIMITS, DOORS };
