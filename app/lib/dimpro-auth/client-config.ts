export type DimproAuthEnvironment = "DEV" | "PROD";

export type DimproDriveSsoConfig = {
  environment: DimproAuthEnvironment;
  clientId: string;
  authOrigin: string;
  redirectUri: string;
};

function normalizedHost(value: string | null | undefined) {
  return (value || "").trim().toLowerCase().replace(/:\d+$/, "");
}

export function resolveDimproAuthEnvironmentFromHost(hostValue: string | null | undefined): DimproAuthEnvironment | null {
  const host = normalizedHost(hostValue);
  if (host === "auth.dev.dimpro.hu" || host === "login.dev.dimpro.hu" || host === "drive.dev.dimpro.hu") return "DEV";
  if (host === "auth.dimpro.hu" || host === "login.dimpro.hu" || host === "drive.dimpro.hu") return "PROD";
  if (host === "localhost" || host === "127.0.0.1") return "DEV";
  return null;
}

export function driveSsoConfigForEnvironment(environment: DimproAuthEnvironment): DimproDriveSsoConfig {
  if (environment === "PROD") {
    return {
      environment,
      clientId: "dimpro-drive-prod",
      authOrigin: "https://auth.dimpro.hu",
      redirectUri: "https://drive.dimpro.hu/api/dimpro-auth/callback",
    };
  }
  return {
    environment,
    clientId: "dimpro-drive-dev",
    authOrigin: "https://auth.dev.dimpro.hu",
    redirectUri: "https://drive.dev.dimpro.hu/api/dimpro-auth/callback",
  };
}

export function resolveDriveSsoConfig(hostValue: string | null | undefined): DimproDriveSsoConfig | null {
  const host = normalizedHost(hostValue);
  if (host === "drive.dev.dimpro.hu") return driveSsoConfigForEnvironment("DEV");
  if (host === "drive.dimpro.hu") return driveSsoConfigForEnvironment("PROD");
  if (host === "localhost" || host === "127.0.0.1") {
    return {
      environment: "DEV",
      clientId: "dimpro-drive-dev",
      authOrigin: process.env.DIMPRO_AUTH_DEV_ORIGIN?.trim() || "https://auth.dev.dimpro.hu",
      redirectUri: process.env.DIMPRO_AUTH_DEV_DRIVE_REDIRECT_URI?.trim() || "https://drive.dev.dimpro.hu/api/dimpro-auth/callback",
    };
  }
  return null;
}
