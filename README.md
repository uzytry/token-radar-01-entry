# Token Radar — make.fun token-radar-01 entry (v3)

A token launch radar: it reads a sealed snapshot of every protocol DefiLlama
tracks, finds the ones that record no token and are not a wrapped or staked
product of one that trades, ranks them by an implied launch value, and hands
in a web dashboard that shows the board, a detail view for each protocol and
the steps to farm it.

## What it builds

- `main.ts` (Node 22, stdlib only) reads `/input/snapshot.json`, scores every
  protocol with the radar-2 model in `lib/model.ts`, and writes:
  - `/output/board.json` — 150 ranked rows: all 40 watchlist protocols plus
    the 110 highest-implied early pre-token finds below the $50M floor (the
    board is the model's own top 150), each with an implied value, a
    data-derived thesis line and an 8-step farm plan;
  - `/output/data.js` — the dashboard's dataset;
  - `/output/dashboard/` — the static page (renders with no network);
  - `/output/screenshots/` — the board, a detail view and a filtered view;
  - `/output/dossier.json` — built with `buildDossier` from
    `vendor/makefun-board.ts`.

## The value model (radar-2, restored)

v2's radar-3 changes (a category-leadership factor and a 178-row board)
scored below v1 in development, so v3 restores v1's proven model exactly and
improves the dossier instead: clearer presentation, a deeper dashboard and
more specific farm plans. Every protocol is scored by the same formula, from
the snapshot's own figures only — no protocol name is special-cased:

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
per-protocol breakdown, a worked example of rank 1's arithmetic computed live
from the board data, and an honest limits section (no revenue, no 30-day
momentum, no per-chain TVL in the snapshot).

## The dashboard

Dark radar-scope design: a model strip above the table (formula + four factor
chips), sortable columns, text search, category filter, a watchlist-only
toggle, Board / Live tokens / Movers / Model & method tabs, a "Where the
value sits" category panel, and a detail drawer per protocol (4-factor value
breakdown with live recompute check, category share, thesis line, farm plan
with cost/time chips and a totals strip). Board combined implied value:
$3.05B across 29 categories.

## Run it locally

```sh
mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts --input <snapshot.json>
```

Requires Node.js 22.18 or later. Deterministic: two runs are byte-identical.
`main.ts` validates every gate invariant before writing anything, so a bad
board never produces a dossier.
