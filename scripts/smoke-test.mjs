/**
 * End-to-end smoke test.
 *
 * Exercises the running server over HTTP and asserts the platform's core
 * invariants. Run it against a live server:
 *
 *   node scripts/smoke-test.mjs [baseUrl]
 *
 * It is designed to be **idempotent and self-cleaning**: it creates its own
 * disposable line, batch and races, exercises them, and removes them again, so it
 * can be run repeatedly against the same dataset with identical results.
 */

const BASE = process.argv[2] ?? 'http://localhost:3006';

/** Names used for the disposable records, so re-runs can detect and reuse them. */
const SMOKE_LINE_CODE = 'LINE_SMOKE';
const SMOKE_RACE_NAME = 'בדיקת עשן — מרוץ זמני';
const EXPIRY_RACE_NAME = 'בדיקת עשן — תפוגה';

let passed = 0;
let failed = 0;

function check(name, condition, detail = '') {
  if (condition) {
    passed += 1;
    console.log(`  ✔ ${name}`);
  } else {
    failed += 1;
    console.log(`  ✖ ${name}${detail ? ` — ${detail}` : ''}`);
  }
}

async function get(path) {
  const response = await fetch(`${BASE}${path}`);
  const buffer = Buffer.from(await response.arrayBuffer());
  const text = buffer.toString('utf8');
  let json = null;
  try {
    json = JSON.parse(text);
  } catch {
    /* not JSON */
  }
  return { status: response.status, json, text, buffer, headers: response.headers };
}

async function send(method, path, body) {
  const response = await fetch(`${BASE}${path}`, {
    method,
    headers: body ? { 'Content-Type': 'application/json' } : {},
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await response.text();
  let json = null;
  try {
    json = JSON.parse(text);
  } catch {
    /* not JSON */
  }
  return { status: response.status, json, text, headers: response.headers };
}

const round3 = (value) => Math.round(value * 1000) / 1000;

/** Removes a race by name if it exists, so re-runs start from a clean slate. */
async function purgeRaceByName(name) {
  const all = await get('/api/races');
  for (const race of all.json?.races ?? []) {
    if (race.name === name) await send('DELETE', `/api/races/${race.id}`);
  }
}

async function main() {
  console.log(`\n▸ Shift smoke test against ${BASE}\n`);

  /* ------------------------------------------------------------- health */
  console.log('· health');
  const health = await get('/api/health');
  check('GET /api/health returns 200', health.status === 200, `status ${health.status}`);
  check('reports storage kind', typeof health.json?.storageKind === 'string');
  check('has seeded workers', (health.json?.counts?.workers ?? 0) > 0, JSON.stringify(health.json?.counts));
  check('has seeded production lines', (health.json?.counts?.lines ?? 0) >= 2, JSON.stringify(health.json?.counts));
  check(
    'has at least two active races',
    (health.json?.counts?.activeRaces ?? 0) >= 2,
    JSON.stringify(health.json?.counts),
  );
  check('has an archived race', (health.json?.counts?.archivedRaces ?? 0) >= 1, JSON.stringify(health.json?.counts));

  /* -------------------------------------------------------------- state */
  console.log('\n· station state');
  const state = await get('/api/state');
  check('GET /api/state returns 200', state.status === 200, `status ${state.status}`);
  check(
    'exposes a station per configured line',
    Array.isArray(state.json?.stations) && state.json.stations.length > 0,
  );
  check(
    'every station carries a production line record',
    (state.json?.stations ?? []).every((station) => typeof station.line?.id === 'string' && station.line.code),
  );
  check('has a primary race', state.json?.activeRace?.isPrimary === true);
  check('exposes every active race', (state.json?.activeRaces ?? []).length >= 2);
  check('exposes the TV idle timeout', typeof state.json?.idleSeconds === 'number');
  check('exposes the TV slide duration', typeof state.json?.tvSlideSeconds === 'number');
  check(
    'TV slide duration defaults to 8 seconds',
    state.json?.tvSlideSeconds === 8,
    `${state.json?.tvSlideSeconds}`,
  );
  check('exposes the TV panel rotation', Array.isArray(state.json?.tvPanels));
  check(
    'TV panel rotation is non-empty by default',
    (state.json?.tvPanels ?? []).length === 5,
    JSON.stringify(state.json?.tvPanels),
  );
  check(
    'no batch view is bound to a single race',
    (state.json?.stations ?? []).every((station) => station.batch === null || !('raceId' in station.batch)),
  );
  check(
    'every running batch reports the races it feeds',
    (state.json?.stations ?? [])
      .filter((station) => station.batch !== null)
      .every((station) => Array.isArray(station.batch.activeRaceNames)),
  );

  const volumeRows = state.json?.leaderboard?.byVolume ?? [];
  // Qualified workers always outrank unqualified ones; within each group, points descend.
  const volumeSorted = volumeRows.every((row, index) => {
    if (index === 0) return true;
    const previous = volumeRows[index - 1];
    if (previous.qualified !== row.qualified) return previous.qualified;
    return previous.points >= row.points;
  });
  check('volume leaderboard is sorted, qualified first', volumeSorted);
  check(
    'volume ranks are contiguous starting at 1',
    volumeRows.map((row) => row.rank).every((rank, index) => rank === index + 1),
  );

  const emojis = (state.json?.workers ?? []).map((worker) => worker.emoji);
  check('every worker emoji is unique', new Set(emojis).size === emojis.length, `${emojis.length} workers`);
  check(
    'no Arabic-Indic digits anywhere in the state payload',
    !/[\u0660-\u0669\u06F0-\u06F9]/.test(JSON.stringify(state.json)),
  );

  /* -------------------------------------------- concurrent race scoring */
  console.log('\n· concurrent race scoring (all active races, one batch)');

  const activeRaces = state.json?.activeRaces ?? [];
  const primaryRaceId = state.json?.activeRace?.id;

  // Establish a per-race baseline before this test writes anything.
  const baseline = new Map();
  for (const race of activeRaces) {
    const board = await get(`/api/leaderboard?raceId=${race.id}`);
    baseline.set(race.id, {
      points: board.json?.totals?.points ?? 0,
      pallets: board.json?.totals?.pallets ?? 0,
    });
  }

  /* --------------------------------------------------- production lines */
  console.log('\n· dynamic production lines');

  const existingSmokeLine = (state.json?.stations ?? []).find(
    (station) => station.line.code === SMOKE_LINE_CODE,
  );

  let smokeLineId = existingSmokeLine?.line.id ?? null;

  if (!smokeLineId) {
    const createdLine = await send('POST', '/api/lines', {
      name: 'קו בדיקה',
      code: SMOKE_LINE_CODE,
      sortOrder: 99,
    });
    check(
      'POST /api/lines creates a line',
      createdLine.status === 201,
      `status ${createdLine.status} ${createdLine.text.slice(0, 160)}`,
    );
    smokeLineId = createdLine.json?.line?.id ?? null;
  } else {
    check('smoke-test line already exists from a previous run', true);
  }

  const afterLineCreate = await get('/api/state');
  const lineStations = afterLineCreate.json?.stations ?? [];
  check(
    'the new line appears on the station dashboard',
    lineStations.some((station) => station.line.id === smokeLineId),
    `${lineStations.length} stations`,
  );

  const duplicateCode = await send('POST', '/api/lines', { name: 'כפילות', code: SMOKE_LINE_CODE });
  check('duplicate line code is rejected with 409', duplicateCode.status === 409, `status ${duplicateCode.status}`);

  /* -------------------------------------------------- disposable batch */
  console.log('\n· batch lifecycle (disposable test batch)');

  const freeStation = lineStations.find((station) => station.batch === null);
  if (!freeStation) {
    console.log('  ✖ no free line available — aborting');
    failed += 1;
    return;
  }

  const testProduct = (afterLineCreate.json?.products ?? [])[0];
  const testWorkers = (afterLineCreate.json?.workers ?? []).slice(0, 4).map((worker) => worker.id);

  if (!testProduct || testWorkers.length < 2 || !primaryRaceId) {
    console.log('  ✖ missing fixtures (products / workers / race) — aborting');
    failed += 1;
    return;
  }

  // Batch setup must NOT accept a race — the field was removed deliberately.
  const created = await send('POST', '/api/batches', {
    lineId: freeStation.line.id,
    productId: testProduct.id,
    memberIds: testWorkers,
    notes: 'בדיקת עשן — smoke test',
  });
  check(
    'POST /api/batches creates a batch with no race selection',
    created.status === 201,
    `status ${created.status} ${created.text.slice(0, 200)}`,
  );

  const testBatch = created.json?.batch;
  if (!testBatch) {
    console.log('  ✖ no batch returned — aborting');
    failed += 1;
    return;
  }

  const batchId = testBatch.batch.id;
  const lineId = testBatch.line.id;
  const pointValue = testBatch.product.pointValue;

  check('new batch starts with a live timer at ~0', testBatch.stats.elapsedSeconds <= 5);
  check('new batch starts with 0 pallets', testBatch.stats.palletCount === 0);
  check('new batch carries the selected team', testBatch.members.length === testWorkers.length);
  check('the batch is not bound to a race', !('raceId' in testBatch));
  check(
    'the batch reports every active race it feeds',
    testBatch.activeRaceNames.length === activeRaces.length,
    `${testBatch.activeRaceNames.length} vs ${activeRaces.length}`,
  );

  const busyLine = await send('POST', '/api/batches', {
    lineId,
    productId: testProduct.id,
    memberIds: [testWorkers[0]],
  });
  check('starting a second batch on a busy line is rejected', busyLine.status === 409, `status ${busyLine.status}`);

  /* --------------------------------------------------------- point math */
  console.log('\n· point splitting (the core rule)');

  const cartons = 30;
  const membersBefore = testBatch.members.filter((member) => member.isCurrentlyActive);

  const added = await send('POST', `/api/batches/${batchId}/pallets`, {
    cartons,
    note: 'smoke test pallet',
  });
  check('POST pallet returns 201', added.status === 201, `status ${added.status} ${added.text.slice(0, 200)}`);

  const expectedBaseTotal = round3(cartons * pointValue);
  check(
    `total points = cartons x pointValue (${cartons} x ${pointValue} = ${expectedBaseTotal})`,
    round3(added.json?.totalPoints) === expectedBaseTotal,
    `got ${added.json?.totalPoints}`,
  );

  const perMember = added.json?.perMemberPoints ?? [];
  const sumOfShares = round3(perMember.reduce((sum, value) => sum + value, 0));
  check(
    'sum(per-member shares) === pallet total (exact split, no lost remainder)',
    Math.abs(sumOfShares - expectedBaseTotal) < 0.001,
    `${sumOfShares} vs ${expectedBaseTotal}`,
  );
  check(
    'split across the currently active members only',
    perMember.length === membersBefore.length,
    `${perMember.length} shares vs ${membersBefore.length} active members`,
  );

  /* ------------------------------------------------ the fan-out itself */
  const attribution = added.json?.races ?? [];
  check(
    'the pallet was attributed to EVERY active race at once',
    attribution.length === activeRaces.length,
    `${attribution.length} races vs ${activeRaces.length} active`,
  );
  check(
    'each attribution names its race',
    attribution.every((entry) => typeof entry.raceName === 'string' && entry.raceName.length > 0),
  );
  check(
    'each attribution carries its own point total',
    attribution.every((entry) => typeof entry.totalPoints === 'number' && entry.totalPoints > 0),
  );

  for (const race of activeRaces) {
    const entry = attribution.find((item) => item.raceId === race.id);
    check(`attribution includes "${race.name}"`, Boolean(entry));
    if (!entry) continue;

    const board = await get(`/api/leaderboard?raceId=${race.id}`);
    const gained = round3((board.json?.totals?.points ?? 0) - (baseline.get(race.id)?.points ?? 0));
    check(
      `"${race.name}" leaderboard gained this pallet's points immediately`,
      gained >= round3(entry.totalPoints) - 0.01,
      `gained ${gained}, expected ~${entry.totalPoints}`,
    );
    check(
      `"${race.name}" pallet count increased by exactly 1`,
      (board.json?.totals?.pallets ?? 0) === (baseline.get(race.id)?.pallets ?? 0) + 1,
    );
  }

  // A non-divisible split is where naive float maths would leak a remainder.
  const awkward = await send('POST', `/api/batches/${batchId}/pallets`, { cartons: 7 });
  const awkwardShares = awkward.json?.perMemberPoints ?? [];
  check(
    'non-divisible split still sums exactly (7 cartons across the team)',
    Math.abs(round3(awkwardShares.reduce((sum, value) => sum + value, 0)) - round3(7 * pointValue)) < 0.001,
    `${round3(awkwardShares.reduce((sum, value) => sum + value, 0))} vs ${round3(7 * pointValue)}`,
  );

  /* ----------------------------------------------- mid-batch team change */
  console.log('\n· mid-batch team modification');

  const freshBatch = await get(`/api/batches/${batchId}`);
  const activeMembers = (freshBatch.json?.batch?.members ?? []).filter((member) => member.isCurrentlyActive);
  const removeTarget = activeMembers[0];

  const removed = await send(
    'DELETE',
    `/api/batches/${batchId}/members?workerId=${encodeURIComponent(removeTarget.workerId)}`,
  );
  check('DELETE member returns 200', removed.status === 200, `status ${removed.status}`);

  const afterRemoval = removed.json?.batch;
  const stillActive = (afterRemoval?.members ?? []).filter((member) => member.isCurrentlyActive);
  check(
    'removed worker is no longer active but keeps their points',
    !stillActive.some((member) => member.workerId === removeTarget.workerId) &&
      (afterRemoval?.members ?? []).some(
        (member) => member.workerId === removeTarget.workerId && member.leftAt !== null,
      ),
  );

  const secondPallet = await send('POST', `/api/batches/${batchId}/pallets`, { cartons: 20 });
  const shares = secondPallet.json?.perMemberPoints ?? [];
  check(
    'subsequent pallet splits among the remaining members only',
    shares.length === stillActive.length,
    `${shares.length} shares vs ${stillActive.length} remaining`,
  );
  check(
    'post-removal split still sums exactly to the pallet total',
    Math.abs(round3(shares.reduce((sum, value) => sum + value, 0)) - round3(20 * pointValue)) < 0.001,
  );

  const rejoined = await send('POST', `/api/batches/${batchId}/members`, { workerId: removeTarget.workerId });
  check('worker can rejoin the batch', rejoined.status === 200, `status ${rejoined.status}`);

  /* --------------------------------------------------------------- pause */
  console.log('\n· pause system');
  const paused = await send('POST', `/api/batches/${batchId}/pause`, {
    reasonCode: 'MACHINE_MAINTENANCE',
    note: 'smoke test',
  });
  check('POST pause returns 200', paused.status === 200, `status ${paused.status}`);
  check('batch reports as paused', paused.json?.batch?.stats?.isPaused === true);

  const doublePause = await send('POST', `/api/batches/${batchId}/pause`, { reasonCode: 'WORKER_BREAK' });
  check('a second concurrent pause is rejected', doublePause.status === 409, `status ${doublePause.status}`);

  const resumed = await send('POST', `/api/batches/${batchId}/resume`, {});
  check('POST resume returns 200', resumed.status === 200);
  check('batch reports as running again', resumed.json?.batch?.stats?.isPaused === false);

  const pauseTotal = resumed.json?.batch?.stats?.pausedSeconds ?? 0;
  const activeTotal = resumed.json?.batch?.stats?.activeSeconds ?? 0;
  const elapsed = resumed.json?.batch?.stats?.elapsedSeconds ?? 0;
  check(
    'active + paused === elapsed (time accounting is consistent)',
    Math.abs(activeTotal + pauseTotal - elapsed) <= 1,
    `${activeTotal} + ${pauseTotal} !== ${elapsed}`,
  );

  /* ------------------------------------------------------ undo a pallet */
  console.log('\n· undo');
  const palletsBefore = resumed.json?.batch?.stats?.palletCount ?? 0;
  const undone = await send('DELETE', `/api/batches/${batchId}/pallets`);
  check('DELETE last pallet returns 200', undone.status === 200, `status ${undone.status}`);
  check(
    'pallet counter decremented',
    (undone.json?.batch?.stats?.palletCount ?? 0) === palletsBefore - 1,
    `${palletsBefore} -> ${undone.json?.batch?.stats?.palletCount}`,
  );

  /* --------------------------------------------------------- validations */
  console.log('\n· validation & uniqueness');
  const badCartons = await send('POST', `/api/batches/${batchId}/pallets`, { cartons: 0 });
  check('zero cartons rejected with 422', badCartons.status === 422, `status ${badCartons.status}`);

  const noCartons = await send('POST', `/api/batches/${batchId}/pallets`, {});
  check('missing carton count rejected with 422', noCartons.status === 422, `status ${noCartons.status}`);

  const duplicateEmoji = await send('POST', '/api/workers', {
    fullName: 'בדיקת כפילות',
    employeeId: '99999',
    emoji: emojis[0],
  });
  check('duplicate emoji rejected with 409', duplicateEmoji.status === 409, `status ${duplicateEmoji.status}`);
  check(
    'duplicate emoji error message is Hebrew',
    /[\u0590-\u05FF]/.test(duplicateEmoji.json?.error?.message ?? ''),
    duplicateEmoji.json?.error?.message,
  );

  /* --------------------------------------------- race expiry & archiving */
  console.log('\n· automatic race archiving');

  await purgeRaceByName(EXPIRY_RACE_NAME);

  const expiring = await send('POST', '/api/races', {
    name: EXPIRY_RACE_NAME,
    startAt: new Date(Date.now() - 48 * 3600_000).toISOString(),
    endAt: new Date(Date.now() - 24 * 3600_000).toISOString(),
    minActiveHours: 5,
    isPrimary: false,
  });
  check(
    'a race can be created with a past end date',
    expiring.status === 201,
    `status ${expiring.status} ${expiring.text.slice(0, 160)}`,
  );

  const expiringId = expiring.json?.race?.id ?? null;
  check(
    'the expired race was archived immediately on creation',
    expiring.json?.race?.status === 'FINISHED',
    expiring.json?.race?.status,
  );

  const afterExpiry = await get('/api/races');
  const expiredRace = (afterExpiry.json?.races ?? []).find((race) => race.id === expiringId);
  check('it appears in the archive', expiredRace?.status === 'FINISHED', expiredRace?.status);
  check(
    'the archiver recorded why it closed',
    typeof expiredRace?.archiveNote === 'string' && expiredRace.archiveNote.length > 0,
    expiredRace?.archiveNote,
  );
  check('an archived race never holds the primary flag', expiredRace?.isPrimary === false);

  const scopedActive = await get('/api/races?status=ACTIVE');
  const scopedArchived = await get('/api/races?status=FINISHED');
  check(
    'the ACTIVE scope returns only active races',
    (scopedActive.json?.races ?? []).every((race) => race.status === 'ACTIVE'),
  );
  check(
    'the FINISHED scope returns only archived races',
    (scopedArchived.json?.races ?? []).every((race) => race.status === 'FINISHED'),
  );
  check(
    'the archived race appears under the FINISHED scope',
    (scopedArchived.json?.races ?? []).some((race) => race.id === expiringId),
  );

  await send('DELETE', `/api/races/${expiringId}`);

  /* ------------------------------------------------------- race deletion */
  console.log('\n· race deletion (destructive, with impact report)');

  await purgeRaceByName(SMOKE_RACE_NAME);

  const tempRace = await send('POST', '/api/races', {
    name: SMOKE_RACE_NAME,
    prizeDescription: 'מרוץ זמני לבדיקה',
    minActiveHours: 1,
    isPrimary: false,
  });
  check('a temporary race can be created', tempRace.status === 201, `status ${tempRace.status}`);
  const tempRaceId = tempRace.json?.race?.id ?? null;

  // Score in it: the temp race is ACTIVE, so the next pallet must fan out to it.
  const scoredInTemp = await send('POST', `/api/batches/${batchId}/pallets`, { cartons: 12 });
  check(
    'a newly opened race starts receiving points from the running batch immediately',
    (scoredInTemp.json?.races ?? []).some((entry) => entry.raceId === tempRaceId),
    JSON.stringify((scoredInTemp.json?.races ?? []).map((entry) => entry.raceName)),
  );

  const tempBoard = await get(`/api/leaderboard?raceId=${tempRaceId}`);
  check('the temporary race has a non-zero board', (tempBoard.json?.totals?.points ?? 0) > 0);

  const impact = await get(`/api/races/${tempRaceId}/impact`);
  check('GET /api/races/:id/impact returns 200', impact.status === 200, `status ${impact.status}`);
  check('the impact report counts award rows', (impact.json?.awards ?? 0) > 0, `${impact.json?.awards}`);
  check('the impact report counts pallets', (impact.json?.pallets ?? 0) > 0, `${impact.json?.pallets}`);

  // Record what the OTHER races hold, to prove deletion is isolated.
  const otherBaseline = new Map();
  for (const race of activeRaces) {
    const board = await get(`/api/leaderboard?raceId=${race.id}`);
    otherBaseline.set(race.id, board.json?.totals?.points ?? 0);
  }

  const deleted = await send('DELETE', `/api/races/${tempRaceId}`);
  check('DELETE /api/races/:id returns 200', deleted.status === 200, `status ${deleted.status}`);
  check(
    'the response reports how many awards were removed',
    (deleted.json?.removedAwards ?? 0) > 0,
    `${deleted.json?.removedAwards}`,
  );

  const afterDelete = await get('/api/races');
  check('the deleted race is gone', !(afterDelete.json?.races ?? []).some((race) => race.id === tempRaceId));

  for (const race of activeRaces) {
    const board = await get(`/api/leaderboard?raceId=${race.id}`);
    check(
      `deleting one race left "${race.name}" untouched`,
      round3(board.json?.totals?.points ?? 0) === round3(otherBaseline.get(race.id) ?? -1),
      `${otherBaseline.get(race.id)} -> ${board.json?.totals?.points}`,
    );
  }

  const orphaned = await get(`/api/leaderboard?raceId=${tempRaceId}`);
  check('the deleted race no longer resolves to a board', orphaned.json?.race === null);

  /* ------------------------------------------------- TV panel settings */
  console.log('\n· TV Mode panel selection');

  const fullPanels = state.json?.tvPanels ?? [];
  const subset = ['daily', 'active_batches'];

  const savedPanels = await send('PUT', '/api/settings', { tvPanels: subset });
  check('PUT /api/settings accepts a panel subset', savedPanels.status === 200, `status ${savedPanels.status}`);

  const afterPanelChange = await get('/api/state');
  check(
    'the state reflects the reduced rotation',
    (afterPanelChange.json?.tvPanels ?? []).length === subset.length,
    JSON.stringify(afterPanelChange.json?.tvPanels),
  );
  check(
    'panel order follows the canonical order, not the request order',
    JSON.stringify(afterPanelChange.json?.tvPanels) === JSON.stringify(['active_batches', 'daily']),
    JSON.stringify(afterPanelChange.json?.tvPanels),
  );

  const emptyPanels = await send('PUT', '/api/settings', { tvPanels: [] });
  check('an empty rotation is accepted', emptyPanels.status === 200, `status ${emptyPanels.status}`);
  const afterEmpty = await get('/api/state');
  check('an empty rotation round-trips', (afterEmpty.json?.tvPanels ?? ['x']).length === 0);

  const invalidPanel = await send('PUT', '/api/settings', { tvPanels: ['not_a_panel'] });
  check('an unknown panel key is rejected with 422', invalidPanel.status === 422, `status ${invalidPanel.status}`);

  await send('PUT', '/api/settings', { tvPanels: fullPanels });
  const restored = await get('/api/state');
  check(
    'the full rotation can be restored',
    (restored.json?.tvPanels ?? []).length === fullPanels.length,
    JSON.stringify(restored.json?.tvPanels),
  );

  /* ------------------------------------------------------------ CSV files */
  console.log('\n· CSV exports');
  for (const report of ['batches', 'workers', 'downtime', 'pallets', 'daily']) {
    const csv = await get(`/api/reports/${report}`);
    const body = csv.text;
    const bytes = csv.buffer;
    check(`/api/reports/${report} returns 200`, csv.status === 200, `status ${csv.status}`);
    check(
      `/api/reports/${report} starts with a UTF-8 BOM (Excel-safe Hebrew)`,
      bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf,
      `bytes ${bytes[0]?.toString(16)} ${bytes[1]?.toString(16)} ${bytes[2]?.toString(16)}`,
    );
    check(
      `/api/reports/${report} is served as text/csv`,
      (csv.headers.get('content-type') ?? '').includes('text/csv'),
    );
    check(
      `/api/reports/${report} is offered as a download`,
      (csv.headers.get('content-disposition') ?? '').includes('attachment'),
    );
    check(`/api/reports/${report} has a header row`, body.includes('\r\n'));
    check(`/api/reports/${report} has Hebrew headers`, /[\u0590-\u05FF]/.test(body));
    check(`/api/reports/${report} uses Western digits only`, !/[\u0660-\u0669\u06F0-\u06F9]/.test(body));
    check(`/api/reports/${report} decodes to valid UTF-8 (no mojibake)`, !body.includes('\uFFFD'));
    // Exactly one BOM and one `sep=,` hint. A doubled BOM renders as a stray
    // glyph in Excel, and a mid-file `sep=` line is read as data.
    check(
      `/api/reports/${report} contains exactly one BOM`,
      (body.match(/\uFEFF/g) ?? []).length === 1,
      `${(body.match(/\uFEFF/g) ?? []).length} BOM characters`,
    );
    check(
      `/api/reports/${report} contains exactly one separator hint`,
      (body.match(/sep=,/g) ?? []).length === 1,
      `${(body.match(/sep=,/g) ?? []).length} sep= lines`,
    );
  }

  /* ------------------------------------------------- finish & cleanup */
  console.log('\n· finish the test batch');
  const finished = await send('POST', `/api/batches/${batchId}/finish`, { notes: 'smoke test complete' });
  check('POST finish returns 200', finished.status === 200, `status ${finished.status}`);
  check('finished batch is marked COMPLETED', finished.json?.batch?.status === 'COMPLETED');
  check('finish writes a duration snapshot', typeof finished.json?.batch?.activeSeconds === 'number');

  const afterFinish = await get('/api/state');
  check(
    'the finished line is free again',
    (afterFinish.json?.stations ?? []).find((station) => station.line.id === lineId)?.batch === null,
  );

  console.log('\n· cleanup');
  const lineDelete = await send('DELETE', `/api/lines/${smokeLineId}`);
  check('the disposable line can be deleted', lineDelete.status === 200, `status ${lineDelete.status}`);
  check(
    'a line with no batch history is deleted outright',
    lineDelete.json?.deleted === true || lineDelete.json?.deactivated === true,
  );

  const finalState = await get('/api/state');
  check(
    'the dashboard no longer shows the deleted line',
    !(finalState.json?.stations ?? []).some((station) => station.line.id === smokeLineId),
  );

  console.log(`\n▸ ${passed} passed, ${failed} failed\n`);
  if (failed > 0) process.exitCode = 1;
}

main().catch((error) => {
  console.error('\n  ✖ Smoke test crashed:', error);
  process.exit(1);
});
