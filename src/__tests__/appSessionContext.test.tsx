import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import App from '../App';
import { problemService } from '../services/problemService';
import { proctorService } from '../services/proctorService';
import { storageService } from '../services/storageService';
import type { EvaluationResult, Problem, SessionRecord } from '../types';

vi.mock('../auth/AuthProvider', () => ({
  AuthProvider: ({ children }: { children: any }) => <>{children}</>,
}));

vi.mock('../auth/RequireAuth', () => ({
  RequireAuth: ({ children }: { children: any }) => <>{children}</>,
}));

vi.mock('../auth/useAuth', () => ({
  useAuth: () => ({
    isLoaded: true,
    isAuthenticated: true,
    user: {
      id: 'user-1',
      email: 'tester@example.com',
      displayName: 'Test User',
      roles: [],
      authProvider: 'netlify',
    },
    profileKey: 'netlify:user-1',
    provider: 'netlify',
    error: null,
    callbackState: null,
    signupEnabled: false,
    oauthProviders: [],
    login: vi.fn(),
    logout: vi.fn(),
    signup: vi.fn(),
    requestPasswordRecovery: vi.fn(),
    acceptInvite: vi.fn(),
    updatePassword: vi.fn(),
    oauthLogin: vi.fn(),
    clearCallbackState: vi.fn(),
    refreshSession: vi.fn(),
    getAccessToken: vi.fn(async () => 'jwt-token'),
    hasRole: vi.fn().mockReturnValue(false),
    hasAnyRole: vi.fn().mockReturnValue(false),
  }),
}));

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
    configureAccessTokenProvider: vi.fn(),
    cancelPendingRequest: vi.fn(),
    evaluate: vi.fn(),
  },
}));

vi.mock('../services/storageService', () => ({
  storageService: {
    setStorageScope: vi.fn(),
    getSessions: vi.fn().mockReturnValue([]),
    saveSession: vi.fn(),
    getSession: vi.fn(),
    clearSessions: vi.fn(),
  },
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

const mockTutorialProblem: Problem = {
  id: 'tutorial-first-session',
  language: 'yaml',
  title: 'Your First Rep: Shoot Your Shot',
  difficulty: 'easy',
  timeLimit: 8,
  prompt: "How is James Joyce's Ulysses like programming?",
  constraints: ['Make a real attempt before asking for help.', 'Ask the Tutor for a nudge.'],
  scaffold: '# Your first rep\n# Try before you feel ready.\n\nanswer: \n\nquestion_for_tutor: ',
  examples: [{ input: 'I do not know who James Joyce is, but I can make a guess.', output: 'A real attempt is enough.' }],
  expectedApproach: 'Make a meaningful attempt under uncertainty.',
  commonPitfalls: ['Stopping at only I do not know'],
  idealSolutionOutline: 'A real first attempt that makes one guess, names uncertainty, asks for a nudge, and improves the answer before submitting.',
  evaluationNotes: 'Pass any meaningful attempt.',
  assessmentType: 'behavioral',
  domain: 'onboarding',
  problemSetId: 'tutorial',
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

    const allProblems = [mockTutorialProblem, mockProblem, mockSecondProblem, mockCampaignProblem];

    vi.mocked(problemService.loadProblems).mockImplementation(async (selectedIds?: string[]) => {
      if (!selectedIds || selectedIds.length === 0) {
        return allProblems.filter((problem) => problem.problemSetId === 'tutorial');
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
      'coding-interview-problem-set-settings:netlify:user-1',
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
      expect(screen.getByRole('button', { name: /^start$/i })).toBeInTheDocument();
      expect(screen.getByText('Welcome to the test!')).toBeInTheDocument();
    });

    expect(screen.getByTestId('session-workspace-toggle')).toBeInTheDocument();
    expect(screen.getByTestId('chat-panel')).toBeInTheDocument();
    expect(screen.getAllByTestId('chat-input')).toHaveLength(1);
    expect(screen.getByTestId('send-button')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /^start$/i }));
    await user.type(screen.getByTestId('chat-input'), 'Old session question');
    await user.click(screen.getByTestId('send-button'));

    await waitFor(() => {
      expect(screen.getByText('Old session question')).toBeInTheDocument();
      expect(screen.getByText('Here is my response.')).toBeInTheDocument();
    });

    await user.click(
      within(screen.getByTestId('session-workspace-toggle')).getByRole('button', { name: /answer/i }),
    );
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
      expect(screen.getByRole('button', { name: /^start$/i })).toBeInTheDocument();
    });

    expect(screen.queryByText('Old session question')).not.toBeInTheDocument();
    expect(screen.queryByText('Here is my response.')).not.toBeInTheDocument();
  });

  it('keeps the editor locked until the timer starts, then switches workspace panes', async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    render(<App />);

    await user.click(screen.getByTestId('start-session-button'));
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /^start$/i })).toBeInTheDocument();
    });

    const workspaceToggle = screen.getByTestId('session-workspace-toggle');
    const promptToggle = within(workspaceToggle).getByRole('button', { name: /question/i });
    const editorToggle = within(workspaceToggle).getByRole('button', { name: /answer/i });

    expect(promptToggle).toHaveAttribute('aria-pressed', 'true');
    expect(editorToggle).toHaveAttribute('aria-pressed', 'false');
    expect(editorToggle).toBeDisabled();
    expect(screen.getByText(/try one safe practice rep/i)).toBeInTheDocument();
    expect(screen.queryByText(/your answer/i)).not.toBeInTheDocument();

    await user.click(editorToggle);

    expect(promptToggle).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByText(/try one safe practice rep/i)).toBeInTheDocument();
    expect(screen.queryByText(/your answer/i)).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /^start$/i }));
    const activeEditorToggle = within(workspaceToggle).getByRole('button', { name: /^answer$/i });

    expect(activeEditorToggle).toBeEnabled();

    await user.click(activeEditorToggle);

    expect(promptToggle).toHaveAttribute('aria-pressed', 'false');
    expect(activeEditorToggle).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getAllByText(/your answer/i)).not.toHaveLength(0);
    expect(screen.queryByText(/try one safe practice rep/i)).not.toBeInTheDocument();
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
      expect(screen.getByRole('button', { name: /^start$/i })).toBeInTheDocument();
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
    await waitFor(() => expect(screen.getByRole('button', { name: /^start$/i })).toBeInTheDocument());
    await user.click(screen.getByRole('button', { name: /^start$/i }));
    await user.click(
      within(screen.getByTestId('session-workspace-toggle')).getByRole('button', { name: /answer/i }),
    );
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
      expect(screen.getByRole('button', { name: /^start$/i })).toBeInTheDocument();
    });

    await user.click(screen.getByRole('button', { name: /^start$/i }));

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: 'CSV Min Max Scanner' })).toBeInTheDocument();
    });
  });

  it('asks the user to choose next reps after the tutorial, then starts from that choice', async () => {
    localStorage.setItem(
      'coding-interview-problem-set-settings:netlify:user-1',
      JSON.stringify({ selectedProblemSetIds: [] }),
    );
    vi.mocked(problemService.getRandomProblem)
      .mockReturnValueOnce(mockTutorialProblem)
      .mockReturnValueOnce(mockCampaignProblem);

    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    render(<App />);

    await waitFor(() => {
      expect(screen.getByTestId('start-session-button')).toHaveTextContent('Start Tutorial');
    });

    await user.click(screen.getByTestId('start-session-button'));
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /^start$/i })).toBeInTheDocument();
    });

    await user.click(screen.getByRole('button', { name: /^start$/i }));
    await user.click(
      within(screen.getByTestId('session-workspace-toggle')).getByRole('button', { name: /answer/i }),
    );
    await user.click(screen.getByTestId('submit-button'));
    await waitFor(() => expect(screen.getByTestId('confirm-dialog')).toBeInTheDocument());
    await user.click(screen.getByTestId('dialog-confirm-button'));

    await waitFor(() => {
      expect(screen.getByTestId('review-view')).toBeInTheDocument();
      expect(screen.getByTestId('post-tutorial-practice-picker')).toBeInTheDocument();
      expect(screen.getByText('Choose your next reps')).toBeInTheDocument();
      expect(screen.getByTestId('next-problem-button')).toHaveTextContent('Start practicing');
    });

    expect(screen.getByTestId('next-problem-button')).toBeDisabled();

    await user.click(screen.getByTestId('post-tutorial-choice-python'));

    await user.click(screen.getByTestId('next-problem-button'));
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /^start$/i })).toBeInTheDocument();
    });

    expect(JSON.parse(localStorage.getItem('coding-interview-problem-set-settings:netlify:user-1') ?? '{}')).toEqual({
      selectedProblemSetIds: ['python-fundamentals'],
    });
    expect(problemService.loadProblems).toHaveBeenCalledWith(['python-fundamentals']);

    await user.click(screen.getByRole('button', { name: /^start$/i }));
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
