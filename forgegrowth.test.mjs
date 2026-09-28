import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { canon, verifyReceipt, backedFacts, auditAd, generateAd, generateCopy, planPublish, xLength, shareLink, fireReceipt, verifyFire, LIMITS, DOORS } from './forgegrowth.mjs';

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

// ── launch: honest copy, channel limits, one-click doors, fire receipts ──
const RUN = 'https://github.com/sjgant80-hub/fallforgemint/actions/runs/36431565425';
test('generateAd says only what the receipt measured — narrow-true held-out wording, the base got no spec', () => {
  const ad = generateAd(mk({ keyClass: 'software-ed25519' }), { reverifyUrl: URL }).ad;
  assert.ok(ad.startsWith('The minted model beat its base model on held-out examples.'));
  assert.ok(ad.includes('On 8 held-out examples that were not in the spec it was given, the minted model scored 6 and its base "qwen2.5-0.5b", given the same inputs without the spec, scored 3. Verdict: BEATS.'));
  for (const v of [mk(), mk({ verdict: 'LOSES', mintedHits: 2, baseHits: 5 }), mk({ verdict: 'TIES', mintedHits: 4, baseHits: 4 })]) {
    const a = generateAd(v, { reverifyUrl: URL }).ad;
    assert.equal(/renting|your own data|never saw|memoris|hermetic/i.test(a), false, a);
  }
  assert.ok(generateAd(mk({ verdict: 'LOSES', mintedHits: 2, baseHits: 5 })).ad.startsWith('The minted model lost to its base model on held-out examples, and the receipt says so.'));
  assert.ok(generateAd(mk({ verdict: 'LOSES', mintedHits: 2, baseHits: 5 })).ad.includes('keep the base'));
  assert.ok(generateAd(mk({ verdict: 'TIES', mintedHits: 4, baseHits: 4 })).ad.startsWith('The minted model tied its base model on held-out examples.'));
});
test('generateAd: where it was measured and how to re-run it are separate lines, each only when known', () => {
  const both = generateAd(mk({ rerun: RUN }), { reverifyUrl: URL });
  assert.deepEqual(both.ad.split('\n').slice(-2), ['Measured on a GitHub runner: ' + RUN, 'Re-run it yourself: ' + URL]);
  assert.equal(both.rerun, RUN);
  const runOnly = generateAd(mk({ rerun: RUN })).ad;
  assert.equal(runOnly.split('\n').pop(), 'Measured on a GitHub runner: ' + RUN);
  assert.equal(runOnly.includes('verifies in your browser'), false);
  assert.equal(generateAd(mk()).ad.split('\n').pop(), 'Re-run it yourself — it verifies in your browser.');
  assert.equal(generateAd(mk(), { reverifyUrl: 7 }).ad.split('\n').pop(), 'Re-run it yourself — it verifies in your browser.');
  assert.equal(generateAd(mk({ rerun: 5 }), { reverifyUrl: URL }).rerun, '');
});
test('generateCopy: the rerun link on a receipt is not mistaken for an unbacked number (a real CI receipt copies)', () => {
  const r = mk({ rerun: RUN, keyClass: 'software-ed25519' });
  for (const ch of ['show-hn', 'indie-hackers', 'x-thread', 'x-post', 'product-hunt']) {
    const c = generateCopy(r, ch, { reverifyUrl: URL });
    assert.equal(c.ok, true, ch + ': ' + c.why);
    assert.equal(c.channel, ch);
    assert.equal(c.verdict, 'BEATS');
  }
  assert.ok(generateCopy(r, 'show-hn', { reverifyUrl: URL }).body.includes(RUN));
});
test('generateCopy: the fixed titles fit each channel, and the credit rides on the long-form posts', () => {
  const r = mk();
  const hn = generateCopy(r, 'show-hn', { reverifyUrl: URL });
  assert.equal(hn.title, 'Show HN: FallForge Mint – own a model, with a scorecard anyone can re-run');
  assert.ok(hn.title.length <= LIMITS.hnTitle && hn.title.startsWith('Show HN: '));
  assert.ok(hn.body.includes('an edited number, a borrowed CI link or a result that does not reproduce fails the job'));
  const ph = generateCopy(r, 'product-hunt', { reverifyUrl: URL });
  assert.ok(ph.tagline.length <= LIMITS.phTagline && ph.description.length <= LIMITS.phDescription);
  assert.equal(ph.title, 'FallForge Mint');
  for (const c of [ph, generateCopy(r, 'indie-hackers', { reverifyUrl: URL })]) assert.ok(c.body.endsWith('Powered by the Konomi architecture, created by Thomas Frumkin.'));
  assert.ok(generateCopy(r, 'indie-hackers', { reverifyUrl: URL }).body.includes('cannot publish on its own'));
  assert.equal(generateCopy(r, 'x-thread', { reverifyUrl: URL }).body, generateAd(r, { reverifyUrl: URL }).ad);
  assert.deepEqual(LIMITS, { hnTitle: 80, xPost: 280, xUrl: 23, phTagline: 60, phDescription: 260 });
});
test('generateCopy: the X post carries the receipt numbers and the link, and is refused past X\'s limit', () => {
  const x = generateCopy(mk(), 'x-post', { reverifyUrl: URL });
  assert.equal(x.body, 'On held-out examples that were not in its spec, the minted model scored 6/8; its base qwen2.5-0.5b, given no spec, scored 3/8: BEATS. The scorecard is signed, and anyone can re-run it on a clean GitHub runner. A forged one fails. ' + URL);
  assert.equal(x.title, '');
  // the post grows with the base name: exactly the limit passes, one character more is refused
  const room = LIMITS.xPost - xLength(x.body);
  const fits = generateCopy(mk({ base: 'qwen2.5-0.5b' + 'x'.repeat(room) }), 'x-post', { reverifyUrl: URL });
  assert.equal(fits.ok, true);
  assert.equal(xLength(fits.body), LIMITS.xPost);
  const over = generateCopy(mk({ base: 'qwen2.5-0.5b' + 'x'.repeat(room + 1) }), 'x-post', { reverifyUrl: URL });
  assert.deepEqual([over.ok, over.why], [false, 'the X post is longer than X allows']);
});
test('generateCopy: a channel audit refuses what the ad audit would let through', () => {
  // a page link carrying digits the receipt does not back is fine when it IS the page (scrubbed), refused when not
  const odd = 'https://example.com/v9/';
  assert.equal(generateCopy(mk(), 'x-post', { reverifyUrl: odd }).ok, true);
  const r = mk({ rerun: RUN });
  const c = generateCopy(r, 'show-hn', { reverifyUrl: URL });
  assert.equal(auditAd(Object.values({ t: c.title, b: c.body }).join('\n'), r, { reverifyUrl: URL }).ok, false);   // the run link must be scrubbed
});
test('xLength: every link counts as 23, whatever its length; non-text is -1', () => {
  assert.equal(xLength('abc'), 3);
  assert.equal(xLength('see https://a.b/' + 'x'.repeat(100)), 4 + 23);
  assert.equal(xLength('http://x.y and https://z.w/q'), 23 + 5 + 23);
  assert.equal(xLength(''), 0);
  assert.equal(xLength(null), -1);
});
test('shareLink: one-click doors open each channel\'s own form, prefilled where it allows; nothing posts', () => {
  const r = mk({ rerun: RUN });
  const hn = shareLink(generateCopy(r, 'show-hn', { reverifyUrl: URL }), URL);
  assert.equal(hn.url, 'https://news.ycombinator.com/submitlink?u=' + encodeURIComponent(URL) + '&t=' + encodeURIComponent('Show HN: FallForge Mint – own a model, with a scorecard anyone can re-run'));
  assert.deepEqual([hn.ok, hn.channel, hn.prefilled], [true, 'show-hn', true]);
  assert.ok(hn.paste.startsWith('The minted model beat'));
  const xc = generateCopy(r, 'x-post', { reverifyUrl: URL }), x = shareLink(xc, URL);
  assert.deepEqual([x.url, x.paste, x.prefilled], ['https://x.com/intent/post?text=' + encodeURIComponent(xc.body), '', true]);
  const ihc = generateCopy(r, 'indie-hackers', { reverifyUrl: URL }), ih = shareLink(ihc, URL);
  assert.deepEqual([ih.url, ih.paste, ih.prefilled], ['https://www.indiehackers.com/new-post', ihc.title + '\n\n' + ihc.body, false]);
  const phc = generateCopy(r, 'product-hunt', { reverifyUrl: URL }), ph = shareLink(phc, URL);
  assert.deepEqual([ph.url, ph.paste, ph.prefilled, ph.channel], ['https://www.producthunt.com/posts/new', phc.body, false, 'product-hunt']);
  assert.deepEqual(DOORS, { hn: 'https://news.ycombinator.com/submitlink', x: 'https://x.com/intent/post', ih: 'https://www.indiehackers.com/new-post', ph: 'https://www.producthunt.com/posts/new' });
  assert.match(shareLink(generateCopy(r, 'x-thread', { reverifyUrl: URL }), URL).why, /no one-click door for x-thread/);
  for (const bad of [null, 'copy', { ok: false, channel: 'show-hn' }, { ok: 'true', channel: 'show-hn' }]) assert.match(shareLink(bad, URL).why, /needs audited copy/);
  for (const page of [undefined, 'http://x.y/', 'https://a b/', 'https://']) assert.match(shareLink(generateCopy(r, 'show-hn', { reverifyUrl: URL }), page).why, /needs the https page/);
});
test('fireReceipt: a self-hashed record of what fired, where, when, on whose key — refuses without any of them', () => {
  const good = { channel: 'github-release', url: 'https://github.com/sjgant80-hub/fallforgemint/releases/tag/v1.0.0', firedAt: '2026-09-28T16:00:00Z', key: 'simon-go', receiptHash: 'a'.repeat(64) };
  const f = fireReceipt(good).fire;
  assert.deepEqual([f.kind, f.status, f.v, f.channel, f.url, f.firedAt, f.key, f.receiptHash], ['forgegrowth-fire', 'FIRED', 1, good.channel, good.url, good.firedAt, 'simon-go', 'a'.repeat(64)]);
  assert.deepEqual(verifyFire(f), { ok: true, valid: true });
  assert.equal(verifyFire({ ...f, url: 'https://elsewhere.example/' }).valid, false);
  for (const bad of [null, { ...f, kind: 'x' }, { ...f, hash: 7 }]) assert.equal(verifyFire(bad).ok, false);
  assert.match(fireReceipt('x').why, /takes an object/);
  assert.match(fireReceipt({ ...good, channel: '' }).why, /channel/);
  assert.equal(fireReceipt({ ...good, channel: 5 }).ok, false);
  for (const url of ['http://x.y/', 'ftp://x', 'https://a b', 7]) assert.match(fireReceipt({ ...good, url }).why, /public https URL/);
  for (const firedAt of ['soon', '', 7]) assert.match(fireReceipt({ ...good, firedAt }).why, /timestamp/);
  for (const key of ['', undefined]) assert.match(fireReceipt({ ...good, key }).why, /nothing fires without one/);
  for (const receiptHash of ['A'.repeat(64), 'a'.repeat(63), undefined]) assert.match(fireReceipt({ ...good, receiptHash }).why, /scorecard hash/);
});
