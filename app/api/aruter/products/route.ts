import { NextResponse } from "next/server";
import { getAruterRepository } from "@/app/lib/aruter/repositoryFactory";

export async function GET() {
  return NextResponse.json({
    ok: true,
    data: await getAruterRepository().listProducts(),
  });
}
