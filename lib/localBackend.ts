// ============================================================================
// "Supabase local": implementa o mesmo formato de chamadas (auth.*, from().*,
// rpc()) só que gravando tudo no localStorage do navegador. Serve pra testar
// o app sem precisar criar/configurar um projeto Supabase ainda.
//
// Quando você configurar SUPABASE_URL/SUPABASE_ANON_KEY de verdade, o
// lib/supabaseClient.ts passa a usar o cliente real automaticamente — nenhum
// componente da tela precisa mudar, porque todos falam só com `supabase`.
//
// Atenção: isso é só pra teste local. Os dados ficam presos neste navegador
// (não sincronizam entre dispositivos, não dá pra compartilhar link com
// outra pessoa de verdade) — é exatamente o que o Supabase resolve depois.
// ============================================================================

const STORAGE_KEY = 'musicianos_local_db_v1';
const AUTH_KEY = 'musicianos_local_auth_v1';

type Row = Record<string, any>;

function uuid(): string {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID();
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
  });
}

// -------------------------- armazenamento --------------------------

class LocalDB {
  private data: Record<string, Row[]>;

  constructor() {
    try {
      this.data = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
    } catch {
      this.data = {};
    }
  }

  table(name: string): Row[] {
    if (!this.data[name]) this.data[name] = [];
    return this.data[name];
  }

  save() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(this.data));
  }
}

const db = new LocalDB();

// -------------------------- query builder --------------------------

type Result = { data: any; error: { message: string } | null };

class LocalQueryBuilder implements PromiseLike<Result> {
  private op: 'select' | 'insert' | 'update' | 'delete' = 'select';
  private filters: [string, any][] = [];
  private payload: Row | null = null;
  private orderCol?: string;
  private orderAsc = true;
  private wantsSingle = false;
  private selectCols = '*';

  constructor(private tableName: string) {}

  select(cols = '*') {
    this.selectCols = cols;
    return this;
  }
  insert(payload: Row) {
    this.op = 'insert';
    this.payload = payload;
    return this;
  }
  update(payload: Row) {
    this.op = 'update';
    this.payload = payload;
    return this;
  }
  delete() {
    this.op = 'delete';
    return this;
  }
  eq(col: string, val: any) {
    this.filters.push([col, val]);
    return this;
  }
  order(col: string, opts?: { ascending?: boolean }) {
    this.orderCol = col;
    this.orderAsc = opts?.ascending ?? true;
    return this;
  }
  single() {
    this.wantsSingle = true;
    return this;
  }

  private matches(row: Row): boolean {
    return this.filters.every(([c, v]) => row[c] === v);
  }

  private applyJoins(rows: Row[]): Row[] {
    if (this.tableName === 'setlist_items' && this.selectCols.includes('song:songs')) {
      const songs = db.table('songs');
      return rows.map((r) => ({ ...r, song: songs.find((s) => s.id === r.song_id) || null }));
    }
    return rows;
  }

  private run(): Result {
    const rows = db.table(this.tableName);

    if (this.op === 'select') {
      let result = rows.filter((r) => this.matches(r));
      if (this.orderCol) {
        const col = this.orderCol;
        result = [...result].sort((a, b) => {
          const av = a[col];
          const bv = b[col];
          const cmp = av > bv ? 1 : av < bv ? -1 : 0;
          return this.orderAsc ? cmp : -cmp;
        });
      }
      result = this.applyJoins(result);
      if (this.wantsSingle) {
        return result[0]
          ? { data: result[0], error: null }
          : { data: null, error: { message: 'Registro não encontrado.' } };
      }
      return { data: result, error: null };
    }

    if (this.op === 'insert') {
      const now = new Date().toISOString();
      const row: Row = { id: uuid(), created_at: now, updated_at: now, ...this.payload };
      rows.push(row);
      db.save();
      const [joined] = this.applyJoins([row]);
      return { data: this.wantsSingle ? joined : [joined], error: null };
    }

    if (this.op === 'update') {
      const idx = rows.findIndex((r) => this.matches(r));
      if (idx === -1) return { data: null, error: { message: 'Registro não encontrado.' } };
      rows[idx] = { ...rows[idx], ...this.payload, updated_at: new Date().toISOString() };
      db.save();
      const [joined] = this.applyJoins([rows[idx]]);
      return { data: this.wantsSingle ? joined : [joined], error: null };
    }

    if (this.op === 'delete') {
      const idx = rows.findIndex((r) => this.matches(r));
      if (idx !== -1) {
        rows.splice(idx, 1);
        db.save();
      }
      return { data: null, error: null };
    }

    return { data: null, error: { message: 'Operação desconhecida.' } };
  }

  then<TResult1 = Result, TResult2 = never>(
    onfulfilled?: ((value: Result) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((reason: any) => TResult2 | PromiseLike<TResult2>) | null
  ): PromiseLike<TResult1 | TResult2> {
    return Promise.resolve(this.run()).then(onfulfilled, onrejected);
  }
}

// -------------------------- auth --------------------------

interface LocalUser {
  id: string;
  email: string;
  password: string;
}
interface LocalAuthState {
  users: LocalUser[];
  currentUserId: string | null;
}

function loadAuth(): LocalAuthState {
  try {
    return JSON.parse(localStorage.getItem(AUTH_KEY) || '') || { users: [], currentUserId: null };
  } catch {
    return { users: [], currentUserId: null };
  }
}
function saveAuth(state: LocalAuthState) {
  localStorage.setItem(AUTH_KEY, JSON.stringify(state));
}

let authState = loadAuth();
type AuthListener = (event: string, session: any) => void;
const listeners: AuthListener[] = [];

function currentSession() {
  const user = authState.users.find((u) => u.id === authState.currentUserId);
  if (!user) return null;
  return { user: { id: user.id, email: user.email } };
}

function notify(event: string) {
  const session = currentSession();
  listeners.forEach((l) => l(event, session));
}

function ensureProfile(userId: string, name: string) {
  const profiles = db.table('profiles');
  if (!profiles.some((p) => p.id === userId)) {
    profiles.push({ id: userId, name, role: 'user' });
    db.save();
  }
}

export const localSupabase = {
  auth: {
    async getSession() {
      return { data: { session: currentSession() } };
    },
    onAuthStateChange(callback: AuthListener) {
      listeners.push(callback);
      return { data: { subscription: { unsubscribe: () => {
        const i = listeners.indexOf(callback);
        if (i >= 0) listeners.splice(i, 1);
      } } } };
    },
    async signInWithPassword({ email, password }: { email: string; password: string }) {
      const user = authState.users.find((u) => u.email === email);
      if (!user || user.password !== password) {
        return { error: { message: 'E-mail ou senha inválidos (modo local).' } };
      }
      authState.currentUserId = user.id;
      saveAuth(authState);
      notify('SIGNED_IN');
      return { error: null };
    },
    async signUp({ email, password, options }: { email: string; password: string; options?: { data?: { name?: string } } }) {
      if (authState.users.some((u) => u.email === email)) {
        return { error: { message: 'Já existe uma conta local com esse e-mail.' } };
      }
      const user: LocalUser = { id: uuid(), email, password };
      authState.users.push(user);
      authState.currentUserId = user.id;
      saveAuth(authState);
      ensureProfile(user.id, options?.data?.name || email.split('@')[0]);
      notify('SIGNED_IN');
      return { error: null };
    },
    async signOut() {
      authState.currentUserId = null;
      saveAuth(authState);
      notify('SIGNED_OUT');
    },
    async getUser() {
      return { data: { user: currentSession()?.user || null } };
    },
  },

  from(table: string) {
    return new LocalQueryBuilder(table);
  },

  async rpc(fnName: string, params: Record<string, any>) {
    if (fnName === 'get_shared_setlist') {
      const share = db.table('setlist_shares').find((s) => s.share_token === params.token);
      if (!share) return { data: [], error: null };
      const setlist = db.table('setlists').find((s) => s.id === share.setlist_id);
      if (!setlist) return { data: [], error: null };
      const gig = setlist.gig_id ? db.table('gigs').find((g) => g.id === setlist.gig_id) : null;
      const owner = db.table('profiles').find((p) => p.id === setlist.user_id);
      const items = db
        .table('setlist_items')
        .filter((i) => i.setlist_id === setlist.id)
        .sort((a, b) => a.position - b.position);
      const songs = db.table('songs');

      const rows = items.map((item) => {
        const song = songs.find((s) => s.id === item.song_id);
        return {
          setlist_title: setlist.title,
          setlist_notes: setlist.notes,
          gig_date: gig?.date ?? null,
          gig_venue: gig?.venue ?? null,
          gig_city: gig?.city ?? null,
          owner_name: owner?.name ?? 'Músico',
          song_title: song?.title ?? '',
          song_artist: song?.artist ?? '',
          performance_key: item.performance_key,
          original_key: song?.original_key ?? 'C',
          body_chordpro: song?.body_chordpro ?? '',
          position: item.position,
          item_notes: item.notes ?? '',
        };
      });
      return { data: rows, error: null };
    }
    return { data: null, error: { message: `RPC "${fnName}" não implementada no modo local.` } };
  },
};

// -------------------------- backup / restauração --------------------------
//
// Os dados do modo local vivem só no localStorage deste navegador — limpar
// "cookies e dados do site" apaga tudo. Estas duas funções exportam/importam
// um arquivo .json com TUDO (dados das tabelas + contas locais, incluindo a
// senha em texto puro das contas locais — o mesmo nível de segurança que o
// modo local já tinha, então trate esse arquivo como sensível e não o
// compartilhe).

export interface LocalBackup {
  version: 1;
  exportedAt: string;
  db: Record<string, Row[]>;
  auth: LocalAuthState;
}

export function exportLocalBackup(): LocalBackup {
  return {
    version: 1,
    exportedAt: new Date().toISOString(),
    db: JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}'),
    auth: loadAuth(),
  };
}

export function importLocalBackup(backup: LocalBackup) {
  if (!backup || typeof backup !== 'object' || !backup.db || !backup.auth) {
    throw new Error('Arquivo de backup inválido.');
  }
  localStorage.setItem(STORAGE_KEY, JSON.stringify(backup.db));
  localStorage.setItem(AUTH_KEY, JSON.stringify(backup.auth));
}

