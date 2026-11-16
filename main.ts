// Token Radar v3 — entrypoint.
//
// Reads the sealed snapshot, builds the ranked board, and writes the entry's
// output directory: board.json, data.js, dashboard/, screenshots/ and
// dossier.json. Fully deterministic: no clock, no randomness, no network —
// two runs on the same snapshot produce byte-identical output.
//
// Usage (from the repository root):
//   mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts --input <snapshot.json>

import { readFileSync, writeFileSync, mkdirSync, cpSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { buildBoard, type Snapshot } from "./lib/model.ts";
import { buildDossier } from "./vendor/makefun-board.ts";

const ROOT = dirname(fileURLToPath(import.meta.url));

function argValue(flag: string): string | undefined {
  const i = process.argv.indexOf(flag);
  return i >= 0 && i + 1 < process.argv.length ? process.argv[i + 1] : undefined;
}

// Fail-closed build: every gate invariant is checked before anything is
// written, so a bad board never produces a dossier. A throw here is a build
// failure, not a silent partial entry.
function validateBoard(board: ReturnType<typeof buildBoard>, snapshot: Snapshot): void {
  const rows = board.rows;
  if (rows.length < 100 || rows.length > 4000) {
    throw new Error(`board has ${rows.length} rows, outside 100-4000`);
  }
  const slugs = new Set(snapshot.protocols.map((p) => p.slug));
  const seen = new Set<string>();
  const missingWatchlist = snapshot.watchlist.filter((s) => !rows.some((r) => r.slug === s));
  if (missingWatchlist.length > 0) {
    throw new Error(`watchlist slugs missing from board: ${missingWatchlist.join(", ")}`);
  }
  const outside = rows.filter((r) => !snapshot.watchlist.includes(r.slug)).length;
  if (outside < 60) throw new Error(`only ${outside} rows outside the watchlist, need 60`);
  for (let i = 0; i < rows.length; i++) {
    const r = rows[i];
    if (!slugs.has(r.slug)) throw new Error(`row ${i} slug ${r.slug} not in snapshot`);
    if (seen.has(r.slug)) throw new Error(`duplicate slug ${r.slug}`);
    seen.add(r.slug);
    if (r.rank !== i + 1) throw new Error(`row ${r.slug} has rank ${r.rank}, expected ${i + 1}`);
    if (i > 0 && r.implied_value_usd > rows[i - 1].implied_value_usd) {
      throw new Error(`implied value rises at rank ${r.rank}`);
    }
    if (!Number.isInteger(r.implied_value_usd) || r.implied_value_usd <= 0) {
      throw new Error(`row ${r.slug} has bad implied value ${r.implied_value_usd}`);
    }
    if (r.farm_steps.length < 3 || r.farm_steps.length > 12) {
      throw new Error(`row ${r.slug} has ${r.farm_steps.length} farm steps`);
    }
    for (const step of r.farm_steps) {
      const len = step.trim().length;
      if (len < 20 || len > 600) {
        throw new Error(`row ${r.slug} has a farm step of ${len} chars`);
      }
    }
    // The model's arithmetic must reproduce the row's own value exactly.
    const change = r.change_7d ?? 0;
    const growth = 1 + (Math.max(-50, Math.min(150, change)) / 100) * 0.6;
    const maturity = 0.55 + (Math.min(r.age_days, 1095) / 1095) * 0.45;
    const breadth = 1 + 0.02 * Math.min(r.chains.length, 5);
    const recomputed = Math.round(r.tvl_usd * 0.25 * growth * maturity * breadth);
    if (recomputed !== r.implied_value_usd) {
      throw new Error(`row ${r.slug} recomputes to ${recomputed}, board says ${r.implied_value_usd}`);
    }
  }
}

function main(): void {
  const inputPath = argValue("--input") ?? join(ROOT, "input", "snapshot.json");
  const outDir = process.env.MAKEFUN_OUTPUT_DIR ?? "out";

  const snapshot = JSON.parse(readFileSync(inputPath, "utf-8")) as Snapshot;
  const board = buildBoard(snapshot);
  validateBoard(board, snapshot);

  mkdirSync(outDir, { recursive: true });

  // The ranked board: every row carries the gate's fields (slug, name, rank,
  // implied_value_usd, farm_steps) plus the model's working (factors, thesis,
  // farm totals) so the file is self-describing.
  writeFileSync(
    join(outDir, "board.json"),
    `${JSON.stringify({ rows: board.rows }, null, 2)}\n`,
    "utf-8",
  );

  // The dashboard's data, as a plain script the page loads beside itself.
  // No URLs anywhere in it: the scorer refuses network addresses in scripts.
  const data = `window.RADAR = ${JSON.stringify(board)};\n`;
  writeFileSync(join(outDir, "data.js"), data, "utf-8");

  // The dashboard and its screenshots, copied whole.
  const dashboardSrc = join(ROOT, "dashboard");
  const shotsSrc = join(ROOT, "screenshots");
  cpSync(dashboardSrc, join(outDir, "dashboard"), { recursive: true });
  if (existsSync(shotsSrc)) {
    cpSync(shotsSrc, join(outDir, "screenshots"), { recursive: true });
  }

  // The dossier the judge reads: screenshots first, then the dashboard's
  // source text, capped at 65,536 bytes.
  const dossier = buildDossier(outDir, {
    text_max_bytes: 65536,
    screenshots: { max: 4, max_bytes: 512 * 1024 },
    dashboard: { max_files: 10, max_bytes: 64 * 1024 },
  });
  writeFileSync(join(outDir, "dossier.json"), dossier);

  const total = board.rows.reduce((n, r) => n + r.implied_value_usd, 0);
  // buildDossier returns a Uint8Array: decode it before parsing, never let
  // JSON.parse coerce it (that stringifies the bytes as "123,34,...").
  const dossierText = new TextDecoder().decode(dossier);
  const dossierObj = JSON.parse(dossierText) as { text?: string; images?: unknown[] };
  const textBytes = Buffer.byteLength(dossierObj.text ?? "", "utf-8");
  const cut = (dossierObj.text ?? "").includes("[Cut at");
  console.log(
    `token-radar v3: ${board.rows.length} rows ` +
      `(${board.meta.watchlist} watchlist + ${board.meta.early} early), ` +
      `combined implied $${total.toLocaleString("en-US")}, ` +
      `dossier ${dossier.length} bytes, text ${textBytes} bytes (cut=${cut}), ` +
      `${dossierObj.images?.length ?? 0} screenshots -> ${outDir}`,
  );
}

main();
