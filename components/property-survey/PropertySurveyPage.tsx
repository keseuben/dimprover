"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  BatteryCharging,
  Columns2,
  Bluetooth,
  Building2,
  Camera,
  Check,
  CheckCircle2,
  ClipboardCheck,
  ClipboardList,
  Compass,
  Download,
  FileOutput,
  Flame,
  Factory,
  FolderKanban,
  Gauge,
  Layers3,
  Map as MapIcon,
  MapPinned,
  Maximize2,
  Menu,
  Minimize2,
  Moon,
  PanelLeftOpen,
  PanelTop,
  PanelRightOpen,
  Pin,
  Move,
  PencilRuler,
  Plus,
  Ruler,
  Save,
  ScanLine,
  Sun,
  Trash2,
  WifiOff,
  X,
} from "lucide-react";
import { SurveyFloorPlanEngine, type SurveyRoom } from "@/components/viewers/SurveyFloorPlanEngine";
import { PropertySurveyIssuesPanel } from "@/components/property-survey/PropertySurveyIssuesPanel";
import {
  createPropertySurveyIssue,
  type PropertySurveyIssue,
  type PropertySurveyIssuePlacementMode,
} from "@/components/property-survey/propertySurveyIssueTypes";
import { PropertySurveyProjectCenter } from "@/components/property-survey/PropertySurveyProjectCenter";
import { PropertySurveyPlanDocumentWorkspace } from "@/components/property-survey/PropertySurveyPlanDocumentWorkspace";
import {
  applyManagedSurveyPlanEnergyTransfer,
  removeSurveyPlanEnergyTransfer,
  type ManagedSurveyPlanTransferResult,
  type SurveyPlanTransferConflictStrategy,
  type SurveyPlanTransferRemovalResult,
} from "@/components/property-survey/propertySurveyPlanTransferOperations";
import { acknowledgeSurveyPlanModelChanges } from "@/components/property-survey/propertySurveyPlanTransferRegistry";
import {
  applySurveyPlanVersionModelApplication,
  rollbackSurveyPlanVersionModelApplication,
  type SurveyPlanVersionModelApplicationResult,
} from "@/components/property-survey/propertySurveyPlanVersionModelApplication";
import { surveySourceModeLabels, type PropertySurveySourceMode, type SurveyPlanPage, type SurveyPlanSuggestion } from "@/components/property-survey/propertySurveyPlanDocumentTypes";
import { PropertySurveyMeasurementPanel } from "@/components/property-survey/PropertySurveyMeasurementPanel";
import { PropertySurveyPlanToolbar } from "@/components/property-survey/PropertySurveyPlanToolbar";
import { PropertySurveyOpeningPanel } from "@/components/property-survey/PropertySurveyOpeningPanel";
import { PropertySurveyStructuresPanel } from "@/components/property-survey/PropertySurveyStructuresPanel";
import { PropertySurveyEnergyWorkspace, energyWorkspaceTabs, type EnergyWorkspaceTab } from "@/components/property-survey/energy/PropertySurveyEnergyWorkspace";
import { EnergyWorkspaceQuickCards, EnergyWorkspaceSummaryBoard, type EnergyCentralViewMode } from "@/components/property-survey/energy/EnergyWorkspaceSummaryBoard";
import { PropertySurveyWorkTimer } from "@/components/property-survey/PropertySurveyWorkTimer";
import { EnergyRenewablePanel } from "@/components/property-survey/energy/EnergyRenewablePanel";
import { EnergyRenovationPanel } from "@/components/property-survey/energy/EnergyRenovationPanel";
import { getEnergySettingsReadiness, type EnergyProjectSettings } from "@/components/energy/domain/energyProjectTypes";
import { calculateEnvelopeGeometry } from "@/components/energy/calculations/geometry/calculateEnvelopeGeometry";
import { calculateAssemblySet } from "@/components/energy/calculations/assemblies/calculateAssemblySet";
import { calculateEnergyZones } from "@/components/energy/calculations/zones/calculateEnergyZones";
import { calculateEnergyOpenings } from "@/components/energy/calculations/openings/calculateEnergyOpenings";
import { calculateEnergyDemand } from "@/components/energy/calculations/demand/calculateEnergyDemand";
import { calculateEnergyRenewableSizing } from "@/components/energy/calculations/renewables/calculateRenewableSizing";
import { buildRenovationSuggestions } from "@/components/energy/calculations/renovation/buildRenovationSuggestions";
import { calculateRenovationComparison } from "@/components/energy/calculations/renovation/calculateRenovationComparison";
import type { EnergyWorkspaceMode } from "@/components/energy/domain/energyFieldWorkflowTypes";
import type { EnergyRenovationWorkspace } from "@/components/energy/domain/energyRenovationTypes";
import type { EnergyRenewableWorkspace } from "@/components/energy/domain/energyRenewableTypes";
import { normalizeEnergyDemandWorkspace, type EnergyDemandWorkspace } from "@/components/energy/domain/energyDemandTypes";
import { createEnergyOpeningDetail, normalizeEnergyOpeningWorkspace, type EnergyOpeningDetail, type EnergyOpeningWorkspace } from "@/components/energy/domain/energyOpeningTypes";
import { huEkm20231101AssemblyRuleData } from "@/components/energy/regulations/HU_EKM_2023_11_01/factors";
import { propertySurveyEnergyFeatureFlags } from "@/components/energy/domain/energyFeatureFlags";
import { PropertySurveyPhotoPanel } from "@/components/property-survey/PropertySurveyPhotoPanel";
import { PropertySurveyMechanicalPanel } from "@/components/property-survey/PropertySurveyMechanicalPanel";
import { PropertySurveyIndustrialPanel } from "@/components/property-survey/PropertySurveyIndustrialPanel";
import { PropertySurveySectionPanel } from "@/components/property-survey/PropertySurveySectionPanel";
import { getIndustrialBackgroundPagePatch, processIndustrialBackgroundFile } from "@/components/property-survey/propertySurveyIndustrialBackground";
import {
  createIndustrialBuildingContour,
  createIndustrialDxf,
  createIndustrialMarkup,
  createSurveyPillar,
  createSurveyPillarGrid,
  deleteIndustrialPoint,
  getIndustrialSummary,
  insertIndustrialPoint,
  snapIndustrialPoint,
  type SurveyIndustrialBackground,
  type SurveyIndustrialBuildingContour,
  type SurveyIndustrialMarkup,
  type SurveyIndustrialMarkupKind,
  type SurveyIndustrialPoint,
  type SurveyIndustrialSettings,
  type SurveyIndustrialTool,
  type SurveyPillar,
  type SurveyPillarGridInput,
} from "@/components/property-survey/propertySurveyIndustrialModel";
import { HoldActionButton } from "@/components/property-survey/HoldActionButton";
import {
  getSurveyDimensionSourceLabel,
  parseSurveyMeasurement,
  resolveSurveyRoomDimensions,
  roundSurveyMeasurement,
  surveyMetersToPlanUnits,
  type SurveyRoomDimensionSource,
  type SurveyRoomDimensionTarget,
} from "@/components/property-survey/propertySurveyRoomDimensions";
import {
  DIMPRO_PROPERTY_MEASUREMENT_EVENT,
  type PropertySurveyMeasurementDetail,
} from "@/components/property-survey/propertySurveyMeasurementBridge";
import {
  calculateExternalWallLengthSummary,
  detectSurveyRoomOverlaps,
  createBuildingModelId,
  createSurveyLevel,
  getRecommendedSurveyScale,
  getWallSegmentLengthMeters,
  reconcileDynamicWallModelForRooms,
  splitWallSegment,
  surveyOpeningKindLabels,
  surveyWallBoundaryLabels,
  surveyWallSideLabels,
  type SurveyPaperOrientation,
  type SurveyPaperSize,
  type SurveyPlanSheetSettings,
  type SurveyWallOpening,
  type SurveyWallSegment,
} from "@/components/property-survey/propertySurveyBuildingModel";
import {
  createDefaultThermalBoundary,
  createMechanicalDevice,
  createSurveyPhotoPoint,
  getRoomUsableHeight,
  type SurveyConstructionAssembly,
  type SurveyMechanicalKind,
  type SurveyMechanicalPlacementMode,
  type SurveyPhotoPlacementMode,
  type SurveyPhotoPoint,
  type SurveyThermalBoundarySettings,
} from "@/components/property-survey/propertySurveyEnergyModel";
import {
  createSurveySectionLine,
  getSurveySectionInternalWallPositions,
  getSurveySectionLengthMeters,
  type SurveySectionDrawingConstraint,
  type SurveySectionLine,
} from "@/components/property-survey/propertySurveySectionModel";
import {
  calculateSurveyEnergySummary,
  createWinWattCompatibleCsv,
  createWinWattCompatiblePackage,
} from "@/components/property-survey/propertySurveyEnergyCalculations";
import { createSurveyBuildingVectorPdf } from "@/components/property-survey/propertySurveyBuildingPdf";
import { buildPropertySurveyExpertTables } from "@/components/property-survey/propertySurveyExpertTables";
import { createWinWattTransferWorkbookBlob } from "@/components/property-survey/propertySurveyWinWattWorkbook";
import { createWinWattTrialPackageBlob } from "@/components/property-survey/propertySurveyWinWattTrialPackage";
import { buildWinWattFieldMap } from "@/components/energy/transfers/winwatt/buildWinWattFieldMap";
import { buildWinWattTrialFeedback } from "@/components/energy/transfers/winwatt/buildWinWattTrialFeedback";
import type { WinWattTrialMetricSeed } from "@/components/energy/domain/energyWinWattTrialTypes";
import { getSurveyCertificatePhotoSummary } from "@/components/property-survey/propertySurveyPhotoExport";

import {
  LEGACY_ISSUE_KEY,
  LEGACY_SURVEY_KEY,
  PROPERTY_SURVEY_WORKSPACE_KEY,
  composePropertySurveyAddress,
  createBlankSurveyDraft,
  createEmptyPropertySurveyWorkspace,
  createPropertySurveyProject,
  createPropertySurveyRecord,
  createWorkspaceId,
  normalizePropertySurveyDraft,
  type PropertySurveyDraft,
  type PropertySurveyMode,
  type PropertySurveyRecord,
  type PropertySurveyStartMode,
  type PropertySurveyWorkspace,
} from "@/components/property-survey/propertySurveyWorkspaceTypes";
import { getHungarianSettlementsByPostalCode, normalizeHungarianPostalCode } from "@/components/property-survey/hungarianPostalCodes";
import {
  createSurveyPlanDxf,
  downloadSurveyBlob,
  getSurveyExportFileBase,
} from "@/components/property-survey/propertySurveyExport";
import {
  getSurveyThermalBoundarySegments,
  getSurveyThermalBoundarySummary,
} from "@/components/property-survey/propertySurveyThermalBoundary";

type SurveyStepId = "property" | "planDocument" | "plan" | "section" | "structures" | "energy" | "openings" | "industrial" | "mechanical" | "renewables" | "renovation" | "photos" | "issues" | "check" | "export";
type IndustrialHistorySnapshot = {
  industrialSettings: SurveyIndustrialSettings;
  industrialBackground: SurveyIndustrialBackground | null;
  industrialBuildingContours: SurveyIndustrialBuildingContour[];
  pillars: SurveyPillar[];
  industrialMarkups: SurveyIndustrialMarkup[];
};

type ThemeMode = "light" | "dark" | "sun";

const THEME_STORAGE_KEY = `${PROPERTY_SURVEY_WORKSPACE_KEY}-theme`;
const PROPERTY_SURVEY_VERSION_HISTORY_KEY = `${PROPERTY_SURVEY_WORKSPACE_KEY}-versions`;
const ENERGY_CENTRAL_VIEW_KEY = `${PROPERTY_SURVEY_WORKSPACE_KEY}-energy-central-view`;

type PropertySurveyLocalVersion = {
  id: string;
  surveyId: string;
  revisionNumber: number;
  createdAt: string;
  fileName: string;
  note: string;
  schema: string;
  driveStatus: "local" | "drive-ready";
};

const allSteps: Array<{ id: SurveyStepId; label: string; description: string; icon: typeof Building2 }> = [
  { id: "property", label: "Ingatlan", description: "Cím, HRSZ és alapadatok", icon: Building2 },
  { id: "planDocument", label: "PDF tervlap", description: "Feltöltés, kivágás, lépték és felismerési overlay", icon: FileOutput },
  { id: "plan", label: "Alaprajz", description: "Szintek, lapméret és helyiségméretek", icon: ScanLine },
  { id: "section", label: "Metszet", description: "Magasságok, tetősík és tetőablak", icon: Ruler },
  { id: "structures", label: "Szerkezetek", description: "Fal, padló, pince, födém és tető", icon: Layers3 },
  { id: "openings", label: "Nyílászárók", description: "Ablakok, ajtók, árnyékolás és Uw", icon: Ruler },
  { id: "mechanical", label: "Gépészet", description: "Fűtés, hűtés, HMV és szellőzés", icon: Flame },
  { id: "renewables", label: "Megújuló", description: "PV, napkollektor, akkumulátor és autótöltő", icon: BatteryCharging },
  { id: "photos", label: "Fotók", description: "Helyiséghez kötött dokumentáció", icon: Camera },
  { id: "renovation", label: "Felújítás", description: "Helyszíni javaslatok és változatok", icon: ClipboardList },
  { id: "energy", label: "Szakértői energetika", description: "Motorok, táblák, források és nyomvonal", icon: Gauge },
  { id: "industrial", label: "Csarnokrajz", description: "Pillérek, repedések és térbeton-zónák", icon: Factory },
  { id: "issues", label: "Hibák", description: "Számozott hibapontok és fotók", icon: AlertTriangle },
  { id: "check", label: "Ellenőrzés", description: "Hiányok és bizonytalan adatok", icon: ClipboardCheck },
  { id: "export", label: "Export", description: "PDF, DIMPRO és WinWatt-előkészítés", icon: FileOutput },
];

function FieldLabel({ children }: { children: React.ReactNode }) {
  return <span className="mb-1.5 block text-[10px] font-black uppercase tracking-[0.12em] text-[var(--survey-muted)]">{children}</span>;
}

function StatusBadge({ complete, children }: { complete: boolean; children: React.ReactNode }) {
  return <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.08em] ${complete ? "border-emerald-300 bg-emerald-50 text-emerald-700" : "border-amber-300 bg-amber-50 text-amber-700"}`}>{complete ? <Check size={12} /> : null}{children}</span>;
}

export function PropertySurveyPage() {
  const [theme, setTheme] = useState<ThemeMode>("light");
  const [workspace, setWorkspace] = useState<PropertySurveyWorkspace>(createEmptyPropertySurveyWorkspace);
  const [workspaceReady, setWorkspaceReady] = useState(false);
  const [projectCenterOpen, setProjectCenterOpen] = useState(true);
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null);
  const [activeSurveyId, setActiveSurveyId] = useState<string | null>(null);
  const [draft, setDraft] = useState<PropertySurveyDraft>(() => createBlankSurveyDraft());
  const [activeStep, setActiveStep] = useState<SurveyStepId>("property");
  const [activeRoomId, setActiveRoomId] = useState("");
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [drawingFocusMode, setDrawingFocusMode] = useState(false);
  const [focusLeftOpen, setFocusLeftOpen] = useState(false);
  const [focusRightOpen, setFocusRightOpen] = useState(false);
  const [focusLeftPinned, setFocusLeftPinned] = useState(false);
  const [focusRightPinned, setFocusRightPinned] = useState(false);
  const [energyCentralView, setEnergyCentralView] = useState<EnergyCentralViewMode>("plan");
  const [energyWorkspaceTab, setEnergyWorkspaceTab] = useState<EnergyWorkspaceTab>("settings");
  const focusLeftPinnedRef = useRef(false);
  const focusRightPinnedRef = useRef(false);
  const [focusPlanOpen, setFocusPlanOpen] = useState(false);
  const [orientationControlsOpen, setOrientationControlsOpen] = useState(false);
  const [exportState, setExportState] = useState<"idle" | "working" | "done" | "error">("idle");
  const [exportMessage, setExportMessage] = useState("Nincs folyamatban export");
  const [lastExportAt, setLastExportAt] = useState<string | null>(null);
  const dimproImportRef = useRef<HTMLInputElement | null>(null);
  const focusRootRef = useRef<HTMLElement | null>(null);
  const [saveState, setSaveState] = useState<"saved" | "dirty">("saved");
  const [deviceInfoOpen, setDeviceInfoOpen] = useState(false);
  const [issues, setIssues] = useState<PropertySurveyIssue[]>([]);
  const [activeIssueId, setActiveIssueId] = useState<string | null>(null);
  const [issuePlacementMode, setIssuePlacementMode] = useState<PropertySurveyIssuePlacementMode>(null);
  const [roomDrawingMode, setRoomDrawingMode] = useState(false);
  const [sectionDrawingMode, setSectionDrawingMode] = useState(false);
  const [sectionDrawingConstraint, setSectionDrawingConstraint] = useState<SurveySectionDrawingConstraint>("free");
  const [activeSectionLineId, setActiveSectionLineId] = useState<string | null>(null);
  const [localVersions, setLocalVersions] = useState<PropertySurveyLocalVersion[]>([]);
  const [versionNote, setVersionNote] = useState("");
  const [measurementTarget, setMeasurementTarget] = useState<SurveyRoomDimensionTarget | null>(null);
  const [measurementWaiting, setMeasurementWaiting] = useState(false);
  const [lastMeasurement, setLastMeasurement] = useState<{ valueMeters: number; target: SurveyRoomDimensionTarget; source: SurveyRoomDimensionSource; deviceName?: string; measuredAt: string } | null>(null);
  const [activeWallSegmentId, setActiveWallSegmentId] = useState<string | null>(null);
  const [activeOpeningId, setActiveOpeningId] = useState<string | null>(null);
  const [activePhotoId, setActivePhotoId] = useState<string | null>(null);
  const [photoPlacementMode, setPhotoPlacementMode] = useState<SurveyPhotoPlacementMode>(null);
  const [activeMechanicalDeviceId, setActiveMechanicalDeviceId] = useState<string | null>(null);
  const [mechanicalPlacementMode, setMechanicalPlacementMode] = useState<SurveyMechanicalPlacementMode>(null);
  const [pendingMechanicalKind, setPendingMechanicalKind] = useState<SurveyMechanicalKind>("boiler");
  const [industrialTool, setIndustrialTool] = useState<SurveyIndustrialTool>("select");
  const [activeIndustrialBuildingContourId, setActiveIndustrialBuildingContourId] = useState<string | null>(null);
  const [activePillarId, setActivePillarId] = useState<string | null>(null);
  const [activeIndustrialMarkupId, setActiveIndustrialMarkupId] = useState<string | null>(null);
  const [activeIndustrialPointIndex, setActiveIndustrialPointIndex] = useState<number | null>(null);
  const industrialUndoRef = useRef<IndustrialHistorySnapshot[]>([]);
  const industrialRedoRef = useRef<IndustrialHistorySnapshot[]>([]);
  const industrialVectorTransactionRef = useRef<IndustrialHistorySnapshot | null>(null);
  const [industrialHistoryRevision, setIndustrialHistoryRevision] = useState(0);

  function loadSurveyRecord(record: PropertySurveyRecord) {
    const normalizedDraft = normalizePropertySurveyDraft(record.draft, record.projectId);
    const activeLevelRooms = normalizedDraft.rooms.filter((room) => (room.levelId || normalizedDraft.activeLevelId) === normalizedDraft.activeLevelId);
    const activeLevelWalls = normalizedDraft.wallSegments.filter((segment) => segment.levelId === normalizedDraft.activeLevelId);
    setDraft(normalizedDraft);
    setIssues(record.issues || []);
    setActiveSurveyId(record.id);
    setSelectedProjectId(record.projectId);
    setActiveRoomId(activeLevelRooms[0]?.id || "");
    setActiveIssueId(record.issues?.[0]?.id || null);
    setActiveStep(normalizedDraft.planDocumentWorkspace.surveySourceMode !== "site" ? "planDocument" : normalizedDraft.rooms.length ? "property" : "plan");
    setIssuePlacementMode(null);
    setRoomDrawingMode(false);
    setSectionDrawingMode(false);
    setActiveSectionLineId(normalizedDraft.sectionLines.find((line) => line.levelId === normalizedDraft.activeLevelId)?.id || null);
    setMeasurementTarget(null);
    setMeasurementWaiting(false);
    setLastMeasurement(null);
    setActiveWallSegmentId(activeLevelWalls[0]?.id || null);
    setActiveOpeningId(null);
    setActivePhotoId(normalizedDraft.photoPoints.find((point) => point.levelId === normalizedDraft.activeLevelId)?.id || null);
    setPhotoPlacementMode(null);
    setActiveMechanicalDeviceId(normalizedDraft.mechanicalDevices.find((device) => device.levelId === normalizedDraft.activeLevelId)?.id || null);
    setMechanicalPlacementMode(null);
    setIndustrialTool("select");
    setActiveIndustrialBuildingContourId(normalizedDraft.industrialBuildingContours.find((contour) => contour.levelId === normalizedDraft.activeLevelId)?.id || null);
    setActivePillarId(normalizedDraft.pillars.find((pillar) => pillar.levelId === normalizedDraft.activeLevelId)?.id || null);
    setActiveIndustrialMarkupId(normalizedDraft.industrialMarkups.find((markup) => markup.levelId === normalizedDraft.activeLevelId)?.id || null);
    setActiveIndustrialPointIndex(null);
    industrialUndoRef.current = [];
    industrialRedoRef.current = [];
    industrialVectorTransactionRef.current = null;
    setIndustrialHistoryRevision((current) => current + 1);
    setDrawingFocusMode(false);
    setFocusLeftOpen(false);
    setFocusRightOpen(false);
    setFocusLeftPinned(false);
    setFocusRightPinned(false);
    focusLeftPinnedRef.current = false;
    focusRightPinnedRef.current = false;
    setFocusPlanOpen(false);
    setOrientationControlsOpen(false);
    setExportState("idle");
    setExportMessage("Nincs folyamatban export");
    setLastExportAt(null);
    setProjectCenterOpen(false);
    setSaveState("saved");
  }

  useEffect(() => {
    try {
      const storedTheme = window.localStorage.getItem(THEME_STORAGE_KEY);
      if (storedTheme === "dark" || storedTheme === "light" || storedTheme === "sun") setTheme(storedTheme);
      const storedEnergyCentralView = window.localStorage.getItem(ENERGY_CENTRAL_VIEW_KEY);
      if (storedEnergyCentralView === "plan" || storedEnergyCentralView === "data" || storedEnergyCentralView === "split") setEnergyCentralView(storedEnergyCentralView);

      const savedVersions = window.localStorage.getItem(PROPERTY_SURVEY_VERSION_HISTORY_KEY);
      if (savedVersions) {
        const parsedVersions = JSON.parse(savedVersions) as PropertySurveyLocalVersion[];
        if (Array.isArray(parsedVersions)) setLocalVersions(parsedVersions);
      }

      const savedWorkspace = window.localStorage.getItem(PROPERTY_SURVEY_WORKSPACE_KEY);
      if (savedWorkspace) {
        const parsed = JSON.parse(savedWorkspace) as PropertySurveyWorkspace;
        if (parsed?.version === 1 && Array.isArray(parsed.projects) && Array.isArray(parsed.surveys)) {
          const normalizedWorkspace = { ...parsed, surveys: parsed.surveys.map((survey) => ({ ...survey, draft: normalizePropertySurveyDraft(survey.draft, survey.projectId) })) };
          setWorkspace(normalizedWorkspace);
          const selectedProject = normalizedWorkspace.activeProjectId || normalizedWorkspace.projects[0]?.id || null;
          setSelectedProjectId(selectedProject);
          const activeRecord = normalizedWorkspace.surveys.find((survey) => survey.id === normalizedWorkspace.activeSurveyId);
          if (activeRecord) loadSurveyRecord(activeRecord);
          setWorkspaceReady(true);
          return;
        }
      }

      const legacyDraftRaw = window.localStorage.getItem(LEGACY_SURVEY_KEY);
      if (legacyDraftRaw) {
        const legacyDraft = normalizePropertySurveyDraft(JSON.parse(legacyDraftRaw) as PropertySurveyDraft);
        const legacyIssuesRaw = window.localStorage.getItem(LEGACY_ISSUE_KEY);
        const legacyIssues = legacyIssuesRaw ? JSON.parse(legacyIssuesRaw) as PropertySurveyIssue[] : [];
        const now = new Date().toISOString();
        const projectId = createWorkspaceId("property-project-migrated");
        const surveyId = createWorkspaceId("property-survey-migrated");
        const migrated: PropertySurveyWorkspace = {
          version: 1,
          projects: [{ id: projectId, code: "HELYI-001", name: "Korábbi helyi felmérés", location: legacyDraft.property?.settlement || "", clientName: "", note: "Automatikusan átemelve a korábbi egyfelméréses verzióból.", createdAt: now, updatedAt: now }],
          surveys: [{ id: surveyId, projectId, name: legacyDraft.surveyName || "Korábbi ingatlanfelmérés", surveyMode: legacyDraft.surveyMode || "Energetikai felmérés", startMode: legacyDraft.rooms?.length ? "sample" : "blank", status: "in_progress", draft: legacyDraft, issues: Array.isArray(legacyIssues) ? legacyIssues : [], createdAt: now, updatedAt: now }],
          activeProjectId: projectId,
          activeSurveyId: surveyId,
          updatedAt: now,
        };
        window.localStorage.setItem(PROPERTY_SURVEY_WORKSPACE_KEY, JSON.stringify(migrated));
        setWorkspace(migrated);
        setSelectedProjectId(projectId);
        loadSurveyRecord(migrated.surveys[0]);
      }
    } catch {
      setWorkspace(createEmptyPropertySurveyWorkspace());
      setProjectCenterOpen(true);
    } finally {
      setWorkspaceReady(true);
    }
  }, []);

  useEffect(() => {
    if (!workspaceReady) return;
    try {
      window.localStorage.setItem(THEME_STORAGE_KEY, theme);
    } catch {
      // A téma helyi mentése opcionális.
    }
  }, [theme, workspaceReady]);

  useEffect(() => {
    if (!workspaceReady) return;
    try {
      window.localStorage.setItem(ENERGY_CENTRAL_VIEW_KEY, energyCentralView);
    } catch {
      // A központi munkatér nézetének mentése opcionális.
    }
  }, [energyCentralView, workspaceReady]);

  useEffect(() => {
    if (!drawingFocusMode) return;
    function leaveFocusMode() {
      setDrawingFocusMode(false);
      setFocusLeftOpen(false);
      setFocusRightOpen(false);
      setFocusLeftPinned(false);
      setFocusRightPinned(false);
      setFocusPlanOpen(false);
      setOrientationControlsOpen(false);
    }
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") leaveFocusMode();
    }
    function handleFullscreenChange() {
      if (!document.fullscreenElement) leaveFocusMode();
    }
    window.addEventListener("keydown", handleKeyDown);
    document.addEventListener("fullscreenchange", handleFullscreenChange);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      document.removeEventListener("fullscreenchange", handleFullscreenChange);
    };
  }, [drawingFocusMode]);

  useEffect(() => {
    if (!workspaceReady || !activeSurveyId) return;
    const timer = window.setTimeout(() => {
      try {
        const now = new Date().toISOString();
        const nextDraft = { ...draft, updatedAt: now };
        setWorkspace((current) => {
          const next: PropertySurveyWorkspace = {
            ...current,
            activeProjectId: selectedProjectId,
            activeSurveyId,
            updatedAt: now,
            surveys: current.surveys.map((survey) => survey.id === activeSurveyId ? {
              ...survey,
              name: nextDraft.surveyName,
              surveyMode: nextDraft.surveyMode,
              status: survey.status === "completed" ? "completed" : "in_progress",
              draft: nextDraft,
              issues,
              updatedAt: now,
            } : survey),
          };
          window.localStorage.setItem(PROPERTY_SURVEY_WORKSPACE_KEY, JSON.stringify(next));
          window.localStorage.setItem(LEGACY_SURVEY_KEY, JSON.stringify(nextDraft));
          window.localStorage.setItem(LEGACY_ISSUE_KEY, JSON.stringify(issues));
          return next;
        });
        setSaveState("saved");
      } catch {
        setSaveState("dirty");
      }
    }, 550);
    return () => window.clearTimeout(timer);
  }, [activeSurveyId, draft, issues, selectedProjectId, workspaceReady]);


  useEffect(() => {
    function receiveMeasurement(event: Event) {
      const detail = (event as CustomEvent<PropertySurveyMeasurementDetail>).detail;
      if (!detail || !activeRoomId) return;
      const target = detail.target || measurementTarget;
      const valueMeters = parseSurveyMeasurement(detail.valueMeters);
      if (!target || !valueMeters) return;
      applyRoomMeasurement(target, valueMeters, "bluetooth_bridge", detail.deviceName || "DIMPRO natív bridge", true, detail.measuredAt);
    }
    window.addEventListener(DIMPRO_PROPERTY_MEASUREMENT_EVENT, receiveMeasurement as EventListener);
    return () => window.removeEventListener(DIMPRO_PROPERTY_MEASUREMENT_EVENT, receiveMeasurement as EventListener);
  });

  const activeLevel = draft.levels.find((level) => level.id === draft.activeLevelId) || draft.levels[0];
  const activeRooms = useMemo(() => draft.rooms.filter((room) => (room.levelId || draft.activeLevelId) === draft.activeLevelId), [draft.activeLevelId, draft.rooms]);
  const activeWallSegments = useMemo(() => draft.wallSegments.filter((segment) => segment.levelId === draft.activeLevelId && activeRooms.some((room) => room.id === segment.roomId)), [activeRooms, draft.activeLevelId, draft.wallSegments]);
  const activeWallOpenings = useMemo(() => draft.wallOpenings.filter((opening) => opening.levelId === draft.activeLevelId && activeWallSegments.some((segment) => segment.id === opening.wallSegmentId)), [activeWallSegments, draft.activeLevelId, draft.wallOpenings]);
  const activeRoom = activeRooms.find((room) => room.id === activeRoomId) || activeRooms[0];
  const activeRoomDimensions = resolveSurveyRoomDimensions(activeRoom);
  const activeIssue = issues.find((issue) => issue.id === activeIssueId) || null;
  const activeThermalBoundary = draft.thermalBoundaries.find((item) => item.levelId === draft.activeLevelId) || createDefaultThermalBoundary(draft.activeLevelId);
  const activePhotoPoints = useMemo(() => draft.photoPoints.filter((point) => point.levelId === draft.activeLevelId), [draft.activeLevelId, draft.photoPoints]);
  const activeMechanicalDevices = useMemo(() => draft.mechanicalDevices.filter((device) => device.levelId === draft.activeLevelId), [draft.activeLevelId, draft.mechanicalDevices]);
  const activeIndustrialBuildingContours = useMemo(() => draft.industrialBuildingContours.filter((contour) => contour.levelId === draft.activeLevelId), [draft.activeLevelId, draft.industrialBuildingContours]);
  const activePillars = useMemo(() => draft.pillars.filter((pillar) => pillar.levelId === draft.activeLevelId), [draft.activeLevelId, draft.pillars]);
  const activeIndustrialMarkups = useMemo(() => draft.industrialMarkups.filter((markup) => markup.levelId === draft.activeLevelId), [draft.activeLevelId, draft.industrialMarkups]);
  const activeSectionLines = useMemo(() => draft.sectionLines.filter((line) => line.levelId === draft.activeLevelId), [draft.activeLevelId, draft.sectionLines]);
  const activeSectionLine = draft.sectionLines.find((line) => line.id === activeSectionLineId) || activeSectionLines[0] || null;
  const activePhotoPoint = draft.photoPoints.find((point) => point.id === activePhotoId) || null;
  const activeMechanicalDevice = draft.mechanicalDevices.find((device) => device.id === activeMechanicalDeviceId) || null;
  const activeLevelRoomIds = useMemo(() => new Set(activeRooms.map((room) => room.id)), [activeRooms]);
  const activeLevelIssues = useMemo(() => issues.filter((issue) => !issue.roomId || activeLevelRoomIds.has(issue.roomId)), [activeLevelRoomIds, issues]);
  const activeProject = workspace.projects.find((project) => project.id === selectedProjectId) || null;
  const activeSurvey = workspace.surveys.find((survey) => survey.id === activeSurveyId) || null;
  const isIndustrialMode = draft.surveyMode === "Épület- és csarnokfelmérés" || draft.surveyMode === "Térbeton- és burkolatfelmérés";
  const isPlanDocumentMode = draft.planDocumentWorkspace.surveySourceMode !== "site";
  const thermalLayerAvailable = draft.surveyMode === "Energetikai felmérés" || draft.surveyMode === "Felújítási felmérés";
  const energyWorkspaceEnabled = propertySurveyEnergyFeatureFlags.canUseEnergySurvey && thermalLayerAvailable;
  const energySettingsReadiness = useMemo(() => getEnergySettingsReadiness(draft.energyProjectSettings), [draft.energyProjectSettings]);
  const activeThermalSegments = useMemo(() => getSurveyThermalBoundarySegments({ rooms: activeRooms, wallSegments: activeWallSegments, settings: activeThermalBoundary }), [activeRooms, activeThermalBoundary, activeWallSegments]);
  const activeThermalSummary = useMemo(() => getSurveyThermalBoundarySummary(activeThermalSegments), [activeThermalSegments]);
  const steps = useMemo(() => allSteps.filter((step) => {
    if (step.id === "planDocument" && !isPlanDocumentMode) return false;
    if (isIndustrialMode) return step.id !== "mechanical" && step.id !== "energy" && step.id !== "renewables" && step.id !== "renovation";
    if (step.id === "industrial") return false;
    if (step.id === "energy") return energyWorkspaceEnabled && draft.energyFieldWorkflow.mode === "expert";
    if (step.id === "renewables") return energyWorkspaceEnabled && propertySurveyEnergyFeatureFlags.canUseEnergyRenewables;
    if (step.id === "renovation") return energyWorkspaceEnabled && propertySurveyEnergyFeatureFlags.canUseEnergyVariants;
    return true;
  }), [draft.energyFieldWorkflow.mode, energyWorkspaceEnabled, isIndustrialMode, isPlanDocumentMode]);
  const industrialSummary = useMemo(() => getIndustrialSummary(draft.pillars, draft.industrialMarkups, draft.industrialBuildingContours), [draft.industrialBuildingContours, draft.industrialMarkups, draft.pillars]);
  const canUndoIndustrial = industrialUndoRef.current.length > 0;
  const canRedoIndustrial = industrialRedoRef.current.length > 0;
  void industrialHistoryRevision;
  const recommendedScale = useMemo(() => getRecommendedSurveyScale(activeRooms, draft.planSheet), [activeRooms, draft.planSheet]);
  const effectiveScale = draft.planSheet.scaleMode === "auto" ? recommendedScale : draft.planSheet.scaleDenominator;
  const totalArea = useMemo(() => draft.rooms.reduce((sum, room) => sum + room.area, 0), [draft.rooms]);
  const heatedArea = useMemo(() => draft.rooms.filter((room) => room.heated).reduce((sum, room) => sum + room.area, 0), [draft.rooms]);
  const totalWindows = draft.wallOpenings.filter((opening) => opening.kind === "window").length;
  const totalDoors = draft.wallOpenings.filter((opening) => opening.kind !== "window").length;
  const activeExternalWallSummary = useMemo(
    () => calculateExternalWallLengthSummary(activeRooms, activeWallSegments, draft.northAngle),
    [activeRooms, activeWallSegments, draft.northAngle],
  );
  const postalSettlementOptions = useMemo(() => getHungarianSettlementsByPostalCode(draft.property.postalCode), [draft.property.postalCode]);
  const activeRoomOverlaps = useMemo(() => detectSurveyRoomOverlaps(activeRooms), [activeRooms]);
  const activeRoomOverlapDetails = useMemo(() => activeRoomOverlaps.map((overlap) => {
    const roomA = activeRooms.find((room) => room.id === overlap.roomAId);
    const roomB = activeRooms.find((room) => room.id === overlap.roomBId);
    const affectedSegments = activeWallSegments.filter((segment) =>
      (segment.roomId === overlap.roomAId && segment.adjacentRoomId === overlap.roomBId)
      || (segment.roomId === overlap.roomBId && segment.adjacentRoomId === overlap.roomAId),
    );
    const suggestedRoom = roomA && roomB ? (roomA.area <= roomB.area ? roomA : roomB) : roomB || roomA;
    return { ...overlap, roomA, roomB, affectedSegments, suggestedRoom };
  }), [activeRoomOverlaps, activeRooms, activeWallSegments]);
  const energySummary = useMemo(() => calculateSurveyEnergySummary({ rooms: draft.rooms, levels: draft.levels, wallSegments: draft.wallSegments, wallOpenings: draft.wallOpenings, assemblies: draft.assemblies, northAngle: draft.northAngle }), [draft.assemblies, draft.levels, draft.northAngle, draft.rooms, draft.wallOpenings, draft.wallSegments]);
  const energyGeometry = useMemo(() => calculateEnvelopeGeometry({ rooms: draft.rooms, levels: draft.levels, wallSegments: draft.wallSegments, wallOpenings: draft.wallOpenings, sectionLines: draft.sectionLines, northAngle: draft.northAngle }), [draft.levels, draft.northAngle, draft.rooms, draft.sectionLines, draft.wallOpenings, draft.wallSegments]);
  const energyAssemblies = useMemo(() => calculateAssemblySet({ assemblies: draft.assemblies, rules: huEkm20231101AssemblyRuleData, requirementLevel: draft.energyProjectSettings.requirementLevel }), [draft.assemblies, draft.energyProjectSettings.requirementLevel]);
  const energyZones = useMemo(() => calculateEnergyZones({ workspace: draft.energyZoneWorkspace, rooms: draft.rooms, levels: draft.levels, wallSegments: draft.wallSegments, wallOpenings: draft.wallOpenings, geometry: energyGeometry }), [draft.energyZoneWorkspace, draft.levels, draft.rooms, draft.wallOpenings, draft.wallSegments, energyGeometry]);
  const energyOpenings = useMemo(() => calculateEnergyOpenings({ workspace: draft.energyOpeningWorkspace, openings: draft.wallOpenings, requirementLevel: draft.energyProjectSettings.requirementLevel }), [draft.energyOpeningWorkspace, draft.energyProjectSettings.requirementLevel, draft.wallOpenings]);
  const energyDemand = useMemo(() => calculateEnergyDemand({ workspace: draft.energyDemandWorkspace, geometry: energyGeometry, zoneWorkspace: draft.energyZoneWorkspace, zoneSet: energyZones, rooms: draft.rooms, levels: draft.levels, wallSegments: draft.wallSegments, wallOpenings: draft.wallOpenings, assemblies: draft.assemblies, assemblySet: energyAssemblies, openingWorkspace: draft.energyOpeningWorkspace, openingSet: energyOpenings, sectionLines: draft.sectionLines, mechanicalDevices: draft.mechanicalDevices }), [draft.assemblies, draft.energyDemandWorkspace, draft.energyOpeningWorkspace, draft.energyZoneWorkspace, draft.levels, draft.mechanicalDevices, draft.rooms, draft.sectionLines, draft.wallOpenings, draft.wallSegments, energyAssemblies, energyGeometry, energyOpenings, energyZones]);
  const energyRenewables = useMemo(() => calculateEnergyRenewableSizing(draft.energyRenewableWorkspace), [draft.energyRenewableWorkspace]);
  const energyRenovationComparison = useMemo(() => calculateRenovationComparison({ workspace: draft.energyRenovationWorkspace, demand: energyDemand, zones: energyZones, wallSegments: draft.wallSegments, rooms: draft.rooms, openingWorkspace: draft.energyOpeningWorkspace, renewableWorkspace: draft.energyRenewableWorkspace, renewables: energyRenewables }), [draft.energyOpeningWorkspace, draft.energyRenovationWorkspace, draft.energyRenewableWorkspace, draft.rooms, draft.wallSegments, energyDemand, energyRenewables, energyZones]);
  const expertTables = useMemo(() => buildPropertySurveyExpertTables({ draft, geometry: energyGeometry, assemblies: energyAssemblies, zones: energyZones, openings: energyOpenings, demand: energyDemand, renewables: energyRenewables, renovationComparison: energyRenovationComparison }), [draft, energyAssemblies, energyDemand, energyGeometry, energyOpenings, energyRenewables, energyRenovationComparison, energyZones]);
  const winWattFieldMap = useMemo(() => buildWinWattFieldMap(expertTables), [expertTables]);
  const winWattTrialFeedback = useMemo(() => buildWinWattTrialFeedback(draft.energyWinWattTrialWorkspace, winWattFieldMap), [draft.energyWinWattTrialWorkspace, winWattFieldMap]);
  const winWattTrialMetricSeeds = useMemo<WinWattTrialMetricSeed[]>(() => [
    { metricKey: "conditionedFloorArea", label: "Kondicionált alapterület", dimproValue: energyDemand.totals.conditionedFloorAreaSquareMeters, unit: "m²", toleranceAbsolute: 0.05, tolerancePercent: 0.1 },
    { metricKey: "conditionedVolume", label: "Kondicionált térfogat", dimproValue: energyDemand.totals.conditionedVolumeCubicMeters, unit: "m³", toleranceAbsolute: 0.1, tolerancePercent: 0.1 },
    { metricKey: "transmissionHeatLoss", label: "Transzmissziós hőveszteségi tényező", dimproValue: energyDemand.enabled && energyDemand.valid ? energyDemand.totals.transmissionHeatLossCoefficientWK : undefined, unit: "W/K", toleranceAbsolute: 0.1, tolerancePercent: 0.5 },
    { metricKey: "totalHeatLoss", label: "Teljes hőveszteségi tényező", dimproValue: energyDemand.enabled && energyDemand.valid ? energyDemand.totals.totalHeatLossCoefficientWK : undefined, unit: "W/K", toleranceAbsolute: 0.1, tolerancePercent: 0.5 },
    { metricKey: "designHeatingPower", label: "Méretezési fűtési teljesítmény", dimproValue: energyDemand.enabled && energyDemand.valid ? energyDemand.totals.designHeatingPowerKw ?? undefined : undefined, unit: "kW", toleranceAbsolute: 0.02, tolerancePercent: 1 },
    { metricKey: "annualNetHeatingDemand", label: "Nettó éves fűtési energiaigény", unit: "kWh/m²év", tolerancePercent: 1 },
    { metricKey: "primaryEnergy", label: "Összesített energetikai jellemző", unit: "kWh/m²év", tolerancePercent: 1 },
    { metricKey: "co2Emission", label: "CO₂-kibocsátás", unit: "kg/m²év", tolerancePercent: 1 },
  ], [energyDemand]);
  const activeRenovationScenario = useMemo(() => draft.energyRenovationWorkspace.scenarios.find((scenario) => scenario.id === draft.energyRenovationWorkspace.activeScenarioId) || draft.energyRenovationWorkspace.scenarios.find((scenario) => scenario.kind === "proposal") || null, [draft.energyRenovationWorkspace]);
  const materialLayerOverridesValid = useMemo(() => draft.assemblies.every((assembly) => assembly.layers.every((layer) => {
    const snapshotLambda = layer.materialSnapshot?.lambdaUsedWmK;
    if (snapshotLambda === undefined) return true;
    const currentLambda = Number(layer.lambdaWmK);
    const overridden = Number.isFinite(currentLambda) && Math.abs(currentLambda - snapshotLambda) > 0.000001;
    return !overridden || Boolean(layer.lambdaOverrideReason?.trim());
  })), [draft.assemblies]);
  const certificatePhotoSummary = useMemo(() => getSurveyCertificatePhotoSummary(draft.photoPoints), [draft.photoPoints]);
  const activeSectionLineLengthMeters = activeSectionLine ? getSurveySectionLengthMeters({ line: activeSectionLine, industrialMode: isIndustrialMode, industrialSettings: draft.industrialSettings }) : 0;
  const activeSectionInternalWalls = activeSectionLine
    ? getSurveySectionInternalWallPositions({ line: activeSectionLine, rooms: activeRooms, wallSegments: activeWallSegments })
    : [];

  useEffect(() => {
    if (activeStep !== "structures" && activeStep !== "openings") return;
    if (!activeWallSegments.length) {
      if (activeWallSegmentId) setActiveWallSegmentId(null);
      if (activeOpeningId) setActiveOpeningId(null);
      return;
    }

    const selectedWall = activeWallSegments.find((segment) => segment.id === activeWallSegmentId) || activeWallSegments[0];
    if (selectedWall.id !== activeWallSegmentId) setActiveWallSegmentId(selectedWall.id);

    if (activeStep === "openings") {
      const selectedOpeningIsValid = activeWallOpenings.some((opening) => opening.id === activeOpeningId && opening.wallSegmentId === selectedWall.id);
      if (!selectedOpeningIsValid) setActiveOpeningId(activeWallOpenings.find((opening) => opening.wallSegmentId === selectedWall.id)?.id || null);
    }
  }, [activeOpeningId, activeStep, activeWallOpenings, activeWallSegmentId, activeWallSegments]);

  const completion = useMemo(() => ({
    property: Boolean(draft.property.postalCode && draft.property.settlement && draft.property.street && draft.property.houseNumber && draft.property.parcelNumber && draft.property.propertyType),
    planDocument: !isPlanDocumentMode || Boolean(draft.planDocumentWorkspace.documents.length && draft.planDocumentWorkspace.documents.some((document) => document.pages.some((page) => page.calibration.primary.pixelsPerMeter > 0))),
    plan: draft.rooms.length > 0 && totalArea > 0 && Boolean(draft.orientationSource),
    section: draft.sectionLines.length > 0,
    structures: draft.wallSegments.length > 0 && draft.wallSegments.every((segment) => Boolean(segment.wallType && segment.thicknessCm > 0)) && materialLayerOverridesValid && energyAssemblies.totals.blockedCount === 0,
    energy: energyWorkspaceEnabled ? energySettingsReadiness.ready && energyGeometry.valid && energyAssemblies.totals.assemblyCount > 0 && energyAssemblies.totals.blockedCount === 0 && energyZones.valid && energyOpenings.valid && (!draft.energyDemandWorkspace.enabled || energyDemand.valid) : true,
    openings: draft.wallOpenings.length > 0,
    industrial: draft.industrialBuildingContours.length > 0 || draft.pillars.length > 0 || draft.industrialMarkups.length > 0,
    mechanical: Boolean(draft.mechanical.heating && draft.mechanical.heatGenerator && draft.mechanical.hotWater),
    renewables: !draft.energyRenewableWorkspace.enabled || !energyRenewables.validationMessages.some((message) => message.severity === "blocking"),
    renovation: Boolean(activeRenovationScenario?.kind === "proposal" && activeRenovationScenario.measures.some((measure) => measure.included) && activeRenovationScenario.measures.filter((measure) => measure.included).every((measure) => Boolean(measure.title.trim() && measure.proposedDescription.trim() && measure.sourceReference.trim()))),
    photos: draft.surveyMode === "Energetikai felmérés"
      ? certificatePhotoSummary.count >= 3 && certificatePhotoSummary.missingRequiredCategories.length === 0 && !certificatePhotoSummary.exceedsPhotoCount && !certificatePhotoSummary.exceedsHardLimit
      : draft.photoPoints.filter((point) => Boolean(point.dataUrl || point.fileName)).length >= 1,
    issues: issues.every((issue) => Boolean(issue.title.trim() && issue.recordedAt)),
    check: Boolean(draft.property.postalCode && draft.property.settlement && draft.property.street && draft.property.houseNumber && draft.property.parcelNumber && draft.rooms.length && (isIndustrialMode || draft.mechanical.heatGenerator)),
    export: Boolean(lastExportAt),
  }), [activeRenovationScenario, certificatePhotoSummary, draft, energyAssemblies.totals.assemblyCount, energyAssemblies.totals.blockedCount, energyDemand.valid, energyGeometry.valid, energySettingsReadiness.ready, energyWorkspaceEnabled, energyOpenings.valid, energyRenewables.validationMessages, energyZones.valid, materialLayerOverridesValid, totalArea, issues, isIndustrialMode, isPlanDocumentMode, lastExportAt]);

  const completedCount = steps.filter((step) => completion[step.id]).length;
  const progressPercent = Math.round((completedCount / Math.max(1, steps.length)) * 100);
  const currentStepIndex = Math.max(0, steps.findIndex((step) => step.id === activeStep));
  const nextIncompleteStep = steps.find((step, index) => index > currentStepIndex && !completion[step.id])
    || steps.find((step) => !completion[step.id] && step.id !== activeStep)
    || null;
  const fieldStepFilterEnabled = energyWorkspaceEnabled && draft.energyFieldWorkflow.mode === "field" && draft.energyFieldWorkflow.showOnlyIncomplete;
  const visibleSurveySteps = fieldStepFilterEnabled
    ? steps.filter((step) => step.id === activeStep || !completion[step.id])
    : steps;

  const themeVariables = (theme === "dark" ? {
    "--survey-bg": "#07111f",
    "--survey-panel": "#0f1d2e",
    "--survey-panel-strong": "#13243a",
    "--survey-canvas": "#17283a",
    "--survey-paper-top": "#f8fafc",
    "--survey-paper-bottom": "#e8eef5",
    "--survey-text": "#f8fafc",
    "--survey-muted": "#94a3b8",
    "--survey-border": "#2b4058",
    "--survey-line": "#334155",
    "--survey-accent": "#22d3ee",
  } : theme === "sun" ? {
    "--survey-bg": "#ffffff",
    "--survey-panel": "#ffffff",
    "--survey-panel-strong": "#fffdf2",
    "--survey-canvas": "#f1f5f4",
    "--survey-paper-top": "#ffffff",
    "--survey-paper-bottom": "#ffffff",
    "--survey-text": "#020617",
    "--survey-muted": "#334155",
    "--survey-border": "#64748b",
    "--survey-line": "#0f172a",
    "--survey-accent": "#006b72",
  } : {
    "--survey-bg": "#f3f8f8",
    "--survey-panel": "#ffffff",
    "--survey-panel-strong": "#f8fafc",
    "--survey-canvas": "#dce7ea",
    "--survey-paper-top": "#ffffff",
    "--survey-paper-bottom": "#eef4f7",
    "--survey-text": "#0f172a",
    "--survey-muted": "#64748b",
    "--survey-border": "#d6e1e6",
    "--survey-line": "#334155",
    "--survey-accent": "#0e7490",
  }) as React.CSSProperties;

  function cycleTheme() {
    setTheme((current) => current === "light" ? "dark" : current === "dark" ? "sun" : "light");
  }

  const themeLabel = theme === "light" ? "Világos mód" : theme === "dark" ? "Sötét mód" : "SUN kültéri mód";

  function commitWorkspace(next: PropertySurveyWorkspace) {
    setWorkspace(next);
    try {
      window.localStorage.setItem(PROPERTY_SURVEY_WORKSPACE_KEY, JSON.stringify(next));
    } catch {
      // A szerveres projektmentés elkészültéig a helyi tár az MVP adattár.
    }
  }

  function createProject(input: { name: string; code?: string; location?: string; clientName?: string; note?: string }) {
    const project = createPropertySurveyProject(input);
    const now = new Date().toISOString();
    const next: PropertySurveyWorkspace = {
      ...workspace,
      projects: [...workspace.projects, project],
      activeProjectId: project.id,
      activeSurveyId: null,
      updatedAt: now,
    };
    commitWorkspace(next);
    setSelectedProjectId(project.id);
  }

  function selectProject(projectId: string) {
    const next = { ...workspace, activeProjectId: projectId, activeSurveyId: null, updatedAt: new Date().toISOString() };
    commitWorkspace(next);
    setSelectedProjectId(projectId);
  }

  function createSurvey(input: { projectId: string; name: string; surveyMode: PropertySurveyMode; startMode: PropertySurveyStartMode; sourceMode: PropertySurveySourceMode }) {
    const record = createPropertySurveyRecord(input);
    const next: PropertySurveyWorkspace = {
      ...workspace,
      surveys: [...workspace.surveys, record],
      activeProjectId: input.projectId,
      activeSurveyId: record.id,
      updatedAt: record.updatedAt,
    };
    commitWorkspace(next);
    loadSurveyRecord(record);
  }

  function openSurvey(surveyId: string) {
    const record = workspace.surveys.find((survey) => survey.id === surveyId);
    if (!record) return;
    const next = { ...workspace, activeProjectId: record.projectId, activeSurveyId: record.id, updatedAt: new Date().toISOString() };
    commitWorkspace(next);
    loadSurveyRecord(record);
  }

  async function enterDrawingFocusMode() {
    setDrawingFocusMode(true);
    setFocusLeftOpen(false);
    setFocusRightOpen(false);
    setFocusLeftPinned(false);
    setFocusRightPinned(false);
    focusLeftPinnedRef.current = false;
    focusRightPinnedRef.current = false;
    setFocusPlanOpen(false);
    try {
      const element = focusRootRef.current;
      if (element && !document.fullscreenElement && element.requestFullscreen) await element.requestFullscreen();
    } catch {
      // iPad/Safari esetén a CSS teljes képernyős munkatér továbbra is működik.
    }
  }

  async function exitDrawingFocusMode() {
    setDrawingFocusMode(false);
    setFocusLeftOpen(false);
    setFocusRightOpen(false);
    setFocusLeftPinned(false);
    setFocusRightPinned(false);
    focusLeftPinnedRef.current = false;
    focusRightPinnedRef.current = false;
    setFocusPlanOpen(false);
    try {
      if (document.fullscreenElement) await document.exitFullscreen();
    } catch {
      // A CSS fókuszmód kilépése a natív fullscreen API nélkül is működik.
    }
  }

  function openProjectCenter() {
    void exitDrawingFocusMode();
    saveNow();
    setRoomDrawingMode(false);
    setSectionDrawingMode(false);
    setIssuePlacementMode(null);
    setPhotoPlacementMode(null);
    setMechanicalPlacementMode(null);
    setIndustrialTool("select");
    setProjectCenterOpen(true);
  }

  function markDirty() {
    setSaveState("dirty");
  }

  function updateDraft<K extends keyof PropertySurveyDraft>(key: K, value: PropertySurveyDraft[K]) {
    markDirty();
    setDraft((current) => ({ ...current, [key]: value }));
  }

  function updateEnergyProjectSettings(patch: Partial<EnergyProjectSettings>) {
    markDirty();
    setDraft((current) => ({
      ...current,
      energyProjectSettings: { ...current.energyProjectSettings, ...patch, updatedAt: new Date().toISOString() },
    }));
  }

  function updateEnergyZoneWorkspace(energyZoneWorkspace: PropertySurveyDraft["energyZoneWorkspace"]) {
    markDirty();
    setDraft((current) => ({ ...current, energyZoneWorkspace, energyDemandWorkspace: normalizeEnergyDemandWorkspace(current.energyDemandWorkspace, energyZoneWorkspace, null, current.mechanicalDevices) }));
  }

  function updateEnergyDemandWorkspace(energyDemandWorkspace: EnergyDemandWorkspace) {
    markDirty();
    setDraft((current) => ({ ...current, energyDemandWorkspace }));
  }

  function updateEnergyFieldWorkflow(patch: Partial<PropertySurveyDraft["energyFieldWorkflow"]>) {
    markDirty();
    setDraft((current) => ({ ...current, energyFieldWorkflow: { ...current.energyFieldWorkflow, ...patch, updatedAt: new Date().toISOString() } }));
  }

  function setEnergyWorkspaceMode(mode: EnergyWorkspaceMode) {
    updateEnergyFieldWorkflow({ mode });
    if (mode === "field" && activeStep === "energy") setActiveStep("property");
  }

  function updateEnergyRenewableWorkspace(energyRenewableWorkspace: EnergyRenewableWorkspace) {
    markDirty();
    setDraft((current) => ({ ...current, energyRenewableWorkspace }));
  }

  function updateEnergyWinWattTrialWorkspace(energyWinWattTrialWorkspace: PropertySurveyDraft["energyWinWattTrialWorkspace"]) {
    markDirty();
    setDraft((current) => ({ ...current, energyWinWattTrialWorkspace }));
  }

  function updateWorkTimerWorkspace(workTimerWorkspace: PropertySurveyDraft["workTimerWorkspace"]) {
    markDirty();
    setDraft((current) => ({ ...current, workTimerWorkspace }));
  }

  function updateEnergyRenovationWorkspace(energyRenovationWorkspace: EnergyRenovationWorkspace) {
    markDirty();
    setDraft((current) => ({
      ...current,
      energyRenovationWorkspace,
      energyFieldWorkflow: { ...current.energyFieldWorkflow, activeScenarioId: energyRenovationWorkspace.activeScenarioId, updatedAt: new Date().toISOString() },
    }));
  }

  function generateRenovationSuggestions() {
    const generated = buildRenovationSuggestions({
      workspace: draft.energyRenovationWorkspace,
      assemblies: draft.assemblies,
      assemblySet: energyAssemblies,
      wallOpenings: draft.wallOpenings,
      openingSet: energyOpenings,
      demandWorkspace: draft.energyDemandWorkspace,
      demandSet: energyDemand,
      renewableWorkspace: draft.energyRenewableWorkspace,
      renewableResult: energyRenewables,
    });
    updateEnergyRenovationWorkspace(generated.workspace);
    return { addedCount: generated.addedCount, updatedCount: generated.updatedCount, suggestionCount: generated.suggestionCount };
  }

  function updateEnergyOpeningWorkspace(energyOpeningWorkspace: EnergyOpeningWorkspace) {
    markDirty();
    setDraft((current) => ({ ...current, energyOpeningWorkspace }));
  }

  function updateEnergyOpeningDetail(openingId: string, patch: Partial<EnergyOpeningDetail>) {
    markDirty();
    setDraft((current) => {
      const opening = current.wallOpenings.find((item) => item.id === openingId);
      if (!opening) return current;
      const existing = current.energyOpeningWorkspace.openingDetails[openingId] || createEnergyOpeningDetail(opening);
      const detail = { ...existing, ...patch, openingId, updatedAt: new Date().toISOString() };
      const wallOpenings = patch.declaredUwWm2K !== undefined && detail.calculationMode === "declared"
        ? current.wallOpenings.map((item) => item.id === openingId ? { ...item, uValue: Number(patch.declaredUwWm2K).toFixed(3), updatedAt: new Date().toISOString() } : item)
        : current.wallOpenings;
      return { ...current, wallOpenings, energyOpeningWorkspace: { ...current.energyOpeningWorkspace, openingDetails: { ...current.energyOpeningWorkspace.openingDetails, [openingId]: detail }, updatedAt: new Date().toISOString() } };
    });
  }

  function updateMaterialWorkspace(materialWorkspace: PropertySurveyDraft["materialWorkspace"]) {
    markDirty();
    setDraft((current) => ({ ...current, materialWorkspace }));
  }

  function updateProperty(key: keyof PropertySurveyDraft["property"], value: string) {
    markDirty();
    setDraft((current) => {
      const property = { ...current.property, [key]: value };
      if (key === "postalCode") {
        property.postalCode = normalizeHungarianPostalCode(value);
        const settlements = getHungarianSettlementsByPostalCode(property.postalCode);
        if (settlements.length && !settlements.includes(property.settlement)) property.settlement = settlements[0];
        if (property.postalCode.length < 4) property.settlement = "";
      }
      if (key === "postalCode" || key === "settlement" || key === "street" || key === "houseNumber") {
        property.address = composePropertySurveyAddress(property);
      }
      return { ...current, property };
    });
  }

  function updateExportDetails(key: keyof PropertySurveyDraft["exportDetails"], value: string) {
    markDirty();
    setDraft((current) => ({ ...current, exportDetails: { ...current.exportDetails, [key]: value } }));
  }

  function startSectionDrawing() {
    setRoomDrawingMode(false);
    setIssuePlacementMode(null);
    setPhotoPlacementMode(null);
    setMechanicalPlacementMode(null);
    setIndustrialTool("select");
    setSectionDrawingMode(true);
    setActiveStep("section");
  }

  function createSectionFromLine(line: { start: { x: number; y: number }; end: { x: number; y: number } }) {
    const section = createSurveySectionLine({ levelId: draft.activeLevelId, lines: draft.sectionLines, surveyMode: draft.surveyMode, start: line.start, end: line.end });
    markDirty();
    setDraft((current) => ({ ...current, sectionLines: [...current.sectionLines, section] }));
    setActiveSectionLineId(section.id);
    setSectionDrawingMode(false);
    setActiveStep("section");
    if (drawingFocusMode) setFocusRightOpen(true);
  }

  function updateSectionLine(lineId: string, patch: Partial<SurveySectionLine>) {
    markDirty();
    setDraft((current) => ({ ...current, sectionLines: current.sectionLines.map((line) => line.id === lineId ? { ...line, ...patch, updatedAt: new Date().toISOString() } : line) }));
  }

  function deleteSectionLine(lineId: string) {
    const line = draft.sectionLines.find((item) => item.id === lineId);
    if (!line) return;
    markDirty();
    setDraft((current) => ({ ...current, sectionLines: current.sectionLines.filter((item) => item.id !== lineId) }));
    setActiveSectionLineId(activeSectionLines.find((item) => item.id !== lineId)?.id || null);
    setSectionDrawingMode(false);
  }

  function selectSectionLine(lineId: string) {
    setActiveSectionLineId(lineId);
    setActiveStep("section");
    setSectionDrawingMode(false);
    if (drawingFocusMode) setFocusRightOpen(true);
  }

  function selectLevel(levelId: string) {
    const levelRooms = draft.rooms.filter((room) => (room.levelId || draft.activeLevelId) === levelId);
    const levelWalls = draft.wallSegments.filter((segment) => segment.levelId === levelId);
    updateDraft("activeLevelId", levelId);
    setActiveRoomId(levelRooms[0]?.id || "");
    setActiveWallSegmentId(levelWalls[0]?.id || null);
    setActiveOpeningId(null);
    setMeasurementTarget(null);
    setMeasurementWaiting(false);
    setRoomDrawingMode(false);
    setSectionDrawingMode(false);
    setActiveSectionLineId(draft.sectionLines.find((line) => line.levelId === levelId)?.id || null);
    setIssuePlacementMode(null);
    setPhotoPlacementMode(null);
    setMechanicalPlacementMode(null);
    setActivePhotoId(draft.photoPoints.find((point) => point.levelId === levelId)?.id || null);
    setActiveMechanicalDeviceId(draft.mechanicalDevices.find((device) => device.levelId === levelId)?.id || null);
    setActiveIndustrialBuildingContourId(draft.industrialBuildingContours.find((contour) => contour.levelId === levelId)?.id || null);
    setActivePillarId(draft.pillars.find((pillar) => pillar.levelId === levelId)?.id || null);
    setActiveIndustrialMarkupId(draft.industrialMarkups.find((markup) => markup.levelId === levelId)?.id || null);
    setActiveIndustrialPointIndex(null);
    setIndustrialTool("select");
  }

  function addLevel(direction: "above" | "below") {
    const level = createSurveyLevel({ direction, levels: draft.levels, referenceLevelId: draft.activeLevelId });
    markDirty();
    setDraft((current) => ({
      ...current,
      levels: [...current.levels, level].sort((left, right) => left.order - right.order),
      thermalBoundaries: [...current.thermalBoundaries, createDefaultThermalBoundary(level.id)],
      activeLevelId: level.id,
      property: { ...current.property, floorCount: String(current.levels.length + 1) },
    }));
    setActiveRoomId("");
    setActiveWallSegmentId(null);
    setActiveOpeningId(null);
    setActiveSectionLineId(null);
    setSectionDrawingMode(false);
    setActiveIndustrialBuildingContourId(null);
    setActivePillarId(null);
    setActiveIndustrialMarkupId(null);
    setActiveIndustrialPointIndex(null);
    setIndustrialTool("select");
    setActiveStep("plan");
    setRoomDrawingMode(false);
  }

  function renameLevel(levelId: string, name: string) {
    markDirty();
    setDraft((current) => ({ ...current, levels: current.levels.map((level) => level.id === levelId ? { ...level, name } : level) }));
  }

  function deleteActiveLevel() {
    if (draft.levels.length <= 1) return;
    const level = draft.levels.find((item) => item.id === draft.activeLevelId);
    if (!level) return;
    const roomIds = new Set(draft.rooms.filter((room) => room.levelId === level.id).map((room) => room.id));
    const wallIds = new Set(draft.wallSegments.filter((segment) => segment.levelId === level.id).map((segment) => segment.id));
    const nextLevels = draft.levels.filter((item) => item.id !== level.id).sort((left, right) => left.order - right.order);
    const nextLevel = nextLevels.reduce((best, item) => Math.abs(item.order - level.order) < Math.abs(best.order - level.order) ? item : best, nextLevels[0]);
    markDirty();
    setDraft((current) => ({
      ...current,
      levels: nextLevels,
      activeLevelId: nextLevel.id,
      rooms: current.rooms.filter((room) => !roomIds.has(room.id)),
      wallSegments: current.wallSegments.filter((segment) => !wallIds.has(segment.id)),
      wallOpenings: current.wallOpenings.filter((opening) => !wallIds.has(opening.wallSegmentId)),
      thermalBoundaries: current.thermalBoundaries.filter((item) => item.levelId !== level.id),
      photoPoints: current.photoPoints.filter((point) => point.levelId !== level.id),
      mechanicalDevices: current.mechanicalDevices.filter((device) => device.levelId !== level.id),
      industrialBuildingContours: current.industrialBuildingContours.filter((contour) => contour.levelId !== level.id),
      pillars: current.pillars.filter((pillar) => pillar.levelId !== level.id),
      industrialMarkups: current.industrialMarkups.filter((markup) => markup.levelId !== level.id),
      sectionLines: current.sectionLines.filter((line) => line.levelId !== level.id),
      property: { ...current.property, floorCount: String(nextLevels.length) },
    }));
    setIssues((current) => current.map((issue) => roomIds.has(issue.roomId) ? { ...issue, roomId: "", updatedAt: new Date().toISOString() } : issue));
    const nextRooms = draft.rooms.filter((room) => room.levelId === nextLevel.id && !roomIds.has(room.id));
    const nextWalls = draft.wallSegments.filter((segment) => segment.levelId === nextLevel.id && !wallIds.has(segment.id));
    setActiveRoomId(nextRooms[0]?.id || "");
    setActiveWallSegmentId(nextWalls[0]?.id || null);
    setActiveOpeningId(null);
    setActiveSectionLineId(draft.sectionLines.find((line) => line.levelId === nextLevel.id)?.id || null);
    setSectionDrawingMode(false);
    setActivePhotoId(draft.photoPoints.find((point) => point.levelId === nextLevel.id)?.id || null);
    setActiveMechanicalDeviceId(draft.mechanicalDevices.find((device) => device.levelId === nextLevel.id)?.id || null);
    setActiveIndustrialBuildingContourId(draft.industrialBuildingContours.find((contour) => contour.levelId === nextLevel.id)?.id || null);
    setActivePillarId(draft.pillars.find((pillar) => pillar.levelId === nextLevel.id)?.id || null);
    setActiveIndustrialMarkupId(draft.industrialMarkups.find((markup) => markup.levelId === nextLevel.id)?.id || null);
    setActiveIndustrialPointIndex(null);
    setIndustrialTool("select");
  }

  function updatePlanSheet(patch: Partial<SurveyPlanSheetSettings>) {
    markDirty();
    setDraft((current) => ({ ...current, planSheet: { ...current.planSheet, ...patch } }));
  }

  function selectWallSegment(segmentId: string) {
    const segment = draft.wallSegments.find((item) => item.id === segmentId);
    if (!segment) return;
    setActiveWallSegmentId(segment.id);
    setActiveRoomId(segment.roomId);
    const opening = draft.wallOpenings.find((item) => item.wallSegmentId === segment.id);
    setActiveOpeningId(opening?.id || null);
  }

  function updateWallSegment(segmentId: string, patch: Partial<SurveyWallSegment>) {
    const selected = draft.wallSegments.find((segment) => segment.id === segmentId);
    if (!selected) return;
    const sameSide = draft.wallSegments.filter((segment) => segment.roomId === selected.roomId && segment.side === selected.side).sort((left, right) => left.startRatio - right.startRatio);
    const index = sameSide.findIndex((segment) => segment.id === segmentId);
    const previous = index > 0 ? sameSide[index - 1] : null;
    const next = index >= 0 && index < sameSide.length - 1 ? sameSide[index + 1] : null;
    const normalizedPatch = { ...patch };
    if (typeof normalizedPatch.startRatio === "number") normalizedPatch.startRatio = previous ? Math.min(selected.endRatio - 0.03, Math.max(previous.startRatio + 0.03, normalizedPatch.startRatio)) : 0;
    if (typeof normalizedPatch.endRatio === "number") normalizedPatch.endRatio = next ? Math.max(selected.startRatio + 0.03, Math.min(next.endRatio - 0.03, normalizedPatch.endRatio)) : 1;
    markDirty();
    setDraft((current) => ({
      ...current,
      wallSegments: current.wallSegments.map((segment) => {
        if (segment.id === segmentId) return { ...segment, ...normalizedPatch, isAutoGenerated: false, planTransferLocked: segment.dataSource === "planTransfer" ? true : segment.planTransferLocked, updatedAt: normalizedPatch.updatedAt || new Date().toISOString() };
        if (previous && segment.id === previous.id && typeof normalizedPatch.startRatio === "number") return { ...segment, endRatio: normalizedPatch.startRatio, isAutoGenerated: false, updatedAt: new Date().toISOString() };
        if (next && segment.id === next.id && typeof normalizedPatch.endRatio === "number") return { ...segment, startRatio: normalizedPatch.endRatio, isAutoGenerated: false, updatedAt: new Date().toISOString() };
        return segment;
      }),
    }));
  }

  function splitSelectedWallSegment(segmentId: string) {
    const segment = draft.wallSegments.find((item) => item.id === segmentId);
    if (!segment) return;
    const [first, second] = splitWallSegment(segment);
    const midpoint = first.endRatio;
    markDirty();
    setDraft((current) => ({
      ...current,
      wallSegments: current.wallSegments.flatMap((item) => item.id === segmentId ? [{ ...first, planTransferLocked: item.dataSource === "planTransfer" ? true : first.planTransferLocked }, { ...second, planTransferLocked: item.dataSource === "planTransfer" ? true : second.planTransferLocked }] : [item]),
      wallOpenings: current.wallOpenings.map((opening) => {
        if (opening.wallSegmentId !== segmentId) return opening;
        const globalRatio = segment.startRatio + opening.offsetRatio * (segment.endRatio - segment.startRatio);
        if (globalRatio <= midpoint) return { ...opening, wallSegmentId: first.id, offsetRatio: Math.min(1, Math.max(0, (globalRatio - first.startRatio) / Math.max(0.0001, first.endRatio - first.startRatio))), updatedAt: new Date().toISOString() };
        return { ...opening, wallSegmentId: second.id, offsetRatio: Math.min(1, Math.max(0, (globalRatio - second.startRatio) / Math.max(0.0001, second.endRatio - second.startRatio))), updatedAt: new Date().toISOString() };
      }),
    }));
    setActiveWallSegmentId(second.id);
    setActiveOpeningId(null);
  }

  function deleteWallSegment(segmentId: string) {
    const segment = draft.wallSegments.find((item) => item.id === segmentId);
    if (!segment) return;
    const sameSide = draft.wallSegments.filter((item) => item.roomId === segment.roomId && item.side === segment.side).sort((left, right) => left.startRatio - right.startRatio);
    if (sameSide.length <= 1) return;
    const index = sameSide.findIndex((item) => item.id === segmentId);
    const target = sameSide[index - 1] || sameSide[index + 1];
    if (!target) return;
    const mergedStart = Math.min(target.startRatio, segment.startRatio);
    const mergedEnd = Math.max(target.endRatio, segment.endRatio);
    markDirty();
    setDraft((current) => ({
      ...current,
      wallSegments: current.wallSegments.filter((item) => item.id !== segmentId).map((item) => item.id === target.id ? { ...item, startRatio: mergedStart, endRatio: mergedEnd, isAutoGenerated: false, planTransferLocked: item.dataSource === "planTransfer" || segment.dataSource === "planTransfer" ? true : item.planTransferLocked, updatedAt: new Date().toISOString() } : item),
      wallOpenings: current.wallOpenings.map((opening) => {
        const source = opening.wallSegmentId === segment.id ? segment : opening.wallSegmentId === target.id ? target : null;
        if (!source) return opening;
        const globalRatio = source.startRatio + opening.offsetRatio * (source.endRatio - source.startRatio);
        return { ...opening, wallSegmentId: target.id, offsetRatio: Math.min(1, Math.max(0, (globalRatio - mergedStart) / Math.max(0.0001, mergedEnd - mergedStart))), updatedAt: new Date().toISOString() };
      }),
    }));
    setActiveWallSegmentId(target.id);
    setActiveOpeningId(null);
  }

  function rebuildActiveLevelWalls() {
    const reconciled = reconcileDynamicWallModelForRooms(activeRooms, draft.wallSegments, draft.wallOpenings, draft.structures.externalWallType);
    markDirty();
    setDraft((current) => ({ ...current, wallSegments: reconciled.wallSegments, wallOpenings: reconciled.wallOpenings, energyOpeningWorkspace: normalizeEnergyOpeningWorkspace(current.energyOpeningWorkspace, reconciled.wallOpenings) }));
    const nextWalls = reconciled.wallSegments.filter((segment) => segment.levelId === draft.activeLevelId);
    setActiveWallSegmentId(nextWalls[0]?.id || null);
    setActiveOpeningId(null);
  }

  function addWallOpening(wallSegmentId: string, kind: SurveyWallOpening["kind"] = "window") {
    const wall = draft.wallSegments.find((segment) => segment.id === wallSegmentId);
    if (!wall) return;
    const now = new Date().toISOString();
    const opening: SurveyWallOpening = {
      id: createBuildingModelId("wall-opening"),
      levelId: wall.levelId,
      roomId: wall.roomId,
      wallSegmentId: wall.id,
      kind,
      name: surveyOpeningKindLabels[kind],
      widthMeters: kind === "door" ? 0.9 : kind === "garageDoor" ? 2.5 : 1.2,
      heightMeters: kind === "door" ? 2.1 : kind === "garageDoor" ? 2.2 : kind === "balconyDoor" ? 2.2 : 1.5,
      sillHeightMeters: kind === "window" ? 0.9 : 0,
      offsetRatio: 0.5,
      frame: draft.openings.frame || "PVC",
      glazing: draft.openings.glazing || "3 rétegű hőszigetelő üveg",
      uValue: draft.openings.uValue || "",
      shading: draft.openings.shading || "Nincs",
      note: "",
      createdAt: now,
      updatedAt: now,
    };
    markDirty();
    setDraft((current) => {
      const wallOpenings = [...current.wallOpenings, opening];
      const roomWindowCount = wallOpenings.filter((item) => item.roomId === wall.roomId && item.kind === "window").length;
      const energyDetail = createEnergyOpeningDetail(opening);
      return { ...current, wallOpenings, energyOpeningWorkspace: { ...current.energyOpeningWorkspace, openingDetails: { ...current.energyOpeningWorkspace.openingDetails, [opening.id]: energyDetail }, updatedAt: now }, wallSegments: current.wallSegments.map((segment) => segment.id === wall.id ? { ...segment, isAutoGenerated: false, updatedAt: now } : segment), rooms: current.rooms.map((room) => room.id === wall.roomId ? { ...room, windowCount: roomWindowCount, windowType: opening.kind === "window" ? opening.name : room.windowType } : room) };
    });
    setActiveWallSegmentId(wall.id);
    setActiveOpeningId(opening.id);
  }

  function updateWallOpening(openingId: string, patch: Partial<SurveyWallOpening>) {
    markDirty();
    setDraft((current) => {
      const wallOpenings = current.wallOpenings.map((opening) => opening.id === openingId ? { ...opening, ...patch, planTransferLocked: opening.dataSource === "planTransfer" ? true : opening.planTransferLocked, updatedAt: patch.updatedAt || new Date().toISOString() } : opening);
      const sourceOpening = wallOpenings.find((opening) => opening.id === openingId);
      if (!sourceOpening) return { ...current, wallOpenings };
      const existing = current.energyOpeningWorkspace.openingDetails[openingId] || createEnergyOpeningDetail(sourceOpening);
      const parsedUw = patch.uValue === undefined ? undefined : Number(String(patch.uValue).replace(",", "."));
      const detail = patch.uValue !== undefined && existing.calculationMode === "declared"
        ? { ...existing, declaredUwWm2K: parsedUw !== undefined && Number.isFinite(parsedUw) && parsedUw > 0 ? parsedUw : undefined, declaredSourceType: existing.declaredSourceType || "manual" as const, updatedAt: new Date().toISOString() }
        : existing;
      return { ...current, wallOpenings, energyOpeningWorkspace: { ...current.energyOpeningWorkspace, openingDetails: { ...current.energyOpeningWorkspace.openingDetails, [openingId]: detail }, updatedAt: new Date().toISOString() } };
    });
  }

  function deleteWallOpening(openingId: string) {
    const opening = draft.wallOpenings.find((item) => item.id === openingId);
    if (!opening) return;
    markDirty();
    setDraft((current) => {
      const wallOpenings = current.wallOpenings.filter((item) => item.id !== openingId);
      const roomWindowCount = wallOpenings.filter((item) => item.roomId === opening.roomId && item.kind === "window").length;
      const openingDetails = { ...current.energyOpeningWorkspace.openingDetails };
      delete openingDetails[openingId];
      return { ...current, wallOpenings, energyOpeningWorkspace: { ...current.energyOpeningWorkspace, openingDetails, thermalBridges: current.energyOpeningWorkspace.thermalBridges.filter((bridge) => bridge.openingId !== openingId), updatedAt: new Date().toISOString() }, rooms: current.rooms.map((room) => room.id === opening.roomId ? { ...room, windowCount: roomWindowCount } : room) };
    });
    setActiveOpeningId(draft.wallOpenings.find((item) => item.wallSegmentId === opening.wallSegmentId && item.id !== openingId)?.id || null);
  }

  function updateMechanical(key: keyof PropertySurveyDraft["mechanical"], value: string) {
    markDirty();
    setDraft((current) => ({ ...current, mechanical: { ...current.mechanical, [key]: value } }));
  }

  function updateRoom(patch: Partial<SurveyRoom>) {
    if (!activeRoom) return;
    const geometryChanged = ["x", "y", "width", "depth", "lengthMeters", "widthMeters", "heated"].some((key) => key in patch);
    markDirty();
    setDraft((current) => {
      const rooms = current.rooms.map((room) => room.id === activeRoom.id ? { ...room, ...patch } : room);
      if (!geometryChanged) return { ...current, rooms };
      const levelRooms = rooms.filter((room) => (room.levelId || current.activeLevelId) === (activeRoom.levelId || current.activeLevelId));
      const reconciled = reconcileDynamicWallModelForRooms(levelRooms, current.wallSegments, current.wallOpenings, current.structures.externalWallType);
      return { ...current, rooms, wallSegments: reconciled.wallSegments, wallOpenings: reconciled.wallOpenings };
    });
  }

  function applyRoomMeasurement(
    target: SurveyRoomDimensionTarget,
    rawValue: string | number,
    source: SurveyRoomDimensionSource = "manual",
    deviceName?: string,
    recordLast = true,
    measuredAtInput?: string,
  ) {
    if (!activeRoom) return;
    const valueMeters = parseSurveyMeasurement(rawValue);
    if (!valueMeters) return;
    const measuredAt = measuredAtInput || new Date().toISOString();
    const dimensions = resolveSurveyRoomDimensions(activeRoom);

    if (target === "height") {
      updateRoom({
        height: roundSurveyMeasurement(valueMeters),
        heightSource: source,
        heightMeasuredAt: measuredAt,
        heightDevice: deviceName,
        dimensionSource: source,
        measuredAt,
        measurementDevice: deviceName,
      });
    } else {
      const lengthMeters = target === "length" ? valueMeters : dimensions.lengthMeters;
      const widthMeters = target === "width" ? valueMeters : dimensions.widthMeters;
      const planWidth = Math.min(756, Math.max(48, surveyMetersToPlanUnits(lengthMeters)));
      const planDepth = Math.min(455, Math.max(48, surveyMetersToPlanUnits(widthMeters)));
      // A pontos mérés a helyiség meglévő bal felső rögzítési pontjából méretezi át a rajzot.
      const targetPatch = target === "length" ? {
        lengthSource: source,
        lengthMeasuredAt: measuredAt,
        lengthDevice: deviceName,
      } : {
        widthSource: source,
        widthMeasuredAt: measuredAt,
        widthDevice: deviceName,
      };
      updateRoom({
        lengthMeters: roundSurveyMeasurement(lengthMeters),
        widthMeters: roundSurveyMeasurement(widthMeters),
        area: roundSurveyMeasurement(lengthMeters * widthMeters, 2),
        width: Number(planWidth.toFixed(1)),
        depth: Number(planDepth.toFixed(1)),
        dimensionSource: source,
        measuredAt,
        measurementDevice: deviceName,
        ...targetPatch,
      });
    }

    setMeasurementTarget(target);
    setMeasurementWaiting(false);
    if (recordLast) setLastMeasurement({ valueMeters, target, source, deviceName, measuredAt });
  }

  function moveRoom(roomId: string, position: { x: number; y: number }) {
    const room = draft.rooms.find((item) => item.id === roomId);
    if (!room) return;
    const deltaX = position.x - room.x;
    const deltaY = position.y - room.y;
    if (Math.abs(deltaX) < 0.01 && Math.abs(deltaY) < 0.01) return;
    markDirty();
    setDraft((current) => {
      const rooms = current.rooms.map((item) => item.id === roomId ? { ...item, x: position.x, y: position.y, polygon: item.polygon?.map((point) => ({ x: point.x + deltaX, y: point.y + deltaY })) } : item);
      const levelRooms = rooms.filter((item) => (item.levelId || current.activeLevelId) === (room.levelId || current.activeLevelId));
      const reconciled = reconcileDynamicWallModelForRooms(levelRooms, current.wallSegments, current.wallOpenings, current.structures.externalWallType);
      return { ...current, rooms, wallSegments: reconciled.wallSegments, wallOpenings: reconciled.wallOpenings };
    });
    setIssues((current) => current.map((issue) => issue.roomId === roomId ? {
      ...issue,
      xPercent: Math.min(98, Math.max(2, issue.xPercent + (deltaX / 900) * 100)),
      yPercent: Math.min(98, Math.max(2, issue.yPercent + (deltaY / 610) * 100)),
      updatedAt: new Date().toISOString(),
    } : issue));
    setDraft((current) => ({ ...current, photoPoints: current.photoPoints.map((point) => point.roomId === roomId ? { ...point, xPercent: Math.min(98, Math.max(2, point.xPercent + (deltaX / 900) * 100)), yPercent: Math.min(98, Math.max(2, point.yPercent + (deltaY / 610) * 100)), updatedAt: new Date().toISOString() } : point) }));
  }

  function addRoomFromRectangle(rectangle?: { x: number; y: number; width: number; depth: number }) {
    const roomNumber = activeRooms.length + 1;
    const width = rectangle?.width || 180;
    const depth = rectangle?.depth || 140;
    const estimatedArea = Math.max(1, (width / 60) * (depth / 60));
    const newRoom: SurveyRoom = {
      id: `room-${Date.now()}`,
      levelId: draft.activeLevelId,
      name: `${String(roomNumber).padStart(2, "0")} Új helyiség`,
      function: "Egyéb",
      area: roundSurveyMeasurement(estimatedArea, 2),
      height: 2.7,
      x: rectangle?.x ?? 110 + (roomNumber % 3) * 190,
      y: rectangle?.y ?? 110 + (roomNumber % 2) * 170,
      width,
      depth,
      lengthMeters: roundSurveyMeasurement(width / 60),
      widthMeters: roundSurveyMeasurement(depth / 60),
      dimensionSource: "drawn",
      lengthSource: "drawn",
      widthSource: "drawn",
      measuredAt: new Date().toISOString(),
      lengthMeasuredAt: new Date().toISOString(),
      widthMeasuredAt: new Date().toISOString(),
      heated: true,
      externalWallType: draft.structures.externalWallType,
      floorType: draft.structures.floorType,
      ceilingType: draft.structures.roofType,
      windowCount: 0,
      windowType: draft.openings.defaultWindowType,
      orientation: "Ellenőrizendő",
      floorFinishMaterial: "",
      wallFinishMaterial: "",
      ceilingFinishMaterial: "",
      suspendedCeilingEnabled: false,
      suspendedCeilingDropMeters: 0,
      note: "",
    };
    const nextLevelRooms = [...activeRooms, newRoom];
    const nextRooms = [...draft.rooms, newRoom];
    const reconciled = reconcileDynamicWallModelForRooms(nextLevelRooms, draft.wallSegments, draft.wallOpenings, draft.structures.externalWallType);
    markDirty();
    setDraft((current) => ({ ...current, rooms: nextRooms, wallSegments: reconciled.wallSegments, wallOpenings: reconciled.wallOpenings }));
    setActiveRoomId(newRoom.id);
    setActiveWallSegmentId(reconciled.wallSegments.find((segment) => segment.roomId === newRoom.id)?.id || null);
    setActiveOpeningId(null);
    setActiveStep("plan");
    setRoomDrawingMode(false);
  }

  function updatePlanDocumentWorkspace(nextWorkspace: PropertySurveyDraft["planDocumentWorkspace"]) {
    markDirty();
    setDraft((current) => ({ ...current, planDocumentWorkspace: nextWorkspace }));
  }

  function transferPlanPageToEnergyModel(page: SurveyPlanPage, conflictStrategy: SurveyPlanTransferConflictStrategy = "block"): ManagedSurveyPlanTransferResult {
    const result = applyManagedSurveyPlanEnergyTransfer({
      page,
      rooms: draft.rooms,
      wallSegments: draft.wallSegments,
      wallOpenings: draft.wallOpenings,
      assemblies: draft.assemblies,
      zoneWorkspace: draft.energyZoneWorkspace,
      openingWorkspace: draft.energyOpeningWorkspace,
      transferRegistry: draft.planDocumentWorkspace.transferRegistry,
      conflictStrategy,
    });
    markDirty();
    setDraft((current) => {
      const planDocumentWorkspace = {
        ...current.planDocumentWorkspace,
        transferRegistry: result.transferRegistry,
        updatedAt: new Date().toISOString(),
      };
      if (!result.canTransfer) return { ...current, planDocumentWorkspace };
      return {
        ...current,
        rooms: result.rooms,
        wallSegments: result.wallSegments,
        wallOpenings: result.wallOpenings,
        energyZoneWorkspace: result.zoneWorkspace,
        energyOpeningWorkspace: result.openingWorkspace,
        energyDemandWorkspace: normalizeEnergyDemandWorkspace(current.energyDemandWorkspace, result.zoneWorkspace, null, current.mechanicalDevices),
        planDocumentWorkspace,
      };
    });
    if (result.canTransfer) {
      setActiveWallSegmentId(result.wallSegments.find((wall) => wall.planPageId === page.id)?.id || null);
      setActiveOpeningId(result.wallOpenings.find((opening) => opening.planPageId === page.id)?.id || null);
    }
    return result;
  }

  function acknowledgePlanPageModelChanges(page: SurveyPlanPage) {
    const result = acknowledgeSurveyPlanModelChanges({
      page,
      registry: draft.planDocumentWorkspace.transferRegistry,
      wallSegments: draft.wallSegments,
      wallOpenings: draft.wallOpenings,
      openingWorkspace: draft.energyOpeningWorkspace,
    });
    markDirty();
    setDraft((current) => ({
      ...current,
      planDocumentWorkspace: {
        ...current.planDocumentWorkspace,
        transferRegistry: result.registry,
        updatedAt: new Date().toISOString(),
      },
    }));
    return result;
  }

  function removePlanPageEnergyTransfer(page: SurveyPlanPage, options: { confirmed: boolean; force?: boolean }): SurveyPlanTransferRemovalResult {
    const result = removeSurveyPlanEnergyTransfer({
      page,
      rooms: draft.rooms,
      wallSegments: draft.wallSegments,
      wallOpenings: draft.wallOpenings,
      assemblies: draft.assemblies,
      zoneWorkspace: draft.energyZoneWorkspace,
      openingWorkspace: draft.energyOpeningWorkspace,
      transferRegistry: draft.planDocumentWorkspace.transferRegistry,
      confirmed: options.confirmed,
      force: options.force,
    });
    markDirty();
    setDraft((current) => {
      const planDocumentWorkspace = {
        ...current.planDocumentWorkspace,
        transferRegistry: result.transferRegistry,
        updatedAt: new Date().toISOString(),
      };
      if (!result.removed) return { ...current, planDocumentWorkspace };
      let wallSegments = result.wallSegments;
      let wallOpenings = result.wallOpenings;
      const affectedLevels = [...new Set(result.affectedRoomIds.map((roomId) => result.rooms.find((room) => room.id === roomId)?.levelId).filter((levelId): levelId is string => Boolean(levelId)))];
      for (const levelId of affectedLevels) {
        const levelRooms = result.rooms.filter((room) => (room.levelId || current.activeLevelId) === levelId);
        const reconciled = reconcileDynamicWallModelForRooms(levelRooms, wallSegments, wallOpenings, current.structures.externalWallType);
        wallSegments = reconciled.wallSegments;
        wallOpenings = reconciled.wallOpenings;
      }
      const energyOpeningWorkspace = normalizeEnergyOpeningWorkspace(result.openingWorkspace, wallOpenings);
      return {
        ...current,
        rooms: result.rooms,
        wallSegments,
        wallOpenings,
        energyOpeningWorkspace,
        energyDemandWorkspace: normalizeEnergyDemandWorkspace(current.energyDemandWorkspace, current.energyZoneWorkspace, null, current.mechanicalDevices),
        planDocumentWorkspace,
      };
    });
    return result;
  }

  function applyPlanVersionToEnergyModel(comparisonId: string, confirmed: boolean): SurveyPlanVersionModelApplicationResult {
    const result = applySurveyPlanVersionModelApplication({
      workspace: draft.planDocumentWorkspace,
      comparisonId,
      rooms: draft.rooms,
      wallSegments: draft.wallSegments,
      wallOpenings: draft.wallOpenings,
      assemblies: draft.assemblies,
      zoneWorkspace: draft.energyZoneWorkspace,
      openingWorkspace: draft.energyOpeningWorkspace,
      confirmed,
    });
    markDirty();
    setDraft((current) => {
      if (!result.applied) return { ...current, planDocumentWorkspace: result.workspace };
      const energyOpeningWorkspace = normalizeEnergyOpeningWorkspace(result.openingWorkspace, result.wallOpenings);
      return {
        ...current,
        rooms: result.rooms,
        wallSegments: result.wallSegments,
        wallOpenings: result.wallOpenings,
        energyZoneWorkspace: result.zoneWorkspace,
        energyOpeningWorkspace,
        energyDemandWorkspace: normalizeEnergyDemandWorkspace(current.energyDemandWorkspace, result.zoneWorkspace, null, current.mechanicalDevices),
        planDocumentWorkspace: result.workspace,
      };
    });
    if (result.applied) {
      setActiveWallSegmentId(result.wallSegments.find((wall) => wall.dataSource === "planTransfer")?.id || null);
      setActiveOpeningId(result.wallOpenings.find((opening) => opening.dataSource === "planTransfer")?.id || null);
    }
    return result;
  }

  function rollbackPlanVersionEnergyModel(comparisonId: string, confirmed: boolean, applicationId?: string | null): SurveyPlanVersionModelApplicationResult {
    const result = rollbackSurveyPlanVersionModelApplication({
      workspace: draft.planDocumentWorkspace,
      comparisonId,
      rooms: draft.rooms,
      wallSegments: draft.wallSegments,
      wallOpenings: draft.wallOpenings,
      assemblies: draft.assemblies,
      zoneWorkspace: draft.energyZoneWorkspace,
      openingWorkspace: draft.energyOpeningWorkspace,
      confirmed,
      applicationId,
    });
    if (!result.rolledBack) return result;
    markDirty();
    setDraft((current) => {
      const energyOpeningWorkspace = normalizeEnergyOpeningWorkspace(result.openingWorkspace, result.wallOpenings);
      return {
        ...current,
        rooms: result.rooms,
        wallSegments: result.wallSegments,
        wallOpenings: result.wallOpenings,
        energyZoneWorkspace: result.zoneWorkspace,
        energyOpeningWorkspace,
        energyDemandWorkspace: normalizeEnergyDemandWorkspace(current.energyDemandWorkspace, result.zoneWorkspace, null, current.mechanicalDevices),
        planDocumentWorkspace: result.workspace,
      };
    });
    setActiveWallSegmentId(result.wallSegments.find((wall) => wall.dataSource === "planTransfer")?.id || null);
    setActiveOpeningId(result.wallOpenings.find((opening) => opening.dataSource === "planTransfer")?.id || null);
    return result;
  }

  function approvePlanDocumentRoom(room: SurveyRoom, suggestion: SurveyPlanSuggestion, page: SurveyPlanPage) {
    if (draft.rooms.some((item) => item.planSuggestionId === suggestion.id)) return;
    markDirty();
    setDraft((current) => {
      if (current.rooms.some((item) => item.planSuggestionId === suggestion.id)) return current;
      const rooms = [...current.rooms, room];
      const levelRooms = rooms.filter((item) => (item.levelId || current.activeLevelId) === page.levelId);
      const reconciled = reconcileDynamicWallModelForRooms(levelRooms, current.wallSegments, current.wallOpenings, current.structures.externalWallType || "Tervdokumentáció alapján ellenőrzendő");
      return {
        ...current,
        rooms,
        activeLevelId: page.levelId,
        northAngle: page.northAngle,
        wallSegments: reconciled.wallSegments,
        wallOpenings: reconciled.wallOpenings,
      };
    });
    setActiveRoomId(room.id);
  }

  function addRoom() {
    addRoomFromRectangle();
  }

  function startRoomDrawing() {
    setIssuePlacementMode(null);
    setPhotoPlacementMode(null);
    setMechanicalPlacementMode(null);
    setRoomDrawingMode(true);
    setActiveStep("plan");
  }

  function deleteRoom() {
    if (!activeRoom) return;
    const wallIds = new Set(draft.wallSegments.filter((segment) => segment.roomId === activeRoom.id).map((segment) => segment.id));
    const nextRooms = draft.rooms.filter((room) => room.id !== activeRoom.id);
    const nextActiveRooms = nextRooms.filter((room) => room.levelId === draft.activeLevelId);
    const remainingSegments = draft.wallSegments.filter((segment) => segment.roomId !== activeRoom.id);
    const remainingOpenings = draft.wallOpenings.filter((opening) => !wallIds.has(opening.wallSegmentId));
    const reconciled = reconcileDynamicWallModelForRooms(nextActiveRooms, remainingSegments, remainingOpenings, draft.structures.externalWallType);
    markDirty();
    setDraft((current) => ({ ...current, rooms: nextRooms, wallSegments: reconciled.wallSegments, wallOpenings: reconciled.wallOpenings, photoPoints: current.photoPoints.map((point) => point.roomId === activeRoom.id ? { ...point, roomId: "", updatedAt: new Date().toISOString() } : point), mechanicalDevices: current.mechanicalDevices.filter((device) => device.roomId !== activeRoom.id) }));
    setIssues((current) => current.map((issue) => issue.roomId === activeRoom.id ? { ...issue, roomId: "", updatedAt: new Date().toISOString() } : issue));
    setActiveRoomId(nextActiveRooms[0]?.id || "");
    setActiveWallSegmentId(reconciled.wallSegments.find((segment) => segment.levelId === draft.activeLevelId)?.id || null);
    setActiveOpeningId(null);
    setMeasurementTarget(null);
    setMeasurementWaiting(false);
    setActivePhotoId(null);
    setActiveMechanicalDeviceId(null);
  }

  function selectIssue(issueId: string) {
    const issue = issues.find((item) => item.id === issueId);
    const issueRoom = issue?.roomId ? draft.rooms.find((room) => room.id === issue.roomId) : null;
    if (issueRoom?.levelId && issueRoom.levelId !== draft.activeLevelId) {
      const targetWalls = draft.wallSegments.filter((segment) => segment.levelId === issueRoom.levelId);
      updateDraft("activeLevelId", issueRoom.levelId);
      setActiveWallSegmentId(targetWalls[0]?.id || null);
      setActiveOpeningId(null);
    }
    setActiveIssueId(issueId);
    setActiveStep("issues");
    setIssuePlacementMode(null);
    if (issueRoom) setActiveRoomId(issueRoom.id);
  }

  function placeIssue(position: { xPercent: number; yPercent: number; roomId: string }) {
    markDirty();
    if (issuePlacementMode === "move" && activeIssue) {
      setIssues((current) => current.map((issue) => issue.id === activeIssue.id ? {
        ...issue,
        xPercent: position.xPercent,
        yPercent: position.yPercent,
        roomId: position.roomId,
        updatedAt: new Date().toISOString(),
      } : issue));
      if (position.roomId) setActiveRoomId(position.roomId);
    } else {
      const issue = createPropertySurveyIssue({ issues, ...position });
      setIssues((current) => [...current, issue]);
      setActiveIssueId(issue.id);
      if (position.roomId) setActiveRoomId(position.roomId);
    }
    setIssuePlacementMode(null);
    setActiveStep("issues");
  }

  function updateIssue(issueId: string, patch: Partial<PropertySurveyIssue>) {
    markDirty();
    setIssues((current) => current.map((issue) => issue.id === issueId ? { ...issue, ...patch } : issue));
  }

  function deleteIssue(issueId: string) {
    markDirty();
    setIssues((current) => {
      const next = current.filter((issue) => issue.id !== issueId);
      setActiveIssueId(next[0]?.id || null);
      return next;
    });
    setIssuePlacementMode(null);
  }

  function updateThermalBoundary(patch: Partial<SurveyThermalBoundarySettings>) {
    markDirty();
    setDraft((current) => ({ ...current, thermalBoundaries: current.thermalBoundaries.some((item) => item.levelId === current.activeLevelId)
      ? current.thermalBoundaries.map((item) => item.levelId === current.activeLevelId ? { ...item, ...patch } : item)
      : [...current.thermalBoundaries, { ...createDefaultThermalBoundary(current.activeLevelId), ...patch }] }));
  }

  function fitThermalBoundary() {
    const sourceRooms = activeThermalBoundary.mode === "heatedRooms" ? activeRooms.filter((room) => room.heated) : activeRooms;
    if (!sourceRooms.length) return;
    const x = Math.min(...sourceRooms.map((room) => room.x));
    const y = Math.min(...sourceRooms.map((room) => room.y));
    const maxX = Math.max(...sourceRooms.map((room) => room.x + room.width));
    const maxY = Math.max(...sourceRooms.map((room) => room.y + room.depth));
    updateThermalBoundary({ mode: "manual", manualX: x, manualY: y, manualWidth: maxX - x, manualHeight: maxY - y, updatedAt: new Date().toISOString() });
  }

  function addAssembly(assembly: SurveyConstructionAssembly) {
    markDirty();
    setDraft((current) => ({ ...current, assemblies: [...current.assemblies, assembly] }));
  }

  function updateAssembly(assemblyId: string, patch: Partial<SurveyConstructionAssembly>) {
    markDirty();
    setDraft((current) => ({ ...current, assemblies: current.assemblies.map((assembly) => assembly.id === assemblyId ? { ...assembly, ...patch } : assembly) }));
  }

  function deleteAssembly(assemblyId: string) {
    markDirty();
    setDraft((current) => ({
      ...current,
      assemblies: current.assemblies.filter((assembly) => assembly.id !== assemblyId),
      wallSegments: current.wallSegments.map((segment) => segment.assemblyId === assemblyId ? { ...segment, assemblyId: undefined } : segment),
      rooms: current.rooms.map((room) => ({ ...room, floorAssemblyId: room.floorAssemblyId === assemblyId ? undefined : room.floorAssemblyId, ceilingAssemblyId: room.ceilingAssemblyId === assemblyId ? undefined : room.ceilingAssemblyId, plinthAssemblyId: room.plinthAssemblyId === assemblyId ? undefined : room.plinthAssemblyId })),
    }));
  }

  function assignRoomAssembly(field: "floorAssemblyId" | "ceilingAssemblyId" | "plinthAssemblyId", assemblyId: string) {
    updateRoom({ [field]: assemblyId || undefined });
  }

  function selectPhoto(photoId: string) {
    const point = draft.photoPoints.find((item) => item.id === photoId);
    if (!point) return;
    setActivePhotoId(point.id);
    setActiveRoomId(point.roomId || activeRoomId);
    setActiveStep("photos");
    setPhotoPlacementMode(null);
  }

  function placePhoto(position: { xPercent: number; yPercent: number; roomId: string }) {
    markDirty();
    if (photoPlacementMode === "move" && activePhotoPoint) {
      setDraft((current) => ({ ...current, photoPoints: current.photoPoints.map((point) => point.id === activePhotoPoint.id ? { ...point, ...position, levelId: current.activeLevelId, updatedAt: new Date().toISOString() } : point) }));
    } else {
      const point = createSurveyPhotoPoint({ points: draft.photoPoints, levelId: draft.activeLevelId, ...position });
      setDraft((current) => ({ ...current, photoPoints: [...current.photoPoints, point] }));
      setActivePhotoId(point.id);
    }
    if (position.roomId) setActiveRoomId(position.roomId);
    setPhotoPlacementMode(null);
    setActiveStep("photos");
  }

  function updatePhoto(photoId: string, patch: Partial<SurveyPhotoPoint>) {
    markDirty();
    setDraft((current) => {
      const photoPoints = current.photoPoints.map((point) => point.id === photoId ? { ...point, ...patch } : point);
      return { ...current, photoPoints, photoNames: photoPoints.map((point) => point.fileName).filter((value): value is string => Boolean(value)) };
    });
  }

  function deletePhoto(photoId: string) {
    markDirty();
    setDraft((current) => { const photoPoints = current.photoPoints.filter((point) => point.id !== photoId); return { ...current, photoPoints, photoNames: photoPoints.map((point) => point.fileName).filter((value): value is string => Boolean(value)) }; });
    setActivePhotoId(draft.photoPoints.find((point) => point.id !== photoId && point.levelId === draft.activeLevelId)?.id || null);
    setPhotoPlacementMode(null);
  }

  function selectMechanicalDevice(deviceId: string) {
    const device = draft.mechanicalDevices.find((item) => item.id === deviceId);
    if (!device) return;
    setActiveMechanicalDeviceId(device.id);
    setActiveRoomId(device.roomId);
    setActiveStep("mechanical");
    setMechanicalPlacementMode(null);
  }

  function placeMechanicalDevice(position: { roomId: string; xRatio: number; yRatio: number }) {
    if (!position.roomId) return;
    markDirty();
    if (mechanicalPlacementMode === "move" && activeMechanicalDevice) {
      setDraft((current) => ({ ...current, mechanicalDevices: current.mechanicalDevices.map((device) => device.id === activeMechanicalDevice.id ? { ...device, ...position, levelId: current.activeLevelId, updatedAt: new Date().toISOString() } : device) }));
    } else {
      const device = createMechanicalDevice({ levelId: draft.activeLevelId, kind: pendingMechanicalKind, ...position });
      setDraft((current) => ({ ...current, mechanicalDevices: [...current.mechanicalDevices, device] }));
      setActiveMechanicalDeviceId(device.id);
    }
    setActiveRoomId(position.roomId);
    setMechanicalPlacementMode(null);
    setActiveStep("mechanical");
  }

  function updateMechanicalDevice(deviceId: string, patch: Partial<(typeof draft.mechanicalDevices)[number]>) {
    markDirty();
    setDraft((current) => {
      const mechanicalDevices = current.mechanicalDevices.map((device) => device.id === deviceId ? { ...device, ...patch } : device);
      return { ...current, mechanicalDevices, energyDemandWorkspace: normalizeEnergyDemandWorkspace(current.energyDemandWorkspace, current.energyZoneWorkspace, null, mechanicalDevices) };
    });
  }

  function deleteMechanicalDevice(deviceId: string) {
    markDirty();
    setDraft((current) => {
      const mechanicalDevices = current.mechanicalDevices.filter((device) => device.id !== deviceId);
      return { ...current, mechanicalDevices, energyDemandWorkspace: normalizeEnergyDemandWorkspace(current.energyDemandWorkspace, current.energyZoneWorkspace, null, mechanicalDevices) };
    });
    setActiveMechanicalDeviceId(draft.mechanicalDevices.find((device) => device.id !== deviceId && device.levelId === draft.activeLevelId)?.id || null);
    setMechanicalPlacementMode(null);
  }

  function moveOpeningOnWall(openingId: string, offsetRatio: number) {
    updateWallOpening(openingId, { offsetRatio: Math.min(1, Math.max(0, offsetRatio)), updatedAt: new Date().toISOString() });
  }

  function captureIndustrialSnapshot(source: PropertySurveyDraft = draft): IndustrialHistorySnapshot {
    return {
      industrialSettings: { ...source.industrialSettings },
      industrialBackground: source.industrialBackground ? { ...source.industrialBackground, pages: source.industrialBackground.pages.map((page) => ({ ...page })), calibrationPoints: source.industrialBackground.calibrationPoints.map((point) => ({ ...point })) } : null,
      industrialBuildingContours: source.industrialBuildingContours.map((contour) => ({ ...contour, points: contour.points.map((point) => ({ ...point })) })),
      pillars: source.pillars.map((pillar) => ({ ...pillar })),
      industrialMarkups: source.industrialMarkups.map((markup) => ({ ...markup, points: markup.points.map((point) => ({ ...point })) })),
    };
  }

  function refreshIndustrialHistoryState() {
    setIndustrialHistoryRevision((current) => current + 1);
  }

  function pushIndustrialUndo(snapshot: IndustrialHistorySnapshot) {
    industrialUndoRef.current = [...industrialUndoRef.current.slice(-39), snapshot];
    industrialRedoRef.current = [];
    refreshIndustrialHistoryState();
  }

  function commitIndustrialChange(mutator: (current: PropertySurveyDraft) => PropertySurveyDraft) {
    pushIndustrialUndo(captureIndustrialSnapshot());
    markDirty();
    setDraft((current) => mutator(current));
  }

  function applyIndustrialSnapshot(snapshot: IndustrialHistorySnapshot) {
    markDirty();
    setDraft((current) => ({
      ...current,
      industrialSettings: snapshot.industrialSettings,
      industrialBackground: snapshot.industrialBackground,
      industrialBuildingContours: snapshot.industrialBuildingContours,
      pillars: snapshot.pillars,
      industrialMarkups: snapshot.industrialMarkups,
    }));
    setIndustrialTool("select");
    setActiveIndustrialPointIndex(null);
  }

  function undoIndustrial() {
    const previous = industrialUndoRef.current.pop();
    if (!previous) return;
    industrialRedoRef.current = [...industrialRedoRef.current.slice(-39), captureIndustrialSnapshot()];
    applyIndustrialSnapshot(previous);
    refreshIndustrialHistoryState();
  }

  function redoIndustrial() {
    const next = industrialRedoRef.current.pop();
    if (!next) return;
    industrialUndoRef.current = [...industrialUndoRef.current.slice(-39), captureIndustrialSnapshot()];
    applyIndustrialSnapshot(next);
    refreshIndustrialHistoryState();
  }

  function beginIndustrialVectorEdit() {
    if (!industrialVectorTransactionRef.current) industrialVectorTransactionRef.current = captureIndustrialSnapshot();
  }

  function endIndustrialVectorEdit() {
    const snapshot = industrialVectorTransactionRef.current;
    industrialVectorTransactionRef.current = null;
    if (!snapshot) return;
    pushIndustrialUndo(snapshot);
    markDirty();
  }

  function updateIndustrialSettings(patch: Partial<SurveyIndustrialSettings>) {
    commitIndustrialChange((current) => ({ ...current, industrialSettings: { ...current.industrialSettings, ...patch } }));
  }

  async function importIndustrialBackground(file: File) {
    const background = await processIndustrialBackgroundFile(file);
    commitIndustrialChange((current) => ({ ...current, industrialBackground: background }));
    setIndustrialTool("select");
  }

  function updateIndustrialBackground(patch: Partial<SurveyIndustrialBackground>) {
    if (!draft.industrialBackground) return;
    commitIndustrialChange((current) => ({ ...current, industrialBackground: current.industrialBackground ? { ...current.industrialBackground, ...patch } : null }));
  }

  function changeIndustrialBackgroundPage(pageIndex: number) {
    if (!draft.industrialBackground) return;
    const patch = getIndustrialBackgroundPagePatch(draft.industrialBackground, pageIndex);
    commitIndustrialChange((current) => ({ ...current, industrialBackground: current.industrialBackground ? { ...current.industrialBackground, ...patch } : null }));
    setIndustrialTool("select");
  }

  function resetIndustrialBackgroundTransform() {
    if (!draft.industrialBackground) return;
    updateIndustrialBackground({ offsetXMeters: 0, offsetYMeters: 0, rotationDegrees: 0, scalePercent: 100, updatedAt: new Date().toISOString() });
  }

  function moveIndustrialBackgroundLive(patch: Pick<SurveyIndustrialBackground, "offsetXMeters" | "offsetYMeters">) {
    markDirty();
    setDraft((current) => ({ ...current, industrialBackground: current.industrialBackground ? { ...current.industrialBackground, ...patch, updatedAt: new Date().toISOString() } : null }));
  }

  function deleteIndustrialBackground() {
    if (!draft.industrialBackground) return;
    commitIndustrialChange((current) => ({ ...current, industrialBackground: null }));
    setIndustrialTool("select");
  }

  function addIndustrialBackgroundCalibrationPoint(position: SurveyIndustrialPoint) {
    const background = draft.industrialBackground;
    if (!background) return;
    const existing = background.calibrationPoints || [];
    if (!existing.length || existing.length >= 2) {
      commitIndustrialChange((current) => ({ ...current, industrialBackground: current.industrialBackground ? { ...current.industrialBackground, calibrationPoints: [position], updatedAt: new Date().toISOString() } : null }));
      return;
    }
    const first = existing[0];
    const measuredDistance = Math.hypot(position.xMeters - first.xMeters, position.yMeters - first.yMeters);
    if (measuredDistance < 0.001) return;
    const scaleFactor = background.calibrationDistanceMeters / measuredDistance;
    const now = new Date().toISOString();
    commitIndustrialChange((current) => ({
      ...current,
      industrialSettings: {
        ...current.industrialSettings,
        planWidthMeters: Number((current.industrialSettings.planWidthMeters * scaleFactor).toFixed(3)),
        planHeightMeters: Number((current.industrialSettings.planHeightMeters * scaleFactor).toFixed(3)),
        updatedAt: now,
      },
      industrialBackground: current.industrialBackground ? {
        ...current.industrialBackground,
        calibrationPoints: [],
        calibrationScaleFactor: scaleFactor,
        calibratedAt: now,
        updatedAt: now,
      } : null,
    }));
    setIndustrialTool("select");
  }

  function createBuildingContour(points: SurveyIndustrialPoint[]) {
    const snappedPoints = points.map((point, index) => snapIndustrialPoint({ point, settings: draft.industrialSettings, previousPoint: index > 0 ? points[index - 1] : null }));
    const contour = createIndustrialBuildingContour({ levelId: draft.activeLevelId, points: snappedPoints, contours: draft.industrialBuildingContours });
    commitIndustrialChange((current) => ({ ...current, industrialBuildingContours: [...current.industrialBuildingContours, contour] }));
    setActiveIndustrialBuildingContourId(contour.id);
    setActivePillarId(null);
    setActiveIndustrialMarkupId(null);
    setActiveIndustrialPointIndex(null);
    setIndustrialTool("select");
    setActiveStep("industrial");
  }

  function updateBuildingContour(contourId: string, patch: Partial<SurveyIndustrialBuildingContour>) {
    commitIndustrialChange((current) => ({ ...current, industrialBuildingContours: current.industrialBuildingContours.map((contour) => contour.id === contourId ? { ...contour, ...patch } : contour) }));
  }

  function moveBuildingContourPointLive(contourId: string, pointIndex: number, position: SurveyIndustrialPoint) {
    markDirty();
    setDraft((current) => ({ ...current, industrialBuildingContours: current.industrialBuildingContours.map((contour) => {
      if (contour.id !== contourId) return contour;
      const previousPoint = contour.points[(pointIndex - 1 + contour.points.length) % contour.points.length];
      const nextPoint = contour.points[(pointIndex + 1) % contour.points.length];
      const snapped = snapIndustrialPoint({ point: position, settings: current.industrialSettings, previousPoint, nextPoint });
      return { ...contour, points: contour.points.map((point, index) => index === pointIndex ? snapped : point), updatedAt: new Date().toISOString() };
    }) }));
  }

  function insertBuildingContourPoint(contourId: string, afterIndex: number | null) {
    const contour = draft.industrialBuildingContours.find((item) => item.id === contourId);
    if (!contour) return;
    const inserted = insertIndustrialPoint(contour.points, afterIndex, true);
    if (inserted.insertedIndex < 0) return;
    commitIndustrialChange((current) => ({ ...current, industrialBuildingContours: current.industrialBuildingContours.map((item) => item.id === contourId ? { ...item, points: inserted.points, updatedAt: new Date().toISOString() } : item) }));
    setActiveIndustrialPointIndex(inserted.insertedIndex);
  }

  function deleteBuildingContourPoint(contourId: string, pointIndex: number) {
    const contour = draft.industrialBuildingContours.find((item) => item.id === contourId);
    if (!contour || contour.points.length <= 3) return;
    const points = deleteIndustrialPoint(contour.points, pointIndex, true);
    commitIndustrialChange((current) => ({ ...current, industrialBuildingContours: current.industrialBuildingContours.map((item) => item.id === contourId ? { ...item, points, updatedAt: new Date().toISOString() } : item) }));
    setActiveIndustrialPointIndex(Math.min(pointIndex, points.length - 1));
  }

  function deleteBuildingContour(contourId: string) {
    commitIndustrialChange((current) => ({ ...current, industrialBuildingContours: current.industrialBuildingContours.filter((contour) => contour.id !== contourId) }));
    setActiveIndustrialBuildingContourId(activeIndustrialBuildingContours.find((contour) => contour.id !== contourId)?.id || null);
    setActiveIndustrialPointIndex(null);
  }

  function placePillar(position: SurveyIndustrialPoint) {
    const snapped = snapIndustrialPoint({ point: position, settings: draft.industrialSettings });
    const pillar = createSurveyPillar({ levelId: draft.activeLevelId, ...snapped, pillars: draft.pillars });
    commitIndustrialChange((current) => ({ ...current, pillars: [...current.pillars, pillar] }));
    setActiveIndustrialBuildingContourId(null);
    setActivePillarId(pillar.id);
    setActiveIndustrialMarkupId(null);
    setActiveIndustrialPointIndex(null);
    setIndustrialTool("select");
    setActiveStep("industrial");
  }

  function updatePillar(pillarId: string, patch: Partial<SurveyPillar>) {
    commitIndustrialChange((current) => ({ ...current, pillars: current.pillars.map((pillar) => pillar.id === pillarId ? { ...pillar, ...patch } : pillar) }));
  }

  function movePillarLive(pillarId: string, position: SurveyIndustrialPoint) {
    markDirty();
    setDraft((current) => {
      const snapped = snapIndustrialPoint({ point: position, settings: current.industrialSettings });
      return { ...current, pillars: current.pillars.map((pillar) => pillar.id === pillarId ? { ...pillar, ...snapped, updatedAt: new Date().toISOString() } : pillar) };
    });
  }

  function generatePillarGrid(input: Omit<SurveyPillarGridInput, "levelId">) {
    const generated = createSurveyPillarGrid({ ...input, levelId: draft.activeLevelId }, draft.pillars, draft.industrialSettings);
    if (!generated.length) return;
    commitIndustrialChange((current) => ({ ...current, pillars: [...current.pillars, ...generated] }));
    setActiveIndustrialBuildingContourId(null);
    setActiveIndustrialMarkupId(null);
    setActivePillarId(generated[generated.length - 1].id);
    setActiveIndustrialPointIndex(null);
    setIndustrialTool("select");
  }

  function deletePillar(pillarId: string) {
    commitIndustrialChange((current) => ({ ...current, pillars: current.pillars.filter((pillar) => pillar.id !== pillarId) }));
    setActivePillarId(activePillars.find((pillar) => pillar.id !== pillarId)?.id || null);
    setActiveIndustrialPointIndex(null);
  }

  function createMarkup(kind: SurveyIndustrialMarkupKind, points: SurveyIndustrialPoint[]) {
    const snappedPoints = points.map((point, index) => snapIndustrialPoint({ point, settings: draft.industrialSettings, previousPoint: index > 0 ? points[index - 1] : null }));
    const markup = createIndustrialMarkup({ levelId: draft.activeLevelId, kind, points: snappedPoints, markups: draft.industrialMarkups });
    commitIndustrialChange((current) => ({ ...current, industrialMarkups: [...current.industrialMarkups, markup] }));
    setActiveIndustrialBuildingContourId(null);
    setActiveIndustrialMarkupId(markup.id);
    setActivePillarId(null);
    setActiveIndustrialPointIndex(null);
    setIndustrialTool("select");
    setActiveStep("industrial");
  }

  function updateIndustrialMarkup(markupId: string, patch: Partial<SurveyIndustrialMarkup>) {
    commitIndustrialChange((current) => ({ ...current, industrialMarkups: current.industrialMarkups.map((markup) => markup.id === markupId ? { ...markup, ...patch } : markup) }));
  }

  function moveIndustrialMarkupPointLive(markupId: string, pointIndex: number, position: SurveyIndustrialPoint) {
    markDirty();
    setDraft((current) => ({ ...current, industrialMarkups: current.industrialMarkups.map((markup) => {
      if (markup.id !== markupId) return markup;
      const previousPoint = pointIndex > 0 ? markup.points[pointIndex - 1] : markup.closed ? markup.points[markup.points.length - 1] : null;
      const nextPoint = pointIndex < markup.points.length - 1 ? markup.points[pointIndex + 1] : markup.closed ? markup.points[0] : null;
      const snapped = snapIndustrialPoint({ point: position, settings: current.industrialSettings, previousPoint, nextPoint });
      return { ...markup, points: markup.points.map((point, index) => index === pointIndex ? snapped : point), updatedAt: new Date().toISOString() };
    }) }));
  }

  function insertMarkupPoint(markupId: string, afterIndex: number | null) {
    const markup = draft.industrialMarkups.find((item) => item.id === markupId);
    if (!markup) return;
    const inserted = insertIndustrialPoint(markup.points, afterIndex, markup.closed);
    if (inserted.insertedIndex < 0) return;
    commitIndustrialChange((current) => ({ ...current, industrialMarkups: current.industrialMarkups.map((item) => item.id === markupId ? { ...item, points: inserted.points, updatedAt: new Date().toISOString() } : item) }));
    setActiveIndustrialPointIndex(inserted.insertedIndex);
  }

  function deleteMarkupPoint(markupId: string, pointIndex: number) {
    const markup = draft.industrialMarkups.find((item) => item.id === markupId);
    const minimum = markup?.closed ? 3 : 2;
    if (!markup || markup.points.length <= minimum) return;
    const points = deleteIndustrialPoint(markup.points, pointIndex, markup.closed);
    commitIndustrialChange((current) => ({ ...current, industrialMarkups: current.industrialMarkups.map((item) => item.id === markupId ? { ...item, points, updatedAt: new Date().toISOString() } : item) }));
    setActiveIndustrialPointIndex(Math.min(pointIndex, points.length - 1));
  }

  function deleteIndustrialMarkup(markupId: string) {
    commitIndustrialChange((current) => ({ ...current, industrialMarkups: current.industrialMarkups.filter((markup) => markup.id !== markupId) }));
    setActiveIndustrialMarkupId(activeIndustrialMarkups.find((markup) => markup.id !== markupId)?.id || null);
    setActiveIndustrialPointIndex(null);
  }

  function markExportComplete(message: string) {
    const now = new Date().toISOString();
    setExportState("done");
    setExportMessage(message);
    setLastExportAt(now);
  }

  function exportDxf() {
    try {
      setExportState("working");
      setExportMessage("DXF fájl készítése...");
      const dxf = isIndustrialMode
        ? createIndustrialDxf({ projectName: activeProject?.name, surveyName: draft.surveyName, levelName: activeLevel?.name || "Szint", settings: draft.industrialSettings, rooms: activeRooms, buildingContours: activeIndustrialBuildingContours, pillars: activePillars, markups: activeIndustrialMarkups, sectionLines: activeSectionLines })
        : createSurveyPlanDxf({ projectName: activeProject?.name, surveyName: draft.surveyName, levelName: activeLevel?.name || "Szint", rooms: activeRooms, wallSegments: activeWallSegments, wallOpenings: activeWallOpenings, thermalBoundary: thermalLayerAvailable ? activeThermalBoundary : undefined, photoPoints: activePhotoPoints, issues: activeLevelIssues, sectionLines: activeSectionLines });
      const fileBase = getSurveyExportFileBase({ surveyName: draft.surveyName, levelName: activeLevel?.name });
      downloadSurveyBlob(new Blob([dxf], { type: "application/dxf;charset=utf-8" }), `${fileBase}.dxf`);
      markExportComplete("DXF export elkészült");
    } catch (error) {
      setExportState("error");
      setExportMessage(error instanceof Error ? error.message : "A DXF export sikertelen.");
    }
  }

  function saveNow() {
    if (!activeSurveyId) return;
    try {
      const now = new Date().toISOString();
      const nextDraft = { ...draft, updatedAt: now };
      const next: PropertySurveyWorkspace = {
        ...workspace,
        activeProjectId: selectedProjectId,
        activeSurveyId,
        updatedAt: now,
        surveys: workspace.surveys.map((survey) => survey.id === activeSurveyId ? {
          ...survey,
          name: nextDraft.surveyName,
          surveyMode: nextDraft.surveyMode,
          status: survey.status === "completed" ? "completed" : "in_progress",
          draft: nextDraft,
          issues,
          updatedAt: now,
        } : survey),
      };
      commitWorkspace(next);
      window.localStorage.setItem(LEGACY_SURVEY_KEY, JSON.stringify(nextDraft));
      window.localStorage.setItem(LEGACY_ISSUE_KEY, JSON.stringify(issues));
      setDraft(nextDraft);
      setSaveState("saved");
    } catch {
      setSaveState("dirty");
    }
  }

  function getNextRevisionNumber() {
    return localVersions.filter((version) => version.surveyId === activeSurveyId).reduce((maximum, version) => Math.max(maximum, version.revisionNumber), 0) + 1;
  }

  function persistLocalVersion(version: PropertySurveyLocalVersion) {
    const next = [version, ...localVersions.filter((item) => item.id !== version.id)].slice(0, 100);
    setLocalVersions(next);
    window.localStorage.setItem(PROPERTY_SURVEY_VERSION_HISTORY_KEY, JSON.stringify(next));
  }

  function createDimproPayload(revisionNumber = getNextRevisionNumber(), driveStatus: PropertySurveyLocalVersion["driveStatus"] = "local") {
    return {
      schema: "dimpro.property-survey.v0.8.4.3",
      fileType: "DIMPRO_SURVEY_WORKFILE",
      exportedAt: new Date().toISOString(),
      sourceModule: "DIMPRO Felmérő",
      revision: {
        id: `survey-revision-${activeSurveyId || "local"}-${revisionNumber}-${Date.now()}`,
        number: revisionNumber,
        parentRevisionId: localVersions.find((version) => version.surveyId === activeSurveyId)?.id || null,
        note: versionNote.trim(),
        driveStatus,
      },
      project: activeProject,
      survey: activeSurvey ? { id: activeSurvey.id, projectId: activeSurvey.projectId, name: activeSurvey.name, startMode: activeSurvey.startMode, status: activeSurvey.status } : null,
      draft,
      issues,
      calculated: {
        totalArea,
        heatedArea,
        totalWindows,
        totalDoors,
        volume: draft.rooms.reduce((sum, room) => sum + room.area * getRoomUsableHeight(room), 0),
        thermalBoundaryMeters: activeThermalSummary.totalMeters,
        energySummary,
        energyGeometry,
        energyAssemblies,
        energyZones,
        energyOpenings,
        energyDemand,
        energyRenewables,
        energyRenovationComparison,
        winWattFieldMap,
        winWattTrialFeedback,
      },
    };
  }

  function registerWorkfileVersion(input: { revisionNumber: number; fileName: string; driveStatus: PropertySurveyLocalVersion["driveStatus"] }) {
    const version: PropertySurveyLocalVersion = {
      id: `survey-version-${activeSurveyId || "local"}-${input.revisionNumber}-${Date.now()}`,
      surveyId: activeSurveyId || "local",
      revisionNumber: input.revisionNumber,
      createdAt: new Date().toISOString(),
      fileName: input.fileName,
      note: versionNote.trim(),
      schema: "dimpro.property-survey.v0.8.4.3",
      driveStatus: input.driveStatus,
    };
    persistLocalVersion(version);
    setVersionNote("");
  }

  function exportDimproWorkfile() {
    try {
      setExportState("working");
      setExportMessage("Verziózott DIMPRO munkafájl készítése...");
      const revisionNumber = getNextRevisionNumber();
      const fileBase = getSurveyExportFileBase({ surveyName: draft.surveyName });
      const fileName = `${fileBase}_v${String(revisionNumber).padStart(3, "0")}.dimpro`;
      const payload = createDimproPayload(revisionNumber, "local");
      const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/vnd.dimpro.survey+json;charset=utf-8" });
      downloadSurveyBlob(blob, fileName);
      registerWorkfileVersion({ revisionNumber, fileName, driveStatus: "local" });
      markExportComplete(`DIMPRO munkafájl v${revisionNumber} elkészült`);
    } catch (error) {
      setExportState("error");
      setExportMessage(error instanceof Error ? error.message : "A DIMPRO munkafájl mentése sikertelen.");
    }
  }

  async function saveDimproWorkfileToDrive() {
    try {
      setExportState("working");
      setExportMessage("DIMPRO Drive projektverzió mentése...");
      const revisionNumber = getNextRevisionNumber();
      const fileBase = getSurveyExportFileBase({ surveyName: draft.surveyName });
      const fileName = `${fileBase}_v${String(revisionNumber).padStart(3, "0")}.dimpro`;
      const payload = createDimproPayload(revisionNumber, "drive-ready");
      const response = await fetch("/api/property-survey/drive-save", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ projectId: activeProject?.id || "projectless", surveyId: activeSurveyId || "local", fileName, payload }),
      });
      const result = await response.json().catch(() => ({})) as { ok?: boolean; error?: string; relativePath?: string };
      if (!response.ok || !result.ok) throw new Error(result.error || "A DIMPRO Drive mentés nem sikerült. Jelentkezz be a DIMPRO fiókba, majd próbáld újra.");
      registerWorkfileVersion({ revisionNumber, fileName, driveStatus: "drive-ready" });
      markExportComplete(`DIMPRO Drive mentés elkészült: ${result.relativePath || fileName}`);
    } catch (error) {
      setExportState("error");
      setExportMessage(error instanceof Error ? error.message : "A DIMPRO Drive mentés sikertelen.");
    }
  }

  async function importDimproWorkfile(file: File) {
    setExportState("working");
    setExportMessage("DIMPRO munkafájl beolvasása...");
    try {
      const payload = JSON.parse(await file.text()) as { schema?: string; draft?: PropertySurveyDraft; issues?: PropertySurveyIssue[] };
      if (!payload.schema?.startsWith("dimpro.property-survey.") || !payload.draft) throw new Error("A kiválasztott fájl nem érvényes DIMPRO felmérési munkafájl.");
      if (!window.confirm("A DIMPRO munkafájl betöltése lecseréli az aktuális felmérés adatait. Folytatod?")) {
        setExportState("idle");
        setExportMessage("A munkafájl betöltése megszakítva");
        return;
      }
      const normalized = normalizePropertySurveyDraft(payload.draft, activeProject?.id || "local");
      const importedIssues = Array.isArray(payload.issues) ? payload.issues : [];
      setDraft(normalized);
      setIssues(importedIssues);
      setActiveRoomId(normalized.rooms.find((room) => (room.levelId || normalized.activeLevelId) === normalized.activeLevelId)?.id || "");
      setActiveWallSegmentId(normalized.wallSegments.find((segment) => segment.levelId === normalized.activeLevelId)?.id || null);
      setActiveOpeningId(null);
      setActiveSectionLineId(normalized.sectionLines.find((line) => line.levelId === normalized.activeLevelId)?.id || null);
      setSectionDrawingMode(false);
      setActiveIssueId(importedIssues[0]?.id || null);
      setActivePhotoId(normalized.photoPoints.find((point) => point.levelId === normalized.activeLevelId)?.id || null);
      setActiveMechanicalDeviceId(normalized.mechanicalDevices.find((device) => device.levelId === normalized.activeLevelId)?.id || null);
      setOrientationControlsOpen(false);
      setSaveState("dirty");
      setExportState("done");
      setExportMessage("DIMPRO munkafájl betöltve");
    } catch (error) {
      setExportState("error");
      setExportMessage(error instanceof Error ? error.message : "A DIMPRO munkafájl beolvasása sikertelen.");
    } finally {
      if (dimproImportRef.current) dimproImportRef.current.value = "";
    }
  }

  async function exportPdf() {
    setExportState("working");
    setExportMessage(`${draft.levels.length} szintes, vektoros PDF dokumentumcsomag készítése...`);
    try {
      const revisionNumber = getNextRevisionNumber();
      const blob = await createSurveyBuildingVectorPdf({ project: activeProject, draft, issues, energySummary, energyAssemblies, energyZones, energyOpenings, energyDemand, energyRenewables, energyRenovationComparison, revisionNumber });
      const fileBase = getSurveyExportFileBase({ surveyName: draft.surveyName, planSheet: draft.planSheet });
      downloadSurveyBlob(blob, `${fileBase}_teljes_epulet.pdf`);
      markExportComplete(`Többoldalas vektoros PDF elkészült · ${draft.levels.length} szint · ${draft.sectionLines.length} metszet`);
    } catch (error) {
      setExportState("error");
      setExportMessage(error instanceof Error ? error.message : "A PDF export sikertelen.");
    }
  }

  async function exportWinWattWorkbook() {
    try {
      setExportState("working");
      setExportMessage("WinWatt-előkészítő Excel munkafüzet készítése...");
      const blob = await createWinWattTransferWorkbookBlob({
        tables: expertTables,
        projectName: activeProject?.name || "Projekt nélküli felmérés",
        surveyName: draft.surveyName,
        fieldMap: winWattFieldMap,
        trialWorkspace: draft.energyWinWattTrialWorkspace,
        trialFeedback: winWattTrialFeedback,
      });
      const fileBase = getSurveyExportFileBase({ surveyName: draft.surveyName });
      downloadSurveyBlob(blob, `${fileBase}_winwatt_elokeszito_v084.xlsx`);
      markExportComplete("WinWatt-előkészítő Excel munkafüzet elkészült");
    } catch (error) {
      setExportState("error");
      setExportMessage(error instanceof Error ? error.message : "A WinWatt-előkészítő Excel export sikertelen.");
    }
  }

  async function exportWinWattTrialPackage() {
    try {
      setExportState("working");
      setExportMessage("WinWatt próbaátadási ZIP-csomag készítése...");
      const projectName = activeProject?.name || "Projekt nélküli felmérés";
      const workbookBlob = await createWinWattTransferWorkbookBlob({ tables: expertTables, projectName, surveyName: draft.surveyName, fieldMap: winWattFieldMap, trialWorkspace: draft.energyWinWattTrialWorkspace, trialFeedback: winWattTrialFeedback });
      const packageData = createWinWattCompatiblePackage({ project: activeProject, draft, summary: energySummary, zones: energyZones, openings: energyOpenings, demand: energyDemand, renewables: energyRenewables, renovationComparison: energyRenovationComparison, fieldMap: winWattFieldMap, trialFeedback: winWattTrialFeedback });
      const blob = await createWinWattTrialPackageBlob({ workbookBlob, packageData, fieldMap: winWattFieldMap, trialWorkspace: draft.energyWinWattTrialWorkspace, trialFeedback: winWattTrialFeedback, projectName, surveyName: draft.surveyName });
      const fileBase = getSurveyExportFileBase({ surveyName: draft.surveyName });
      downloadSurveyBlob(blob, `${fileBase}_winwatt_probaatadas_v084.zip`);
      markExportComplete("WinWatt próbaátadási ZIP-csomag elkészült");
    } catch (error) {
      setExportState("error");
      setExportMessage(error instanceof Error ? error.message : "A WinWatt próbaátadási csomag exportja sikertelen.");
    }
  }

  function exportWinWattJson() {
    try {
      const packageData = createWinWattCompatiblePackage({ project: activeProject, draft, summary: energySummary, zones: energyZones, openings: energyOpenings, demand: energyDemand, renewables: energyRenewables, renovationComparison: energyRenovationComparison, fieldMap: winWattFieldMap, trialFeedback: winWattTrialFeedback });
      const fileBase = getSurveyExportFileBase({ surveyName: draft.surveyName });
      downloadSurveyBlob(new Blob([JSON.stringify(packageData, null, 2)], { type: "application/json;charset=utf-8" }), `${fileBase}_winwatt_adatcsomag.json`);
      markExportComplete("WinWatt-előkészítő JSON adatcsomag elkészült");
    } catch (error) {
      setExportState("error");
      setExportMessage(error instanceof Error ? error.message : "A WinWatt-előkészítő adatcsomag exportja sikertelen.");
    }
  }

  function exportWinWattCsv() {
    try {
      const fileBase = getSurveyExportFileBase({ surveyName: draft.surveyName });
      downloadSurveyBlob(new Blob([createWinWattCompatibleCsv(energySummary)], { type: "text/csv;charset=utf-8" }), `${fileBase}_winwatt_falfeluletek.csv`);
      markExportComplete("WinWatt-kompatibilis CSV elkészült");
    } catch (error) {
      setExportState("error");
      setExportMessage(error instanceof Error ? error.message : "A WinWatt CSV exportja sikertelen.");
    }
  }

  function openMap() {
    const query = composePropertySurveyAddress(draft.property) || draft.property.address || draft.property.settlement || "Magyarország";
    window.open(`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}`, "_blank", "noopener,noreferrer");
  }

  function goStep(offset: number) {
    const currentIndex = steps.findIndex((step) => step.id === activeStep);
    const next = steps[Math.min(steps.length - 1, Math.max(0, currentIndex + offset))];
    setActiveStep(next.id);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  const inputClass = "h-11 w-full rounded-xl border border-[var(--survey-border)] bg-[var(--survey-panel-strong)] px-3 text-sm font-bold text-[var(--survey-text)] outline-none transition focus:border-cyan-500 focus:ring-4 focus:ring-cyan-500/10";

  function selectOverlapRoom(roomId: string) {
    clearFocusDrawingModes();
    setActiveRoomId(roomId);
    setActiveStep("plan");
    if (drawingFocusMode) setFocusRightOpen(true);
  }

  function renderRoomOverlapWarnings() {
    if (!activeRoomOverlapDetails.length) return null;
    return <div className="grid gap-3" data-room-overlap-warning-list>
      <div className="rounded-2xl border border-rose-300 bg-rose-50 p-3 text-rose-950"><div className="flex items-start gap-3"><AlertTriangle size={20} className="mt-0.5 shrink-0 text-rose-600" /><div><div className="text-sm font-black">{activeRoomOverlapDetails.length} geometriai helyiségátfedés ellenőrzendő</div><div className="mt-1 text-xs font-semibold leading-5">A hibák alapból összecsukva jelennek meg. Nyisd meg azt az átfedést, amelyet javítani szeretnél. Amint a két helyiség már nem fedi egymást, az adott hibakártya automatikusan eltűnik.</div></div></div></div>
      {activeRoomOverlapDetails.map((overlap, overlapIndex) => <details key={`${overlap.roomAId}-${overlap.roomBId}`} data-room-overlap-item={overlapIndex + 1} className="group rounded-2xl border border-rose-300 bg-white text-slate-950 shadow-sm">
        <summary className="flex cursor-pointer list-none flex-wrap items-center justify-between gap-3 rounded-2xl p-3 marker:hidden hover:bg-rose-50/60">
          <div className="flex min-w-0 items-center gap-3"><span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl border border-rose-200 bg-rose-50 text-rose-700"><AlertTriangle size={17} /></span><div className="min-w-0"><div className="text-[10px] font-black uppercase tracking-[0.08em] text-rose-700">Átfedés #{overlapIndex + 1} · részletek megnyitása</div><div className="mt-1 truncate text-sm font-black">{overlap.roomA?.name || overlap.roomAId} ↔ {overlap.roomB?.name || overlap.roomBId}</div></div></div>
          <div className="flex items-center gap-3"><div className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-right"><div className="text-[9px] font-black uppercase text-rose-700">Átfedő terület</div><div className="text-lg font-black">{overlap.overlapAreaSquareMeters.toFixed(2).replace('.',',')} m²</div></div><span className="text-xl font-black text-rose-700 transition group-open:rotate-45">+</span></div>
        </summary>
        <div className="border-t border-rose-100 p-3 pt-4">
          <div className="text-[10px] font-bold text-slate-600">Mérete: {(overlap.overlapWidthPlanUnits / 60).toFixed(2).replace('.',',')} × {(overlap.overlapHeightPlanUnits / 60).toFixed(2).replace('.',',')} m</div>
          <div className="mt-3 rounded-xl border border-slate-200 bg-slate-50 p-3"><div className="text-[9px] font-black uppercase text-slate-600">Érintett falmodell-elemek</div>{overlap.affectedSegments.length ? <div className="mt-2 grid gap-1.5">{overlap.affectedSegments.map((segment) => { const owner = activeRooms.find((room) => room.id === segment.roomId); return <div key={segment.id} data-overlap-wall-segment={segment.id} className="rounded-lg border border-slate-200 bg-white px-2.5 py-2 text-[10px] font-bold"><strong>{owner?.name || segment.roomId}</strong> · {surveyWallSideLabels[segment.side]} · {surveyWallBoundaryLabels[segment.boundaryType]} · {owner ? getWallSegmentLengthMeters(owner, segment).toFixed(2).replace('.',',') : '–'} m</div>; })}</div> : <div className="mt-2 text-xs font-semibold text-slate-600">A falmodell még nem hozott létre külön közös falszakaszt; a geometriai metszés ettől függetlenül fennáll.</div>}</div>
          <div className="mt-3 text-xs font-semibold leading-5 text-slate-700">Javaslat: elsőként a kisebb helyiséget, <strong>{overlap.suggestedRoom?.name || 'az egyik érintett helyiséget'}</strong> mozgasd úgy, hogy a falélek mágnesesen összeérjenek, de a helyiségek területe ne fedje egymást.</div>
          <div className="mt-3 grid grid-cols-2 gap-2"><button type="button" onClick={() => selectOverlapRoom(overlap.roomAId)} className="survey-action-secondary">{overlap.roomA?.name || '1. helyiség'} kijelölése</button><button type="button" onClick={() => selectOverlapRoom(overlap.roomBId)} className="survey-action-secondary">{overlap.roomB?.name || '2. helyiség'} kijelölése</button></div>
        </div>
      </details>)}
    </div>;
  }


  function openEnergyCentralWorkspace(mode: EnergyCentralViewMode = "data", tab?: EnergyWorkspaceTab) {
    setActiveStep("energy");
    setEnergyCentralView(mode);
    if (tab) setEnergyWorkspaceTab(tab);
    if (drawingFocusMode) setFocusRightOpen(true);
  }

  function renderEnergyViewSwitch(compact = false) {
    const options: Array<{ id: EnergyCentralViewMode; label: string; icon: typeof Gauge }> = [
      { id: "plan", label: "Rajz", icon: MapIcon },
      { id: "data", label: "Adatok", icon: PanelTop },
      { id: "split", label: "Osztott", icon: Columns2 },
    ];
    return <div className={`survey-no-print inline-grid grid-cols-3 gap-1 rounded-xl border border-[var(--survey-border)] bg-[var(--survey-panel)] p-1 ${compact ? "" : "shadow-sm"}`} data-energy-central-view-switch>
      {options.map((option) => { const Icon = option.icon; return <button key={option.id} type="button" data-energy-view-mode={option.id} onClick={() => openEnergyCentralWorkspace(option.id)} className={`flex min-h-9 items-center justify-center gap-1.5 rounded-lg px-2 text-[8px] font-black uppercase ${energyCentralView === option.id ? "bg-cyan-700 text-white" : "text-[var(--survey-muted)] hover:bg-[var(--survey-panel-strong)]"}`}><Icon size={13} /><span className={compact ? "hidden sm:inline" : ""}>{option.label}</span></button>; })}
    </div>;
  }

  function renderEnergyWorkspaceContent(showNavigation = true) {
    return <PropertySurveyEnergyWorkspace
      settings={draft.energyProjectSettings}
      geometry={energyGeometry}
      assemblies={draft.assemblies}
      assemblySet={energyAssemblies}
      assemblyRules={huEkm20231101AssemblyRuleData}
      zoneWorkspace={draft.energyZoneWorkspace}
      zoneResult={energyZones}
      openingWorkspace={draft.energyOpeningWorkspace}
      openingResult={energyOpenings}
      demandWorkspace={draft.energyDemandWorkspace}
      demandResult={energyDemand}
      wallOpenings={draft.wallOpenings}
      wallSegments={draft.wallSegments}
      mechanicalDevices={draft.mechanicalDevices}
      rooms={draft.rooms}
      levels={draft.levels}
      expertTables={expertTables}
      winWattFieldMap={winWattFieldMap}
      winWattTrialWorkspace={draft.energyWinWattTrialWorkspace}
      winWattTrialFeedback={winWattTrialFeedback}
      winWattTrialMetricSeeds={winWattTrialMetricSeeds}
      exportingWorkbook={exportState === "working"}
      activeTab={energyWorkspaceTab}
      onActiveTabChange={setEnergyWorkspaceTab}
      showNavigation={showNavigation}
      onExportWorkbook={() => void exportWinWattWorkbook()}
      onExportTrialPackage={() => void exportWinWattTrialPackage()}
      onWinWattTrialWorkspaceChange={updateEnergyWinWattTrialWorkspace}
      onChange={updateEnergyProjectSettings}
      onZoneWorkspaceChange={updateEnergyZoneWorkspace}
      onOpeningWorkspaceChange={updateEnergyOpeningWorkspace}
      onOpeningDetailChange={updateEnergyOpeningDetail}
      onDemandWorkspaceChange={updateEnergyDemandWorkspace}
      onUpdateAssembly={updateAssembly}
    />;
  }

  function renderEnergySummaryBoard() {
    return <EnergyWorkspaceSummaryBoard
      geometry={energyGeometry}
      openings={energyOpenings}
      demand={energyDemand}
      winWatt={winWattFieldMap}
      expertTables={expertTables}
      activeTab={energyWorkspaceTab}
      onSelectTab={setEnergyWorkspaceTab}
      onOpenWorkspace={(mode) => openEnergyCentralWorkspace(mode || "data")}
      viewMode={energyCentralView}
      onViewModeChange={(mode) => openEnergyCentralWorkspace(mode)}
      complete={completion.energy}
      levelName={activeLevel?.name}
    />;
  }

  function renderEnergyQuickCards() {
    return <EnergyWorkspaceQuickCards
      geometry={energyGeometry}
      openings={energyOpenings}
      demand={energyDemand}
      winWatt={winWattFieldMap}
      expertTables={expertTables}
      activeTab={energyWorkspaceTab}
      onSelectTab={setEnergyWorkspaceTab}
      onOpenWorkspace={(mode) => openEnergyCentralWorkspace(mode || "data")}
    />;
  }


  function renderInspector() {
    if (activeStep === "property") {
      return <div className="grid gap-4">
        <div><FieldLabel>Felmérés megnevezése</FieldLabel><input className={inputClass} value={draft.surveyName} onChange={(event) => updateDraft("surveyName", event.target.value)} /></div>
        <div><FieldLabel>Felmérési mód</FieldLabel><select className={inputClass} value={draft.surveyMode} onChange={(event) => { updateDraft("surveyMode", event.target.value as PropertySurveyDraft["surveyMode"]); setActiveStep("property"); setIndustrialTool("select"); }}><option>Energetikai felmérés</option><option>Épület- és csarnokfelmérés</option><option>Térbeton- és burkolatfelmérés</option><option>Felújítási felmérés</option><option>Műszaki állapotfelmérés</option><option>Gyors alaprajz</option></select></div>
        <div className="grid gap-3 sm:grid-cols-[110px_minmax(0,1fr)]">
          <div><FieldLabel>Irányítószám</FieldLabel><input className={inputClass} value={draft.property.postalCode} onChange={(event) => updateProperty("postalCode", event.target.value)} placeholder="Pl. 7100" inputMode="numeric" maxLength={4} aria-label="Ingatlan irányítószáma" /></div>
          <div><FieldLabel>Település</FieldLabel>{postalSettlementOptions.length > 1 ? <select className={inputClass} value={draft.property.settlement} onChange={(event) => updateProperty("settlement", event.target.value)} aria-label="Település kiválasztása"><option value="">Válassz települést</option>{postalSettlementOptions.map((settlement) => <option key={settlement} value={settlement}>{settlement}</option>)}</select> : <input className={inputClass} value={draft.property.settlement} onChange={(event) => updateProperty("settlement", event.target.value)} placeholder={draft.property.postalCode.length === 4 ? "Település nem található – kézzel megadható" : "Az irányítószám után kitöltődik"} aria-label="Ingatlan települése" />}</div>
        </div>
        {draft.property.postalCode.length === 4 ? <div className={`rounded-xl border px-3 py-2 text-xs font-bold ${postalSettlementOptions.length ? "border-emerald-300 bg-emerald-50 text-emerald-900" : "border-amber-300 bg-amber-50 text-amber-900"}`}>{postalSettlementOptions.length ? <><strong>{draft.property.postalCode} {draft.property.settlement}</strong>{postalSettlementOptions.length > 1 ? ` · ${postalSettlementOptions.length} település közül választható` : " · irányítószám alapján kitöltve"}</> : <>A(z) <strong>{draft.property.postalCode}</strong> irányítószám nincs az offline törzsben. A település kézzel megadható.</>}</div> : null}
        <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_110px]"><div><FieldLabel>Utca / közterület</FieldLabel><input className={inputClass} value={draft.property.street} onChange={(event) => updateProperty("street", event.target.value)} placeholder="Pl. Piac utca" aria-label="Utca vagy közterület" /></div><div><FieldLabel>Házszám</FieldLabel><input className={inputClass} value={draft.property.houseNumber} onChange={(event) => updateProperty("houseNumber", event.target.value)} placeholder="Pl. 12/A" aria-label="Házszám" /></div></div>
        {draft.property.address ? <div className="rounded-xl border border-cyan-200 bg-cyan-50 px-3 py-2 text-xs font-bold leading-5 text-cyan-950"><span className="block text-[9px] font-black uppercase tracking-[0.1em] text-cyan-800">Összeállított teljes cím</span>{draft.property.address}</div> : null}
        <div><FieldLabel>Helyrajzi szám</FieldLabel><input className={inputClass} value={draft.property.parcelNumber} onChange={(event) => updateProperty("parcelNumber", event.target.value)} placeholder="Pl. 1234/2" /></div>
        <div className="grid grid-cols-2 gap-3"><div><FieldLabel>Ingatlantípus</FieldLabel><select className={inputClass} value={draft.property.propertyType} onChange={(event) => updateProperty("propertyType", event.target.value)}><option>Családi ház</option><option>Társasházi lakás</option><option>Panel lakás</option><option>Középület</option><option>Iroda</option><option>Egyéb épület</option></select></div><div><FieldLabel>Építés éve</FieldLabel><input className={inputClass} value={draft.property.constructionYear} onChange={(event) => updateProperty("constructionYear", event.target.value)} inputMode="numeric" /></div></div>
        <div className="grid grid-cols-2 gap-3"><div><FieldLabel>Szintek</FieldLabel><input className={inputClass} value={draft.levels.length} readOnly aria-label="Épületszintek száma" /></div><div><FieldLabel>Felmérés dátuma</FieldLabel><input type="date" className={inputClass} value={draft.property.surveyDate} onChange={(event) => updateProperty("surveyDate", event.target.value)} /></div></div>
        <div className="grid grid-cols-2 gap-2"><button type="button" onClick={openMap} className="survey-action-secondary"><MapPinned size={16} /> Térképi ellenőrzés</button><a href="https://www.e-epites.hu" target="_blank" rel="noreferrer" className="survey-action-secondary"><Compass size={16} /> HRSZ / E-közmű</a></div>
      </div>;
    }

    if (activeStep === "planDocument") {
      const planWorkspace = draft.planDocumentWorkspace;
      const activePlanDocument = planWorkspace.documents.find((document) => document.id === planWorkspace.activeDocumentId) || planWorkspace.documents[0];
      const activePlanPage = activePlanDocument?.pages.find((page) => page.id === planWorkspace.activePageId) || activePlanDocument?.pages[0];
      const approvedCount = activePlanPage?.suggestions.filter((suggestion) => suggestion.status === "approved").length || 0;
      return <div className="grid gap-4">
        <div className="rounded-2xl border border-cyan-300 bg-cyan-50 p-4 text-slate-950"><div className="flex items-start gap-3"><span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-cyan-700 text-white"><FileOutput size={19} /></span><div><div className="text-sm font-black">{surveySourceModeLabels[planWorkspace.surveySourceMode]}</div><div className="mt-1 text-xs font-semibold leading-5 text-slate-600">Az eredeti PDF változatlan; a kalibráció, kivágás és helyiséggeometria külön DIMPRO overlay.</div></div></div></div>
        <div className="grid grid-cols-2 gap-2"><button type="button" onClick={() => setEnergyCentralView("plan")} className={energyCentralView === "plan" ? "survey-action-primary" : "survey-action-secondary"}>Rajz</button><button type="button" onClick={() => setEnergyCentralView("data")} className={energyCentralView === "data" ? "survey-action-primary" : "survey-action-secondary"}>Adatok</button><button type="button" onClick={() => setEnergyCentralView("split")} className={`survey-action-secondary col-span-2 ${energyCentralView === "split" ? "border-cyan-600 bg-cyan-50 text-cyan-900" : ""}`}>Osztott nézet</button></div>
        <div className="grid grid-cols-2 gap-2"><div className="rounded-xl border border-[var(--survey-border)] bg-[var(--survey-panel-strong)] p-3"><div className="text-[9px] font-black uppercase text-[var(--survey-muted)]">PDF-ek</div><div className="mt-1 text-2xl font-black">{planWorkspace.documents.length}</div></div><div className="rounded-xl border border-[var(--survey-border)] bg-[var(--survey-panel-strong)] p-3"><div className="text-[9px] font-black uppercase text-[var(--survey-muted)]">Jóváhagyott</div><div className="mt-1 text-2xl font-black">{approvedCount}</div></div></div>
        {activePlanPage ? <div className="rounded-xl border border-[var(--survey-border)] bg-[var(--survey-panel-strong)] p-3 text-xs font-semibold leading-5"><strong>{activePlanDocument?.fileName}</strong><br />{activePlanPage.pageNumber}. oldal · {activePlanPage.contentKind === "unknown" ? "még nem elemzett" : `${activePlanPage.contentKind} PDF`}<br />Kalibráció: {activePlanPage.calibration.primary.pixelsPerMeter > 0 ? `${activePlanPage.calibration.primary.pixelsPerMeter.toFixed(3)} px/m` : "nincs"}</div> : null}
      </div>;
    }

    if (activeStep === "plan") {
      return <div className="grid gap-4">
        <div className="rounded-2xl border border-cyan-300 bg-cyan-50 p-4 text-slate-950">
          <div className="flex items-start gap-3"><span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-cyan-700 text-white"><PencilRuler size={19} /></span><div><div className="text-sm font-black">Helyiségek felrajzolása és mozgatása</div><div className="mt-1 text-xs font-semibold leading-5 text-slate-600">Új helyiséghez húzz téglalapot. A létrehozott helyiséget közvetlenül az alaprajzon megfoghatod és a kívánt helyre húzhatod.</div></div></div>
          <div className="mt-3 grid grid-cols-2 gap-2"><button type="button" onClick={startRoomDrawing} className={roomDrawingMode ? "survey-action-primary" : "survey-action-secondary"}><PencilRuler size={16} /> {roomDrawingMode ? "Rajzolás aktív" : "Helyiség rajzolása"}</button><button type="button" onClick={addRoom} className="survey-action-secondary"><Plus size={16} /> Gyors helyiség</button></div>
        </div>
        {activeRooms.length ? <>
          <div className="flex items-center justify-between gap-3"><div><div className="text-sm font-black text-[var(--survey-text)]">Aktív helyiség</div><div className="text-xs font-semibold text-[var(--survey-muted)]">Koppints a kijelöléshez, fogd meg és húzd a mozgatáshoz.</div></div><StatusBadge complete={Boolean(activeRoom)}>Kijelölve</StatusBadge></div>
          <select className={inputClass} value={activeRoom?.id || ""} onChange={(event) => { setActiveRoomId(event.target.value); setMeasurementTarget(null); setMeasurementWaiting(false); }}>{activeRooms.map((room) => <option key={room.id} value={room.id}>{room.name}</option>)}</select>
        </> : <div className="rounded-xl border border-dashed border-[var(--survey-border)] bg-[var(--survey-panel-strong)] p-4 text-center"><div className="text-sm font-black text-[var(--survey-text)]">Az alaprajz még üres</div><div className="mt-1 text-xs font-semibold leading-5 text-[var(--survey-muted)]">Indítsd el a helyiségrajzolást, és húzd ki az első helyiséget a(z) {activeLevel?.name || "aktív szint"} lapján.</div></div>}
        {activeRoom ? <>
          <div><FieldLabel>Helyiségnév</FieldLabel><input className={inputClass} value={activeRoom.name} onChange={(event) => updateRoom({ name: event.target.value })} /></div>
          <div><FieldLabel>Funkció</FieldLabel><input className={inputClass} value={activeRoom.function} onChange={(event) => updateRoom({ function: event.target.value })} /></div>

          <div className="rounded-2xl border border-[var(--survey-border)] bg-[var(--survey-panel-strong)] p-3">
            <div className="flex items-start justify-between gap-3">
              <div><div className="text-sm font-black text-[var(--survey-text)]">Pontos helyiségméretek</div><div className="mt-1 text-xs font-semibold leading-5 text-[var(--survey-muted)]">A hossz a rajz vízszintes, a keresztméret a függőleges oldala. Módosításkor a helyiség bal felső rögzítési pontja helyben marad; csak a méret és az alapterület frissül.</div></div>
              <Move size={20} className="shrink-0 text-cyan-700" />
            </div>
            <div className="mt-3 grid grid-cols-2 gap-3">
              <div>
                <FieldLabel>Hossz – vízszintes oldal (m)</FieldLabel>
                <div className="grid grid-cols-[1fr_auto] gap-2">
                  <input className={inputClass} type="number" min="0.1" step="0.01" value={activeRoomDimensions.lengthMeters || ""} onFocus={() => setMeasurementTarget("length")} onChange={(event) => applyRoomMeasurement("length", event.target.value, "manual", undefined, false)} />
                  <button type="button" onClick={() => { setMeasurementTarget("length"); setMeasurementWaiting(true); }} className={`survey-icon-button h-11 w-11 ${measurementTarget === "length" && measurementWaiting ? "border-blue-600 bg-blue-100 text-blue-800" : ""}`} aria-label="Hossz Bluetooth mérése"><Bluetooth size={17} /></button>
                </div>
                <div className="mt-1 text-[9px] font-bold text-[var(--survey-muted)]">{getSurveyDimensionSourceLabel(activeRoom.lengthSource || activeRoom.dimensionSource)}</div>
              </div>
              <div>
                <FieldLabel>Keresztméret – függőleges oldal (m)</FieldLabel>
                <div className="grid grid-cols-[1fr_auto] gap-2">
                  <input className={inputClass} type="number" min="0.1" step="0.01" value={activeRoomDimensions.widthMeters || ""} onFocus={() => setMeasurementTarget("width")} onChange={(event) => applyRoomMeasurement("width", event.target.value, "manual", undefined, false)} />
                  <button type="button" onClick={() => { setMeasurementTarget("width"); setMeasurementWaiting(true); }} className={`survey-icon-button h-11 w-11 ${measurementTarget === "width" && measurementWaiting ? "border-blue-600 bg-blue-100 text-blue-800" : ""}`} aria-label="Keresztméret Bluetooth mérése"><Bluetooth size={17} /></button>
                </div>
                <div className="mt-1 text-[9px] font-bold text-[var(--survey-muted)]">{getSurveyDimensionSourceLabel(activeRoom.widthSource || activeRoom.dimensionSource)}</div>
              </div>
            </div>
            <div className="mt-3 grid grid-cols-2 gap-3">
              <div className="rounded-xl border border-cyan-200 bg-cyan-50 p-3 text-slate-950"><div className="text-[9px] font-black uppercase tracking-[0.09em] text-cyan-800">Számított alapterület</div><div className="mt-1 text-xl font-black">{activeRoomDimensions.areaSquareMeters.toFixed(2).replace(".", ",")} m²</div><div className="mt-1 text-[9px] font-bold text-slate-600">Hossz × keresztméret</div></div>
              <div>
                <FieldLabel>Belmagasság (m)</FieldLabel>
                <div className="grid grid-cols-[1fr_auto] gap-2">
                  <input className={inputClass} type="number" min="0.1" step="0.01" value={activeRoom.height} onFocus={() => setMeasurementTarget("height")} onChange={(event) => applyRoomMeasurement("height", event.target.value, "manual", undefined, false)} />
                  <button type="button" onClick={() => { setMeasurementTarget("height"); setMeasurementWaiting(true); }} className={`survey-icon-button h-11 w-11 ${measurementTarget === "height" && measurementWaiting ? "border-blue-600 bg-blue-100 text-blue-800" : ""}`} aria-label="Belmagasság Bluetooth mérése"><Bluetooth size={17} /></button>
                </div>
                <div className="mt-1 text-[9px] font-bold text-[var(--survey-muted)]">{getSurveyDimensionSourceLabel(activeRoom.heightSource)}</div>
              </div>
            </div>
          </div>

          <PropertySurveyMeasurementPanel
            target={measurementTarget}
            waiting={measurementWaiting}
            lastMeasurement={lastMeasurement}
            onTargetChange={setMeasurementTarget}
            onWaitingChange={setMeasurementWaiting}
            onApply={(target, valueMeters, source, deviceName) => applyRoomMeasurement(target, valueMeters, source, deviceName, true)}
          />

          <div className="grid gap-3 rounded-2xl border border-[var(--survey-border)] bg-[var(--survey-panel-strong)] p-3">
            <div className="text-sm font-black text-[var(--survey-text)]">Burkolatok és álmennyezet</div>
            <div><FieldLabel>Padlóburkolat</FieldLabel><input className={inputClass} value={activeRoom.floorFinishMaterial || ""} onChange={(event) => updateRoom({ floorFinishMaterial: event.target.value })} placeholder="Pl. kerámia, parketta, PVC" /></div>
            <div><FieldLabel>Falburkolat / felület</FieldLabel><input className={inputClass} value={activeRoom.wallFinishMaterial || ""} onChange={(event) => updateRoom({ wallFinishMaterial: event.target.value })} placeholder="Pl. festett vakolat, csempe" /></div>
            <div><FieldLabel>Mennyezeti felület</FieldLabel><input className={inputClass} value={activeRoom.ceilingFinishMaterial || ""} onChange={(event) => updateRoom({ ceilingFinishMaterial: event.target.value })} placeholder="Pl. festett vakolat, gipszkarton" /></div>
            <label className="flex items-center justify-between rounded-xl border border-[var(--survey-border)] bg-[var(--survey-panel)] px-3 py-3 text-sm font-black text-[var(--survey-text)]"><span>Álmennyezet van</span><input type="checkbox" checked={Boolean(activeRoom.suspendedCeilingEnabled)} onChange={(event) => updateRoom({ suspendedCeilingEnabled: event.target.checked, suspendedCeilingDropMeters: event.target.checked ? (activeRoom.suspendedCeilingDropMeters || 0.2) : 0 })} className="h-5 w-5 accent-cyan-600" /></label>
            {activeRoom.suspendedCeilingEnabled ? <div className="grid grid-cols-2 gap-3"><div><FieldLabel>Álmennyezet belógása (m)</FieldLabel><input type="number" min="0" max={activeRoom.height} step="0.01" className={inputClass} value={activeRoom.suspendedCeilingDropMeters || 0} onChange={(event) => updateRoom({ suspendedCeilingDropMeters: Math.min(activeRoom.height, Math.max(0, Number(event.target.value) || 0)) })} /></div><div className="rounded-xl border border-cyan-300 bg-cyan-50 p-3 text-slate-950"><div className="text-[9px] font-black uppercase text-cyan-800">Hasznos belmagasság</div><div className="mt-1 text-xl font-black">{getRoomUsableHeight(activeRoom).toFixed(2).replace(".", ",")} m</div><div className="mt-1 text-[9px] font-bold text-slate-600">Teljes magasság − álmennyezet</div></div></div> : null}
          </div>

          <label className="flex items-center justify-between rounded-xl border border-[var(--survey-border)] bg-[var(--survey-panel-strong)] px-3 py-3 text-sm font-black text-[var(--survey-text)]"><span>Fűtött tér</span><input type="checkbox" checked={activeRoom.heated} onChange={(event) => updateRoom({ heated: event.target.checked })} className="h-5 w-5 accent-cyan-600" /></label>
          <div><FieldLabel>Tájolás</FieldLabel><select className={inputClass} value={activeRoom.orientation} onChange={(event) => updateRoom({ orientation: event.target.value })}><option>Észak</option><option>Északkelet</option><option>Kelet</option><option>Délkelet</option><option>Dél</option><option>Délnyugat</option><option>Nyugat</option><option>Északnyugat</option><option>Belső</option><option>Ellenőrizendő</option></select></div>
          <HoldActionButton tone="danger" durationMs={2000} icon={<Trash2 size={16} />} label="Helyiség törlése · 2 mp" holdingLabel="Törléshez" ariaLabel={`${activeRoom.name} törléséhez tartsd nyomva 2 másodpercig`} onComplete={deleteRoom} className="w-full" />
        </> : null}
        {thermalLayerAvailable ? <div className="grid gap-3 rounded-2xl border border-emerald-300 bg-emerald-50 p-3 text-slate-950"><div><div className="text-sm font-black">Hőhatár mérete</div><div className="mt-1 text-xs font-semibold leading-5 text-slate-600">Új vagy áthelyezett helyiség után válaszd az automatikus követést, vagy igazítsd újra a kézi hőhatárt.</div></div><select className="h-11 w-full rounded-xl border border-emerald-300 bg-white px-3 text-sm font-bold text-slate-950" value={activeThermalBoundary.mode} onChange={(event) => updateThermalBoundary({ mode: event.target.value as SurveyThermalBoundarySettings["mode"], updatedAt: new Date().toISOString() })}><option value="heatedRooms">Automatikus – fűtött terek követése</option><option value="allRooms">Automatikus – minden helyiség követése</option><option value="manual">Kézi hőhatár</option></select><button type="button" onClick={fitThermalBoundary} className="survey-action-secondary bg-white text-slate-950"><ScanLine size={16} /> Hőhatár igazítása a helyiségekhez</button></div> : null}
        <div><FieldLabel>Tájolás adatforrása</FieldLabel><select className={inputClass} value={draft.orientationSource} onChange={(event) => updateDraft("orientationSource", event.target.value)}><option>E-közmű / HRSZ térkép</option><option>Google műholdkép</option><option>Helyszíni iránytű</option><option>Referenciahomlokzat</option><option>Kézi megadás</option></select></div>
      </div>;
    }

    if (activeStep === "section") {
      return <PropertySurveySectionPanel
        surveyMode={draft.surveyMode}
        lines={activeSectionLines}
        activeLine={activeSectionLine}
        activeLineLengthMeters={activeSectionLineLengthMeters}
        internalWalls={activeSectionInternalWalls}
        drawingMode={sectionDrawingMode}
        drawingConstraint={sectionDrawingConstraint}
        onDrawingConstraintChange={setSectionDrawingConstraint}
        onDrawingStart={startSectionDrawing}
        onDrawingCancel={() => setSectionDrawingMode(false)}
        onSelect={selectSectionLine}
        onUpdate={updateSectionLine}
        onDelete={deleteSectionLine}
      />;
    }

    if (activeStep === "structures") {
      return <PropertySurveyStructuresPanel
        rooms={activeRooms}
        activeRoom={activeRoom || null}
        wallSegments={activeWallSegments}
        activeWallSegmentId={activeWallSegmentId}
        northAngle={draft.northAngle}
        thermalBoundary={activeThermalBoundary}
        thermalEnabled={thermalLayerAvailable}
        thermalSummary={{ totalMeters: activeThermalSummary.totalMeters, segmentCount: activeThermalSummary.segmentCount }}
        assemblies={draft.assemblies}
        assemblyResults={energyAssemblies.results}
        materialWorkspace={draft.materialWorkspace}
        onMaterialWorkspaceChange={updateMaterialWorkspace}
        onSelectWall={selectWallSegment}
        onUpdateWall={updateWallSegment}
        onSplitWall={splitSelectedWallSegment}
        onDeleteWall={deleteWallSegment}
        onRebuildAutomatic={rebuildActiveLevelWalls}
        onUpdateThermalBoundary={updateThermalBoundary}
        onFitThermalBoundary={fitThermalBoundary}
        onAddAssembly={addAssembly}
        onUpdateAssembly={updateAssembly}
        onDeleteAssembly={deleteAssembly}
        onAssignRoomAssembly={assignRoomAssembly}
      />;
    }

    if (activeStep === "energy") {
      return renderEnergyWorkspaceContent(true);
    }

    if (activeStep === "openings") {
      return <PropertySurveyOpeningPanel
        rooms={activeRooms}
        wallSegments={activeWallSegments}
        openings={activeWallOpenings}
        activeWallSegmentId={activeWallSegmentId}
        activeOpeningId={activeOpeningId}
        northAngle={draft.northAngle}
        energyDetail={activeOpeningId ? draft.energyOpeningWorkspace.openingDetails[activeOpeningId] || null : null}
        energyResult={activeOpeningId ? energyOpenings.openings.find((result) => result.openingId === activeOpeningId) || null : null}
        onWallSelect={selectWallSegment}
        onOpeningSelect={setActiveOpeningId}
        onAdd={addWallOpening}
        onUpdate={updateWallOpening}
        onDelete={deleteWallOpening}
        onMove={moveOpeningOnWall}
      />;
    }

    if (activeStep === "mechanical") {
      return <PropertySurveyMechanicalPanel
        mechanical={draft.mechanical}
        rooms={activeRooms}
        devices={activeMechanicalDevices}
        activeDeviceId={activeMechanicalDeviceId}
        placementMode={mechanicalPlacementMode}
        pendingKind={pendingMechanicalKind}
        onSystemUpdate={updateMechanical}
        onPendingKindChange={setPendingMechanicalKind}
        onStartCreate={() => { setIssuePlacementMode(null); setPhotoPlacementMode(null); setMechanicalPlacementMode("create"); }}
        onStartMove={() => activeMechanicalDevice && setMechanicalPlacementMode("move")}
        onCancelPlacement={() => setMechanicalPlacementMode(null)}
        onSelect={selectMechanicalDevice}
        onUpdate={updateMechanicalDevice}
        onDelete={deleteMechanicalDevice}
      />;
    }

    if (activeStep === "renewables") {
      return <EnergyRenewablePanel workspace={draft.energyRenewableWorkspace} result={energyRenewables} mode={draft.energyFieldWorkflow.mode} onChange={updateEnergyRenewableWorkspace} />;
    }

    if (activeStep === "renovation") {
      return <EnergyRenovationPanel workspace={draft.energyRenovationWorkspace} comparison={energyRenovationComparison} mode={draft.energyFieldWorkflow.mode} onChange={updateEnergyRenovationWorkspace} onGenerateSuggestions={generateRenovationSuggestions} />;
    }

    if (activeStep === "photos") {
      return <PropertySurveyPhotoPanel
        surveyMode={draft.surveyMode}
        surveyName={draft.surveyName}
        points={activePhotoPoints}
        allPoints={draft.photoPoints}
        rooms={activeRooms}
        activePhotoId={activePhotoId}
        placementMode={photoPlacementMode}
        onSelect={selectPhoto}
        onStartCreate={() => { setIssuePlacementMode(null); setMechanicalPlacementMode(null); setPhotoPlacementMode("create"); }}
        onStartMove={() => activePhotoPoint && setPhotoPlacementMode("move")}
        onCancelPlacement={() => setPhotoPlacementMode(null)}
        onUpdate={updatePhoto}
        onDelete={deletePhoto}
      />;
    }

    if (activeStep === "issues") {
      return <PropertySurveyIssuesPanel
        issues={issues}
        activeIssueId={activeIssueId}
        rooms={activeRooms}
        placementMode={issuePlacementMode}
        onSelectIssue={selectIssue}
        onStartCreate={() => { setPhotoPlacementMode(null); setMechanicalPlacementMode(null); setIssuePlacementMode("create"); }}
        onStartMove={() => { if (activeIssue) { setPhotoPlacementMode(null); setMechanicalPlacementMode(null); setIssuePlacementMode("move"); } }}
        onCancelPlacement={() => setIssuePlacementMode(null)}
        onUpdateIssue={updateIssue}
        onDeleteIssue={deleteIssue}
      />;
    }

    if (activeStep === "industrial") {
      return <PropertySurveyIndustrialPanel
        tool={industrialTool}
        settings={draft.industrialSettings}
        background={draft.industrialBackground}
        buildingContours={activeIndustrialBuildingContours}
        pillars={activePillars}
        markups={activeIndustrialMarkups}
        activeBuildingContourId={activeIndustrialBuildingContourId}
        activePillarId={activePillarId}
        activeMarkupId={activeIndustrialMarkupId}
        activePointIndex={activeIndustrialPointIndex}
        canUndo={canUndoIndustrial}
        canRedo={canRedoIndustrial}
        onUndo={undoIndustrial}
        onRedo={redoIndustrial}
        onToolChange={(tool) => { setIndustrialTool(tool); setActiveIndustrialPointIndex(null); setRoomDrawingMode(false); setSectionDrawingMode(false); setIssuePlacementMode(null); setPhotoPlacementMode(null); setMechanicalPlacementMode(null); }}
        onSettingsChange={updateIndustrialSettings}
        onBackgroundImport={importIndustrialBackground}
        onBackgroundUpdate={updateIndustrialBackground}
        onBackgroundPageChange={changeIndustrialBackgroundPage}
        onBackgroundTransformReset={resetIndustrialBackgroundTransform}
        onBackgroundDelete={deleteIndustrialBackground}
        onBuildingContourSelect={(contourId) => { setActiveIndustrialBuildingContourId(contourId); setActivePillarId(null); setActiveIndustrialMarkupId(null); setActiveIndustrialPointIndex(null); setIndustrialTool("select"); }}
        onBuildingContourUpdate={updateBuildingContour}
        onBuildingContourPointInsert={insertBuildingContourPoint}
        onBuildingContourPointDelete={deleteBuildingContourPoint}
        onBuildingContourDelete={deleteBuildingContour}
        onPillarSelect={(pillarId) => { setActiveIndustrialBuildingContourId(null); setActivePillarId(pillarId); setActiveIndustrialMarkupId(null); setActiveIndustrialPointIndex(null); setIndustrialTool("select"); }}
        onPillarUpdate={updatePillar}
        onPillarDelete={deletePillar}
        onPillarGridGenerate={generatePillarGrid}
        onMarkupSelect={(markupId) => { setActiveIndustrialBuildingContourId(null); setActiveIndustrialMarkupId(markupId); setActivePillarId(null); setActiveIndustrialPointIndex(null); setIndustrialTool("select"); }}
        onMarkupUpdate={updateIndustrialMarkup}
        onMarkupPointInsert={insertMarkupPoint}
        onMarkupPointDelete={deleteMarkupPoint}
        onMarkupDelete={deleteIndustrialMarkup}
        onExportDxf={exportDxf}
      />;
    }

    if (activeStep === "check") {
      const checks = [
        [completion.property, "Cím, HRSZ és ingatlantípus kitöltve"],
        [completion.plan, "Alaprajz, helyiségek és tájolás rögzítve"],
        [completion.section, draft.sectionLines.length ? `${draft.sectionLines.length} metszet rögzítve` : "Legalább egy épület- vagy tetőmetszet rögzítendő"],
        [completion.structures, "Minden falszakasz faltípusa és vastagsága megadva"],
        [completion.openings, "Falhoz kötött nyílászárók és automatikus tájolás rögzítve"],
        ...(isIndustrialMode ? [[completion.industrial, "Épületkontúr, pillér vagy hibajelölési réteg rögzítve"]] as const : [[completion.mechanical, "Fűtés, hőtermelő és HMV rendszer rögzítve"]] as const),
        ...(!isIndustrialMode && energyWorkspaceEnabled ? [[completion.renewables, draft.energyRenewableWorkspace.enabled ? "Napelem, napkollektor, akkumulátor és autótöltés előméretezése ellenőrizve" : "Megújuló és villamos előméretezés nem szükséges vagy nincs bekapcsolva"]] as const : []),
        [completion.photos, "Legalább három általános helyszíni fotó kapcsolva"],
        ...(!isIndustrialMode && energyWorkspaceEnabled ? [[completion.renovation, "Legalább egy forrással ellátott helyszíni felújítási intézkedés rögzítve"]] as const : []),
        [completion.issues, issues.length ? "Minden hibajegy megnevezése és dátuma kitöltve" : "Nincs rögzített hibapont"],
        [activeRoomOverlapDetails.length === 0, activeRoomOverlapDetails.length ? `${activeRoomOverlapDetails.length} helyiségátfedés javítandó` : "Nincs geometriai helyiségátfedés"],
      ] as const;
      return <div className="grid gap-3">{checks.map(([ok, label]) => <div key={label} className={`flex items-start gap-3 rounded-xl border p-3 ${ok ? "border-emerald-300 bg-emerald-50 text-emerald-900" : "border-amber-300 bg-amber-50 text-amber-900"}`}>{ok ? <CheckCircle2 size={20} className="shrink-0" /> : <ClipboardCheck size={20} className="shrink-0" />}<div className="text-sm font-black leading-5">{label}</div></div>)}{renderRoomOverlapWarnings()}<div className="mt-2 rounded-2xl border border-[var(--survey-border)] bg-[var(--survey-panel-strong)] p-4"><div className="text-sm font-black text-[var(--survey-text)]">Számított geometriai összesítő</div><div className="mt-3 grid grid-cols-2 gap-3"><div><div className="text-2xl font-black text-[var(--survey-text)]">{totalArea.toFixed(1)} m²</div><div className="text-[10px] font-black uppercase text-[var(--survey-muted)]">összes terület</div></div><div><div className="text-2xl font-black text-[var(--survey-text)]">{heatedArea.toFixed(1)} m²</div><div className="text-[10px] font-black uppercase text-[var(--survey-muted)]">fűtött terület</div></div><div><div className="text-2xl font-black text-[var(--survey-text)]">{draft.rooms.reduce((sum, room) => sum + room.area * getRoomUsableHeight(room), 0).toFixed(1)} m³</div><div className="text-[10px] font-black uppercase text-[var(--survey-muted)]">helyiségtérfogat</div></div><div><div className="text-2xl font-black text-[var(--survey-text)]">{totalWindows} / {totalDoors}</div><div className="text-[10px] font-black uppercase text-[var(--survey-muted)]">ablak / ajtó</div></div></div></div></div>;
    }

    const surveyVersions = localVersions.filter((version) => version.surveyId === (activeSurveyId || "local")).slice(0, 6);
    return <div className="grid gap-4" data-survey-export-panel="true">
      <div className="rounded-2xl border border-emerald-300 bg-emerald-50 p-4 text-emerald-950"><Download size={28} /><div className="mt-3 text-lg font-black">DIMPRO Exportközpont</div><p className="mt-2 text-sm font-semibold leading-6">A teljes épület egyetlen többoldalas, valódi vektoros PDF-be kerül: fedlap, szintenkénti alaprajz, metszetek, jelmagyarázat és mérnöki aláírási blokk. A szerkeszthető <strong>.dimpro</strong> munkafájl verziózott, és bejelentkezve közvetlenül a DIMPRO Drive-ba is menthető.</p></div>

      <div data-export-state={exportState} className={`rounded-xl border p-3 text-xs font-black ${exportState === "error" ? "border-rose-300 bg-rose-50 text-rose-900" : exportState === "working" ? "border-cyan-300 bg-cyan-50 text-cyan-900" : exportState === "done" ? "border-emerald-300 bg-emerald-50 text-emerald-900" : "border-[var(--survey-border)] bg-[var(--survey-panel-strong)] text-[var(--survey-muted)]"}`}>{exportMessage}</div>

      <div className="grid gap-3 rounded-2xl border border-[var(--survey-border)] bg-[var(--survey-panel-strong)] p-3">
        <div><div className="text-sm font-black text-[var(--survey-text)]">Fedlap és mérnöki aláírás adatai</div><div className="mt-1 text-xs font-semibold leading-5 text-[var(--survey-muted)]">Ezek az adatok a PDF fedlapján és az utolsó aláírási oldalon jelennek meg.</div></div>
        <div className="grid grid-cols-2 gap-3"><label><FieldLabel>Cég / szervezet</FieldLabel><input className={inputClass} value={draft.exportDetails.companyName} onChange={(event) => updateExportDetails("companyName", event.target.value)} /></label><label><FieldLabel>Felelős mérnök</FieldLabel><input className={inputClass} value={draft.exportDetails.engineerName} onChange={(event) => updateExportDetails("engineerName", event.target.value)} /></label></div>
        <div className="grid grid-cols-2 gap-3"><label><FieldLabel>Kamarai szám</FieldLabel><input className={inputClass} value={draft.exportDetails.chamberNumber} onChange={(event) => updateExportDetails("chamberNumber", event.target.value)} /></label><label><FieldLabel>Aláírás helye</FieldLabel><input className={inputClass} value={draft.exportDetails.signaturePlace} onChange={(event) => updateExportDetails("signaturePlace", event.target.value)} /></label></div>
        <label><FieldLabel>Aláírás dátuma</FieldLabel><input type="date" className={inputClass} value={draft.exportDetails.signatureDate} onChange={(event) => updateExportDetails("signatureDate", event.target.value)} /></label>
        <label><FieldLabel>Fedlapi megjegyzés</FieldLabel><textarea className="min-h-20 w-full rounded-xl border border-[var(--survey-border)] bg-[var(--survey-panel)] p-3 text-xs font-bold text-[var(--survey-text)] outline-none focus:border-cyan-500" value={draft.exportDetails.coverNote} onChange={(event) => updateExportDetails("coverNote", event.target.value)} placeholder="A felmérés célja, terjedelme vagy fontos korlátozása..." /></label>
      </div>

      <div className="grid gap-3 rounded-2xl border border-[var(--survey-border)] bg-[var(--survey-panel-strong)] p-3">
        <div><div className="text-sm font-black text-[var(--survey-text)]">DIMPRO munkafájl és projektverzió</div><div className="mt-1 text-xs font-semibold leading-5 text-[var(--survey-muted)]">A következő mentés automatikusan v{String(getNextRevisionNumber()).padStart(3, "0")} verziószámot kap. A metszetek, energetikai számítások, hibák és exportadatok is a munkafájl részei.</div></div>
        <label><FieldLabel>Verzió megjegyzése</FieldLabel><input className={inputClass} value={versionNote} onChange={(event) => setVersionNote(event.target.value)} placeholder="Pl. helyszíni felmérés kiegészítve tetőmetszettel" /></label>
        <div className="grid grid-cols-2 gap-2"><button type="button" onClick={exportDimproWorkfile} className="survey-action-primary"><Save size={18} /> Mentés .dimpro fájlba</button><button type="button" onClick={() => void saveDimproWorkfileToDrive()} disabled={exportState === "working"} className="survey-action-primary disabled:opacity-50"><FolderKanban size={18} /> Mentés DIMPRO Drive-ba</button></div>
        <input ref={dimproImportRef} type="file" accept=".dimpro,application/vnd.dimpro.survey+json,application/json" className="hidden" onChange={(event) => { const file = event.target.files?.[0]; if (file) void importDimproWorkfile(file); }} />
        <button type="button" onClick={() => dimproImportRef.current?.click()} className="survey-action-secondary"><Download size={18} className="rotate-180" /> DIMPRO munkafájl megnyitása</button>
        {surveyVersions.length ? <details className="rounded-xl border border-[var(--survey-border)] bg-[var(--survey-panel)]"><summary className="cursor-pointer p-3 text-xs font-black text-[var(--survey-text)]">Legutóbbi projektverziók ({surveyVersions.length})</summary><div className="grid gap-2 border-t border-[var(--survey-border)] p-3">{surveyVersions.map((version) => <div key={version.id} className="rounded-lg border border-[var(--survey-border)] bg-[var(--survey-panel-strong)] px-3 py-2"><div className="flex items-center justify-between gap-2 text-[10px] font-black"><span>v{String(version.revisionNumber).padStart(3, "0")}</span><span className={version.driveStatus === "drive-ready" ? "text-emerald-700" : "text-cyan-700"}>{version.driveStatus === "drive-ready" ? "DIMPRO Drive" : "Helyi fájl"}</span></div><div className="mt-1 truncate text-[10px] font-bold text-[var(--survey-muted)]">{version.fileName}</div>{version.note ? <div className="mt-1 text-[10px] font-semibold text-[var(--survey-text)]">{version.note}</div> : null}</div>)}</div></details> : null}
      </div>

      <div className="grid gap-3 rounded-2xl border border-cyan-300 bg-cyan-50 p-3 text-slate-950">
        <div><div className="text-sm font-black">Többoldalas vektoros PDF</div><div className="mt-1 text-xs font-semibold leading-5 text-slate-600">{draft.levels.length} szint, {draft.sectionLines.length} metszet, fedlap, DIMPRO északjel, jelmagyarázat és aláírási blokk. A rajzi elemek vektorosan nagyíthatók.</div></div>
        <div className="grid grid-cols-2 gap-3"><label><span className="mb-1.5 block text-[10px] font-black uppercase text-cyan-800">Lapméret</span><select value={draft.planSheet.paperSize} onChange={(event) => updatePlanSheet({ paperSize: event.target.value as SurveyPaperSize })} className="h-11 w-full rounded-xl border border-cyan-300 bg-white px-3 text-sm font-black"><option>A4</option><option>A3</option><option>A2</option></select></label><label><span className="mb-1.5 block text-[10px] font-black uppercase text-cyan-800">Elhelyezés</span><select value={draft.planSheet.orientation} onChange={(event) => updatePlanSheet({ orientation: event.target.value as SurveyPaperOrientation })} className="h-11 w-full rounded-xl border border-cyan-300 bg-white px-3 text-sm font-black"><option value="portrait">Álló</option><option value="landscape">Fekvő</option></select></label></div>
        <div className="rounded-xl border border-cyan-200 bg-white px-3 py-2 text-xs font-bold">Kimenet: fedlap + {draft.levels.length} alaprajzi oldal + {draft.sectionLines.length} metszeti oldal + jelmagyarázat/aláírás</div>
        <button type="button" disabled={exportState === "working"} onClick={() => void exportPdf()} className="survey-action-primary disabled:opacity-50"><FileOutput size={18} /> Teljes épület PDF készítése</button>
      </div>

      <div className="grid gap-3 rounded-2xl border border-emerald-300 bg-emerald-50 p-3 text-emerald-950">
        <div><div className="text-sm font-black">Energetikai felületösszesítő</div><div className="mt-1 text-xs font-semibold leading-5">Bruttó fal, nyílászáró-levonás, nettó fal, padló és födém; tájolási bontás és rétegrendi U-érték.</div></div>
        <div className="grid grid-cols-2 gap-2 text-center"><div className="rounded-xl border border-emerald-200 bg-white p-2"><div className="text-lg font-black">{energySummary.totals.grossWallAreaSquareMeters.toFixed(2)} m²</div><div className="text-[9px] font-black uppercase">bruttó fal</div></div><div className="rounded-xl border border-emerald-200 bg-white p-2"><div className="text-lg font-black">{energySummary.totals.openingAreaSquareMeters.toFixed(2)} m²</div><div className="text-[9px] font-black uppercase">nyílászáró</div></div><div className="rounded-xl border border-emerald-200 bg-white p-2"><div className="text-lg font-black">{energySummary.totals.netWallAreaSquareMeters.toFixed(2)} m²</div><div className="text-[9px] font-black uppercase">nettó fal</div></div><div className="rounded-xl border border-emerald-200 bg-white p-2"><div className="text-lg font-black">{energySummary.totals.floorAreaSquareMeters.toFixed(2)} m²</div><div className="text-[9px] font-black uppercase">padló / födém</div></div></div>
        {energySummary.orientationRows.length ? <details className="rounded-xl border border-emerald-200 bg-white"><summary className="cursor-pointer p-3 text-xs font-black">Tájolásonkénti bontás ({energySummary.orientationRows.length})</summary><div className="grid gap-1 border-t border-emerald-100 p-3">{energySummary.orientationRows.map((row) => <div key={row.orientation} className="flex items-center justify-between gap-2 text-[10px] font-bold"><span>{row.orientation} · {Math.round(row.azimuth)}°</span><span>{row.netWallAreaSquareMeters.toFixed(2)} m² nettó</span></div>)}</div></details> : null}
        {energySummary.assemblyRows.length ? <details className="rounded-xl border border-emerald-200 bg-white"><summary className="cursor-pointer p-3 text-xs font-black">Rétegrendből számított U-értékek ({energySummary.assemblyRows.length})</summary><div className="grid gap-1 border-t border-emerald-100 p-3">{energySummary.assemblyRows.map((row) => <div key={row.assemblyId} className="flex items-center justify-between gap-2 text-[10px] font-bold"><span className="truncate">{row.assemblyName}</span><span>{row.uValueWm2K === null ? "hiányos λ-adat" : `${row.uValueWm2K.toFixed(3)} W/m²K`}</span></div>)}</div></details> : null}
        <div className="grid gap-2 sm:grid-cols-3"><button type="button" disabled={exportState === "working"} onClick={() => void exportWinWattWorkbook()} className="survey-action-primary disabled:opacity-50"><Download size={17} /> WinWatt Excel</button><button type="button" disabled={exportState === "working"} onClick={exportWinWattJson} className="survey-action-secondary bg-white text-slate-950 disabled:opacity-50"><Download size={17} /> JSON</button><button type="button" disabled={exportState === "working"} onClick={exportWinWattCsv} className="survey-action-secondary bg-white text-slate-950 disabled:opacity-50"><Download size={17} /> Fal CSV</button></div>
        <div className="text-[10px] font-bold leading-4">A v0.8.0 Excel munkafüzet külön lapokon tartalmazza az általános adatokat, anyagokat, szerkezeteket, rétegeket, helyiségeket, szinteket, zónákat, határoló szerkezeteket, nyílászárókat, hőhidakat, gépészeti rendszereket, felújítási változatokat és megújuló/villamos előméretezést. Nem natív WinWatt projektfájl; szakmai ellenőrzés és WinWattban történő véglegesítés szükséges.</div>
      </div>

      <div className="grid gap-3 rounded-2xl border border-[var(--survey-border)] bg-[var(--survey-panel-strong)] p-3"><div><div className="text-sm font-black text-[var(--survey-text)]">Rétegezett DXF</div><div className="mt-1 text-xs font-semibold leading-5 text-[var(--survey-muted)]">AutoCAD és Archicad továbbrajzoláshoz, fal-, nyílászáró-, hőhatár-, metszet-, fotó- és hibajelrétegekkel.</div></div><button type="button" disabled={exportState === "working"} onClick={exportDxf} className="survey-action-primary disabled:opacity-50"><Factory size={18} /> DXF-fájl készítése</button></div>

      {thermalLayerAvailable ? <div className="rounded-xl border border-emerald-300 bg-emerald-50 p-3 text-xs font-bold leading-5 text-emerald-950">Energetikai hőhatár: {activeThermalSummary.segmentCount} falszakasz · {activeThermalSummary.totalMeters.toFixed(2).replace('.',',')} m. A teljes épület PDF és a DXF is tartalmazza.</div> : null}
    </div>;
  }


  function activateSurveyStep(stepId: SurveyStepId, closeFocusPanel = false) {
    setActiveStep(stepId);
    if (stepId === "energy") setEnergyCentralView("data");
    setMobileMenuOpen(false);
    setIssuePlacementMode(null);
    setPhotoPlacementMode(null);
    setMechanicalPlacementMode(null);
    setRoomDrawingMode(false);
    if (stepId !== "section") setSectionDrawingMode(false);
    if (stepId !== "industrial") setIndustrialTool("select");
    if (closeFocusPanel && !focusLeftPinnedRef.current) setFocusLeftOpen(false);
  }

  function renderSurveyStepButtons(focusMode = false) {
    return <div className="grid gap-2">{visibleSurveySteps.map((step) => {
      const index = steps.findIndex((item) => item.id === step.id);
      const Icon = step.icon;
      const active = step.id === activeStep;
      const done = completion[step.id];
      return <button key={step.id} type="button" data-survey-step={step.id} onClick={() => activateSurveyStep(step.id, focusMode)} className={`flex items-center gap-3 rounded-2xl border p-3 text-left transition ${active ? "border-cyan-400 bg-cyan-50 text-slate-950 shadow-sm" : "border-transparent bg-[var(--survey-panel-strong)] text-[var(--survey-text)] hover:border-[var(--survey-border)]"}`}><span className={`grid h-10 w-10 shrink-0 place-items-center rounded-xl ${done ? "bg-emerald-100 text-emerald-700" : active ? "bg-cyan-100 text-cyan-800" : "bg-[var(--survey-panel)] text-[var(--survey-muted)]"}`}>{done ? <Check size={18} /> : <Icon size={18} />}</span><span className="min-w-0 flex-1"><span className="block text-xs font-black uppercase tracking-[0.05em]">{index + 1}. {step.label}</span><span className={`mt-1 block text-[10px] font-semibold leading-4 ${active ? "text-slate-600" : "text-[var(--survey-muted)]"}`}>{step.description}</span></span></button>;
    })}</div>;
  }

  function renderIncompleteStepFilter() {
    if (!energyWorkspaceEnabled || draft.energyFieldWorkflow.mode !== "field") return null;
    return <label className="mt-3 flex min-h-11 items-center justify-between gap-3 rounded-xl border border-[var(--survey-border)] bg-[var(--survey-panel-strong)] px-3 py-2.5 text-xs font-black text-[var(--survey-text)]" data-energy-incomplete-step-filter>
      <span><span className="block">Csak a hiányos lépések</span><span className="mt-0.5 block text-[9px] font-semibold leading-4 text-[var(--survey-muted)]">A kész munkalapok ideiglenesen elrejtve.</span></span>
      <input type="checkbox" checked={draft.energyFieldWorkflow.showOnlyIncomplete} onChange={(event) => updateEnergyFieldWorkflow({ showOnlyIncomplete: event.target.checked })} className="h-5 w-5 shrink-0 accent-cyan-600" />
    </label>;
  }


  function clearFocusDrawingModes() {
    setRoomDrawingMode(false);
    setSectionDrawingMode(false);
    setIssuePlacementMode(null);
    setPhotoPlacementMode(null);
    setMechanicalPlacementMode(null);
    setIndustrialTool("select");
  }

  function openFocusInspector(step: SurveyStepId) {
    setActiveStep(step);
    if (step === "energy") {
      setEnergyCentralView("data");
      setFocusRightOpen(true);
      return;
    }
    setFocusRightOpen(true);
  }

  const activeDrawingToolLabel = sectionDrawingMode
    ? "Metszetvonal rajzolása"
    : roomDrawingMode
      ? "Helyiség rajzolása"
      : issuePlacementMode
      ? issuePlacementMode === "create" ? "Hibapont elhelyezése" : "Hibapont mozgatása"
      : photoPlacementMode
        ? photoPlacementMode === "create" ? "Fotópont elhelyezése" : "Fotópont mozgatása"
        : mechanicalPlacementMode
          ? mechanicalPlacementMode === "create" ? "Gépészeti berendezés elhelyezése" : "Gépészeti berendezés mozgatása"
          : isIndustrialMode && industrialTool !== "select"
            ? ({ buildingContour: "Épületkontúr", pillar: "Pillér", crack: "Repedés", repairArea: "Hibás térbeton", freehand: "Szabadkézi rajz", transformBackground: "Háttér mozgatása", calibrateBackground: "Háttér kalibrálása" } as Partial<Record<SurveyIndustrialTool, string>>)[industrialTool] || "Ipari rajzeszköz"
            : activeStep === "structures" ? "Falszakasz kijelölése"
              : activeStep === "openings" ? "Nyílászáró kijelölése"
                : orientationControlsOpen ? "Tájolás beállítása"
                  : "Kijelölés és mozgatás";

  const focusStatusMessage = exportState === "working"
    ? exportMessage
    : exportState === "error"
      ? exportMessage
      : saveState === "dirty"
        ? "Módosítások automatikus mentésre várnak"
        : `${activeDrawingToolLabel} · mentve`;


  function renderFloorPlanEngine(focusMode = false, focusLayout: "full" | "split" = "full") {
    const composedAddress = draft.property.address || [
      draft.property.postalCode,
      draft.property.settlement,
      [draft.property.street, draft.property.houseNumber].filter(Boolean).join(" "),
    ].filter(Boolean).join(" ");
    const sheetLocation = [
      composedAddress || activeProject?.location || "Nincs megadva",
      draft.property.parcelNumber ? `hrsz. ${draft.property.parcelNumber}` : "",
    ].filter(Boolean).join(", ");
    const sheetCreator = draft.exportDetails.engineerName || draft.exportDetails.companyName || "Nincs megadva";
    return (
      <SurveyFloorPlanEngine
        rooms={activeRooms}
        activeRoomId={activeRoomId}
        levelName={activeLevel?.name || "Szint"}
        northAngle={draft.northAngle}
        planSheet={draft.planSheet}
        effectiveScale={effectiveScale}
        projectName={activeProject?.name || "Projekt nélküli felmérés"}
        surveyName={draft.surveyName}
        surveyType={draft.surveyMode}
        surveyLocation={sheetLocation}
        surveyDate={draft.property.surveyDate || "Nincs megadva"}
        surveyCreator={sheetCreator}
        clientName={activeProject?.clientName || "Nincs megadva"}
        drawingRevision={`v${String(getNextRevisionNumber()).padStart(3, "0")}`}
        wallSegments={activeWallSegments}
        wallOpenings={activeWallOpenings}
        activeWallSegmentId={activeWallSegmentId}
        activeOpeningId={activeOpeningId}
        wallSelectionMode={activeStep === "structures" || activeStep === "openings"}
        thermalBoundary={activeThermalBoundary}
        thermalLayerAvailable={thermalLayerAvailable}
        orientationControlsOpen={orientationControlsOpen}
        onOrientationControlsOpenChange={setOrientationControlsOpen}
        photoPoints={activePhotoPoints}
        activePhotoPointId={activePhotoId}
        photoPlacementMode={photoPlacementMode}
        mechanicalDevices={activeMechanicalDevices}
        activeMechanicalDeviceId={activeMechanicalDeviceId}
        mechanicalPlacementMode={mechanicalPlacementMode}
        sectionLines={activeSectionLines}
        activeSectionLineId={activeSectionLine?.id || null}
        sectionDrawingMode={sectionDrawingMode}
        sectionDrawingConstraint={sectionDrawingConstraint}
        industrialMode={isIndustrialMode}
        focusMode={focusMode}
        focusLayout={focusLayout}
        industrialSettings={draft.industrialSettings}
        industrialBackground={draft.industrialBackground}
        industrialTool={industrialTool}
        industrialBuildingContours={activeIndustrialBuildingContours}
        activeIndustrialBuildingContourId={activeIndustrialBuildingContourId}
        pillars={activePillars}
        activePillarId={activePillarId}
        industrialMarkups={activeIndustrialMarkups}
        activeIndustrialMarkupId={activeIndustrialMarkupId}
        activeIndustrialPointIndex={activeIndustrialPointIndex}
        issues={activeLevelIssues}
        activeIssueId={activeIssueId}
        issuePlacementMode={issuePlacementMode}
        roomDrawingMode={roomDrawingMode}
        onRoomSelect={(roomId) => {
          setActiveRoomId(roomId);
          if (activeStep !== "structures" && activeStep !== "openings") setActiveStep("plan");
        }}
        onNorthAngleChange={(angle) => updateDraft("northAngle", angle)}
        onRoomDrawingStart={startRoomDrawing}
        onRoomDrawingCancel={() => setRoomDrawingMode(false)}
        onRoomDraw={addRoomFromRectangle}
        onRoomMove={moveRoom}
        onWallSelect={(segmentId) => {
          selectWallSegment(segmentId);
          if (activeStep !== "openings") setActiveStep("structures");
        }}
        onOpeningSelect={(openingId) => {
          const opening = draft.wallOpenings.find((item) => item.id === openingId);
          if (opening) setActiveWallSegmentId(opening.wallSegmentId);
          setActiveOpeningId(openingId);
          setActiveStep("openings");
        }}
        onOpeningMove={moveOpeningOnWall}
        onPhotoSelect={selectPhoto}
        onPhotoPlace={placePhoto}
        onPhotoPlacementCancel={() => setPhotoPlacementMode(null)}
        onMechanicalSelect={selectMechanicalDevice}
        onMechanicalPlace={placeMechanicalDevice}
        onMechanicalPlacementCancel={() => setMechanicalPlacementMode(null)}
        onPillarPlace={placePillar}
        onPillarSelect={(pillarId) => { setActiveIndustrialBuildingContourId(null); setActivePillarId(pillarId); setActiveIndustrialMarkupId(null); setActiveIndustrialPointIndex(null); setIndustrialTool("select"); setActiveStep("industrial"); }}
        onPillarMove={movePillarLive}
        onIndustrialBuildingContourSelect={(contourId) => { setActiveIndustrialBuildingContourId(contourId); setActivePillarId(null); setActiveIndustrialMarkupId(null); setActiveIndustrialPointIndex(null); setIndustrialTool("select"); setActiveStep("industrial"); }}
        onIndustrialBuildingContourCreate={createBuildingContour}
        onIndustrialBuildingContourPointMove={moveBuildingContourPointLive}
        onIndustrialMarkupSelect={(markupId) => { setActiveIndustrialBuildingContourId(null); setActiveIndustrialMarkupId(markupId); setActivePillarId(null); setActiveIndustrialPointIndex(null); setIndustrialTool("select"); setActiveStep("industrial"); }}
        onIndustrialMarkupCreate={createMarkup}
        onIndustrialMarkupPointMove={moveIndustrialMarkupPointLive}
        onIndustrialVectorPointSelect={(entityType, entityId, pointIndex) => {
          if (entityType === "building") { setActiveIndustrialBuildingContourId(entityId); setActiveIndustrialMarkupId(null); }
          else { setActiveIndustrialMarkupId(entityId); setActiveIndustrialBuildingContourId(null); }
          setActivePillarId(null);
          setActiveIndustrialPointIndex(pointIndex);
          setIndustrialTool("select");
          setActiveStep("industrial");
        }}
        onIndustrialBackgroundTransform={moveIndustrialBackgroundLive}
        onIndustrialVectorEditStart={beginIndustrialVectorEdit}
        onIndustrialVectorEditEnd={endIndustrialVectorEdit}
        onIndustrialBackgroundCalibrationPointAdd={addIndustrialBackgroundCalibrationPoint}
        onIssueSelect={selectIssue}
        onIssuePlace={placeIssue}
        onIssuePlacementCancel={() => setIssuePlacementMode(null)}
        onSectionLineSelect={selectSectionLine}
        onSectionLineDraw={createSectionFromLine}
        onSectionDrawingCancel={() => setSectionDrawingMode(false)}
      />
    );
  }

  function renderPlanDocumentWorkspace() {
    return <PropertySurveyPlanDocumentWorkspace
      workspace={draft.planDocumentWorkspace}
      projectName={activeProject?.name || "Projekt nélküli felmérés"}
      surveyName={draft.surveyName || "Névtelen felmérés"}
      levels={draft.levels}
      rooms={draft.rooms}
      assemblies={draft.assemblies}
      zoneWorkspace={draft.energyZoneWorkspace}
      wallSegments={draft.wallSegments}
      wallOpenings={draft.wallOpenings}
      openingWorkspace={draft.energyOpeningWorkspace}
      viewMode={energyCentralView}
      onViewModeChange={setEnergyCentralView}
      onChange={updatePlanDocumentWorkspace}
      onApproveRoom={approvePlanDocumentRoom}
      onTransferEnergyModel={transferPlanPageToEnergyModel}
      onAcknowledgeEnergyModel={acknowledgePlanPageModelChanges}
      onRemoveEnergyTransfer={removePlanPageEnergyTransfer}
      onApplyVersionEnergyModel={applyPlanVersionToEnergyModel}
      onRollbackVersionEnergyModel={rollbackPlanVersionEnergyModel}
    />;
  }

  function handleFocusCanvasPointerDown(event: React.PointerEvent<HTMLElement>) {
    const target = event.target as HTMLElement;
    if (target.closest(".survey-focus-panel") || target.closest(".survey-focus-topbar") || target.closest(".survey-focus-plan-panel") || target.closest("[data-energy-quick-cards]")) return;
    if (!focusLeftPinnedRef.current) setFocusLeftOpen(false);
    if (!focusRightPinnedRef.current) setFocusRightOpen(false);
    setFocusPlanOpen(false);
  }

  function renderPlanStatistics() {
    return <div className="survey-no-print mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-6" data-survey-plan-statistics>
      <div className="rounded-2xl border border-[var(--survey-border)] bg-[var(--survey-panel)] p-4"><div className="text-[10px] font-black uppercase text-[var(--survey-muted)]">Összes alapterület</div><div className="mt-2 text-2xl font-black">{totalArea.toFixed(1)} m²</div></div>
      <div className="rounded-2xl border border-[var(--survey-border)] bg-[var(--survey-panel)] p-4"><div className="text-[10px] font-black uppercase text-[var(--survey-muted)]">Fűtött alapterület</div><div className="mt-2 text-2xl font-black">{heatedArea.toFixed(1)} m²</div></div>
      <div data-external-wall-total className="rounded-2xl border border-orange-300 bg-orange-50 p-4 text-slate-950"><div className="text-[10px] font-black uppercase text-orange-800">Külső falhossz · aktív szint</div><div className="mt-2 text-2xl font-black">{activeExternalWallSummary.totalMeters.toFixed(2).replace(".", ",")} m</div><div className="mt-1 text-[9px] font-bold text-slate-600">{activeExternalWallSummary.segmentCount} automatikus szakasz</div></div>
      <div className="rounded-2xl border border-[var(--survey-border)] bg-[var(--survey-panel)] p-4"><div className="text-[10px] font-black uppercase text-[var(--survey-muted)]">Ablak / ajtó</div><div className="mt-2 text-2xl font-black">{totalWindows} / {totalDoors}</div><div className="mt-1 text-[9px] font-bold text-[var(--survey-muted)]">külön nyilvántartva</div></div>
      <div className="rounded-2xl border border-[var(--survey-border)] bg-[var(--survey-panel)] p-4"><div className="text-[10px] font-black uppercase text-[var(--survey-muted)]">Északi szög</div><div className="mt-2 text-2xl font-black">{draft.northAngle}°</div></div>
      <button type="button" onClick={() => setActiveStep("issues")} className="rounded-2xl border border-[var(--survey-border)] bg-[var(--survey-panel)] p-4 text-left transition hover:border-amber-300"><div className="text-[10px] font-black uppercase text-[var(--survey-muted)]">Hibapontok</div><div className="mt-2 flex items-center gap-2 text-2xl font-black"><AlertTriangle size={21} className="text-amber-500" /> {issues.length} db</div></button>
    </div>;
  }

  function renderNormalPlanSurface(includeStatistics = true) {
    return <div className="min-w-0" data-survey-normal-plan-surface>
      <PropertySurveyPlanToolbar
        levels={draft.levels}
        activeLevelId={draft.activeLevelId}
        planSheet={draft.planSheet}
        recommendedScale={recommendedScale}
        canDeleteLevel={draft.levels.length > 1}
        onLevelSelect={selectLevel}
        onAddLevel={addLevel}
        onRenameLevel={renameLevel}
        onDeleteLevel={deleteActiveLevel}
        onPlanSheetChange={updatePlanSheet}
      />
      {activeRoomOverlapDetails.length ? <div className="survey-no-print mb-3">{renderRoomOverlapWarnings()}</div> : null}
      {renderFloorPlanEngine(false)}
      {includeStatistics ? renderPlanStatistics() : null}
    </div>;
  }

  function renderCentralWorkspaceHeader() {
    const activeTabLabel = energyWorkspaceTabs.find((item) => item.id === energyWorkspaceTab)?.label || "Energetika";
    return <div className="survey-no-print flex flex-col gap-3 rounded-2xl border border-[var(--survey-border)] bg-[var(--survey-panel)] p-4 shadow-sm sm:flex-row sm:items-center sm:justify-between" data-energy-central-header>
      <div><div className="text-[9px] font-black uppercase tracking-[0.13em] text-[var(--survey-accent)]">Központi szakértői munkatér</div><div className="mt-1 text-lg font-black">{activeTabLabel}</div><div className="mt-1 text-[10px] font-semibold text-[var(--survey-muted)]">A teljes űrlapok és táblák itt, használható szélességben jelennek meg.</div></div>
      {renderEnergyViewSwitch(false)}
    </div>;
  }

  function renderNormalEnergyCentralWorkspace() {
    return <div className="grid min-w-0 gap-4" data-energy-central-workspace data-energy-central-mode={energyCentralView}>
      {renderCentralWorkspaceHeader()}
      {renderEnergyQuickCards()}
      {energyCentralView === "plan" ? renderNormalPlanSurface(false) : null}
      {energyCentralView === "data" ? <div className="min-w-0 rounded-[1.5rem] border border-[var(--survey-border)] bg-[var(--survey-panel)] p-3 shadow-sm sm:p-5" data-energy-central-data>{renderEnergyWorkspaceContent(true)}</div> : null}
      {energyCentralView === "split" ? <div className="grid min-w-0 gap-4 2xl:grid-cols-[minmax(0,1.05fr)_minmax(560px,.95fr)]" data-energy-central-split>
        <div className="min-w-0 overflow-hidden rounded-[1.5rem] border border-[var(--survey-border)] bg-[var(--survey-panel)]" data-energy-central-plan-pane style={{ minHeight: 720 }}>{renderFloorPlanEngine(true, "split")}</div>
        <div className="min-w-0 overflow-y-auto rounded-[1.5rem] border border-[var(--survey-border)] bg-[var(--survey-panel)] p-3 sm:p-4 2xl:max-h-[760px]" data-energy-central-data-pane>{renderEnergyWorkspaceContent(true)}</div>
      </div> : null}
    </div>;
  }

  function renderFocusEnergyCentralWorkspace() {
    if (energyCentralView === "plan") return <>
      <div className="survey-focus-canvas" data-survey-focus-canvas onPointerDown={handleFocusCanvasPointerDown}>{renderFloorPlanEngine(true, "full")}</div>
      <div className="survey-focus-energy-quickcards survey-no-print" onPointerDown={(event) => event.stopPropagation()}>{renderEnergyQuickCards()}</div>
    </>;
    if (energyCentralView === "data") return <div className="survey-focus-energy-data survey-no-print" data-energy-focus-data onPointerDown={(event) => event.stopPropagation()}>
      <div className="survey-focus-energy-header">{renderCentralWorkspaceHeader()}{renderEnergyQuickCards()}</div>
      <div className="survey-focus-energy-scroll">{renderEnergyWorkspaceContent(true)}</div>
    </div>;
    return <div className="survey-focus-energy-split survey-no-print" data-energy-focus-split onPointerDown={(event) => event.stopPropagation()}>
      <div className="survey-focus-energy-plan-pane" data-energy-focus-plan-pane>{renderFloorPlanEngine(true, "split")}</div>
      <div className="survey-focus-energy-data-pane" data-energy-focus-data-pane><div className="survey-focus-energy-header">{renderCentralWorkspaceHeader()}{renderEnergyQuickCards()}</div><div className="survey-focus-energy-scroll">{renderEnergyWorkspaceContent(true)}</div></div>
    </div>;
  }

  return (
    <main ref={focusRootRef} data-survey-theme={theme} style={themeVariables} className={`${drawingFocusMode ? "survey-focus-root" : "min-h-screen"} overflow-x-hidden bg-[var(--survey-bg)] text-[var(--survey-text)] transition-colors`}>
      <style jsx global>{`
        .survey-grid { background-image: linear-gradient(rgba(71,85,105,.14) 1px, transparent 1px), linear-gradient(90deg, rgba(71,85,105,.14) 1px, transparent 1px); background-size: 22px 22px; }
        .survey-tool-button { display:inline-flex; min-height:36px; align-items:center; justify-content:center; gap:7px; border:1px solid var(--survey-border); border-radius:10px; background:var(--survey-panel); padding:7px 10px; color:var(--survey-text); font-size:11px; font-weight:900; text-transform:uppercase; letter-spacing:.04em; transition:.15s ease; }
        .survey-tool-button:hover { border-color:#06b6d4; transform:translateY(-1px); }
        .survey-tool-button-active { border-color:#22d3ee; background:#cffafe; color:#155e75; }
        .survey-action-primary, .survey-action-secondary, .survey-action-danger { display:inline-flex; min-height:44px; align-items:center; justify-content:center; gap:8px; border-radius:12px; padding:10px 14px; font-size:12px; font-weight:900; text-transform:uppercase; letter-spacing:.05em; transition:.15s ease; }
        .survey-action-primary { border:1px solid #0e7490; background:#0e7490; color:white; }
        .survey-action-primary:hover { background:#155e75; }
        .survey-action-secondary { border:1px solid var(--survey-border); background:var(--survey-panel-strong); color:var(--survey-text); }
        [data-survey-theme="sun"] .survey-tool-button,
        [data-survey-theme="sun"] .survey-icon-button,
        [data-survey-theme="sun"] .survey-action-secondary { border-color:#475569; background:#ffffff; color:#020617; box-shadow:none; }
        [data-survey-theme="sun"] .survey-tool-button-active,
        [data-survey-theme="sun"] .survey-focus-dock-button.is-active { border-color:#006b72; background:#99f6e4; color:#042f2e; box-shadow:0 0 0 2px rgba(0,107,114,.28); }
        [data-survey-theme="sun"] .survey-focus-topbar,
        [data-survey-theme="sun"] .survey-focus-dock,
        [data-survey-theme="sun"] .survey-focus-statusbar,
        [data-survey-theme="sun"] .survey-focus-panel,
        [data-survey-theme="sun"] .survey-focus-plan-panel { background:#ffffff; border-color:#475569; backdrop-filter:none; }
        [data-survey-theme="sun"] .survey-grid { background-image:linear-gradient(rgba(15,23,42,.24) 1px,transparent 1px),linear-gradient(90deg,rgba(15,23,42,.24) 1px,transparent 1px); }
        [data-survey-theme="sun"] input,
        [data-survey-theme="sun"] select,
        [data-survey-theme="sun"] textarea { border-color:#64748b !important; background:#ffffff !important; color:#020617 !important; }
        [data-survey-theme="sun"] .survey-focus-rail { background:#f8fafc; color:#020617; border-color:#475569; }
        .survey-action-secondary:hover { border-color:#22d3ee; }
        .survey-action-danger { border:1px solid #fecaca; background:#fff1f2; color:#be123c; }
        .survey-action-danger:disabled { cursor:not-allowed; opacity:.45; }
        .survey-icon-button { display:inline-flex; height:36px; width:36px; align-items:center; justify-content:center; border:1px solid var(--survey-border); border-radius:10px; background:var(--survey-panel-strong); color:var(--survey-text); }
        .survey-focus-root { position:fixed; inset:0; z-index:2147483000; width:100vw; height:100dvh; overflow:hidden; background:var(--survey-canvas); }
        .survey-focus-shell { position:relative; display:block !important; width:100vw; height:100dvh; overflow:hidden; }
        .survey-focus-canvas { position:absolute; inset:0; z-index:10; min-width:0; height:100dvh; }
        .survey-focus-panel { position:absolute; top:0; bottom:0; z-index:100; width:min(370px,88vw); overflow:hidden; border-color:var(--survey-border); background:color-mix(in srgb, var(--survey-panel) 96%, transparent); box-shadow:0 24px 70px rgba(15,23,42,.28); backdrop-filter:blur(18px); transition:transform .22s ease; }
        .survey-focus-panel-left { left:0; transform:translateX(calc(-100% + 48px)); border-radius:0 22px 22px 0; }
        .survey-focus-panel-right { right:0; transform:translateX(calc(100% - 48px)); border-radius:22px 0 0 22px; }
        .survey-focus-panel.is-open { transform:translateX(0); }
        .survey-focus-panel-content { height:100%; overflow-y:auto; overscroll-behavior:contain; padding-top:max(86px,calc(env(safe-area-inset-top) + 78px)) !important; padding-bottom:110px !important; }
        .survey-focus-panel-content-left { padding-right:52px; }
        .survey-focus-panel-content-right { padding-left:52px; }
        .survey-focus-rail { position:absolute; top:0; bottom:0; z-index:3; display:flex; width:48px; align-items:center; justify-content:center; gap:10px; border:0; background:linear-gradient(180deg,#0e7490,#155e75); color:white; touch-action:manipulation; }
        .survey-focus-rail-left { right:0; border-radius:0 20px 20px 0; }
        .survey-focus-rail-right { left:0; border-radius:20px 0 0 20px; }
        .survey-focus-rail span { writing-mode:vertical-rl; transform:rotate(180deg); font-size:10px; font-weight:900; text-transform:uppercase; letter-spacing:.14em; }
        .survey-focus-topbar { position:absolute; left:50%; top:max(8px,env(safe-area-inset-top)); z-index:110; display:flex; max-width:calc(100vw - 116px); transform:translateX(-50%); align-items:center; gap:8px; border:1px solid rgba(148,163,184,.45); border-radius:16px; background:color-mix(in srgb, var(--survey-panel) 90%, transparent); padding:7px; box-shadow:0 16px 45px rgba(15,23,42,.22); backdrop-filter:blur(18px); }
        .survey-focus-dock { position:absolute; left:50%; bottom:30px; z-index:115; display:flex; max-width:calc(100vw - 132px); transform:translateX(-50%); align-items:center; gap:6px; overflow-x:auto; overscroll-behavior-x:contain; border:1px solid rgba(148,163,184,.48); border-radius:17px; background:color-mix(in srgb, var(--survey-panel) 92%, transparent); padding:7px; box-shadow:0 18px 48px rgba(15,23,42,.26); backdrop-filter:blur(18px); scrollbar-width:none; }
        .survey-focus-dock::-webkit-scrollbar { display:none; }
        .survey-focus-dock-button { display:inline-flex; min-height:42px; flex:0 0 auto; align-items:center; justify-content:center; gap:6px; border:1px solid var(--survey-border); border-radius:11px; background:var(--survey-panel-strong); padding:7px 10px; color:var(--survey-text); font-size:9px; font-weight:900; text-transform:uppercase; letter-spacing:.04em; }
        .survey-focus-dock-button.is-active { border-color:#14b8a6; background:#ccfbf1; color:#115e59; box-shadow:0 0 0 2px rgba(20,184,166,.18); }
        .survey-focus-statusbar { position:absolute; left:48px; right:48px; bottom:0; z-index:114; height:24px; overflow:hidden; border-top:1px solid rgba(20,184,166,.35); background:color-mix(in srgb, var(--survey-panel) 94%, transparent); color:var(--survey-text); backdrop-filter:blur(14px); }
        .survey-focus-statusbar-text { position:relative; z-index:2; display:flex; height:18px; align-items:center; justify-content:space-between; gap:12px; padding:0 12px; font-size:9px; font-weight:900; text-transform:uppercase; letter-spacing:.07em; white-space:nowrap; }
        .survey-focus-progress-track { position:absolute; left:0; right:0; bottom:0; height:6px; background:rgba(148,163,184,.25); }
        .survey-focus-progress-value { height:100%; background:linear-gradient(90deg,#14b8a6,#22d3ee,#10b981); box-shadow:0 0 14px rgba(20,184,166,.72); transition:width .28s ease; }
        .survey-focus-progress-value.is-error { background:linear-gradient(90deg,#fb7185,#ef4444); }
        .survey-focus-progress-value.is-working { background:linear-gradient(90deg,#06b6d4,#2dd4bf,#06b6d4); background-size:200% 100%; animation:survey-progress-flow 1.1s linear infinite; }
        @keyframes survey-progress-flow { from { background-position:0 0; } to { background-position:200% 0; } }
        .survey-focus-plan-panel { position:absolute; left:50%; top:78px; z-index:105; width:min(1080px,calc(100vw - 112px)); max-height:calc(100dvh - 90px); transform:translate(-50%,-18px); overflow-y:auto; border:1px solid var(--survey-border); border-radius:22px; background:color-mix(in srgb, var(--survey-panel) 97%, transparent); padding:12px; opacity:0; pointer-events:none; box-shadow:0 24px 70px rgba(15,23,42,.28); backdrop-filter:blur(18px); transition:.18s ease; }
        .survey-focus-plan-panel.is-open { transform:translate(-50%,0); opacity:1; pointer-events:auto; }
        .survey-focus-panel-pin { display:inline-flex; height:38px; min-width:38px; align-items:center; justify-content:center; gap:7px; border:1px solid var(--survey-border); border-radius:11px; background:var(--survey-panel-strong); color:var(--survey-text); font-size:10px; font-weight:900; text-transform:uppercase; }
        .survey-focus-panel-pin.is-pinned { border-color:#22d3ee; background:#cffafe; color:#155e75; }
        .survey-focus-energy-data { position:absolute; left:60px; right:60px; top:72px; bottom:84px; z-index:30; display:flex; min-width:0; flex-direction:column; overflow:hidden; border:1px solid var(--survey-border); border-radius:22px; background:var(--survey-bg); box-shadow:0 24px 70px rgba(15,23,42,.24); }
        .survey-focus-energy-header { position:relative; z-index:2; display:grid; gap:10px; flex:0 0 auto; border-bottom:1px solid var(--survey-border); background:color-mix(in srgb,var(--survey-bg) 94%,transparent); padding:10px; backdrop-filter:blur(16px); }
        .survey-focus-energy-scroll { min-height:0; min-width:0; flex:1; overflow:auto; overscroll-behavior:contain; padding:14px; }
        .survey-focus-energy-split { position:absolute; left:60px; right:60px; top:72px; bottom:84px; z-index:30; display:grid; min-width:0; grid-template-columns:minmax(0,1.08fr) minmax(480px,.92fr); gap:10px; overflow:hidden; }
        .survey-focus-energy-plan-pane, .survey-focus-energy-data-pane { min-width:0; min-height:0; overflow:hidden; border:1px solid var(--survey-border); border-radius:20px; background:var(--survey-panel); box-shadow:0 18px 48px rgba(15,23,42,.20); }
        .survey-focus-energy-data-pane { display:flex; flex-direction:column; }
        .survey-focus-energy-quickcards { position:absolute; left:72px; right:72px; top:82px; z-index:40; }
        .survey-focus-topbar { overflow-x:auto; overscroll-behavior-x:contain; scrollbar-width:none; }
        .survey-focus-topbar::-webkit-scrollbar { display:none; }
        [data-survey-focus-layout="split"] .survey-tool-button span { display:none; }
        @media (max-width:1180px) {
          .survey-focus-energy-split { grid-template-columns:1fr; grid-template-rows:minmax(300px,.9fr) minmax(360px,1.1fr); overflow-y:auto; }
          .survey-focus-energy-plan-pane, .survey-focus-energy-data-pane { min-height:360px; }
          .survey-focus-energy-data-pane { overflow:visible; }
          .survey-focus-energy-data-pane .survey-focus-energy-scroll { min-height:520px; }
        }
        @media (max-width:900px) {
          .survey-focus-energy-data, .survey-focus-energy-split { left:56px; right:56px; top:66px; bottom:82px; border-radius:16px; }
          .survey-focus-energy-data { background:var(--survey-bg); }
          .survey-focus-energy-header { padding:8px; }
          .survey-focus-energy-scroll { padding:9px; }
          .survey-focus-energy-quickcards { left:62px; right:62px; top:74px; }
        }
        @media (max-width:640px) {
          .survey-focus-energy-data, .survey-focus-energy-split { left:54px; right:54px; top:62px; bottom:78px; }
          .survey-focus-energy-split { grid-template-rows:minmax(250px,.75fr) minmax(420px,1.25fr); }
          .survey-focus-energy-quickcards { left:58px; right:58px; top:68px; }
          .survey-focus-energy-scroll { padding:7px; }
        }
        @media (pointer:coarse) { .survey-focus-rail { width:54px; } .survey-focus-statusbar { left:54px; right:54px; } .survey-focus-dock-button { min-height:48px; min-width:48px; } .survey-focus-panel-left { transform:translateX(calc(-100% + 54px)); } .survey-focus-panel-right { transform:translateX(calc(100% - 54px)); } .survey-focus-panel.is-open { transform:translateX(0); } .survey-focus-topbar button { min-height:44px; } }
        @media (max-width:640px) { .survey-focus-topbar { left:58px; right:58px; max-width:none; transform:none; justify-content:center; } .survey-focus-dock { max-width:calc(100vw - 116px); } .survey-focus-dock-button span { display:none; } .survey-focus-topbar .survey-focus-title { display:none; } .survey-focus-plan-panel { width:calc(100vw - 116px); } }
        @media print { .survey-no-print { display:none !important; } main { background:white !important; } }
      `}</style>

      {!drawingFocusMode ? <header className="survey-no-print sticky top-0 z-40 border-b border-[var(--survey-border)] bg-[var(--survey-panel)]/95 shadow-sm backdrop-blur-xl">
        <div className="mx-auto flex max-w-[1800px] items-center justify-between gap-3 px-4 py-3 lg:px-6">
          <div className="flex min-w-0 items-center gap-3">
            {!projectCenterOpen && activeSurveyId ? <button type="button" onClick={() => setMobileMenuOpen((current) => !current)} className="survey-icon-button lg:hidden"><Menu size={18} /></button> : null}
            <Link href="/" className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-gradient-to-br from-teal-500 to-teal-800 text-base font-black text-white shadow-lg">P</Link>
            <div className="min-w-0"><div className="truncate text-lg font-black tracking-[-0.02em]">DIMPRO Felmérő</div><div className="truncate text-xs font-semibold text-[var(--survey-muted)]">Energetikai, épület- és csarnokfelmérés</div></div>
          </div>
          <div className="flex items-center gap-2">
            <span className="hidden rounded-full border border-lime-300 bg-lime-50 px-3 py-1.5 text-[10px] font-black uppercase tracking-[0.10em] text-teal-800 md:inline-flex">v0.8.4.3</span>
            <button type="button" onClick={openProjectCenter} className="survey-action-secondary hidden sm:inline-flex"><FolderKanban size={16} /> Projektek</button>
            {!projectCenterOpen && activeSurveyId ? <button type="button" data-survey-focus-enter onClick={() => void enterDrawingFocusMode()} className="survey-action-primary hidden md:inline-flex"><Maximize2 size={16} /> Rajzi teljes képernyő</button> : null}
            {!projectCenterOpen && activeSurveyId ? <PropertySurveyWorkTimer workspace={draft.workTimerWorkspace} activeStepId={activeStep} activeStepLabel={steps.find((step) => step.id === activeStep)?.label || "Munkalap"} projectName={activeProject?.name || "Projekt nélküli felmérés"} surveyName={draft.surveyName} compact onChange={updateWorkTimerWorkspace} /> : null}
            <button type="button" data-survey-theme-toggle onClick={cycleTheme} className="survey-icon-button" aria-label={`Téma váltása. Aktív: ${themeLabel}`} title={themeLabel}>{theme === "light" ? <Moon size={17} /> : theme === "dark" ? <Sun size={17} /> : <span className="text-[9px] font-black tracking-[-0.04em]">SUN</span>}</button>
            {!projectCenterOpen && activeSurveyId ? <HoldActionButton tone="success" durationMs={2000} compact icon={<Save size={16} />} label={saveState === "saved" ? "Mentve · 2 mp" : "Mentés · 2 mp"} holdingLabel="Mentéshez" completedLabel="Mentve" ariaLabel="A felmérés kézi mentéséhez tartsd nyomva 2 másodpercig" onComplete={saveNow} /> : null}
          </div>
        </div>
      </header> : null}

      {!workspaceReady ? (
        <div className="grid min-h-[60vh] place-items-center"><div className="text-center"><ScanLine className="mx-auto animate-pulse text-cyan-600" size={38} /><div className="mt-3 text-sm font-black text-[var(--survey-text)]">Projektadatok betöltése...</div></div></div>
      ) : projectCenterOpen || !activeSurveyId ? (
        <PropertySurveyProjectCenter
          workspace={workspace}
          selectedProjectId={selectedProjectId}
          onSelectProject={selectProject}
          onCreateProject={createProject}
          onCreateSurvey={createSurvey}
          onOpenSurvey={openSurvey}
        />
      ) : drawingFocusMode ? (
        <div className="survey-focus-shell" data-survey-focus-mode="true">
          {activeStep === "energy" ? renderFocusEnergyCentralWorkspace() : activeStep === "planDocument" ? <div className="survey-focus-energy-data survey-no-print" data-plan-document-focus onPointerDown={(event) => event.stopPropagation()}><div className="survey-focus-energy-scroll">{renderPlanDocumentWorkspace()}</div></div> : <div className="survey-focus-canvas" data-survey-focus-canvas onPointerDown={handleFocusCanvasPointerDown}>
            {renderFloorPlanEngine(true, "full")}
          </div>}

          <div className="survey-focus-topbar survey-no-print" data-survey-focus-topbar>
            <button type="button" data-focus-open-left onClick={() => setFocusLeftOpen((current) => !current)} className={focusLeftOpen || focusLeftPinned ? "survey-tool-button survey-tool-button-active" : "survey-tool-button"} aria-label="Felmérési lépések megnyitása"><PanelLeftOpen size={17} /></button>
            <button type="button" data-focus-open-plan onClick={() => setFocusPlanOpen((current) => !current)} className={focusPlanOpen ? "survey-tool-button survey-tool-button-active" : "survey-tool-button"} aria-label="Szint és lapbeállítások"><PencilRuler size={17} /><span className="hidden sm:inline">Lap / szint</span></button>
            <div className="survey-focus-title min-w-0 px-2 text-center"><div className="truncate text-[10px] font-black uppercase tracking-[0.12em] text-[var(--survey-accent)]">{activeLevel?.shortName || activeLevel?.name || "Szint"} · {steps.find((step) => step.id === activeStep)?.label}</div><div className="truncate text-xs font-black text-[var(--survey-text)]">{draft.surveyName}</div></div>
            {activeStep === "energy" ? renderEnergyViewSwitch(true) : activeStep === "planDocument" ? <div className="inline-grid grid-cols-3 gap-1 rounded-xl border border-[var(--survey-border)] bg-[var(--survey-panel)] p-1">{(["plan","data","split"] as EnergyCentralViewMode[]).map((mode) => <button key={mode} type="button" onClick={() => setEnergyCentralView(mode)} className={`min-h-9 rounded-lg px-2 text-[8px] font-black uppercase ${energyCentralView === mode ? "bg-cyan-700 text-white" : "text-[var(--survey-muted)]"}`}>{mode === "plan" ? "Rajz" : mode === "data" ? "Adatok" : "Osztott"}</button>)}</div> : null}
            <PropertySurveyWorkTimer workspace={draft.workTimerWorkspace} activeStepId={activeStep} activeStepLabel={steps.find((step) => step.id === activeStep)?.label || "Munkalap"} projectName={activeProject?.name || "Projekt nélküli felmérés"} surveyName={draft.surveyName} compact onChange={updateWorkTimerWorkspace} />
            <HoldActionButton tone="success" durationMs={2000} compact icon={<Save size={16} />} label={saveState === "saved" ? "Mentve" : "Mentés"} holdingLabel="Mentéshez" completedLabel="Mentve" ariaLabel="A felmérés kézi mentéséhez tartsd nyomva 2 másodpercig" onComplete={saveNow} />
            <button type="button" data-survey-theme-toggle onClick={cycleTheme} className="survey-icon-button" aria-label={`Téma váltása. Aktív: ${themeLabel}`} title={themeLabel}>{theme === "light" ? <Moon size={17} /> : theme === "dark" ? <Sun size={17} /> : <span className="text-[9px] font-black tracking-[-0.04em]">SUN</span>}</button>
            <button type="button" data-focus-open-right onClick={() => setFocusRightOpen((current) => !current)} className={focusRightOpen || focusRightPinned ? "survey-tool-button survey-tool-button-active" : "survey-tool-button"} aria-label="Aktív munkalap megnyitása"><PanelRightOpen size={17} /></button>
            <button type="button" data-survey-focus-exit onClick={() => void exitDrawingFocusMode()} className="survey-tool-button" aria-label="Kilépés a rajzi teljes képernyőből"><Minimize2 size={17} /><span className="hidden sm:inline">Kilépés</span></button>
          </div>

          <div className="survey-focus-dock survey-no-print" data-survey-focus-dock onPointerDown={(event) => event.stopPropagation()}>
            <button type="button" data-focus-tool="select" onClick={() => { clearFocusDrawingModes(); setOrientationControlsOpen(false); setActiveStep(isIndustrialMode ? "industrial" : "plan"); }} className={`survey-focus-dock-button ${!roomDrawingMode && !sectionDrawingMode && !issuePlacementMode && !photoPlacementMode && !mechanicalPlacementMode && industrialTool === "select" && activeStep !== "structures" && activeStep !== "openings" && !orientationControlsOpen ? "is-active" : ""}`}><Move size={17} /><span>Kijelölés</span></button>
            {isIndustrialMode ? <>
              <button type="button" data-focus-tool="buildingContour" onClick={() => { clearFocusDrawingModes(); setActiveStep("industrial"); setIndustrialTool("buildingContour"); }} className={`survey-focus-dock-button ${industrialTool === "buildingContour" ? "is-active" : ""}`}><Building2 size={17} /><span>Épület</span></button>
              <button type="button" data-focus-tool="pillar" onClick={() => { clearFocusDrawingModes(); setActiveStep("industrial"); setIndustrialTool("pillar"); }} className={`survey-focus-dock-button ${industrialTool === "pillar" ? "is-active" : ""}`}><Factory size={17} /><span>Pillér</span></button>
              <button type="button" data-focus-tool="crack" onClick={() => { clearFocusDrawingModes(); setActiveStep("industrial"); setIndustrialTool("crack"); }} className={`survey-focus-dock-button ${industrialTool === "crack" ? "is-active" : ""}`}><PencilRuler size={17} /><span>Repedés</span></button>
              <button type="button" data-focus-tool="repairArea" onClick={() => { clearFocusDrawingModes(); setActiveStep("industrial"); setIndustrialTool("repairArea"); }} className={`survey-focus-dock-button ${industrialTool === "repairArea" ? "is-active" : ""}`}><Layers3 size={17} /><span>Térbeton</span></button>
              <button type="button" data-focus-tool="freehand" onClick={() => { clearFocusDrawingModes(); setActiveStep("industrial"); setIndustrialTool("freehand"); }} className={`survey-focus-dock-button ${industrialTool === "freehand" ? "is-active" : ""}`}><Ruler size={17} /><span>Szabadkézi</span></button>
              {draft.industrialBackground ? <button type="button" data-focus-tool="transformBackground" onClick={() => { clearFocusDrawingModes(); setActiveStep("industrial"); setIndustrialTool("transformBackground"); }} className={`survey-focus-dock-button ${industrialTool === "transformBackground" ? "is-active" : ""}`}><Move size={17} /><span>Háttér</span></button> : null}
            </> : <>
              <button type="button" data-focus-tool="room" onClick={() => { clearFocusDrawingModes(); setActiveStep("plan"); startRoomDrawing(); }} className={`survey-focus-dock-button ${roomDrawingMode ? "is-active" : ""}`}><PencilRuler size={17} /><span>Helyiség</span></button>
              <button type="button" data-focus-tool="wall" onClick={() => { clearFocusDrawingModes(); openFocusInspector("structures"); }} className={`survey-focus-dock-button ${activeStep === "structures" ? "is-active" : ""}`}><Layers3 size={17} /><span>Fal</span></button>
              <button type="button" data-focus-tool="opening" onClick={() => { clearFocusDrawingModes(); openFocusInspector("openings"); }} className={`survey-focus-dock-button ${activeStep === "openings" ? "is-active" : ""}`}><Ruler size={17} /><span>Nyílászáró</span></button>
              <button type="button" data-focus-tool="photo" onClick={() => { clearFocusDrawingModes(); setActiveStep("photos"); setPhotoPlacementMode("create"); }} className={`survey-focus-dock-button ${photoPlacementMode ? "is-active" : ""}`}><Camera size={17} /><span>Fotó</span></button>
              <button type="button" data-focus-tool="issue" onClick={() => { clearFocusDrawingModes(); setActiveStep("issues"); setIssuePlacementMode("create"); }} className={`survey-focus-dock-button ${issuePlacementMode ? "is-active" : ""}`}><AlertTriangle size={17} /><span>Hiba</span></button>
              {steps.some((step) => step.id === "mechanical") ? <button type="button" data-focus-tool="mechanical" onClick={() => { clearFocusDrawingModes(); setActiveStep("mechanical"); setMechanicalPlacementMode("create"); }} className={`survey-focus-dock-button ${mechanicalPlacementMode ? "is-active" : ""}`}><Flame size={17} /><span>Gépészet</span></button> : null}
              {steps.some((step) => step.id === "energy") ? <button type="button" data-focus-tool="energy" onClick={() => { clearFocusDrawingModes(); openFocusInspector("energy"); }} className={`survey-focus-dock-button ${activeStep === "energy" ? "is-active" : ""}`}><Gauge size={17} /><span>Energetika</span></button> : null}
              <button type="button" data-focus-tool="orientation" onClick={() => { clearFocusDrawingModes(); setOrientationControlsOpen((current) => !current); }} className={`survey-focus-dock-button ${orientationControlsOpen ? "is-active" : ""}`}><Compass size={17} /><span>Tájolás</span></button>
            </>}
            <button type="button" data-focus-tool="section" onClick={() => { clearFocusDrawingModes(); startSectionDrawing(); }} className={`survey-focus-dock-button ${sectionDrawingMode || activeStep === "section" ? "is-active" : ""}`}><ScanLine size={17} /><span>Metszet</span></button>
            <button type="button" data-focus-tool="export" onClick={() => { clearFocusDrawingModes(); openFocusInspector("export"); }} className={`survey-focus-dock-button ${activeStep === "export" ? "is-active" : ""}`}><FileOutput size={17} /><span>Export</span></button>
          </div>

          <div className="survey-focus-statusbar survey-no-print" data-survey-focus-statusbar>
            <div className="survey-focus-statusbar-text"><span>{focusStatusMessage}</span><span>{progressPercent}% · {completedCount}/{steps.length}</span></div>
            <div className="survey-focus-progress-track"><div data-survey-focus-progress className={`survey-focus-progress-value ${exportState === "error" ? "is-error" : exportState === "working" ? "is-working" : ""}`} style={{ width: `${exportState === "working" ? Math.max(progressPercent, 18) : progressPercent}%` }} /></div>
          </div>

          <div className={`survey-focus-plan-panel survey-no-print ${focusPlanOpen ? "is-open" : ""}`} data-focus-plan-panel onPointerDown={(event) => event.stopPropagation()}>
            <div className="mb-3 flex items-center justify-between gap-3"><div><div className="text-[10px] font-black uppercase tracking-[0.13em] text-[var(--survey-accent)]">Lebegő beállítások</div><div className="text-base font-black">Szint, lapméret és lépték</div></div><button type="button" onClick={() => setFocusPlanOpen(false)} className="survey-icon-button"><X size={17} /></button></div>
            <PropertySurveyPlanToolbar levels={draft.levels} activeLevelId={draft.activeLevelId} planSheet={draft.planSheet} recommendedScale={recommendedScale} canDeleteLevel={draft.levels.length > 1} onLevelSelect={selectLevel} onAddLevel={addLevel} onRenameLevel={renameLevel} onDeleteLevel={deleteActiveLevel} onPlanSheetChange={updatePlanSheet} />
          </div>

          <aside data-focus-panel="left" className={`survey-focus-panel survey-focus-panel-left survey-no-print ${focusLeftOpen || focusLeftPinned ? "is-open" : ""}`} onPointerEnter={(event) => { if (event.pointerType === "mouse") setFocusLeftOpen(true); }} onPointerLeave={(event) => { if (event.pointerType === "mouse" && !focusLeftPinnedRef.current) setFocusLeftOpen(false); }} onPointerDown={(event) => event.stopPropagation()}>
            <button type="button" className="survey-focus-rail survey-focus-rail-left" onClick={() => setFocusLeftOpen((current) => !current)} aria-label="Felmérési lépések panel"><PanelLeftOpen size={18} /><span>Felmérési lépések</span></button>
            <div className="survey-focus-panel-content survey-focus-panel-content-left p-4">
              <div className="mb-4 flex items-center justify-between gap-3 border-b border-[var(--survey-border)] pb-3"><div><div className="text-[10px] font-black uppercase tracking-[0.14em] text-[var(--survey-accent)]">Navigáció</div><div className="text-lg font-black">Felmérési lépések</div></div><div className="flex gap-2"><button type="button" data-focus-pin-left onClick={() => { setFocusLeftPinned((current) => { const next = !current; focusLeftPinnedRef.current = next; return next; }); setFocusLeftOpen(true); }} className={`survey-focus-panel-pin ${focusLeftPinned ? "is-pinned" : ""}`} title="Panel rögzítése"><Pin size={16} /> <span className="hidden sm:inline">Rögzítés</span></button><button type="button" onClick={() => { focusLeftPinnedRef.current = false; setFocusLeftPinned(false); setFocusLeftOpen(false); }} className="survey-icon-button"><X size={16} /></button></div></div>
              {renderSurveyStepButtons(true)}
              {renderIncompleteStepFilter()}
              <div className="mt-4 rounded-2xl border border-[var(--survey-border)] bg-[var(--survey-panel-strong)] p-3"><div className="flex items-center justify-between text-xs font-black"><span>Teljesség</span><span>{completedCount}/{steps.length}</span></div><div className="mt-2 h-2 overflow-hidden rounded-full bg-slate-200"><div className="h-full rounded-full bg-gradient-to-r from-teal-500 to-cyan-400" style={{ width: `${progressPercent}%` }} /></div></div>
            </div>
          </aside>

          <aside data-focus-panel="right" className={`survey-focus-panel survey-focus-panel-right survey-no-print ${focusRightOpen || focusRightPinned ? "is-open" : ""}`} onPointerEnter={(event) => { if (event.pointerType === "mouse") setFocusRightOpen(true); }} onPointerLeave={(event) => { if (event.pointerType === "mouse" && !focusRightPinnedRef.current) setFocusRightOpen(false); }} onPointerDown={(event) => event.stopPropagation()}>
            <button type="button" className="survey-focus-rail survey-focus-rail-right" onClick={() => setFocusRightOpen((current) => !current)} aria-label="Aktív munkalap panel"><PanelRightOpen size={18} /><span>Aktív munkalap</span></button>
            <div className="survey-focus-panel-content survey-focus-panel-content-right p-4">
              <div className="mb-4 flex items-center justify-between gap-3 border-b border-[var(--survey-border)] pb-3"><div><div className="text-[10px] font-black uppercase tracking-[0.14em] text-[var(--survey-accent)]">Aktív munkalap</div><div className="text-lg font-black">{steps.find((step) => step.id === activeStep)?.label}</div></div><div className="flex gap-2"><button type="button" data-focus-pin-right onClick={() => { setFocusRightPinned((current) => { const next = !current; focusRightPinnedRef.current = next; return next; }); setFocusRightOpen(true); }} className={`survey-focus-panel-pin ${focusRightPinned ? "is-pinned" : ""}`} title="Panel rögzítése"><Pin size={16} /><span className="hidden sm:inline">Rögzítés</span></button><button type="button" onClick={() => { focusRightPinnedRef.current = false; setFocusRightPinned(false); setFocusRightOpen(false); }} className="survey-icon-button"><X size={16} /></button></div></div>
              <div className="mb-4 flex items-center justify-between"><StatusBadge complete={completion[activeStep]}>{completion[activeStep] ? "Rendben" : "Hiányos"}</StatusBadge><span className="text-[10px] font-black uppercase text-[var(--survey-muted)]">{activeLevel?.name}</span></div>
              {activeStep === "energy" ? renderEnergySummaryBoard() : renderInspector()}
              <div className="mt-5 grid grid-cols-2 gap-2 border-t border-[var(--survey-border)] pt-4"><button type="button" onClick={() => goStep(-1)} disabled={activeStep === steps[0].id} className="survey-action-secondary disabled:opacity-40"><ArrowLeft size={16} /> Előző</button><button type="button" onClick={() => goStep(1)} disabled={activeStep === steps[steps.length - 1].id} className="survey-action-primary disabled:opacity-40">Következő <ArrowRight size={16} /></button></div>
            </div>
          </aside>
        </div>
      ) : (
      <div className="mx-auto max-w-[1800px] px-4 py-5 lg:px-6">
        <section className="survey-no-print mb-5 grid gap-4 rounded-[1.75rem] border border-[var(--survey-border)] bg-[var(--survey-panel)] p-5 shadow-[0_16px_45px_rgba(15,23,42,0.07)] lg:grid-cols-[minmax(0,1fr)_auto] lg:items-center">
          <div><div className="flex flex-wrap items-center gap-2"><button type="button" onClick={openProjectCenter} className="inline-flex items-center gap-2 rounded-full border border-cyan-300 bg-cyan-50 px-3 py-1.5 text-[10px] font-black uppercase tracking-[0.12em] text-cyan-800"><FolderKanban size={14} /> {activeProject?.name || "Projekt"}</button><span className="inline-flex items-center gap-2 rounded-full border border-[var(--survey-border)] bg-[var(--survey-panel-strong)] px-3 py-1.5 text-[10px] font-black uppercase tracking-[0.10em] text-[var(--survey-muted)]"><ScanLine size={14} /> {activeSurvey?.startMode === "blank" ? "Üres alaprajz" : activeSurvey?.startMode === "sample" ? "Mintafelmérés" : activeSurvey?.startMode === "import" ? "PDF tervlap" : "LiDAR / import"}</span></div><h1 className="mt-3 text-2xl font-black tracking-[-0.035em] sm:text-3xl">{draft.surveyName}</h1><p className="mt-2 max-w-3xl text-sm font-semibold leading-6 text-[var(--survey-muted)]">{isIndustrialMode ? "Kalibrált csarnok- és épületfelmérési munkatér pillérhálóval, repedésrajzzal, raszterezett térbetonzónákkal, fotó- és hibapontokkal, valamint DXF kimenettel." : isPlanDocumentMode ? "PDF tervdokumentációból előkészíthető energetikai modell: kivágás, léptékkalibráció, zárolt háttér, kézi poligon és jóváhagyandó felismerési overlay." : "Többszintes, lap- és léptékhelyes terepi munkatér energetikai és műszaki felméréshez. A helyiségekhez rétegrendek, szerkeszthető hőhatár, mozgatható nyílászárók, gépészeti berendezések, hibák és számozott fotópontok kapcsolhatók."}</p><div className="mt-3 flex flex-wrap items-center gap-2"><div className="inline-flex items-center gap-2 rounded-xl border border-[var(--survey-border)] bg-[var(--survey-panel-strong)] p-1"><span className="px-2 text-[9px] font-black uppercase text-[var(--survey-muted)]">Munkamód</span><select aria-label="Felmérési munkamód" className="h-9 rounded-lg border border-[var(--survey-border)] bg-[var(--survey-panel)] px-3 text-xs font-black text-[var(--survey-text)]" value={draft.surveyMode} onChange={(event) => { updateDraft("surveyMode", event.target.value as PropertySurveyMode); setActiveStep("property"); setIndustrialTool("select"); }}><option>Energetikai felmérés</option><option>Épület- és csarnokfelmérés</option><option>Térbeton- és burkolatfelmérés</option><option>Felújítási felmérés</option><option>Műszaki állapotfelmérés</option><option>Gyors alaprajz</option></select></div>{energyWorkspaceEnabled ? <div className="inline-flex items-center gap-1 rounded-xl border border-cyan-300 bg-cyan-50 p-1 text-slate-950" data-energy-workspace-mode><span className="px-2 text-[9px] font-black uppercase text-cyan-800">Felület</span><button type="button" data-energy-mode="field" onClick={() => setEnergyWorkspaceMode("field")} className={`h-9 rounded-lg px-3 text-[10px] font-black ${draft.energyFieldWorkflow.mode === "field" ? "bg-cyan-700 text-white" : "bg-white text-slate-700"}`}>Terepi mód</button><button type="button" data-energy-mode="expert" onClick={() => setEnergyWorkspaceMode("expert")} className={`h-9 rounded-lg px-3 text-[10px] font-black ${draft.energyFieldWorkflow.mode === "expert" ? "bg-slate-900 text-white" : "bg-white text-slate-700"}`}>Szakértői mód</button></div> : null}</div></div>
          <div className="grid grid-cols-3 gap-3"><div className="rounded-2xl border border-[var(--survey-border)] bg-[var(--survey-panel-strong)] p-3 text-center"><div className="text-2xl font-black">{progressPercent}%</div><div className="text-[9px] font-black uppercase text-[var(--survey-muted)]">készültség</div></div><div className="rounded-2xl border border-[var(--survey-border)] bg-[var(--survey-panel-strong)] p-3 text-center"><div className="text-2xl font-black">{draft.rooms.length}</div><div className="text-[9px] font-black uppercase text-[var(--survey-muted)]">helyiség</div></div><div className="rounded-2xl border border-[var(--survey-border)] bg-[var(--survey-panel-strong)] p-3 text-center"><div className="text-2xl font-black">{isIndustrialMode ? industrialSummary.repairAreaSquareMeters.toFixed(0) : heatedArea.toFixed(0)}</div><div className="text-[9px] font-black uppercase text-[var(--survey-muted)]">{isIndustrialMode ? "javítandó m²" : "fűtött m²"}</div></div></div>
        </section>

        {energyWorkspaceEnabled && draft.energyFieldWorkflow.mode === "field" ? <section className="survey-no-print mb-5 rounded-2xl border border-cyan-300 bg-cyan-50 p-4 text-cyan-950" data-energy-field-guide>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex min-w-0 items-start gap-3"><span className={`grid h-11 w-11 shrink-0 place-items-center rounded-xl ${completion[activeStep] ? "bg-emerald-600 text-white" : "bg-cyan-700 text-white"}`}>{completion[activeStep] ? <Check size={20} /> : <ClipboardCheck size={20} />}</span><div><div className="text-[9px] font-black uppercase tracking-[0.12em] text-cyan-800">Terepi útmutató · {currentStepIndex + 1}/{steps.length}</div><div className="mt-1 text-base font-black">Most: {steps.find((step) => step.id === activeStep)?.label}</div><div className="mt-1 max-w-3xl text-xs font-semibold leading-5 text-cyan-900">{steps.find((step) => step.id === activeStep)?.description}. A kitöltési sorrend ajánlott, de bármelyik munkalap közvetlenül megnyitható.</div></div></div>
            <div className="flex flex-wrap items-center gap-2"><StatusBadge complete={completion[activeStep]}>{completion[activeStep] ? "Ez a lépés rendben" : "Még hiányos"}</StatusBadge>{nextIncompleteStep ? <button type="button" data-energy-next-incomplete-step onClick={() => activateSurveyStep(nextIncompleteStep.id)} className="survey-action-primary">Következő hiányos: {nextIncompleteStep.label} <ArrowRight size={16} /></button> : <span className="rounded-xl border border-emerald-300 bg-white px-3 py-2 text-xs font-black text-emerald-800">Minden lépés ellenőrizve</span>}</div>
          </div>
          <div className="mt-3 grid gap-2 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center"><div className="h-2 overflow-hidden rounded-full bg-white"><div className="h-full rounded-full bg-gradient-to-r from-teal-500 to-cyan-500 transition-all" style={{ width: `${progressPercent}%` }} /></div><label className="flex min-h-10 items-center justify-between gap-3 rounded-xl border border-cyan-300 bg-white px-3 py-2 text-[10px] font-black"><span>Csak hiányos lépések</span><input type="checkbox" checked={draft.energyFieldWorkflow.showOnlyIncomplete} onChange={(event) => updateEnergyFieldWorkflow({ showOnlyIncomplete: event.target.checked })} className="h-5 w-5 accent-cyan-600" /></label></div>
        </section> : null}

        <details className="survey-no-print mb-5 rounded-2xl border border-[var(--survey-border)] bg-[var(--survey-panel)]">
          <summary className="flex min-h-14 cursor-pointer list-none items-center justify-between gap-3 px-4 py-3 marker:hidden"><div><div className="text-sm font-black text-[var(--survey-text)]">Eszközkapcsolatok és offline működés</div><div className="mt-1 text-[10px] font-semibold text-[var(--survey-muted)]">LiDAR, Bluetooth-lézer és helyi mentés állapota. Csak szükség esetén nyisd meg.</div></div><StatusBadge complete>Offline aktív</StatusBadge></summary>
          <div className="grid gap-3 border-t border-[var(--survey-border)] p-4 md:grid-cols-3">
          <div className="rounded-2xl border border-[var(--survey-border)] bg-[var(--survey-panel)] p-4"><div className="flex items-start justify-between gap-3"><div className="flex gap-3"><span className="grid h-10 w-10 place-items-center rounded-xl bg-cyan-50 text-cyan-700"><ScanLine size={20} /></span><div><div className="text-sm font-black">LiDAR / RoomPlan</div><div className="mt-1 text-xs font-semibold text-[var(--survey-muted)]">Natív iPad bridge előkészítve</div></div></div><StatusBadge complete={false}>Bridge kell</StatusBadge></div></div>
          <div className="rounded-2xl border border-[var(--survey-border)] bg-[var(--survey-panel)] p-4"><div className="flex items-start justify-between gap-3"><div className="flex gap-3"><span className="grid h-10 w-10 place-items-center rounded-xl bg-blue-50 text-blue-700"><Bluetooth size={20} /></span><div><div className="text-sm font-black">Bluetooth-lézer</div><div className="mt-1 text-xs font-semibold text-[var(--survey-muted)]">Leica DISTO D2 közvetlen BLE-adapter</div></div></div><StatusBadge complete>Adapter kész</StatusBadge></div></div>
          <button type="button" onClick={() => setDeviceInfoOpen((current) => !current)} className="rounded-2xl border border-[var(--survey-border)] bg-[var(--survey-panel)] p-4 text-left"><div className="flex items-start justify-between gap-3"><div className="flex gap-3"><span className="grid h-10 w-10 place-items-center rounded-xl bg-amber-50 text-amber-700"><WifiOff size={20} /></span><div><div className="text-sm font-black">Offline terepi mód</div><div className="mt-1 text-xs font-semibold text-[var(--survey-muted)]">LocalStorage MVP mentés</div></div></div><StatusBadge complete>Aktív</StatusBadge></div></button>
          </div>
        </details>
        {deviceInfoOpen ? <div className="survey-no-print mb-5 rounded-2xl border border-amber-300 bg-amber-50 p-4 text-sm font-semibold leading-6 text-amber-950">A Leica DISTO D2 közvetlen Web Bluetooth adaptere elérhető Androidos Chrome alatt. A kapcsolatot a mérési panelen kell létrehozni. LiDAR-hoz továbbra is iOS RoomPlan natív bridge, más Bluetooth-lézerekhez külön gyártói vagy DIMPRO adapter szükséges.</div> : null}

        <div className={`grid gap-5 ${activeStep === "energy" ? "lg:grid-cols-[190px_minmax(0,1fr)] xl:grid-cols-[190px_minmax(0,1fr)_280px]" : "lg:grid-cols-[250px_minmax(0,1fr)] xl:grid-cols-[250px_minmax(0,1fr)_350px]"}`} data-survey-main-workspace-grid={activeStep === "energy" ? "energy" : "default"}>
          <aside className={`${mobileMenuOpen ? "block" : "hidden"} survey-no-print rounded-[1.5rem] border border-[var(--survey-border)] bg-[var(--survey-panel)] p-3 lg:block`}>
            <div className="mb-3 flex items-center justify-between px-2"><div className="text-xs font-black uppercase tracking-[0.14em] text-[var(--survey-muted)]">Felmérési lépések</div><button type="button" onClick={() => setMobileMenuOpen(false)} className="survey-icon-button lg:hidden"><X size={16} /></button></div>
            {renderSurveyStepButtons(false)}
            {renderIncompleteStepFilter()}
            <div className="mt-4 rounded-2xl border border-[var(--survey-border)] bg-[var(--survey-panel-strong)] p-3"><div className="flex items-center justify-between text-xs font-black"><span>Teljesség</span><span>{completedCount}/{steps.length}</span></div><div className="mt-2 h-2 overflow-hidden rounded-full bg-slate-200"><div className="h-full rounded-full bg-gradient-to-r from-teal-500 to-cyan-400 transition-all" style={{ width: `${progressPercent}%` }} /></div></div>
          </aside>

          <section className="min-w-0">
            {activeStep === "energy" ? renderNormalEnergyCentralWorkspace() : activeStep === "planDocument" ? renderPlanDocumentWorkspace() : renderNormalPlanSurface(true)}
          </section>

          <aside className="survey-no-print rounded-[1.5rem] border border-[var(--survey-border)] bg-[var(--survey-panel)] p-4 xl:sticky xl:top-24 xl:max-h-[calc(100vh-7rem)] xl:overflow-y-auto">
            <div className="mb-4 flex items-start justify-between gap-3 border-b border-[var(--survey-border)] pb-4"><div><div className="text-[10px] font-black uppercase tracking-[0.14em] text-[var(--survey-accent)]">Aktív munkalap</div><div className="mt-1 text-lg font-black">{steps.find((step) => step.id === activeStep)?.label}</div></div><StatusBadge complete={completion[activeStep]}>{completion[activeStep] ? "Rendben" : "Hiányos"}</StatusBadge></div>
            {activeStep === "energy" ? renderEnergySummaryBoard() : renderInspector()}
            <div className="mt-5 grid grid-cols-2 gap-2 border-t border-[var(--survey-border)] pt-4"><button type="button" onClick={() => goStep(-1)} disabled={activeStep === steps[0].id} className="survey-action-secondary disabled:opacity-40"><ArrowLeft size={16} /> Előző</button><button type="button" onClick={() => goStep(1)} disabled={activeStep === steps[steps.length - 1].id} className="survey-action-primary disabled:opacity-40">Következő <ArrowRight size={16} /></button></div>
          </aside>
        </div>
      </div>
      )}
    </main>
  );
}
