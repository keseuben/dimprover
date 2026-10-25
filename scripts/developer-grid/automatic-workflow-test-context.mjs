import {createRequire} from "node:module";
const require=createRequire(import.meta.url);
const workflowControl=require("../../desktop/benjadmin-developer-grid/src/workflow/control.cjs");
export function automaticWorkflowVm(vm) {
 const fixture=context=>Object.assign(context || {}, {
   workflowControl,
   config:{...(context?.config || {}),workflowControlModes:Object.fromEntries(workflowControl.WORKERS.map(code=>[code,"AUTO"]))}
 });
 return {...vm,createContext:(context,...args)=>vm.createContext(fixture(context),...args),
   runInNewContext:(code,context,...args)=>vm.runInNewContext(code,fixture(context),...args)};
}
