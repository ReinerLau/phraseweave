import type { ExerciseResponse, ExercisesResponse } from "~/api/exercise";
import { scopedStorageName } from "~/utils/storageScope";

const DATABASE_NAME = "phraseweave-local";
const DATABASE_VERSION = 1;
const PACK_STORE = "coursePacks";
const CATALOG_STORE = "coursePackCatalog";
const META_STORE = "metadata";

interface StoredMetadata {
  key: string;
  value: unknown;
}

let databasePromise: Promise<IDBDatabase> | undefined;

interface LexicalChunksStatement {
  chinese: string;
  english: string;
  soundmark: string;
}

interface LexicalChunksBackupV1 {
  schema_version: 1;
  statements: LexicalChunksStatement[];
}

interface LexicalChunksStatementV2 extends LexicalChunksStatement {
  unit_id: string;
  source_unit_ids: [] | [string, string];
}

interface LexicalChunksBackupV2 {
  schema_version: 2;
  statements: LexicalChunksStatementV2[];
}

type LexicalChunksBackup = LexicalChunksBackupV1 | LexicalChunksBackupV2;

export interface ExerciseImportOptions {
  title?: string;
  idFactory?: () => string;
}

function isSupported() {
  return typeof window !== "undefined" && "indexedDB" in window;
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

export async function getLocalExercise(coursePackId: string) {
  if (!isSupported()) return undefined;

  const database = await openDatabase();
  const transaction = database.transaction(PACK_STORE, "readonly");
  return requestResult<ExerciseResponse | undefined>(
    transaction.objectStore(PACK_STORE).get(coursePackId),
  );
}

export async function listLocalExercises() {
  if (!isSupported()) return [] as ExercisesResponse;

  const database = await openDatabase();
  const transaction = database.transaction(CATALOG_STORE, "readonly");
  return requestResult<ExercisesResponse>(transaction.objectStore(CATALOG_STORE).getAll());
}

export async function saveLocalExercise(coursePack: ExerciseResponse) {
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
}

export async function saveLocalExerciseProgress(
  coursePackId: string,
  courseId: string,
  statementIndex: number,
) {
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
}

export async function deleteLocalExercise(coursePackId: string) {
  if (!isSupported()) return;

  const database = await openDatabase();
  const transaction = database.transaction([PACK_STORE, CATALOG_STORE], "readwrite");
  transaction.objectStore(PACK_STORE).delete(coursePackId);
  transaction.objectStore(CATALOG_STORE).delete(coursePackId);
  await transactionComplete(transaction);
}

export async function saveLocalExerciseCatalog(coursePacks: ExercisesResponse) {
  if (!isSupported()) return;

  const database = await openDatabase();
  const transaction = database.transaction(CATALOG_STORE, "readwrite");
  const store = transaction.objectStore(CATALOG_STORE);
  coursePacks.forEach((coursePack) => store.put(coursePack));
  await transactionComplete(transaction);
}

export async function exportLocalExercises() {
  if (!isSupported()) return [] as ExerciseResponse[];

  const database = await openDatabase();
  const transaction = database.transaction(PACK_STORE, "readonly");
  return requestResult<ExerciseResponse[]>(transaction.objectStore(PACK_STORE).getAll());
}

export function normalizeExerciseImport(
  value: unknown,
  options: ExerciseImportOptions = {},
): ExerciseResponse[] {
  if (Array.isArray(value)) {
    const coursePacks = value.filter(isExerciseResponse);
    if (coursePacks.length !== value.length) throw new Error("备份文件包含无效练习");
    return coursePacks;
  }

  if (!isLexicalChunksBackup(value)) throw new Error("备份文件格式不正确");
  if (
    !value.statements.every(
      value.schema_version === 2 ? isLexicalChunksStatementV2 : isLexicalChunksStatement,
    )
  ) {
    throw new Error("备份文件包含无效练习");
  }
  if (value.schema_version === 2 && !hasValidSources(value.statements)) {
    throw new Error("备份文件包含无效单元关系");
  }

  const idFactory = options.idFactory ?? createImportId;
  const coursePackId = idFactory();
  const exerciseTitle = options.title || createImportTitle();

  return [
    {
      id: coursePackId,
      title: exerciseTitle,
      description: "",
      isFree: true,
      cover: "",
      courses: [
        {
          id: idFactory(),
          title: exerciseTitle,
          order: 1,
          coursePackId,
          completionCount: 0,
          statementIndex: 0,
          statements: value.statements.map((statement, index) => ({
            id: idFactory(),
            order: index + 1,
            chinese: statement.chinese,
            english: statement.english,
            soundmark: statement.soundmark,
            ...(value.schema_version === 2
              ? {
                  unitId: (statement as LexicalChunksStatementV2).unit_id,
                  sourceUnitIds: (statement as LexicalChunksStatementV2).source_unit_ids,
                }
              : {}),
          })),
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
    Array.isArray(coursePack.courses)
  );
}

function isLexicalChunksBackup(value: unknown): value is LexicalChunksBackup {
  if (!value || typeof value !== "object") return false;
  const backup = value as Partial<LexicalChunksBackup>;
  return (
    (backup.schema_version === 1 || backup.schema_version === 2) && Array.isArray(backup.statements)
  );
}

function isLexicalChunksStatement(value: unknown): value is LexicalChunksStatement {
  if (!value || typeof value !== "object") return false;
  const statement = value as Partial<LexicalChunksStatement>;
  return (
    typeof statement.chinese === "string" &&
    typeof statement.english === "string" &&
    typeof statement.soundmark === "string"
  );
}

function isLexicalChunksStatementV2(value: unknown): value is LexicalChunksStatementV2 {
  if (!isLexicalChunksStatement(value)) return false;
  const statement = value as Partial<LexicalChunksStatementV2>;
  return (
    typeof statement.unit_id === "string" &&
    statement.unit_id.length > 0 &&
    Array.isArray(statement.source_unit_ids) &&
    (statement.source_unit_ids.length === 0 || statement.source_unit_ids.length === 2) &&
    statement.source_unit_ids.every((id) => typeof id === "string" && id.length > 0)
  );
}

function hasValidSources(statements: LexicalChunksStatementV2[]): boolean {
  const firstById = new Map<string, number>();
  const canonical = new Map<string, LexicalChunksStatementV2>();
  statements.forEach((statement, index) => {
    if (!firstById.has(statement.unit_id)) {
      firstById.set(statement.unit_id, index);
      canonical.set(statement.unit_id, statement);
    }
  });
  return statements.every((statement) => {
    const first = canonical.get(statement.unit_id)!;
    const sameUnit =
      statement.chinese === first.chinese &&
      statement.english === first.english &&
      statement.soundmark === first.soundmark &&
      JSON.stringify(statement.source_unit_ids) === JSON.stringify(first.source_unit_ids);
    const sources = statement.source_unit_ids;
    const sourceOrderValid =
      sources.length === 0 ||
      (sources[0] !== sources[1] &&
        sources.every((id) => (firstById.get(id) ?? Infinity) < firstById.get(statement.unit_id)!));
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
