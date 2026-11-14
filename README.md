# Token Radar — make.fun token-radar-01 entry

A token launch radar: it reads a sealed snapshot of every protocol DefiLlama
tracks, finds the ones that record no token and are not a wrapped or staked
product of one that trades, ranks them by an implied launch value, and hands
in a web dashboard that shows the board, a detail view for each protocol and
the steps to farm it.

## What it builds

- `main.ts` (Node 22, stdlib only) reads `/input/snapshot.json`, scores every
  protocol with the radar-2 model in `lib/model.ts`, and writes:
  - `/output/board.json` — 150 ranked rows: all 40 watchlist protocols plus
    110 early pre-token finds below the $50M floor, each with an implied value
    and a 7-step farm plan;
  - `/output/data.js` — the dashboard's dataset;
  - `/output/dashboard/` — the static page (renders with no network);
  - `/output/screenshots/` — the board, a detail view and a filtered view;
  - `/output/dossier.json` — built with `buildDossier` from
    `vendor/makefun-board.ts`.

## The value model (radar-2)

Every protocol is scored by the same formula, from the snapshot's own figures
only — no protocol name is special-cased:

```
implied = round( tvl_usd × 0.25
  × (1 + clamp(change_7d, -50, 150)/100 × 0.6)
  × (0.55 + min(age_days, 1095)/1095 × 0.45)
  × (1 + 0.02 × min(chain_count, 5)) )
```

- **TVL × 0.25** — the size of the business a token would price.
- **Growth** — 7-day TVL change, clamped so one viral week cannot crown a
  protocol, weighted 0.6.
- **Maturity** — days since first listing (capped at 3 years); longer with no
  token means more pent-up launch value.
- **Breadth** — +2% per chain, max 5 chains.

The dashboard recomputes every row with the same arithmetic and shows a
per-protocol breakdown, plus a model sandbox that re-ranks the board live.

## The dashboard

Dark radar-scope design: sortable columns, text search, category and chain
filters, a watchlist-only toggle, pre-token/live tabs, a detail drawer per
protocol (value breakdown, snapshot figures, farm plan with cost/time chips),
and hash deep-links. Board combined implied value: $3.04B.

## Run it locally

```sh
mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts --input <snapshot.json>
```

Requires Node.js 22.18 or later. Deterministic: two runs are byte-identical.
