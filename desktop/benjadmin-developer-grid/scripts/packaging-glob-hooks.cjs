"use strict";
// Build process only: these scripts are excluded from the desktop ASAR.
const {registerHooks}=require("node:module");
const {pathToFileURL}=require("node:url");
const path=require("node:path");
if(typeof registerHooks!=="function")throw new Error("Windows packaging requires Node.js 22.15 or newer.");
const prefix=pathToFileURL(path.join(__dirname,"..","node_modules")+path.sep).href;
const adapters={
  glob:pathToFileURL(path.join(__dirname,"packaging-glob-compat.cjs")).href,
  minimatch:pathToFileURL(path.join(__dirname,"packaging-minimatch-compat.cjs")).href,
};
registerHooks({resolve(specifier,context,nextResolve){
  if(context.parentURL?.startsWith(prefix)&&context.conditions.includes("require")&&Object.hasOwn(adapters,specifier))
    return {url:adapters[specifier],shortCircuit:true};
  return nextResolve(specifier,context);
}});
