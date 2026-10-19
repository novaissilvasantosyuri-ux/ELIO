"use client";

/**
 * Fila offline (IndexedDB): mensagens criadas sem conexão esperam aqui
 * e são reenviadas sem duplicar (o servidor é idempotente por client_id).
 */

const DB = "elio";
const STORE = "outbox";
const VERSION = 1;

export interface OutboxItem {
  client_id: string;
  conversation_id: string;
  body: string;
  reply_to_id: string | null;
  created_at: string;
  attempts: number;
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB, VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE, { keyPath: "client_id" });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function tx<T>(mode: IDBTransactionMode, run: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE, mode);
    const store = transaction.objectStore(STORE);
    const req = run(store);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
    transaction.oncomplete = () => db.close();
    transaction.onerror = () => {
      db.close();
      reject(transaction.error);
    };
  });
}

export const outbox = {
  async add(item: OutboxItem): Promise<void> {
    await tx("readwrite", (s) => s.put(item));
  },
  async list(): Promise<OutboxItem[]> {
    return tx("readonly", (s) => s.getAll());
  },
  async remove(clientId: string): Promise<void> {
    await tx("readwrite", (s) => s.delete(clientId));
  },
  async clear(): Promise<void> {
    await tx("readwrite", (s) => s.clear());
  },
};
