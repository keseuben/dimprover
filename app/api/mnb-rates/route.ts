export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const response = await fetch("https://www.mnb.hu/arfolyamok.asmx/GetCurrentExchangeRates", {
      cache: "no-store",
      headers: { Accept: "application/xml,text/xml,*/*" },
    });
    if (!response.ok) return new Response("MNB exchange rates unavailable", { status: 502 });
    const xml = await response.text();
    return new Response(xml, {
      status: 200,
      headers: { "content-type": "application/xml; charset=utf-8", "cache-control": "no-store" },
    });
  } catch {
    return new Response("MNB exchange rates unavailable", { status: 502 });
  }
}
