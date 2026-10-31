import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {createRequire} from 'node:module';
import {promisify} from 'node:util';
const require=createRequire(import.meta.url),pkg=require('../package.json'),lock=require('../package-lock.json');
assert.equal(pkg.devDependencies.minimatch,'11.0.3');assert.equal(pkg.devDependencies.glob,'14.0.3');
for(const [p,v]of Object.entries(lock.packages)){
 if(/\/minimatch$/.test(p))assert.equal(v.version,'11.0.3',p);
 if(/\/glob$/.test(p))assert.equal(v.version,'14.0.3',p);
}
const dependencyRequire=createRequire(require.resolve('@electron/asar/package.json'));
const glob=dependencyRequire('glob'),mm=dependencyRequire('minimatch');
assert.equal(typeof glob,'function');assert.equal(typeof mm,'function');
assert.equal(typeof require('glob'),'object','compatibility is scoped to packaging dependencies, not every import');
assert.equal(mm('src/a.txt','src/**/*.txt'),true);assert.equal(mm('src/a.txt','src/**/*.js'),false);
assert.equal(new mm.Minimatch('**/*.txt').match('src/a.txt'),true);
const root=fs.mkdtempSync(path.join(os.tmpdir(),'grid-packaging-glob-'));
try{
 const source=path.join(root,'app');fs.mkdirSync(path.join(source,'src'),{recursive:true});
 fs.writeFileSync(path.join(source,'src/a.txt'),'alpha\n');fs.writeFileSync(path.join(source,'src/b.js'),'beta\n');
 const expected=['src/a.txt','src/b.js'];
 assert.deepEqual(glob.sync('src/**/*',{cwd:source,nodir:true}).sort(),expected);
 assert.deepEqual((await promisify(glob)('src/**/*',{cwd:source,nodir:true})).sort(),expected);
 assert.deepEqual((await glob('src/**/*',{cwd:source,nodir:true})).sort(),expected);
 assert.deepEqual((await promisify(glob)('src/**/*.missing',{cwd:source})),[]);
 const asar=require('@electron/asar'),archive=path.join(root,'test.asar');
 await asar.createPackageWithOptions(source,archive,{});
 for(const p of expected)assert.deepEqual(asar.extractFile(archive,p),fs.readFileSync(path.join(source,p)));
 const compare=require('dir-compare');assert.equal(compare.compareSync(source,source,{compareContent:true,includeFilter:'*.txt'}).same,true);
 const {FileList}=require('filelist');const list=new FileList();list.include(source+'/src/*.txt');assert.deepEqual(list.toArray(),[source+'/src/a.txt']);
 assert(!pkg.build.files.some(p=>p.startsWith('scripts/')),'build adapters must not ship in the application');
 console.log('PACKAGING_GLOB_COMPAT_PASS: fixed dependency pins; scoped CJS compatibility; named API; callback, promise, sync and empty glob; exact ASAR bytes; directory filter and filelist');
}finally{fs.rmSync(root,{recursive:true,force:true});}
