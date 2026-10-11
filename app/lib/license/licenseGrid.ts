/** Pure deterministic table sorting: no credential, mutation or database access. */
export type LicenseGridSortKey="code"|"owner"|"product"|"status"|"users"|"expiry";
export type LicenseGridSortOrder="asc"|"desc";
type LicenseGridRow={
  public_license_code:string;ownerName:string;product_code:string;
  plan_code:string|null;status:string;memberCount:number;
  max_users:number;expires_at:string|null;
};
const compareString=(a:string,b:string)=>a.localeCompare(b,"hu-HU",{numeric:true,sensitivity:"base"});
export function sortLicenseGrid<T extends LicenseGridRow>(
  rows:readonly T[],key:LicenseGridSortKey,order:LicenseGridSortOrder,
):T[]{
  const compare=(a:T,b:T):number=>{
    switch(key){
      case "code":return compareString(a.public_license_code,b.public_license_code);
      case "owner":return compareString(a.ownerName,b.ownerName);
      case "product":return compareString(a.product_code+" "+(a.plan_code??""),b.product_code+" "+(b.plan_code??""));
      case "status":return compareString(a.status,b.status);
      case "users":return a.memberCount-b.memberCount||a.max_users-b.max_users;
      case "expiry":{
        // Do not subtract infinities (NaN sort ordering is non-deterministic).
        const x=a.expires_at?Date.parse(a.expires_at):Number.MAX_SAFE_INTEGER;
        const y=b.expires_at?Date.parse(b.expires_at):Number.MAX_SAFE_INTEGER;
        const normX=Number.isFinite(x)?x:Number.MAX_SAFE_INTEGER;
        const normY=Number.isFinite(y)?y:Number.MAX_SAFE_INTEGER;
        return normX-normY;
      }
    }
  };
  return rows.map((value,index)=>({value,index})).sort((a,b)=>{
    const value=compare(a.value,b.value);
    return value===0?a.index-b.index:order==="asc"?value:-value;
  }).map(item=>item.value);
}
