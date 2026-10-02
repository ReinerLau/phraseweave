import type { ExerciseResponse, ExercisesResponse } from "~/api/exercise";
import { isLocalPackage } from "~/services/generatorClient";
import { scopedStorageName } from "~/utils/storageScope";

const DATABASE_NAME = "phraseweave-local";
const DATABASE_VERSION = 1;
const PACK_STORE = "coursePacks";
const CATALOG_STORE = "coursePackCatalog";
const META_STORE = "metadata";
const MIGRATION_KEY = "phraseweave-shared-data-migrated-v1";

interface StoredMetadata {
  key: string;
  value: unknown;
}

let databasePromise: Promise<IDBDatabase> | undefined;
let migrationPromise: Promise<void> | undefined;

interface LexicalChunksStatementV4 {
  english: string;
  context_before: string;
  context_after: string;
  sentence_chinese: string;
  unit_id: string;
  source_unit_ids: [] | [string] | [string, string];
}

interface LexicalChunksBackup {
  schema_version: 4;
  statements: LexicalChunksStatementV4[];
}

export interface ExerciseImportOptions {
  title?: string;
  idFactory?: () => string;
}

function isSupported() {
  return typeof window !== "undefined" && "indexedDB" in window;
}

function usesSharedStorage() {
  return typeof window !== "undefined" && isLocalPackage();
}

function openDatabase(): Promise<IDBDatabase> {
  if (!isSupported()) {
    return Promise.reject(new Error("IndexedDB is not available"));
  }

  if (databasePromise) {
    return databasePromise;
  }

  databasePromise = new Promise((resolve, reject) => {
    const request = window.indexedDB.open(scopedStorageName(DATABASE_NAME), DATABASE_VERSION);

    request.onerror = () => reject(request.error ?? new Error("Unable to open local database"));
    request.onsuccess = () => resolve(request.result);
    request.onupgradeneeded = () => {
      const database = request.result;

      if (!database.objectStoreNames.contains(PACK_STORE)) {
        database.createObjectStore(PACK_STORE, { keyPath: "id" });
      }

      if (!database.objectStoreNames.contains(CATALOG_STORE)) {
        database.createObjectStore(CATALOG_STORE, { keyPath: "id" });
      }

      if (!database.objectStoreNames.contains(META_STORE)) {
        database.createObjectStore(META_STORE, { keyPath: "key" });
      }
    };
  });

  return databasePromise;
}

function requestResult<T>(request: IDBRequest<T>) {
  return new Promise<T>((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("IndexedDB request failed"));
  });
}

async function localRequest<T>(path: string, method = "GET", body?: unknown): Promise<T> {
  const response = await fetch(path, {
    method,
    headers: body === undefined ? undefined : { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const result = (await response.json()) as T & { error?: string };
  if (!response.ok)
    throw new Error(result.error || `Local storage request failed (${response.status}).`);
  return result;
}

async function readLegacyData() {
  const empty = { coursePacks: [] as ExerciseResponse[], catalog: [] as ExercisesResponse };
  if (!isSupported()) return empty;
  const databaseName = scopedStorageName(DATABASE_NAME);
  const indexedDbFactory = window.indexedDB as IDBFactory & {
    databases?: () => Promise<Array<{ name?: string }>>;
  };
  const knownDatabases = await indexedDbFactory.databases?.();
  if (knownDatabases && !knownDatabases.some((database) => database.name === databaseName)) {
    return empty;
  }

  const database = await new Promise<IDBDatabase | undefined>((resolve, reject) => {
    const request = window.indexedDB.open(databaseName);
    request.onupgradeneeded = () => request.transaction?.abort();
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => {
      if (request.error?.name === "AbortError") resolve(undefined);
      else reject(request.error ?? new Error("Unable to read the previous local database."));
    };
  });
  if (!database) return empty;

  try {
    const stores = [PACK_STORE, CATALOG_STORE].filter((name) =>
      database.objectStoreNames.contains(name),
    );
    if (!stores.length) return empty;
    const transaction = database.transaction(stores, "readonly");
    const coursePacksRequest = database.objectStoreNames.contains(PACK_STORE)
      ? (transaction.objectStore(PACK_STORE).getAll() as IDBRequest<ExerciseResponse[]>)
      : undefined;
    const catalogRequest = database.objectStoreNames.contains(CATALOG_STORE)
      ? (transaction.objectStore(CATALOG_STORE).getAll() as IDBRequest<ExercisesResponse>)
      : undefined;
    const [coursePacks, catalog] = await Promise.all([
      coursePacksRequest ? requestResult(coursePacksRequest) : Promise.resolve([]),
      catalogRequest ? requestResult(catalogRequest) : Promise.resolve([]),
    ]);
    return { coursePacks, catalog };
  } finally {
    database.close();
  }
}

function migrateLegacyData() {
  if (!usesSharedStorage()) return Promise.resolve();
  if (migrationPromise) return migrationPromise;
  migrationPromise = (async () => {
    const marker = scopedStorageName(MIGRATION_KEY);
    if (typeof window !== "undefined" && window.localStorage.getItem(marker) === "1") return;
    const legacy = await readLegacyData();
    if (legacy.coursePacks.length || legacy.catalog.length) {
      await localRequest("/api/local-exercises/migrate", "POST", legacy);
    }
    if (typeof window !== "undefined") window.localStorage.setItem(marker, "1");
  })().catch((error) => {
    migrationPromise = undefined;
    throw error;
  });
  return migrationPromise;
}

export async function getLocalExercise(coursePackId: string) {
  if (typeof window === "undefined") return undefined;
  if (!usesSharedStorage()) {
    if (!isSupported()) return undefined;
    const database = await openDatabase();
    const transaction = database.transaction(PACK_STORE, "readonly");
    return requestResult<ExerciseResponse | undefined>(
      transaction.objectStore(PACK_STORE).get(coursePackId),
    );
  }
  await migrateLegacyData();
  const result = await localRequest<{ item?: ExerciseResponse }>(
    `/api/local-exercises/${encodeURIComponent(coursePackId)}`,
  );
  return result.item;
}

export async function listLocalExercises() {
  if (typeof window === "undefined") return [] as ExercisesResponse;
  if (!usesSharedStorage()) {
    if (!isSupported()) return [] as ExercisesResponse;
    const database = await openDatabase();
    const transaction = database.transaction(CATALOG_STORE, "readonly");
    return requestResult<ExercisesResponse>(transaction.objectStore(CATALOG_STORE).getAll());
  }
  await migrateLegacyData();
  const result = await localRequest<{ items: ExercisesResponse }>("/api/local-exercise-catalog");
  return result.items;
}

export async function saveLocalExercise(coursePack: ExerciseResponse) {
  if (typeof window === "undefined") return;
  if (!usesSharedStorage()) {
    if (!isSupported()) return;
    const database = await openDatabase();
    const transaction = database.transaction([PACK_STORE, CATALOG_STORE], "readwrite");
    transaction.objectStore(PACK_STORE).put(coursePack);
    transaction.objectStore(CATALOG_STORE).put({
      id: coursePack.id,
      title: coursePack.title,
      description: coursePack.description,
      isFree: coursePack.isFree,
      cover: coursePack.cover,
    });
    await transactionComplete(transaction);
    return;
  }
  await migrateLegacyData();
  await localRequest(`/api/local-exercises/${encodeURIComponent(coursePack.id)}`, "PUT", {
    coursePack,
  });
}

export async function saveLocalExerciseProgress(
  coursePackId: string,
  courseId: string,
  statementIndex: number,
) {
  if (typeof window === "undefined") return;
  if (!usesSharedStorage()) {
    if (!isSupported()) return;
    const database = await openDatabase();
    const transaction = database.transaction(PACK_STORE, "readwrite");
    const transactionDone = transactionComplete(transaction);
    const store = transaction.objectStore(PACK_STORE);
    const request = store.get(coursePackId);
    request.onsuccess = () => {
      const coursePack = request.result as ExerciseResponse | undefined;
      const course = coursePack?.courses.find((item) => item.id === courseId);
      if (!coursePack || !course) return;
      course.statementIndex = statementIndex;
      store.put(coursePack);
    };
    await transactionDone;
    return;
  }
  await migrateLegacyData();
  await localRequest(`/api/local-exercises/${encodeURIComponent(coursePackId)}/progress`, "PUT", {
    courseId,
    statementIndex,
  });
}

export async function saveLocalExerciseUnitPassed(
  coursePackId: string,
  courseId: string,
  unitKey: string,
) {
  if (typeof window === "undefined") return;
  if (!usesSharedStorage()) {
    if (!isSupported()) return;
    const database = await openDatabase();
    const transaction = database.transaction(PACK_STORE, "readwrite");
    const transactionDone = transactionComplete(transaction);
    const store = transaction.objectStore(PACK_STORE);
    const request = store.get(coursePackId);
    request.onsuccess = () => {
      const coursePack = request.result as ExerciseResponse | undefined;
      const course = coursePack?.courses.find((item) => item.id === courseId);
      if (!coursePack || !course || course.passedUnitIds?.includes(unitKey)) return;
      course.passedUnitIds = [...(course.passedUnitIds ?? []), unitKey];
      store.put(coursePack);
    };
    await transactionDone;
    return;
  }
  await migrateLegacyData();
  await localRequest(
    `/api/local-exercises/${encodeURIComponent(coursePackId)}/passed-units`,
    "PUT",
    {
      courseId,
      unitKey,
    },
  );
}

export async function deleteLocalExercise(coursePackId: string) {
  if (typeof window === "undefined") return;
  if (!usesSharedStorage()) {
    if (!isSupported()) return;
    const database = await openDatabase();
    const transaction = database.transaction([PACK_STORE, CATALOG_STORE], "readwrite");
    transaction.objectStore(PACK_STORE).delete(coursePackId);
    transaction.objectStore(CATALOG_STORE).delete(coursePackId);
    await transactionComplete(transaction);
    return;
  }
  await migrateLegacyData();
  await localRequest(`/api/local-exercises/${encodeURIComponent(coursePackId)}`, "DELETE");
}

export async function saveLocalExerciseCatalog(coursePacks: ExercisesResponse) {
  if (typeof window === "undefined") return;
  if (!usesSharedStorage()) {
    if (!isSupported()) return;
    const database = await openDatabase();
    const transaction = database.transaction(CATALOG_STORE, "readwrite");
    const store = transaction.objectStore(CATALOG_STORE);
    coursePacks.forEach((coursePack) => store.put(coursePack));
    await transactionComplete(transaction);
    return;
  }
  await migrateLegacyData();
  await localRequest("/api/local-exercise-catalog", "PUT", { items: coursePacks });
}

export async function exportLocalExercises() {
  if (typeof window === "undefined") return [] as ExerciseResponse[];
  if (!usesSharedStorage()) {
    if (!isSupported()) return [] as ExerciseResponse[];
    const database = await openDatabase();
    const transaction = database.transaction(PACK_STORE, "readonly");
    return requestResult<ExerciseResponse[]>(transaction.objectStore(PACK_STORE).getAll());
  }
  await migrateLegacyData();
  const result = await localRequest<{ items: ExerciseResponse[] }>("/api/local-exercises");
  return result.items;
}

export function normalizeExerciseImport(
  value: unknown,
  options: ExerciseImportOptions = {},
): ExerciseResponse[] {
  if (Array.isArray(value)) {
    const coursePacks = value.filter(isExerciseResponse);
    if (coursePacks.length !== value.length) throw new Error("旧版练习请重新生成后导入");
    return coursePacks;
  }

  if (!isLexicalChunksBackup(value)) throw new Error("旧版练习请重新生成后导入");
  if (!value.statements.every(isLexicalChunksStatementV4)) {
    throw new Error("备份文件包含无效练习");
  }
  if (!hasValidSources(value.statements)) {
    throw new Error("备份文件包含无效单元关系");
  }

  const idFactory = options.idFactory ?? createImportId;
  const coursePackId = idFactory();
  const courseId = idFactory();
  const exerciseTitle = options.title || createImportTitle();
  const statements = value.statements.map((statement, index) => ({
    id: idFactory(),
    order: index + 1,
    english: statement.english,
    contextBefore: statement.context_before,
    contextAfter: statement.context_after,
    sentenceChinese: statement.sentence_chinese,
    unitId: statement.unit_id,
    sourceUnitIds: statement.source_unit_ids,
  }));

  return [
    {
      id: coursePackId,
      title: exerciseTitle,
      description: "",
      isFree: true,
      cover: "",
      courses: [
        {
          id: courseId,
          title: exerciseTitle,
          order: 1,
          coursePackId,
          completionCount: 0,
          statementIndex: 0,
          passedUnitIds: [],
          statements,
        },
      ],
    },
  ];
}

export async function importLocalExercises(value: unknown, options: ExerciseImportOptions = {}) {
  const coursePacks = normalizeExerciseImport(value, options);

  for (const coursePack of coursePacks) {
    await saveLocalExercise(coursePack);
  }
  return coursePacks.length;
}

export async function setLocalMetadata(key: string, value: unknown) {
  if (!isSupported()) return;

  const database = await openDatabase();
  const transaction = database.transaction(META_STORE, "readwrite");
  transaction.objectStore(META_STORE).put({ key, value } satisfies StoredMetadata);
  await transactionComplete(transaction);
}

function transactionComplete(transaction: IDBTransaction) {
  return new Promise<void>((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onerror = () =>
      reject(transaction.error ?? new Error("IndexedDB transaction failed"));
    transaction.onabort = () =>
      reject(transaction.error ?? new Error("IndexedDB transaction aborted"));
  });
}

function isExerciseResponse(value: unknown): value is ExerciseResponse {
  if (!value || typeof value !== "object") return false;
  const coursePack = value as Partial<ExerciseResponse>;
  return (
    typeof coursePack.id === "string" &&
    typeof coursePack.title === "string" &&
    Array.isArray(coursePack.courses) &&
    coursePack.courses.every(
      (course) =>
        course !== null &&
        typeof course === "object" &&
        Array.isArray(course.statements) &&
        course.statements.every(
          (statement) =>
            statement !== null &&
            typeof statement === "object" &&
            typeof statement.english === "string" &&
            statement.english.trim().length > 0 &&
            typeof statement.contextBefore === "string" &&
            typeof statement.contextAfter === "string" &&
            typeof statement.sentenceChinese === "string" &&
            statement.sentenceChinese.trim().length > 0,
        ),
    )
  );
}

function isLexicalChunksBackup(value: unknown): value is LexicalChunksBackup {
  if (!value || typeof value !== "object") return false;
  const backup = value as Partial<LexicalChunksBackup>;
  return (
    backup.schema_version === 4 && Array.isArray(backup.statements) && backup.statements.length > 0
  );
}

function isLexicalChunksStatementV4(value: unknown): value is LexicalChunksStatementV4 {
  if (!value || typeof value !== "object") return false;
  const statement = value as Partial<LexicalChunksStatementV4>;
  return (
    typeof statement.english === "string" &&
    statement.english.length > 0 &&
    typeof statement.context_before === "string" &&
    typeof statement.context_after === "string" &&
    typeof statement.sentence_chinese === "string" &&
    statement.sentence_chinese.trim().length > 0 &&
    typeof statement.unit_id === "string" &&
    statement.unit_id.length > 0 &&
    Array.isArray(statement.source_unit_ids) &&
    [0, 1, 2].includes(statement.source_unit_ids.length) &&
    statement.source_unit_ids.every((id) => typeof id === "string" && id.length > 0)
  );
}

function hasValidSources(statements: LexicalChunksStatementV4[]): boolean {
  const firstById = new Map<string, number>();
  const canonical = new Map<string, LexicalChunksStatementV4>();
  statements.forEach((statement, index) => {
    if (!firstById.has(statement.unit_id)) {
      firstById.set(statement.unit_id, index);
      canonical.set(statement.unit_id, statement);
    }
  });
  return statements.every((statement) => {
    const first = canonical.get(statement.unit_id)!;
    const sameUnit =
      statement.english === first.english &&
      statement.context_before === first.context_before &&
      statement.context_after === first.context_after &&
      statement.sentence_chinese === first.sentence_chinese &&
      JSON.stringify(statement.source_unit_ids) === JSON.stringify(first.source_unit_ids);
    const sources = statement.source_unit_ids;
    const sourceOrderValid =
      new Set(sources).size === sources.length &&
      sources.every((id) => (firstById.get(id) ?? Infinity) < firstById.get(statement.unit_id)!);
    return sameUnit && sourceOrderValid;
  });
}

function createImportId() {
  if (typeof globalThis.crypto?.randomUUID === "function") {
    return globalThis.crypto.randomUUID();
  }

  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
}

function createImportTitle(date = new Date()) {
  const pad = (value: number) => String(value).padStart(2, "0");
  return [
    date.getFullYear(),
    pad(date.getMonth() + 1),
    pad(date.getDate()),
    pad(date.getHours()),
    pad(date.getMinutes()),
  ].join("");
}
