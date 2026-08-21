import { after, NextResponse } from "next/server";
import { getAruterRepository } from "@/app/lib/aruter/repositoryFactory";
import { listConfiguredStorefrontOrders } from "@/app/lib/aruter/storefrontOrderRepository";
import type { AruterOrder } from "@/app/lib/aruter/types";
import { mirrorAruterOrderToCommerceFailOpen } from "@/app/lib/aruter/commerceMirror";

export async function GET() {
  const base = await Promise.resolve(getAruterRepository().listOrders());
  const persisted = await listConfiguredStorefrontOrders();
  const merged = [...persisted, ...(Array.isArray(base) ? base : []).filter((order) => !persisted.some((item) => item.id === order.id))];
  return NextResponse.json({ ok: true, data: merged });
}

export async function POST(request: Request) {
  const body = await request.json().catch(() => null) as Partial<AruterOrder> | null;

  if (!body) {
    return NextResponse.json({ ok: false, error: "Érvénytelen JSON kérés." }, { status: 400 });
  }

  if (!body.template || !body.customerName || !body.customerType || !body.recorderName || !body.items) {
    return NextResponse.json({ ok: false, error: "Hiányzó rendelési adatok." }, { status: 400 });
  }

  const result = await getAruterRepository().createOrder({
    template: body.template,
    customerName: body.customerName,
    customerType: body.customerType,
    recorderName: body.recorderName,
    pickupTime: body.pickupTime,
    note: body.note,
    items: body.items,
  });

  if (!result.ok) {
    return NextResponse.json(result, { status: 400 });
  }

  if (result.data) {
    const order = result.data;
    after(async () => {
      await mirrorAruterOrderToCommerceFailOpen(request, order);
    });
  }

  return NextResponse.json(result, { status: 201 });
}
