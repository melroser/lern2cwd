# Implementation Plan: Coding Interview Simulator

## Overview

Build a minimal viable coding interview simulator with React + TypeScript. Focus on the core loop: start session → solve problem → get evaluated. Use localStorage for persistence and prepare for LLM integration.

## Tasks

- [x] 1. Project setup and core types
  - [x] 1.1 Initialize React + TypeScript project with Vite
    - Run `npm create vite@latest` with React + TypeScript template
    - Install dependencies: `npm install`
    - _Requirements: 2.1, 2.4_

  - [x] 1.2 Create core type definitions
    - Create `src/types/index.ts` with Problem, Session, ChatMessage, EvaluationResult, RubricScores, SessionRecord interfaces
    - _Requirements: 4.2, 4.3, 8.1_

  - [ ]* 1.3 Write property test for Problem type validation
    - **Property 8: Problem Bank Validity**
    - **Validates: Requirements 8.1, 8.3**

- [x] 2. Problem bank and loader
  - [x] 2.1 Create problem bank JSON
    - Create `src/data/problems.ts` with 3-5 starter problems (FizzBuzz, Two Sum, Valid Parentheses)
    - Include all required fields: id, language, title, prompt, constraints, scaffold, examples, expectedApproach, evaluationNotes
    - Constraints array required for each problem (e.g., ["1 <= n <= 10000"])
    - _Requirements: 8.1, 8.3_

  - [x] 2.2 Implement ProblemService
    - Create `src/services/problemService.ts`
    - Implement loadProblems(), getRandomProblem(excludeIds), getProblemById(id)
    - _Requirements: 8.3, 8.4_

  - [ ]* 2.3 Write property test for next problem uniqueness
    - **Property 9: Next Problem Uniqueness**
    - **Validates: Requirements 8.4**

- [x] 3. Timer hook
  - [x] 3.1 Implement useTimer hook
    - Create `src/hooks/useTimer.ts`
    - Implement countdown with start, pause, reset functions
    - Fire callback when timer reaches zero
    - _Requirements: 1.1, 1.2, 1.3_

  - [ ]* 3.2 Write property tests for timer
    - **Property 1: Timer Initialization**
    - **Property 2: Timer Expiry Triggers Evaluation**
    - **Validates: Requirements 1.1, 1.2, 1.3**

- [x] 4. Session management
  - [x] 4.1 Implement useSession hook
    - Create `src/hooks/useSession.ts`
    - Manage session state: idle → active → evaluating → completed
    - Track code content, chat history, current problem
    - _Requirements: 1.4, 3.1, 7.4_

  - [ ]* 4.2 Write property tests for session state
    - **Property 3: Submit Triggers Evaluation**
    - **Property 4: Scaffold Populates Editor**
    - **Property 7: Editor Content Preservation**
    - **Validates: Requirements 1.4, 3.1, 7.2, 7.4**

- [x] 5. Chat functionality
  - [x] 5.1 Implement useChat hook
    - Create `src/hooks/useChat.ts`
    - Manage message history, send messages, loading state
    - _Requirements: 6.2_

  - [ ]* 5.2 Write property test for chat message persistence
    - **Property 6: Chat Message Persistence**
    - **Validates: Requirements 6.2**

- [x] 6. Checkpoint - Core hooks complete
  - Ensure all tests pass, ask the user if questions arise.

- [x] 7. Storage service
  - [x] 7.1 Implement StorageService
    - Create `src/services/storageService.ts`
    - Implement saveSession, getSessions, getSession, clearSessions
    - Implement getStorageUsage() to check localStorage quota (~5MB limit)
    - Implement pruneOldSessions(keepCount) with LRU strategy (delete oldest completed sessions)
    - Auto-prune when quota exceeded, warn user at 80% usage
    - Validate JSON on load, skip corrupted records gracefully
    - Do NOT store system prompts in session records (reconstruct from problem metadata)
    - Use localStorage with JSON serialization
    - _Requirements: 9.1, 9.4, 9.5_

  - [ ]* 7.2 Write property test for session round-trip
    - **Property 10: Session Record Round-Trip**
    - **Validates: Requirements 9.1, 9.4**

  - [x] 7.3 Implement LRU eviction policy
    - Auto-prune oldest sessions when storage exceeds 80% quota
    - Keep minimum of 10 most recent sessions
    - _Requirements: 9.4_

- [x] 8. Evaluation service
  - [x] 8.1 Implement EvaluationService
    - Create `src/services/evaluationService.ts` using reference implementation from design doc
    - Implement parseAndValidateEvaluation (JSON extraction, score clamping, verdict fallback, missTag validation)
    - Implement getEvaluationWithRetry (retry-once on parse failure)
    - LLM verdict is authoritative; fallback verdict only if LLM response malformed
    - Fallback logic: Pass (total >= 13 AND no category < 3), Borderline (total 9-12), No Pass (total <= 8 OR approach <= 1)
    - _Requirements: 4.2, 4.3, 9.2_

  - [ ]* 8.2 Write property test for evaluation result validity
    - **Property 5: Evaluation Result Validity**
    - **Validates: Requirements 4.2, 4.3, 4.6, 4.7**

- [x] 9. Proctor service (mock first)
  - [x] 9.1 Implement ProctorService with mock responses
    - Create `src/services/proctorService.ts`
    - Implement generateIntro, respondToQuestion, evaluate
    - Return hardcoded responses initially for testing UI
    - _Requirements: 3.1, 4.1_

  - [x] 9.2 Implement token estimation and context truncation
    - Create `src/utils/tokenEstimator.ts`
    - Estimate tokens using ~4 chars per token heuristic
    - If (code_tokens + chat_tokens) > limit: truncate chat (keep first + last N), truncate code to last 200 lines
    - Target max context: 6000 tokens for chat prompt, 8000 for evaluation
    - _Requirements: 3.2_

- [x] 10. Checkpoint - Services complete
  - Ensure all tests pass, ask the user if questions arise.

- [x] 11. UI Components
  - [x] 11.1 Create Header component
    - Create `src/components/Header.tsx`
    - Display problem title and countdown timer
    - _Requirements: 2.2_

  - [x] 11.2 Create CodeEditorPanel component
    - Create `src/components/CodeEditorPanel.tsx`
    - Problem prompt display, code editor, "I'm Done" button
    - Use `react-simple-code-editor` for Tab key indentation support
    - _Requirements: 2.1, 7.1, 7.2, 7.3_

  - [x] 11.3 Create ChatPanel component
    - Create `src/components/ChatPanel.tsx`
    - Scrollable message history, input field, send button
    - Use `react-markdown` to render proctor responses (bold, bullets, code blocks)
    - Implement "stick-to-bottom" auto-scroll (preserve position if user scrolled up)
    - Visual distinction between user and proctor messages
    - _Requirements: 6.1, 6.2, 6.3, 6.4, 6.5_

  - [x] 11.4 Create ReviewPanel component
    - Create `src/components/ReviewPanel.tsx`
    - Display verdict, rubric scores, feedback, ideal solution
    - "Next Problem" and "View History" buttons
    - _Requirements: 4.3, 4.6, 4.7_

- [x] 12. Main App integration
  - [x] 12.1 Create App shell with routing
    - Update `src/App.tsx` with view state management
    - Implement home, session, review, history views
    - _Requirements: 2.1, 2.3, 2.4_

  - [x] 12.2 Wire components together
    - Connect Header, CodeEditorPanel, ChatPanel, ReviewPanel
    - Implement split-view layout (2/3 editor, 1/3 chat)
    - Connect hooks to components
    - _Requirements: 2.1, 2.4_

  - [x] 12.3 Implement session flow
    - Start session → load problem → show scaffold → start timer (using problem's timeLimit)
    - Handle "I'm Done" → show confirmation dialog → trigger evaluation → show results
    - If time remaining > 5 min, confirmation warns "You have X minutes left"
    - Handle timer expiry → trigger evaluation (cancel any pending chat)
    - Auto-save session state every 30 seconds
    - Disable submit button while chat is loading
    - _Requirements: 1.1, 1.3, 1.4, 1.5, 1.6, 3.1, 4.1_

- [x] 13. Checkpoint - UI complete with mock proctor
  - Ensure all tests pass, ask the user if questions arise.

- [x] 14. LLM integration
  - [x] 14.1 Add API key settings
    - Create `src/components/SettingsModal.tsx` for BYOK API key entry
    - Store key in localStorage (warn user about security implications)
    - Show modal on first launch if no key configured
    - Add "Settings" button to header for key management
    - _Requirements: 3.2, 4.1_

  - [x] 14.2 Create proctor prompts
    - Create `src/prompts/proctorPrompts.ts`
    - Live chat prompt: friendly interviewer, hint ladder, no full solutions, max 1 clarifying question
    - Evaluation prompt: rubric scoring (0-4), verdict rules (Pass ≥13, Borderline 9-12, No Pass ≤8 or approach ≤1), miss tags, JSON output
    - Include problem constraints in prompt context
    - Ideal solution must match problem's language field (not hardcoded Python)
    - Truncate chat history to last 12 turns for efficiency
    - _Requirements: 3.2, 3.3, 3.4, 4.2, 4.3, 4.4, 4.5, 5.1, 5.2, 5.3, 5.4, 9.2_

  - [x] 14.3 Update ProctorService with real LLM calls
    - Implement actual API calls using prompts from 14.2
    - Parse JSON evaluation response
    - Fallback miss tag derivation from scores if model omits
    - _Requirements: 3.2, 4.1_

- [x] 15. History and progress tracking
  - [x] 15.1 Create HistoryPanel component
    - Create `src/components/HistoryPanel.tsx`
    - Display past sessions with scores and miss tags
    - Show patterns in weaknesses
    - _Requirements: 9.3_

  - [x] 15.2 Implement miss tag analysis
    - Aggregate miss tags across sessions
    - Identify recurring patterns
    - _Requirements: 9.2, 9.3_

  - [x] 15.3 Add data management UI
    - Add "Clear All Data" button in settings modal
    - Show privacy notice on first launch: "All data stored locally on this device only"
    - Display security warnings for API key storage on shared devices
    - _Requirements: 9.5, 9.6_

- [x] 16. Final checkpoint
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- Tasks marked with `*` are optional property tests that can be skipped for faster MVP
- Core loop (tasks 1-13) can ship without LLM integration using mock responses
- LLM integration (task 14) can be added incrementally
- Property tests use fast-check with 100+ iterations
- Focus on session flow first, polish UI later
