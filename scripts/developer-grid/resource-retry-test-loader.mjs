import fs from 'node:fs';
import vm from 'node:vm';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url),ts=require('typescript'),sandbox={exports:{}};
vm.runInNewContext(ts.transpileModule(fs.readFileSync(new URL('../../app/lib/developer-grid/resource-retry.ts',import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,sandbox);
export const resourceRetry=sandbox.exports;
