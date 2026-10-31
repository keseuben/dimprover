"use strict";
const api=require("../node_modules/glob");
// ASAR 3 and rimraf 3 still use the callback/sync glob interface. Delegate
// matching to the patched modern implementation; do not emulate its internals.
function glob(pattern,options,callback){
  if(typeof options==="function"){callback=options;options={};}
  const promise=api.glob(pattern,options||{});
  if(typeof callback==="function"){
    promise.then(result=>callback(null,result),error=>callback(error));
    return;
  }
  return promise;
}
module.exports=Object.assign(glob,api,{glob,sync:api.globSync});
