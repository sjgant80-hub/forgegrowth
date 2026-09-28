# ForgeGrowth

**▶ Live: https://sjgant80-hub.github.io/forgegrowth/**

<!-- film-2026-09 -->
**▶ [Watch the 90-second film](https://www.ai-nativesolutions.com/explainer.html#film)** — the receipt that can say you lost is the ad · [The brochure (PDF)](https://www.ai-nativesolutions.com/fall-os-prospectus.pdf) · [Every number, sourced](https://www.ai-nativesolutions.com/explainer.html#facts)

[![A real signed receipt that says BEATS and LOSES](https://www.ai-nativesolutions.com/media/images/scorecard-real-receipt.jpg)](https://www.ai-nativesolutions.com/explainer.html#film)

The growth engine that **can't lie and can't post**. It turns a real FallForge Mint scorecard receipt into launch copy under two hard rules:

- **Data-bound.** Every number in the copy must be a value on the receipt — a fabricated figure is refused — and hype superlatives are refused outright.
- **Behind a human key.** Every external publish is prepared and queued, never sent; a person fires the launch.

## Launches

**FallForge Mint, 28 September 2026** — [launches/fallforgemint-2026-09-28.json](launches/fallforgemint-2026-09-28.json), written by `tools/launch.mjs` from the gated kernel:

- **FIRED:** the [v1.0.0 GitHub release](https://github.com/sjgant80-hub/fallforgemint/releases/tag/v1.0.0), with a self-hashed fire receipt (`verifyFire`) naming the scorecard it advertises (`34f17f8a…`, minted in CI: 4/5 vs its base 0/5, BEATS).
- **Waiting on a person signed in to each channel:** Show HN and X (one-click, prefilled), Indie Hackers and Product Hunt (their own forms, with paste-ready copy). Each door is in the ledger; nothing here posts.

The paste-ready kit (the order to post, each door, the exact words, the Product Hunt fields and a 1270×760 gallery) is [launches/fallforgemint-2026-09-28.md](launches/fallforgemint-2026-09-28.md).

Every word of the copy passed the audit: numbers only from the receipt, no hype words, the held-out line narrow-true, and the base described as it was measured (the same inputs, without the spec).

Kernel-backed: the page imports `forgegrowth.mjs`, the same kernel the unit tests and the witness mutation gate prove on every change to it (`.github/workflows/gate.yml`).

Powered by the Konomi architecture, created by Thomas Frumkin. MIT — see [LICENSE](LICENSE) and [NOTICE](NOTICE).
