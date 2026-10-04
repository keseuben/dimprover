import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { resolveCentralDimproAuthEnvironmentFromHost } from "@/app/lib/dimpro-auth/client-config";
import DriveRegistrationClient from "./DriveRegistrationClient";
export const dynamic="force-dynamic";
export default async function DriveRegistrationPage(){const h=await headers();if(!resolveCentralDimproAuthEnvironmentFromHost(h.get("host")))notFound();return <DriveRegistrationClient/>;}
