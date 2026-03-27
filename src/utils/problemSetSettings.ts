/**
 * Problem set selection storage utilities.
 */

const PROBLEM_SET_SETTINGS_KEY = 'coding-interview-problem-set-settings';

export interface ProblemSetSettings {
  selectedProblemSetIds: string[];
}

export const DEFAULT_SELECTED_PROBLEM_SETS: string[] = [
  'neetcode-50',
  'codesignal-tech-force',
];

export function getProblemSetSettings(): ProblemSetSettings {
  try {
    const raw = localStorage.getItem(PROBLEM_SET_SETTINGS_KEY);
    if (!raw) {
      return { selectedProblemSetIds: [...DEFAULT_SELECTED_PROBLEM_SETS] };
    }
    const parsed = JSON.parse(raw) as Partial<ProblemSetSettings>;
    const selected = Array.isArray(parsed.selectedProblemSetIds)
      ? parsed.selectedProblemSetIds.filter((v): v is string => typeof v === 'string' && v.trim().length > 0)
      : [];
    return {
      selectedProblemSetIds: selected.length > 0 ? selected : [...DEFAULT_SELECTED_PROBLEM_SETS],
    };
  } catch {
    return { selectedProblemSetIds: [...DEFAULT_SELECTED_PROBLEM_SETS] };
  }
}

export function saveProblemSetSettings(settings: ProblemSetSettings): void {
  try {
    const selected = settings.selectedProblemSetIds.filter((v) => v.trim().length > 0);
    localStorage.setItem(
      PROBLEM_SET_SETTINGS_KEY,
      JSON.stringify({
        selectedProblemSetIds: selected.length > 0 ? selected : [...DEFAULT_SELECTED_PROBLEM_SETS],
      }),
    );
  } catch {
    // Ignore storage errors
  }
}
