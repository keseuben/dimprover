/**
 * Central DIMPRO licensing: environment isolation contract.
 *
 * Never infer DEV/PROD from NODE_ENV: both Next.js standalone releases use
 * NODE_ENV=production. Never infer from a user-controlled HTTP Host header.
 *
 * V0.9.48 intentionally cannot release LIVE/PROD writes. The existing
 * admin-key alone is not a sufficient PRODUCTION licensing operator identity.
 * A later separately reviewed central AUTH role + billing approval is required.
 */
export const DIMPRO_LICENSE_PROD_WRITES_RELEASED=false as const;

export type LicenseEnvironment="DEV"|"PROD"|"UNKNOWN";
export type LicenseWriteState={
  runtimeEnvironment:LicenseEnvironment;
  dataEnvironment:LicenseEnvironment;
  mode:"DEV_TEST"|"LOCKED";
  writeAllowed:boolean;
  reason:
    |"LICENSE_ENV_MISSING_OR_INVALID"
    |"LICENSE_ENV_MISMATCH"
    |"LICENSE_PROD_WRITES_NOT_RELEASED"
    |"LICENSE_DEV_DATA_BOUNDARY_NOT_VERIFIED"
    |"LICENSE_DEV_TEST_WRITES_NOT_RELEASED"
    |"LICENSE_DEV_TEST_ONLY";
};
type LicenseEnvInput={
  runtimeEnv?:string;
  dataEnv?:string;
  dataBoundaryAttestation?:string;
  devTestWriteRelease?:string;
};
const classify=(value:string|undefined):LicenseEnvironment=>
  value==="DEV"||value==="PROD"?value:"UNKNOWN";

export function evaluateLicenseWriteState(input:LicenseEnvInput):LicenseWriteState{
  const runtimeEnvironment=classify(input.runtimeEnv);
  const dataEnvironment=classify(input.dataEnv);
  const base={runtimeEnvironment,dataEnvironment} as const;
  const locked=(reason:LicenseWriteState["reason"]):LicenseWriteState=>({
    ...base,mode:"LOCKED",writeAllowed:false,reason,
  });
  if(runtimeEnvironment==="UNKNOWN"||dataEnvironment==="UNKNOWN")
    return locked("LICENSE_ENV_MISSING_OR_INVALID");
  if(runtimeEnvironment!==dataEnvironment)
    return locked("LICENSE_ENV_MISMATCH");
  if(runtimeEnvironment==="PROD")
    // No environment flag can override this compiled release gate.
    return locked("LICENSE_PROD_WRITES_NOT_RELEASED");
  if(input.dataBoundaryAttestation!=="VERIFIED_DEV_ISOLATED")
    return locked("LICENSE_DEV_DATA_BOUNDARY_NOT_VERIFIED");
  if(input.devTestWriteRelease!=="DEV_TEST_ONLY_APPROVED")
    return locked("LICENSE_DEV_TEST_WRITES_NOT_RELEASED");
  return {...base,mode:"DEV_TEST",writeAllowed:true,
    reason:"LICENSE_DEV_TEST_ONLY"};
}

export function getServerLicenseWriteState():LicenseWriteState{
  return evaluateLicenseWriteState({
    runtimeEnv:process.env.DIMPRO_LICENSE_RUNTIME_ENV,
    dataEnv:process.env.DIMPRO_LICENSE_DATA_ENV,
    dataBoundaryAttestation:process.env.DIMPRO_LICENSE_DATA_BOUNDARY_ATTESTATION,
    devTestWriteRelease:process.env.DIMPRO_LICENSE_DEV_TEST_WRITES_RELEASED,
  });
}

/** Call only after a successful admin authentication check. */
export function denyUnauthorizedLicenseMutation():Response|null{
  const state=getServerLicenseWriteState();
  if(state.writeAllowed)return null;
  return Response.json({
    ok:false,
    code:state.reason,
    error:"A licencmódosítás ezen a környezeten zárolva van. Csak jóváhagyott, izolált DEV-teszt vagy későbbi, külön kiadott PROD licenckezelés engedélyezhető.",
  },{status:423,headers:{"cache-control":"private, no-store"}});
}

export function publicLicenseEnvironmentStatus(){
  const state=getServerLicenseWriteState();
  return {environment:state.runtimeEnvironment,writeMode:state.mode,
    writesAllowed:state.writeAllowed,
    productionIssuanceReleased:DIMPRO_LICENSE_PROD_WRITES_RELEASED};
}
