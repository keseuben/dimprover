/** Browser-only appearance preferences: no keys, identities or license data. */
export const LICENSE_GRID_PREFERENCES_KEY = "dimpro.license-center.grid.v1" as const;
export const LICENSE_GRID_COLUMNS = [
  {key:"code",label:"Licenckód",defaultWidth:175,required:true},
  {key:"owner",label:"Tulajdonos",defaultWidth:210,required:true},
  {key:"product",label:"Termék / csomag",defaultWidth:170,required:false},
  {key:"status",label:"Státusz",defaultWidth:130,required:true},
  {key:"users",label:"Felhasználók",defaultWidth:125,required:false},
  {key:"devices",label:"Eszközök",defaultWidth:100,required:false},
  {key:"modules",label:"Modulok",defaultWidth:100,required:false},
  {key:"send",label:"Send-jog",defaultWidth:100,required:false},
  {key:"expiry",label:"Lejárat",defaultWidth:145,required:false},
  {key:"action",label:"Művelet",defaultWidth:140,required:true},
] as const;
export type LicenseGridColumnKey = typeof LICENSE_GRID_COLUMNS[number]["key"];
export type LicenseGridDensity="normal"|"compact";
export type LicenseGridPreferences={
  density:LicenseGridDensity;
  widths:Record<LicenseGridColumnKey,number>;
  hidden:LicenseGridColumnKey[];
};
const validKeys = new Set<string>(LICENSE_GRID_COLUMNS.map(x=>x.key));
const required = new Set<string>(LICENSE_GRID_COLUMNS.filter(x=>x.required).map(x=>x.key));
export const LICENSE_GRID_WIDTH_MIN=76;
export const LICENSE_GRID_WIDTH_MAX=480;
const widthLimit=(number:number)=>Math.max(LICENSE_GRID_WIDTH_MIN,Math.min(LICENSE_GRID_WIDTH_MAX,Math.round(number)));

export function defaultLicenseGridPreferences():LicenseGridPreferences {
  return {
    density:"normal",
    widths:Object.fromEntries(LICENSE_GRID_COLUMNS.map(item=>[item.key,item.defaultWidth])) as LicenseGridPreferences["widths"],
    hidden:[],
  };
}
export function parseLicenseGridPreferences(raw:string|null):LicenseGridPreferences{
  const base=defaultLicenseGridPreferences();
  if(!raw || raw.length>8000)return base;
  try{
    const candidate:unknown=JSON.parse(raw);
    if(!candidate || typeof candidate!=="object" || Array.isArray(candidate))return base;
    const obj=candidate as Record<string,unknown>;
    const savedWidths=obj.widths && typeof obj.widths==="object" && !Array.isArray(obj.widths)
      ?obj.widths as Record<string,unknown>:{};
    for(const key of Object.keys(base.widths) as LicenseGridColumnKey[]){
      const value=savedWidths[key];
      if(typeof value==="number" && Number.isFinite(value))base.widths[key]=widthLimit(value);
    }
    if(obj.density==="compact")base.density="compact";
    if(Array.isArray(obj.hidden)){
      base.hidden=[...new Set(obj.hidden.filter((key):key is LicenseGridColumnKey=>
        typeof key==="string"&&validKeys.has(key)&&!required.has(key)))];
    }
    return base;
  }catch{return base;}
}
export function updateLicenseGridColumnWidth(
  current:LicenseGridPreferences,key:LicenseGridColumnKey,width:number,
):LicenseGridPreferences{
  if(!validKeys.has(key)||!Number.isFinite(width))return current;
  return {...current,widths:{...current.widths,[key]:widthLimit(width)}};
}
export function toggleLicenseGridColumn(
  current:LicenseGridPreferences,key:LicenseGridColumnKey,
):LicenseGridPreferences{
  if(required.has(key)||!validKeys.has(key))return current;
  const hidden=current.hidden.includes(key)
    ?current.hidden.filter(item=>item!==key)
    :[...current.hidden,key];
  return {...current,hidden};
}
export function visibleLicenseGridColumns(prefs:LicenseGridPreferences){
  return LICENSE_GRID_COLUMNS.filter(item=>item.required||!prefs.hidden.includes(item.key));
}
