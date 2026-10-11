import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {createRequire} from "node:module";
import ts from "typescript";

const original = readFileSync("app/lib/dimpro-auth/drive-registration-operator.ts","utf8");
const compiled = ts.transpileModule(original,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
const nativeRequire=createRequire(import.meta.url);
let sideEffects=0;
const mockRequire=(specifier)=>{
 if(specifier==="node:crypto")return nativeRequire("node:crypto");
 if(specifier==="./db")return {authQuery:()=>{sideEffects++;throw Error("DB_CALLED")}};
 if(specifier.includes("mail-profiles"))return {sendDimproMail:()=>{sideEffects++;throw Error("SMTP_CALLED")}};
 if(specifier==="./repository")return {recordAuthAuditEvent:()=>{sideEffects++;throw Error("AUDIT_CALLED")}};
 throw Error("UNKNOWN_MOCK_DEP:"+specifier);
};
const exports={};
const config={env:{
 DIMPRO_AUTH_DRIVE_OPERATOR_NOTIFY_ENABLED:"true",
 DIMPRO_AUTH_DRIVE_OPERATOR_TO:"admin@example.com",
 DIMPRO_AUTH_OPERATOR_ADMIN_KEY:"012345678901234567890123456789012345",
}};
new Function("exports","require","process","Headers","Buffer",compiled)(
 exports,mockRequire,config,Headers,Buffer
);
assert.equal(exports.isDriveOperatorMailEnabled(),false,"hard mail release must remain OFF");
assert.deepEqual(exports.registrationOperatorRecipients("Admin@Example.com, admin@example.com"),["admin@example.com"]);
assert.deepEqual(exports.registrationOperatorRecipients("not-an-email"),[]);
assert.deepEqual(exports.registrationOperatorRecipients("one@example.com,two@example.com,three@example.com,four@example.com"),[]);
const msg=exports.driveRegistrationOperatorMessage({
 name:"<script>alert(1)</script>",email:"attacker@example.com",organization:"A & B",
 registrationId:"cdf8f63e-61ea-4f34-972d-e94a58c1b298",verifiedAt:"2026-10-11T09:00:00Z"
});
assert.ok(msg.html.includes("&lt;script&gt;"),"operator mail content must be escaped");
assert.ok(!msg.html.includes("<script>"),"no script injection");
assert.ok(msg.html.includes("A &amp; B"));
const allowed=new Headers({authorization:"Bearer "+config.env.DIMPRO_AUTH_OPERATOR_ADMIN_KEY});
const denied=new Headers({authorization:"Bearer wrong"});
assert.equal(exports.authorizeDriveRegistrationOperator(allowed),true);
assert.equal(exports.authorizeDriveRegistrationOperator(denied),false);
assert.equal(exports.authorizeDriveRegistrationOperator(new Headers()),false);
await exports.deliverDriveRegistrationOperatorNotice("cdf8f63e-61ea-4f34-972d-e94a58c1b298").then(result=>{
 assert.equal(result,"DISABLED");
 assert.equal(sideEffects,0,"no mail, no database claim and no audit with the source gate OFF");
});
console.log("AUTH DRIVE OPERATOR EMAIL GATE + HTML ESCAPE: 11/11 PASS");
