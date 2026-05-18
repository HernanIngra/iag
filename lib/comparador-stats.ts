import type { EnsayoConEntradas } from "./comparador-types";

// ── Numeric utilities ─────────────────────────────────────────────────────────
// Lanczos approximation for ln(Gamma)
function lnGamma(x: number): number {
  const g = 7;
  const c = [
    0.99999999999980993, 676.5203681218851, -1259.1392167224028,
    771.32342877765313, -176.61502916214059, 12.507343278686905,
    -0.13857109526572012, 9.9843695780195716e-6, 1.5056327351493116e-7,
  ];
  if (x < 0.5) return Math.log(Math.PI / Math.sin(Math.PI * x)) - lnGamma(1 - x);
  x -= 1;
  let a = c[0];
  const t = x + g + 0.5;
  for (let i = 1; i < g + 2; i++) a += c[i] / (x + i);
  return 0.5 * Math.log(2 * Math.PI) + (x + 0.5) * Math.log(t) - t + Math.log(a);
}

// Continued fraction expansion for regularized incomplete beta (Lentz's method)
function betacf(a: number, b: number, x: number): number {
  const MAXIT = 200, EPS = 3e-7, FPMIN = 1e-30;
  const qab = a + b, qap = a + 1, qam = a - 1;
  let c = 1, d = 1 - (qab * x) / qap;
  if (Math.abs(d) < FPMIN) d = FPMIN;
  d = 1 / d;
  let h = d;
  for (let m = 1; m <= MAXIT; m++) {
    const m2 = 2 * m;
    let aa = (m * (b - m) * x) / ((qam + m2) * (a + m2));
    d = 1 + aa * d; if (Math.abs(d) < FPMIN) d = FPMIN;
    c = 1 + aa / c; if (Math.abs(c) < FPMIN) c = FPMIN;
    d = 1 / d; h *= d * c;
    aa = (-(a + m) * (qab + m) * x) / ((a + m2) * (qap + m2));
    d = 1 + aa * d; if (Math.abs(d) < FPMIN) d = FPMIN;
    c = 1 + aa / c; if (Math.abs(c) < FPMIN) c = FPMIN;
    d = 1 / d;
    const del = d * c;
    h *= del;
    if (Math.abs(del - 1) < EPS) break;
  }
  return h;
}

// Regularized incomplete beta function I_x(a, b)
function ibeta(a: number, b: number, x: number): number {
  if (x <= 0) return 0;
  if (x >= 1) return 1;
  const lbt =
    Math.exp(a * Math.log(x) + b * Math.log(1 - x) - (lnGamma(a) + lnGamma(b) - lnGamma(a + b)));
  return x < (a + 1) / (a + b + 2)
    ? (lbt * betacf(a, b, x)) / a
    : 1 - (lbt * betacf(b, a, 1 - x)) / b;
}

// Two-tailed p-value for t-distribution: I_x(df/2, 1/2) where x = df/(df+t²)
export function tPValue(t: number, df: number): number {
  return ibeta(df / 2, 0.5, df / (df + t * t));
}

// ── Paired t-test ─────────────────────────────────────────────────────────────

export interface TTestResult {
  t: number;
  df: number;
  pValue: number;
  meanDiff: number;
  se: number;
}

export function pairedTTest(diffs: number[]): TTestResult | null {
  const n = diffs.length;
  if (n < 2) return null;
  const meanDiff = diffs.reduce((a, b) => a + b, 0) / n;
  const variance = diffs.reduce((s, d) => s + (d - meanDiff) ** 2, 0) / (n - 1);
  const se = Math.sqrt(variance / n);
  if (se === 0) return null;
  const t = meanDiff / se;
  return { t, df: n - 1, pValue: tPValue(t, n - 1), meanDiff, se };
}

// ── Yield matrix (loc → hybrid → mean yield) ─────────────────────────────────

export type YieldMatrix = Record<string, Record<string, number>>;

export function buildYieldMatrix(ensayos: EnsayoConEntradas[]): YieldMatrix {
  const raw: Record<string, Record<string, number[]>> = {};
  for (const e of ensayos) {
    for (const entry of e.entradas) {
      ((raw[e.localidad] ??= {})[entry.hibrido] ??= []).push(entry.rendimiento);
    }
  }
  const matrix: YieldMatrix = {};
  for (const [loc, hybs] of Object.entries(raw)) {
    matrix[loc] = {};
    for (const [hyb, vals] of Object.entries(hybs)) {
      matrix[loc][hyb] = vals.reduce((a, b) => a + b, 0) / vals.length;
    }
  }
  return matrix;
}

// ── Two-way additive residuals for outlier detection ─────────────────────────
// Model: y_ij = mu + alpha_i (location) + beta_j (hybrid) + epsilon_ij
// Residual: e_ij = y_ij - locMean_i - hybMean_j + grandMean
// Outlier: |standardized residual| > threshold
export function computeOutlierKeys(
  matrix: YieldMatrix,
  threshold = 2.5
): Set<string> {
  const locs = Object.keys(matrix);
  const allHybrids = [...new Set(locs.flatMap((l) => Object.keys(matrix[l])))];

  let sum = 0, count = 0;
  for (const loc of locs)
    for (const val of Object.values(matrix[loc])) { sum += val; count++; }
  if (count === 0) return new Set();
  const grandMean = sum / count;

  const locMeans: Record<string, number> = {};
  for (const loc of locs) {
    const vals = Object.values(matrix[loc]);
    locMeans[loc] = vals.reduce((a, b) => a + b, 0) / vals.length;
  }

  const hybMeans: Record<string, number> = {};
  for (const h of allHybrids) {
    const vals = locs.filter((l) => matrix[l][h] !== undefined).map((l) => matrix[l][h]);
    if (vals.length > 0) hybMeans[h] = vals.reduce((a, b) => a + b, 0) / vals.length;
  }

  const residuals: Array<{ loc: string; h: string; res: number }> = [];
  for (const loc of locs) {
    for (const [h, val] of Object.entries(matrix[loc])) {
      const fitted = locMeans[loc] + (hybMeans[h] ?? grandMean) - grandMean;
      residuals.push({ loc, h, res: val - fitted });
    }
  }

  if (residuals.length < 3) return new Set();
  const resMean = residuals.reduce((s, r) => s + r.res, 0) / residuals.length;
  const resSD = Math.sqrt(
    residuals.reduce((s, r) => s + (r.res - resMean) ** 2, 0) / (residuals.length - 1)
  );
  if (resSD === 0) return new Set();

  const outliers = new Set<string>();
  for (const { loc, h, res } of residuals) {
    if (Math.abs(res - resMean) / resSD > threshold) outliers.add(`${loc}|${h}`);
  }
  return outliers;
}

// ── Significance label ────────────────────────────────────────────────────────

export function sigLabel(pVal: number | undefined): string {
  if (pVal === undefined) return "";
  if (pVal < 0.05) return "**";
  if (pVal < 0.10) return "*";
  return "";
}
