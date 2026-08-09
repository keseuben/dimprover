const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');
const ts = require('typescript');
const root = path.resolve(__dirname, '..');
const originalResolveFilename = Module._resolveFilename;
Module._resolveFilename = function resolveDimproAlias(request, parent, isMain, options) { if (request.startsWith('@/')) request = path.join(root, request.slice(2)); return originalResolveFilename.call(this, request, parent, isMain, options); };
require.extensions['.ts'] = function transpileTypeScript(module, filename) { const source=fs.readFileSync(filename,'utf8'); const output=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true,resolveJsonModule:true},fileName:filename}).outputText; module._compile(output,filename); };

const workspaceApi = require('../components/materials/domain/materialWorkspaceTypes.ts');
const { genericMaterialCatalog } = require('../components/materials/catalog/genericMaterialCatalog.ts');
const { materialToEnergyLayer } = require('../components/materials/adapters/materialToEnergyLayer.ts');
const { searchMaterialCatalog } = require('../components/materials/catalog/materialSearchIndex.ts');

const tests=[]; function test(name,fn){fn();tests.push(name);}
const base=workspaceApi.createDefaultMaterialWorkspace('project-test');

test('default workspace is project scoped and empty',()=>{ assert.equal(base.projectCatalog.scope,'project'); assert.equal(base.projectCatalog.projectId,'project-test'); assert.equal(base.projectMaterials.length,0); });

test('custom project material is private to project and unverified',()=>{ const result=workspaceApi.createProjectCustomMaterial(base,{name:'Saját próbaanyag',categoryId:'masonry',lambdaWmK:0.25,densityKgM3:900,specificHeatJkgK:850,mu:12,defaultThicknessMm:300,sourceNote:'Saját mérnöki becslés'}); assert.equal(result.entry.material.visibility,'project'); assert.equal(result.entry.material.kind,'userDefined'); assert.equal(result.entry.version.verificationStatus,'unverified'); assert.equal(result.workspace.projectMaterials.length,1); assert.equal(result.workspace.sourcePackages[0].licenseStatus,'userOwned'); });

test('custom material requires positive lambda',()=>{ assert.throws(()=>workspaceApi.createProjectCustomMaterial(base,{name:'Hibás próbaanyag',categoryId:'masonry',lambdaWmK:0,sourceNote:'teszt'}),/pozitív λ-érték/); });

test('catalog material can be copied without changing original',()=>{ const source=genericMaterialCatalog[0]; const result=workspaceApi.copyMaterialToProject(base,source); assert.notEqual(result.entry.material.id,source.material.id); assert.equal(source.material.visibility,'private'); assert.equal(result.entry.material.visibility,'project'); assert(result.entry.material.productName.includes('saját másolat')); });

test('favorite toggle is reversible',()=>{ const id=genericMaterialCatalog[0].material.id; const favorite=workspaceApi.toggleMaterialFavorite(base,id); assert(favorite.favoriteIds.includes(id)); const removed=workspaceApi.toggleMaterialFavorite(favorite,id); assert(!removed.favoriteIds.includes(id)); });

test('recent list is unique and ordered',()=>{ const first=genericMaterialCatalog[0].material.id; const second=genericMaterialCatalog[1].material.id; let value=workspaceApi.markMaterialRecent(base,first); value=workspaceApi.markMaterialRecent(value,second); value=workspaceApi.markMaterialRecent(value,first); assert.deepEqual(value.recentIds.slice(0,2),[first,second]); });

test('workspace normalization removes duplicate favorites and recents',()=>{ const id=genericMaterialCatalog[0].material.id; const value=workspaceApi.normalizeMaterialWorkspace({favoriteIds:[id,id],recentIds:[id,id]},'project-normalized'); assert.deepEqual(value.favoriteIds,[id]); assert.deepEqual(value.recentIds,[id]); });

test('material picker adapter freezes exact material version in layer',()=>{ const source=genericMaterialCatalog[9]; const layer=materialToEnergyLayer({layerId:'layer-test',material:source.material,version:source.version,thicknessCm:12}); assert.equal(layer.materialId,source.material.id); assert.equal(layer.materialVersionId,source.version.id); assert.equal(layer.materialSnapshot.materialVersionId,source.version.id); assert(Object.isFrozen(layer.materialSnapshot)); });

test('project materials participate in catalog search',()=>{ const created=workspaceApi.createProjectCustomMaterial(base,{name:'Különleges saját hőszigetelés',categoryId:'eps',lambdaWmK:0.035,sourceNote:'projektadat'}); const results=searchMaterialCatalog([...created.workspace.projectMaterials,...genericMaterialCatalog],{query:'kulonleges sajat'}); assert.equal(results.length,1); assert.equal(results[0].material.id,created.entry.material.id); });

test('copied material keeps source values but receives user-owned source',()=>{ const source=genericMaterialCatalog[9]; const result=workspaceApi.copyMaterialToProject(base,source); assert.equal(result.entry.version.designLambdaWmK.value,source.version.designLambdaWmK.value); const ownSource=result.workspace.sourcePackages.find((item)=>item.id===result.entry.version.sourcePackageId); assert.equal(ownSource.licenseStatus,'userOwned'); assert.equal(ownSource.redistributionAllowed,false); });

console.log(JSON.stringify({ok:true,testCount:tests.length,tests,developmentMaterials:genericMaterialCatalog.length},null,2));
