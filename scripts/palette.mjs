// Checks the design palette: WCAG contrast of every token against its surfaces,
// and whether the three role hues stay distinct under colour-vision deficiency
// (Machado et al. 2009, severity 1.0), measured as OKLab distance.
// Run: node scripts/palette.mjs   (exits 1 if any check fails)

export const palette = {
  dark: {
    ground: '#1A1D23', raised: '#22262E', text: '#ECE8E1', muted: '#A7ABB3', line: '#6B717C',
    sde: '#4FAAF5', llm: '#E0B444', ml: '#EC7BA6',
  },
  light: {
    ground: '#EEF0F2', raised: '#FFFFFF', text: '#1A1D23', muted: '#4E545E', line: '#7C828C',
    sde: '#2F63BE', llm: '#765A00', ml: '#A8406F',
  },
};

// Minimum contrast each token needs against ground and raised surfaces.
const need = { text: 4.5, muted: 4.5, line: 3, sde: 4.5, llm: 4.5, ml: 4.5 };
const MIN_ROLE_DISTANCE = 0.1; // OKLab ΔE between any two role hues

const hex = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16) / 255);
const lin = (c) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
const luminance = (h) => {
  const [r, g, b] = hex(h).map(lin);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
export const contrast = (a, b) => {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
};

const cvd = {
  none: null,
  protan: [0.152286, 1.052583, -0.204868, 0.114503, 0.786281, 0.099216, -0.003882, -0.048116, 1.051998],
  deutan: [0.367322, 0.860646, -0.227968, 0.280085, 0.672501, 0.047413, -0.01182, 0.04294, 0.968881],
  tritan: [1.255528, -0.076749, -0.178779, -0.078411, 0.930809, 0.147602, 0.004733, 0.691367, 0.3039],
};
const clamp01 = (x) => Math.min(1, Math.max(0, x));
const oklab = (h, m) => {
  let [r, g, b] = hex(h).map(lin);
  if (m) [r, g, b] = [0, 3, 6].map((i) => clamp01(m[i] * r + m[i + 1] * g + m[i + 2] * b));
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const M = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  return [
    0.2104542553 * l + 0.793617785 * M - 0.0040720468 * s,
    1.9779984951 * l - 2.428592205 * M + 0.4505937099 * s,
    0.0259040371 * l + 0.7827717662 * M - 0.808675766 * s,
  ];
};
export const distance = (a, b, m) => {
  const [x, y] = [oklab(a, m), oklab(b, m)];
  return Math.hypot(x[0] - y[0], x[1] - y[1], x[2] - y[2]);
};

export function check(p = palette) {
  const failures = [];
  const rows = [];
  for (const [theme, t] of Object.entries(p)) {
    for (const [token, min] of Object.entries(need)) {
      for (const surface of ['ground', 'raised']) {
        const ratio = contrast(t[token], t[surface]);
        rows.push(`${theme.padEnd(5)} ${token.padEnd(6)} on ${surface.padEnd(6)} ${ratio.toFixed(2)}:1`);
        if (ratio < min) failures.push(`${theme} ${token} on ${surface}: ${ratio.toFixed(2)} < ${min}`);
      }
    }
    for (const [name, m] of Object.entries(cvd)) {
      const pairs = [['sde', 'llm'], ['sde', 'ml'], ['llm', 'ml']].map(([a, b]) => distance(t[a], t[b], m));
      rows.push(`${theme.padEnd(5)} roles ${name.padEnd(6)} ΔE sde/llm ${pairs[0].toFixed(3)}  sde/ml ${pairs[1].toFixed(3)}  llm/ml ${pairs[2].toFixed(3)}`);
      if (Math.min(...pairs) < MIN_ROLE_DISTANCE) failures.push(`${theme} role hues too close under ${name}`);
    }
  }
  return { rows, failures };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const { rows, failures } = check();
  console.log(rows.join('\n'));
  if (failures.length) {
    console.error('\nFAIL\n' + failures.join('\n'));
    process.exit(1);
  }
  console.log('\nAll palette checks pass.');
}
