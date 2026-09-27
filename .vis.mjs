import { chromium } from '@playwright/test';
import sharp from 'sharp';
const tiers = (process.argv[2] ?? 'medium,low').split(',');
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
const hex = (h) => [1,3,5].map(i => parseInt(h.slice(i,i+2),16));
const ground = { dark: hex('#1a1d23'), light: hex('#eef0f2') };
for (const tier of tiers) for (const theme of ['dark','light']) {
  const p = await b.newPage({ viewport: { width: 1200, height: 800 } });
  await p.addInitScript((t) => { sessionStorage.setItem('intro:seen','1'); localStorage.setItem('pref:theme', t); }, theme);
  await p.goto(`http://localhost:4321/dev/world/?tier=${tier}&particles=4096&world-debug`);
  await p.waitForFunction(() => document.documentElement.dataset.worldReady === 'true', null, { timeout: 60000 });
  await p.addStyleTag({ content: 'header, main, footer, .skip-link, #world-caption, .world-labels { visibility: hidden !important; }' });
  const row = [];
  for (let k = 0; k < 5; k++) {
    await p.evaluate((k) => { const w = window.__world.state; w.targetWeights = [0,0,0,0,0].map((_, j) => j === k ? 1 : 0); }, k);
    await p.waitForFunction((k) => (window.__world.state.weights[k] ?? 0) > 0.98, k, { timeout: 60000 });
    await p.waitForTimeout(1500);
    const buf = await p.screenshot({ clip: { x: 560, y: 0, width: 620, height: 800 } });
    const { data, info } = await sharp(buf).raw().toBuffer({ resolveWithObject: true });
    const g = ground[theme]; let vis = 0, strong = 0; const n = info.width * info.height;
    for (let i = 0; i < data.length; i += info.channels) {
      const d = Math.abs(data[i]-g[0]) + Math.abs(data[i+1]-g[1]) + Math.abs(data[i+2]-g[2]);
      if (d > 45) vis++; if (d > 150) strong++;
    }
    row.push(`${['data','ml','llm','sde','conv'][k]} ${(vis/n*100).toFixed(1)}%/${(strong/n*100).toFixed(1)}%`);
    if (process.env.SHOT) await sharp(buf).toFile(`${process.env.SHOT}/${tier}-${theme}-${k}.png`);
  }
  console.log(tier.padEnd(6), theme.padEnd(5), row.join('  '), await p.evaluate(() => document.documentElement.dataset.worldTier));
  await p.close();
}
await b.close();
