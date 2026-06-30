import { describe, expect, it } from 'vitest';
import behavioralRaw from '../../data/problemSets/behavioral-software-engineering.json';
import cfoModeRaw from '../../data/problemSets/cfo-mode.json';
import codeSignalRaw from '../../data/problemSets/codesignal-tech-force.json';
import wordpressRaw from '../../data/problemSets/frontend-wordpress.json';
import dotnetRaw from '../../data/problemSets/junior-dotnet.json';
import neetcode50Raw from '../../data/problemSets/neetcode-50.json';
import npRaw from '../../data/problemSets/np-occupational-health-fl.json';
import outrivalExperimentationRaw from '../../data/problemSets/outrival-experimentation-statistics.json';
import outrivalPlatformReliabilityRaw from '../../data/problemSets/outrival-platform-reliability.json';
import pythonFundamentalsRaw from '../../data/problemSets/python-fundamentals.json';
import pythonIntermediateRaw from '../../data/problemSets/python-intermediate.json';
import synthbeeConversationalRaw from '../../data/problemSets/synthbee-conversational-screen.json';
import synthbeeWilliamRaw from '../../data/problemSets/synthbee-william-screen.json';
import tutorialRaw from '../../data/problemSets/tutorial.json';

const problemBanks: Record<string, unknown[]> = {
  'behavioral-software-engineering': behavioralRaw,
  'cfo-mode': cfoModeRaw,
  'codesignal-tech-force': codeSignalRaw,
  'frontend-wordpress': wordpressRaw,
  'junior-dotnet': dotnetRaw,
  'neetcode-50': neetcode50Raw,
  'np-occupational-health-fl': npRaw,
  'outrival-experimentation-statistics': outrivalExperimentationRaw,
  'outrival-platform-reliability': outrivalPlatformReliabilityRaw,
  'python-fundamentals': pythonFundamentalsRaw,
  'python-intermediate': pythonIntermediateRaw,
  'synthbee-conversational-screen': synthbeeConversationalRaw,
  'synthbee-william-screen': synthbeeWilliamRaw,
  tutorial: tutorialRaw,
};

const stalePatterns = [
  /first rep/i,
  /shoot your shot/i,
  /james joyce/i,
  /ulysses/i,
  /problem pack/i,
  /tutorial mode/i,
  /selected ids/i,
  /safe practice rep/i,
  /safe rep/i,
  /what story will you use/i,
  /complexity are you aiming/i,
];

const requiredFields = [
  'id',
  'title',
  'prompt',
  'constraints',
  'scaffold',
  'examples',
  'expectedApproach',
  'commonPitfalls',
  'idealSolutionOutline',
  'evaluationNotes',
];

const allowedDifficulties = new Set(['easy', 'medium', 'hard']);
const allowedLanguages = new Set(['javascript', 'python', 'typescript', 'sql', 'yaml', 'dockerfile']);
const allowedAssessmentTypes = new Set(['coding', 'math', 'behavioral', 'system-design']);

function collectStrings(value: unknown): string[] {
  if (typeof value === 'string') return [value];
  if (Array.isArray(value)) return value.flatMap(collectStrings);
  if (value && typeof value === 'object') {
    return Object.values(value).flatMap(collectStrings);
  }
  return [];
}

function asRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object') return {};
  return value as Record<string, unknown>;
}

function getProblemId(problem: unknown): string {
  if (problem && typeof problem === 'object' && 'id' in problem) {
    return String((problem as { id: unknown }).id);
  }
  return 'unknown-problem';
}

describe('problem bank content', () => {
  it('has complete visible lesson content for every registered question', () => {
    const failures: string[] = [];

    for (const [bankId, problems] of Object.entries(problemBanks)) {
      const seenIds = new Set<string>();

      for (const problem of problems) {
        const record = asRecord(problem);
        const problemId = getProblemId(problem);

        if (seenIds.has(problemId)) {
          failures.push(`${bankId}/${problemId} has a duplicate id`);
        }
        seenIds.add(problemId);

        for (const field of requiredFields) {
          if (!(field in record)) {
            failures.push(`${bankId}/${problemId} is missing ${field}`);
          }
        }

        if (typeof record.title !== 'string' || record.title.trim().length === 0) {
          failures.push(`${bankId}/${problemId} has a blank title`);
        }

        if (typeof record.prompt !== 'string' || record.prompt.trim().length < 20) {
          failures.push(`${bankId}/${problemId} has a too-thin prompt`);
        }

        if (!Array.isArray(record.constraints) || record.constraints.length === 0) {
          failures.push(`${bankId}/${problemId} needs at least one rule`);
        }

        if (!Array.isArray(record.examples) || record.examples.length === 0) {
          failures.push(`${bankId}/${problemId} needs at least one example`);
        }

        if (!allowedDifficulties.has(String(record.difficulty))) {
          failures.push(`${bankId}/${problemId} has invalid difficulty ${String(record.difficulty)}`);
        }

        if (!allowedLanguages.has(String(record.language))) {
          failures.push(`${bankId}/${problemId} has invalid language ${String(record.language)}`);
        }

        if (!allowedAssessmentTypes.has(String(record.assessmentType))) {
          failures.push(`${bankId}/${problemId} has invalid assessment type ${String(record.assessmentType)}`);
        }

        if (typeof record.timeLimit !== 'number' || record.timeLimit < 1 || record.timeLimit > 90) {
          failures.push(`${bankId}/${problemId} has odd time limit ${String(record.timeLimit)}`);
        }
      }
    }

    expect(failures).toEqual([]);
  });

  it('does not leak stale tutorial or internal app language into lessons', () => {
    const failures: string[] = [];

    for (const [bankId, problems] of Object.entries(problemBanks)) {
      for (const problem of problems) {
        const haystack = collectStrings(problem).join('\n');
        for (const pattern of stalePatterns) {
          if (pattern.test(haystack)) {
            failures.push(`${bankId}/${getProblemId(problem)} matched ${pattern}`);
          }
        }
      }
    }

    expect(failures).toEqual([]);
  });
});
