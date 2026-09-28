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

import { createHash } from 'node:crypto';

const isObj = (x) => x !== null && typeof x === 'object' && !Array.isArray(x);
const isInt = Number.isInteger;
const VERDICTS = ['BEATS', 'LOSES', 'TIES'];

// canonical JSON (sorted keys) — vendored verbatim from fallforgemint so a receipt re-hashes identically
export function canon(v) {
  if (v === null || typeof v === 'number' || typeof v === 'boolean') return JSON.stringify(v);
  if (typeof v === 'string') return JSON.stringify(v);
  if (Array.isArray(v)) return '[' + v.map(canon).join(',') + ']';
  if (typeof v === 'object') return '{' + Object.keys(v).sort().map((k) => JSON.stringify(k) + ':' + canon(v[k])).join(',') + '}';
  return '"?"';
}
const sha256hex = (text) => createHash('sha256').update(String(text), 'utf8').digest('hex');

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
