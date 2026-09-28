#!/usr/bin/env node
// tools/launch.mjs — the edge that turns a real fallforgemint scorecard into a launch, using ONLY the gated kernel.
//
//   node tools/launch.mjs <scorecard.json | re-run bundle.json> --page <https url> --name <launch>
//                         [--fired <channel>=<https url>@<ISO time> ...] [--key <who fired it>]
//
// Writes launches/<name>.json: the scorecard it advertises (verified), the audited copy for every channel, the one-click
// door for every account-bound channel, and the queue. Every channel stays PENDING_KEY until a fire receipt says it
// fired; a firing is recorded here, never performed here. It posts nothing. Rerunning it keeps earlier fire receipts.
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const K = await import(pathToFileURL(join(here, '..', 'forgegrowth.mjs')).href);
const argv = process.argv.slice(2);
const die = (why) => { process.stderr.write('launch: ' + why + '\n'); process.exit(1); };
const flag = (f) => { const i = argv.indexOf(f); return i >= 0 ? argv[i + 1] : undefined; };
const all = (f) => argv.flatMap((a, i) => (a === f ? [argv[i + 1]] : []));
const src = argv[0], page = flag('--page'), name = flag('--name'), key = flag('--key');
if (!src || !page || !name || !/^[a-z0-9-]+$/.test(name)) die('usage: launch.mjs <scorecard|bundle.json> --page <https url> --name <launch-name> [--fired channel=url@time ...] [--key who]');

const doc = JSON.parse(readFileSync(src, 'utf8'));
const receipt = doc && doc.kind === 'fallforgemint-rerun-bundle' ? doc.receipt : doc;
const v = K.verifyReceipt(receipt);
if (!v.ok) die('refused — the scorecard does not verify: ' + v.why);

// channels: the one on our own rail (a GitHub release) first, then the account-bound ones in the order to post them
const BOUND = ['show-hn', 'x-post', 'indie-hackers', 'product-hunt'];
const copy = {};
for (const ch of BOUND) {
  const c = K.generateCopy(receipt, ch, { reverifyUrl: page });
  if (!c.ok) die(ch + ': ' + c.why);
  copy[ch] = c;
}
const ad = K.generateAd(receipt, { reverifyUrl: page });
const plan = K.planPublish(ad.ad, ['github-release', ...BOUND]);

const out = join(here, '..', 'launches', name + '.json');
const before = existsSync(out) ? JSON.parse(readFileSync(out, 'utf8')) : null;
const fires = {};
for (const q of before ? before.queue : []) if (q.fire && K.verifyFire(q.fire).valid) fires[q.channel] = q.fire;
for (const spec of all('--fired')) {
  const m = /^([a-z-]+)=(https:\/\/\S+)@(\S+)$/.exec(spec || '');
  if (!m) die('--fired takes channel=https-url@ISO-time');
  if (!key) die('--fired needs --key: nothing fires without one');
  const f = K.fireReceipt({ channel: m[1], url: m[2], firedAt: m[3], key, receiptHash: receipt.hash });
  if (!f.ok) die(m[1] + ': ' + f.why);
  fires[m[1]] = f.fire;
}

const queue = plan.actions.map((a) => {
  if (fires[a.channel]) return { channel: a.channel, status: 'FIRED', fire: fires[a.channel] };
  const door = copy[a.channel] ? K.shareLink(copy[a.channel], page) : null;
  return { channel: a.channel, status: a.status, needs: a.needs, ...(door && door.ok ? { door: { url: door.url, prefilled: door.prefilled } } : {}) };
});
const ledger = {
  kind: 'forgegrowth-launch', name, page,
  scorecard: { hash: receipt.hash, verdict: receipt.verdict, heldOut: receipt.heldOut, mintedHits: receipt.mintedHits, baseHits: receipt.baseHits, base: receipt.base, measuredIn: receipt.rerun || null },
  copy, queue,
  fired: queue.filter((q) => q.status === 'FIRED').length,
  note: 'Written by tools/launch.mjs from the gated forgegrowth kernel. FIRED entries carry a self-hashed fire receipt (verifyFire). PENDING_KEY entries are account-bound: the door opens the channel\'s own form, and a person signed in there presses post. Nothing here posted anything.',
};
mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, JSON.stringify(ledger, null, 2) + '\n');
console.log('launch ' + name + ': ' + ledger.fired + ' fired, ' + (queue.length - ledger.fired) + ' waiting on a key → ' + out);
for (const q of queue) console.log('  ' + q.status.padEnd(12) + q.channel.padEnd(15) + (q.fire ? q.fire.url : (q.door ? q.door.url.slice(0, 90) + (q.door.url.length > 90 ? '…' : '') : '')));
