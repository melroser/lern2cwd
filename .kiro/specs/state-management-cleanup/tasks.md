# Implementation Plan: State Management Cleanup

## Overview

This plan implements surgical fixes to resolve critical state management bugs in App.tsx. Each task applies a specific fix from the design document in the optimal order to minimize intermediate broken states. The approach is minimal and focused - fix what's broken without rewriting components.

## Tasks

- [ ] 1. Fix callback declaration order
  - Move `handleSubmitForEvaluation` declaration before `handleTimerExpiry`
  - Add `handleSubmitForEvaluation` to `handleTimerExpiry` dependency array
  - Move `handleTimerExpiry` declaration before `timerWithExpiry` initialization
  - Verify TypeScript error about "accessed before declaration" is resolved
  - _Requirements: 4.1, 4.2, 4.3, 4.4_

- [ ]* 1.1 Write unit test for callback order fix
  - Test that timer expiry correctly triggers submission
  - Test that manual submission works independently
  - _Requirements: 4.1, 4.2_

- [ ] 2. Remove duplicate timer instance
  - Remove the unused `const timer = useTimer();` line
  - Keep only `const timerWithExpiry = useTimer(handleTimerExpiry);`
  - Verify TypeScript warning about unused variable is resolved
  - _Requirements: 1.1, 1.2, 1.3, 1.4_

- [ ] 3. Remove unused variables and parameters
  - Remove `skipConfirmation` parameter from `handleSubmitForEvaluation`
  - Update all calls to `handleSubmitForEvaluation` to not pass the parameter
  - Verify TypeScript produces zero warnings about unused variables/parameters
  - _Requirements: 7.1, 7.2, 7.3, 7.4_

- [ ] 4. Correct JSX variable references
  - In CodeEditorPanel props, change `session.code` to `sessionHook.session.code`
  - Change `session.updateCode` to `sessionHook.updateCode`
  - Change `session.state !== 'active'` to `sessionHook.session?.status !== 'active'`
  - Verify TypeScript errors about undefined `session` are resolved
  - Verify code editor displays and updates correctly
  - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5_

- [ ]* 4.1 Write unit test for JSX reference fix
  - Test that code editor receives correct props
  - Test that session status correctly enables/disables submit button
  - _Requirements: 3.1, 3.2, 3.3_

- [ ] 5. Capture timeRemaining before async operations
  - At the start of `handleSubmitForEvaluation`, add: `const capturedTimeRemaining = timerWithExpiry.timeRemaining;`
  - In duration calculation, change `timerWithExpiry.timeRemaining` to `capturedTimeRemaining`
  - Verify duration calculation is accurate and doesn't include evaluation time
  - _Requirements: 5.1, 5.2, 5.3, 5.4_

- [ ]* 5.1 Write unit test for duration calculation
  - Test that duration accurately reflects time from start to submission
  - Test that duration doesn't include async operation time
  - _Requirements: 5.1, 5.4_

- [ ] 6. Add addMessage method to useChat hook
  - In `src/hooks/useChat.ts`, add `addMessage` function that accepts `Omit<ChatMessage, 'id' | 'timestamp'>`
  - Generate ID and timestamp internally
  - Add message to state using `setMessages`
  - Add `addMessage` to the return object
  - Update `UseChatReturn` type to include `addMessage`
  - _Requirements: 2.1, 2.2_

- [ ]* 6.1 Write unit test for addMessage method
  - Test that addMessage correctly adds a message with generated ID and timestamp
  - Test that message appears in messages array
  - _Requirements: 2.1_

- [ ] 7. Consolidate chat state ownership in App.tsx
  - In `handleStartSession`, change `sessionHook.addChatMessage` to `chat.addMessage`
  - In `handleSendMessage`, remove both `sessionHook.addChatMessage` calls (logic now in `chat.sendMessage`)
  - Simplify `handleSendMessage` to just call `chat.sendMessage(message)` and handle errors
  - Verify proctor intro message appears when session starts
  - Verify user messages and proctor responses appear correctly
  - Verify no duplicate messages in UI
  - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.5_

- [ ]* 7.1 Write integration test for chat state consolidation
  - Test that chat messages only exist in Chat_Hook.messages
  - Test that session records contain correct chat history from Chat_Hook
  - Test that no messages are written to Session_Hook.chatHistory
  - _Requirements: 2.3, 2.4, 2.5_

- [ ] 8. Checkpoint - Verify all fixes are working
  - Run TypeScript compiler: `npm run type-check` or `tsc --noEmit`
  - Verify zero TypeScript errors
  - Verify zero TypeScript warnings
  - Start a session and verify:
    - Timer counts down correctly
    - Code editor works correctly
    - Chat messages appear correctly
    - Submission works correctly (both manual and timer expiry)
    - Session duration is accurate
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- Tasks marked with `*` are optional and can be skipped for faster bugfix completion
- Each task references specific requirements for traceability
- Apply fixes in the specified order to minimize intermediate broken states
- Commit after each major task to enable easy rollback if needed
- This is a surgical bugfix - make minimal changes as specified in the design
