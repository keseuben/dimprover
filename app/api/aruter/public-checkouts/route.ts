import { NextResponse } from "next/server";
import { createStorefrontMultiItemCheckout, type StorefrontCheckoutInput } from "@/app/lib/aruter/storefrontCheckout";

export async function POST(request: Request) {
  const body = await request.json().catch(() => null) as Partial<StorefrontCheckoutInput> | null;
  if (!body) return NextResponse.json({ ok: false, code: "STOREFRONT_CHECKOUT_JSON_INVALID", error: "Érvénytelen JSON kérés." }, { status: 400 });
  const idempotencyKey = request.headers.get("idempotency-key")?.trim() || "";
  const result = await createStorefrontMultiItemCheckout(body, idempotencyKey);
  if (!result.ok) return NextResponse.json({ ok: false, code: result.code, error: result.error }, { status: result.status });
  return NextResponse.json(result, { status: result.data.reused ? 200 : 201 });
}
