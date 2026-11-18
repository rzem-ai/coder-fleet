import { reactive } from 'vue';
import { type CardSummary, getCard, type Target } from './api';

// Dragging a card between lanes, with pointer events so the lifted card is
// drawn in the page. Which lanes take it comes from the board's own column
// rules: the server's answer for this card, never a copy of them here.
export interface DragState {
  card: CardSummary | null;
  started: boolean;
  x: number;
  y: number;
  dx: number;
  dy: number;
  width: number;
  over: string | null;
  index: number;
  targets: Target[];
}

export const drag = reactive<DragState>({ card: null, started: false, x: 0, y: 0, dx: 0, dy: 0, width: 0, over: null, index: 0, targets: [] });

let start = { x: 0, y: 0 };
let clickSuppressed = false;

export function target(column: string): Target | undefined {
  return drag.targets.find((t) => t.column === column);
}

// Where a lane stands while a card is dragged: the lane it came from, one it
// may go to (and whether the pointer is over it), or one the rules lock.
export function laneState(column: string): 'idle' | 'source' | 'open' | 'over' | 'locked' {
  if (!drag.started || !drag.card) return 'idle';
  if (column === drag.card.column) return drag.over === column && column === 'Next' ? 'over' : 'source';
  if (!drag.targets.length) return 'idle';
  const t = target(column);
  if (!t || t.refused) return 'locked';
  return drag.over === column ? 'over' : 'open';
}

export function pressCard(e: PointerEvent, card: CardSummary): void {
  if (e.button !== 0) return;
  // A drag dropped away from any card fires no click, so its flag ends here.
  clickSuppressed = false;
  const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
  Object.assign(drag, { card, started: false, x: e.clientX, y: e.clientY, dx: e.clientX - rect.left, dy: e.clientY - rect.top, width: rect.width, over: null, index: 0, targets: [] });
  start = { x: e.clientX, y: e.clientY };
}

// True once, for the click that ends a drag, so the drop opens no card.
export function swallowClick(): boolean {
  const was = clickSuppressed;
  clickSuppressed = false;
  return was;
}

export function trackPointer(onDrop: (card: CardSummary, to: string, index: number) => void): () => void {
  const move = (e: PointerEvent) => {
    if (!drag.card) return;
    if (!drag.started) {
      if (Math.hypot(e.clientX - start.x, e.clientY - start.y) < 5) return;
      drag.started = true;
      const id = drag.card.id;
      getCard(id)
        .then((c) => {
          if (drag.card?.id === id) drag.targets = c.targets;
        })
        .catch(() => {});
    }
    drag.x = e.clientX;
    drag.y = e.clientY;
    const lane = document.elementFromPoint(e.clientX, e.clientY)?.closest<HTMLElement>('[data-column]');
    drag.over = lane?.dataset.column ?? null;
    if (lane && drag.over === 'Next') {
      const others = [...lane.querySelectorAll<HTMLElement>('[data-card-id]')].filter((el) => el.dataset.cardId !== drag.card?.id);
      drag.index = others.filter((el) => {
        const r = el.getBoundingClientRect();
        return r.top + r.height / 2 < e.clientY;
      }).length;
    }
  };
  const up = () => {
    if (drag.card && drag.started) {
      clickSuppressed = true;
      const { card, over, index } = drag;
      const t = over ? target(over) : undefined;
      if (over && (over === card.column ? over === 'Next' : t && !t.refused)) onDrop(card, over, index);
    }
    drag.card = null;
    drag.started = false;
    drag.over = null;
    drag.targets = [];
  };
  window.addEventListener('pointermove', move);
  window.addEventListener('pointerup', up);
  return () => {
    window.removeEventListener('pointermove', move);
    window.removeEventListener('pointerup', up);
  };
}
