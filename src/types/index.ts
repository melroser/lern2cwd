/**
 * Core type definitions for the Coding Interview Simulator
 * 
 * Requirements: 4.2, 4.3, 8.1
 */

// =============================================================================
// Problem Bank Types
// =============================================================================

/**
 * Example input/output for a problem
 */
export interface Example {
  input: string;
  output: string;
  explanation?: string;
}

/**
 * Structured content blocks for a problem statement.
 * Keeps presentation stable across coding and non-coding modes.
 */
export interface ProblemContent {
  description: string;
  constraints: string[];
  examples: Example[];
}

/**
 * Expected response contract for a problem.
 * responseMode controls whether the editor expects code or a narrative response.
 */
export interface ProblemContract {
  responseMode: 'code' | 'narrative';
  starterTemplate: string;
  functionSignature?: string;
  inputSummary?: string;
  outputSummary?: string;
}

/**
 * FAQ entry for deterministic tutoring responses.
 */
export interface TutorFAQEntry {
  triggers: string[];
  response: string;
}

/**
 * Hint ladder step. Higher levels are more explicit.
 */
export interface TutorHintStep {
  level: 1 | 2 | 3 | 4;
  hint: string;
}

/**
 * Proactive coaching nudge while the candidate is drafting.
 */
export interface TutorNudgeRule {
  id: string;
  when: 'no-progress' | 'likely-inefficient' | 'missing-structure';
  message: string;
  cooldownSeconds: number;
}

/**
 * Tutor guidance bundle that enables local-first conversational support.
 */
export interface TutorPlan {
  openingPrompt: string;
  clarifications: TutorFAQEntry[];
  hintLadder: TutorHintStep[];
  selfCheckPrompts: string[];
  nudgeRules: TutorNudgeRule[];
  approachKeywords: string[];
  complexityTarget?: 'O(1)' | 'O(log n)' | 'O(n)' | 'O(n log n)' | 'O(n^2)';
  llmPolicy?: {
    localFirst: boolean;
    maxDeterministicTurns: number;
  };
}

/**
 * Supported programming languages
 */
export type ProgrammingLanguage = 'javascript' | 'python' | 'typescript' | 'sql' | 'yaml' | 'dockerfile';

/**
 * Assessment format for a problem.
 * Keeps evaluation adaptable across coding, quantitative, and interview-style prompts.
 */
export type AssessmentType = 'coding' | 'math' | 'behavioral' | 'system-design';

/**
 * Problem difficulty levels
 */
export type Difficulty = 'easy' | 'medium' | 'hard';

/**
 * Problem from the problem bank
 * Requirements: 8.1 - Problem structure with all required fields
 */
export interface Problem {
  id: string;
  language: ProgrammingLanguage;
  title: string;
  difficulty: Difficulty;
  timeLimit: number; // minutes
  prompt: string;
  constraints: string[]; // e.g., ["1 <= n <= 10000", "Input is always valid"]
  scaffold: string;
  examples: Example[];
  expectedApproach: string;
  commonPitfalls: string[];
  idealSolutionOutline: string;
  evaluationNotes: string;
  assessmentType?: AssessmentType;
  domain?: string;
  competencyTags?: string[];
  problemSetId?: string;
  content?: ProblemContent;
  contract?: ProblemContract;
  tutorPlan?: TutorPlan;
}

/**
 * Problem set metadata shown in Settings.
 */
export interface ProblemSetOption {
  id: string;
  label: string;
  description: string;
  assessmentType: AssessmentType;
  domain: string;
  questionCount: number;
  defaultSelected?: boolean;
}

// =============================================================================
// Chat Types
// =============================================================================

/**
 * Role in the chat conversation
 */
export type ChatRole = 'user' | 'proctor';

/**
 * Chat message in the conversation
 */
export interface ChatMessage {
  id: string;
  role: ChatRole;
  content: string;
  timestamp: number;
}

// =============================================================================
// Session Types
// =============================================================================

/**
 * Session status states
 */
export type SessionStatus = 'waiting_to_start' | 'active' | 'evaluating' | 'completed';

/**
 * Active session state
 */
export interface Session {
  id: string;
  problemId: string;
  startTime: number;
  endTime: number | null;
  status: SessionStatus;
  code: string;
  chatHistory: ChatMessage[];
}

/**
 * Session context for proctor responses
 */
export interface SessionContext {
  problem: Problem;
  currentCode: string;
  chatHistory: ChatMessage[];
  timeRemaining: number;
}

// =============================================================================
// Evaluation Types
// =============================================================================

/**
 * Rubric scores (0-4 each)
 * Requirements: 4.2 - Score 0-4 in each Rubric category
 */
export interface RubricScores {
  approach: number;
  completeness: number;
  complexity: number;
  communication: number;
}

/**
 * Verdict types
 * Requirements: 4.3 - Verdict of "Pass", "Borderline", or "No Pass"
 */
export type Verdict = 'Pass' | 'Borderline' | 'No Pass';

/**
 * Miss tag types for tracking specific weaknesses
 * Requirements: 9.2 - Assign Miss_Tags identifying specific weaknesses
 */
export type MissTag =
  | 'edge-cases'
  | 'complexity-analysis'
  | 'incorrect-approach'
  | 'incomplete-solution'
  | 'unclear-communication'
  | 'wrong-data-structure'
  | 'off-by-one'
  | 'constraints-missed'
  | 'testing-mentality';

/**
 * Array of all valid miss tags for validation
 */
export const VALID_MISS_TAGS: readonly MissTag[] = [
  'edge-cases',
  'complexity-analysis',
  'incorrect-approach',
  'incomplete-solution',
  'unclear-communication',
  'wrong-data-structure',
  'off-by-one',
  'constraints-missed',
  'testing-mentality',
] as const;

/**
 * Feedback structure in evaluation result
 */
export interface EvaluationFeedback {
  strengths: string[];
  improvements: string[];
}

export type EvaluationAnnotationTarget = 'candidate' | 'ideal';

export type EvaluationAnnotationSeverity = 'info' | 'warning' | 'error';

export interface EvaluationAnnotation {
  target: EvaluationAnnotationTarget;
  line: number;
  message: string;
  severity: EvaluationAnnotationSeverity;
}

export interface SessionProblemSnapshot {
  id: string;
  title: string;
  language: ProgrammingLanguage;
  difficulty: Difficulty;
  timeLimit: number;
  prompt: string;
  constraints: string[];
  examples: Example[];
  assessmentType?: AssessmentType;
  domain?: string;
  competencyTags?: string[];
  problemSetId?: string;
  content?: ProblemContent;
  contract?: ProblemContract;
}

/**
 * Complete evaluation result
 * Requirements: 4.2, 4.3, 4.6, 4.7
 */
export interface EvaluationResult {
  verdict: Verdict;
  scores: RubricScores;
  feedback: EvaluationFeedback;
  idealSolution: string;
  missTags: MissTag[];
  annotations?: EvaluationAnnotation[];
}

// =============================================================================
// Persistence Types
// =============================================================================

/**
 * Persisted session record (optimized for storage)
 * NOTE: System prompts are NOT stored per-session to save space
 * Chat transcript stores only user messages and proctor responses, not full LLM context
 */
export interface SessionRecord {
  id: string;
  problemId: string;
  problemTitle: string;
  timestamp: number;
  duration: number; // seconds
  finalCode: string;
  chatTranscript: ChatMessage[];
  evaluation: EvaluationResult;
  problemSnapshot?: SessionProblemSnapshot;
}

// =============================================================================
// Application State Types
// =============================================================================

/**
 * Application view states
 */
export type AppView = 'home' | 'session' | 'review' | 'history' | 'campaign';

/**
 * Application state
 */
export interface AppState {
  view: AppView;
  currentSession: Session | null;
  currentProblem: Problem | null;
  evaluation: EvaluationResult | null;
  sessionHistory: SessionRecord[];
}

// =============================================================================
// Service Interface Types
// =============================================================================

/**
 * Proctor service interface for AI proctor interactions
 */
export interface ProctorService {
  generateIntro(problem: Problem): Promise<string>;
  respondToQuestion(
    question: string,
    context: SessionContext
  ): Promise<string>;
  getLastInteractionMode(): ProctorInteractionMode;
  getProactiveNudge(context: SessionContext): string | null;
  evaluate(
    code: string,
    problem: Problem,
    chatHistory: ChatMessage[]
  ): Promise<EvaluationResult>;
}

export type ProctorInteractionMode = 'idle' | 'llm' | 'fallback';

/**
 * Problem service interface for managing problem bank
 */
export interface ProblemServiceInterface {
  loadProblems(problemSetIds?: string[]): Promise<Problem[]>;
  getRandomProblem(excludeIds?: string[]): Problem;
  getProblemById(id: string): Problem | null;
  getAvailableProblemSets(): ProblemSetOption[];
}

/**
 * Storage usage information
 */
export interface StorageUsage {
  used: number;
  limit: number;
  percentage: number;
}

/**
 * Storage service interface for localStorage persistence
 */
export interface StorageServiceInterface {
  saveSession(session: SessionRecord): void;
  getSessions(): SessionRecord[];
  getSession(id: string): SessionRecord | null;
  clearSessions(): void;
  getStorageUsage(): StorageUsage;
  pruneOldSessions(keepCount: number): void;
}

/**
 * Evaluation service interface for validation and fallback logic
 */
export interface EvaluationServiceInterface {
  parseEvaluationResponse(llmResponse: string): EvaluationResult;
  validateEvaluationResult(result: EvaluationResult): boolean;
  calculateFallbackVerdict(scores: RubricScores): Verdict;
  extractMissTags(evaluation: EvaluationResult): MissTag[];
}

// =============================================================================
// Hook Return Types
// =============================================================================

/**
 * useTimer hook return type
 */
export interface UseTimerReturn {
  timeRemaining: number;
  isRunning: boolean;
  start: (durationSeconds: number) => void;
  pause: () => void;
  reset: () => void;
}

/**
 * useSession hook return type
 */
export interface UseSessionReturn {
  session: Session | null;
  startSession: (problem: Problem) => void;
  endSession: () => void;
  updateCode: (code: string) => void;
  activateSession: () => void;
  submitForEvaluation: () => Promise<void>;
}

/**
 * useChat hook return type
 */
export interface UseChatReturn {
  messages: ChatMessage[];
  sendMessage: (content: string) => Promise<void>;
  isLoading: boolean;
  clearMessages: () => void;
  addMessage: (message: Omit<ChatMessage, 'id' | 'timestamp'>) => void;
}

// =============================================================================
// Component Props Types
// =============================================================================

/**
 * Header component props
 */
export interface HeaderProps {
  problemTitle: string;
  timeRemaining: number; // seconds
  isSessionActive: boolean;
}

/**
 * CodeEditorPanel component props
 */
export interface CodeEditorPanelProps {
  problemPrompt: string;
  code: string;
  onCodeChange: (code: string) => void;
  onSubmit: () => void;
  isDisabled: boolean;
}

/**
 * ChatPanel component props
 */
export interface ChatPanelProps {
  messages: ChatMessage[];
  onSendMessage?: (message: string) => void;
  isDisabled?: boolean;
}

/**
 * ReviewPanel component props
 */
export interface ReviewPanelProps {
  evaluation: EvaluationResult | null;
  onNextProblem: () => void;
  onViewHistory: () => void;
  candidateCode?: string;
  problemSnapshot?: SessionProblemSnapshot | null;
  onCopyContext?: () => void;
  copyStatus?: 'idle' | 'copied' | 'error';
  nextActionLabel?: string;
}

/**
 * HistoryPanel component props
 */
export interface HistoryPanelProps {
  sessions: SessionRecord[];
  onSelectSession: (sessionId: string) => void;
  onClose: () => void;
}

// =============================================================================
// Token Management Types
// =============================================================================

/**
 * Token budget for LLM context management
 */
export interface TokenBudget {
  systemPrompt: number;  // ~500 tokens (fixed)
  problemMetadata: number;  // ~300 tokens (varies by problem)
  code: number;  // variable, cap at 2000 tokens
  chat: number;  // variable, cap at 3000 tokens
  response: number;  // reserve 1000 tokens for response
}
