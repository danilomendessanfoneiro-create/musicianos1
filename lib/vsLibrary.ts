/**
 * Acervo local de VS.
 *
 * Os arquivos ficam em IndexedDB, no navegador do usuário — localStorage não
 * aguenta áudio. Os metadados ficam num índice separado para a listagem
 * carregar rápido sem tocar nos blobs.
 *
 * Nada aqui sobe para servidor nenhum. Quando o Supabase entrar, o mesmo
 * formato de registro serve de payload: veja `exportProject`.
 */

const DB_NAME = 'musicianos-vs';
const DB_VERSION = 1;
const STORE_PROJECTS = 'projects';
const STORE_FILES = 'files';

export interface VsTrack {
  id: string;
  label: string;
  color: string;
  fileKey: string;
  bytes: number;
}

export interface VsProject {
  id: string;
  title: string;
  artist: string;
  songKey: string;
  notes: string;
  origin: 'separado' | 'importado';
  durationSec: number;
  createdAt: number;
  tracks: VsTrack[];
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_PROJECTS)) {
        db.createObjectStore(STORE_PROJECTS, { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains(STORE_FILES)) {
        db.createObjectStore(STORE_FILES);
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function tx<T>(store: string, mode: IDBTransactionMode, run: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  return openDb().then(
    (db) =>
      new Promise<T>((resolve, reject) => {
        const transaction = db.transaction(store, mode);
        const request = run(transaction.objectStore(store));
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
        transaction.oncomplete = () => db.close();
      }),
  );
}

export function newId(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

export async function listProjects(): Promise<VsProject[]> {
  const all = await tx<VsProject[]>(STORE_PROJECTS, 'readonly', (s) => s.getAll() as IDBRequest<VsProject[]>);
  return all.sort((a, b) => b.createdAt - a.createdAt);
}

export async function getProject(id: string): Promise<VsProject | undefined> {
  return tx<VsProject | undefined>(STORE_PROJECTS, 'readonly', (s) => s.get(id));
}

export async function saveProject(project: VsProject): Promise<void> {
  await tx(STORE_PROJECTS, 'readwrite', (s) => s.put(project));
}

export async function putFile(key: string, blob: Blob): Promise<void> {
  await tx(STORE_FILES, 'readwrite', (s) => s.put(blob, key));
}

export async function getFile(key: string): Promise<Blob | undefined> {
  return tx<Blob | undefined>(STORE_FILES, 'readonly', (s) => s.get(key));
}

export async function deleteProject(id: string): Promise<void> {
  const project = await getProject(id);
  if (!project) return;
  for (const track of project.tracks) {
    await tx(STORE_FILES, 'readwrite', (s) => s.delete(track.fileKey));
  }
  await tx(STORE_PROJECTS, 'readwrite', (s) => s.delete(id));
}

export async function usedBytes(): Promise<number> {
  const projects = await listProjects();
  return projects.reduce(
    (total, project) => total + project.tracks.reduce((sum, t) => sum + t.bytes, 0),
    0,
  );
}

/** Espaço que o navegador ainda concede para este domínio. */
export async function storageEstimate(): Promise<{ usage: number; quota: number } | null> {
  if (!navigator.storage?.estimate) return null;
  const estimate = await navigator.storage.estimate();
  return { usage: estimate.usage ?? 0, quota: estimate.quota ?? 0 };
}

/**
 * Empacota um VS inteiro (metadados + arquivos) para backup ou para subir
 * ao Supabase depois. Os arquivos vão como Blob, prontos para o Storage.
 */
export async function exportProject(id: string): Promise<{ project: VsProject; files: Record<string, Blob> }> {
  const project = await getProject(id);
  if (!project) throw new Error('VS não encontrado');
  const files: Record<string, Blob> = {};
  for (const track of project.tracks) {
    const blob = await getFile(track.fileKey);
    if (blob) files[track.fileKey] = blob;
  }
  return { project, files };
}
