import { NextResponse } from "next/server";

export const revalidate = 3600;

const GRAINS = [
  { key: "soja",    ticker: "ZS=F", name: "Soja",   lbs_per_bu: 60, retencion: 0.24,  gastos: 19 },
  { key: "maiz",    ticker: "ZC=F", name: "Maíz",   lbs_per_bu: 56, retencion: 0.085, gastos: 14 },
  { key: "trigo",   ticker: "ZW=F", name: "Trigo",  lbs_per_bu: 60, retencion: 0.075, gastos: 15 },
];

// cents/bushel → USD/ton
function cbotToUsdTon(centsPerBu: number, lbsPerBu: number): number {
  const buPerTon = 2204.62 / lbsPerBu;
  return (centsPerBu / 100) * buPerTon;
}

async function fetchYahooChart(ticker: string) {
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(ticker)}?interval=1wk&range=1y&includePrePost=false`;
  const res = await fetch(url, {
    headers: { "User-Agent": "Mozilla/5.0 (compatible; IAg/1.0)", Accept: "application/json" },
    next: { revalidate: 3600 },
  });
  if (!res.ok) throw new Error(`Yahoo Finance ${ticker}: HTTP ${res.status}`);
  return res.json();
}

async function fetchArsRate(): Promise<{ oficial: number; blue: number }> {
  const res = await fetch("https://api.bluelytics.com.ar/v2/latest", {
    next: { revalidate: 3600 },
  });
  if (!res.ok) return { oficial: 1000, blue: 1200 };
  const data = await res.json();
  return {
    oficial: (data.oficial?.value_buy + data.oficial?.value_sell) / 2 || 1000,
    blue: (data.blue?.value_buy + data.blue?.value_sell) / 2 || 1200,
  };
}

// Tries today and up to 5 prior business days (MAGYP skips weekends/holidays)
async function fetchMagyp(): Promise<Record<string, number> | null> {
  const toStr = (d: Date) =>
    `${String(d.getDate()).padStart(2,"0")}/${String(d.getMonth()+1).padStart(2,"0")}/${d.getFullYear()}`;

  for (let delta = 0; delta <= 5; delta++) {
    const d = new Date();
    d.setDate(d.getDate() - delta);
    const fecha = toStr(d);
    try {
      const res = await fetch(
        `https://monitorsiogranos.magyp.gob.ar/ws/ssma/precios_fob.php?Fecha=${encodeURIComponent(fecha)}`,
        { next: { revalidate: 3600 }, signal: AbortSignal.timeout(5000) }
      );
      if (!res.ok) continue;
      const data = await res.json();
      // API returns array of { producto, fob_usd } or similar — extract by product name
      if (!Array.isArray(data) || !data.length) continue;

      const map: Record<string, number> = {};
      for (const row of data) {
        const name: string = (row.producto || row.Producto || row.name || "").toLowerCase();
        const price = parseFloat(row.fob_usd || row.FobUsd || row.precio || row.Precio || 0);
        if (!price) continue;
        if (name.includes("soja") && !name.includes("aceite") && !name.includes("harina") && !name.includes("pellet"))
          map["soja"] = price;
        if (name.includes("maiz") || name.includes("maíz")) map["maiz"] = price;
        if (name.includes("trigo") && !name.includes("candeal")) map["trigo"] = price;
      }
      if (Object.keys(map).length > 0) return map;
    } catch {
      // continue to next day
    }
  }
  return null;
}

export async function GET() {
  try {
    const [arsRates, magyp, ...charts] = await Promise.all([
      fetchArsRate(),
      fetchMagyp(),
      ...GRAINS.map((g) => fetchYahooChart(g.ticker)),
    ]);

    const granos = GRAINS.map((grain, i) => {
      const chart = charts[i];
      const result = chart?.chart?.result?.[0];
      const closes: number[] = result?.indicators?.quote?.[0]?.close ?? [];
      const timestamps: number[] = result?.timestamp ?? [];

      const valid = timestamps
        .map((ts: number, idx: number) => ({ ts, price: closes[idx] }))
        .filter((p: { ts: number; price: number }) => p.price != null);

      const history = valid.map((p: { ts: number; price: number }) => ({
        date: new Date(p.ts * 1000).toISOString().slice(0, 10),
        price_usd_ton: Math.round(cbotToUsdTon(p.price, grain.lbs_per_bu)),
      }));

      const last = valid[valid.length - 1];
      const prev = valid[valid.length - 2];
      const cbot = last ? cbotToUsdTon(last.price, grain.lbs_per_bu) : 0;
      const prevPrice = prev ? cbotToUsdTon(prev.price, grain.lbs_per_bu) : cbot;
      const changePct = prevPrice ? ((cbot - prevPrice) / prevPrice) * 100 : 0;

      // FAS teórico = FOB × (1 - retención) - gastos_exportación
      const fob = magyp?.[grain.key] ?? null;
      const fas = fob != null
        ? Math.round(fob * (1 - grain.retencion) - grain.gastos)
        : null;

      return {
        key: grain.key,
        name: grain.name,
        ticker: grain.ticker,
        price_usd_ton: Math.round(cbot),          // CBOT reference
        prev_price_usd_ton: Math.round(prevPrice),
        change_pct: Math.round(changePct * 10) / 10,
        fas_usd_ton: fas,                          // FAS teórico Rosario (null if MAGYP unavailable)
        fob_usd_ton: fob != null ? Math.round(fob) : null,
        retencion_pct: Math.round(grain.retencion * 100),
        history,
      };
    });

    return NextResponse.json({
      granos,
      usd_ars_oficial: Math.round(arsRates.oficial),
      usd_ars_blue: Math.round(arsRates.blue),
      updated_at: new Date().toISOString(),
      source: "CBOT vía Yahoo Finance · FAS vía MAGYP · TC vía Bluelytics",
    });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 503 });
  }
}
