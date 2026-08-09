const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');
const ts = require('typescript');
const root = path.resolve(__dirname, '..');
const originalResolveFilename = Module._resolveFilename;
Module._resolveFilename = function(request, parent, isMain, options) { if (request.startsWith('@/')) request = path.join(root, request.slice(2)); return originalResolveFilename.call(this, request, parent, isMain, options); };
require.extensions['.ts'] = function(module, filename) { const source = fs.readFileSync(filename, 'utf8'); const output = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true, resolveJsonModule: true }, fileName: filename }).outputText; module._compile(output, filename); };

const workspaceModel = require('../components/property-survey/propertySurveyWorkspaceTypes.ts');
const zoneModel = require('../components/energy/domain/energyZoneTypes.ts');
const { calculateEnvelopeGeometry } = require('../components/energy/calculations/geometry/calculateEnvelopeGeometry.ts');
const { calculateEnergyZones } = require('../components/energy/calculations/zones/calculateEnergyZones.ts');

const tests = [];
function test(name, fn) { fn(); tests.push(name); }
function approx(actual, expected, tolerance = 1e-6) { assert(Math.abs(actual - expected) <= tolerance, `${actual} != ${expected}`); }
function fixture() {
  const draft = workspaceModel.createSampleSurveyDraft('Zónateszt');
  const geometry = calculateEnvelopeGeometry({ rooms: draft.rooms, levels: draft.levels, wallSegments: draft.wallSegments, wallOpenings: draft.wallOpenings, sectionLines: draft.sectionLines, northAngle: draft.northAngle, calculatedAt: '2026-07-29T00:00:00.000Z' });
  const calculate = (workspace = draft.energyZoneWorkspace, wallOpenings = draft.wallOpenings, rooms = draft.rooms) => calculateEnergyZones({ workspace, rooms, levels: draft.levels, wallSegments: draft.wallSegments, wallOpenings, geometry, calculatedAt: '2026-07-29T00:00:00.000Z' });
  return { draft, geometry, calculate };
}

test('automatic family-house allocation creates one heated zone', () => {
  const { draft } = fixture();
  assert.equal(draft.energyZoneWorkspace.zones.length, 1);
  assert.equal(Object.keys(draft.energyZoneWorkspace.roomAssignments).length, 6);
});

test('automatic allocation creates one unheated space for the unheated room', () => {
  const { draft } = fixture();
  assert.equal(draft.energyZoneWorkspace.unheatedSpaces.length, 1);
  assert.equal(draft.energyZoneWorkspace.unheatedRoomAssignments['room-utility'], draft.energyZoneWorkspace.unheatedSpaces[0].id);
});

test('zone result schema and engine version are stable', () => {
  const result = fixture().calculate();
  assert.equal(result.schema, 'dimpro.energy-zone-set.v0.7.3');
  assert.equal(result.engineVersion, '0.7.3');
  assert.equal(result.sourceReferenceId, 'HU-EKM-ZONE-BOUNDARIES-1.7.5-1.7.6');
});

test('single-zone conditioned floor area is correct', () => {
  const result = fixture().calculate();
  approx(result.totals.conditionedFloorAreaSquareMeters, 77.5);
  assert.equal(result.totals.assignedConditionedRoomCount, 6);
});

test('single-zone conditioned volume is correct', () => {
  const result = fixture().calculate();
  approx(result.totals.conditionedVolumeCubicMeters, 208.35);
});

test('unheated space area and volume are correct', () => {
  const result = fixture().calculate();
  assert.equal(result.unheatedSpaces.length, 1);
  approx(result.unheatedSpaces[0].floorAreaSquareMeters, 7.1);
  approx(result.unheatedSpaces[0].volumeCubicMeters, 19.17);
});

test('heated-to-unheated shared wall is detected', () => {
  const result = fixture().calculate();
  assert(result.connections.some((connection) => connection.kind === 'zoneToUnheatedSpace' && connection.adjacentRoomId === 'room-utility'));
  assert(result.totals.unheatedBoundaryAreaSquareMeters > 0);
});

test('shared wall is deduplicated', () => {
  const result = fixture().calculate();
  const utilityConnections = result.connections.filter((connection) => connection.kind === 'zoneToUnheatedSpace' && (connection.sourceRoomId === 'room-utility' || connection.adjacentRoomId === 'room-utility'));
  const keys = new Set(utilityConnections.map((connection) => `${connection.levelId}:${connection.netAreaSquareMeters}:${[connection.sourceRoomId, connection.adjacentRoomId].sort().join(':')}`));
  assert.equal(keys.size, utilityConnections.length);
});

test('opening area is subtracted from zone boundary', () => {
  const { draft, calculate } = fixture();
  const segment = draft.wallSegments.find((wall) => wall.roomId === 'room-bath' && wall.adjacentRoomId === 'room-utility');
  assert(segment, 'A fürdő–gépészet falszakasz hiányzik.');
  const base = calculate();
  const before = base.connections.find((connection) => connection.wallSegmentId === segment.id);
  assert(before);
  const opening = { id:'zone-opening', levelId:segment.levelId, roomId:segment.roomId, wallSegmentId:segment.id, kind:'door', name:'Ajtó', widthMeters:1, heightMeters:2, sillHeightMeters:0, offsetRatio:0.5, frame:'', glazing:'', uValue:'', shading:'', note:'', createdAt:'2026-07-29', updatedAt:'2026-07-29' };
  const after = calculate(draft.energyZoneWorkspace, [opening]).connections.find((connection) => connection.wallSegmentId === segment.id);
  assert(after);
  approx(before.netAreaSquareMeters - after.netAreaSquareMeters, 2);
});

test('second zone produces an interzone boundary', () => {
  const { draft, calculate } = fixture();
  const second = zoneModel.createEnergyZone({ id:'zone-2', name:'Nappali zóna' });
  const workspace = { ...draft.energyZoneWorkspace, zones:[...draft.energyZoneWorkspace.zones, second], roomAssignments:{ ...draft.energyZoneWorkspace.roomAssignments, 'room-living':'zone-2' } };
  const result = calculate(workspace);
  assert(result.connections.some((connection) => connection.kind === 'zoneToZone'));
  assert(result.totals.interzoneBoundaryAreaSquareMeters > 0);
});

test('multi-zone floor areas sum to total conditioned area', () => {
  const { draft, calculate } = fixture();
  const second = zoneModel.createEnergyZone({ id:'zone-2', name:'Nappali zóna' });
  const workspace = { ...draft.energyZoneWorkspace, zones:[...draft.energyZoneWorkspace.zones, second], roomAssignments:{ ...draft.energyZoneWorkspace.roomAssignments, 'room-living':'zone-2' } };
  const result = calculate(workspace);
  approx(result.zones.reduce((sum, zone) => sum + zone.floorAreaSquareMeters, 0), 77.5);
  assert.equal(result.zones.length, 2);
});

test('interzone boundary does not appear for rooms in the same zone', () => {
  const result = fixture().calculate();
  assert.equal(result.connections.some((connection) => connection.kind === 'zoneToZone'), false);
  assert.equal(result.totals.interzoneBoundaryAreaSquareMeters, 0);
});

test('heated room without zone is blocking', () => {
  const { draft, calculate } = fixture();
  const assignments = { ...draft.energyZoneWorkspace.roomAssignments };
  delete assignments['room-living'];
  const result = calculate({ ...draft.energyZoneWorkspace, roomAssignments: assignments });
  assert.equal(result.blocked, true);
  assert(result.validationMessages.some((message) => message.code === 'HEATED_ROOM_UNASSIGNED' && message.roomId === 'room-living'));
});

test('unheated room without unheated space is warning only', () => {
  const { draft, calculate } = fixture();
  const result = calculate({ ...draft.energyZoneWorkspace, unheatedRoomAssignments:{} });
  assert(result.validationMessages.some((message) => message.code === 'UNHEATED_ROOM_UNASSIGNED'));
  assert.equal(result.validationMessages.find((message) => message.code === 'UNHEATED_ROOM_UNASSIGNED').blocking, false);
});

test('unheated room assigned to heated zone is blocking', () => {
  const { draft, calculate } = fixture();
  const zoneId = draft.energyZoneWorkspace.zones[0].id;
  const result = calculate({ ...draft.energyZoneWorkspace, roomAssignments:{ ...draft.energyZoneWorkspace.roomAssignments, 'room-utility':zoneId } });
  assert(result.validationMessages.some((message) => message.code === 'UNHEATED_ROOM_ASSIGNED_TO_ZONE' && message.blocking));
});

test('heated room assigned to unheated space is blocking', () => {
  const { draft, calculate } = fixture();
  const spaceId = draft.energyZoneWorkspace.unheatedSpaces[0].id;
  const result = calculate({ ...draft.energyZoneWorkspace, unheatedRoomAssignments:{ ...draft.energyZoneWorkspace.unheatedRoomAssignments, 'room-living':spaceId } });
  assert(result.validationMessages.some((message) => message.code === 'HEATED_ROOM_ASSIGNED_TO_UNHEATED_SPACE' && message.blocking));
});

test('double assignment is blocking', () => {
  const { draft, calculate } = fixture();
  const spaceId = draft.energyZoneWorkspace.unheatedSpaces[0].id;
  const result = calculate({ ...draft.energyZoneWorkspace, unheatedRoomAssignments:{ ...draft.energyZoneWorkspace.unheatedRoomAssignments, 'room-living':spaceId } });
  assert(result.validationMessages.some((message) => message.code === 'ROOM_DOUBLE_ASSIGNED'));
});

test('missing target zone is blocking', () => {
  const { draft, calculate } = fixture();
  const result = calculate({ ...draft.energyZoneWorkspace, roomAssignments:{ ...draft.energyZoneWorkspace.roomAssignments, 'room-living':'missing-zone' } });
  assert(result.validationMessages.some((message) => message.code === 'ASSIGNMENT_TARGET_MISSING' && message.blocking));
});

test('empty zone is a visible non-blocking warning', () => {
  const { draft, calculate } = fixture();
  const second = zoneModel.createEnergyZone({ id:'zone-empty', name:'Üres zóna' });
  const result = calculate({ ...draft.energyZoneWorkspace, zones:[...draft.energyZoneWorkspace.zones, second] });
  assert(result.validationMessages.some((message) => message.code === 'ZONE_EMPTY' && message.zoneId === 'zone-empty' && !message.blocking));
});

test('manual unheated temperature creates review warning', () => {
  const { draft, calculate } = fixture();
  const space = { ...draft.energyZoneWorkspace.unheatedSpaces[0], temperatureSource:'manual', designTemperatureC:8 };
  const result = calculate({ ...draft.energyZoneWorkspace, unheatedSpaces:[space] });
  assert(result.validationMessages.some((message) => message.code === 'MANUAL_UNHEATED_TEMPERATURE_REVIEW'));
});

test('zone trace contains floor, volume, external wall and unheated boundary rules', () => {
  const result = fixture().calculate();
  const rules = new Set(result.trace.map((trace) => trace.ruleId));
  for (const rule of ['ZONE-FLOOR-AREA-001','ZONE-VOLUME-002','ZONE-EXTERNAL-WALL-003','ZONE-UNHEATED-BOUNDARY-004']) assert(rules.has(rule), `Hiányzó szabály: ${rule}`);
});

test('old project without zone workspace migrates automatically', () => {
  const { draft } = fixture();
  const migrated = zoneModel.normalizeEnergyZoneWorkspace(undefined, draft.rooms);
  assert.equal(migrated.zones.length, 1);
  assert.equal(Object.keys(migrated.roomAssignments).length, 6);
  assert.equal(Object.keys(migrated.unheatedRoomAssignments).length, 1);
});

test('existing zoned project keeps newly added room unassigned', () => {
  const { draft } = fixture();
  const newRoom = { ...draft.rooms[0], id:'room-new', name:'Új szoba' };
  const normalized = zoneModel.normalizeEnergyZoneWorkspace(draft.energyZoneWorkspace, [...draft.rooms, newRoom]);
  assert.equal(normalized.roomAssignments['room-new'], undefined);
});

test('deleted rooms and missing targets are removed during normalization', () => {
  const { draft } = fixture();
  const workspace = { ...draft.energyZoneWorkspace, roomAssignments:{ ...draft.energyZoneWorkspace.roomAssignments, ghost:'missing-zone' } };
  const normalized = zoneModel.normalizeEnergyZoneWorkspace(workspace, draft.rooms);
  assert.equal(normalized.roomAssignments.ghost, undefined);
});

test('project draft normalization creates v0.7.3 zone workspace', () => {
  const draft = workspaceModel.createSampleSurveyDraft('Normalizálás');
  const legacy = { ...draft };
  delete legacy.energyZoneWorkspace;
  const normalized = workspaceModel.normalizePropertySurveyDraft(legacy, 'project-zone-test');
  assert.equal(normalized.energyZoneWorkspace.schemaVersion, 1);
  assert.equal(Object.keys(normalized.energyZoneWorkspace.roomAssignments).length, 6);
});

const result = fixture().calculate();
console.log(JSON.stringify({ ok:true, testCount:tests.length, tests, sample:{ schema:result.schema, zones:result.totals.zoneCount, conditionedArea:result.totals.conditionedFloorAreaSquareMeters, conditionedVolume:result.totals.conditionedVolumeCubicMeters, unheatedSpaces:result.totals.unheatedSpaceCount, unheatedBoundary:result.totals.unheatedBoundaryAreaSquareMeters, connections:result.connections.length, trace:result.trace.length }, sourceReferenceId:result.sourceReferenceId, checkedAt:result.sourceCheckedAt }, null, 2));
