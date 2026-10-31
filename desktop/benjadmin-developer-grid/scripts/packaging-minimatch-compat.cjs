"use strict";
const api=require("../node_modules/minimatch");
// Older packaging helpers call the export directly; newer ones use named
// exports. Both delegate to minimatch 11 without restoring the old matcher.
module.exports=Object.assign(function(...args){return api.minimatch(...args);},api);
