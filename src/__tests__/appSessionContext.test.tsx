import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import App from '../App';
import { problemService } from '../services/problemService';
import { proctorService } from '../services/proctorService';
import { storageService } from '../services/storageService';
import type { EvaluationResult, Problem, SessionRecord } from '../types';

vi.mock('../services/problemService', () => ({
  problemService: {
    loadProblems: vi.fn().mockResolvedValue([]),
    getRandomProblem: vi.fn(),
    getProblemById: vi.fn(),
    getAvailableProblemSets: vi.fn().mockReturnValue([]),
  },
}));

vi.mock('../services/proctorService', () => ({
  proctorService: {
    generateIntro: vi.fn(),
    respondToQuestion: vi.fn(),
    getLastInteractionMode: vi.fn().mockReturnValue('idle'),
    getProactiveNudge: vi.fn().mockReturnValue(null),
    cancelPendingRequest: vi.fn(),
    evaluate: vi.fn(),
  },
}));

vi.mock('../services/storageService', () => ({
  storageService: {
    getSessions: vi.fn().mockReturnValue([]),
    saveSession: vi.fn(),
    getSession: vi.fn(),
    clearSessions: vi.fn(),
  },
}));

vi.mock('../utils/apiKeyStorage', () => ({
  getStoredApiKey: vi.fn().mockReturnValue('test-key'),
  hasApiKey: vi.fn().mockReturnValue(true),
  isEnvironmentApiKeyConfigured: vi.fn().mockReturnValue(false),
  getEnvironmentApiKeySource: vi.fn().mockReturnValue(null),
}));

const mockProblem: Problem = {
  id: 'test-problem',
  language: 'python',
  title: 'Test Problem',
  difficulty: 'easy',
  timeLimit: 10,
  prompt: 'Write a function that returns hello world',
  constraints: ['Input is always valid'],
  scaffold: 'def hello():\n    return "hello world"',
  examples: [{ input: 'none', output: 'hello world' }],
  expectedApproach: 'Return a string',
  commonPitfalls: ['Forgetting to return'],
  idealSolutionOutline: 'return "hello world"',
  evaluationNotes: 'Simple test',
  assessmentType: 'coding',
  domain: 'neetcode-50',
  problemSetId: 'neetcode-50',
};

const mockSecondProblem: Problem = {
  ...mockProblem,
  id: 'second-problem',
  title: 'Second Problem',
  scaffold: 'def second():\n    pass',
};

const mockCampaignProblem: Problem = {
  ...mockProblem,
  id: 'campaign-problem',
  title: 'CSV Min Max Scanner',
  prompt: 'Given a CSV file path, find the min and max internal_id values.',
  scaffold: 'def csv_min_max_scanner(file_path: str) -> dict[str, int]:\n    pass',
  expectedApproach: 'Stream the CSV and track running min and max.',
  commonPitfalls: ['Loading the full file'],
  idealSolutionOutline: 'Use csv.DictReader and running min/max',
  evaluationNotes: 'Streaming mindset matters',
  domain: 'python-fundamentals',
  problemSetId: 'python-fundamentals',
};

const mockEvaluation: EvaluationResult = {
  verdict: 'Pass',
  scores: {
    approach: 4,
    completeness: 4,
    complexity: 3,
    communication: 3,
  },
  feedback: {
    strengths: ['Good approach', 'Clean code'],
    improvements: ['Add comments'],
  },
  idealSolution: 'def hello():\n    return "hello world"',
  missTags: [],
};

describe('App session context', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers({ shouldAdvanceTime: true });

    const allProblems = [mockProblem, mockSecondProblem, mockCampaignProblem];

    vi.mocked(problemService.loadProblems).mockImplementation(async (selectedIds?: string[]) => {
      if (!selectedIds || selectedIds.length === 0) {
        return allProblems;
      }

      return allProblems.filter((problem) => selectedIds.includes(problem.problemSetId ?? ''));
    });
    vi.mocked(problemService.getRandomProblem).mockReturnValue(mockProblem);
    vi.mocked(problemService.getProblemById).mockImplementation((id: string) =>
      allProblems.find((problem) => problem.id === id) ?? null,
    );
    vi.mocked(problemService.getAvailableProblemSets).mockReturnValue([
      {
        id: 'neetcode-50',
        label: 'NeetCode 50',
        description: 'Core coding interview patterns and algorithms.',
        assessmentType: 'coding',
        domain: 'software-engineering',
        questionCount: 2,
      },
      {
        id: 'python-fundamentals',
        label: 'Python Fundamentals',
        description: 'Core Python practice.',
        assessmentType: 'coding',
        domain: 'python-fundamentals',
        questionCount: 1,
      },
    ]);
    vi.mocked(proctorService.generateIntro).mockResolvedValue('Welcome to the test!');
    vi.mocked(proctorService.respondToQuestion).mockResolvedValue('Here is my response.');
    vi.mocked(proctorService.evaluate).mockResolvedValue(mockEvaluation);
    vi.mocked(storageService.getSessions).mockReturnValue([]);

    localStorage.setItem(
      'coding-interview-problem-set-settings',
      JSON.stringify({ selectedProblemSetIds: ['neetcode-50', 'python-fundamentals'] }),
    );

    Object.defineProperty(globalThis.navigator, 'clipboard', {
      value: undefined,
      writable: true,
      configurable: true,
    });

    document.execCommand = vi.fn().mockReturnValue(true);
  });

  afterEach(() => {
    vi.useRealTimers();
    localStorage.clear();
  });

  it('clears previous chat when a new session starts from home', async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    render(<App />);

    await user.click(screen.getByTestId('start-session-button'));
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /ready\. start timer/i })).toBeInTheDocument();
      expect(screen.getByText('Welcome to the test!')).toBeInTheDocument();
    });

    await user.click(screen.getByRole('button', { name: /ready\. start timer/i }));
    await user.type(screen.getByTestId('chat-input'), 'Old session question');
    await user.click(screen.getByTestId('send-button'));

    await waitFor(() => {
      expect(screen.getByText('Old session question')).toBeInTheDocument();
      expect(screen.getByText('Here is my response.')).toBeInTheDocument();
    });

    await user.click(screen.getByTestId('submit-button'));
    await waitFor(() => expect(screen.getByTestId('confirm-dialog')).toBeInTheDocument());
    await user.click(screen.getByTestId('dialog-confirm-button'));

    await waitFor(() => {
      expect(screen.getByTestId('review-view')).toBeInTheDocument();
      expect(screen.getByTestId('candidate-solution-section')).toBeInTheDocument();
    });

    await user.click(screen.getByTestId('view-history-button'));
    await waitFor(() => expect(screen.getByTestId('history-view')).toBeInTheDocument());
    await user.click(screen.getByTestId('close-button'));
    await waitFor(() => expect(screen.getByTestId('home-view')).toBeInTheDocument());

    await user.click(screen.getByTestId('start-session-button'));
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /ready\. start timer/i })).toBeInTheDocument();
    });

    expect(screen.queryByText('Old session question')).not.toBeInTheDocument();
    expect(screen.queryByText('Here is my response.')).not.toBeInTheDocument();
  });

  it('hydrates legacy history sessions so review copy context includes the problem and candidate answer', async () => {
    const legacySession: SessionRecord = {
      id: 'legacy-session',
      problemId: mockProblem.id,
      problemTitle: mockProblem.title,
      timestamp: Date.now() - 60_000,
      duration: 240,
      finalCode: 'def hello():\n    return "hello world"',
      chatTranscript: [
        {
          id: 'chat-1',
          role: 'proctor',
          content: 'Welcome to the test!',
          timestamp: Date.now() - 55_000,
        },
      ],
      evaluation: mockEvaluation,
    };

    vi.mocked(storageService.getSessions).mockReturnValue([legacySession]);
    vi.mocked(storageService.getSession).mockReturnValue(legacySession);

    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    render(<App />);

    await user.click(screen.getByTestId('view-history-button'));
    await user.click(screen.getByTestId(`session-card-${legacySession.id}`));

    await waitFor(() => {
      expect(screen.getByTestId('review-view')).toBeInTheDocument();
      expect(screen.getByTestId('candidate-solution-section')).toBeInTheDocument();
      expect(screen.getByText('Test Problem')).toBeInTheDocument();
    });

    await user.click(screen.getByTestId('copy-review-context-button'));

    await waitFor(() => {
      expect(screen.getByTestId('copy-context-status')).toHaveTextContent('Copied');
    });
  });

  it('lets the user return home from the session top bar', async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    render(<App />);

    await user.click(screen.getByTestId('start-session-button'));

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /ready\. start timer/i })).toBeInTheDocument();
      expect(screen.getByTestId('home-nav-button')).toBeInTheDocument();
    });

    await user.click(screen.getByTestId('home-nav-button'));

    await waitFor(() => {
      expect(screen.getByTestId('home-view')).toBeInTheDocument();
    });
  });

  it('shows the same home navigation in review mode', async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    render(<App />);

    await user.click(screen.getByTestId('start-session-button'));
    await waitFor(() => expect(screen.getByRole('button', { name: /ready\. start timer/i })).toBeInTheDocument());
    await user.click(screen.getByRole('button', { name: /ready\. start timer/i }));
    await user.click(screen.getByTestId('submit-button'));
    await waitFor(() => expect(screen.getByTestId('confirm-dialog')).toBeInTheDocument());
    await user.click(screen.getByTestId('dialog-confirm-button'));

    await waitFor(() => {
      expect(screen.getByTestId('review-view')).toBeInTheDocument();
      expect(screen.getByTestId('home-nav-button')).toBeInTheDocument();
    });

    await user.click(screen.getByTestId('home-nav-button'));

    await waitFor(() => {
      expect(screen.getByTestId('home-view')).toBeInTheDocument();
    });
  });

  it('shows enabled campaign sets with attempt status and launches a chosen problem', async () => {
    const attemptedSession: SessionRecord = {
      id: 'attempted-session',
      problemId: mockProblem.id,
      problemTitle: mockProblem.title,
      timestamp: Date.now() - 5_000,
      duration: 320,
      finalCode: 'def hello():\n    return "hello world"',
      chatTranscript: [],
      evaluation: mockEvaluation,
      problemSnapshot: createProblemSnapshotForTest(mockProblem),
    };

    vi.mocked(storageService.getSessions).mockReturnValue([attemptedSession]);

    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    render(<App />);

    await user.click(screen.getByTestId('browse-campaign-button'));

    await waitFor(() => {
      expect(screen.getByTestId('campaign-view')).toBeInTheDocument();
      expect(screen.getByTestId('campaign-set-neetcode-50')).toBeInTheDocument();
      expect(screen.getByTestId('campaign-set-python-fundamentals')).toBeInTheDocument();
    });

    const attemptedCard = screen.getByTestId(`campaign-problem-${mockProblem.id}`);
    expect(within(attemptedCard).getByText('Passed')).toBeInTheDocument();
    expect(within(attemptedCard).getByText('1 attempt')).toBeInTheDocument();

    const freshCard = screen.getByTestId(`campaign-problem-${mockCampaignProblem.id}`);
    expect(within(freshCard).getByText('New')).toBeInTheDocument();
    expect(within(freshCard).getByText('Not attempted yet')).toBeInTheDocument();

    await user.click(screen.getByTestId(`campaign-start-problem-${mockCampaignProblem.id}`));

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /ready\. start timer/i })).toBeInTheDocument();
    });

    await user.click(screen.getByRole('button', { name: /ready\. start timer/i }));

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: 'CSV Min Max Scanner' })).toBeInTheDocument();
    });
  });
});

function createProblemSnapshotForTest(problem: Problem) {
  return {
    id: problem.id,
    title: problem.title,
    language: problem.language,
    difficulty: problem.difficulty,
    timeLimit: problem.timeLimit,
    prompt: problem.prompt,
    constraints: problem.constraints,
    examples: problem.examples,
    assessmentType: problem.assessmentType,
    domain: problem.domain,
    competencyTags: problem.competencyTags,
    problemSetId: problem.problemSetId,
    content: problem.content,
    contract: problem.contract,
  };
}
