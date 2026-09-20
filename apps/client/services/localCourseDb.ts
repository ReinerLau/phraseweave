import type { CoursePackResponse, CoursePacksResponse } from "~/api/coursePack";

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
    const request = window.indexedDB.open(DATABASE_NAME, DATABASE_VERSION);

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

export async function getLocalCoursePack(coursePackId: string) {
  if (!isSupported()) return undefined;

  const database = await openDatabase();
  const transaction = database.transaction(PACK_STORE, "readonly");
  return requestResult<CoursePackResponse | undefined>(
    transaction.objectStore(PACK_STORE).get(coursePackId),
  );
}

export async function listLocalCoursePacks() {
  if (!isSupported()) return [] as CoursePacksResponse;

  const database = await openDatabase();
  const transaction = database.transaction(CATALOG_STORE, "readonly");
  return requestResult<CoursePacksResponse>(transaction.objectStore(CATALOG_STORE).getAll());
}

export async function saveLocalCoursePack(coursePack: CoursePackResponse) {
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

export async function saveLocalCoursePackCatalog(coursePacks: CoursePacksResponse) {
  if (!isSupported()) return;

  const database = await openDatabase();
  const transaction = database.transaction(CATALOG_STORE, "readwrite");
  const store = transaction.objectStore(CATALOG_STORE);
  coursePacks.forEach((coursePack) => store.put(coursePack));
  await transactionComplete(transaction);
}

export async function exportLocalCoursePacks() {
  if (!isSupported()) return [] as CoursePackResponse[];

  const database = await openDatabase();
  const transaction = database.transaction(PACK_STORE, "readonly");
  return requestResult<CoursePackResponse[]>(transaction.objectStore(PACK_STORE).getAll());
}

export async function importLocalCoursePacks(value: unknown) {
  if (!Array.isArray(value)) throw new Error("备份文件格式不正确");

  const coursePacks = value.filter(isCoursePackResponse);
  if (coursePacks.length !== value.length) throw new Error("备份文件包含无效课程包");

  for (const coursePack of coursePacks) {
    await saveLocalCoursePack(coursePack);
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

function isCoursePackResponse(value: unknown): value is CoursePackResponse {
  if (!value || typeof value !== "object") return false;
  const coursePack = value as Partial<CoursePackResponse>;
  return (
    typeof coursePack.id === "string" &&
    typeof coursePack.title === "string" &&
    Array.isArray(coursePack.courses)
  );
}
