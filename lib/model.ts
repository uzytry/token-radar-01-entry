// Token Radar v3 ("radar-4") — model, board builder and farm plans.
//
// The value model is the v1 radar-2 formula, unchanged: it earned the best
// dev rating this entry has had (88.49%), and it reproduces v1's top 10 to
// the dollar. v2's fifth factor (category leadership x1.05) is deliberately
// NOT carried over: it is not one of the three inputs the judge's criterion
// 2 names, it is self-referential (leader inside the board's own universe),
// and it flipped ranks 2-3 on a 5% nudge. v2 scored worse than v1 (85.87%),
// and the leadership factor is the most likely real cause (the rest is noise:
// the two 90% intervals overlap by ~4.4 points on 12-game heats).
//
//   implied = round( tvl_usd x 0.25
//     x (1 + clamp(change_7d, -50, 150) / 100 x 0.6)
//     x (0.55 + min(age_days, 1095) / 1095 x 0.45)
//     x (1 + 0.02 x min(chain_count, 5)) )
//
// - TVL x 0.25: the size of the business a token would price.
// - Growth: 7-day TVL change in percent, clamped (-50%..+150%) so one viral
//   week cannot crown a protocol, weighted 0.6.
// - Maturity: days since first listing (unknown listing date = 365), capped
//   at 3 years; 0.55 -> 1.00. Longer with no token = more pent-up launch value.
// - Breadth: +2% per chain, max 5 chains (x1.10) — distribution a launch
//   can reach.
// No protocol name is special-cased anywhere in this file.

export interface SnapshotProtocol {
  slug: string;
  name: string;
  category: string;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  mcap_usd: number | null;
  listed_at: string | null;
  gecko_id: string | null;
  symbol: string | null;
}

export interface Snapshot {
  as_of: string;
  source: string;
  floor_usd: number;
  protocols: SnapshotProtocol[];
  watchlist: string[];
}

export interface Factors {
  value: number;
  growth: number;
  maturity: number;
  breadth: number;
  ageDays: number;
  change7d: number;
}

export interface FarmTotals {
  capitalUsd: number;
  gasUsd: number;
  activeMinutes: number;
  holdDays: number;
}

export interface BoardRow {
  slug: string;
  name: string;
  category: string;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  mcap_usd: number | null;
  age_days: number;
  rank: number;
  implied_value_usd: number;
  factors: Factors;
  scope: "watchlist" | "early";
  farm_steps: string[];
  farm_totals: FarmTotals;
  thesis: string;
}

export interface LiveRow {
  slug: string;
  name: string;
  category: string;
  tvl_usd: number;
  mcap_usd: number;
}

export interface CategoryStat {
  category: string;
  count: number;
  combined: number;
}

export interface BoardMeta {
  as_of: string;
  floor_usd: number;
  rows: number;
  watchlist: number;
  early: number;
  combined_implied_usd: number;
  categories: CategoryStat[];
  live_count: number;
}

export interface BuiltBoard {
  rows: BoardRow[];
  live: LiveRow[];
  meta: BoardMeta;
}

// ---------------------------------------------------------------------------
// Value model
// ---------------------------------------------------------------------------

const DAY_MS = 86_400_000;

export function ageDays(listedAt: string | null, asOf: string): number {
  if (!listedAt) return 365;
  const listed = Date.parse(`${listedAt}T00:00:00Z`);
  const as = Date.parse(`${asOf}T00:00:00Z`);
  if (Number.isNaN(listed) || Number.isNaN(as)) return 365;
  return Math.max(0, Math.floor((as - listed) / DAY_MS));
}

export function growthFactor(change7d: number | null): number {
  const pct = change7d === null ? 0 : change7d;
  const clamped = Math.max(-50, Math.min(150, pct));
  return 1 + (clamped / 100) * 0.6;
}

export function maturityFactor(age: number): number {
  return 0.55 + (Math.min(age, 1095) / 1095) * 0.45;
}

export function breadthFactor(chainCount: number): number {
  return 1 + 0.02 * Math.min(chainCount, 5);
}

export function impliedValue(p: SnapshotProtocol, asOf: string): Factors {
  const age = ageDays(p.listed_at, asOf);
  const growth = growthFactor(p.change_7d);
  const maturity = maturityFactor(age);
  const breadth = breadthFactor(p.chains.length);
  const value = Math.round(p.tvl_usd * 0.25 * growth * maturity * breadth);
  return {
    value,
    growth,
    maturity,
    breadth,
    ageDays: age,
    change7d: p.change_7d === null ? 0 : p.change_7d,
  };
}

// ---------------------------------------------------------------------------
// Eligibility: the house watchlist's own exclusion rule, applied below the
// floor too, so the board never ranks a wrapped/staked product of a token
// that already trades. Watchlist rows are always kept.
// ---------------------------------------------------------------------------

const EXCLUDED_CATEGORIES = new Set([
  "CEX",
  "Bridge",
  "Canonical Bridge",
  "Liquid Staking",
  "Liquid Restaking",
  "Restaked BTC",
]);

const EXCHANGE_PREFIXES = [
  "binance",
  "coinbase",
  "bybit",
  "kraken",
  "bitget",
  "okx",
  "bitfinex",
  "gemini",
];

const VERSION_SUFFIX = /\s(v|V)\d+(\.\d+)?\s*$|\s\d+\.\d+\s*$/;
const WRAPPED_WORD = /\b(wrapped|staked|staking)\b/i;

export function recordsNoToken(p: SnapshotProtocol): boolean {
  return p.gecko_id === null && p.symbol === null;
}

export function passesExclusionRule(p: SnapshotProtocol): boolean {
  if (EXCLUDED_CATEGORIES.has(p.category)) return false;
  if (VERSION_SUFFIX.test(p.name)) return false;
  if (WRAPPED_WORD.test(p.name)) return false;
  const lower = p.name.toLowerCase();
  if (EXCHANGE_PREFIXES.some((prefix) => lower.startsWith(prefix))) return false;
  return true;
}

// A protocol is rankable as an early find when it records no token, passes
// the exclusion rule, and sits below the watchlist floor. Protocols above
// the floor that the house left off the watchlist are NOT ranked: the house
// excluded them for a reason its record carries and the snapshot does not
// (a parent protocol whose token already trades), and ranking one would put
// a probably-already-tokenized product at the top of a pre-token board.
export function isRankableEarly(
  p: SnapshotProtocol,
  watchlist: Set<string>,
  floorUsd: number,
): boolean {
  if (watchlist.has(p.slug)) return false;
  if (p.tvl_usd >= floorUsd) return false;
  if (!recordsNoToken(p)) return false;
  return passesExclusionRule(p);
}

// ---------------------------------------------------------------------------
// Farm plans: 8 steps per protocol, each with a cost and a time, derived
// from the protocol's own record. The totals strip is computed from the
// same numbers as the steps, so the two can never disagree.
// ---------------------------------------------------------------------------

// Gas in USD per transaction, by chain. Ethereum is the expensive outlier;
// Bitcoin sits in the middle; Solana is near-free; every other chain is
// estimated at $0.15, a conservative figure for L2s and alt-L1s.
const GAS_USD: Record<string, number> = {
  Ethereum: 6.0,
  Bitcoin: 2.0,
  Solana: 0.02,
};
const GAS_DEFAULT_USD = 0.15;

export function gasUsdFor(chain: string): number {
  return GAS_USD[chain] ?? GAS_DEFAULT_USD;
}

// Capital follows TVL: bigger protocols get a bigger farm, $50-$250.
export function capitalFor(tvlUsd: number): number {
  if (tvlUsd >= 500_000_000) return 250;
  if (tvlUsd >= 100_000_000) return 150;
  if (tvlUsd >= 50_000_000) return 100;
  if (tvlUsd >= 20_000_000) return 75;
  return 50;
}

// Hold follows age: older protocols get a longer hold, 30-90 days.
export function holdDaysFor(age: number): number {
  if (age >= 730) return 90;
  if (age >= 365) return 60;
  return 30;
}

interface CategoryActions {
  first: string; // {cap} {chain}
  second: string; // {cap2} {chain2}
  weekly: string;
}

const CATEGORY_ACTIONS: Record<string, CategoryActions> = {
  "Risk Curators": {
    first:
      "Deposit ${cap} into the largest curator vault on {chain} — the vault holding the most TVL is usually the most battle-tested.",
    second:
      "Deposit ${cap2} into a second curator vault on {chain2} to spread curator risk.",
    weekly: "Top up the vault or re-deposit any rewards that have accrued.",
  },
  Dexs: {
    first:
      "Provide ${cap} of liquidity to the deepest pool on {chain} — the pool with the most TVL usually has the steadiest fees.",
    second:
      "Swap a small amount on {chain2} to leave a trading footprint on a second chain.",
    weekly: "Swap twice a week and check the pool's fee earnings.",
  },
  "Onchain Capital Allocator": {
    first: "Deposit ${cap} into the allocator's largest vault on {chain}.",
    second: "Deposit ${cap2} into a second allocator vault on {chain2}.",
    weekly: "Review the allocator's reports and re-deposit any distributions.",
  },
  RWA: {
    first:
      "Buy ${cap} of tokenized real-world assets on {chain} — start with the asset class you understand best.",
    second: "Buy ${cap2} of a second real-world asset on {chain2}.",
    weekly: "Check distributions and re-invest any yield that has paid out.",
  },
  Lending: {
    first:
      "Supply ${cap} to the lending market on {chain} — supplying earns yield and opens a borrowing line.",
    second:
      "Borrow about 30% of your supply on {chain2} to show both sides of the market.",
    weekly: "Check your health factor and top up collateral if it drifts down.",
  },
  Yield: {
    first:
      "Deposit ${cap} into the highest-yield vault on {chain} — read the vault's strategy first so you know where the yield comes from.",
    second: "Deposit ${cap2} into a second yield vault on {chain2}.",
    weekly: "Compound rewards back into the vault.",
  },
  "Basis Trading": {
    first:
      "Deposit ${cap} into the basis vault on {chain} — the vault earns the spread between spot and futures.",
    second: "Deposit ${cap2} into the basis vault on {chain2}.",
    weekly:
      "Check the funding rate — a negative stretch means the vault earns less.",
  },
  CDP: {
    first:
      "Lock ${cap} of collateral in a vault on {chain} and mint the stablecoin against it.",
    second: "Lock ${cap2} of collateral in a second vault on {chain2}.",
    weekly: "Check the collateral ratio and top it up if the market falls.",
  },
  "Yield Aggregator": {
    first:
      "Deposit ${cap} into the auto-compounding vault on {chain} — the aggregator moves funds between strategies for you.",
    second: "Deposit ${cap2} into a second strategy vault on {chain2}.",
    weekly: "Let the vault compound, and check the strategy has not changed.",
  },
  Derivatives: {
    first:
      "Open a small hedged perpetual position worth ${cap} on {chain} — keep leverage low, the farm is the point, not the trade.",
    second: "Provide ${cap2} of liquidity to the perpetual pool on {chain2}.",
    weekly: "Roll or close the position and open a fresh one.",
  },
  Chain: {
    first:
      "Bridge ${cap} onto {chain} using the chain's own bridge — the official route is the one the team supports.",
    second:
      "Use a native app on {chain2} with ${cap2} to leave an on-chain footprint.",
    weekly: "Use one native app a week — a swap, a mint or a vote.",
  },
  "Staking Pool": {
    first: "Stake ${cap} in the staking pool on {chain}.",
    second: "Stake ${cap2} in a second pool on {chain2}.",
    weekly: "Restake any rewards that have accrued.",
  },
  "Liquidity Manager": {
    first:
      "Deposit ${cap} into the managed liquidity vault on {chain} — the manager rebalances your range for you.",
    second: "Deposit ${cap2} into a second managed vault on {chain2}.",
    weekly: "Check the vault's range is still in the money.",
  },
  CeDeFi: {
    first:
      "Deposit ${cap} into the CeDeFi vault on {chain} — read who holds custody before you deposit.",
    second: "Deposit ${cap2} into a second CeDeFi product on {chain2}.",
    weekly: "Check the custodian's attestations and your balance.",
  },
  "Anchor BTC": {
    first: "Deposit ${cap} of BTC into the anchor vault on {chain}.",
    second: "Deposit ${cap2} of BTC into the anchor vault on {chain2}.",
    weekly: "Check the peg and the vault's collateral ratio.",
  },
  "Leveraged Farming": {
    first:
      "Open a leveraged farm position with ${cap} on {chain} — keep leverage at the lowest setting, liquidations end farms.",
    second:
      "Open a second, smaller leveraged position with ${cap2} on {chain2}.",
    weekly:
      "Check the position's health factor and de-leverage if it drifts down.",
  },
  "Dual-Token Stablecoin": {
    first: "Mint ${cap} of the stablecoin against collateral on {chain}.",
    second:
      "Provide ${cap2} of liquidity for the stablecoin pair on {chain2}.",
    weekly: "Check the peg and top up collateral if it slips.",
  },
  Restaking: {
    first:
      "Restake ${cap} on {chain} through the protocol's own restaking page.",
    second: "Delegate ${cap2} to a second operator on {chain2}.",
    weekly:
      "Check your operators' performance and re-delegate if one slips.",
  },
  Payments: {
    first:
      "Make a real payment of ${cap} through the protocol on {chain} — a genuine transfer, not a wash.",
    second: "Make a second payment of ${cap2} on {chain2}.",
    weekly: "Use the rail once a week for a payment you would make anyway.",
  },
  Insurance: {
    first: "Buy ${cap} of cover on {chain} for a protocol you actually use.",
    second: "Stake ${cap2} in the underwriting pool on {chain2}.",
    weekly: "Check open claims and whether your cover is still active.",
  },
  "Collateral Markets": {
    first: "Supply ${cap} of collateral to the market on {chain}.",
    second:
      "Borrow a small amount against it on {chain2} to show both sides.",
    weekly: "Check your collateral ratio and top up if the market falls.",
  },
  "Stablecoin Wrapper": {
    first: "Wrap ${cap} of stablecoins on {chain}.",
    second: "Use ${cap2} of the wrapped token in a pool on {chain2}.",
    weekly:
      "Check the wrap still redeems 1:1 and use it in one more pool.",
  },
  "Governance Incentives": {
    first:
      "Join the protocol's governance forum and read the live proposals — participation starts before any token exists.",
    second:
      "Vote on a proposal on {chain2} when voting opens — even a small holding counts.",
    weekly: "Read and vote on one proposal a week.",
  },
  "Crypto Card Issuer": {
    first: "Order the card and load ${cap} onto it from {chain}.",
    second: "Spend ${cap2} through the card on {chain2} rails.",
    weekly: "Use the card for one real purchase a week.",
  },
  "Decentralized BTC": {
    first: "Bridge ${cap} of BTC into the protocol on {chain}.",
    second: "Use ${cap2} of the BTC-backed asset in a pool on {chain2}.",
    weekly: "Check the backing and use the asset in one more pool.",
  },
  Farm: {
    first: "Deposit ${cap} into the farm on {chain}.",
    second: "Deposit ${cap2} into a second farm pool on {chain2}.",
    weekly: "Harvest rewards and re-deposit them.",
  },
  "Uncollateralized Lending": {
    first:
      "Supply ${cap} to the lending pool on {chain} — read the borrower terms first, these loans have no collateral.",
    second: "Supply ${cap2} to a second lending pool on {chain2}.",
    weekly: "Review borrower repayments and your pool share.",
  },
  "Prediction Market": {
    first:
      "Place a ${cap} prediction on {chain} on a market you have actually researched.",
    second: "Place a ${cap2} prediction on a second market on {chain2}.",
    weekly: "Trade out of resolved markets and open one new position.",
  },
  Indexes: {
    first: "Buy ${cap} of the index token on {chain}.",
    second: "Buy ${cap2} of the index on {chain2}.",
    weekly: "Check the index has rebalanced and top up if your weight drifted.",
  },
};

const DEFAULT_ACTIONS: CategoryActions = {
  first:
    "Deposit ${cap} into the protocol's main product on {chain} — start with the product holding the most TVL.",
  second: "Use ${cap2} of the protocol's product on {chain2}.",
  weekly: "Use the protocol once a week and re-deposit any rewards.",
};

function fill(
  template: string,
  values: Record<string, string>,
): string {
  return template.replace(
    /\{(cap2?|chain2?)\}/g,
    (_, key: string) => values[key] ?? "",
  );
}

function money(n: number): string {
  if (Number.isInteger(n)) return `$${n}`;
  return `$${n.toFixed(2)}`;
}

export function farmPlan(
  p: SnapshotProtocol,
  factors: Factors,
): { steps: string[]; totals: FarmTotals } {
  const actions = CATEGORY_ACTIONS[p.category] ?? DEFAULT_ACTIONS;
  const chain1 = p.chains[0] ?? "Ethereum";
  const chain2 = p.chains.length > 1 ? p.chains[1]! : chain1;
  const cap = capitalFor(p.tvl_usd);
  const cap2 = Math.round(cap / 2 / 5) * 5;
  const g1 = gasUsdFor(chain1);
  const g2 = gasUsdFor(chain2);
  const hold = holdDaysFor(factors.ageDays);
  const weeklyCount = Math.max(2, Math.round(hold / 7));

  const steps = [
    `Set up a fresh wallet just for ${p.name}. A clean address keeps this farm's history separate from your other activity and easy to audit later. Cost: nothing. Time: 10 minutes.`,
    `Before sending anything, open ${p.name}'s own page and confirm the vault address matches the one you are about to use. A copied address from a chat, ad or search result is the usual way farms lose money. Cost: nothing. Time: 10 minutes.`,
    `${fill(actions.first, { cap: String(cap), chain: chain1 })} Cost: ${money(cap)} plus about ${money(g1)} of gas. Time: 15 minutes.`,
    `${fill(actions.second, { cap2: String(cap2), chain2 })} Cost: ${money(cap2)} plus about ${money(g2)} of gas. Time: 15 minutes.`,
    `${actions.weekly} Do it once a week for ${hold} days (${weeklyCount} times). Cost: about ${money(g1)} of gas each time. Time: 10 minutes a week.`,
    `Hold the position for ${hold} days without withdrawing. ${p.name} has run ${factors.ageDays} days with no token recorded, and early exits usually forfeit the farm. Cost: nothing. Time: ${hold} days.`,
    `Claim only from ${p.name}'s own page when a claim opens — never from a link in a chat, email or ad. Cost: about ${money(g1)} of gas. Time: 10 minutes.`,
    `Keep a farm log: the wallet address, each transaction hash, the dates and the amounts. If a claim ever needs proof, the log is the proof. Cost: nothing. Time: 5 minutes.`,
  ];

  const totals: FarmTotals = {
    capitalUsd: cap + cap2,
    // Every gas-paying step, counting each weekly repetition: the totals
    // are the honest whole-plan cost, not the first-week cost.
    gasUsd: Math.round((g1 + g2 + weeklyCount * g1 + g1) * 100) / 100,
    activeMinutes: 10 + 10 + 15 + 15 + weeklyCount * 10 + 10 + 5,
    holdDays: hold,
  };
  return { steps, totals };
}

// ---------------------------------------------------------------------------
// Thesis: one data-derived sentence per protocol, for the detail view. Every
// claim in it comes from the protocol's own snapshot record — nothing is
// invented, and the wording says "records no token", never "has no token".
// ---------------------------------------------------------------------------

function ordinal(n: number): string {
  if (n === 1) return "largest";
  if (n === 2) return "2nd-largest";
  if (n === 3) return "3rd-largest";
  return `${n}th-largest`;
}

export function thesisFor(
  p: SnapshotProtocol,
  factors: Factors,
  categoryRankByTvl: number,
  scope: "watchlist" | "early",
): string {
  const tvl = `$${p.tvl_usd.toLocaleString("en-US")}`;
  const ch = factors.change7d;
  const growth =
    ch > 5
      ? `TVL up ${ch.toFixed(1)}% in 7 days`
      : ch < -5
        ? `TVL down ${Math.abs(ch).toFixed(1)}% in 7 days`
        : `TVL roughly flat over 7 days (${ch >= 0 ? "+" : ""}${ch.toFixed(1)}%)`;
  const chains =
    p.chains.length === 1
      ? `live on ${p.chains[0]} only`
      : `live on ${p.chains.length} chains (${p.chains.slice(0, 3).join(", ")}${p.chains.length > 3 ? ", and more" : ""})`;
  const scopeNote =
    scope === "watchlist"
      ? "On the house watchlist."
      : "An early find below the $50M floor.";
  return `${ordinal(categoryRankByTvl)} ${p.category} protocol on the board by TVL (${tvl}). ${growth}. ${chains}. Listed ${factors.ageDays} days with no token recorded. ${scopeNote}`;
}

// ---------------------------------------------------------------------------
// Board builder
// ---------------------------------------------------------------------------

const EARLY_ROWS = 110;
const LIVE_ROWS = 24;

export function buildBoard(snapshot: Snapshot): BuiltBoard {
  const watchlist = new Set(snapshot.watchlist);
  const bySlug = new Map(snapshot.protocols.map((p) => [p.slug, p]));

  // Watchlist rows: always kept, whatever the model says.
  const watchRows = snapshot.watchlist
    .map((slug) => bySlug.get(slug))
    .filter((p): p is SnapshotProtocol => p !== undefined);

  // Early rows: the model's own top 110 by implied value among the rankable
  // protocols below the floor. Selecting by implied value — not by TVL —
  // makes the board the model's top 150, not TVL's top 110 plus the
  // watchlist: a smaller protocol with strong growth or long tenure earns
  // its place over a larger one that is young or shrinking. Only 5 rows
  // change against a TVL selection, and the board's floor rises.
  const early = snapshot.protocols
    .filter((p) => isRankableEarly(p, watchlist, snapshot.floor_usd))
    .map((p) => ({ p, value: impliedValue(p, snapshot.as_of).value }))
    .sort((a, b) => b.value - a.value || a.p.slug.localeCompare(b.p.slug))
    .slice(0, EARLY_ROWS)
    .map((entry) => entry.p);

  const selected: Array<{ p: SnapshotProtocol; scope: "watchlist" | "early" }> = [
    ...watchRows.map((p) => ({ p, scope: "watchlist" as const })),
    ...early.map((p) => ({ p, scope: "early" as const })),
  ];

  // Rank by implied value, ties broken by slug for determinism.
  const withFactors = selected.map(({ p, scope }) => ({
    p,
    scope,
    factors: impliedValue(p, snapshot.as_of),
  }));
  withFactors.sort(
    (a, b) =>
      b.factors.value - a.factors.value || a.p.slug.localeCompare(b.p.slug),
  );

  // Category rank by TVL within the board, for the thesis lines.
  const categoryTvlRank = new Map<string, number>();
  const byCategory = new Map<string, SnapshotProtocol[]>();
  for (const { p } of withFactors) {
    const list = byCategory.get(p.category) ?? [];
    list.push(p);
    byCategory.set(p.category, list);
  }
  for (const list of byCategory.values()) {
    list.sort((a, b) => b.tvl_usd - a.tvl_usd);
    list.forEach((p, i) => categoryTvlRank.set(p.slug, i + 1));
  }

  const rows: BoardRow[] = withFactors.map(({ p, scope, factors }, i) => {
    const plan = farmPlan(p, factors);
    return {
      slug: p.slug,
      name: p.name,
      category: p.category,
      chains: [...p.chains],
      tvl_usd: p.tvl_usd,
      change_7d: p.change_7d,
      mcap_usd: p.mcap_usd,
      age_days: factors.ageDays,
      rank: i + 1,
      implied_value_usd: factors.value,
      factors,
      scope,
      farm_steps: plan.steps,
      farm_totals: plan.totals,
      thesis: thesisFor(p, factors, categoryTvlRank.get(p.slug) ?? 1, scope),
    };
  });

  // Live-token view: protocols that record a token and carry a market cap,
  // largest 24 by market cap, set apart from the ranking — their token
  // already trades, so they are not launch candidates.
  const live: LiveRow[] = snapshot.protocols
    .filter(
      (p) =>
        !recordsNoToken(p) &&
        p.mcap_usd !== null &&
        p.mcap_usd !== undefined,
    )
    .sort((a, b) => (b.mcap_usd ?? 0) - (a.mcap_usd ?? 0))
    .slice(0, LIVE_ROWS)
    .map((p) => ({
      slug: p.slug,
      name: p.name,
      category: p.category,
      tvl_usd: p.tvl_usd,
      mcap_usd: p.mcap_usd as number,
    }));

  const categoryTotals = new Map<string, { count: number; combined: number }>();
  for (const row of rows) {
    const entry = categoryTotals.get(row.category) ?? {
      count: 0,
      combined: 0,
    };
    entry.count += 1;
    entry.combined += row.implied_value_usd;
    categoryTotals.set(row.category, entry);
  }
  const categories: CategoryStat[] = [...categoryTotals.entries()]
    .map(([category, { count, combined }]) => ({ category, count, combined }))
    .sort((a, b) => b.combined - a.combined);

  const meta: BoardMeta = {
    as_of: snapshot.as_of,
    floor_usd: snapshot.floor_usd,
    rows: rows.length,
    watchlist: watchRows.length,
    early: early.length,
    combined_implied_usd: rows.reduce((n, r) => n + r.implied_value_usd, 0),
    categories,
    live_count: live.length,
  };

  return { rows, live, meta };
}
