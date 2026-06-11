#!/usr/bin/env node
/**
 * Measures every character sprite and writes src/data/sprite-metrics.json.
 *
 * For each PNG: the content bounding box (ignoring transparent padding) and
 * an estimated head width (median of the longest contiguous opaque run in
 * the rows just below the top of the content — i.e. the hair/face region).
 * CharacterSprite uses these to render all characters with the same head
 * size and head height, regardless of how each file is framed (full body,
 * knee-up, padded, ...).
 *
 * Usage: node tools/measure-sprites.mjs [http://localhost:5180]
 * (needs the dev server running so Chromium can fetch the images)
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "/opt/node22/lib/node_modules/playwright/index.mjs";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const BASE = process.argv[2] ?? "http://localhost:5180";

const spriteDir = path.join(ROOT, "public/assets/cyan/sprites");
const files = [];
(function walk(dir) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p);
    else if (e.name.endsWith(".png")) files.push("/" + path.relative(path.join(ROOT, "public"), p));
  }
})(spriteDir);

const browser = await chromium.launch({
  executablePath: "/opt/pw-browsers/chromium_headless_shell-1194/chrome-linux/headless_shell",
});
const page = await browser.newPage();
await page.goto(BASE);

const metrics = {};
for (const file of files) {
  const m = await page.evaluate(async (url) => {
    const resp = await fetch(url);
    const bmp = await createImageBitmap(await resp.blob());
    const w = bmp.width;
    const h = bmp.height;
    const canvas = new OffscreenCanvas(w, h);
    const ctx = canvas.getContext("2d");
    ctx.drawImage(bmp, 0, 0);
    const data = ctx.getImageData(0, 0, w, h).data;
    const A = 16; // alpha threshold

    let top = -1, bottom = -1, left = w, right = -1;
    const longestRun = new Array(h).fill(0);
    for (let y = 0; y < h; y++) {
      let run = 0, best = 0, rowHas = false;
      for (let x = 0; x < w; x++) {
        if (data[(y * w + x) * 4 + 3] > A) {
          rowHas = true;
          run++;
          if (run > best) best = run;
          if (x < left) left = x;
          if (x > right) right = x;
        } else run = 0;
      }
      longestRun[y] = best;
      if (rowHas) {
        if (top < 0) top = y;
        bottom = y;
      }
    }
    if (top < 0) return null;
    const contentH = bottom - top + 1;
    // Head width: median longest-run over the hair/face band. Using the
    // longest contiguous run (not the full row extent) keeps raised arms
    // from inflating the estimate.
    const band = [];
    for (let y = top + Math.round(contentH * 0.03); y <= top + Math.round(contentH * 0.14); y++) {
      if (longestRun[y] > 0) band.push(longestRun[y]);
    }
    band.sort((a, b) => a - b);
    const headWidth = band.length ? band[Math.floor(band.length / 2)] : right - left + 1;
    return { imgW: w, imgH: h, top, bottom, left, right, headWidth };
  }, file);
  if (m) metrics[file] = m;
  else console.warn("no content:", file);
}
await browser.close();

fs.writeFileSync(path.join(ROOT, "src/data/sprite-metrics.json"), JSON.stringify(metrics, null, 1));
console.log(`Measured ${Object.keys(metrics).length} sprites -> src/data/sprite-metrics.json`);
for (const [file, m] of Object.entries(metrics)) {
  const bodyH = m.bottom - m.top + 1;
  console.log(
    `${file.split("/sprites/")[1].padEnd(45)} head:${String(m.headWidth).padStart(4)}px body:${bodyH}px ratio:${(bodyH / m.headWidth).toFixed(1)}`
  );
}
