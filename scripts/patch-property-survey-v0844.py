from pathlib import Path

path = Path('components/property-survey/PropertySurveyPlanDocumentWorkspace.tsx')
source = path.read_text()

source = source.replace(
'''  type SurveyPlanPage,
  type SurveyPlanSuggestion,
} from "@/components/property-survey/propertySurveyPlanDocumentTypes";
''',
'''  type SurveyPlanPage,
  type SurveyPlanSuggestion,
  type SurveyPlanWallBoundaryType,
  type SurveyPlanWallSuggestion,
} from "@/components/property-survey/propertySurveyPlanDocumentTypes";
import {
  buildExternalWallSuggestions,
  recalculateSuggestionGeometry,
  recalculateWallGeometry,
  surveyPlanWallBoundaryTypeLabels,
  wallMidpoint,
} from "@/components/property-survey/propertySurveyPlanGeometry";
''', 1)

source = source.replace(
'''type CanvasTool = "select" | "crop" | "primaryCalibration" | "verificationCalibration" | "manualRoom";
type SuggestionFilter = "all" | "review" | "approved" | "ignored";
type SuggestionDragMode = "polygon" | "label";
''',
'''type CanvasTool = "select" | "crop" | "primaryCalibration" | "verificationCalibration" | "manualRoom" | "editRoomVertices" | "manualWall";
type SuggestionFilter = "all" | "review" | "approved" | "ignored";
type SuggestionDragMode = "polygon" | "label" | "vertex";
''', 1)

source = source.replace(
'''  startLabelPosition: SurveyNormalizedPoint | null;
  previewPolygon?: SurveyNormalizedPoint[];
''',
'''  startLabelPosition: SurveyNormalizedPoint | null;
  vertexIndex?: number;
  previewPolygon?: SurveyNormalizedPoint[];
''', 1)

source = source.replace(
'''type PlanViewSnapshot = {
  zoomPercent: number;
  scrollLeft: number;
  scrollTop: number;
};
''',
'''type PlanViewSnapshot = {
  zoomPercent: number;
  scrollLeft: number;
  scrollTop: number;
};

type WallDragState = {
  pointerId: number;
  wallId: string;
  endpoint: "start" | "end";
  startWall: SurveyPlanWallSuggestion;
  previewWall?: SurveyPlanWallSuggestion;
  moved: boolean;
};
''', 1)

source = source.replace(
'''  const [manualPoints, setManualPoints] = useState<SurveyNormalizedPoint[]>([]);
  const [activeSuggestionId, setActiveSuggestionId] = useState<string | null>(null);
''',
'''  const [manualPoints, setManualPoints] = useState<SurveyNormalizedPoint[]>([]);
  const [manualWallPoints, setManualWallPoints] = useState<SurveyNormalizedPoint[]>([]);
  const [activeSuggestionId, setActiveSuggestionId] = useState<string | null>(null);
  const [selectedVertexIndex, setSelectedVertexIndex] = useState<number | null>(null);
  const [activeWallId, setActiveWallId] = useState<string | null>(null);
''', 1)

source = source.replace(
'''  const [showAllSuggestionLabels, setShowAllSuggestionLabels] = useState(false);
  const [suggestionFilter, setSuggestionFilter] = useState<SuggestionFilter>("all");
''',
'''  const [showAllSuggestionLabels, setShowAllSuggestionLabels] = useState(false);
  const [showWallSuggestions, setShowWallSuggestions] = useState(true);
  const [suggestionFilter, setSuggestionFilter] = useState<SuggestionFilter>("all");
''', 1)

source = source.replace(
'''  const suggestionDragRef = useRef<SuggestionDragState | null>(null);
  const updateSuggestionDragHandlerRef = useRef<(pointerId: number, clientX: number, clientY: number) => void>(() => {});
''',
'''  const suggestionDragRef = useRef<SuggestionDragState | null>(null);
  const wallDragRef = useRef<WallDragState | null>(null);
  const updateSuggestionDragHandlerRef = useRef<(pointerId: number, clientX: number, clientY: number) => void>(() => {});
''', 1)

source = source.replace(
'''  const activeSuggestion = activePage?.suggestions.find((suggestion) => suggestion.id === activeSuggestionId) || null;
''',
'''  const activeSuggestion = activePage?.suggestions.find((suggestion) => suggestion.id === activeSuggestionId) || null;
  const activeWall = activePage?.wallSuggestions.find((wall) => wall.id === activeWallId) || null;
''', 1)

source = source.replace(
'''    setActiveSuggestionId(null);
    setPendingFocusSuggestionId(null);
''',
'''    setActiveSuggestionId(null);
    setSelectedVertexIndex(null);
    setActiveWallId(null);
    setManualWallPoints([]);
    setPendingFocusSuggestionId(null);
''', 1)

source = source.replace(
'''    setSuggestionDragPreview(null);
    suggestionDragRef.current = null;
''',
'''    setSuggestionDragPreview(null);
    suggestionDragRef.current = null;
    wallDragRef.current = null;
''', 1)

source = source.replace(
'''  function patchSuggestion(suggestionId: string, patch: Partial<SurveyPlanSuggestion>) {
    if (!activePage) return;
    patchPage({
      suggestions: activePage.suggestions.map((suggestion) => suggestion.id === suggestionId ? {
        ...suggestion,
        ...patch,
        userModified: patch.userModified ?? true,
        updatedAt: new Date().toISOString(),
      } : suggestion),
    });
  }
''',
'''  function patchSuggestion(suggestionId: string, patch: Partial<SurveyPlanSuggestion>) {
    if (!activePage) return;
    patchPage({
      suggestions: activePage.suggestions.map((suggestion) => suggestion.id === suggestionId ? {
        ...suggestion,
        ...patch,
        userModified: patch.userModified ?? true,
        updatedAt: new Date().toISOString(),
      } : suggestion),
    });
  }

  function patchWallSuggestion(wallId: string, patch: Partial<SurveyPlanWallSuggestion>) {
    if (!activePage) return;
    patchPage({
      wallSuggestions: activePage.wallSuggestions.map((wall) => wall.id === wallId ? {
        ...wall,
        ...patch,
        userModified: patch.userModified ?? true,
        updatedAt: new Date().toISOString(),
      } : wall),
    });
  }
''', 1)

source = source.replace(
'''  function selectSuggestion(suggestion: SurveyPlanSuggestion) {
    setActiveSuggestionId(suggestion.id);
  }
''',
'''  function selectSuggestion(suggestion: SurveyPlanSuggestion) {
    setActiveSuggestionId(suggestion.id);
    setActiveWallId(null);
    setSelectedVertexIndex(null);
  }

  function selectWall(wall: SurveyPlanWallSuggestion) {
    setActiveWallId(wall.id);
    setActiveSuggestionId(null);
    setSelectedVertexIndex(null);
  }
''', 1)

source = source.replace(
'''  function beginSuggestionDrag(event: React.PointerEvent<SVGElement>, suggestion: SurveyPlanSuggestion, mode: SuggestionDragMode) {
''',
'''  function beginSuggestionDrag(event: React.PointerEvent<SVGElement>, suggestion: SurveyPlanSuggestion, mode: SuggestionDragMode, vertexIndex?: number) {
''', 1)

source = source.replace(
'''      startLabelPosition: suggestion.labelPosition ? { ...suggestion.labelPosition } : null,
      moved: false,
''',
'''      startLabelPosition: suggestion.labelPosition ? { ...suggestion.labelPosition } : null,
      vertexIndex,
      moved: false,
''', 1)

source = source.replace(
'''    if (drag.mode === "label") {
''',
'''    if (drag.mode === "label") {
''', 1)

vertex_anchor = '''      return;
    }
    const bounds = polygonBounds(drag.startPolygon);
'''
vertex_replacement = '''      return;
    }
    if (drag.mode === "vertex" && drag.vertexIndex != null) {
      const polygon = drag.startPolygon.map((polygonPoint, index) => index === drag.vertexIndex ? {
        x: clamp(point.x, activePage.crop.x, activePage.crop.x + activePage.crop.width),
        y: clamp(point.y, activePage.crop.y, activePage.crop.y + activePage.crop.height),
      } : polygonPoint);
      drag.previewPolygon = polygon;
      setSuggestionDragPreview({ suggestionId: drag.suggestionId, polygon, labelPosition: drag.startLabelPosition });
      return;
    }
    const bounds = polygonBounds(drag.startPolygon);
'''
if vertex_anchor not in source:
    raise SystemExit('vertex insertion anchor missing')
source = source.replace(vertex_anchor, vertex_replacement, 1)

source = source.replace(
'''      } else if (drag.mode === "polygon" && drag.previewPolygon) {
        commitSuggestionDragPatch(drag.suggestionId, {
          polygon: drag.previewPolygon,
          labelPosition: drag.previewLabelPosition ?? null,
          source: "userCorrected",
        });
      }
''',
'''      } else if ((drag.mode === "polygon" || drag.mode === "vertex") && drag.previewPolygon) {
        const currentPage = latestActivePageRef.current;
        const currentSuggestion = currentPage?.suggestions.find((suggestion) => suggestion.id === drag.suggestionId);
        if (currentPage && currentSuggestion) {
          commitSuggestionDragPatch(drag.suggestionId, {
            ...recalculateSuggestionGeometry(currentSuggestion, drag.previewPolygon, currentPage, viewportSize.width, viewportSize.height),
            labelPosition: drag.mode === "polygon" ? drag.previewLabelPosition ?? null : currentSuggestion.labelPosition,
          });
        }
      }
''', 1)

# Insert geometry editing and wall logic before handler click.
anchor = '''  function handleSuggestionClick(event: React.MouseEvent<SVGGElement>, suggestion: SurveyPlanSuggestion) {
'''
logic = '''  function insertSuggestionVertex(suggestion: SurveyPlanSuggestion, edgeIndex: number) {
    if (!activePage || suggestion.polygon.length < 2) return;
    const start = suggestion.polygon[edgeIndex];
    const end = suggestion.polygon[(edgeIndex + 1) % suggestion.polygon.length];
    const midpoint = { x: (start.x + end.x) / 2, y: (start.y + end.y) / 2 };
    const polygon = [...suggestion.polygon.slice(0, edgeIndex + 1), midpoint, ...suggestion.polygon.slice(edgeIndex + 1)];
    patchSuggestion(suggestion.id, recalculateSuggestionGeometry(suggestion, polygon, activePage, viewportSize.width, viewportSize.height));
    setSelectedVertexIndex(edgeIndex + 1);
  }

  function deleteSelectedVertex() {
    if (!activePage || !activeSuggestion || selectedVertexIndex == null || activeSuggestion.polygon.length <= 3) return;
    const polygon = activeSuggestion.polygon.filter((_, index) => index !== selectedVertexIndex);
    patchSuggestion(activeSuggestion.id, recalculateSuggestionGeometry(activeSuggestion, polygon, activePage, viewportSize.width, viewportSize.height));
    setSelectedVertexIndex(Math.min(selectedVertexIndex, polygon.length - 1));
  }

  function beginWallEndpointDrag(event: React.PointerEvent<SVGElement>, wall: SurveyPlanWallSuggestion, endpoint: "start" | "end") {
    if (tool !== "select" || !stageRef.current || wall.status === "ignored") return;
    event.preventDefault();
    event.stopPropagation();
    selectWall(wall);
    wallDragRef.current = { pointerId: event.pointerId, wallId: wall.id, endpoint, startWall: { ...wall }, moved: false };
    try { event.currentTarget.setPointerCapture(event.pointerId); } catch { /* opcionális */ }
  }

  function updateWallDrag(pointerId: number, clientX: number, clientY: number) {
    const drag = wallDragRef.current;
    const currentPage = latestActivePageRef.current;
    if (!drag || drag.pointerId !== pointerId || !currentPage || !stageRef.current) return;
    const rawPoint = normalizeClientPoint(clientX, clientY, stageRef.current);
    const point = invertPageTransform(rawPoint, currentPage);
    const clampedPoint = {
      x: clamp(point.x, currentPage.crop.x, currentPage.crop.x + currentPage.crop.width),
      y: clamp(point.y, currentPage.crop.y, currentPage.crop.y + currentPage.crop.height),
    };
    const connectedRoom = currentPage.suggestions.find((suggestion) => drag.startWall.connectedRoomSuggestionIds.includes(suggestion.id)) || null;
    drag.previewWall = recalculateWallGeometry(drag.startWall, {
      [drag.endpoint]: clampedPoint,
      page: currentPage,
      viewportWidth: viewportSize.width,
      viewportHeight: viewportSize.height,
      connectedRoom,
    });
    drag.moved = true;
    patchWallSuggestion(drag.wallId, drag.previewWall);
  }

  function finishWallDrag(pointerId: number) {
    const drag = wallDragRef.current;
    if (!drag || drag.pointerId !== pointerId) return;
    wallDragRef.current = null;
  }

  function recognizeExternalWalls() {
    if (!activePage) return;
    const approvedRooms = activePage.suggestions.filter((suggestion) => suggestion.status === "approved" && suggestion.polygon.length >= 3);
    const sourceRooms = approvedRooms.length ? approvedRooms : activePage.suggestions.filter((suggestion) => suggestion.status !== "ignored" && suggestion.polygon.length >= 3);
    if (!sourceRooms.length) {
      patchPage({ wallRecognitionStatus: "error", wallRecognitionMessage: "Nincs használható helyiségpoligon. Előbb ismerd fel vagy rajzold meg a helyiségeket." });
      return;
    }
    patchPage({ wallRecognitionStatus: "analyzing", wallRecognitionMessage: "A helyiségpoligonok külső peremszakaszainak elemzése folyamatban..." });
    const generated = buildExternalWallSuggestions({
      page: activePage,
      roomSuggestions: sourceRooms,
      viewportWidth: viewportSize.width,
      viewportHeight: viewportSize.height,
      idFactory: createId,
    });
    const preserved = activePage.wallSuggestions.filter((wall) => wall.source === "manualDrawing" || wall.status === "approved");
    patchPage({
      wallRecognitionStatus: "ready",
      wallRecognitionMessage: `${generated.length} külső határoló falszakasz-javaslat készült ${sourceRooms.length} helyiségpoligonból. A besorolás és a végpontok jóváhagyás előtt ellenőrzendők.`,
      wallSuggestions: [...preserved, ...generated],
    });
    setShowWallSuggestions(true);
    setActiveWallId(generated[0]?.id || preserved[0]?.id || null);
  }

  function finishManualWall() {
    if (!activePage || manualWallPoints.length < 2) return;
    const now = new Date().toISOString();
    const base: SurveyPlanWallSuggestion = {
      id: createId("manual-wall"),
      pageId: activePage.id,
      levelId: activePage.levelId,
      start: manualWallPoints[0],
      end: manualWallPoints[1],
      boundaryType: "unknown",
      orientationDegrees: 0,
      orientationLabel: "–",
      lengthMeters: 0,
      heightMeters: 2.7,
      thicknessMeters: 0.3,
      connectedRoomSuggestionIds: [],
      confidence: "manual",
      confidenceScore: 1,
      source: "manualDrawing",
      sourceDetails: "A felhasználó kézzel rajzolta a külső határoló falszakaszt a PDF fölé.",
      status: "review",
      userModified: true,
      createdAt: now,
      updatedAt: now,
    };
    const wall = recalculateWallGeometry(base, { page: activePage, viewportWidth: viewportSize.width, viewportHeight: viewportSize.height, connectedRoom: null });
    patchPage({ wallSuggestions: [...activePage.wallSuggestions, wall], wallRecognitionStatus: "ready", wallRecognitionMessage: "Kézi falszakasz hozzáadva; a határolási típus ellenőrzendő." });
    setActiveWallId(wall.id);
    setManualWallPoints([]);
    setTool("select");
    setShowWallSuggestions(true);
  }

  function deleteWallSuggestion(wallId: string) {
    if (!activePage) return;
    patchPage({ wallSuggestions: activePage.wallSuggestions.filter((wall) => wall.id !== wallId) });
    setActiveWallId(null);
  }

'''
if anchor not in source:
    raise SystemExit('logic insertion anchor missing')
source = source.replace(anchor, logic + anchor, 1)

# Extend global pointer listeners with wall drag handling.
source = source.replace(
'''    const handlePointerMove = (event: PointerEvent) => {
      const drag = suggestionDragRef.current;
      if (!drag || drag.pointerId !== event.pointerId) return;
      event.preventDefault();
      updateSuggestionDragHandlerRef.current(event.pointerId, event.clientX, event.clientY);
    };
''',
'''    const handlePointerMove = (event: PointerEvent) => {
      const wallDrag = wallDragRef.current;
      if (wallDrag && wallDrag.pointerId === event.pointerId) {
        event.preventDefault();
        updateWallDrag(event.pointerId, event.clientX, event.clientY);
        return;
      }
      const drag = suggestionDragRef.current;
      if (!drag || drag.pointerId !== event.pointerId) return;
      event.preventDefault();
      updateSuggestionDragHandlerRef.current(event.pointerId, event.clientX, event.clientY);
    };
''', 1)

source = source.replace(
'''    const handlePointerEnd = (event: PointerEvent) => {
      const drag = suggestionDragRef.current;
      if (!drag || drag.pointerId !== event.pointerId) return;
      event.preventDefault();
      finishSuggestionDragHandlerRef.current(event.pointerId);
    };
''',
'''    const handlePointerEnd = (event: PointerEvent) => {
      const wallDrag = wallDragRef.current;
      if (wallDrag && wallDrag.pointerId === event.pointerId) {
        event.preventDefault();
        finishWallDrag(event.pointerId);
        return;
      }
      const drag = suggestionDragRef.current;
      if (!drag || drag.pointerId !== event.pointerId) return;
      event.preventDefault();
      finishSuggestionDragHandlerRef.current(event.pointerId);
    };
''', 1)

source = source.replace(
'''    const handleMouseUp = () => {
      const drag = suggestionDragRef.current;
      if (!drag) return;
      finishSuggestionDragHandlerRef.current(drag.pointerId);
    };
''',
'''    const handleMouseUp = () => {
      const wallDrag = wallDragRef.current;
      if (wallDrag) finishWallDrag(wallDrag.pointerId);
      const drag = suggestionDragRef.current;
      if (drag) finishSuggestionDragHandlerRef.current(drag.pointerId);
    };
''', 1)

source = source.replace(
'''    const handleWindowBlur = () => {
      const drag = suggestionDragRef.current;
      if (!drag) return;
      finishSuggestionDragHandlerRef.current(drag.pointerId);
    };
''',
'''    const handleWindowBlur = () => {
      const wallDrag = wallDragRef.current;
      if (wallDrag) finishWallDrag(wallDrag.pointerId);
      const drag = suggestionDragRef.current;
      if (drag) finishSuggestionDragHandlerRef.current(drag.pointerId);
    };
''', 1)

# Manual room key effect becomes room/wall/vertex effect.
source = source.replace(
'''  useEffect(() => {
    if (tool !== "manualRoom") return;
    const handleKeyDown = (event: KeyboardEvent) => {
''',
'''  useEffect(() => {
    if (tool !== "manualRoom" && tool !== "manualWall" && tool !== "editRoomVertices") return;
    const handleKeyDown = (event: KeyboardEvent) => {
''', 1)

source = source.replace(
'''      if (event.key === "Escape") {
        event.preventDefault();
        setManualPoints([]);
        setTool("select");
      } else if ((event.key === "Backspace" || event.key === "Delete") && manualPoints.length) {
        event.preventDefault();
        setManualPoints((current) => current.slice(0, -1));
      } else if (event.key === "Enter" && manualPoints.length >= 3) {
        event.preventDefault();
        finishManualRoom();
      }
''',
'''      if (event.key === "Escape") {
        event.preventDefault();
        setManualPoints([]);
        setManualWallPoints([]);
        setSelectedVertexIndex(null);
        setTool("select");
      } else if (tool === "editRoomVertices" && (event.key === "Backspace" || event.key === "Delete") && selectedVertexIndex != null) {
        event.preventDefault();
        deleteSelectedVertex();
      } else if (tool === "manualRoom" && (event.key === "Backspace" || event.key === "Delete") && manualPoints.length) {
        event.preventDefault();
        setManualPoints((current) => current.slice(0, -1));
      } else if (tool === "manualRoom" && event.key === "Enter" && manualPoints.length >= 3) {
        event.preventDefault();
        finishManualRoom();
      } else if (tool === "manualWall" && (event.key === "Backspace" || event.key === "Delete") && manualWallPoints.length) {
        event.preventDefault();
        setManualWallPoints((current) => current.slice(0, -1));
      }
''', 1)
source = source.replace('''  }, [manualPoints, tool]);
''','''  }, [manualPoints, manualWallPoints, selectedVertexIndex, tool]);
''',1)

# Canvas pointer manual wall.
source = source.replace(
'''    if (tool === "manualRoom") {
      event.preventDefault();
      event.stopPropagation();
      setManualPoints((current) => [...current, point]);
      return;
    }
''',
'''    if (tool === "manualRoom") {
      event.preventDefault();
      event.stopPropagation();
      setManualPoints((current) => [...current, point]);
      return;
    }
    if (tool === "manualWall") {
      event.preventDefault();
      event.stopPropagation();
      if (!manualWallPoints.length) setManualWallPoints([point]);
      else {
        setManualWallPoints([manualWallPoints[0], point]);
        window.setTimeout(finishManualWall, 0);
      }
      return;
    }
''', 1)

# Keep walls when re-recognizing rooms but invalidate auto walls.
source = source.replace(
'''        suggestions: [...activePage.suggestions.filter((suggestion) => suggestion.source === "manualDrawing" || suggestion.status === "approved"), ...suggestions],
        recognitionStatus: "ready",
''',
'''        suggestions: [...activePage.suggestions.filter((suggestion) => suggestion.source === "manualDrawing" || suggestion.status === "approved"), ...suggestions],
        wallSuggestions: activePage.wallSuggestions.filter((wall) => wall.source === "manualDrawing" || wall.status === "approved"),
        wallRecognitionStatus: "idle",
        wallRecognitionMessage: "A helyiséggeometria megváltozott. A külső határolást újra kell felismerni.",
        recognitionStatus: "ready",
''', 1)

# Toolbar buttons.
source = source.replace(
'''          <button type="button" disabled={!activePage} onClick={() => { setTool("manualRoom"); setManualPoints([]); }} className={tool === "manualRoom" ? "survey-tool-button survey-tool-button-active" : "survey-tool-button"}><PencilRuler size={16} /><span>Kézi helyiség</span></button>
''',
'''          <button type="button" disabled={!activePage} onClick={() => { setTool("manualRoom"); setManualPoints([]); setManualWallPoints([]); }} className={tool === "manualRoom" ? "survey-tool-button survey-tool-button-active" : "survey-tool-button"}><PencilRuler size={16} /><span>Kézi helyiség</span></button>
          <button type="button" disabled={!activeSuggestion} onClick={() => { setTool("editRoomVertices"); setSelectedVertexIndex(null); }} className={tool === "editRoomVertices" ? "survey-tool-button survey-tool-button-active" : "survey-tool-button"}><MousePointer2 size={16} /><span>Poligonpontok</span></button>
          <button type="button" disabled={!activePage} onClick={() => { setTool("manualWall"); setManualWallPoints([]); setManualPoints([]); }} className={tool === "manualWall" ? "survey-tool-button survey-tool-button-active" : "survey-tool-button"}><Ruler size={16} /><span>Kézi fal</span></button>
''', 1)

source = source.replace(
'''          {tool === "manualRoom" && manualPoints.length ? <button type="button" onClick={() => setManualPoints((current) => current.slice(0, -1))} className="survey-tool-button"><X size={16} /><span>Utolsó pont</span></button> : null}
''',
'''          {tool === "manualRoom" && manualPoints.length ? <button type="button" onClick={() => setManualPoints((current) => current.slice(0, -1))} className="survey-tool-button"><X size={16} /><span>Utolsó pont</span></button> : null}
          {tool === "editRoomVertices" && selectedVertexIndex != null && activeSuggestion && activeSuggestion.polygon.length > 3 ? <button type="button" data-plan-delete-vertex onClick={deleteSelectedVertex} className="survey-tool-button"><Trash2 size={16} /><span>Pont törlése</span></button> : null}
''', 1)

source = source.replace(
'''          <button type="button" disabled={!activePage} data-plan-label-toggle onClick={() => setShowAllSuggestionLabels((current) => !current)} className={showAllSuggestionLabels ? "survey-tool-button survey-tool-button-active" : "survey-tool-button"} title="Alapállapotban csak a kijelölt helyiség felirata látszik">{showAllSuggestionLabels ? <EyeOff size={16} /> : <Eye size={16} />}<span>{showAllSuggestionLabels ? "Feliratok elrejtése" : "Minden felirat"}</span></button>
''',
'''          <button type="button" disabled={!activePage} data-plan-label-toggle onClick={() => setShowAllSuggestionLabels((current) => !current)} className={showAllSuggestionLabels ? "survey-tool-button survey-tool-button-active" : "survey-tool-button"} title="Alapállapotban csak a kijelölt helyiség felirata látszik">{showAllSuggestionLabels ? <EyeOff size={16} /> : <Eye size={16} />}<span>{showAllSuggestionLabels ? "Feliratok elrejtése" : "Minden felirat"}</span></button>
          <button type="button" disabled={!activePage?.wallSuggestions.length} data-plan-wall-toggle onClick={() => setShowWallSuggestions((current) => !current)} className={showWallSuggestions ? "survey-tool-button survey-tool-button-active" : "survey-tool-button"}><Eye size={16} /><span>{showWallSuggestions ? "Falak látszanak" : "Falak elrejtve"}</span></button>
''', 1)

# Cursor state.
source = source.replace(
'''            className={`relative mx-auto shrink-0 overflow-hidden bg-white shadow-2xl ${tool === "manualRoom" || tool === "crop" || tool.includes("Calibration") ? "cursor-crosshair" : activePage?.locked ? "cursor-default" : "cursor-move"}`}
''',
'''            className={`relative mx-auto shrink-0 overflow-hidden bg-white shadow-2xl ${tool === "manualRoom" || tool === "manualWall" || tool === "crop" || tool.includes("Calibration") ? "cursor-crosshair" : activePage?.locked ? "cursor-default" : "cursor-move"}`}
''', 1)

# Vertex handles after selected move handle.
handle_anchor = '''                      {selected && tool === "select" ? <g
                        data-plan-suggestion-move-handle={suggestion.id}
'''
# We insert after closing handle block using exact tail.
handle_tail = '''                      ><circle r="18" fill="#ffffff" fillOpacity="0.98" stroke={visual.stroke} strokeWidth="4" vectorEffect="non-scaling-stroke" /><path d="M-9 0H9M0-9V9M-9 0l4-4M-9 0l4 4M9 0l-4-4M9 0l-4 4M0-9l-4 4M0-9l4 4M0 9l-4-4M0 9l4-4" fill="none" stroke={visual.stroke} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" vectorEffect="non-scaling-stroke" /></g> : null}
'''
vertex_jsx = handle_tail + '''                      {selected && tool === "editRoomVertices" ? <g data-plan-vertex-editor={suggestion.id}>
                        {renderedSuggestion.polygon.map((point, vertexIndex) => <g key={`vertex-${suggestion.id}-${vertexIndex}`} data-plan-room-vertex={`${suggestion.id}:${vertexIndex}`} transform={`translate(${point.x * 1000} ${point.y * 1000})`} style={{ pointerEvents: "auto", cursor: "move" }} onPointerDown={(event) => { setSelectedVertexIndex(vertexIndex); beginSuggestionDrag(event, suggestion, "vertex", vertexIndex); }}><circle r={selectedVertexIndex === vertexIndex ? 13 : 10} fill="#ffffff" stroke={selectedVertexIndex === vertexIndex ? "#dc2626" : "#0e7490"} strokeWidth="4" vectorEffect="non-scaling-stroke" /><text x="0" y="4" textAnchor="middle" fill="#0f172a" fontSize="10" fontWeight="900">{vertexIndex + 1}</text></g>)}
                        {renderedSuggestion.polygon.map((point, edgeIndex) => { const next = renderedSuggestion.polygon[(edgeIndex + 1) % renderedSuggestion.polygon.length]; const midpoint = { x: (point.x + next.x) / 2, y: (point.y + next.y) / 2 }; return <g key={`mid-${suggestion.id}-${edgeIndex}`} data-plan-room-edge-midpoint={`${suggestion.id}:${edgeIndex}`} transform={`translate(${midpoint.x * 1000} ${midpoint.y * 1000})`} style={{ pointerEvents: "auto", cursor: "copy" }} onClick={(event) => { event.stopPropagation(); insertSuggestionVertex(suggestion, edgeIndex); }}><circle r="8" fill="#cffafe" stroke="#0891b2" strokeWidth="3" vectorEffect="non-scaling-stroke" /><path d="M-4 0H4M0-4V4" stroke="#155e75" strokeWidth="2" vectorEffect="non-scaling-stroke" /></g>; })}
                      </g> : null}
'''
if handle_tail not in source:
    raise SystemExit('move handle tail missing')
source = source.replace(handle_tail, vertex_jsx, 1)

# Wall overlay before calibration.
wall_overlay_anchor = '''                  {activePage.calibration.primary.pointA && activePage.calibration.primary.pointB ? <g>'''
wall_overlay = '''                  {showWallSuggestions ? activePage.wallSuggestions.map((wall) => {
                    const selected = activeWallId === wall.id;
                    const midpoint = wallMidpoint(wall);
                    const wallStroke = wall.status === "approved" ? "#16a34a" : wall.status === "ignored" ? "#64748b" : wall.userModified ? "#2563eb" : "#f97316";
                    return <g key={wall.id} data-plan-wall-suggestion={wall.id} opacity={wall.status === "ignored" ? 0.3 : 1} style={{ pointerEvents: "auto", cursor: "pointer" }} onClick={(event) => { event.stopPropagation(); selectWall(wall); }}>
                      <line x1={wall.start.x * 1000} y1={wall.start.y * 1000} x2={wall.end.x * 1000} y2={wall.end.y * 1000} stroke="#ffffff" strokeWidth={selected ? 13 : 9} vectorEffect="non-scaling-stroke" />
                      <line x1={wall.start.x * 1000} y1={wall.start.y * 1000} x2={wall.end.x * 1000} y2={wall.end.y * 1000} stroke={wallStroke} strokeWidth={selected ? 8 : 5} strokeDasharray={wall.status === "review" ? "12 6" : undefined} vectorEffect="non-scaling-stroke" />
                      {selected ? <><circle data-plan-wall-endpoint={`${wall.id}:start`} cx={wall.start.x * 1000} cy={wall.start.y * 1000} r="12" fill="#fff" stroke={wallStroke} strokeWidth="4" vectorEffect="non-scaling-stroke" style={{ cursor: "move" }} onPointerDown={(event) => beginWallEndpointDrag(event, wall, "start")} /><circle data-plan-wall-endpoint={`${wall.id}:end`} cx={wall.end.x * 1000} cy={wall.end.y * 1000} r="12" fill="#fff" stroke={wallStroke} strokeWidth="4" vectorEffect="non-scaling-stroke" style={{ cursor: "move" }} onPointerDown={(event) => beginWallEndpointDrag(event, wall, "end")} /><g transform={`translate(${midpoint.x * 1000} ${midpoint.y * 1000 - 18})`} style={{ pointerEvents: "none" }}><rect x="-42" y="-13" width="84" height="26" rx="8" fill="#fff" fillOpacity="0.94" stroke={wallStroke} strokeWidth="2" vectorEffect="non-scaling-stroke" /><text x="0" y="4" textAnchor="middle" fill="#0f172a" fontSize="12" fontWeight="900">{wall.orientationLabel} · {wall.lengthMeters > 0 ? `${wall.lengthMeters.toFixed(2)} m` : "–"}</text></g></> : null}
                    </g>;
                  }) : null}
                  {activePage.calibration.primary.pointA && activePage.calibration.primary.pointB ? <g>'''
if wall_overlay_anchor not in source:
    raise SystemExit('wall overlay anchor missing')
source = source.replace(wall_overlay_anchor, wall_overlay, 1)

# Manual wall draft and instructions.
source = source.replace(
'''                {manualPoints.length ? <g><polyline points={manualPoints.map((point) => `${point.x * 1000},${point.y * 1000}`).join(" ")}''',
'''                {manualWallPoints.length ? <g><line x1={manualWallPoints[0].x * 1000} y1={manualWallPoints[0].y * 1000} x2={(manualWallPoints[1] || manualWallPoints[0]).x * 1000} y2={(manualWallPoints[1] || manualWallPoints[0]).y * 1000} stroke="#f97316" strokeWidth="6" strokeDasharray="12 6" vectorEffect="non-scaling-stroke" /><circle cx={manualWallPoints[0].x * 1000} cy={manualWallPoints[0].y * 1000} r="10" fill="#fff" stroke="#f97316" strokeWidth="4" vectorEffect="non-scaling-stroke" /></g> : null}
                {manualPoints.length ? <g><polyline points={manualPoints.map((point) => `${point.x * 1000},${point.y * 1000}`).join(" ")}''', 1)

source = source.replace(
'''            {tool === "manualRoom" ? <div className="pointer-events-none absolute left-1/2 top-14 max-w-[88%] -translate-x-1/2 rounded-xl border-2 border-cyan-500 bg-white/95 px-4 py-3 text-center text-xs font-black text-cyan-950 shadow-xl" data-plan-manual-room-instruction>Hiányzó helyiség kézi rajza: kattints körbe a helyiség sarkain. Enter vagy „Poligon lezárása” ment; Backspace visszavon; Esc kilép.</div> : null}
''',
'''            {tool === "manualRoom" ? <div className="pointer-events-none absolute left-1/2 top-14 max-w-[88%] -translate-x-1/2 rounded-xl border-2 border-cyan-500 bg-white/95 px-4 py-3 text-center text-xs font-black text-cyan-950 shadow-xl" data-plan-manual-room-instruction>Hiányzó helyiség kézi rajza: kattints körbe a helyiség sarkain. Enter vagy „Poligon lezárása” ment; Backspace visszavon; Esc kilép.</div> : null}
            {tool === "editRoomVertices" ? <div className="pointer-events-none absolute left-1/2 top-14 max-w-[88%] -translate-x-1/2 rounded-xl border-2 border-blue-500 bg-white/95 px-4 py-3 text-center text-xs font-black text-blue-950 shadow-xl" data-plan-vertex-instruction>A számozott pontok húzhatók. A kis „+” kör új töréspontot szúr be. A kijelölt pont a felső gombbal vagy Delete billentyűvel törölhető.</div> : null}
            {tool === "manualWall" ? <div className="pointer-events-none absolute left-1/2 top-14 max-w-[88%] -translate-x-1/2 rounded-xl border-2 border-orange-500 bg-white/95 px-4 py-3 text-center text-xs font-black text-orange-950 shadow-xl" data-plan-manual-wall-instruction>Kézi falszakasz: kattints a kezdőpontra, majd a végpontra. Escape megszakítja.</div> : null}
''', 1)

source = source.replace(
'''            {activeSuggestion ? <div className="pointer-events-none absolute bottom-3 left-3 max-w-[75%] rounded-xl border-2 border-cyan-500 bg-white/95 px-3 py-2 text-xs font-black text-slate-950 shadow-lg" data-plan-active-suggestion-badge>Kijelölt helyiség: {activeSuggestion.name} · {formatSquareMeters(activeSuggestion.labeledAreaSquareMeters || activeSuggestion.calculatedAreaSquareMeters)}</div> : null}
''',
'''            {activeSuggestion ? <div className="pointer-events-none absolute bottom-3 left-3 max-w-[75%] rounded-xl border-2 border-cyan-500 bg-white/95 px-3 py-2 text-xs font-black text-slate-950 shadow-lg" data-plan-active-suggestion-badge>Kijelölt helyiség: {activeSuggestion.name} · {formatSquareMeters(activeSuggestion.labeledAreaSquareMeters || activeSuggestion.calculatedAreaSquareMeters)}</div> : null}
            {activeWall ? <div className="pointer-events-none absolute bottom-3 right-3 max-w-[75%] rounded-xl border-2 border-orange-500 bg-white/95 px-3 py-2 text-xs font-black text-slate-950 shadow-lg" data-plan-active-wall-badge>Kijelölt fal: {surveyPlanWallBoundaryTypeLabels[activeWall.boundaryType]} · {activeWall.orientationLabel} · {activeWall.lengthMeters > 0 ? `${activeWall.lengthMeters.toFixed(2)} m` : "nincs lépték"}</div> : null}
''', 1)

# Insert wall panel before approval list.
wall_panel_anchor = '''        <div className="rounded-2xl border border-[var(--survey-border)] bg-[var(--survey-panel-strong)] p-3">
          <div className="flex items-center justify-between gap-3"><div><div className="text-sm font-black">Jóváhagyási lista</div>'''
wall_panel = '''        <div className="rounded-2xl border border-orange-300 bg-orange-50 p-3 text-slate-950" data-plan-wall-panel>
          <div className="flex items-start justify-between gap-3"><div><div className="text-sm font-black">Külső határoló falak</div><div className="mt-1 text-[10px] font-semibold leading-5 text-slate-600">A rendszer a helyiségpoligonok olyan peremszakaszait keresi, amelyekhez nem tartozik szomszédos helyiség. A falszakaszok végpontjai és besorolása kézzel javítható.</div></div><span className="rounded-full border border-orange-300 bg-white px-2.5 py-1 text-[9px] font-black uppercase text-orange-800">{activePage.wallSuggestions.length} falszakasz</span></div>
          <button type="button" data-plan-recognize-walls onClick={recognizeExternalWalls} className="survey-action-primary mt-3 w-full"><ScanLine size={17} /> KÜLSŐ HATÁROLÁS FELISMERÉSE</button>
          <button type="button" data-plan-manual-wall-cta onClick={() => { setTool("manualWall"); setManualWallPoints([]); onViewModeChange("plan"); }} className="survey-action-secondary mt-2 w-full"><Ruler size={16} /> Hiányzó falszakasz kézi rajza</button>
          <div className={`mt-3 rounded-xl border p-3 text-xs font-semibold leading-5 ${activePage.wallRecognitionStatus === "error" ? "border-red-300 bg-red-50 text-red-900" : "border-orange-200 bg-white text-slate-700"}`} data-plan-wall-recognition-message>{activePage.wallRecognitionMessage}</div>
          <div className="mt-3 grid max-h-[420px] gap-2 overflow-y-auto pr-1">
            {activePage.wallSuggestions.length ? activePage.wallSuggestions.map((wall, index) => {
              const selected = activeWallId === wall.id;
              return <article key={wall.id} data-plan-wall-card={wall.id} className={`rounded-xl border bg-white p-3 ${selected ? "border-orange-500 ring-2 ring-orange-200" : "border-orange-200"}`}>
                <button type="button" className="w-full text-left" onClick={() => selectWall(wall)}><div className="flex items-start justify-between gap-2"><div><div className="text-sm font-black">Falszakasz {index + 1}</div><div className="mt-1 text-[9px] font-black uppercase text-orange-700">{surveyPlanWallBoundaryTypeLabels[wall.boundaryType]} · {wall.source}</div></div><span className="rounded-lg border border-orange-200 bg-orange-50 px-2 py-1 text-[10px] font-black">{wall.orientationLabel} · {wall.lengthMeters > 0 ? `${wall.lengthMeters.toFixed(2)} m` : "–"}</span></div></button>
                {selected ? <div className="mt-3 grid gap-2 border-t border-orange-200 pt-3"><div className="rounded-lg border border-orange-200 bg-orange-50 p-2 text-[10px] font-bold leading-4">A rajzon a két végpont külön húzható. A tájolás és hossz automatikusan újraszámolódik.</div><div><FieldLabel>Határolási típus</FieldLabel><select data-plan-wall-boundary-type className={inputClass} value={wall.boundaryType} onChange={(event) => patchWallSuggestion(wall.id, { boundaryType: event.target.value as SurveyPlanWallBoundaryType, source: "userCorrected" })}>{Object.entries(surveyPlanWallBoundaryTypeLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></div><div className="grid grid-cols-2 gap-2"><div><FieldLabel>Falvastagság (m)</FieldLabel><input type="number" min="0.01" step="0.01" className={inputClass} value={wall.thicknessMeters} onChange={(event) => patchWallSuggestion(wall.id, { thicknessMeters: Math.max(0.01, Number(event.target.value) || 0.3), source: "userCorrected" })} /></div><div><FieldLabel>Magasság (m)</FieldLabel><input type="number" min="0.1" step="0.01" className={inputClass} value={wall.heightMeters} onChange={(event) => patchWallSuggestion(wall.id, { heightMeters: Math.max(0.1, Number(event.target.value) || 2.7), source: "userCorrected" })} /></div></div><div className="grid grid-cols-2 gap-2"><button type="button" data-plan-wall-approve onClick={() => patchWallSuggestion(wall.id, { status: "approved", source: wall.userModified ? "userCorrected" : wall.source })} className="survey-action-primary"><CheckCircle2 size={16} /> {wall.status === "approved" ? "Jóváhagyva" : "Elfogadás"}</button><button type="button" onClick={() => patchWallSuggestion(wall.id, { status: wall.status === "ignored" ? "review" : "ignored" })} className="survey-action-secondary"><EyeOff size={16} /> {wall.status === "ignored" ? "Visszaállítás" : "Kihagyás"}</button></div><button type="button" data-plan-wall-delete onClick={() => deleteWallSuggestion(wall.id)} className="survey-action-danger w-full"><Trash2 size={16} /> Falszakasz törlése</button><div className="rounded-lg border border-orange-200 bg-orange-50 p-2 text-[10px] font-semibold leading-4 text-slate-600">Kapcsolódó helyiség: {wall.connectedRoomSuggestionIds.map((id) => activePage.suggestions.find((suggestion) => suggestion.id === id)?.name || id).join(", ") || "kézi / nincs megadva"}<br />Adatforrás: <strong>{wall.source}</strong></div></div> : null}
              </article>;
            }) : <div className="rounded-xl border border-dashed border-orange-300 bg-white p-5 text-center text-xs font-semibold text-slate-600">Még nincs falszakasz-javaslat.</div>}
          </div>
        </div>

''' + wall_panel_anchor
if wall_panel_anchor not in source:
    raise SystemExit('wall panel anchor missing')
source = source.replace(wall_panel_anchor, wall_panel, 1)

# Add vertex editor button in selected room card and text.
source = source.replace(
'''<div className="rounded-lg border border-cyan-200 bg-cyan-50 p-2 text-[10px] font-bold leading-4 text-cyan-950">A rajzon a helyiség kontúrja húzással mozgatható. A fehér felirat külön húzható, így kis helyiséget sem takar el.</div><input className={inputClass}''',
'''<div className="rounded-lg border border-cyan-200 bg-cyan-50 p-2 text-[10px] font-bold leading-4 text-cyan-950">A rajzon a helyiség kontúrja húzással mozgatható. A fehér felirat külön húzható, így kis helyiséget sem takar el.</div><button type="button" data-plan-edit-vertices onClick={() => { setTool(tool === "editRoomVertices" ? "select" : "editRoomVertices"); setSelectedVertexIndex(null); onViewModeChange("plan"); }} className={tool === "editRoomVertices" ? "survey-action-primary w-full" : "survey-action-secondary w-full"}><MousePointer2 size={16} /> {tool === "editRoomVertices" ? "Poligonpont-szerkesztés befejezése" : "Poligonpontok egyenkénti javítása"}</button><input className={inputClass}''', 1)

source = source.replace(
'''<div className="text-[9px] font-black uppercase tracking-[0.13em] text-cyan-700">v0.8.4.3.3 · Kézi helyiség és tervlapi interakció</div>''',
'''<div className="text-[9px] font-black uppercase tracking-[0.13em] text-cyan-700">v0.8.4.4 · Geometriajavítás és külső határolás MVP</div>''', 1)

path.write_text(source)
