import type { ProjectSummary } from './types';
import { LIBRARY_PREDICATES } from './predicates.mjs';

// Header chip row: clicking any chip adds every matching summary to the
// current selection (additive, doesn't replace). Drives off LIBRARY_PREDICATES
// so adding a new chip is just one registry entry.
export function FilterToSelect({ summaries, onAddMany }: {
  summaries: ReadonlyArray<ProjectSummary>;
  onAddMany: (paths: ReadonlyArray<string>) => void;
}) {
  if (summaries.length === 0) return null;

  function selectByPredicate(matches: (summary: ProjectSummary, now?: Date) => boolean) {
    const now = new Date();
    const paths = summaries.filter((summary) => matches(summary, now)).map((summary) => summary.path);
    if (paths.length === 0) return;
    onAddMany(paths);
  }

  return (
    <div className="libraryFilterRow" role="group" aria-label="Select by filter">
      <span className="libraryFilterLabel">Quick select:</span>
      {LIBRARY_PREDICATES.map((predicate) => (
        <button
          key={predicate.id}
          type="button"
          className="libraryFilterChip"
          onClick={() => selectByPredicate(predicate.matches)}
          title={`Add every "${predicate.label}" project to selection`}
        >
          {predicate.label}
        </button>
      ))}
    </div>
  );
}
