import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { canon, verifyReceipt, backedFacts, auditAd, generateAd, generateCopy, planPublish } from './forgegrowth.mjs';

const sha = (s) => createHash('sha256').update(String(s), 'utf8').digest('hex');
// build a receipt whose hash is self-consistent (so verifyReceipt's re-hash passes) unless noHash/tampered
function mk(o = {}) {
  const heldOut = o.heldOut ?? 8, baseHits = o.baseHits ?? 3, mintedHits = o.mintedHits ?? 6, verdict = o.verdict ?? 'BEATS';
  const body = {
    v: 1, kind: 'fallforgemint-scorecard', base: o.base ?? 'qwen2.5-0.5b',
    modelFingerprint: sha('m'), taskHash: sha('t'), evidenceHash: sha('e'),
    heldOut, baseHits, mintedHits, score: o.score ?? (mintedHits / heldOut),
    verdict, smallSample: heldOut < 5, createdAt: 'issued', scope: 'self-issued',
  };
  if (o.rerun !== undefined) body.rerun = o.rerun;
  if (o.keyClass) body.keyClass = o.keyClass;
  return { ...body, hash: sha(canon(body)) };
}
const URL = 'https://sjgant80-hub.github.io/fallforgemint/';

// ── canon (vendored) — kills the typeof === mutants ──
test('canon serializes each type and sorts object keys', () => {
  assert.equal(canon(null), 'null');
  assert.equal(canon(5), '5');
  assert.equal(canon(true), 'true');
  assert.equal(canon('x'), '"x"');
  assert.equal(canon([1, 2]), '[1,2]');
  assert.equal(canon({ b: 1, a: 2 }), '{"a":2,"b":1}');            // sorted
  assert.equal(canon({ z: [1], a: { c: 3 } }), '{"a":{"c":3},"z":[1]}'); // nested + sorted
});

// ── verifyReceipt — the integrity gate ──
test('verifyReceipt accepts a genuine receipt, including the boundaries', () => {
  assert.equal(verifyReceipt(mk()).ok, true);                                  // kills kind/hash/score === flips
  assert.equal(verifyReceipt(mk({ heldOut: 1, mintedHits: 1, baseHits: 0, verdict: 'BEATS' })).ok, true); // heldOut<1 → <=1; baseHits<0 → <=0
  assert.equal(verifyReceipt(mk({ heldOut: 8, mintedHits: 8, baseHits: 3, verdict: 'BEATS' })).ok, true); // mintedHits>heldOut → >=
  assert.equal(verifyReceipt(mk({ heldOut: 8, mintedHits: 8, baseHits: 8, verdict: 'TIES' })).ok, true);  // baseHits>heldOut → >=
});
test('verifyReceipt refuses a non-receipt, a bad shape, and a tampered receipt', () => {
  assert.equal(verifyReceipt(null).ok, false);
  assert.equal(verifyReceipt({ kind: 'x' }).ok, false);
  assert.equal(verifyReceipt({ ...mk(), mintedHits: 8 }).ok, false);   // changed a field, old hash → hash mismatch
  assert.equal(verifyReceipt(mk({ heldOut: 0 }).ok === undefined ? {} : { ...mk({ heldOut: 8 }), heldOut: 0, hash: mk().hash }).ok, false);
  assert.equal(verifyReceipt({ ...mk(), score: 0.99 }).ok, false);     // score doesn't match hits (and breaks hash)
});
test('verifyReceipt refuses a receipt whose verdict contradicts the hit counts', () => {
  assert.equal(verifyReceipt(mk({ verdict: 'BEATS', mintedHits: 4, baseHits: 4 })).ok, false); // BEATS needs minted>base → kills > → >=
  assert.equal(verifyReceipt(mk({ verdict: 'BEATS', mintedHits: 2, baseHits: 5 })).ok, false);
  assert.equal(verifyReceipt(mk({ verdict: 'LOSES', mintedHits: 5, baseHits: 5 })).ok, false); // LOSES needs minted<base → kills < → <=
  assert.equal(verifyReceipt(mk({ verdict: 'LOSES', mintedHits: 6, baseHits: 2 })).ok, false);
  assert.equal(verifyReceipt(mk({ verdict: 'TIES', mintedHits: 6, baseHits: 3 })).ok, false);  // TIES needs minted===base → kills === → !==
});
test('verifyReceipt accepts each honest verdict when the counts agree', () => {
  assert.equal(verifyReceipt(mk({ verdict: 'BEATS', mintedHits: 6, baseHits: 3 })).ok, true);
  assert.equal(verifyReceipt(mk({ verdict: 'LOSES', mintedHits: 2, baseHits: 5 })).ok, true);  // kills the || that would drop a clause
  assert.equal(verifyReceipt(mk({ verdict: 'TIES', mintedHits: 4, baseHits: 4 })).ok, true);
});
test('verifyReceipt accepts a zero minted-hit LOSES (kills mintedHits < 0 → <= 0)', () => {
  assert.equal(verifyReceipt(mk({ verdict: 'LOSES', mintedHits: 0, baseHits: 3 })).ok, true);
});

// ── backedFacts ──
test('backedFacts returns the citable values only from a verified receipt', () => {
  const f = backedFacts(mk());
  assert.equal(f.ok, true);
  assert.equal(f.heldOut, 8); assert.equal(f.mintedHits, 6); assert.equal(f.baseHits, 3);
  assert.equal(backedFacts({ ...mk(), mintedHits: 8 }).ok, false); // tampered → no facts
});
test('smallSample flips exactly at held-out 5 (kills heldOut < 5 → <= 5)', () => {
  assert.equal(backedFacts(mk({ heldOut: 4, mintedHits: 3, baseHits: 1, verdict: 'BEATS' })).smallSample, true);
  assert.equal(backedFacts(mk({ heldOut: 5, mintedHits: 3, baseHits: 1, verdict: 'BEATS' })).smallSample, false);
});

// ── the anti-fabrication gate ──
test('auditAd passes an ad whose numbers are all receipt-backed', () => {
  const r = mk();
  const g = generateAd(r, { reverifyUrl: URL });
  assert.equal(auditAd(g.ad, r, { reverifyUrl: URL }).ok, true);
});
test('auditAd REFUSES any unbacked number (fabrication is caught)', () => {
  const r = mk();
  const a = auditAd('the minted model was 10x faster and 99% accurate', r);
  assert.equal(a.ok, false);                       // kills unbacked.length > 0 → >= 0
  assert.ok(a.unbacked.includes('10') && a.unbacked.includes('99'));
  assert.equal(auditAd(5, r).ok, false);           // non-string
});
test('auditAd does not false-flag the receipt hash or base name digits', () => {
  const r = mk({ base: 'qwen2.5-0.5b' });          // the base name has digits
  const g = generateAd(r, { reverifyUrl: URL });
  assert.equal(auditAd(g.ad, r, { reverifyUrl: URL }).ok, true); // base + hash scrubbed before the count
});
test('auditAd REFUSES hype superlatives (data-bound templating)', () => {
  const r = mk();
  const a = auditAd('this model is blazing fast and revolutionary', r);
  assert.equal(a.ok, false);                       // kills hype.length > 0 → >= 0
  assert.ok(a.hype.includes('blazing') && a.hype.includes('revolutionary'));
});

// ── generateAd — every verdict, refuses a fake receipt ──
test('generateAd builds a clean ad for BEATS, LOSES and TIES', () => {
  assert.ok(generateAd(mk({ verdict: 'BEATS', mintedHits: 6, baseHits: 3 })).ad.includes('beat'));
  assert.ok(generateAd(mk({ verdict: 'LOSES', mintedHits: 2, baseHits: 5 })).ad.includes('lost'));
  assert.ok(generateAd(mk({ verdict: 'TIES', mintedHits: 4, baseHits: 4 })).ad.includes('tied'));
});
test('generateAd REFUSES to advertise an unverifiable receipt', () => {
  assert.equal(generateAd({ ...mk(), mintedHits: 8 }).ok, false);
  assert.equal(generateAd({}).ok, false);
});
test('generateAd cites the receipt rerun URL and the honest key-class line when present', () => {
  const g = generateAd(mk({ rerun: 'https://example.com/run', keyClass: 'software-ed25519' }));
  assert.equal(g.ok, true);
  assert.ok(g.ad.includes('https://example.com/run'));       // the rerun linchpin is the CTA
  assert.ok(g.ad.toLowerCase().includes('software key'));    // the honest anti-trust line
  assert.equal(g.rerun, 'https://example.com/run');
});
test('generateAd falls back to the reverify link when the receipt has no rerun', () => {
  const g = generateAd(mk(), { reverifyUrl: URL });          // no r.rerun → uses opts.reverifyUrl
  assert.equal(g.ok, true);
  assert.ok(g.ad.includes(URL));                             // kills typeof opts.reverifyUrl === "string" → !==
});
test('generateAd treats an empty rerun as absent and falls back (kills the && → || in the rerun guard)', () => {
  const g = generateAd(mk({ rerun: '' }), { reverifyUrl: URL }); // rerun is present but empty
  assert.equal(g.ok, true);
  assert.ok(g.ad.includes(URL));                             // an empty rerun must NOT become the CTA
});
test('auditAd only scrubs a non-empty url (kills the && → || in the scrub guard)', () => {
  const r = mk({ heldOut: 12, mintedHits: 10, baseHits: 5, verdict: 'BEATS' }); // multi-digit backed numbers
  assert.equal(auditAd('the minted model scored 10 of 12', r, { reverifyUrl: '' }).ok, true); // empty url → no scrub, 10/12 intact
});
test('the honest verdict line matches the verdict (kills verdict === "LOSES" → !==)', () => {
  assert.ok(generateAd(mk({ verdict: 'LOSES', mintedHits: 2, baseHits: 5 })).ad.includes('against us'));
  assert.ok(!generateAd(mk({ verdict: 'BEATS', mintedHits: 6, baseHits: 3 })).ad.includes('against us'));
});

// ── generateCopy — per channel, audited ──
test('generateCopy produces audited copy for each known channel and refuses unknown', () => {
  const r = mk();
  for (const ch of ['show-hn', 'indie-hackers', 'x-thread']) {
    const c = generateCopy(r, ch, { reverifyUrl: URL });
    assert.equal(c.ok, true);
    assert.equal(auditAd(c.title + '\n' + c.body, r, { reverifyUrl: URL }).ok, true);
  }
  assert.equal(generateCopy(r, 'billboard', { reverifyUrl: URL }).ok, false);
  assert.equal(generateCopy({ ...mk(), mintedHits: 8 }, 'show-hn').ok, false);
});

// ── planPublish — the wall ──
test('planPublish queues every channel as PENDING_KEY and executes nothing', () => {
  const p = planPublish('some ad text', ['show-hn', 'indie-hackers']);
  assert.equal(p.ok, true);
  assert.equal(p.executed, 0);
  assert.ok(p.actions.every((a) => a.status === 'PENDING_KEY' && a.needs === 'simon-key'));
  assert.equal(p.actions.length, 2);
  assert.deepEqual(planPublish('x').actions.map((a) => a.channel), ['show-hn', 'indie-hackers', 'x-thread']); // default set
  assert.equal(planPublish('x', []).actions.length, 3); // empty channel list → default set (kills the length guard)
  assert.equal(planPublish('').ok, false);         // nothing to publish
});
