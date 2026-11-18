import { ref } from 'vue';
import { RAILS } from './columns';

// Which columns show as the design's narrow rail. The human's own choice for
// a column, collapsed or expanded, wins and is kept in this page's
// localStorage, a per-viewer convenience that never reaches the board. A
// column he has not touched starts as a rail when it is Draft, Done or
// Released, or when it holds no card.
type Fold = 'open' | 'closed';
const KEY = 'coder-fleet-board-columns';

function read(): Record<string, Fold> {
  try {
    const v: unknown = JSON.parse(localStorage.getItem(KEY) ?? '{}');
    if (!v || typeof v !== 'object') return {};
    return Object.fromEntries(Object.entries(v).filter((e): e is [string, Fold] => e[1] === 'open' || e[1] === 'closed'));
  } catch {
    return {};
  }
}

const folds = ref<Record<string, Fold>>(read());

export function setFold(column: string, fold: Fold): void {
  folds.value = { ...folds.value, [column]: fold };
  try {
    localStorage.setItem(KEY, JSON.stringify(folds.value));
  } catch {
    // Storage refused (private browsing, quota): the choice lasts this page.
  }
}

// `count` is the column's cards on the board, or null while it loads.
export function folded(column: string, count: number | null): boolean {
  const choice = folds.value[column];
  if (choice) return choice === 'closed';
  return RAILS.includes(column) || count === 0;
}
