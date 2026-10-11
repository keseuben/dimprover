import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {createRequire} from "node:module";
const require=createRequire(import.meta.url);
const ts=require("typescript");
const source=readFileSync("app/api/dimpro-identity/admin/project-product-licenses/route.ts","utf8");
const output=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
let databaseCalls=0;
let userSessionCalls=0;
let isAdmin=true;
const mockRequire=id=>{
 if(id==="next/server")return {NextResponse:{json:(body,options)=>({body,status:options?.status||200})}};
 if(id.includes("licenseEnvironmentPolicy"))return {
   denyUnauthorizedLicenseMutation:()=>({status:423,body:{ok:false,code:"LICENSE_ENV_MISSING_OR_INVALID"}}),
 };
 if(id.includes("license/admin-auth"))return {isLicenseAdminAuthorized:async()=>isAdmin};
 if(id.includes("project-core/auth"))return {resolveProjectCoreAuth:async()=>{userSessionCalls++;throw Error("SSO_USED")}};
 if(id.includes("dimpro-auth/db"))return {authQuery:async()=>{databaseCalls++;throw Error("DB_USED")}};
 throw Error("UNEXPECTED_DEPENDENCY:"+id);
};
const methods={};
new Function("require","exports",output)(mockRequire,methods);
const request=(hostname)=>({nextUrl:{hostname},headers:new Headers(),json:async()=>{throw Error("BODY_PARSED")}});
for(const method of ["POST","PATCH"]) {
 let response=await methods[method](request("drive.dev.dimpro.hu"));
 assert.equal(response.status,423,method+" writes hard locked");
 assert.equal(response.body.ok,false);
 assert.equal(databaseCalls,0,method+" no database side effects");
 assert.equal(userSessionCalls,0,method+" SSO not invoked when disabled");
 response=await methods[method](request("drive.dimpro.hu"));
 assert.equal(response.status,404,method+" disallowed on PROD host");
 isAdmin=false;
 response=await methods[method](request("drive.dev.dimpro.hu"));
 assert.equal(response.status,401,method+" rejects unauthorized key");
 isAdmin=true;
}
let read=await methods.GET(request("drive.dev.dimpro.hu"));
assert.equal(read.status,503,"without DB the license list fails closed");
isAdmin=false;
read=await methods.GET(request("drive.dev.dimpro.hu"));
assert.equal(read.status,401,"admin key required for all license listing");
assert.equal(databaseCalls,4,"all four admin collections are guarded before the DB is accessed");
console.log("PROJECT PRODUCT LICENSE ADMIN RELEASE GATE 15/15 PASS");
