from pathlib import Path

path = Path('scripts/test-property-survey-plan-document-v0843.cjs')
source = path.read_text()
anchor = """  pass('A nem felismert helyiség kézzel körberajzolható, a kis helyiség felirata calloutként jelenik meg, a kontúr és a felirat külön mozgatható');

  await page.click('[data-plan-document-view-mode=\"split\"]');
"""
replacement = """  pass('A nem felismert helyiség kézzel körberajzolható, a kis helyiség felirata calloutként jelenik meg, a kontúr és a felirat külön mozgatható');

  const vertexBefore = await page.evaluate((suggestionId) => {
    const workspace = JSON.parse(localStorage.getItem('dimpro-property-survey-workspace-v1') || '{}');
    const draft = workspace.surveys?.find((survey) => survey.id === workspace.activeSurveyId)?.draft;
    const plan = draft?.planDocumentWorkspace;
    const document = plan?.documents?.find((item) => item.id === plan.activeDocumentId);
    const activePage = document?.pages?.find((item) => item.id === plan.activePageId);
    const suggestion = activePage?.suggestions?.find((item) => item.id === suggestionId);
    return { point: suggestion?.polygon?.[0], count: suggestion?.polygon?.length || 0, area: suggestion?.calculatedAreaSquareMeters || 0 };
  }, manualSuggestionId);
  await page.click('[data-plan-vertex-tool]');
  await page.waitForSelector(`[data-plan-room-vertex^="${manualSuggestionId}:"]`);
  await dragElementByPixels(page, `[data-plan-room-vertex="${manualSuggestionId}:0"]`, 28, -16);
  await sleep(900);
  const vertexAfterMove = await page.evaluate((suggestionId) => {
    const workspace = JSON.parse(localStorage.getItem('dimpro-property-survey-workspace-v1') || '{}');
    const draft = workspace.surveys?.find((survey) => survey.id === workspace.activeSurveyId)?.draft;
    const plan = draft?.planDocumentWorkspace;
    const document = plan?.documents?.find((item) => item.id === plan.activeDocumentId);
    const activePage = document?.pages?.find((item) => item.id === plan.activePageId);
    const suggestion = activePage?.suggestions?.find((item) => item.id === suggestionId);
    return { point: suggestion?.polygon?.[0], count: suggestion?.polygon?.length || 0, area: suggestion?.calculatedAreaSquareMeters || 0, source: suggestion?.source };
  }, manualSuggestionId);
  assert(Math.abs(vertexAfterMove.point.x - vertexBefore.point.x) > 0.002 || Math.abs(vertexAfterMove.point.y - vertexBefore.point.y) > 0.002, `Az egyedi poligonpont nem mozdult: ${JSON.stringify({ vertexBefore, vertexAfterMove })}`);
  assert(vertexAfterMove.area > 0 && vertexAfterMove.source === 'userCorrected', `A poligonpont javítása után hibás a terület vagy adatforrás: ${JSON.stringify(vertexAfterMove)}`);
  await page.click(`[data-plan-room-edge-midpoint^="${manualSuggestionId}:"]`);
  await sleep(800);
  const vertexCountAfterInsert = await page.evaluate((suggestionId) => {
    const workspace = JSON.parse(localStorage.getItem('dimpro-property-survey-workspace-v1') || '{}');
    const draft = workspace.surveys?.find((survey) => survey.id === workspace.activeSurveyId)?.draft;
    const plan = draft?.planDocumentWorkspace;
    const document = plan?.documents?.find((item) => item.id === plan.activeDocumentId);
    const activePage = document?.pages?.find((item) => item.id === plan.activePageId);
    return activePage?.suggestions?.find((item) => item.id === suggestionId)?.polygon?.length || 0;
  }, manualSuggestionId);
  assert(vertexCountAfterInsert === vertexBefore.count + 1, `Az új töréspont beszúrása hibás: ${vertexCountAfterInsert}`);
  await page.click('[data-plan-delete-vertex]');
  await sleep(800);
  const vertexCountAfterDelete = await page.evaluate((suggestionId) => {
    const workspace = JSON.parse(localStorage.getItem('dimpro-property-survey-workspace-v1') || '{}');
    const draft = workspace.surveys?.find((survey) => survey.id === workspace.activeSurveyId)?.draft;
    const plan = draft?.planDocumentWorkspace;
    const document = plan?.documents?.find((item) => item.id === plan.activeDocumentId);
    const activePage = document?.pages?.find((item) => item.id === plan.activePageId);
    return activePage?.suggestions?.find((item) => item.id === suggestionId)?.polygon?.length || 0;
  }, manualSuggestionId);
  assert(vertexCountAfterDelete === vertexBefore.count, `A kijelölt töréspont törlése hibás: ${vertexCountAfterDelete}`);
  pass('A helyiség poligonpontjai egyenként mozgathatók, új pont beszúrható és a kijelölt pont törölhető; a terület újraszámolódik');

  await page.click('[data-plan-document-view-mode="data"]');
  await page.waitForSelector('[data-plan-recognize-walls]');
  await page.click('[data-plan-recognize-walls]');
  await page.waitForFunction(() => document.querySelectorAll('[data-plan-wall-card]').length >= 4, { timeout: 30000 });
  const wallRecognition = await page.evaluate(() => {
    const workspace = JSON.parse(localStorage.getItem('dimpro-property-survey-workspace-v1') || '{}');
    const draft = workspace.surveys?.find((survey) => survey.id === workspace.activeSurveyId)?.draft;
    const plan = draft?.planDocumentWorkspace;
    const document = plan?.documents?.find((item) => item.id === plan.activeDocumentId);
    const activePage = document?.pages?.find((item) => item.id === plan.activePageId);
    return { count: activePage?.wallSuggestions?.length || 0, status: activePage?.wallRecognitionStatus, message: activePage?.wallRecognitionMessage || '' };
  });
  assert(wallRecognition.count >= 4 && wallRecognition.status === 'ready' && wallRecognition.message.includes('külső'), `A külső határolás felismerése hibás: ${JSON.stringify(wallRecognition)}`);
  const firstWallCard = await page.$('[data-plan-wall-card]');
  const firstWallId = await firstWallCard.evaluate((element) => element.getAttribute('data-plan-wall-card') || '');
  await firstWallCard.click();
  await page.select('[data-plan-wall-boundary-type]', 'unheatedSpace');
  await page.click('[data-plan-wall-approve]');
  await sleep(800);
  await page.click('[data-plan-document-view-mode="plan"]');
  await page.waitForSelector(`[data-plan-wall-endpoint="${firstWallId}:end"]`);
  const wallBeforeMove = await page.evaluate((wallId) => {
    const workspace = JSON.parse(localStorage.getItem('dimpro-property-survey-workspace-v1') || '{}');
    const draft = workspace.surveys?.find((survey) => survey.id === workspace.activeSurveyId)?.draft;
    const plan = draft?.planDocumentWorkspace;
    const document = plan?.documents?.find((item) => item.id === plan.activeDocumentId);
    const activePage = document?.pages?.find((item) => item.id === plan.activePageId);
    const wall = activePage?.wallSuggestions?.find((item) => item.id === wallId);
    return { end: wall?.end, length: wall?.lengthMeters, boundaryType: wall?.boundaryType, status: wall?.status };
  }, firstWallId);
  await dragElementByPixels(page, `[data-plan-wall-endpoint="${firstWallId}:end"]`, 32, 12);
  await sleep(900);
  const wallAfterMove = await page.evaluate((wallId) => {
    const workspace = JSON.parse(localStorage.getItem('dimpro-property-survey-workspace-v1') || '{}');
    const draft = workspace.surveys?.find((survey) => survey.id === workspace.activeSurveyId)?.draft;
    const plan = draft?.planDocumentWorkspace;
    const document = plan?.documents?.find((item) => item.id === plan.activeDocumentId);
    const activePage = document?.pages?.find((item) => item.id === plan.activePageId);
    const wall = activePage?.wallSuggestions?.find((item) => item.id === wallId);
    return { end: wall?.end, length: wall?.lengthMeters, boundaryType: wall?.boundaryType, status: wall?.status, source: wall?.source };
  }, firstWallId);
  assert(Math.abs(wallAfterMove.end.x - wallBeforeMove.end.x) > 0.002 || Math.abs(wallAfterMove.end.y - wallBeforeMove.end.y) > 0.002, `A falszakasz végpontja nem mozdult: ${JSON.stringify({ wallBeforeMove, wallAfterMove })}`);
  assert(wallAfterMove.length > 0 && wallAfterMove.boundaryType === 'unheatedSpace' && wallAfterMove.status === 'approved' && wallAfterMove.source === 'userCorrected', `A falszakasz kézi javítása vagy jóváhagyása hibás: ${JSON.stringify(wallAfterMove)}`);
  pass('A külső falszakaszok automatikusan létrejönnek, besorolhatók, jóváhagyhatók és végpontonként kézzel javíthatók');

  await page.click('[data-plan-manual-wall-tool]');
  await page.waitForSelector('[data-plan-manual-wall-instruction]');
  await clickPointsInElement(page, '[data-plan-document-stage]', [{ x: 0.72, y: 0.74 }, { x: 0.82, y: 0.74 }]);
  await page.waitForFunction(() => {
    const workspace = JSON.parse(localStorage.getItem('dimpro-property-survey-workspace-v1') || '{}');
    const draft = workspace.surveys?.find((survey) => survey.id === workspace.activeSurveyId)?.draft;
    const plan = draft?.planDocumentWorkspace;
    const document = plan?.documents?.find((item) => item.id === plan.activeDocumentId);
    const activePage = document?.pages?.find((item) => item.id === plan.activePageId);
    return activePage?.wallSuggestions?.some((wall) => wall.source === 'manualDrawing');
  }, { timeout: 30000 });
  const manualWallState = await page.evaluate(() => {
    const workspace = JSON.parse(localStorage.getItem('dimpro-property-survey-workspace-v1') || '{}');
    const draft = workspace.surveys?.find((survey) => survey.id === workspace.activeSurveyId)?.draft;
    const plan = draft?.planDocumentWorkspace;
    const document = plan?.documents?.find((item) => item.id === plan.activeDocumentId);
    const activePage = document?.pages?.find((item) => item.id === plan.activePageId);
    const wall = activePage?.wallSuggestions?.find((item) => item.source === 'manualDrawing');
    return { exists: Boolean(wall), boundaryType: wall?.boundaryType, length: wall?.lengthMeters };
  });
  assert(manualWallState.exists && manualWallState.boundaryType === 'unknown' && manualWallState.length > 0, `A kézi falszakasz felvétele hibás: ${JSON.stringify(manualWallState)}`);
  pass('A hiányzó külső falszakasz két kattintással kézzel felvehető és ellenőrzendő besorolással mentődik');

  await page.click('[data-plan-document-view-mode="split"]');
"""
if anchor not in source:
    raise SystemExit('E2E insertion anchor missing')
source = source.replace(anchor, replacement, 1)
source = source.replace('DIMPRO Felmérő v0.8.4.3.3 PDF tervlap E2E', 'DIMPRO Felmérő v0.8.4.4 PDF tervlap E2E', 1)
path.write_text(source)
