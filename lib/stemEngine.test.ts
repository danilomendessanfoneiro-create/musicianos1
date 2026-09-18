import { separateStems, STEM_NAMES, StemName } from './stemEngine';

const SR = 44100;
const DUR = 4;
const LEN = SR * DUR;

function zeros(): Float32Array[] {
  return [new Float32Array(LEN), new Float32Array(LEN)];
}

function add(dst: Float32Array[], src: Float32Array[]) {
  for (let c = 0; c < 2; c++) for (let i = 0; i < LEN; i++) dst[c][i] += src[c][i];
}

// --- fontes sintéticas ------------------------------------------------

const bass = zeros();
for (let i = 0; i < LEN; i++) {
  const t = i / SR;
  const v = 0.30 * Math.sin(2 * Math.PI * 80 * t) + 0.10 * Math.sin(2 * Math.PI * 160 * t);
  bass[0][i] = v;
  bass[1][i] = v;
}

const vocals = zeros();
for (let i = 0; i < LEN; i++) {
  const t = i / SR;
  // vibrato de verdade: fase integrada, ±6 Hz a 5 Hz
  const ph = 2 * Math.PI * 300 * t + (6 / 5) * Math.sin(2 * Math.PI * 5 * t);
  const v = 0.25 * Math.sin(ph) + 0.12 * Math.sin(2 * ph) + 0.06 * Math.sin(3 * ph);
  vocals[0][i] = v;
  vocals[1][i] = v;
}

// guitarras hard-panned (uma nota em cada lado) -> baixa coerência estéreo
const other = zeros();
for (let i = 0; i < LEN; i++) {
  const t = i / SR;
  other[0][i] = 0.22 * Math.sin(2 * Math.PI * 440 * t) + 0.10 * Math.sin(2 * Math.PI * 880 * t);
  other[1][i] = 0.22 * Math.sin(2 * Math.PI * 659 * t) + 0.10 * Math.sin(2 * Math.PI * 1318 * t);
}

// bateria: transientes de ruído a cada 0.25 s
const drums = zeros();
let seed = 12345;
const rnd = () => {
  seed = (seed * 1103515245 + 12345) & 0x7fffffff;
  return seed / 0x3fffffff - 1;
};
for (let hit = 0; hit * 0.25 < DUR; hit++) {
  const start = Math.round(hit * 0.25 * SR);
  const n = Math.round(0.04 * SR);
  for (let i = 0; i < n && start + i < LEN; i++) {
    const env = Math.exp(-i / (0.006 * SR));
    const v = 0.6 * rnd() * env;
    drums[0][start + i] += v;
    drums[1][start + i] += v;
  }
}

const mix = zeros();
add(mix, bass);
add(mix, vocals);
add(mix, other);
add(mix, drums);

// --- separação --------------------------------------------------------

const t0 = Date.now();
const res = separateStems(mix, SR, { segmentSeconds: 10 }, (p) => {
  if (p.ratio === 1) process.stdout.write(`  ${(Date.now() - t0) / 1000}s de processamento\n`);
});

// --- métricas ---------------------------------------------------------

function energy(ch: Float32Array[], from = SR * 0.2, to = LEN - SR * 0.2) {
  let e = 0;
  for (let c = 0; c < 2; c++) for (let i = from; i < to; i++) e += ch[c][i] * ch[c][i];
  return e;
}

/** Fração da energia da fonte `a` que foi parar na pista `b`. */
function share(a: Float32Array[], b: Float32Array[]) {
  const from = Math.round(SR * 0.2);
  const to = LEN - from;
  let num = 0;
  let den = 0;
  for (let c = 0; c < 2; c++) {
    for (let i = from; i < to; i++) {
      num += a[c][i] * b[c][i];
      den += a[c][i] * a[c][i];
    }
  }
  return num / (den + 1e-12);
}

function corr(a: Float32Array[], b: Float32Array[]) {
  const from = Math.round(SR * 0.2);
  const to = LEN - from;
  let num = 0;
  let da = 0;
  let db = 0;
  for (let c = 0; c < 2; c++) {
    for (let i = from; i < to; i++) {
      num += a[c][i] * b[c][i];
      da += a[c][i] * a[c][i];
      db += b[c][i] * b[c][i];
    }
  }
  return num / Math.sqrt(da * db + 1e-12);
}

// 1) reconstrução: soma das pistas deve devolver o mix
const sum = zeros();
for (const name of STEM_NAMES) add(sum, res.stems[name]);
const err = zeros();
for (let c = 0; c < 2; c++) for (let i = 0; i < LEN; i++) err[c][i] = sum[c][i] - mix[c][i];
const snr = 10 * Math.log10(energy(mix) / (energy(err) + 1e-20));
console.log(`\nReconstrução (soma das 4 pistas vs mix): ${snr.toFixed(1)} dB de SNR`);

// 2) cada fonte deve cair majoritariamente na pista certa
const sources: Record<string, Float32Array[]> = { vocals, drums, bass, other };
const expected: Record<string, StemName> = {
  vocals: 'vocals',
  drums: 'drums',
  bass: 'bass',
  other: 'other',
};

let failures = 0;
console.log('\nDestino da energia de cada fonte:');
for (const src of Object.keys(sources)) {
  const row: Record<string, number> = {};
  let best: StemName = 'vocals';
  let bestVal = -Infinity;
  for (const name of STEM_NAMES) {
    const v = share(sources[src], res.stems[name]);
    row[name] = v;
    if (v > bestVal) {
      bestVal = v;
      best = name;
    }
  }
  const ok = best === expected[src];
  if (!ok) failures++;
  console.log(
    `  ${src.padEnd(7)} -> ` +
      STEM_NAMES.map((n) => `${n}:${(100 * row[n]).toFixed(0)}%`).join('  ') +
      `   ${ok ? 'OK' : 'FALHOU (melhor: ' + best + ')'}`,
  );
}

// 3) instrumental (tudo menos voz) deve ter pouca voz
const instr = zeros();
for (const name of STEM_NAMES) if (name !== 'vocals') add(instr, res.stems[name]);
const leak = share(vocals, instr);
console.log(`\nVoz que sobrou no instrumental: ${(100 * leak).toFixed(0)}%`);
if (leak > 0.35) { console.log('ERRO: vazamento de voz alto demais'); failures++; }

if (snr < 40) {
  console.log('ERRO: reconstrução imprecisa');
  failures++;
}
console.log(failures === 0 ? '\nTodos os testes passaram.' : `\n${failures} falha(s).`);
process.exit(failures === 0 ? 0 : 1);
