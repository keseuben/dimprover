/**
 * Independent smaller DIMPRO digital apps.
 * Planning/catalog metadata ONLY — no approved price, payable plan,
 * provisioned account, automatic SSO registration, entitlement or access.
 *
 * The five primary product layers live in dimproProductArchitecture.ts.
 */
import type {DimproLicenseScope} from "./dimproProductArchitecture";

export const DIMPRO_MINI_APP_CATALOG_VERSION="1.0.0" as const;

export const DIMPRO_MINI_APPS = [
  {
    code:"DIMPRO_ARUTER",name:"DIMPRO Árutér",
    description:"Áruforgalom, készletkezelés és kereskedelmi munkafolyamatok.",
    licenseScopes:["ORGANIZATION"],
    group:"BUSINESS",
    relatedPrimaryProduct:null,
    requiresPrimarySubscription:false,
    dataSensitivity:"STANDARD",
  },
  {
    code:"DIMPRO_FELUJITASI_GYORSKALKULATOR",name:"DIMPRO Felújítási Gyorskalkulátor",
    description:"Felújítási számítások és beruházás-előkészítési segédfunkciók.",
    licenseScopes:["USER","ORGANIZATION"],
    group:"PROPERTY",
    relatedPrimaryProduct:null,
    requiresPrimarySubscription:false,
    dataSensitivity:"STANDARD",
  },
  {
    code:"DIMPRO_INGATLANFELMERO",name:"DIMPRO Ingatlanfelmérő",
    description:"Ingatlanfelmérési adatgyűjtés és kapcsolódó dokumentáció.",
    licenseScopes:["USER","ORGANIZATION"],
    group:"PROPERTY",
    relatedPrimaryProduct:null,
    requiresPrimarySubscription:false,
    dataSensitivity:"STANDARD",
  },
  {
    code:"DIMPRO_GAZDASEGED",name:"DIMPRO Gazdasegéd",
    description:"Gazdálkodási nyilvántartás és napi munkafolyamatok támogatása.",
    licenseScopes:["USER","ORGANIZATION"],
    group:"AGRICULTURE",
    relatedPrimaryProduct:null,
    requiresPrimarySubscription:false,
    dataSensitivity:"STANDARD",
  },
  {
    code:"DIMPRO_ONE_EGESZSEG",name:"DIMPRO ONE Egészség",
    description:"Személyes egészségügyi adatokhoz kapcsolódó digitális segédapp.",
    licenseScopes:["USER"],
    group:"HEALTH",
    relatedPrimaryProduct:"DIMPRO_ONE",
    requiresPrimarySubscription:false,
    dataSensitivity:"SPECIAL_CATEGORY_HEALTH",
  },
] as const satisfies readonly {
  code:string;name:string;description:string;
  licenseScopes:readonly DimproLicenseScope[];
  group:"BUSINESS"|"PROPERTY"|"AGRICULTURE"|"HEALTH";
  relatedPrimaryProduct:"DIMPRO_ONE"|null;
  requiresPrimarySubscription:false;
  dataSensitivity:"STANDARD"|"SPECIAL_CATEGORY_HEALTH";
}[];

export type DimproMiniAppCode=(typeof DIMPRO_MINI_APPS)[number]["code"];
export type DimproMiniAppDefinition=(typeof DIMPRO_MINI_APPS)[number];

export function dimproMiniApp(code:string):DimproMiniAppDefinition|undefined{
  return DIMPRO_MINI_APPS.find(app=>app.code===code);
}
export function isMiniAppScopeAllowed(code:DimproMiniAppCode,scope:DimproLicenseScope):boolean{
  const app=dimproMiniApp(code);
  return app!==undefined&&(app.licenseScopes as readonly string[]).includes(scope);
}
/** All five are candidates only, not active license offerings. */
export const DIMPRO_MINI_APP_COMMERCIAL_RELEASED=false as const;
