// How each of the board's eight columns looks: the Ledger design's colour for
// it, the line an empty lane shows, and the hint the empty board gives.
export interface ColumnLook {
  dot: string;
  ink: string;
  soft: string;
  empty: string;
  hint?: string;
}

export const LOOK: Record<string, ColumnLook> = {
  Draft: { dot: 'var(--cd-ink-muted)', ink: 'var(--cd-ink-muted)', soft: 'var(--cd-sunken)', empty: 'No drafts' },
  Backlog: { dot: 'var(--cd-someday)', ink: 'var(--cd-someday)', soft: 'var(--cd-someday-soft)', empty: 'Nothing in Backlog' },
  Next: {
    dot: 'var(--cd-accent)',
    ink: 'var(--cd-accent)',
    soft: 'var(--cd-accent-soft)',
    empty: 'Nothing queued',
    hint: 'Move a card here to order it. The fleet takes Next top first.',
  },
  'In Progress': {
    dot: 'var(--cd-anytime)',
    ink: 'var(--cd-anytime)',
    soft: 'var(--cd-anytime-soft)',
    empty: 'Nothing in progress',
    hint: 'Cards move here by themselves when an agent starts on them.',
  },
  Done: { dot: 'var(--cd-logbook)', ink: 'var(--cd-logbook)', soft: 'var(--cd-logbook-soft)', empty: 'Nothing done yet' },
  Released: { dot: 'var(--cd-logbook)', ink: 'var(--cd-logbook)', soft: 'var(--cd-logbook-soft)', empty: 'Nothing released yet' },
  Blocked: { dot: 'var(--cd-upcoming)', ink: 'var(--cd-upcoming)', soft: 'var(--cd-upcoming-soft)', empty: 'Nothing blocked' },
  'Blocked by Human': {
    dot: 'var(--cd-today)',
    ink: 'var(--cd-today-ink)',
    soft: 'var(--cd-today-soft)',
    empty: 'Nothing waiting on you',
    hint: 'Actions the fleet needs you to take land here.',
  },
};

export const look = (column: string): ColumnLook => LOOK[column] ?? LOOK.Draft!;

// The columns a finished or not yet started card sits in. The desktop board
// shows them as narrow rails, as the design shows Done, so the active lanes
// keep their width.
export const RAILS = ['Draft', 'Done', 'Released'];

// The lanes the laptop board and an open card keep in view.
export const ACTIVE = ['Next', 'In Progress', 'Blocked', 'Blocked by Human'];
