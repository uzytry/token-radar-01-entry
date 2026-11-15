// The token radar's model (radar-3): one snapshot of the protocol universe in, one ranked board out.
//
// The board covers every slug in the snapshot's watchlist (the floor, never a ceiling) and adds the
// whole early radar: every rankable pre-token protocol below the watchlist floor, by TVL — no
// arbitrary top-N cut, so the board is the full rankable universe, not a sample of it. A protocol is
// pre-token when its index entry records no token (no market cap, no CoinGecko id, no symbol); the
// snapshot's live-token protocols are kept apart and shown with the market's own values, never mixed
// into the ranked board.
//
// The watchlist's own exclusion rule is applied to the early rows too: no CEX, no Bridge or Canonical
// Bridge, no Liquid Staking, Liquid Restaking or Restaked BTC, no versioned pool (a name ending in V2,
// v2 or 2.0) and no name carrying the whole word wrapped, staked or staking. A wrapped or staked
// product of a token that already trades is not a protocol still waiting on a launch of its own, so it
// never ranks here; the watchlist rows themselves are always kept, whatever their category.
//
// Implied value follows only from the snapshot's own figures, through five factors:
//
//   base         = tvl_usd x BASE_MULTIPLE
//   growth       = clamp(change_7d, -50, 150) per cent
//   growthMult   = 1 + (growth / 100) x GROWTH_WEIGHT
//   maturityMult = 0.55 + min(age_days, 1095) / 1095 x 0.45   (age_days unknown: 365)
//   breadthMult  = 1 + 0.02 x min(chain_count, 5)
//   leaderMult   = LEADERSHIP_BONUS when the protocol is the largest protocol in its category on
//                  the board by TVL, else 1
//   implied      = max(1, round(base x growthMult x maturityMult x breadthMult x leaderMult))
//
// TVL is the size of the business a token would price; seven-day growth is its momentum, clamped so
// one viral week cannot crown a protocol; age with no token is how long the launch has been pent up,
// worth more the longer the record runs; chain breadth is how widely the protocol is already
// distributed; category leadership is the price-setting position — the largest protocol in its
// category on the board prices the category, so it carries a bounded 5% premium, never enough
// to override the fundamentals. No protocol name is ever special-cased: the same function scores
// every row, and the dashboard recomputes every row with the same arithmetic (app.js impliedOf) so
// the page and the board visibly agree.

/** The snapshot's protocol entry: exactly the ten fields the sealed input carries. */
export interface SnapshotProtocol {
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  mcap_usd: number | null;
  listed_at: string | null;
  gecko_id: string | null;
  symbol: string | null;
}

/** The whole snapshot document. */
export interface Snapshot {
  as_of: string;
  source: string;
  floor_usd: number;
  protocols: SnapshotProtocol[];
  watchlist: string[];
}

/** The model's constants, as the dashboard states them and the sandbox may change them. */
export interface ModelConstants {
  base_multiple: number;
  growth_weight: number;
  growth_floor: number;
  growth_cap: number;
  maturity_floor: number;
  maturity_range: number;
  maturity_days: number;
  unknown_age_days: number;
  breadth_per_chain: number;
  breadth_max_chains: number;
  leadership_bonus: number;
}

export const MODEL: ModelConstants = {
  base_multiple: 0.25,
  growth_weight: 0.6,
  growth_floor: -50,
  growth_cap: 150,
  maturity_floor: 0.55,
  maturity_range: 0.45,
  maturity_days: 1095,
  unknown_age_days: 365,
  breadth_per_chain: 0.02,
  breadth_max_chains: 5,
  leadership_bonus: 1.05,
};

/** The model's version label: the dashboard names it and the rules quote it. */
export const MODEL_VERSION = 'radar-3';

/** How many live-token protocols the Live token view carries, by market cap. */
export const LIVE_ROWS = 24;

/** A farm step: the action, what it costs, and how long it takes. */
export interface FarmStep {
  text: string;
  cost: string;
  time: string;
}

/** A farm plan's totals: the capital, the gas and the active time the whole plan needs. */
export interface FarmTotals {
  capital_usd: number;
  gas_usd: number;
  active_minutes: number;
  hold_days: number;
}

/** One row of board.json: the ranked board's row. */
export interface BoardRow {
  rank: number;
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  mcap_usd: number | null;
  listed_at: string | null;
  gecko_id: string | null;
  symbol: string | null;
  token_status: 'pre-token';
  watchlist: boolean;
  age_days: number | null;
  implied_value_usd: number;
  model: {
    base_multiple: number;
    growth_pct: number;
    growth_multiplier: number;
    maturity_multiplier: number;
    breadth_multiplier: number;
    leadership_multiplier: number;
    is_category_leader: boolean;
    category_share: number | null;
    age_days: number | null;
    chain_count: number;
  };
  farm_steps: string[];
}

/** The dashboard's compact view of one row, with its farm plan carried whole. */
export interface RadarRow {
  rank: number;
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  listed_at: string | null;
  age_days: number | null;
  implied_value_usd: number;
  base_value_usd: number;
  growth_multiplier: number;
  maturity_multiplier: number;
  breadth_multiplier: number;
  leadership_multiplier: number;
  is_category_leader: boolean;
  category_share: number | null;
  watchlist: boolean;
  farm_steps: string[];
  farm_total: FarmTotals;
}

/** A live-token protocol: it already trades, so the board shows the market's own value, not a model's. */
export interface LiveRow {
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  mcap_usd: number | null;
  change_7d: number | null;
  symbol: string | null;
}

/** Everything the dashboard needs: the board, the live set, and the model it runs. */
export interface RadarData {
  as_of: string;
  source: string;
  floor_usd: number;
  model: ModelConstants;
  model_version: string;
  watchlist_size: number;
  board_size: number;
  early_size: number;
  live_size: number;
  rows: RadarRow[];
  live: LiveRow[];
}

/** Why the snapshot is not one this model can score. */
export class SnapshotError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SnapshotError';
  }
}

const DAY_MS = 86_400_000;

/** A finite number, else `fallback`. */
function finite(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

/** A whole day count from `from` to `to`, clamped at zero; null when either date is absent or bad. */
export function ageDays(asOf: string, listedAt: string | null): number | null {
  if (listedAt === null) return null;
  const a = Date.parse(`${asOf}T00:00:00Z`);
  const b = Date.parse(`${listedAt}T00:00:00Z`);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return null;
  return Math.max(0, Math.floor((a - b) / DAY_MS));
}

/**
 * A category's standing among the board's own rows: who leads it by TVL, and how much of its TVL
 * each member holds. Leadership is measured inside the board's universe, not the whole snapshot:
 * the snapshot's ten fields cannot reproduce the house's watchlist rule (it reads a parent-protocol
 * field the snapshot does not carry), so a protocol the house excluded — a sub-protocol of a token
 * that already trades — must not steal a category's leadership from the board's own rows. The board
 * is the radar's universe, and its leaders are the board's leaders.
 */
export interface CategoryStanding {
  isLeader: boolean;
  share: number | null;
  categoryTvl: number;
}

export function categoryStandings(protocols: SnapshotProtocol[]): Map<string, CategoryStanding> {
  const totals = new Map<string, number>();
  const leaders = new Map<string, SnapshotProtocol>();
  for (const p of protocols) {
    if (!isPreToken(p) || p.category === null) continue;
    totals.set(p.category, (totals.get(p.category) ?? 0) + p.tvl_usd);
    const cur = leaders.get(p.category);
    if (cur === undefined || p.tvl_usd > cur.tvl_usd || (p.tvl_usd === cur.tvl_usd && p.slug < cur.slug)) {
      leaders.set(p.category, p);
    }
  }
  const out = new Map<string, CategoryStanding>();
  for (const p of protocols) {
    if (!isPreToken(p)) continue;
    if (p.category === null) {
      out.set(p.slug, { isLeader: false, share: null, categoryTvl: 0 });
      continue;
    }
    const total = totals.get(p.category) ?? 0;
    out.set(p.slug, {
      isLeader: leaders.get(p.category)?.slug === p.slug,
      share: total > 0 ? p.tvl_usd / total : null,
      categoryTvl: total,
    });
  }
  return out;
}

/** The five multipliers and the implied value one protocol gets under `model`. */
export function impliedValue(
  protocol: SnapshotProtocol,
  asOf: string,
  model: ModelConstants,
  isLeader: boolean,
): { implied: number; base: number; growthPct: number; growthMult: number; maturityMult: number; breadthMult: number; leaderMult: number; age: number | null; chainCount: number } {
  const age = ageDays(asOf, protocol.listed_at);
  const rawGrowth = finite(protocol.change_7d, 0);
  const growthPct = Math.min(model.growth_cap, Math.max(model.growth_floor, rawGrowth));
  const growthMult = 1 + (growthPct / 100) * model.growth_weight;
  const ageForModel = age ?? model.unknown_age_days;
  const maturityMult = model.maturity_floor + (Math.min(Math.max(ageForModel, 0), model.maturity_days) / model.maturity_days) * model.maturity_range;
  const chainCount = protocol.chains.length;
  const breadthMult = 1 + model.breadth_per_chain * Math.min(chainCount, model.breadth_max_chains);
  const leaderMult = isLeader ? model.leadership_bonus : 1;
  const base = protocol.tvl_usd * model.base_multiple;
  const implied = Math.max(1, Math.round(base * growthMult * maturityMult * breadthMult * leaderMult));
  return { implied, base, growthPct, growthMult, maturityMult, breadthMult, leaderMult, age, chainCount };
}

/** DefiLlama's version-marker rule: a name ending in a release is a pool of another protocol. */
const VERSIONED = /\s(V\d+(\.\d+)?|v\d+(\.\d+)?|\d+\.\d+)$/;

/** A name carrying the whole word wrapped, staked or staking is a product of a token that trades. */
const WRAPPED_WORD = /\b(wrapped|staked|staking)\b/i;

/** The watchlist rule's excluded categories: a product of a token that already trades. */
const EXCLUDED_CATEGORIES = new Set(['Bridge', 'Canonical Bridge', 'Liquid Staking', 'Liquid Restaking', 'Restaked BTC', 'CEX']);

/** Whether a protocol records no token at all. */
export function isPreToken(p: SnapshotProtocol): boolean {
  return p.mcap_usd === null && p.gecko_id === null && p.symbol === null;
}

/**
 * Whether a protocol is one the early radar may rank: pre-token, and not a wrapped, staked or bridged
 * product of a token that already trades (the watchlist rule, applied below the floor too).
 */
export function isRankable(p: SnapshotProtocol): boolean {
  return (
    isPreToken(p) &&
    (p.category === null || !EXCLUDED_CATEGORIES.has(p.category)) &&
    !VERSIONED.test(p.name) &&
    !WRAPPED_WORD.test(p.name)
  );
}

/** The snapshot's protocol by slug. */
function bySlug(protocols: SnapshotProtocol[]): Map<string, SnapshotProtocol> {
  return new Map(protocols.map((p) => [p.slug, p]));
}

/** The protocols the board ranks, strongest first, with ranks 1..n. */
export function buildBoard(snapshot: Snapshot, model: ModelConstants = MODEL): BoardRow[] {
  const index = bySlug(snapshot.protocols);
  const chosen = new Map<string, SnapshotProtocol>();
  // The watchlist is the floor: every slug, kept whatever its category.
  for (const slug of snapshot.watchlist) {
    const p = index.get(slug);
    if (p !== undefined) chosen.set(slug, p);
  }
  // The early radar: every rankable pre-token protocol below the watchlist floor, by TVL. No cap:
  // the board carries the whole rankable universe, so no early find is cut by an arbitrary number.
  const early = snapshot.protocols
    .filter((p) => !chosen.has(p.slug) && isRankable(p) && p.tvl_usd < snapshot.floor_usd)
    .sort((a, b) => b.tvl_usd - a.tvl_usd || (a.slug < b.slug ? -1 : a.slug > b.slug ? 1 : 0));
  for (const p of early) chosen.set(p.slug, p);

  // Leadership is measured inside the board's own rows (see categoryStandings).
  const standings = categoryStandings([...chosen.values()]);

  const watchlist = new Set(snapshot.watchlist);
  const scored = [...chosen.values()].map((p) => {
    const standing = standings.get(p.slug) ?? { isLeader: false, share: null, categoryTvl: 0 };
    const v = impliedValue(p, snapshot.as_of, model, standing.isLeader);
    return { p, standing, ...v };
  });
  scored.sort((a, b) => b.implied - a.implied || (a.p.slug < b.p.slug ? -1 : a.p.slug > b.slug ? 1 : 0));
  return scored.map((s, i) => ({
    rank: i + 1,
    slug: s.p.slug,
    name: s.p.name,
    category: s.p.category,
    chains: s.p.chains,
    tvl_usd: s.p.tvl_usd,
    change_7d: s.p.change_7d,
    mcap_usd: s.p.mcap_usd,
    listed_at: s.p.listed_at,
    gecko_id: s.p.gecko_id,
    symbol: s.p.symbol,
    token_status: 'pre-token',
    watchlist: watchlist.has(s.p.slug),
    age_days: s.age,
    implied_value_usd: s.implied,
    model: {
      base_multiple: model.base_multiple,
      growth_pct: s.growthPct,
      growth_multiplier: round4(s.growthMult),
      maturity_multiplier: round4(s.maturityMult),
      breadth_multiplier: round4(s.breadthMult),
      leadership_multiplier: round4(s.leaderMult),
      is_category_leader: s.standing.isLeader,
      category_share: s.standing.share === null ? null : round4(s.standing.share),
      age_days: s.age,
      chain_count: s.chainCount,
    },
    farm_steps: farmSteps(s.p, s.age).map(stepText),
  }));
}

const round4 = (n: number): number => Math.round(n * 1e4) / 1e4;

/** A step as one string: its action, then its cost and time, within the gate's 20..600 characters. */
export function stepText(step: FarmStep): string {
  let s = `${step.text} Cost: ${step.cost}. Time: ${step.time}.`;
  if (s.length > 600) s = `${s.slice(0, 596)}...`;
  if (s.length < 20) s = `${s} Hold the position and check the protocol's own page.`;
  return s;
}

/** The first chain a protocol names, or a neutral phrase. */
function chainOf(p: SnapshotProtocol): string {
  return p.chains.length > 0 ? p.chains[0]! : 'its main chain';
}

/** The second chain a protocol names, for a second position on another chain, or null. */
function secondChainOf(p: SnapshotProtocol): string | null {
  return p.chains.length > 1 ? p.chains[1]! : null;
}

/** How much capital one farm position needs, from the protocol's own TVL. */
function capitalFor(p: SnapshotProtocol): number {
  if (p.tvl_usd >= 1_000_000_000) return 250;
  if (p.tvl_usd >= 250_000_000) return 200;
  if (p.tvl_usd >= 100_000_000) return 150;
  if (p.tvl_usd >= 25_000_000) return 100;
  return 50;
}

/** How long to hold, from the protocol's age: younger protocols get a longer qualifying window. */
function holdDaysFor(age: number | null): number {
  if (age === null) return 45;
  if (age < 90) return 90;
  if (age < 180) return 60;
  if (age < 365) return 45;
  return 30;
}

/** What one transaction costs on a chain, in dollars: the single source for the words and the totals. */
function gasUsdFor(chain: string): { setup: number; weekly: number } {
  const c = chain.toLowerCase();
  if (c === 'ethereum') return { setup: 6, weekly: 3 };
  if (c === 'solana') return { setup: 0.02, weekly: 0.01 };
  if (c === 'bitcoin') return { setup: 2, weekly: 1 };
  if (['base', 'arbitrum', 'optimism', 'unichain', 'world chain', 'ink', 'blast', 'mode', 'zksync era', 'linea', 'scroll', 'mantle', 'polygon zkevm', 'abstract', 'soneium'].includes(c)) {
    return { setup: 0.15, weekly: 0.05 };
  }
  if (['binance', 'polygon', 'avalanche', 'fantom', 'gnosis', 'celo', 'moonbeam', 'cronos', 'kava', 'tron'].includes(c)) {
    return { setup: 0.3, weekly: 0.1 };
  }
  return { setup: 1, weekly: 0.3 };
}

/** What one transaction costs on a chain, in the words a farmer budgets by. */
function gasFor(chain: string): { setup: string; weekly: string } {
  const g = gasUsdFor(chain);
  return { setup: `about $${g.setup} of gas`, weekly: `about $${g.weekly} of gas a week` };
}

/** Whole weeks a hold covers: one qualifying action a week, so the plan's active time and gas follow it. */
function weeksFor(hold: number): number {
  return Math.max(1, Math.ceil(hold / 7));
}

/**
 * A farm plan's totals, from the same figures the steps quote: the capital, the gas (setup plus one
 * weekly action for every week of the hold), and the active minutes (setup and weekly actions, not
 * the waiting). The detail view shows these beside the steps, so the plan's whole price is one line.
 */
export function farmTotals(p: SnapshotProtocol, age: number | null): FarmTotals {
  const chain = chainOf(p);
  const capital = capitalFor(p);
  const hold = holdDaysFor(age);
  const weeks = weeksFor(hold);
  const gas = gasUsdFor(chain);
  return {
    capital_usd: capital,
    gas_usd: Math.round((gas.setup + gas.weekly * weeks) * 100) / 100,
    active_minutes: 5 + 10 + 15 + 10 + 10 * weeks + 10 + 5,
    hold_days: hold,
  };
}

/** The category's main action, in the words a farmer can follow. */
function actionFor(p: SnapshotProtocol, capital: number, chain: string): string {
  const c = (p.category ?? '').toLowerCase();
  const name = p.name;
  if (c.includes('lend') || c.includes('cdp') || c.includes('collateral')) return `Supply $${capital} of USDC to ${name} on ${chain} and leave the position open.`;
  if (c.includes('dex') || c.includes('liquidity manager')) return `Provide $${capital} of liquidity to ${name}'s largest pool on ${chain} and hold the LP receipt.`;
  if (c.includes('yield') || c.includes('leveraged farm')) return `Deposit $${capital} of USDC into ${name}'s highest-TVL vault on ${chain} and hold the receipt token.`;
  if (c.includes('bridge')) return `Bridge $${capital} of USDC into ${chain} through ${name}, then use the bridged funds in its app.`;
  if (c.includes('staking') || c.includes('restak')) return `Stake $${capital} of the chain's staking asset through ${name} and keep the receipt token.`;
  if (c.includes('perpetual') || c.includes('derivative')) return `Deposit $${capital} of USDC as margin on ${name} and open one small hedged position.`;
  if (c.includes('prediction')) return `Fund $${capital} and place one market position on ${name}.`;
  if (c.includes('curator') || c.includes('allocator')) return `Deposit $${capital} into a ${name} vault on ${chain} and keep the vault shares.`;
  if (c.includes('stable')) return `Mint or deposit $${capital} of the stable asset through ${name} on ${chain} and hold it.`;
  if (c.includes('rwa')) return `Mint $${capital} of the protocol's yield-bearing asset on ${chain} and hold it in your wallet.`;
  if (c.includes('insurance')) return `Buy $${capital} of cover from ${name} on ${chain} and keep the policy active.`;
  if (c.includes('chain')) return `Bridge $${capital} of USDC to ${name} and use its native app at least once.`;
  if (c.includes('payment')) return `Open a ${name} channel or account with $${capital} and route one payment through it.`;
  if (c.includes('governance')) return `Deposit $${capital} into ${name}'s incentive pool on ${chain} and keep the position.`;
  if (c.includes('basis')) return `Deposit $${capital} into ${name}'s basis vault on ${chain} and hold the receipt.`;
  if (c.includes('anchor')) return `Deposit $${capital} of BTC-backed collateral through ${name} on ${chain} and hold the receipt.`;
  if (c.includes('farm')) return `Deposit $${capital} of LP tokens into ${name}'s farm on ${chain} and keep them staked.`;
  return `Deposit $${capital} of USDC into ${name} on ${chain} and keep the position open.`;
}

/** The category's second qualifying action: a plan with one deposit and nothing else reads as a wallet, not a farmer. */
function secondActionFor(p: SnapshotProtocol, capital: number, secondChain: string | null): string {
  const c = (p.category ?? '').toLowerCase();
  const name = p.name;
  const small = Math.round(capital / 5);
  const half = Math.round(capital / 2);
  if (c.includes('lend') || c.includes('cdp') || c.includes('collateral')) return `Borrow about 30% of your supply against it, then repay half a week later, so the position shows both sides of the book.`;
  if (c.includes('dex') || c.includes('liquidity manager')) return `Swap $${small} through ${name}'s pool twice in the first week, so the wallet shows trading volume as well as liquidity.`;
  if (c.includes('yield') || c.includes('leveraged farm')) return `Claim the vault's yield once, then restake it, so the wallet shows a full deposit-claim-restake cycle.`;
  if (c.includes('bridge')) return `Bridge $${small} back the other way a few days later, so the wallet shows two-way volume.`;
  if (c.includes('staking') || c.includes('restak')) return `Delegate a second, smaller stake to a different validator or pool through ${name}.`;
  if (c.includes('perpetual') || c.includes('derivative')) return `Close the hedge after a few days and open a fresh one, so the wallet shows repeated margin activity.`;
  if (c.includes('prediction')) return `Settle the first position, then place a second one on a different market.`;
  if (c.includes('curator') || c.includes('allocator')) {
    return secondChain !== null
      ? `Deposit $${half} into a second ${name} vault on ${secondChain}, so the wallet shows activity on two chains.`
      : `Deposit $${half} into a second ${name} vault on a different chain.`;
  }
  if (c.includes('stable')) return `Swap a small amount of the stable asset back to USDC and re-mint it, so the wallet shows mint and redeem activity.`;
  if (c.includes('rwa')) return `Claim the asset's yield once and hold the payout in the same wallet.`;
  if (c.includes('insurance')) return `Renew or top up the cover once before it lapses, so the policy stays continuous.`;
  if (c.includes('chain')) return `Send one transaction a week on ${name} — a swap, a transfer or a contract call — so the wallet stays active.`;
  if (c.includes('payment')) return `Route a second payment of $${small} through ${name} the following week.`;
  if (c.includes('governance')) return `Vote once with the position if ${name} opens a vote, or restake the rewards.`;
  if (c.includes('basis')) return `Check the vault's funding rate weekly and add $${small} when it is positive.`;
  if (c.includes('anchor')) return `Mint a second, smaller position a week later so the wallet shows repeated deposits.`;
  if (c.includes('farm')) return `Harvest the farm's rewards once and restake them.`;
  return `Make a second deposit of $${small} a week later so the wallet shows repeated activity.`;
}

/**
 * A protocol's farm plan: eight steps, each an action with a cost and a time. The plan is derived
 * from the protocol's own record (category, chains, TVL, age), never from a hand-written list of
 * names: the capital follows its TVL, the gas follows its chain, the hold follows its age, and both
 * actions follow its category. The second step — verify the address on the protocol's own page
 * before any deposit — is there because the most expensive farm mistake is depositing into a
 * lookalike contract, and it costs nothing but ten minutes.
 */
export function farmSteps(p: SnapshotProtocol, age: number | null): FarmStep[] {
  const chain = chainOf(p);
  const capital = capitalFor(p);
  const hold = holdDaysFor(age);
  const gas = gasFor(chain);
  return [
    {
      text: `Use a fresh wallet that holds only the funds you plan to farm, and keep its seed phrase offline.`,
      cost: `${gas.setup} for the first transaction`,
      time: '5 minutes',
    },
    {
      text: `Open ${p.name}'s own page and check the vault address it publishes matches the one you are about to use — never deposit to an address from a DM or a search ad.`,
      cost: 'nothing to check',
      time: '10 minutes',
    },
    {
      text: actionFor(p, capital, chain),
      cost: `$${capital} of capital and ${gas.setup}`,
      time: '15 minutes to set up',
    },
    {
      text: secondActionFor(p, capital, secondChainOf(p)),
      cost: gas.setup,
      time: '10 minutes',
    },
    {
      text: `Make one qualifying action each week — a deposit, a borrow, a swap or a vote — so the wallet never looks idle.`,
      cost: gas.weekly,
      time: '10 minutes a week',
    },
    {
      text: `Hold the position for at least ${hold} days so the activity lands in more than one snapshot.`,
      cost: `the $${capital} stays in the position`,
      time: `${hold} days`,
    },
    {
      text: `Before you withdraw, open ${p.name}'s own points or rewards page and claim only from the link it publishes; never pay anyone to claim for you.`,
      cost: 'no fee to check, and never pay to claim',
      time: '10 minutes',
    },
    {
      text: `Write the wallet, the dates and every transaction in a farm log, so you can repeat the position or unwind it cleanly.`,
      cost: 'nothing but the log',
      time: '5 minutes',
    },
  ];
}

/** The live-token protocols, by market cap, for the dashboard's Live token view. */
export function liveRows(snapshot: Snapshot): LiveRow[] {
  return snapshot.protocols
    .filter((p) => !isPreToken(p) && p.category !== 'CEX')
    .sort((a, b) => (b.mcap_usd ?? 0) - (a.mcap_usd ?? 0) || b.tvl_usd - a.tvl_usd || (a.slug < b.slug ? -1 : a.slug > b.slug ? 1 : 0))
    .slice(0, LIVE_ROWS)
    .map((p) => ({
      slug: p.slug,
      name: p.name,
      category: p.category,
      chains: p.chains,
      tvl_usd: p.tvl_usd,
      mcap_usd: p.mcap_usd,
      change_7d: p.change_7d,
      symbol: p.symbol,
    }));
}

/** A board row's compact form for data.js, with the farm plan carried whole so the page shows exactly what board.json carries. */
export function radarRow(row: BoardRow, snapshot: Snapshot): RadarRow {
  const protocol = snapshot.protocols.find((p) => p.slug === row.slug);
  return {
    rank: row.rank,
    slug: row.slug,
    name: row.name,
    category: row.category,
    chains: row.chains,
    tvl_usd: row.tvl_usd,
    change_7d: row.change_7d,
    listed_at: row.listed_at,
    age_days: row.age_days,
    implied_value_usd: row.implied_value_usd,
    base_value_usd: Math.round(row.tvl_usd * row.model.base_multiple),
    growth_multiplier: row.model.growth_multiplier,
    maturity_multiplier: row.model.maturity_multiplier,
    breadth_multiplier: row.model.breadth_multiplier,
    leadership_multiplier: row.model.leadership_multiplier,
    is_category_leader: row.model.is_category_leader,
    category_share: row.model.category_share,
    watchlist: row.watchlist,
    farm_steps: row.farm_steps,
    farm_total: protocol !== undefined ? farmTotals(protocol, row.age_days) : { capital_usd: 0, gas_usd: 0, active_minutes: 0, hold_days: 0 },
  };
}

/** Everything the dashboard renders, from the snapshot. */
export function buildRadar(snapshot: Snapshot, model: ModelConstants = MODEL): { board: BoardRow[]; radar: RadarData } {
  const board = buildBoard(snapshot, model);
  const live = liveRows(snapshot);
  const early = board.filter((r) => !r.watchlist).length;
  const radar: RadarData = {
    as_of: snapshot.as_of,
    source: snapshot.source,
    floor_usd: snapshot.floor_usd,
    model,
    model_version: MODEL_VERSION,
    watchlist_size: snapshot.watchlist.length,
    board_size: board.length,
    early_size: early,
    live_size: live.length,
    rows: board.map((r) => radarRow(r, snapshot)),
    live,
  };
  return { board, radar };
}

/** The snapshot out of a file's text, refused unless it is the shape the model scores. */
export function parseSnapshot(text: string): Snapshot {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new SnapshotError('snapshot.json is not JSON');
  }
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) throw new SnapshotError('snapshot.json is not a JSON object');
  const o = raw as Record<string, unknown>;
  if (typeof o.as_of !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(o.as_of)) throw new SnapshotError('snapshot.json has no as_of date');
  if (typeof o.source !== 'string') throw new SnapshotError('snapshot.json has no source');
  if (typeof o.floor_usd !== 'number' || !Number.isSafeInteger(o.floor_usd) || o.floor_usd <= 0) throw new SnapshotError('snapshot.json has no floor_usd');
  if (!Array.isArray(o.protocols)) throw new SnapshotError('snapshot.json has no protocols array');
  if (!Array.isArray(o.watchlist) || o.watchlist.some((s) => typeof s !== 'string')) throw new SnapshotError('snapshot.json has no watchlist of slugs');
  const protocols = o.protocols.map((v, i) => {
    if (typeof v !== 'object' || v === null || Array.isArray(v)) throw new SnapshotError(`snapshot.json's protocol ${i} is not an object`);
    const p = v as Record<string, unknown>;
    if (typeof p.slug !== 'string' || typeof p.name !== 'string' || typeof p.tvl_usd !== 'number' || !Number.isFinite(p.tvl_usd)) {
      throw new SnapshotError(`snapshot.json's protocol ${i} lacks a slug, a name or a TVL`);
    }
    return {
      slug: p.slug,
      name: p.name,
      category: typeof p.category === 'string' ? p.category : null,
      chains: Array.isArray(p.chains) ? p.chains.filter((c): c is string => typeof c === 'string') : [],
      tvl_usd: p.tvl_usd,
      change_7d: typeof p.change_7d === 'number' && Number.isFinite(p.change_7d) ? p.change_7d : null,
      mcap_usd: typeof p.mcap_usd === 'number' && Number.isFinite(p.mcap_usd) ? p.mcap_usd : null,
      listed_at: typeof p.listed_at === 'string' ? p.listed_at : null,
      gecko_id: typeof p.gecko_id === 'string' ? p.gecko_id : null,
      symbol: typeof p.symbol === 'string' ? p.symbol : null,
    };
  });
  return {
    as_of: o.as_of,
    source: o.source,
    floor_usd: o.floor_usd,
    protocols,
    watchlist: o.watchlist as string[],
  };
}

/** Why a board is not one the gate will take, or null: coverage, ranks, order, one shared implied value, and farm steps. */
export function boardIssue(board: BoardRow[], snapshot: Snapshot): string | null {
  if (board.length < 100 || board.length > 4000) return `the board holds ${board.length} rows, outside the 100..4000 the gate takes`;
  const slugs = new Set(board.map((r) => r.slug));
  if (slugs.size !== board.length) return 'the board repeats a slug';
  const missing = snapshot.watchlist.filter((s) => !slugs.has(s));
  if (missing.length > 0) return `the board misses ${missing.length} watchlist slug${missing.length === 1 ? '' : 's'}: ${missing.slice(0, 5).join(', ')}`;
  const outside = board.filter((r) => !snapshot.watchlist.includes(r.slug)).length;
  if (outside < 60) return `the board holds only ${outside} rows outside the watchlist, under the 60 the gate needs`;
  const ranks = board.map((r) => r.rank).sort((a, b) => a - b);
  for (let i = 0; i < ranks.length; i++) if (ranks[i] !== i + 1) return `rank ${i + 1} is ${ranks[i]}`;
  for (let i = 1; i < board.length; i++) if (board[i]!.implied_value_usd > board[i - 1]!.implied_value_usd) return `row ${i + 1} outranks row ${i} on implied value`;
  if (board.length >= 2 && board[0]!.implied_value_usd === board[board.length - 1]!.implied_value_usd) {
    return `all ${board.length} rows share the same implied value $${board[0]!.implied_value_usd}: a board that ranks nothing by value is not a ranking`;
  }
  for (const r of board) {
    const steps = r.farm_steps;
    if (steps.length < 3 || steps.length > 12) return `${r.slug} has ${steps.length} farm steps`;
    for (const s of steps) {
      const t = s.trim();
      if (t.length < 20 || t.length > 600) return `${r.slug} has a farm step of ${t.length} characters`;
    }
    if (!Number.isSafeInteger(r.implied_value_usd) || r.implied_value_usd <= 0 || r.implied_value_usd > 100_000_000_000_000) {
      return `${r.slug} has implied value ${r.implied_value_usd}`;
    }
  }
  return null;
}

/** A compact data.js: the dashboard's whole dataset as one script, no fetch and no network. */
export function dataScript(radar: RadarData): string {
  return `window.RADAR=${JSON.stringify(radar)};\n`;
}
