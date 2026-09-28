import React from "react";
import type { AcceptanceCriterion } from "../../types";

interface ActionsForHumanSectionProps {
  items: AcceptanceCriterion[];
  onToggle: (index: number, checked: boolean) => void;
  disabled?: boolean;
}

/**
 * The asks waiting on the human, first in the modal so they are read before anything else (CF-25).
 * Each checkbox ticks one action by its number. Renders nothing when the section is empty.
 */
const ActionsForHumanSection: React.FC<ActionsForHumanSectionProps> = ({ items, onToggle, disabled = false }) => {
  if (items.length === 0) return null;
  const sorted = items.slice().sort((a, b) => a.index - b.index);
  const answered = sorted.filter((item) => item.checked).length;
  return (
    <section
      data-actions-for-human
      className="rounded-lg border-2 border-amber-400 dark:border-amber-500 bg-amber-50 dark:bg-amber-900/20 p-4"
    >
      <div className="mb-3 flex items-center justify-between">
        <h3 className="text-sm font-semibold text-amber-900 dark:text-amber-200">Actions for Human</h3>
        <span className="text-xs text-amber-800 dark:text-amber-300">
          {answered} of {sorted.length} answered
        </span>
      </div>
      <ul className="space-y-2">
        {sorted.map((item) => (
          <li key={item.index} className="flex items-start gap-2 rounded-md px-2 py-1">
            <input
              type="checkbox"
              checked={item.checked}
              disabled={disabled}
              aria-label={`Action ${item.index}`}
              onChange={(e) => onToggle(item.index, e.target.checked)}
              className="mt-0.5 h-4 w-4 text-amber-600 focus:ring-amber-500 border-gray-300 rounded"
            />
            <span className="text-xs font-mono text-amber-800 dark:text-amber-300">#{item.index}</span>
            <div className="text-sm text-gray-900 dark:text-gray-100">{item.text}</div>
          </li>
        ))}
      </ul>
    </section>
  );
};

export default ActionsForHumanSection;
