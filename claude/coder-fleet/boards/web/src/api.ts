// The board server's JSON API (src/web.ts in the boards package). Every write
// goes through the board's own functions there, with source `web`.

export interface CardSummary {
  id: string;
  title: string;
  column: string;
  parent: string | null;
  criteria: { ticked: number; total: number };
  actions: string[];
  ready: boolean;
}

export interface BoardView {
  name: string;
  prefix: string;
  dir: string;
  columns: string[];
  cards: CardSummary[];
}

export interface Item {
  n: number;
  text: string;
  ticked: boolean;
  fromDefaults?: boolean;
}

export interface MoveEvent {
  time: string;
  from: string;
  to: string;
  source: string;
  actor?: string;
  gate?: 'card' | 'test';
}

export interface Comment {
  time: string;
  by: string;
  text: string;
}

export interface Run {
  release: string;
  tag: string;
  commit: string;
  state: string;
}

export interface Target {
  column: string;
  refused?: string;
  gate?: 'card' | 'test';
}

export interface CardView {
  id: string;
  title: string;
  column: string;
  parent: string | null;
  dependencies: string[];
  body: string;
  created: string;
  updated: string;
  criteria: Item[];
  dod: Item[];
  actions: Item[];
  comments: Comment[];
  history: MoveEvent[];
  runs: Run[];
  targets: Target[];
}

async function send<T>(path: string, body?: unknown): Promise<T> {
  const res = await fetch(path, body === undefined ? undefined : { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
  if (!res.ok) {
    let message = `${res.status} ${res.statusText}`;
    try {
      message = ((await res.json()) as { error?: string }).error ?? message;
    } catch {}
    throw new Error(message);
  }
  return (await res.json()) as T;
}

export const getBoard = () => send<BoardView>('/api/board');
export const getCard = (id: string) => send<CardView>(`/api/cards/${encodeURIComponent(id)}`);
export const newCard = (title: string) => send<CardView>('/api/cards', { title });
export const cardOp = (id: string, op: string, body: Record<string, unknown>) => send<CardView>(`/api/cards/${encodeURIComponent(id)}/${op}`, body);

export async function runLog(release: string): Promise<string> {
  const res = await fetch(`/api/runs/${encodeURIComponent(release)}/log`);
  return res.ok ? res.text() : `No log: ${res.status}`;
}
