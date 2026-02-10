# Implementation Plan: State Management Cleanup

## Overview

This is a surgical bugfix to resolve critical state management issues in App.tsx. The implementation follows a specific order to minimize intermediate broken states: fix compilation errors first, then runtime errors, then improve correctness. Each fix is minimal and targeted, keeping the existing architecture intact.

**Key Principles**:
- Make minimal changes to achieve stability
- Fix what's broken without rewriting what works
- Apply fixes in dependency order to avoid cascading errors
- Test after each fix to catch issues early

## Tasks

- [ ] 1. Fix callback declaration order (compilation error)
  - [x] 1.1 Move `handleSubmitForEvaluation` declaration before `handleTimerExpiry`
    - Declare `handleSubmitForEvaluation` with all its logic first
    - Ensure it includes all necessary dependencies in useCallback array
    - _Requirements: 4.1, 4.2_
  
  - [x] 1.2 Update `handleTimerExpiry` to reference `handleSubmitForEvaluation`
    - Declare `handleTimerExpiry` after `handleSubmitForEvaluation`
    - Add `handleSubmitForEvaluation` to the dependency array
    - _Requirements: 4.2, 4.3_
  
  - [x] 1.3 Move `timerWithExpiry` initialization after `handleTimerExpiry`
    - Ensure timer hook is initialized after its callback is declared
    - _Requirements: 4.3, 4.4_
  
  - [ ] 1.4 Verify TypeScript compilation succeeds
    - Run `tsc --noEmit` to verify no "accessed before declaration" errors
    - _Requirements: 4.4_

- [ ] 2. Remove duplicate timer instance
  - [x] 2.1 Remove the unused `timer` variable declaration
    - Delete the line: `const timer = useTimer();`
    - Keep only `timerWithExpiry` instance
    - _Requirements: 1.1, 1.2_
  
  - [ ]* 2.2 Verify timer functionality works correctly
    - Test that countdown works
    - Test that timer expiry triggers submission
    - _Requirements: 1.3, 1.4_

- [ ] 3. Remove unused variables and parameters
  - [x] 3.1 Remove `skipConfirmation` parameter from `handleSubmitForEvaluation`
    - Change signature from `async (skipConfirmation: boolean = false)` to `async ()`
    - Update all call sites to not pass the parameter
    - _Requirements: 7.1, 7.2_
  
  - [x] 3.2 Remove any other unused variables identified by TypeScript
    - Check TypeScript warnings for unused variables
    - Remove declarations that are never used
    - _Requirements: 7.1, 7.2_
  
  - [ ]* 3.3 Verify TypeScript produces zero warnings
    - Run `tsc --noEmit` to verify no unused variable warnings
    - _Requirements: 7.3, 7.4_

- [ ] 4. Correct JSX variable references
  - [x] 4.1 Fix code editor props to use `sessionHook.session.code`
    - Change `code={session.code}` to `code={sessionHook.session.code}`
    - _Requirements: 3.1_
  
  - [x] 4.2 Fix code editor props to use `sessionHook.updateCode`
    - Change `onCodeChange={session.updateCode}` to `onCodeChange={sessionHook.updateCode}`
    - _Requirements: 3.3_
  
  - [x] 4.3 Fix submit button disabled logic to use `sessionHook.session?.status`
    - Change `session.state !== 'active'` to `sessionHook.session?.status !== 'active'`
    - Note: Also fixes property name from `state` to `status`
    - _Requirements: 3.2_
  
  - [x] 4.4 Search for and fix any other references to undefined `session` variable
    - Use find/replace to locate all `session.` references
    - Replace with `sessionHook.session.` where appropriate
    - _Requirements: 3.4_
  
  - [ ]* 4.5 Verify TypeScript compilation and runtime behavior
    - Run `tsc --noEmit` to verify no undefined variable errors
    - Test that code editor displays and updates correctly
    - Test that submit button enable/disable works correctly
    - _Requirements: 3.5_

- [ ] 5. Capture timeRemaining before async operations
  - [x] 5.1 Add timeRemaining capture at start of `handleSubmitForEvaluation`
    - Add line: `const capturedTimeRemaining = timerWithExpiry.timeRemaining;`
    - Place it immediately after the guard clause, before any async operations
    - _Requirements: 5.1, 5.2_
  
  - [x] 5.2 Update duration calculation to use captured value
    - Change duration calculation to use `capturedTimeRemaining` instead of `timerWithExpiry.timeRemaining`
    - Formula: `const duration = (currentProblem.timeLimit * 60) - capturedTimeRemaining;`
    - _Requirements: 5.3_
  
  - [ ]* 5.3 Verify duration accuracy
    - Test that session duration matches actual elapsed time
    - Verify duration doesn't include evaluation processing time
    - _Requirements: 5.4_

- [ ] 6. Consolidate chat state ownership
  - [x] 6.1 Add `addMessage` method to useChat hook
    - Open `src/hooks/useChat.ts`
    - Add `addMessage` function that takes `Omit<ChatMessage, 'id' | 'timestamp'>`
    - Generate ID and timestamp, then add to messages state
    - Add `addMessage` to the return object
    - _Requirements: 2.1_
  
  - [x] 6.2 Update UseChatReturn interface to include `addMessage`
    - Add `addMessage: (message: Omit<ChatMessage, 'id' | 'timestamp'>) => void;` to interface
    - _Requirements: 2.1_
  
  - [ ] 6.3 Replace `sessionHook.addChatMessage` with `chat.addMessage` in `handleStartSession`
    - Change proctor intro message to use `chat.addMessage({ role: 'proctor', content: intro })`
    - _Requirements: 2.2, 2.3_
  
  - [ ] 6.4 Remove manual message additions from `handleSendMessage`
    - Remove both `sessionHook.addChatMessage` calls (user message and proctor response)
    - Keep only `await chat.sendMessage(message);`
    - The chat hook handles adding both messages internally
    - _Requirements: 2.2, 2.3_
  
  - [ ] 6.5 Verify session save uses `chat.messages` for chat history
    - Confirm that session record creation uses `chatHistory: chat.messages`
    - This should already be correct, just verify
    - _Requirements: 2.4, 2.5_
  
  - [ ]* 6.6 Test chat message flow
    - Test that proctor intro appears when session starts
    - Test that user messages appear immediately
    - Test that proctor responses appear after user messages
    - Test that no duplicate messages appear
    - Test that session records contain correct chat history
    - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.5_

- [ ] 7. Checkpoint - Verify all fixes are working
  - Ensure all TypeScript errors and warnings are resolved
  - Test complete session lifecycle: start → chat → submit → evaluate
  - Verify no runtime errors occur
  - Ask the user if any issues arise

- [ ]* 8. Optional: Wire chat with proctor callback
  - [ ]* 8.1 Add proctor response callback to useChat initialization
    - Pass `onGetProctorResponse` callback that wraps `proctorService.respondToQuestion`
    - Include context: problem, currentCode, chatHistory, timeRemaining
    - _Requirements: 6.1, 6.2_
  
  - [ ]* 8.2 Simplify `handleSendMessage` to just call `chat.sendMessage`
    - Remove manual proctor service call
    - Remove manual message additions
    - Keep only: `await chat.sendMessage(message);`
    - _Requirements: 6.3, 6.4_
  
  - [ ]* 8.3 Test chat integration
    - Test that user messages appear
    - Test that proctor responses appear
    - Test that error messages appear when proctor fails
    - _Requirements: 6.5_

- [ ]* 9. Write property-based tests for correctness properties
  - [ ]* 9.1 Set up fast-check testing library
    - Install fast-check: `npm install --save-dev fast-check @types/fast-check`
    - Create test file: `src/App.test.tsx`
  
  - [ ]* 9.2 Write property test for single timer instance
    - **Property 1: Single Timer Instance**
    - **Validates: Requirements 1.1, 1.2, 1.3, 1.4**
    - Code inspection test: verify only one useTimer call exists
  
  - [ ]* 9.3 Write property test for chat state ownership exclusivity
    - **Property 2: Chat State Ownership Exclusivity**
    - **Validates: Requirements 2.1, 2.2, 2.3**
    - Code inspection test: verify no sessionHook.addChatMessage calls exist
  
  - [ ]* 9.4 Write property test for chat state read consistency
    - **Property 3: Chat State Read Consistency**
    - **Validates: Requirements 2.4, 2.5**
    - Code inspection test: verify all reads use chat.messages
  
  - [ ]* 9.5 Write property test for variable reference validity
    - **Property 4: Variable Reference Validity**
    - **Validates: Requirements 3.1, 3.2, 3.3, 3.4, 3.5**
    - TypeScript compilation test: verify zero undefined variable errors
  
  - [ ]* 9.6 Write property test for callback declaration order
    - **Property 5: Callback Declaration Order**
    - **Validates: Requirements 4.1, 4.2, 4.3, 4.4**
    - TypeScript compilation test: verify zero "accessed before declaration" errors
  
  - [ ]* 9.7 Write property test for duration calculation accuracy
    - **Property 6: Duration Calculation Accuracy**
    - **Validates: Requirements 5.1, 5.2, 5.3, 5.4**
    - Generate random time values and verify duration is always non-negative and accurate
  
  - [ ]* 9.8 Write property test for chat integration completeness
    - **Property 7: Chat Integration Completeness**
    - **Validates: Requirements 6.1, 6.2, 6.3, 6.4, 6.5**
    - Test that chat.sendMessage handles both user and proctor messages
  
  - [ ]* 9.9 Write property test for code cleanliness
    - **Property 8: Code Cleanliness**
    - **Validates: Requirements 7.1, 7.2, 7.3, 7.4**
    - TypeScript compilation test: verify zero unused variable warnings

- [ ]* 10. Write unit tests for specific scenarios
  - [ ]* 10.1 Write unit test for timer expiry triggering submission
    - Test that when timer reaches 0, handleTimerExpiry is called
    - Test that handleTimerExpiry calls handleSubmitForEvaluation
    - _Requirements: 4.1, 4.2_
  
  - [ ]* 10.2 Write unit test for chat message flow
    - Test that proctor intro appears on session start
    - Test that user messages are added correctly
    - Test that proctor responses are added correctly
    - _Requirements: 2.1, 2.2, 2.3_
  
  - [ ]* 10.3 Write unit test for duration calculation edge cases
    - Test duration with 0 seconds remaining
    - Test duration with full time remaining
    - Test duration with partial time remaining
    - _Requirements: 5.1, 5.2, 5.3, 5.4_
  
  - [ ]* 10.4 Write unit test for proctor service error handling
    - Test that errors are caught and error messages appear in chat
    - _Requirements: 6.5_

- [ ] 11. Final checkpoint - Complete verification
  - Run full TypeScript compilation: `tsc --noEmit`
  - Run all tests (if written): `npm test`
  - Perform end-to-end manual testing of complete session lifecycle
  - Verify all 8 requirements are satisfied
  - Ensure all tests pass, ask the user if questions arise

## Notes

- Tasks marked with `*` are optional and can be skipped for faster completion
- This is a surgical bugfix - make minimal changes to achieve stability
- Apply fixes in the specified order to minimize intermediate broken states
- Test after each major fix to catch issues early
- Each task references specific requirements for traceability
- Property-based tests use fast-check with minimum 100 iterations per test
- Unit tests focus on specific scenarios and edge cases
- Both testing approaches are complementary and provide comprehensive coverage
