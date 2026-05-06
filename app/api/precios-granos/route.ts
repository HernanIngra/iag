import { NextResponse } from "next/server";

export const revalidate = 3600; // 1-hour cache

const GRAINS = [
  { key: "soja", ticker: "ZS=F", name: "Soja", lbs_per_bu: 60 },
  { key: "maiz", ticker: "ZC=F", name: "Maíz", lbs_per_bu: 56 },
  { key: "trigo", ticker: "ZW=F", name: "Trigo", lbs_per_bu: 60 },
];

// cents/bushel → USD/ton
function cbotToUsdTon(centsPerBu: number, lbsPerBu: number): number {
  const buPerTon = 2204.62 / lbsPerBu;
  return (centsPerBu / 100) * buPerTon;
}

async function fetchYahooChart(ticker: string) {
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(ticker)}?interval=1wk&range=1y&includePrePost=false`;
  const res = await fetch(url, {
    headers: {
      "User-Agent": "Mozilla/5.0 (compatible; IAg/1.0)",
      Accept: "application/json",
    },
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

export async function GET() {
  try {
    const [arsRates, ...charts] = await Promise.all([
      fetchArsRate(),
      ...GRAINS.map((g) => fetchYahooChart(g.ticker)),
    ]);

    const granos = GRAINS.map((grain, i) => {
      const chart = charts[i];
      const result = chart?.chart?.result?.[0];
      const closes: number[] = result?.indicators?.quote?.[0]?.close ?? [];
      const timestamps: number[] = result?.timestamp ?? [];

      // Filter null values
      const valid = timestamps
        .map((ts: number, idx: number) => ({ ts, price: closes[idx] }))
        .filter((p: { ts: number; price: number }) => p.price != null);

      const history = valid.map((p: { ts: number; price: number }) => ({
        date: new Date(p.ts * 1000).toISOString().slice(0, 10),
        price_usd_ton: Math.round(cbotToUsdTon(p.price, grain.lbs_per_bu)),
      }));

      const last = valid[valid.length - 1];
      const prev = valid[valid.length - 2];
      const price = last ? cbotToUsdTon(last.price, grain.lbs_per_bu) : 0;
      const prevPrice = prev ? cbotToUsdTon(prev.price, grain.lbs_per_bu) : price;
      const changePct = prevPrice ? ((price - prevPrice) / prevPrice) * 100 : 0;

      return {
        key: grain.key,
        name: grain.name,
        ticker: grain.ticker,
        price_usd_ton: Math.round(price),
        prev_price_usd_ton: Math.round(prevPrice),
        change_pct: Math.round(changePct * 10) / 10,
        history,
      };
    });

    return NextResponse.json({
      granos,
      usd_ars_oficial: Math.round(arsRates.oficial),
      usd_ars_blue: Math.round(arsRates.blue),
      updated_at: new Date().toISOString(),
      source: "CBOT vía Yahoo Finance · TC vía Bluelytics",
    });
  } catch (err) {
    return NextResponse.json(
      { error: (err as Error).message },
      { status: 503 }
    );
  }
}
