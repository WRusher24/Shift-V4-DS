/**
 * Seed data.
 *
 * Produces a factory that is immediately usable on first load: a crew with
 * unique emojis, three dynamic production lines, a detergent product catalogue
 * with realistic pallet configurations and point values, **three races with two
 * of them running concurrently**, and two weeks of believable batch history plus
 * today's production — pallets, pauses and a fully balanced per-race point
 * ledger.
 *
 * The concurrent races are deliberate: every pallet logged while both are open
 * produces award rows in *both*, which is what exercises the fan-out model on a
 * fresh install.
 *
 * The history generator is deterministic (seeded PRNG) so every install produces
 * the same numbers, which makes screenshots, demos and regression comparisons
 * reproducible.
 */

import type {
  Batch,
  BatchMember,
  PalletLog,
  PalletSize,
  PauseLog,
  PointAward,
  Product,
  ProductionLine,
  Race,
  RaceProductPoint,
  Worker,
} from '@/lib/domain/types';
import { PAUSE_REASON_CODES } from '@/lib/domain/types';
import { splitPoints, computePalletPoints, roundPoints } from '@/lib/domain/points';
import { getRepository } from '@/lib/repo';
import { SETTING_KEYS } from '@/lib/db/schema';
import { newId } from '@/lib/utils/id';

/* -------------------------------------------------------------------------- */
/*  Deterministic PRNG                                                        */
/* -------------------------------------------------------------------------- */

function createRandom(seed: number) {
  let state = seed >>> 0;
  return () => {
    // xorshift32 — small, fast, and stable across runs.
    state ^= state << 13;
    state >>>= 0;
    state ^= state >> 17;
    state ^= state << 5;
    state >>>= 0;
    return state / 0xffffffff;
  };
}

/* -------------------------------------------------------------------------- */
/*  Static seed catalogues                                                    */
/* -------------------------------------------------------------------------- */

export const SEED_WORKERS: Array<Pick<Worker, 'fullName' | 'employeeId' | 'emoji'>> = [
  { fullName: 'יוסי כהן', employeeId: '1001', emoji: '🦁' },
  { fullName: 'מרים לוי', employeeId: '1002', emoji: '🐯' },
  { fullName: 'أحمد خليل', employeeId: '1003', emoji: '🦊' },
  { fullName: 'רונית בן־דוד', employeeId: '1004', emoji: '🐼' },
  { fullName: 'סמיר אבו סאלח', employeeId: '1005', emoji: '🐻' },
  { fullName: 'דוד מזרחי', employeeId: '1006', emoji: '🦉' },
  { fullName: 'לינה חדאד', employeeId: '1007', emoji: '🦋' },
  { fullName: 'Moshe Peretz', employeeId: '1008', emoji: '⚡' },
  { fullName: 'חנא נאסר', employeeId: '1009', emoji: '🔥' },
  { fullName: 'שרה אברהם', employeeId: '1010', emoji: '🌻' },
  { fullName: 'כרים זועבי', employeeId: '1011', emoji: '🚀' },
  { fullName: 'נועה שרעבי', employeeId: '1012', emoji: '🧿' },
];

/** Three lines by default, to demonstrate that lines are dynamic. */
export const SEED_LINES: Array<Pick<ProductionLine, 'name' | 'code' | 'sortOrder'>> = [
  { name: 'קו A', code: 'LINE_A', sortOrder: 0 },
  { name: 'קו B', code: 'LINE_B', sortOrder: 1 },
  { name: 'קו מילוי 3', code: 'LINE_C', sortOrder: 2 },
];

interface SeedProduct {
  name: string;
  sku: string;
  sizeLabel: string;
  cartonsPerLayout: number;
  pointValue: number;
  palletSizes: Array<{ label: string; cartons: number }>;
  /** Multiplier applied only inside the monthly race, to demo the override. */
  racePointValue?: number;
}

export const SEED_PRODUCTS: SeedProduct[] = [
  {
    name: 'נוזל רצפות 1 ליטר',
    sku: 'FLR-1L',
    sizeLabel: '1 ליטר',
    cartonsPerLayout: 12,
    pointValue: 1,
    palletSizes: [
      { label: 'משטח A', cartons: 28 },
      { label: 'משטח B', cartons: 32 },
    ],
  },
  {
    name: 'נוזל כלים 2 ליטר',
    sku: 'DSH-2L',
    sizeLabel: '2 ליטר',
    cartonsPerLayout: 6,
    pointValue: 1.5,
    palletSizes: [
      { label: 'משטח A', cartons: 24 },
      { label: 'משטח B', cartons: 30 },
    ],
  },
  {
    name: 'אקונומיקה 1 ליטר',
    sku: 'BLH-1L',
    sizeLabel: '1 ליטר',
    cartonsPerLayout: 12,
    pointValue: 1.2,
    palletSizes: [
      { label: 'משטח A', cartons: 28 },
      { label: 'משטח B', cartons: 36 },
    ],
  },
  {
    name: 'מרכך כביסה 4 ליטר',
    sku: 'SFT-4L',
    sizeLabel: '4 ליטר',
    cartonsPerLayout: 4,
    pointValue: 2.25,
    palletSizes: [
      { label: 'משטח A', cartons: 20 },
      { label: 'משטח B', cartons: 24 },
    ],
  },
  {
    name: "ג'ל כביסה 3 ליטר",
    sku: 'GEL-3L',
    sizeLabel: '3 ליטר',
    cartonsPerLayout: 4,
    pointValue: 2,
    // Weighted higher inside the monthly race — the race override in action.
    racePointValue: 2.5,
    palletSizes: [
      { label: 'משטח A', cartons: 24 },
      { label: 'משטח B', cartons: 28 },
    ],
  },
  {
    name: 'מנקה זכוכית 750 מ״ל',
    sku: 'GLS-750',
    sizeLabel: '750 מ״ל',
    cartonsPerLayout: 12,
    pointValue: 0.9,
    palletSizes: [
      { label: 'משטח A', cartons: 36 },
      { label: 'משטח B', cartons: 48 },
    ],
  },
];

/* -------------------------------------------------------------------------- */
/*  History generator                                                         */
/* -------------------------------------------------------------------------- */

const DAYS_OF_HISTORY = 14;
const COMPLETED_BATCHES_PER_DAY = 3;
const TODAY_COMPLETED_BATCHES = 3;

/** Starts 14 days ago and never ends — the default board. */
const MONTHLY_RACE_NAME = 'מרוץ החודש — קווי מילוי';
/** Starts 5 days ago and runs alongside the monthly race. */
const SPRINT_RACE_NAME = 'מרוץ יעילות — ספרינט שבועי';
/** Fully in the past, so it sits in the archive. */
const PREVIOUS_RACE_NAME = 'מרוץ קודם — סגור';

/** The sprint race's point multiplier for one product, to demo per-race weighting. */
const SPRINT_BOOSTED_SKU = 'SFT-4L';
const SPRINT_BOOSTED_VALUE = 3;

export interface SeedResult {
  workers: number;
  lines: number;
  products: number;
  palletSizes: number;
  races: number;
  activeRaces: number;
  raceProductPoints: number;
  batches: number;
  completedBatches: number;
  palletLogs: number;
  pointAwards: number;
  pauseLogs: number;
  settings: number;
  /** Award rows that exist beyond one-per-pallet-worker, i.e. the fan-out. */
  concurrentAwards: number;
}

/**
 * Writes the full seed dataset.
 *
 * @param options.reset When true the entire database is emptied first. The local
 *                      store is always reset; PostgreSQL is only reset when
 *                      explicitly requested, to avoid nuking a live factory
 *                      database by accident.
 */
export async function seedDatabase(options: { reset?: boolean } = {}): Promise<SeedResult> {
  const repository = getRepository();

  if (options.reset) {
    await repository.truncateAll();
  }

  const random = createRandom(20261005);
  const now = new Date();
  const ms = (value: string | Date) => new Date(value).getTime();

  /* ------------------------------------------------------------- settings */

  await repository.setSetting(SETTING_KEYS.FACTORY_NAME, 'מפעל חומרי ניקוי — קווי מילוי ואריזה');
  await repository.setSetting(SETTING_KEYS.MIN_RACE_HOURS, '30');
  await repository.setSetting(SETTING_KEYS.TV_IDLE_SECONDS, '10');
  await repository.setSetting(SETTING_KEYS.TV_SLIDE_SECONDS, '8');
  await repository.setSetting(
    SETTING_KEYS.TV_PANELS,
    'leaderboard_volume,leaderboard_efficiency,active_batches,daily,race_stats',
  );

  /* -------------------------------------------------------------- workers */

  const workers: Worker[] = SEED_WORKERS.map((seed, index) => ({
    id: newId(),
    fullName: seed.fullName,
    employeeId: seed.employeeId,
    emoji: seed.emoji,
    isActive: true,
    createdAt: new Date(now.getTime() - (SEED_WORKERS.length - index) * 86400000).toISOString(),
  }));

  for (const worker of workers) {
    await repository.insertWorker(worker);
  }

  /* -------------------------------------------------------- production lines */

  const lines: ProductionLine[] = [];
  for (const seed of SEED_LINES) {
    const line: ProductionLine = {
      id: newId(),
      name: seed.name,
      code: seed.code,
      sortOrder: seed.sortOrder,
      isActive: true,
      createdAt: new Date(now.getTime() - 60 * 86400000).toISOString(),
    };
    await repository.insertProductionLine(line);
    lines.push(line);
  }

  /* ------------------------------------------------------------- products */

  const products: Product[] = [];
  const palletSizes: PalletSize[] = [];

  for (const seed of SEED_PRODUCTS) {
    const product: Product = {
      id: newId(),
      name: seed.name,
      sku: seed.sku,
      sizeLabel: seed.sizeLabel,
      cartonsPerLayout: seed.cartonsPerLayout,
      pointValue: seed.pointValue,
      isActive: true,
      createdAt: new Date(now.getTime() - (DAYS_OF_HISTORY + 30) * 86400000).toISOString(),
    };
    await repository.insertProduct(product);
    products.push(product);

    for (const [index, size] of seed.palletSizes.entries()) {
      const palletSize: PalletSize = {
        id: newId(),
        productId: product.id,
        label: size.label,
        cartons: size.cartons,
        sortOrder: index,
      };
      await repository.insertPalletSize(palletSize);
      palletSizes.push(palletSize);
    }
  }

  /* ---------------------------------------------------------------- races */

  /**
   * Race windows are laid out with clean gaps so no seeded pallet can fall
   * outside every race — a boundary pallet would legitimately produce zero
   * awards and make the demo data look broken.
   *
   *   archived race   -30d .. -17d   (purely historical)
   *   monthly race    -15d .. open   (primary, the default board)
   *   sprint race      -5d .. open   (concurrent with the monthly race)
   *
   * So history days 14..1 sit inside the monthly race, and days 5..1 also sit
   * inside the sprint race — which is the fan-out, visible on a fresh install.
   */
  const previousRaceStart = new Date(now.getTime() - 30 * 86400000);
  const previousRaceEnd = new Date(now.getTime() - 17 * 86400000);

  const previousRace: Race = {
    id: newId(),
    name: PREVIOUS_RACE_NAME,
    prizeDescription: 'שובר 300 ₪ לצוות המוביל',
    startAt: previousRaceStart.toISOString(),
    endAt: previousRaceEnd.toISOString(),
    minActiveHours: 30,
    status: 'FINISHED',
    isPrimary: false,
    archiveNote: 'הסתיים כמתוכנן — הוחלף במרוץ החודשי',
    createdAt: previousRaceStart.toISOString(),
  };
  await repository.insertRace(previousRace);

  const monthlyRaceStart = new Date(now.getTime() - 15 * 86400000);
  const monthlyRace: Race = {
    id: newId(),
    name: MONTHLY_RACE_NAME,
    prizeDescription: 'שובר 500 ₪ לצוות המוביל + יום חופש',
    startAt: monthlyRaceStart.toISOString(),
    endAt: null,
    minActiveHours: 30,
    status: 'ACTIVE',
    isPrimary: true,
    archiveNote: null,
    createdAt: monthlyRaceStart.toISOString(),
  };
  await repository.insertRace(monthlyRace);

  /**
   * A second race running concurrently with the monthly one. Every pallet logged
   * while both are open scores in both — this is the fan-out model, visible on a
   * fresh install.
   */
  const sprintRaceStart = new Date(now.getTime() - 5 * 86400000);
  const sprintRace: Race = {
    id: newId(),
    name: SPRINT_RACE_NAME,
    prizeDescription: 'ארוחת צוות מפנקת לקו הזוכה',
    startAt: sprintRaceStart.toISOString(),
    endAt: null,
    minActiveHours: 12,
    status: 'ACTIVE',
    isPrimary: false,
    archiveNote: null,
    createdAt: sprintRaceStart.toISOString(),
  };
  await repository.insertRace(sprintRace);

  /* ------------------------------------------- per-race point multipliers */

  const raceProductPoints: RaceProductPoint[] = [];

  const addOverride = async (raceId: string, sku: string, pointValue: number) => {
    const product = products.find((candidate) => candidate.sku === sku);
    if (!product) return;
    const row: RaceProductPoint = { id: newId(), raceId, productId: product.id, pointValue };
    await repository.insertRaceProductPoint(row);
    raceProductPoints.push(row);
  };

  await addOverride(monthlyRace.id, "ג'ל כביסה 3 ליטר", 2.5);
  await addOverride(sprintRace.id, SPRINT_BOOSTED_SKU, SPRINT_BOOSTED_VALUE);

  /** The multiplier a given race applies to a given product. */
  const effectivePointValue = (product: Product, raceId: string): number => {
    const override = raceProductPoints.find(
      (row) => row.raceId === raceId && row.productId === product.id,
    );
    return override ? override.pointValue : product.pointValue;
  };

  /**
   * Every race whose window covers a given instant.
   *
   * Deliberately a **time-window** test, not a `status === 'ACTIVE'` test: this
   * generator writes history, and a race that is archived *today* was still open
   * when those pallets were produced. Using the current status here would leave
   * the archive with no points at all.
   *
   * It is also correct for live pallets: the archived race's window ends in the
   * past, so it can never match "now".
   */
  const racesScoringAt = (at: number, allRaces: Race[]): Race[] =>
    allRaces.filter(
      (race) => ms(race.startAt) <= at && (race.endAt === null || ms(race.endAt) > at),
    );

  const allRaces = [previousRace, monthlyRace, sprintRace];

  /**
   * Writes a pallet and fans its points out across every race active at the
   * pallet's timestamp. Shared by the history generator and the live batches so
   * the seeded ledger follows exactly the same rule as production.
   */
  const writePallet = async (params: {
    batchId: string;
    product: Product;
    size: PalletSize | null;
    cartons: number;
    at: number;
    workerIds: string[];
  }): Promise<{ pallet: PalletLog; awardCount: number; raceCount: number }> => {
    const timestamp = new Date(params.at).toISOString();
    const baseSplit = splitPoints(params.cartons, params.product.pointValue, params.workerIds);

    const pallet: PalletLog = {
      id: newId(),
      batchId: params.batchId,
      productId: params.product.id,
      palletSizeId: params.size?.id ?? null,
      cartons: params.cartons,
      pointValue: params.product.pointValue,
      totalPoints: baseSplit.totalPoints,
      note: null,
      createdAt: timestamp,
    };

    const races = racesScoringAt(params.at, allRaces);
    const awards: PointAward[] = [];

    for (const race of races) {
      const pointValue = effectivePointValue(params.product, race.id);
      const split = splitPoints(params.cartons, pointValue, params.workerIds);
      for (const award of split.awards) {
        awards.push({
          id: newId(),
          batchId: params.batchId,
          palletLogId: pallet.id,
          raceId: race.id,
          workerId: award.workerId,
          points: award.points,
          createdAt: timestamp,
        });
      }
    }

    await repository.insertPalletWithAwards({ pallet, awards });

    return { pallet, awardCount: awards.length, raceCount: races.length };
  };

  /* ------------------------------------------------------- batch generator */

  let batchCount = 0;
  let completedCount = 0;
  let palletCount = 0;
  let awardCount = 0;
  let pauseCount = 0;

  interface BatchPlan {
    /** Days before today. 0 = today. */
    dayOffset: number;
    lineId: string;
    /** Slot within the day, used to spread today's batches across the morning. */
    slot: number;
  }

  const plan: BatchPlan[] = [];

  // Two weeks of history across the lines.
  for (let day = DAYS_OF_HISTORY; day >= 1; day -= 1) {
    for (let slot = 0; slot < COMPLETED_BATCHES_PER_DAY; slot += 1) {
      plan.push({ dayOffset: day, lineId: lines[slot % lines.length].id, slot });
    }
  }

  // Archive for the previous race — sits entirely inside its -30d..-17d window.
  for (let day = 0; day < 8; day += 1) {
    for (let slot = 0; slot < 2; slot += 1) {
      plan.push({ dayOffset: 25 - day, lineId: lines[slot % lines.length].id, slot });
    }
  }

  // Today's completed production, so the daily screen has real content.
  for (let slot = 0; slot < TODAY_COMPLETED_BATCHES; slot += 1) {
    plan.push({ dayOffset: 0, lineId: lines[slot % lines.length].id, slot });
  }

  for (const item of plan) {
    const product = products[Math.floor(random() * products.length)];
    const productSizes = palletSizes.filter((size) => size.productId === product.id);

    const startedAt = new Date(now.getTime() - item.dayOffset * 86400000);
    if (item.dayOffset === 0) {
      // Today: spread the completed batches across the morning, always in the
      // past, so the day looks genuinely half-elapsed.
      const earliestHour = 6;
      const latestHour = Math.max(earliestHour + 1, now.getHours() - 1);
      const span = Math.max(1, latestHour - earliestHour);
      const hour = earliestHour + Math.min(span - 1, item.slot * Math.ceil(span / TODAY_COMPLETED_BATCHES));
      startedAt.setHours(hour, Math.floor(random() * 50), 0, 0);
    } else {
      startedAt.setHours(6 + Math.floor(random() * 8), Math.floor(random() * 60), 0, 0);
    }

    const durationMinutes = 90 + Math.floor(random() * 240);
    const finishedAt = new Date(startedAt.getTime() + durationMinutes * 60000);

    // Never generate history that runs into the future.
    if (finishedAt.getTime() > now.getTime()) continue;

    const batchId = newId();

    const shuffled = [...workers].sort(() => random() - 0.5);
    const crewSize = 2 + Math.floor(random() * 4);
    const crew = shuffled.slice(0, crewSize);

    const batchMembers: BatchMember[] = crew.map((worker, index) => {
      const joinedOffsetMinutes =
        index === crew.length - 1 && crewSize > 3 ? Math.floor(durationMinutes * 0.25) : 0;
      return {
        id: newId(),
        batchId,
        workerId: worker.id,
        joinedAt: new Date(startedAt.getTime() + joinedOffsetMinutes * 60000).toISOString(),
        leftAt: null,
      };
    });

    if (crewSize >= 4 && random() > 0.55) {
      const leaver = batchMembers[1];
      leaver.leftAt = new Date(startedAt.getTime() + Math.floor(durationMinutes * 0.6) * 60000).toISOString();
    }

    const pauseTotal = 1 + Math.floor(random() * 3);
    const batchPauses: PauseLog[] = [];
    let pauseCursor = startedAt.getTime() + Math.floor(durationMinutes * 0.15) * 60000;

    for (let index = 0; index < pauseTotal; index += 1) {
      const pauseMinutes = 5 + Math.floor(random() * 40);
      const pauseStart = pauseCursor;
      const pauseEnd = pauseStart + pauseMinutes * 60000;
      if (pauseEnd > finishedAt.getTime()) break;

      const reasonCode = PAUSE_REASON_CODES[Math.floor(random() * (PAUSE_REASON_CODES.length - 1))];
      batchPauses.push({
        id: newId(),
        batchId,
        reasonCode,
        reasonLabel: null,
        startedAt: new Date(pauseStart).toISOString(),
        endedAt: new Date(pauseEnd).toISOString(),
        durationSeconds: Math.round(pauseMinutes * 60),
      });

      pauseCursor = pauseEnd + Math.floor(durationMinutes * 0.2) * 60000;
    }

    const batch: Batch = {
      id: batchId,
      lineId: item.lineId,
      productId: product.id,
      startedAt: startedAt.toISOString(),
      finishedAt: finishedAt.toISOString(),
      totalElapsedSeconds: Math.round((finishedAt.getTime() - startedAt.getTime()) / 1000),
      activeSeconds: Math.max(
        0,
        Math.round((finishedAt.getTime() - startedAt.getTime()) / 1000) -
          batchPauses.reduce((sum, pause) => sum + (pause.durationSeconds ?? 0), 0),
      ),
      pausedSeconds: batchPauses.reduce((sum, pause) => sum + (pause.durationSeconds ?? 0), 0),
      totalCartons: null,
      totalPoints: null,
      status: 'COMPLETED',
      notes: null,
      createdAt: startedAt.toISOString(),
    };

    await repository.insertBatch(batch);
    for (const member of batchMembers) await repository.insertBatchMember(member);
    for (const pause of batchPauses) await repository.insertPauseLog(pause);

    const palletTotal = 6 + Math.floor(random() * 22);
    const stepMs = (finishedAt.getTime() - startedAt.getTime()) / (palletTotal + 1);
    let batchCartons = 0;
    let batchPoints = 0;
    let batchPalletCount = 0;

    for (let index = 0; index < palletTotal; index += 1) {
      const at = startedAt.getTime() + stepMs * (index + 1);
      const size = productSizes[Math.floor(random() * productSizes.length)];
      const cartons = size ? size.cartons : product.cartonsPerLayout;

      const present = batchMembers.filter(
        (member) =>
          ms(member.joinedAt) <= at && (member.leftAt === null || ms(member.leftAt) > at),
      );
      if (present.length === 0) continue;

      const written = await writePallet({
        batchId,
        product,
        size: size ?? null,
        cartons,
        at,
        workerIds: present.map((member) => member.workerId),
      });

      batchCartons += cartons;
      batchPoints += written.pallet.totalPoints;
      batchPalletCount += 1;
      palletCount += 1;
      awardCount += written.awardCount;
    }

    if (batchPalletCount === 0) {
      await repository.deleteBatch(batch.id);
      continue;
    }

    await repository.updateBatch(batch.id, {
      totalCartons: batchCartons,
      totalPoints: roundPoints(batchPoints),
    });

    batchCount += 1;
    completedCount += 1;
    pauseCount += batchPauses.length;
  }

  /* ------------------------------------------- two batches running right now */

  // Line A — the monthly + sprint races both apply.
  const runningProduct = products[1] ?? products[0];
  const runningSizes = palletSizes.filter((size) => size.productId === runningProduct.id);
  const runningStartedAt = new Date(now.getTime() - 47 * 60000);
  const runningBatchId = newId();
  const runningCrew = workers.slice(0, 3);

  await repository.insertBatch({
    id: runningBatchId,
    lineId: lines[0].id,
    productId: runningProduct.id,
    startedAt: runningStartedAt.toISOString(),
    finishedAt: null,
    totalElapsedSeconds: null,
    activeSeconds: null,
    pausedSeconds: null,
    totalCartons: null,
    totalPoints: null,
    status: 'ACTIVE',
    notes: 'אצווה פעילה — נטענה אוטומטית עם נתוני ההדגמה',
    createdAt: runningStartedAt.toISOString(),
  });

  for (const worker of runningCrew) {
    await repository.insertBatchMember({
      id: newId(),
      batchId: runningBatchId,
      workerId: worker.id,
      joinedAt: runningStartedAt.toISOString(),
      leftAt: null,
    });
  }

  await repository.insertPauseLog({
    id: newId(),
    batchId: runningBatchId,
    reasonCode: 'CHANGEOVER_CLEANING',
    reasonLabel: null,
    startedAt: new Date(runningStartedAt.getTime() + 12 * 60000).toISOString(),
    endedAt: new Date(runningStartedAt.getTime() + 21 * 60000).toISOString(),
    durationSeconds: 9 * 60,
  });
  pauseCount += 1;

  for (let index = 0; index < 5; index += 1) {
    const size = runningSizes[index % Math.max(1, runningSizes.length)];
    const written = await writePallet({
      batchId: runningBatchId,
      product: runningProduct,
      size: size ?? null,
      cartons: size ? size.cartons : runningProduct.cartonsPerLayout,
      at: runningStartedAt.getTime() + (index + 1) * 7 * 60000,
      workerIds: runningCrew.map((worker) => worker.id),
    });
    palletCount += 1;
    awardCount += written.awardCount;
  }
  batchCount += 1;

  // Line C — a second concurrent batch on a different product.
  const secondProduct = products[3] ?? products[0];
  const secondSizes = palletSizes.filter((size) => size.productId === secondProduct.id);
  const secondStartedAt = new Date(now.getTime() - 26 * 60000);
  const secondBatchId = newId();
  const secondCrew = workers.slice(4, 6);

  await repository.insertBatch({
    id: secondBatchId,
    lineId: lines[2].id,
    productId: secondProduct.id,
    startedAt: secondStartedAt.toISOString(),
    finishedAt: null,
    totalElapsedSeconds: null,
    activeSeconds: null,
    pausedSeconds: null,
    totalCartons: null,
    totalPoints: null,
    status: 'ACTIVE',
    notes: 'אצווה פעילה בקו 3',
    createdAt: secondStartedAt.toISOString(),
  });

  for (const worker of secondCrew) {
    await repository.insertBatchMember({
      id: newId(),
      batchId: secondBatchId,
      workerId: worker.id,
      joinedAt: secondStartedAt.toISOString(),
      leftAt: null,
    });
  }

  for (let index = 0; index < 3; index += 1) {
    const size = secondSizes[index % Math.max(1, secondSizes.length)];
    const written = await writePallet({
      batchId: secondBatchId,
      product: secondProduct,
      size: size ?? null,
      cartons: size ? size.cartons : secondProduct.cartonsPerLayout,
      at: secondStartedAt.getTime() + (index + 1) * 7 * 60000,
      workerIds: secondCrew.map((worker) => worker.id),
    });
    palletCount += 1;
    awardCount += written.awardCount;
  }
  batchCount += 1;

  /**
   * How many award rows exist beyond one-per-pallet-worker: the fan-out itself.
   *
   * Computed from a single ledger read — grouping by (pallet, worker) and
   * counting the surplus. Avoids an N+1 walk over every batch's membership.
   */
  const awardRowsPerPalletWorker = new Map<string, number>();
  for (const award of await repository.listPointAwards({ limit: 1000000 })) {
    const key = `${award.palletLogId}:${award.workerId}`;
    awardRowsPerPalletWorker.set(key, (awardRowsPerPalletWorker.get(key) ?? 0) + 1);
  }

  let concurrentAwards = 0;
  for (const rowCount of awardRowsPerPalletWorker.values()) {
    concurrentAwards += Math.max(0, rowCount - 1);
  }

  return {
    workers: workers.length,
    lines: lines.length,
    products: products.length,
    palletSizes: palletSizes.length,
    races: allRaces.length,
    activeRaces: 2,
    raceProductPoints: raceProductPoints.length,
    batches: batchCount,
    completedBatches: completedCount,
    palletLogs: palletCount,
    pointAwards: awardCount,
    pauseLogs: pauseCount,
    settings: 5,
    concurrentAwards,
  };
}

/* -------------------------------------------------------------------------- */
/*  Ledger verification                                                       */
/* -------------------------------------------------------------------------- */

export interface LedgerVerification {
  ok: boolean;
  /** Award rows whose race was not open when the pallet was logged. */
  attributionErrors: number;
  /**
   * Pallets that scored in fewer races than were open at their timestamp — i.e.
   * a fan-out row that was never written. This is the check that catches a
   * silently missing attribution, which the value reconciliation below cannot:
   * it derives its pallet set from the awards themselves.
   */
  missingFanOut: number;
  perRace: Array<{
    raceId: string;
    raceName: string;
    expected: number;
    actual: number;
    delta: number;
  }>;
}

/**
 * Verifies the fan-out ledger. Three independent checks:
 *
 *  1. **Attribution** — every award's race must have been open at the moment its
 *     pallet was logged.
 *  2. **Completeness** — every pallet must have scored in *every* race that was
 *     open when it was logged. Catches a missing fan-out row.
 *  3. **Value** — for each race, the sum of its awards must equal the sum of
 *     `cartons × (that race's effective multiplier)` over the pallets it holds.
 *     Catches a wrong multiplier.
 */
export function verifySeedLedger(input: {
  pallets: PalletLog[];
  awards: PointAward[];
  races: Race[];
  raceProductPoints: RaceProductPoint[];
  products: Product[];
}): LedgerVerification {
  const { pallets, awards, races, raceProductPoints, products } = input;

  const palletById = new Map(pallets.map((pallet) => [pallet.id, pallet]));
  const raceById = new Map(races.map((race) => [race.id, race]));
  const productById = new Map(products.map((product) => [product.id, product]));

  const isOpenAt = (race: Race, at: number): boolean =>
    new Date(race.startAt).getTime() <= at &&
    (race.endAt === null || new Date(race.endAt).getTime() > at);

  const effectivePointValue = (raceId: string, productId: string): number => {
    const override = raceProductPoints.find(
      (row) => row.raceId === raceId && row.productId === productId,
    );
    if (override) return override.pointValue;
    return productById.get(productId)?.pointValue ?? 0;
  };

  // 1. Attribution
  let attributionErrors = 0;
  for (const award of awards) {
    const pallet = palletById.get(award.palletLogId);
    const race = raceById.get(award.raceId);
    if (!pallet || !race || !isOpenAt(race, new Date(pallet.createdAt).getTime())) {
      attributionErrors += 1;
    }
  }

  // 2. Completeness — every pallet scored in every race that was open.
  const raceIdsByPallet = new Map<string, Set<string>>();
  for (const award of awards) {
    const set = raceIdsByPallet.get(award.palletLogId) ?? new Set<string>();
    set.add(award.raceId);
    raceIdsByPallet.set(award.palletLogId, set);
  }

  let missingFanOut = 0;
  for (const pallet of pallets) {
    const at = new Date(pallet.createdAt).getTime();
    const openRaces = races.filter((race) => isOpenAt(race, at));
    const scored = raceIdsByPallet.get(pallet.id) ?? new Set<string>();
    if (scored.size !== openRaces.length) missingFanOut += 1;
  }

  // 3. Value
  const perRace = races.map((race) => {
    const raceAwards = awards.filter((award) => award.raceId === race.id);
    const actual = roundPoints(raceAwards.reduce((sum, award) => sum + award.points, 0));

    const palletIds = [...new Set(raceAwards.map((award) => award.palletLogId))];
    const expected = roundPoints(
      palletIds.reduce((sum, palletId) => {
        const pallet = palletById.get(palletId);
        if (!pallet) return sum;
        return sum + computePalletPoints(pallet.cartons, effectivePointValue(race.id, pallet.productId));
      }, 0),
    );

    return {
      raceId: race.id,
      raceName: race.name,
      expected,
      actual,
      delta: roundPoints(expected - actual),
    };
  });

  return {
    ok:
      attributionErrors === 0 &&
      missingFanOut === 0 &&
      perRace.every((entry) => Math.abs(entry.delta) < 0.01),
    attributionErrors,
    missingFanOut,
    perRace,
  };
}

export { computePalletPoints };
