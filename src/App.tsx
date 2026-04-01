import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { CodeEditorPanel } from './components/CodeEditorPanel';
import { ChatPanel } from './components/ChatPanel';
import { ChatInput } from './components/ChatInput';
import { ReviewPanel } from './components/ReviewPanel';
import { HistoryPanel } from './components/HistoryPanel';
import { SettingsModal } from './components/SettingsModal';
import { AuthScreen } from './components/AuthScreen';
import { AuthDebugPanel } from './components/AuthDebugPanel';
import { AuthStatusControls } from './components/AuthStatusControls';
import { AuthProvider } from './auth/AuthProvider';
import { RequireAuth } from './auth/RequireAuth';
import { useAuth } from './auth/useAuth';
import { useSession } from './hooks/useSession';
import { useTimer } from './hooks/useTimer';
import { useChat } from './hooks/useChat';
import { problemService } from './services/problemService';
import { proctorService } from './services/proctorService';
import { storageService } from './services/storageService';
import { getEditorSettings, setEditorSettingsStorageScope } from './utils/editorSettings';
import {
  DEFAULT_SELECTED_PROBLEM_SETS,
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

const VERDICT_PRIORITY: Record<Verdict, number> = {
  'No Pass': 0,
  Borderline: 1,
  Pass: 2,
};

interface ConfirmDialogState {
  isOpen: boolean;
  timeRemaining: number;
}

type CopyStatus = 'idle' | 'copied' | 'error';

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

function buildLegacySnapshotFromSession(sessionRecord: SessionRecord): string {
  const transcript = sessionRecord.chatTranscript
    .map((msg) => `[${msg.role.toUpperCase()}] ${msg.content}`)
    .join('\n\n');

  return [
    '=== Session Context Snapshot ===',
    `Captured At: ${new Date().toISOString()}`,
    `Problem ID: ${sessionRecord.problemId}`,
    `Title: ${sessionRecord.problemTitle}`,
    '',
    '--- Candidate Attempt ---',
    sessionRecord.finalCode || '(no code/answer entered yet)',
    '',
    '--- Proctor/User Chat ---',
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

  // View state management
  const [currentView, setCurrentView] = useState<ViewState>('home');
  const [showSettings, setShowSettings] = useState(false);
  const [storageScopeReady, setStorageScopeReady] = useState(false);
  const [vimMode, setVimMode] = useState(false);
  const [problemTab, setProblemTab] = useState<'description' | 'constraints' | 'examples'>('description');
  const [proctorMode, setProctorMode] = useState<ProctorInteractionMode>(() => proctorService.getLastInteractionMode());
  const [copyStatus, setCopyStatus] = useState<CopyStatus>('idle');
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
    setSelectedProblemSetIds(getProblemSetSettings().selectedProblemSetIds);
  }, [auth.profileKey, storageScopeReady]);
  
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
  
  // Handle actual submission for evaluation
  const handleSubmitForEvaluation = useCallback(async () => {
    if (!currentProblem || sessionHook.session?.status !== 'active') return;
    
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
    if (!currentProblem || sessionHook.session?.status !== 'active') return;

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
    sessionHook.session?.status,
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
    if (sessionHook.session?.status === 'waiting_to_start') {
      // Do not start timer from chat; require explicit Ready action
      chat.addMessage({ role: 'user', content: message });
      chat.addMessage({ role: 'proctor', content: 'Press "Ready. Start Timer" to begin.' });
      return;
    }
    
    // Normal chat flow for active sessions
    if (sessionHook.session?.status !== 'active') return;
    
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
  }, [currentProblem, sessionHook, chat, timerWithExpiry]);

  const handleReadyStart = useCallback(() => {
    if (!currentProblem) return;
    if (sessionHook.session?.status !== 'waiting_to_start') return;

    sessionHook.activateSession();
    timerWithExpiry.start(currentProblem.timeLimit * 60);
    chat.addMessage({
      role: 'proctor',
      content: `Timer started. ${currentProblem.tutorPlan?.openingPrompt ?? 'What are you thinking for your approach to this problem?'}`,
    });
  }, [currentProblem, sessionHook, timerWithExpiry, chat]);

  const handleProblemSetSelectionChange = useCallback((setIds: string[]) => {
    setSelectedProblemSetIds(setIds);
    saveProblemSetSettings({ selectedProblemSetIds: setIds });
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
  
  // Handle next problem
  const handleNextProblem = useCallback(() => {
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
  }, [timerWithExpiry, chat, handleStartSession, getNextCampaignProblem, activeCampaignFlow, startSessionWithProblem]);

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
    if (!activeCampaignFlow) {
      return 'Next Problem';
    }

    return getNextCampaignProblem() ? 'Next In Set' : 'Back to Campaign';
  }, [activeCampaignFlow, getNextCampaignProblem]);

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
      return 'No problem context available.';
    }

    const description = problemSnapshot.content?.description ?? problemSnapshot.prompt;
    const constraints = problemSnapshot.content?.constraints ?? problemSnapshot.constraints;
    const examples = problemSnapshot.content?.examples ?? problemSnapshot.examples;
    const transcript = transcriptMessages
      .map((msg) => `[${msg.role.toUpperCase()}] ${msg.content}`)
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
      `Problem ID: ${problemSnapshot.id}`,
      `Problem Set: ${problemSnapshot.problemSetId ?? 'unknown'}`,
      `Title: ${problemSnapshot.title}`,
      `Assessment Type: ${problemSnapshot.assessmentType ?? 'coding'}`,
      `Difficulty: ${problemSnapshot.difficulty}`,
      `Language: ${problemSnapshot.language}`,
      `Time Remaining: ${currentView === 'session' ? `${Math.floor(timerWithExpiry.timeRemaining / 60).toString().padStart(2, '0')}:${(timerWithExpiry.timeRemaining % 60).toString().padStart(2, '0')}` : 'session ended'}`,
      '',
      '--- Problem Description ---',
      description,
      '',
      '--- Constraints ---',
      constraints.map((constraint) => `- ${constraint}`).join('\n'),
      '',
      '--- Examples ---',
      examplesBlock || 'No examples provided.',
      '',
      '--- Candidate Attempt ---',
      code || '(no code/answer entered yet)',
      '',
      '--- Proctor/User Chat ---',
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
            vimMode={vimMode}
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
              <h3 style={{ color: 'var(--cool)', marginBottom: '1rem' }}>Submit Solution?</h3>
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
                  <h1>Coding Interview Simulator</h1>
                  <p>Practice coding interviews with AI-powered feedback</p>

                  <div className="homeMetaBar">
                    <AuthStatusControls />
                  </div>
                  
                  <div className="home-actions">
                    <button
                      data-testid="start-session-button"
                      className="btn primary"
                      onClick={handleStartSession}
                    >
                      Start Random Session
                    </button>

                    <button
                      data-testid="browse-campaign-button"
                      className="btn"
                      onClick={handleViewCampaign}
                    >
                      Browse Campaign
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
                      onClick={() => setShowSettings(true)}
                    >
                      Settings
                    </button>
                  </div>
                </div>
              </div>
            )}

            {currentView === 'campaign' && (
              <div className="appViewShell" data-testid="campaign-view">
                <div className="topbar appTopbar">
                  <div className="brand">
                    <span className="dot"></span>
                    <span>INTERVIEW SIMULATOR</span>
                    <span style={{ color: 'var(--cool)' }}>/</span>
                    <span style={{ color: 'var(--hot)' }}>CAMPAIGN</span>
                  </div>
                  <div className="meta">
                    <div className="pill">
                      <span>MODE</span>
                      <span style={{ color: 'var(--cool)' }}>Guided Practice</span>
                    </div>
                    <AuthStatusControls />
                    <button
                      className="btn"
                      data-testid="campaign-random-button"
                      onClick={handleStartSession}
                    >
                      Random Session
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
                      <h1>Campaign Mode</h1>
                      <p>
                        Work through your enabled problem sets in order, or jump straight to a specific drill you want to practice again.
                      </p>
                    </div>

                    {campaignSections.length === 0 ? (
                      <div className="campaignEmpty">
                        <h2>No enabled problem sets</h2>
                        <p>Turn on at least one problem set in Settings and it will show up here.</p>
                        <button className="btn" onClick={() => setShowSettings(true)}>
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
                                  <span>{section.problems.length} problems</span>
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
                <div className="topbar">
                  <div className="brand">
                    <span className="dot"></span>
                    <span>INTERVIEW SIMULATOR</span>
                    <span style={{ color: 'var(--cool)' }}>/</span>
                    <span style={{ color: 'var(--hot)' }}>{currentProblem.language.toUpperCase()}</span>
                  </div>
                  <div className="meta">
                    <div className="pill">
                      <span style={{ color: 'rgba(182,255,182,0.65)' }}>PROBLEM</span>
                      <span style={{ color: 'var(--cool)' }}>
                        {sessionHook.session?.status === 'waiting_to_start' ? 'Hidden' : currentProblem.title}
                      </span>
                    </div>
                    {currentProblemSetInfo && (
                      <div className="pill" data-testid="problem-set-pill">
                        <span style={{ color: 'rgba(182,255,182,0.65)' }}>SET</span>
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
                      <span>PROCTOR</span>
                      <span className={`proctorModeValue ${proctorMode === 'llm' ? 'live' : proctorMode === 'fallback' ? 'fallback' : ''}`}>
                        {proctorMode === 'llm' ? 'LIVE' : proctorMode === 'fallback' ? 'LOCAL FALLBACK' : 'IDLE'}
                      </span>
                    </div>
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
                    <button className="btn" onClick={() => setShowSettings(true)}>
                      Settings
                    </button>
                  </div>
                </div>
                
                <div className="neonLine"></div>
                
                <div className="main">
                  <section className="left-col">
                    <div className="problem" ref={problemRef}>
                      {sessionHook.session?.status === 'waiting_to_start' ? (
                        <div className="readyGate">
                          <div className="readyTitle">Ready to start?</div>
                          <div className="readySub">Press the button to reveal the problem and start the timer.</div>
                          <button className="btn primary" onClick={handleReadyStart}>
                            Ready. Start Timer
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

                          <div className="problemTabs" role="tablist" aria-label="Problem tabs">
                            <button
                              type="button"
                              role="tab"
                              id="tab-description"
                              aria-controls="panel-description"
                              aria-selected={problemTab === 'description'}
                              className={`tabBtn ${problemTab === 'description' ? 'active' : ''}`}
                              onClick={() => setProblemTab('description')}
                            >
                              Description
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
                              Constraints
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
                              Examples
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
                                  <div className="problemEmpty">No constraints provided.</div>
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

                    <div className="proctorWrap">
                      <div className="chatHeader">
                        <div className="label">Proctor Channel</div>
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
                    </div>
                  </section>
                  
                  <aside className="right-col">
                    <div className="editorWrap">
                      <div className="editorHeader">
                        <div className="leftBits">
                          <span className="statusLight"></span>
                          <span>EDITOR</span>
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
                          isDisabled={chat.isLoading || sessionHook.session?.status !== 'active'}
                          vimMode={vimMode}
                          language={currentProblem.language}
                        />
                      </div>
                    </div>

                    <div className="chatInputDock">
                      <ChatInput
                        onSendMessage={handleSendMessage}
                        isDisabled={chat.isLoading || sessionHook.session?.status !== 'active'}
                      />
                    </div>
                  </aside>
                </div>
              </div>
            )}
            
            {/* Review View */}
            {currentView === 'review' && currentEvaluation && (
              <div className="appViewShell" data-testid="review-view">
                <div className="topbar appTopbar">
                  <div className="brand">
                    <span className="dot"></span>
                    <span>INTERVIEW SIMULATOR</span>
                    <span style={{ color: 'var(--cool)' }}>/</span>
                    <span style={{ color: 'var(--hot)' }}>REVIEW</span>
                  </div>
                  <div className="meta">
                    <div className="pill">
                      <span>VIEW</span>
                      <span style={{ color: 'var(--cool)' }}>Evaluation Results</span>
                    </div>
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
                    onNextProblem={handleNextProblem}
                    onViewHistory={handleViewHistory}
                  />
                </div>
              </div>
            )}
            
            {/* History View */}
            {currentView === 'history' && (
              <div className="appViewShell" data-testid="history-view">
                <div className="topbar appTopbar">
                  <div className="brand">
                    <span className="dot"></span>
                    <span>INTERVIEW SIMULATOR</span>
                    <span style={{ color: 'var(--cool)' }}>/</span>
                    <span style={{ color: 'var(--hot)' }}>HISTORY</span>
                  </div>
                  <div className="meta">
                    <div className="pill">
                      <span>VIEW</span>
                      <span style={{ color: 'var(--cool)' }}>Session History</span>
                    </div>
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
        <h1>Interview Simulator</h1>
        <p>Checking your session…</p>
      </div>
    </div>
  );
}

function App() {
  return (
    <AuthProvider>
      <RequireAuth
        fallback={<AuthScreen />}
        loadingFallback={<AuthLoadingFallback />}
      >
        <AppShell />
      </RequireAuth>
      <AuthDebugPanel />
    </AuthProvider>
  );
}

export default App;
