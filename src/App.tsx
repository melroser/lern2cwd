import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { CodeEditorPanel } from './components/CodeEditorPanel';
import { ChatPanel } from './components/ChatPanel';
import { ChatInput } from './components/ChatInput';
import { ReviewPanel } from './components/ReviewPanel';
import { HistoryPanel } from './components/HistoryPanel';
import { SettingsModal } from './components/SettingsModal';
import { AuthScreen } from './components/AuthScreen';
import { GuestDemoScreen } from './components/GuestDemoScreen';
import { AuthDebugPanel } from './components/AuthDebugPanel';
import { AuthStatusControls } from './components/AuthStatusControls';
import { AuthProvider } from './auth/AuthProvider';
import { RequireAuth } from './auth/RequireAuth';
import { getGuestDemoCodeFromPath } from './auth/guestSession';
import { useAuth } from './auth/useAuth';
import { useSession } from './hooks/useSession';
import { useTimer } from './hooks/useTimer';
import { useChat } from './hooks/useChat';
import { problemService } from './services/problemService';
import { proctorService } from './services/proctorService';
import { storageService } from './services/storageService';
import { getEditorSettings, saveEditorSettings, setEditorSettingsStorageScope, type ThemeMode } from './utils/editorSettings';
import {
  DEFAULT_SELECTED_PROBLEM_SETS,
  TUTORIAL_PROBLEM_SET_ID,
  getProblemSetSettings,
  saveProblemSetSettings,
  setProblemSetSettingsStorageScope,
} from './utils/problemSetSettings';
import type {
  Problem,
  EvaluationResult,
  SessionRecord,
  SessionProblemSnapshot,
  ProblemSetOption,
  ProctorInteractionMode,
  Verdict,
  ChatMessage,
} from './types';
import './App.css';

type ViewState = 'home' | 'session' | 'review' | 'history' | 'campaign';

type ProblemAttemptSummary = {
  attempts: number;
  hasPass: boolean;
  bestVerdict: Verdict | null;
  lastVerdict: Verdict | null;
  lastAttemptedAt: number | null;
};

type CampaignSection = {
  set: ProblemSetOption;
  problems: Problem[];
  attemptedCount: number;
  passedCount: number;
  nextProblem: Problem | null;
};

type CampaignFlow = {
  problemSetId: string;
  orderedProblemIds: string[];
} | null;

type PracticeAreaChoice = {
  id: string;
  label: string;
  description: string;
  problemSetIds: string[];
};

const VERDICT_PRIORITY: Record<Verdict, number> = {
  'No Pass': 0,
  Borderline: 1,
  Pass: 2,
};

const POST_TUTORIAL_PRACTICE_AREAS: PracticeAreaChoice[] = [
  {
    id: 'python',
    label: 'Python',
    description: 'Start with lists, loops, and small Python reps.',
    problemSetIds: ['python-fundamentals'],
  },
  {
    id: 'frontend',
    label: 'Frontend',
    description: 'Practice browser, UI, and accessibility tasks.',
    problemSetIds: ['frontend-wordpress'],
  },
  {
    id: 'debugging',
    label: 'Debugging',
    description: 'Work through implementation and reasoning drills.',
    problemSetIds: ['codesignal-tech-force'],
  },
  {
    id: 'behavioral',
    label: 'Behavioral',
    description: 'Practice explaining judgment, tradeoffs, and experience.',
    problemSetIds: ['behavioral-software-engineering'],
  },
  {
    id: 'mixed',
    label: 'Mixed Practice',
    description: 'Blend coding, frontend, and communication reps.',
    problemSetIds: ['python-fundamentals', 'frontend-wordpress', 'behavioral-software-engineering', 'codesignal-tech-force'],
  },
];

interface ConfirmDialogState {
  isOpen: boolean;
  timeRemaining: number;
}

type CopyStatus = 'idle' | 'copied' | 'error';

function haveSameSetIds(left: string[], right: string[]): boolean {
  if (left.length !== right.length) return false;
  const rightSet = new Set(right);
  return left.every((id) => rightSet.has(id));
}

async function copyTextToClipboard(text: string): Promise<void> {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(text);
    return;
  }

  const textarea = document.createElement('textarea');
  textarea.value = text;
  textarea.setAttribute('readonly', 'true');
  textarea.style.position = 'fixed';
  textarea.style.left = '-9999px';
  document.body.appendChild(textarea);
  textarea.select();
  const success = document.execCommand('copy');
  document.body.removeChild(textarea);
  if (!success) {
    throw new Error('Clipboard copy failed');
  }
}

function createProblemSnapshot(problem: Problem): SessionProblemSnapshot {
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

function getCampaignStatusLabel(summary?: ProblemAttemptSummary): string {
  if (!summary || summary.attempts === 0) return 'New';
  if (summary.hasPass) return 'Passed';
  if (summary.lastVerdict === 'Borderline') return 'Borderline';
  return 'Needs Work';
}

function getCampaignStatusClass(summary?: ProblemAttemptSummary): string {
  if (!summary || summary.attempts === 0) return 'statusNew';
  if (summary.hasPass) return 'statusPass';
  if (summary.lastVerdict === 'Borderline') return 'statusBorderline';
  return 'statusNoPass';
}

function getCampaignPreview(problem: Problem): string {
  const source = problem.content?.description ?? problem.prompt;
  return source.split(/\n+/)[0]?.trim() ?? problem.prompt;
}

function getTranscriptRoleLabel(role: ChatMessage['role'] | string): string {
  if (role === 'proctor') return 'TUTOR';
  if (role === 'user') return 'USER';
  return role.toUpperCase();
}

function getReadyGateCopy(problem: Problem | null) {
  if (problem?.id === 'tutorial-first-session') {
    return {
      title: 'Start the tutorial question.',
      subtitle: 'Press Start to reveal the question, unlock Help, and try a short answer.',
    };
  }

  return {
    title: 'Ready for the next question?',
    subtitle: 'Press Start to reveal the question, unlock Help, and begin the timer.',
  };
}

function buildLegacySnapshotFromSession(sessionRecord: SessionRecord): string {
  const transcript = sessionRecord.chatTranscript
    .map((msg) => `[${getTranscriptRoleLabel(msg.role)}] ${msg.content}`)
    .join('\n\n');

  return [
    '=== Session Context Snapshot ===',
    `Captured At: ${new Date().toISOString()}`,
    `Question ID: ${sessionRecord.problemId}`,
    `Title: ${sessionRecord.problemTitle}`,
    '',
    '--- Candidate Attempt ---',
    sessionRecord.finalCode || '(no code/answer entered yet)',
    '',
    '--- Tutor/User Chat ---',
    transcript || '(no chat messages yet)',
    '',
    '--- Evaluation ---',
    `Verdict: ${sessionRecord.evaluation.verdict}`,
    `Scores: approach=${sessionRecord.evaluation.scores.approach}, completeness=${sessionRecord.evaluation.scores.completeness}, complexity=${sessionRecord.evaluation.scores.complexity}, communication=${sessionRecord.evaluation.scores.communication}`,
    `Strengths: ${sessionRecord.evaluation.feedback.strengths.join(' | ') || '(none)'}`,
    `Improvements: ${sessionRecord.evaluation.feedback.improvements.join(' | ') || '(none)'}`,
    `Miss Tags: ${sessionRecord.evaluation.missTags.join(', ') || '(none)'}`,
    '',
    '--- Ideal Solution ---',
    sessionRecord.evaluation.idealSolution || '(no ideal solution captured)',
    '=== End Snapshot ===',
  ].join('\n');
}

function AppShell() {
  const auth = useAuth();
  const [systemTheme, setSystemTheme] = useState<'light' | 'dark'>(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return 'dark';
    return window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
  });

  // View state management
  const [currentView, setCurrentView] = useState<ViewState>('home');
  const [showSettings, setShowSettings] = useState(false);
  const [storageScopeReady, setStorageScopeReady] = useState(false);
  const [vimMode, setVimMode] = useState(false);
  const [themeMode, setThemeMode] = useState<ThemeMode>('system');
  const [problemTab, setProblemTab] = useState<'description' | 'constraints' | 'examples'>('description');
  const [sessionWorkspacePane, setSessionWorkspacePane] = useState<'problem' | 'editor'>('problem');
  const [topbarMenuOpen, setTopbarMenuOpen] = useState(false);
  const [proctorMode, setProctorMode] = useState<ProctorInteractionMode>(() => proctorService.getLastInteractionMode());
  const [copyStatus, setCopyStatus] = useState<CopyStatus>('idle');
  const [postTutorialPracticeChoiceIds, setPostTutorialPracticeChoiceIds] = useState<string[]>([]);
  const [selectedProblemSetIds, setSelectedProblemSetIds] = useState<string[]>(DEFAULT_SELECTED_PROBLEM_SETS);
  const [loadedProblems, setLoadedProblems] = useState<Problem[]>([]);
  const [problemSetOptions, setProblemSetOptions] = useState<ProblemSetOption[]>(
    () => problemService.getAvailableProblemSets()
  );

  const problemRef = useRef<HTMLDivElement>(null);
  const problemPanelRef = useRef<HTMLDivElement>(null);
  const proactiveNudgeRef = useRef<{ count: number; lastAt: number; lastCodeDigest: string }>({
    count: 0,
    lastAt: 0,
    lastCodeDigest: '',
  });
  const latestCodeRef = useRef('');
  
  // Session state
  const [currentProblem, setCurrentProblem] = useState<Problem | null>(null);
  const [currentEvaluation, setCurrentEvaluation] = useState<EvaluationResult | null>(null);
  const [reviewSession, setReviewSession] = useState<SessionRecord | null>(null);
  const [activeCampaignFlow, setActiveCampaignFlow] = useState<CampaignFlow>(null);
  
  // Confirmation dialog state
  const [confirmDialog, setConfirmDialog] = useState<ConfirmDialogState>({
    isOpen: false,
    timeRemaining: 0,
  });
  
  // Hooks
  const sessionHook = useSession();
  const chat = useChat();
  const addChatMessage = chat.addMessage;
  const isSessionPendingStart = sessionHook.session?.status === 'waiting_to_start';
  const isSessionActive = sessionHook.session?.status === 'active';
  const isTutorialMode = selectedProblemSetIds.length === 0;
  const readyGateCopy = getReadyGateCopy(currentProblem);

  useEffect(() => {
    storageService.setStorageScope(auth.profileKey);
    setEditorSettingsStorageScope(auth.profileKey);
    setProblemSetSettingsStorageScope(auth.profileKey);
    setStorageScopeReady(true);
  }, [auth.profileKey]);

  useEffect(() => {
    proctorService.configureAccessTokenProvider(
      auth.isAuthenticated ? auth.getAccessToken : null,
    );
  }, [auth.getAccessToken, auth.isAuthenticated]);

  useEffect(() => {
    latestCodeRef.current = sessionHook.session?.code ?? latestCodeRef.current;
  }, [sessionHook.session?.code]);

  useEffect(() => {
    if (currentView === 'session') {
      setSessionWorkspacePane('problem');
    }
  }, [currentProblem?.id, currentView]);

  useEffect(() => {
    if (isSessionPendingStart && sessionWorkspacePane === 'editor') {
      setSessionWorkspacePane('problem');
    }
  }, [isSessionPendingStart, sessionWorkspacePane]);

  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return undefined;

    const mediaQuery = window.matchMedia('(prefers-color-scheme: light)');
    const handleChange = (event: MediaQueryListEvent) => {
      setSystemTheme(event.matches ? 'light' : 'dark');
    };

    setSystemTheme(mediaQuery.matches ? 'light' : 'dark');
    mediaQuery.addEventListener('change', handleChange);
    return () => mediaQuery.removeEventListener('change', handleChange);
  }, []);

  const resolveProblemSnapshot = useCallback((
    sessionRecord?: SessionRecord | null,
    liveProblem?: Problem | null
  ): SessionProblemSnapshot | null => {
    if (sessionRecord?.problemSnapshot) {
      return sessionRecord.problemSnapshot;
    }

    if (liveProblem) {
      return createProblemSnapshot(liveProblem);
    }

    if (sessionRecord?.problemId) {
      const matchedProblem = problemService.getProblemById(sessionRecord.problemId);
      if (matchedProblem) {
        return createProblemSnapshot(matchedProblem);
      }
    }

    return null;
  }, []);
  
  // Load editor settings once storage scope is ready.
  useEffect(() => {
    if (!storageScopeReady) return;

    const editorSettings = getEditorSettings();
    setVimMode(editorSettings.vimMode);
    setThemeMode(editorSettings.themeMode);
    setSelectedProblemSetIds(getProblemSetSettings().selectedProblemSetIds);
  }, [auth.profileKey, storageScopeReady]);

  const resolvedTheme = themeMode === 'system' ? systemTheme : themeMode;

  useEffect(() => {
    document.documentElement.dataset.theme = resolvedTheme;
    document.documentElement.style.colorScheme = resolvedTheme;
  }, [resolvedTheme]);

  useEffect(() => {
    setTopbarMenuOpen(false);
  }, [currentView, currentProblem?.id, showSettings]);
  
  // Load problems when selected sets change
  useEffect(() => {
    if (!storageScopeReady) return;

    problemService.loadProblems(selectedProblemSetIds).then((problems) => {
      setLoadedProblems(problems);
      setProblemSetOptions(problemService.getAvailableProblemSets());
    }).catch(console.error);
  }, [selectedProblemSetIds, storageScopeReady]);

  // Auto-scale problem text to fit the panel
  useEffect(() => {
    const problemEl = problemRef.current;
    const panelEl = problemPanelRef.current;
    if (!problemEl || !panelEl) return;

    const fit = () => {
      const maxSize = 26;
      const minSize = 16;
      let size = maxSize;
      problemEl.style.setProperty('--problem-font-size', `${size}px`);
      problemEl.style.setProperty('--problem-line-height', '1.45');

      let guard = 0;
      while (panelEl.scrollHeight > panelEl.clientHeight && size > minSize && guard < 32) {
        size -= 1;
        problemEl.style.setProperty('--problem-font-size', `${size}px`);
        guard += 1;
      }

      panelEl.style.overflowY = panelEl.scrollHeight > panelEl.clientHeight ? 'auto' : 'hidden';
    };

    const rafFit = () => {
      requestAnimationFrame(fit);
    };

    rafFit();

    const ro = new ResizeObserver(rafFit);
    ro.observe(problemEl);
    ro.observe(panelEl);

    return () => ro.disconnect();
  }, [currentProblem, problemTab]);

  const applyProblemSetSelection = useCallback(async (setIds: string[]) => {
    const nextSetIds = Array.from(new Set(setIds.filter((id) => id.trim().length > 0)));
    if (!haveSameSetIds(selectedProblemSetIds, nextSetIds)) {
      setSelectedProblemSetIds(nextSetIds);
      saveProblemSetSettings({ selectedProblemSetIds: nextSetIds });
    }

    const problems = await problemService.loadProblems(nextSetIds);
    setLoadedProblems(problems);
    setProblemSetOptions(problemService.getAvailableProblemSets());
    return problems;
  }, [selectedProblemSetIds]);
  
  // Handle actual submission for evaluation
  const handleSubmitForEvaluation = useCallback(async () => {
    if (!currentProblem || !isSessionActive) return;
    
    // Capture timeRemaining immediately before any async operations
    const capturedTimeRemaining = timerWithExpiry.timeRemaining;
    
    try {
      // Close confirmation dialog if open
      setConfirmDialog({ isOpen: false, timeRemaining: 0 });
      
      // Stop timer
      timerWithExpiry.pause();
      
      // Set session to evaluating state
      await sessionHook.submitForEvaluation();
      
      // Cancel any pending proctor requests
      proctorService.cancelPendingRequest();
      
      // Get evaluation
      const submittedCode = latestCodeRef.current || sessionHook.session!.code;
      const evaluation = await proctorService.evaluate(
        submittedCode,
        currentProblem,
        chat.messages
      );
      
      setCurrentEvaluation(evaluation);
      
      // Calculate session duration using captured value
      const duration = (currentProblem.timeLimit * 60) - capturedTimeRemaining;
      
      // Save session to storage
      const sessionRecord: SessionRecord = {
        id: sessionHook.session!.id,
        problemId: currentProblem.id,
        problemTitle: currentProblem.title,
        timestamp: Date.now(),
        duration,
        finalCode: submittedCode,
        chatTranscript: chat.messages,
        evaluation,
        problemSnapshot: createProblemSnapshot(currentProblem),
      };
      
      storageService.saveSession(sessionRecord);
      setReviewSession(sessionRecord);
      
      // Complete session
      sessionHook.endSession();
      
      // Navigate to review
      setCurrentView('review');
    } catch (error) {
      console.error('Evaluation failed:', error);
      // Reset session state on error
      timerWithExpiry.reset();
      setCurrentView('home');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentProblem, sessionHook, chat.messages]);
  
  // Handle timer expiry - triggers submission when time runs out
  const handleTimerExpiry = useCallback(() => {
    if (sessionHook.session?.status === 'active') {
      handleSubmitForEvaluation();
    }
  }, [sessionHook.session?.status, handleSubmitForEvaluation]);
  
  // Initialize timer with expiry callback
  const timerWithExpiry = useTimer(handleTimerExpiry);
  
  // Start a session from a specific problem
  const startSessionWithProblem = useCallback(async (problem: Problem, flow: CampaignFlow = null) => {
    try {
      proctorService.cancelPendingRequest();
      timerWithExpiry.reset();
      chat.clearMessages();
      
      setCurrentProblem(problem);
      setCurrentEvaluation(null);
      setProblemTab('description');
      setProctorMode('idle');
      setCopyStatus('idle');
      setReviewSession(null);
      setActiveCampaignFlow(flow);
      proactiveNudgeRef.current = { count: 0, lastAt: 0, lastCodeDigest: '' };
      latestCodeRef.current = problem.scaffold;
      
      // Start session in waiting_to_start state
      sessionHook.startSession(problem);
      
      // DON'T start timer yet - wait for user to say ready
      
      // Generate proctor intro
      const intro = await proctorService.generateIntro(problem);
      chat.addMessage({ role: 'proctor', content: intro });
      
      // Navigate to session view
      setCurrentView('session');
    } catch (error) {
      console.error('Failed to start session:', error);
    }
  }, [sessionHook, chat, timerWithExpiry]);

  // Start a new random session
  const handleStartSession = useCallback(async () => {
    try {
      const problem = problemService.getRandomProblem();
      if (!problem) {
        console.error('No problems available');
        return;
      }

      await startSessionWithProblem(problem, null);
    } catch (error) {
      console.error('Failed to start random session:', error);
    }
  }, [startSessionWithProblem]);

  // Proactive proctor nudges while the candidate is drafting.
  useEffect(() => {
    if (!currentProblem || !isSessionActive) return;

    const code = latestCodeRef.current || sessionHook.session?.code || '';
    const codeDigest = code.replace(/\s+/g, '').slice(0, 280);
    const now = Date.now();
    const { count, lastAt, lastCodeDigest } = proactiveNudgeRef.current;

    if (count >= 3) return;
    if (now - lastAt < 90000) return;
    if (codeDigest === lastCodeDigest) return;

    const timeoutId = window.setTimeout(() => {
      const context = {
        problem: currentProblem,
        currentCode: code,
        chatHistory: chat.messages,
        timeRemaining: timerWithExpiry.timeRemaining,
      };

      const nudge = proctorService.getProactiveNudge(context);
      if (!nudge) return;

      addChatMessage({ role: 'proctor', content: nudge });
      proactiveNudgeRef.current = {
        count: proactiveNudgeRef.current.count + 1,
        lastAt: Date.now(),
        lastCodeDigest: codeDigest,
      };
    }, 12000);

    return () => window.clearTimeout(timeoutId);
  }, [
    currentProblem,
    isSessionActive,
    sessionHook.session?.code,
    timerWithExpiry.timeRemaining,
    chat.messages,
    addChatMessage,
  ]);

  const handleEditorCodeChange = useCallback((nextCode: string) => {
    latestCodeRef.current = nextCode;
    sessionHook.updateCode(nextCode);
  }, [sessionHook]);
  
  // Handle submit button click
  const handleSubmitClick = useCallback(() => {
    const timeRemaining = timerWithExpiry.timeRemaining;
    
    // If more than 5 minutes remaining, show confirmation dialog
    if (timeRemaining > 300) { // 5 minutes = 300 seconds
      setConfirmDialog({
        isOpen: true,
        timeRemaining,
      });
    } else {
      // Submit immediately
      handleSubmitForEvaluation();
    }
  }, [timerWithExpiry.timeRemaining, handleSubmitForEvaluation]);
  
  // Handle chat message send
  const handleSendMessage = useCallback(async (message: string) => {
    if (!currentProblem) return;
    
    // Check if user is ready to start (waiting_to_start state)
    if (isSessionPendingStart) {
      // Do not start timer from chat; require explicit Ready action
      chat.addMessage({ role: 'user', content: message });
      chat.addMessage({ role: 'proctor', content: 'Press Start to reveal the question and unlock Help.' });
      return;
    }
    
    // Normal chat flow for active sessions
    if (!isSessionActive) return;
    
    try {
      // Get proctor response
      const context = {
        problem: currentProblem,
        currentCode: latestCodeRef.current || sessionHook.session!.code,
        chatHistory: chat.messages,
        timeRemaining: timerWithExpiry.timeRemaining,
      };
      
      const response = await proctorService.respondToQuestion(message, context);
      setProctorMode(proctorService.getLastInteractionMode());
      
      // Add both user message and proctor response
      chat.addMessage({ role: 'user', content: message });
      chat.addMessage({ role: 'proctor', content: response });
    } catch (error) {
      console.error('Failed to get proctor response:', error);
      setProctorMode('fallback');
      chat.addMessage({ role: 'user', content: message });
      chat.addMessage({ role: 'proctor', content: 'Sorry, I encountered an error. Please try asking your question again.' });
    }
  }, [currentProblem, isSessionActive, isSessionPendingStart, sessionHook, chat, timerWithExpiry]);

  const handleReadyStart = useCallback(() => {
    if (!currentProblem) return;
    if (!isSessionPendingStart) return;

    sessionHook.activateSession();
    timerWithExpiry.start(currentProblem.timeLimit * 60);
    chat.addMessage({
      role: 'proctor',
      content: `Let's begin. ${currentProblem.tutorPlan?.openingPrompt ?? 'What are you thinking for your answer?'}`,
    });
  }, [currentProblem, isSessionPendingStart, sessionHook, timerWithExpiry, chat]);

  const handleProblemSetSelectionChange = useCallback((setIds: string[]) => {
    setSelectedProblemSetIds(setIds);
    saveProblemSetSettings({ selectedProblemSetIds: setIds });
  }, []);

  const handleThemeModeChange = useCallback((nextThemeMode: ThemeMode) => {
    setThemeMode(nextThemeMode);
    saveEditorSettings({ themeMode: nextThemeMode });
  }, []);

  const handleThemeToggle = useCallback(() => {
    const nextThemeMode: ThemeMode = resolvedTheme === 'dark' ? 'light' : 'dark';
    handleThemeModeChange(nextThemeMode);
    setTopbarMenuOpen(false);
  }, [handleThemeModeChange, resolvedTheme]);

  const handleOpenSettings = useCallback(() => {
    setTopbarMenuOpen(false);
    setShowSettings(true);
  }, []);

  const handleToggleTopbarMenu = useCallback(() => {
    setTopbarMenuOpen((open) => !open);
  }, []);

  const getNextCampaignProblem = useCallback((): Problem | null => {
    if (!activeCampaignFlow || !currentProblem) return null;

    const currentIndex = activeCampaignFlow.orderedProblemIds.indexOf(currentProblem.id);
    if (currentIndex === -1) return null;

    for (let index = currentIndex + 1; index < activeCampaignFlow.orderedProblemIds.length; index += 1) {
      const nextProblemId = activeCampaignFlow.orderedProblemIds[index];
      const nextProblem = problemService.getProblemById(nextProblemId);
      if (nextProblem) {
        return nextProblem;
      }
    }

    return null;
  }, [activeCampaignFlow, currentProblem]);
  
  const isFirstTutorialReview = (
    reviewSession?.problemSnapshot?.id === 'tutorial-first-session' ||
    currentProblem?.id === 'tutorial-first-session'
  ) && currentView === 'review';

  const selectedPostTutorialProblemSetIds = useMemo(() => {
    return Array.from(new Set(
      POST_TUTORIAL_PRACTICE_AREAS
        .filter((area) => postTutorialPracticeChoiceIds.includes(area.id))
        .flatMap((area) => area.problemSetIds),
    ));
  }, [postTutorialPracticeChoiceIds]);

  const handlePostTutorialPracticeChoiceToggle = useCallback((choiceId: string) => {
    setPostTutorialPracticeChoiceIds((current) =>
      current.includes(choiceId)
        ? current.filter((id) => id !== choiceId)
        : [...current, choiceId]
    );
  }, []);

  // Handle next problem
  const handleNextProblem = useCallback(async () => {
    if (isFirstTutorialReview) {
      if (selectedPostTutorialProblemSetIds.length === 0) {
        return;
      }

      const problems = await applyProblemSetSelection(selectedPostTutorialProblemSetIds);
      const problem = problems[0] ?? problemService.getRandomProblem();
      await startSessionWithProblem(problem, null);
      setPostTutorialPracticeChoiceIds([]);
      return;
    }

    // Reset all state
    timerWithExpiry.reset();
    chat.clearMessages();
    setCurrentProblem(null);
    setCurrentEvaluation(null);
    setReviewSession(null);
    setProblemTab('description');
    setCopyStatus('idle');
    setProctorMode('idle');

    const nextCampaignProblem = getNextCampaignProblem();
    if (nextCampaignProblem && activeCampaignFlow) {
      startSessionWithProblem(nextCampaignProblem, activeCampaignFlow);
      return;
    }

    if (activeCampaignFlow) {
      latestCodeRef.current = '';
      setCurrentView('campaign');
      setCurrentProblem(null);
      return;
    }

    // Start new random session
    handleStartSession();
  }, [
    timerWithExpiry,
    chat,
    handleStartSession,
    getNextCampaignProblem,
    activeCampaignFlow,
    startSessionWithProblem,
    reviewSession,
    currentProblem,
    isFirstTutorialReview,
    selectedPostTutorialProblemSetIds,
    applyProblemSetSelection,
  ]);

  const handleViewCampaign = useCallback(() => {
    setCurrentView('campaign');
    setCopyStatus('idle');
  }, []);
  
  // Handle view history
  const handleViewHistory = useCallback(() => {
    setActiveCampaignFlow(null);
    setCurrentView('history');
  }, []);
  
  // Handle back to home
  const handleBackToHome = useCallback(() => {
    proctorService.cancelPendingRequest();
    timerWithExpiry.reset();
    chat.clearMessages();
    latestCodeRef.current = '';
    setCurrentView('home');
    setCurrentProblem(null);
    setCurrentEvaluation(null);
    setReviewSession(null);
    setProblemTab('description');
    setCopyStatus('idle');
    setProctorMode('idle');
    setActiveCampaignFlow(null);
  }, [chat, timerWithExpiry]);
  
  // Handle session selection from history
  const handleSelectSession = useCallback((sessionId: string) => {
    const sessionRecord = storageService.getSession(sessionId);
    if (sessionRecord) {
      const matchedProblem = problemService.getProblemById(sessionRecord.problemId);
      const hydratedSessionRecord = sessionRecord.problemSnapshot || !matchedProblem
        ? sessionRecord
        : {
            ...sessionRecord,
            problemSnapshot: createProblemSnapshot(matchedProblem),
          };

      latestCodeRef.current = sessionRecord.finalCode;
      setCurrentProblem(matchedProblem);
      setReviewSession(hydratedSessionRecord);
      setCurrentEvaluation(sessionRecord.evaluation);
      setActiveCampaignFlow(null);
      setCurrentView('review');
    }
  }, []);
  
  // Get stored sessions for history
  const storedSessions = storageScopeReady ? storageService.getSessions() : [];

  const problemAttemptMap = useMemo<Record<string, ProblemAttemptSummary>>(() => {
    const summaries: Record<string, ProblemAttemptSummary> = {};

    for (const session of storedSessions) {
      const existing = summaries[session.problemId] ?? {
        attempts: 0,
        hasPass: false,
        bestVerdict: null,
        lastVerdict: null,
        lastAttemptedAt: null,
      };

      const verdict = session.evaluation.verdict;
      const isNewerAttempt = existing.lastAttemptedAt === null || session.timestamp > existing.lastAttemptedAt;
      const currentBestPriority = existing.bestVerdict ? VERDICT_PRIORITY[existing.bestVerdict] : -1;
      const nextPriority = VERDICT_PRIORITY[verdict];

      summaries[session.problemId] = {
        attempts: existing.attempts + 1,
        hasPass: existing.hasPass || verdict === 'Pass',
        bestVerdict: nextPriority > currentBestPriority ? verdict : existing.bestVerdict,
        lastVerdict: isNewerAttempt ? verdict : existing.lastVerdict,
        lastAttemptedAt: isNewerAttempt ? session.timestamp : existing.lastAttemptedAt,
      };
    }

    return summaries;
  }, [storedSessions]);

  const campaignSections = useMemo<CampaignSection[]>(() => {
    const enabledOptions = problemSetOptions.filter((option) =>
      selectedProblemSetIds.includes(option.id),
    );

    const sections: CampaignSection[] = [];

    for (const set of enabledOptions) {
      const problems = loadedProblems.filter((problem) => problem.problemSetId === set.id);
      if (problems.length === 0) {
        continue;
      }

      const attemptedCount = problems.filter((problem) => (problemAttemptMap[problem.id]?.attempts ?? 0) > 0).length;
      const passedCount = problems.filter((problem) => problemAttemptMap[problem.id]?.hasPass).length;
      const nextProblem =
        problems.find((problem) => (problemAttemptMap[problem.id]?.attempts ?? 0) === 0) ??
        problems.find((problem) => !problemAttemptMap[problem.id]?.hasPass) ??
        problems[0] ??
        null;

      sections.push({
        set,
        problems,
        attemptedCount,
        passedCount,
        nextProblem,
      });
    }

    return sections;
  }, [loadedProblems, problemAttemptMap, problemSetOptions, selectedProblemSetIds]);

  const currentProblemSetInfo = useMemo(() => {
    if (!currentProblem?.problemSetId) {
      return null;
    }

    const setMeta = problemSetOptions.find((option) => option.id === currentProblem.problemSetId);
    const setProblems = loadedProblems.filter((problem) => problem.problemSetId === currentProblem.problemSetId);
    const ordinal = setProblems.findIndex((problem) => problem.id === currentProblem.id);

    return {
      label: setMeta?.label ?? currentProblem.problemSetId,
      total: setProblems.length > 0 ? setProblems.length : null,
      ordinal: ordinal >= 0 ? ordinal + 1 : null,
    };
  }, [currentProblem, loadedProblems, problemSetOptions]);

  const nextReviewActionLabel = useMemo(() => {
    const reviewProblemSetId = reviewSession?.problemSnapshot?.problemSetId ?? currentProblem?.problemSetId;

    if (reviewProblemSetId === TUTORIAL_PROBLEM_SET_ID) {
      return 'Start practicing';
    }

    if (!activeCampaignFlow) {
      return 'Next Question';
    }

    return getNextCampaignProblem() ? 'Next Question' : 'Back to Practice';
  }, [activeCampaignFlow, currentProblem, getNextCampaignProblem, reviewSession]);

  const handleStartCampaignProblem = useCallback(async (problem: Problem, orderedProblemIds: string[]) => {
    await startSessionWithProblem(problem, {
      problemSetId: problem.problemSetId ?? 'campaign',
      orderedProblemIds,
    });
  }, [startSessionWithProblem]);

  const handleContinueCampaignSet = useCallback(async (section: CampaignSection) => {
    if (!section.nextProblem) {
      return;
    }

    await handleStartCampaignProblem(
      section.nextProblem,
      section.problems.map((problem) => problem.id),
    );
  }, [handleStartCampaignProblem]);

  const buildSessionContextSnapshot = useCallback((): string => {
    const problemSnapshot = resolveProblemSnapshot(reviewSession, currentProblem);
    const evaluation = reviewSession?.evaluation ?? currentEvaluation;
    const code = reviewSession?.finalCode ?? latestCodeRef.current ?? sessionHook.session?.code ?? '';
    const transcriptMessages = reviewSession?.chatTranscript ?? chat.messages;

    if (!problemSnapshot) {
      if (reviewSession) {
        return buildLegacySnapshotFromSession(reviewSession);
      }
      return 'No question context available.';
    }

    const description = problemSnapshot.content?.description ?? problemSnapshot.prompt;
    const constraints = problemSnapshot.content?.constraints ?? problemSnapshot.constraints;
    const examples = problemSnapshot.content?.examples ?? problemSnapshot.examples;
    const transcript = transcriptMessages
      .map((msg) => `[${getTranscriptRoleLabel(msg.role)}] ${msg.content}`)
      .join('\n\n');

    const examplesBlock = examples
      .map((example, index) => {
        const explanation = example.explanation ? `\nExplanation: ${example.explanation}` : '';
        return `Example ${index + 1}:\nInput: ${example.input}\nOutput: ${example.output}${explanation}`;
      })
      .join('\n\n');

    return [
      '=== Session Context Snapshot ===',
      `Captured At: ${new Date().toISOString()}`,
      `Question ID: ${problemSnapshot.id}`,
      `Practice Area: ${problemSnapshot.problemSetId ?? 'unknown'}`,
      `Title: ${problemSnapshot.title}`,
      `Assessment Type: ${problemSnapshot.assessmentType ?? 'coding'}`,
      `Difficulty: ${problemSnapshot.difficulty}`,
      `Language: ${problemSnapshot.language}`,
      `Time Remaining: ${currentView === 'session' ? `${Math.floor(timerWithExpiry.timeRemaining / 60).toString().padStart(2, '0')}:${(timerWithExpiry.timeRemaining % 60).toString().padStart(2, '0')}` : 'session ended'}`,
      '',
      '--- Question ---',
      description,
      '',
      '--- Rules ---',
      constraints.map((constraint) => `- ${constraint}`).join('\n'),
      '',
      '--- Examples ---',
      examplesBlock || 'No examples provided.',
      '',
      '--- Candidate Attempt ---',
      code || '(no code/answer entered yet)',
      '',
      '--- Tutor/User Chat ---',
      transcript || '(no chat messages yet)',
      '',
      '--- Evaluation ---',
      evaluation ? `Verdict: ${evaluation.verdict}` : 'No evaluation yet.',
      evaluation ? `Scores: approach=${evaluation.scores.approach}, completeness=${evaluation.scores.completeness}, complexity=${evaluation.scores.complexity}, communication=${evaluation.scores.communication}` : '',
      evaluation ? `Strengths: ${evaluation.feedback.strengths.join(' | ') || '(none)'}` : '',
      evaluation ? `Improvements: ${evaluation.feedback.improvements.join(' | ') || '(none)'}` : '',
      evaluation ? `Miss Tags: ${evaluation.missTags.join(', ') || '(none)'}` : '',
      evaluation ? '' : '',
      evaluation ? '--- Ideal Solution ---' : '',
      evaluation?.idealSolution ?? '',
      '=== End Snapshot ===',
    ].join('\n');
  }, [reviewSession, currentProblem, currentEvaluation, sessionHook.session?.code, chat.messages, timerWithExpiry.timeRemaining, currentView, resolveProblemSnapshot]);

  const handleCopySessionContext = useCallback(async () => {
    try {
      const snapshot = buildSessionContextSnapshot();
      await copyTextToClipboard(snapshot);
      setCopyStatus('copied');
    } catch (error) {
      console.error('Failed to copy session context:', error);
      setCopyStatus('error');
    }

    window.setTimeout(() => setCopyStatus('idle'), 2000);
  }, [buildSessionContextSnapshot]);
  
  // Format time remaining for confirmation dialog
  const formatTimeRemaining = (seconds: number): string => {
    const minutes = Math.floor(seconds / 60);
    return minutes === 1 ? '1 minute' : `${minutes} minutes`;
  };

  const topbarClassName = `topbar${topbarMenuOpen ? ' menuOpen' : ''}`;
  const topbarMetaClassName = `meta${topbarMenuOpen ? ' menuOpen' : ''}`;
  const themeToggleLabel = resolvedTheme === 'dark' ? 'Light Mode' : 'Dark Mode';
  const postTutorialPracticePicker = isFirstTutorialReview ? (
    <section className="postTutorialPicker" data-testid="post-tutorial-practice-picker">
      <div className="postTutorialPickerHeader">
        <h3>Choose your next reps</h3>
        <p>Pick what you want to practice next. You can change this later in Settings.</p>
      </div>

      <div className="postTutorialChoiceGrid">
        {POST_TUTORIAL_PRACTICE_AREAS.map((area) => {
          const selected = postTutorialPracticeChoiceIds.includes(area.id);
          return (
            <button
              key={area.id}
              type="button"
              className={`postTutorialChoice ${selected ? 'selected' : ''}`}
              data-testid={`post-tutorial-choice-${area.id}`}
              aria-pressed={selected}
              onClick={() => handlePostTutorialPracticeChoiceToggle(area.id)}
            >
              <span className="postTutorialChoiceTitle">{area.label}</span>
              <span className="postTutorialChoiceDescription">{area.description}</span>
            </button>
          );
        })}
      </div>
    </section>
  ) : null;
  
  return (
    <>
      {/* Background layers */}
      <div className="retro-grid" />
      <div className="retro-sun" />
      <div className="crt-overlay" />
      <div className="scanline" />
      
      <div className="app">
        <div className="crt">
          <div className="shell">
            {/* HUD Corners */}
            <div className="hud-corner tl"></div>
            <div className="hud-corner tr"></div>
            <div className="hud-corner bl"></div>
            <div className="hud-corner br"></div>

        {/* Settings Modal */}
        {showSettings && (
          <SettingsModal
            isOpen={showSettings}
            onClose={() => setShowSettings(false)}
            onSave={() => setShowSettings(false)}
            onVimModeChange={(enabled: boolean) => setVimMode(enabled)}
            onThemeModeChange={handleThemeModeChange}
            vimMode={vimMode}
            themeMode={themeMode}
            problemSetOptions={problemSetOptions}
            selectedProblemSetIds={selectedProblemSetIds}
            onProblemSetSelectionChange={handleProblemSetSelectionChange}
          />
        )}

        {/* Confirmation Dialog */}
        {confirmDialog.isOpen && (
          <div style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0,0,0,0.8)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1000
          }} data-testid="confirm-dialog">
            <div style={{
              background: 'rgba(5,10,7,0.95)',
              borderRadius: '16px',
              padding: '2rem',
              maxWidth: '500px',
              width: '90%',
              border: '1px solid rgba(96,255,160,0.22)',
              boxShadow: '0 0 30px rgba(0,255,120,0.15)'
            }}>
              <h3 style={{ color: 'var(--cool)', marginBottom: '1rem' }}>Submit Attempt?</h3>
              <p style={{ color: 'rgba(182,255,182,0.9)', marginBottom: '1.5rem' }}>
                You have {formatTimeRemaining(confirmDialog.timeRemaining)} left. 
                Are you sure you want to submit now?
              </p>
              <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end' }}>
                <button
                  className="btn"
                  data-testid="dialog-cancel-button"
                  onClick={() => setConfirmDialog({ isOpen: false, timeRemaining: 0 })}
                >
                  Cancel
                </button>
                <button
                  className="btn primary"
                  data-testid="dialog-confirm-button"
                  onClick={() => handleSubmitForEvaluation()}
                >
                  Submit
                </button>
              </div>
            </div>
          </div>
        )}
        
            {/* Home View */}
            {currentView === 'home' && (
              <div className="home-view" data-testid="home-view">
                <div className="home-content">
                  <h1>Lern2Cwd</h1>
                  <p>Practice short interview questions with instant feedback.</p>

                  <div className="homeMetaBar">
                    <AuthStatusControls />
                  </div>
                  
                  <div className="home-actions">
                    <button
                      data-testid="start-session-button"
                      className="btn primary"
                      onClick={handleStartSession}
                    >
                      {isTutorialMode ? 'Start Tutorial' : 'Start Random Question'}
                    </button>

                    {isTutorialMode && (
                      <p className="homeHint">
                        Finish the tutorial, then choose what you want to practice next.
                      </p>
                    )}

                    <button
                      data-testid="browse-campaign-button"
                      className="btn"
                      onClick={handleViewCampaign}
                    >
                      Browse Practice
                    </button>
                    
                    {storedSessions.length > 0 && (
                      <button
                        data-testid="view-history-button"
                        className="btn"
                        onClick={handleViewHistory}
                      >
                        View History ({storedSessions.length} sessions)
                      </button>
                    )}
                    
                    <button
                      className="btn"
                      onClick={handleOpenSettings}
                    >
                      Settings
                    </button>

                  </div>
                </div>
              </div>
            )}

            {currentView === 'campaign' && (
              <div className="appViewShell" data-testid="campaign-view">
                <div className={`${topbarClassName} appTopbar`}>
                  <div className="brand">
                    <span className="dot"></span>
                    <span>LERN2CWD</span>
                    <span style={{ color: 'var(--cool)' }}>/</span>
                    <span style={{ color: 'var(--hot)' }}>PRACTICE</span>
                  </div>
                  <button
                    type="button"
                    className="topbarMenuButton"
                    aria-label={topbarMenuOpen ? 'Close navigation menu' : 'Open navigation menu'}
                    aria-expanded={topbarMenuOpen}
                    onClick={handleToggleTopbarMenu}
                  >
                    {topbarMenuOpen ? '✕' : '☰'}
                  </button>
                  <div className={topbarMetaClassName}>
                    <div className="pill">
                      <span>MODE</span>
                      <span style={{ color: 'var(--cool)' }}>Guided Practice</span>
                    </div>
                    <button
                      className="btn subtle"
                      type="button"
                      onClick={handleThemeToggle}
                    >
                      {themeToggleLabel}
                    </button>
                    <AuthStatusControls />
                    <button
                      className="btn"
                      data-testid="campaign-random-button"
                      onClick={handleStartSession}
                    >
                      Random Question
                    </button>
                    <button
                      className="btn subtle"
                      data-testid="home-nav-button"
                      onClick={handleBackToHome}
                    >
                      Home
                    </button>
                  </div>
                </div>

                <div className="appViewBody">
                  <div className="campaignView">
                    <div className="campaignIntro">
                      <h1>Practice</h1>
                      <p>
                        Choose a question to practice, or work through a practice area in order.
                      </p>
                    </div>

                    {campaignSections.length === 0 ? (
                      <div className="campaignEmpty">
                        <h2>No practice areas selected</h2>
                        <p>
                          Finish the tutorial to choose your next reps, or choose practice areas in Settings.
                        </p>
                        <button className="btn" onClick={handleOpenSettings}>
                          Open Settings
                        </button>
                      </div>
                    ) : (
                      <div className="campaignSections">
                        {campaignSections.map((section) => (
                          <section
                            key={section.set.id}
                            className="campaignSetCard"
                            data-testid={`campaign-set-${section.set.id}`}
                          >
                            <div className="campaignSetHeader">
                              <div className="campaignSetTitleBlock">
                                <div className="campaignSetEyebrow">{section.set.assessmentType}</div>
                                <h2>{section.set.label}</h2>
                                <p>{section.set.description}</p>
                              </div>

                              <div className="campaignSetSummary">
                                <div className="campaignSummaryStats">
                                  <span>{section.problems.length} questions</span>
                                  <span>{section.attemptedCount} attempted</span>
                                  <span>{section.passedCount} passed</span>
                                </div>
                                <button
                                  className="btn primary"
                                  data-testid={`campaign-continue-${section.set.id}`}
                                  onClick={() => handleContinueCampaignSet(section)}
                                  disabled={!section.nextProblem}
                                >
                                  Continue In Order
                                </button>
                              </div>
                            </div>

                            <div className="campaignProblemList">
                              {section.problems.map((problem, index) => {
                                const summary = problemAttemptMap[problem.id];
                                const orderedProblemIds = section.problems.map((item) => item.id);

                                return (
                                  <article
                                    key={problem.id}
                                    className="campaignProblemRow"
                                    data-testid={`campaign-problem-${problem.id}`}
                                  >
                                    <div className="campaignProblemOrder">{index + 1}</div>

                                    <div className="campaignProblemBody">
                                      <div className="campaignProblemTitleRow">
                                        <div>
                                          <h3>{problem.title}</h3>
                                          <p>{getCampaignPreview(problem)}</p>
                                        </div>

                                        <div className="campaignProblemMeta">
                                          <span className={`campaignStatusBadge ${getCampaignStatusClass(summary)}`}>
                                            {getCampaignStatusLabel(summary)}
                                          </span>
                                          <span className="tag cool">{problem.difficulty}</span>
                                          <span className="tag">{problem.language}</span>
                                        </div>
                                      </div>

                                      <div className="campaignProblemStats">
                                        <span>
                                          {summary?.attempts
                                            ? `${summary.attempts} attempt${summary.attempts === 1 ? '' : 's'}`
                                            : 'Not attempted yet'}
                                        </span>
                                        <span>
                                          Best: {summary?.bestVerdict ?? '—'}
                                        </span>
                                        <span>
                                          Last: {summary?.lastVerdict ?? '—'}
                                        </span>
                                      </div>
                                    </div>

                                    <div className="campaignProblemActions">
                                      <button
                                        className="btn"
                                        data-testid={`campaign-start-problem-${problem.id}`}
                                        onClick={() => handleStartCampaignProblem(problem, orderedProblemIds)}
                                      >
                                        {summary?.attempts ? 'Practice Again' : 'Start'}
                                      </button>
                                    </div>
                                  </article>
                                );
                              })}
                            </div>
                          </section>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )}
            
            {/* Session View */}
            {currentView === 'session' && currentProblem && (
              <div className="session-view">
                <div className={`${topbarClassName} appTopbar`}>
                  <div className="brand">
                    <span className="dot"></span>
                    <span>LERN2CWD</span>
                    <span style={{ color: 'var(--cool)' }}>/</span>
                    <span style={{ color: 'var(--hot)' }}>{currentProblem.language.toUpperCase()}</span>
                  </div>
                  <button
                    type="button"
                    className="topbarMenuButton"
                    aria-label={topbarMenuOpen ? 'Close navigation menu' : 'Open navigation menu'}
                    aria-expanded={topbarMenuOpen}
                    onClick={handleToggleTopbarMenu}
                  >
                    {topbarMenuOpen ? '✕' : '☰'}
                  </button>
                  <div className={topbarMetaClassName}>
                    <div className="pill">
                      <span style={{ color: 'rgba(182,255,182,0.65)' }}>QUESTION</span>
                      <span style={{ color: 'var(--cool)' }}>
                        {isSessionPendingStart ? 'Not started' : currentProblem.title}
                      </span>
                    </div>
                    {currentProblemSetInfo && (
                      <div className="pill" data-testid="problem-set-pill">
                        <span style={{ color: 'rgba(182,255,182,0.65)' }}>AREA</span>
                        <span style={{ color: 'var(--cool)' }}>
                          {currentProblemSetInfo.label}
                          {currentProblemSetInfo.ordinal && currentProblemSetInfo.total
                            ? ` · ${currentProblemSetInfo.ordinal}/${currentProblemSetInfo.total}`
                            : ''}
                        </span>
                      </div>
                    )}
                    <div className="pill">
                      <span style={{ color: 'rgba(182,255,182,0.65)' }}>TIMER</span>
                      <span className="timer">{Math.floor(timerWithExpiry.timeRemaining / 60).toString().padStart(2, '0')}:{(timerWithExpiry.timeRemaining % 60).toString().padStart(2, '0')}</span>
                    </div>
                    <div className="pill" data-testid="proctor-mode-pill">
                      <span>TUTOR</span>
                      <span className={`proctorModeValue ${proctorMode === 'llm' ? 'live' : proctorMode === 'fallback' ? 'fallback' : ''}`}>
                        {proctorMode === 'llm' ? 'ONLINE' : proctorMode === 'fallback' ? 'BASIC HELP' : 'READY'}
                      </span>
                    </div>
                    <button
                      className="btn subtle"
                      type="button"
                      onClick={handleThemeToggle}
                    >
                      {themeToggleLabel}
                    </button>
                    <AuthStatusControls />
                    <button
                      className="btn subtle"
                      data-testid="home-nav-button"
                      onClick={handleBackToHome}
                    >
                      Home
                    </button>
                    <button
                      className="btn"
                      data-testid="copy-context-button"
                      onClick={handleCopySessionContext}
                    >
                      Copy Context
                    </button>
                    {copyStatus !== 'idle' && (
                      <span className={`copyStatus ${copyStatus === 'error' ? 'error' : ''}`} data-testid="copy-context-status">
                        {copyStatus === 'copied' ? 'Copied' : 'Copy failed'}
                      </span>
                    )}
                    <button className="btn" onClick={handleOpenSettings}>
                      Settings
                    </button>
                  </div>
                </div>
                
                <div className="neonLine"></div>
                
                <div className="main">
                  <div className="sessionWorkspaceToggle" data-testid="session-workspace-toggle">
                    <button
                      type="button"
                      className={`workspaceToggleBtn ${sessionWorkspacePane === 'problem' ? 'active' : ''}`}
                      onClick={() => setSessionWorkspacePane('problem')}
                      aria-pressed={sessionWorkspacePane === 'problem'}
                    >
                      Question
                    </button>
                    <button
                      type="button"
                      className={`workspaceToggleBtn ${sessionWorkspacePane === 'editor' ? 'active' : ''}`}
                      onClick={() => {
                        if (!isSessionPendingStart) {
                          setSessionWorkspacePane('editor');
                        }
                      }}
                      aria-pressed={sessionWorkspacePane === 'editor'}
                      disabled={isSessionPendingStart}
                      title={isSessionPendingStart ? 'Start to type an answer.' : undefined}
                    >
                      Answer
                    </button>
                  </div>

                  <div className="sessionWorkspace">
                    {sessionWorkspacePane === 'problem' ? (
                      <section
                        className="left-col workspacePane isActive"
                        data-pane="problem"
                      >
                        <div className="problem" ref={problemRef}>
                          {isSessionPendingStart ? (
                            <div className="readyGate">
                              <div className="readyTitle">{readyGateCopy.title}</div>
                              <div className="readySub">{readyGateCopy.subtitle}</div>
                              <button className="btn primary" onClick={handleReadyStart}>
                                Start
                              </button>
                            </div>
                          ) : (
                            <>
                              <div className="title">
                                <h2>{currentProblem.title}</h2>
                                <div className="tags">
                                  <span className="tag cool">{currentProblem.difficulty}</span>
                                  <span className="tag">{currentProblem.language}</span>
                                </div>
                              </div>

                              <div className="problemTabs" role="tablist" aria-label="Question tabs">
                                <button
                                  type="button"
                                  role="tab"
                                  id="tab-description"
                                  aria-controls="panel-description"
                                  aria-selected={problemTab === 'description'}
                                  className={`tabBtn ${problemTab === 'description' ? 'active' : ''}`}
                                  onClick={() => setProblemTab('description')}
                                >
                                  Question
                                </button>
                                <button
                                  type="button"
                                  role="tab"
                                  id="tab-constraints"
                                  aria-controls="panel-constraints"
                                  aria-selected={problemTab === 'constraints'}
                                  className={`tabBtn ${problemTab === 'constraints' ? 'active' : ''}`}
                                  onClick={() => setProblemTab('constraints')}
                                >
                                  Rules
                                </button>
                                <button
                                  type="button"
                                  role="tab"
                                  id="tab-examples"
                                  aria-controls="panel-examples"
                                  aria-selected={problemTab === 'examples'}
                                  className={`tabBtn ${problemTab === 'examples' ? 'active' : ''}`}
                                  onClick={() => setProblemTab('examples')}
                                >
                                  Example
                                </button>
                              </div>

                              <div className="problemPanel" ref={problemPanelRef}>
                                {problemTab === 'description' && (
                                  <div
                                    id="panel-description"
                                    role="tabpanel"
                                    aria-labelledby="tab-description"
                                    tabIndex={0}
                                  >
                                    <div className="promptBlocks">
                                      {(currentProblem.content?.description ?? currentProblem.prompt)
                                        .split(/\n\s*\n/)
                                        .map((block, i) => (
                                        <div key={i} className="promptBlock">
                                          {block}
                                        </div>
                                      ))}
                                    </div>
                                  </div>
                                )}

                                {problemTab === 'constraints' && (
                                  <div
                                    id="panel-constraints"
                                    role="tabpanel"
                                    aria-labelledby="tab-constraints"
                                    tabIndex={0}
                                  >
                                    {(currentProblem.content?.constraints ?? currentProblem.constraints).length > 0 ? (
                                      <div className="constraintList">
                                        {(currentProblem.content?.constraints ?? currentProblem.constraints).map((constraint, i) => (
                                          <div key={i} className="constraintItem">
                                            <span className="constraintBullet" aria-hidden="true">▸</span>
                                            <span>{constraint}</span>
                                          </div>
                                        ))}
                                      </div>
                                    ) : (
                                      <div className="problemEmpty">No rules provided.</div>
                                    )}
                                  </div>
                                )}

                                {problemTab === 'examples' && (
                                  <div
                                    id="panel-examples"
                                    role="tabpanel"
                                    aria-labelledby="tab-examples"
                                    tabIndex={0}
                                  >
                                    {(currentProblem.content?.examples ?? currentProblem.examples).length > 0 ? (
                                      <div className="examplesList">
                                        {(currentProblem.content?.examples ?? currentProblem.examples).map((example, i) => (
                                          <div key={i} className="exampleCard">
                                            <div><strong>Input:</strong> {example.input}</div>
                                            <div><strong>Output:</strong> {example.output}</div>
                                            {example.explanation && <div className="exampleNote">{example.explanation}</div>}
                                          </div>
                                        ))}
                                      </div>
                                    ) : (
                                      <div className="problemEmpty">No examples provided.</div>
                                    )}
                                  </div>
                                )}
                              </div>
                            </>
                          )}
                        </div>
                      </section>
                    ) : (
                      <aside
                        className="right-col workspacePane isActive"
                        data-pane="editor"
                      >
                        <div className="editorWrap">
                          <div className="editorHeader">
                            <div className="leftBits">
                              <span className="statusLight"></span>
                              <span>ANSWER</span>
                              <span style={{ opacity: 0.6 }}>/ {currentProblem.language}</span>
                            </div>
                            <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
                              <span style={{ color: 'rgba(182,255,182,0.55)' }}>Mode:</span>
                              <span style={{ color: 'var(--hot)' }}>Assessment</span>
                            </div>
                          </div>
                          
                          <div className="editor">
                            <CodeEditorPanel
                              data-testid="code-editor-panel"
                              problemPrompt={currentProblem.prompt}
                              code={sessionHook.session?.code || ''}
                              onCodeChange={handleEditorCodeChange}
                              onSubmit={handleSubmitClick}
                              isDisabled={chat.isLoading || !isSessionActive}
                              vimMode={vimMode}
                              language={currentProblem.language}
                              resolvedTheme={resolvedTheme}
                            />
                          </div>
                        </div>
                      </aside>
                    )}
                  </div>

                  <div className="proctorWrap sessionProctorWrap">
                    <div className="chatHeader">
                      <div className="label">Help</div>
                      <div className="signal">
                        <div className="bars" aria-hidden="true">
                          <span></span>
                          <span></span>
                          <span></span>
                          <span></span>
                        </div>
                        <span>secure link</span>
                      </div>
                    </div>

                    <div className="chatPanelWrap">
                      <ChatPanel
                        data-testid="chat-panel"
                        messages={chat.messages}
                      />
                    </div>

                    <div className="proctorInputDock">
                      <ChatInput
                        onSendMessage={handleSendMessage}
                        isDisabled={chat.isLoading || !isSessionActive}
                        disabledPlaceholder={
                          isSessionPendingStart
                            ? 'Press Start to unlock Help'
                            : 'Help unavailable'
                        }
                      />
                    </div>
                  </div>
                </div>
              </div>
            )}
            
            {/* Review View */}
            {currentView === 'review' && currentEvaluation && (
              <div className="appViewShell" data-testid="review-view">
                <div className={`${topbarClassName} appTopbar`}>
                  <div className="brand">
                    <span className="dot"></span>
                    <span>LERN2CWD</span>
                    <span style={{ color: 'var(--cool)' }}>/</span>
                    <span style={{ color: 'var(--hot)' }}>REVIEW</span>
                  </div>
                  <button
                    type="button"
                    className="topbarMenuButton"
                    aria-label={topbarMenuOpen ? 'Close navigation menu' : 'Open navigation menu'}
                    aria-expanded={topbarMenuOpen}
                    onClick={handleToggleTopbarMenu}
                  >
                    {topbarMenuOpen ? '✕' : '☰'}
                  </button>
                  <div className={topbarMetaClassName}>
                    <div className="pill">
                      <span>VIEW</span>
                      <span style={{ color: 'var(--cool)' }}>Feedback</span>
                    </div>
                    <button
                      className="btn subtle"
                      type="button"
                      onClick={handleThemeToggle}
                    >
                      {themeToggleLabel}
                    </button>
                    <AuthStatusControls />
                    <button
                      className="btn subtle"
                      data-testid="home-nav-button"
                      onClick={handleBackToHome}
                    >
                      Home
                    </button>
                  </div>
                </div>

                <div className="appViewBody">
                  <ReviewPanel
                    data-testid="review-panel"
                    evaluation={currentEvaluation}
                    candidateCode={reviewSession?.finalCode ?? sessionHook.session?.code ?? latestCodeRef.current}
                    problemSnapshot={resolveProblemSnapshot(reviewSession, currentProblem)}
                    onCopyContext={handleCopySessionContext}
                    copyStatus={copyStatus}
                    nextActionLabel={nextReviewActionLabel}
                    nextActionDisabled={isFirstTutorialReview && selectedPostTutorialProblemSetIds.length === 0}
                    postFeedbackContent={postTutorialPracticePicker}
                    onNextProblem={handleNextProblem}
                    onViewHistory={handleViewHistory}
                  />
                </div>
              </div>
            )}
            
            {/* History View */}
            {currentView === 'history' && (
              <div className="appViewShell" data-testid="history-view">
                <div className={`${topbarClassName} appTopbar`}>
                  <div className="brand">
                    <span className="dot"></span>
                    <span>LERN2CWD</span>
                    <span style={{ color: 'var(--cool)' }}>/</span>
                    <span style={{ color: 'var(--hot)' }}>HISTORY</span>
                  </div>
                  <button
                    type="button"
                    className="topbarMenuButton"
                    aria-label={topbarMenuOpen ? 'Close navigation menu' : 'Open navigation menu'}
                    aria-expanded={topbarMenuOpen}
                    onClick={handleToggleTopbarMenu}
                  >
                    {topbarMenuOpen ? '✕' : '☰'}
                  </button>
                  <div className={topbarMetaClassName}>
                    <div className="pill">
                      <span>VIEW</span>
                      <span style={{ color: 'var(--cool)' }}>Session History</span>
                    </div>
                    <button
                      className="btn subtle"
                      type="button"
                      onClick={handleThemeToggle}
                    >
                      {themeToggleLabel}
                    </button>
                    <AuthStatusControls />
                    <button
                      className="btn subtle"
                      data-testid="home-nav-button"
                      onClick={handleBackToHome}
                    >
                      Home
                    </button>
                  </div>
                </div>

                <div className="appViewBody">
                  <HistoryPanel
                    data-testid="history-panel"
                    sessions={storedSessions}
                    onSelectSession={handleSelectSession}
                    onClose={handleBackToHome}
                  />
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </>
  );
}

function AuthLoadingFallback() {
  return (
    <div className="home-view authGateView" data-testid="auth-loading-screen">
      <div className="home-content authGateCard">
        <div className="authGateEyebrow">Loading access</div>
        <h1>Lern2Cwd</h1>
        <p>Checking your session...</p>
      </div>
    </div>
  );
}

function AppRoutes() {
  const guestDemoCode = getGuestDemoCodeFromPath();
  const auth = useAuth();
  const shouldShowGuestDemo =
    guestDemoCode !== null &&
    (!auth.isAuthenticated || auth.user?.authProvider === 'guest');

  return (
    <RequireAuth
      fallback={guestDemoCode ? <GuestDemoScreen code={guestDemoCode} /> : <AuthScreen />}
      loadingFallback={<AuthLoadingFallback />}
    >
      {shouldShowGuestDemo ? <GuestDemoScreen code={guestDemoCode} /> : <AppShell />}
    </RequireAuth>
  );
}

function App() {
  return (
    <AuthProvider>
      <AppRoutes />
      <AuthDebugPanel />
    </AuthProvider>
  );
}

export default App;
