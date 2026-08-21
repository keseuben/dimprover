import { after, NextResponse } from "next/server";
import { getAruterRepository } from "@/app/lib/aruter/repositoryFactory";
import type { AruterOrderStatus } from "@/app/lib/aruter/types";
import { mirrorAruterOrderToCommerceFailOpen } from "@/app/lib/aruter/commerceMirror";
import { queueStorefrontCommerceMirrorFailOpen, resolveStorefrontCommerceBusinessSlugForOrder } from "@/app/lib/aruter/storefrontPilot";

const allowedStatuses: AruterOrderStatus[] = ["draft", "sent_to_cashier", "paid", "issued", "cancelled"];

type RouteContext = {
  params: Promise<{
    orderId: string;
  }>;
};

export async function PATCH(request: Request, context: RouteContext) {
  const { orderId } = await context.params;
  const body = await request.json().catch(() => null) as { status?: AruterOrderStatus } | null;

  if (!body?.status || !allowedStatuses.includes(body.status)) {
    return NextResponse.json({ ok: false, error: "Érvénytelen rendelés státusz." }, { status: 400 });
  }

  const result = await getAruterRepository().updateOrderStatus(orderId, body.status);

  if (!result.ok) {
    return NextResponse.json(result, { status: 404 });
  }

  if (result.data) {
    const order = result.data;
    after(async () => {
      const storefrontBusinessSlug = resolveStorefrontCommerceBusinessSlugForOrder(order);
      if (storefrontBusinessSlug) {
        await queueStorefrontCommerceMirrorFailOpen(storefrontBusinessSlug, order);
        return;
      }
      await mirrorAruterOrderToCommerceFailOpen(request, order);
    });
  }

  return NextResponse.json(result);
}
