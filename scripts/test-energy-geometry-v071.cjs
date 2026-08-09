const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');
const ts = require('typescript');

const root = path.resolve(__dirname, '..');
const originalResolveFilename = Module._resolveFilename;
Module._resolveFilename = function resolveDimproAlias(request, parent, isMain, options) {
  if (request.startsWith('@/')) request = path.join(root, request.slice(2));
  return originalResolveFilename.call(this, request, parent, isMain, options);
};
require.extensions['.ts'] = function transpileTypeScript(module, filename) {
  const source = fs.readFileSync(filename, 'utf8');
  const output = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true, resolveJsonModule: true },
    fileName: filename,
  }).outputText;
  module._compile(output, filename);
};

const { calculateEnvelopeGeometry } = require('../components/energy/calculations/geometry/calculateEnvelopeGeometry.ts');
const { createSampleSurveyDraft, createBlankSurveyDraft } = require('../components/property-survey/propertySurveyWorkspaceTypes.ts');
const { createGroundLevel } = require('../components/property-survey/propertySurveyBuildingModel.ts');

const tests = [];
function test(name, fn) { fn(); tests.push(name); }
function clone(value) { return JSON.parse(JSON.stringify(value)); }
function sampleInput() {
  const draft = createSampleSurveyDraft('V071 geometriateszt');
  return {
    rooms: draft.rooms,
    levels: draft.levels,
    wallSegments: draft.wallSegments,
    wallOpenings: draft.wallOpenings,
    sectionLines: draft.sectionLines,
    northAngle: draft.northAngle,
    calculatedAt: '2026-07-29T08:00:00.000Z',
  };
}

const base = calculateEnvelopeGeometry(sampleInput());

test('schema and engine version are fixed', () => {
  assert.equal(base.schema, 'dimpro.energy-geometry.v0.7.1');
  assert.equal(base.engineVersion, '0.7.1');
});

test('sample geometry has conditioned floor and volume', () => {
  assert(base.totals.conditionedFloorAreaSquareMeters > 0);
  assert(base.totals.conditionedVolumeCubicMeters > base.totals.conditionedFloorAreaSquareMeters);
});

test('sample geometry has envelope walls and orientation rows', () => {
  assert(base.wallRows.length > 0);
  assert(base.orientationRows.length > 0);
  assert(base.wallRows.every((row) => row.grossAreaSquareMeters >= row.netAreaSquareMeters));
});

test('area to volume ratio is calculated from envelope and volume', () => {
  const expected = base.totals.thermalEnvelopeAreaSquareMeters / base.totals.conditionedVolumeCubicMeters;
  assert(Math.abs(base.totals.areaToVolumeRatioPerMeter - expected) < 0.00011);
});

test('trace contains wall gross, net, volume, boundaries and A/V rules', () => {
  const rules = new Set(base.trace.map((item) => item.ruleId));
  for (const required of ['GEOM-WALL-GROSS-001','GEOM-WALL-NET-002','GEOM-ROOM-VOLUME-003','GEOM-LOWER-BOUNDARY-004','GEOM-UPPER-PROJECTED-005','GEOM-UPPER-ADJUSTED-006','GEOM-LEVEL-ENVELOPE-007','GEOM-AV-RATIO-008']) assert(rules.has(required), required);
});

test('trace identifiers and numerical outputs are deterministic', () => {
  const second = calculateEnvelopeGeometry(sampleInput());
  assert.deepEqual(second.trace.map((item) => [item.id, item.ruleId, item.value]), base.trace.map((item) => [item.id, item.ruleId, item.value]));
  assert.deepEqual(second.totals, base.totals);
});

test('duplicate envelope wall emits warning and is not double counted', () => {
  const input = sampleInput();
  const source = input.wallSegments.find((wall) => wall.boundaryType === 'external' && input.rooms.find((room) => room.id === wall.roomId)?.heated);
  assert(source);
  const original = calculateEnvelopeGeometry(input);
  const duplicateInput = { ...input, wallSegments: [...input.wallSegments, { ...clone(source), id: `${source.id}-duplicate` }] };
  const duplicate = calculateEnvelopeGeometry(duplicateInput);
  assert(duplicate.validationMessages.some((message) => message.code === 'DUPLICATE_ENVELOPE_WALL'));
  assert.equal(duplicate.totals.grossWallAreaSquareMeters, original.totals.grossWallAreaSquareMeters);
});

test('opening wider than its wall blocks geometry with exact opening', () => {
  const input = sampleInput();
  const segment = input.wallSegments.find((wall) => wall.boundaryType === 'external' && input.rooms.find((room) => room.id === wall.roomId)?.heated);
  assert(segment);
  const opening = {
    id: 'opening-too-wide', levelId: segment.levelId, roomId: segment.roomId, wallSegmentId: segment.id,
    kind: 'window', name: 'Túlméretes tesztablak', widthMeters: 100, heightMeters: 2, sillHeightMeters: 0.9,
    offsetRatio: 0.5, frame: '', glazing: '', uValue: '', shading: '', note: '', createdAt: '', updatedAt: '',
  };
  const result = calculateEnvelopeGeometry({ ...input, wallOpenings: [...input.wallOpenings, opening] });
  assert.equal(result.blocked, true);
  const message = result.validationMessages.find((item) => item.code === 'OPENING_WIDER_THAN_WALL');
  assert(message?.message.includes('Túlméretes tesztablak'));
});

test('opening total larger than wall blocks geometry', () => {
  const input = sampleInput();
  const segment = input.wallSegments.find((wall) => wall.boundaryType === 'external' && input.rooms.find((room) => room.id === wall.roomId)?.heated);
  const room = input.rooms.find((item) => item.id === segment.roomId);
  assert(segment && room);
  const width = Math.max(0.1, (segment.endRatio - segment.startRatio) * (room.lengthMeters || 10) / 2);
  const openings = [1,2,3].map((index) => ({
    id: `opening-area-${index}`, levelId: segment.levelId, roomId: segment.roomId, wallSegmentId: segment.id,
    kind: 'window', name: `Felületi tesztablak ${index}`, widthMeters: width, heightMeters: room.height,
    sillHeightMeters: 0, offsetRatio: index / 4, frame: '', glazing: '', uValue: '', shading: '', note: '', createdAt: '', updatedAt: '',
  }));
  const result = calculateEnvelopeGeometry({ ...input, wallOpenings: openings });
  assert(result.validationMessages.some((item) => item.code === 'OPENING_AREA_EXCEEDS_WALL'));
  assert.equal(result.blocked, true);
});

test('room overlap blocks geometry and names both rooms', () => {
  const input = sampleInput();
  const first = input.rooms[0];
  const second = { ...clone(input.rooms[1]), x: first.x + 10, y: first.y + 10 };
  const result = calculateEnvelopeGeometry({ ...input, rooms: input.rooms.map((room) => room.id === second.id ? second : room) });
  const message = result.validationMessages.find((item) => item.code === 'ROOM_OVERLAP');
  assert.equal(result.blocked, true);
  assert(message?.message.includes(first.name));
  assert(message?.message.includes(second.name));
});

test('no heated room blocks geometry', () => {
  const input = sampleInput();
  const result = calculateEnvelopeGeometry({ ...input, rooms: input.rooms.map((room) => ({ ...room, heated: false })) });
  assert(result.validationMessages.some((item) => item.code === 'NO_CONDITIONED_ROOM'));
  assert.equal(result.blocked, true);
});

test('zero room height blocks geometry with room name', () => {
  const input = sampleInput();
  const room = { ...input.rooms[0], height: 0 };
  const result = calculateEnvelopeGeometry({ ...input, rooms: input.rooms.map((item) => item.id === room.id ? room : item) });
  const message = result.validationMessages.find((item) => item.code === 'ROOM_HEIGHT_INVALID');
  assert(message?.message.includes(room.name));
});

test('fully aligned heated levels exclude internal floor and ceiling projection', () => {
  const ground = createGroundLevel();
  const floor = { ...ground, id: 'level-floor-test', name: '1. emelet', shortName: '1.E', kind: 'floor', order: 1, elevationMeters: 3 };
  const roomBase = { id: 'room-ground-test', levelId: ground.id, name: 'Földszinti zóna', function: 'Lakótér', area: 40, height: 2.7, x: 100, y: 100, width: 400, depth: 300, lengthMeters: 8, widthMeters: 5, heated: true, externalWallType: '', floorType: '', ceilingType: '', windowCount: 0, windowType: '', orientation: '', note: '' };
  const roomTop = { ...roomBase, id: 'room-floor-test', levelId: floor.id, name: 'Emeleti zóna' };
  const result = calculateEnvelopeGeometry({ rooms: [roomBase, roomTop], levels: [ground, floor], wallSegments: [], wallOpenings: [], sectionLines: [], northAngle: 0, calculatedAt: '2026-07-29T08:00:00.000Z' });
  const groundRow = result.levelRows.find((row) => row.levelId === ground.id);
  const floorRow = result.levelRows.find((row) => row.levelId === floor.id);
  assert.equal(groundRow.upperBoundaryProjectedAreaSquareMeters, 0);
  assert.equal(floorRow.lowerBoundaryAreaSquareMeters, 0);
  assert.equal(groundRow.lowerBoundaryAreaSquareMeters, 40);
  assert.equal(floorRow.upperBoundaryProjectedAreaSquareMeters, 40);
});

test('padlásfödém remains horizontal even when a section exists', () => {
  const input = sampleInput();
  const rooms = input.rooms.map((room) => ({ ...room, ceilingType: 'Padlásfödém' }));
  const section = { id:'section-flat-test', levelId:input.levels[0].id, serial:'A-A', name:'A-A', kind:'attic', x1:0,y1:0,x2:100,y2:0,roofShape:'gable',floorElevationMeters:0,clearHeightMeters:2.7,floorSlabThicknessCm:15,ceilingSlabThicknessCm:18,eavesHeightMeters:2.8,ridgeHeightMeters:5,topSurfaceHeightMeters:5,leftKneeWallHeightMeters:1,rightKneeWallHeightMeters:1,leftRoofPitchDegrees:45,rightRoofPitchDegrees:45,roofWindowCount:1,roofWindowSide:'right',roofWindowWidthMeters:0.8,roofWindowHeightMeters:1.2,roofWindowSillHeightMeters:1.1,note:'',createdAt:'',updatedAt:'' };
  const result = calculateEnvelopeGeometry({ ...input, rooms, sectionLines:[section] });
  assert.equal(result.levelRows[0].roofSlopeFactor, 1);
});

test('attic level applies roof slope factor and roof opening area', () => {
  const input = sampleInput();
  const level = { ...input.levels[0], kind: 'attic', name: 'Tetőtér' };
  const section = { id:'section-attic-test', levelId:level.id, serial:'A-A', name:'A-A tetőmetszet', kind:'attic', x1:0,y1:0,x2:100,y2:0,roofShape:'gable',floorElevationMeters:0,clearHeightMeters:2.7,floorSlabThicknessCm:15,ceilingSlabThicknessCm:18,eavesHeightMeters:2.8,ridgeHeightMeters:5,topSurfaceHeightMeters:5,leftKneeWallHeightMeters:1,rightKneeWallHeightMeters:1,leftRoofPitchDegrees:45,rightRoofPitchDegrees:45,roofWindowCount:2,roofWindowSide:'right',roofWindowWidthMeters:0.8,roofWindowHeightMeters:1.2,roofWindowSillHeightMeters:1.1,note:'',createdAt:'',updatedAt:'' };
  const result = calculateEnvelopeGeometry({ ...input, levels:[level], rooms:input.rooms.map((room)=>({...room,levelId:level.id,ceilingType:'Tetősík'})), wallSegments:input.wallSegments.map((wall)=>({...wall,levelId:level.id})), sectionLines:[section] });
  assert(result.levelRows[0].roofSlopeFactor > 1);
  assert(result.levelRows[0].upperBoundaryAdjustedAreaSquareMeters > result.levelRows[0].upperBoundaryProjectedAreaSquareMeters);
  assert(result.levelRows[0].roofOpeningAreaSquareMeters > 0);
});

test('custom attic roof emits approximation warning', () => {
  const input = sampleInput();
  const level = { ...input.levels[0], kind: 'attic' };
  const section = { id:'section-custom-test', levelId:level.id, serial:'A-A', name:'Egyedi tetőmetszet', kind:'custom', x1:0,y1:0,x2:100,y2:0,roofShape:'custom',floorElevationMeters:0,clearHeightMeters:2.7,floorSlabThicknessCm:15,ceilingSlabThicknessCm:18,eavesHeightMeters:2.8,ridgeHeightMeters:5,topSurfaceHeightMeters:5,leftKneeWallHeightMeters:1,rightKneeWallHeightMeters:1,leftRoofPitchDegrees:30,rightRoofPitchDegrees:30,roofWindowCount:0,roofWindowSide:'none',roofWindowWidthMeters:0,roofWindowHeightMeters:0,roofWindowSillHeightMeters:0,note:'',createdAt:'',updatedAt:'' };
  const result = calculateEnvelopeGeometry({ ...input, levels:[level], rooms:input.rooms.map((room)=>({...room,levelId:level.id})), wallSegments:input.wallSegments.map((wall)=>({...wall,levelId:level.id})), sectionLines:[section] });
  assert(result.validationMessages.some((message) => message.code === 'CUSTOM_ROOF_AREA_APPROXIMATION'));
});

test('blank survey without geometry is blocked, not silently zero-valid', () => {
  const draft = createBlankSurveyDraft();
  const result = calculateEnvelopeGeometry({ rooms:draft.rooms, levels:draft.levels, wallSegments:draft.wallSegments, wallOpenings:draft.wallOpenings, sectionLines:draft.sectionLines, northAngle:draft.northAngle });
  assert.equal(result.valid, false);
  assert.equal(result.blocked, true);
});

console.log(JSON.stringify({ ok:true, testCount:tests.length, tests, sample:{ valid:base.valid, wallRows:base.wallRows.length, orientationRows:base.orientationRows.length, levelRows:base.levelRows.length, trace:base.trace.length, totals:base.totals, validationMessages:base.validationMessages } }, null, 2));
