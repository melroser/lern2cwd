# Design Document: State Management Cleanup

## Overview

This design document specifies surgical fixes to resolve critical state management bugs in App.tsx. The component currently suffers from multiple sources of truth for the same data, incorrect variable references, and callback ordering issues that cause runtime errors and potential state desyncs.

**Design Philosophy**: This is a SURGICAL BUGFIX, not a refactor. We make minimal changes to achieve stability while keeping the existing architecture intact. No component rewrites, no hook API redesigns - just fix what's broken.

**Current Broken State**:
- Two timer instances (`timer` and `timerWithExpiry`) causing confusion
- Chat messages written to both `Chat_Hook` and `Session_Hook.chatHistory` (dual sources of truth)
- JSX references undefined variable `session` instead of `sessionHook.session`
- `handleSubmitForEvaluation` accessed before declaration (stale closure bug)
- `timeRemaining` read after async operations (inaccurate duration calculation)
- Chat integration incomplete (proctor callback not wired)
- Unused variables causing TypeScript warnings

**Fixed State**:
- Single timer instance with expiry callback
- Chat messages owned exclusively by `Chat_Hook`
- All JSX references corrected to `sessionHook.session.*`
- Callbacks declared in correct order
- `timeRemaining` captured before async operations
- Chat properly integrated with proctor service
- Clean code with no unused variables

## Architecture

### State Ownership Map

This map defines the single source of truth for each piece of state:

| State | Owner | Access Pattern |
|-------|-------|----------------|
| Session lifecycle (status, id) | `Session_Hook` | `sessionHook.session.status`, `sessionHook.session.id` |
| Session code | `Session_Hook` | `sessionHook.session.code`, `sessionHook.updateCode()` |
| Timer state | `Timer_Hook` (single instance) | `timerWithExpiry.timeRemaining`, `timerWithExpiry.start()` |
| Chat messages | `Chat_Hook` | `chat.messages`, `chat.sendMessage()` |
| Current problem | `App_Component` local state | `currentProblem` |
| Current evaluation | `App_Component` local state | `currentEvaluation` |
| View state | `App_Component` local state | `currentView` |
| Confirm dialog | `App_Component` local state | `confirmDialog` |

**Key Principle**: Each piece of state has exactly ONE owner. All reads and writes go through that owner.

### Data Flow Diagram

```
┌─────────────────────────────────────────────────────────────┐
│                         App Component                        │
│                                                              │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐     │
│  │ Session Hook │  │  Timer Hook  │  │  Chat Hook   │     │
│  │              │  │              │  │              │     │
│  │ - session    │  │ - timeRemain │  │ - messages   │     │
│  │ - startSess  │  │ - start()    │  │ - sendMsg()  │     │
│  │ - updateCode │  │ - pause()    │  │ - clear()    │     │
│  │ - submitEval │  │ - reset()    │  │              │     │
│  │ - endSession │  │              │  │              │     │
│  └──────────────┘  └──────────────┘  └──────────────┘     │
│         │                 │                  │              │
│         │                 │                  │              │
│         ▼                 ▼                  ▼              │
│  ┌──────────────────────────────────────────────────────┐  │
│  │              Component Event Handlers                 │  │
│  │                                                       │  │
│  │  handleStartSession()                                │  │
│  │  handleSubmitForEvaluation() ◄─── handleTimerExpiry()│  │
│  │  handleSendMessage() ──────────► chat.sendMessage()  │  │
│  │  handleSubmitClick()                                 │  │
│  └──────────────────────────────────────────────────────┘  │
│                                                              │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
                    ┌──────────────────┐
                    │ Proctor Service  │
                    │                  │
                    │ - generateIntro()│
                    │ - respondToQ()   │
                    │ - evaluate()     │
                    └──────────────────┘
```

**Flow Notes**:
- Timer expiry triggers `handleTimerExpiry` which calls `handleSubmitForEvaluation`
- Chat messages flow through `chat.sendMessage()` which internally calls proctor service
- Session state changes flow through `Session_Hook` methods only
- No direct writes to hook internals from App component

## Detailed Fix Specifications

### Fix 1: Remove Duplicate Timer Instance

**Problem**: Two timer instances exist (`timer` and `timerWithExpiry`), but only `timerWithExpiry` is used. The unused `timer` instance causes TypeScript warnings.

**Solution**: Remove the unused `timer` instance declaration.

**Changes**:
```typescript
// REMOVE this line:
const timer = useTimer();

// KEEP this line:
const timerWithExpiry = useTimer(handleTimerExpiry);
```

**Validation**: 
- TypeScript warning about unused `timer` variable disappears
- All timer operations continue to work correctly

**Requirements Validated**: 1.1, 1.2, 1.3, 1.4

---

### Fix 2: Consolidate Chat State Ownership

**Problem**: Chat messages are written to both `Chat_Hook.messages` (via `chat.sendMessage()`) and `Session_Hook.chatHistory` (via `sessionHook.addChatMessage()`). This creates dual sources of truth and potential desyncs.

**Solution**: Make `Chat_Hook` the single source of truth. Remove all `sessionHook.addChatMessage()` calls. Add `addMessage()` method to `useChat` for programmatic message addition (needed for proctor intro).

**Changes to useChat.ts**:
```typescript
/**
 * Add a message directly to the chat history
 * Used for system-generated messages like proctor intro
 * 
 * @param message - The message to add (without ID or timestamp)
 */
const addMessage = useCallback((message: Omit<ChatMessage, 'id' | 'timestamp'>): void => {
  const fullMessage: ChatMessage = {
    id: generateMessageId(),
    ...message,
    timestamp: Date.now(),
  };
  
  setMessages((prevMessages) => [...prevMessages, fullMessage]);
}, []);

// Add to return object:
return {
  messages,
  sendMessage,
  addMessage,  // NEW
  isLoading,
  clearMessages,
};
```

**Changes to App.tsx**:
```typescript
// REMOVE all calls like:
sessionHook.addChatMessage({ role: 'proctor', content: intro });
sessionHook.addChatMessage({ role: 'user', content: message });

// REPLACE with:
chat.addMessage({ role: 'proctor', content: intro });
// (user messages go through chat.sendMessage(), not addMessage)
```

**Specific locations in App.tsx**:
1. `handleStartSession`: Change `sessionHook.addChatMessage` to `chat.addMessage`
2. `handleSendMessage`: Remove both `sessionHook.addChatMessage` calls (handled by `chat.sendMessage`)
3. Session save: Change `chatHistory: chat.messages` (already correct, no change needed)

**Validation**:
- All chat messages appear in UI correctly
- No duplicate messages
- Session records contain correct chat history
- No calls to `sessionHook.addChatMessage` remain

**Requirements Validated**: 2.1, 2.2, 2.3, 2.4, 2.5

---

### Fix 3: Correct JSX Variable References

**Problem**: JSX code references undefined variable `session` instead of `sessionHook.session`. This causes runtime errors.

**Solution**: Replace all `session.*` references with `sessionHook.session.*`.

**Changes**:
```typescript
// In CodeEditorPanel props:
// BEFORE:
code={session.code}
onCodeChange={session.updateCode}
isSubmitDisabled={chat.isLoading || session.state !== 'active'}

// AFTER:
code={sessionHook.session.code}
onCodeChange={sessionHook.updateCode}
isSubmitDisabled={chat.isLoading || sessionHook.session?.status !== 'active'}
```

**Note**: Also fix `session.state` → `sessionHook.session?.status` (correct property name).

**Validation**:
- TypeScript errors about undefined `session` disappear
- Code editor displays and updates correctly
- Submit button enable/disable logic works correctly

**Requirements Validated**: 3.1, 3.2, 3.3, 3.4, 3.5

---

### Fix 4: Reorder Callback Declarations

**Problem**: `handleTimerExpiry` references `handleSubmitForEvaluation` before it's declared, causing a stale closure bug and TypeScript error.

**Solution**: Declare `handleSubmitForEvaluation` before `handleTimerExpiry`, and declare `handleTimerExpiry` before `timerWithExpiry` initialization.

**Changes**:
```typescript
// NEW ORDER:

// 1. Declare handleSubmitForEvaluation first
const handleSubmitForEvaluation = useCallback(async (skipConfirmation: boolean = false) => {
  // ... implementation ...
}, [currentProblem, sessionHook, timerWithExpiry, chat.messages]);

// 2. Declare handleTimerExpiry second (now can safely reference handleSubmitForEvaluation)
const handleTimerExpiry = useCallback(() => {
  if (sessionHook.session?.status === 'active') {
    handleSubmitForEvaluation(true);
  }
}, [sessionHook.session?.status, handleSubmitForEvaluation]);

// 3. Initialize timer third (now can safely use handleTimerExpiry)
const timerWithExpiry = useTimer(handleTimerExpiry);
```

**Current problematic order**:
```typescript
// WRONG ORDER:
const handleTimerExpiry = useCallback(() => {
  handleSubmitForEvaluation(true); // ERROR: accessed before declaration
}, [sessionHook.session?.status]);

const timerWithExpiry = useTimer(handleTimerExpiry);

const handleSubmitForEvaluation = useCallback(async (...) => {
  // ... declared too late ...
}, [...]);
```

**Validation**:
- TypeScript error about accessing before declaration disappears
- Timer expiry correctly triggers submission
- No stale closure bugs

**Requirements Validated**: 4.1, 4.2, 4.3, 4.4

---

### Fix 5: Capture timeRemaining Before Async Operations

**Problem**: `timeRemaining` is read from `timerWithExpiry.timeRemaining` after async operations complete, giving an inaccurate duration calculation.

**Solution**: Capture `timeRemaining` at the start of `handleSubmitForEvaluation` before any async operations.

**Changes**:
```typescript
const handleSubmitForEvaluation = useCallback(async (skipConfirmation: boolean = false) => {
  if (!currentProblem || sessionHook.session?.status !== 'active') return;
  
  // CAPTURE timeRemaining IMMEDIATELY (before any async operations)
  const capturedTimeRemaining = timerWithExpiry.timeRemaining;
  
  try {
    // Close confirmation dialog if open
    setConfirmDialog({ isOpen: false, timeRemaining: 0 });
    
    // Stop timer
    timerWithExpiry.pause();
    
    // Set session to evaluating state
    await sessionHook.submitForEvaluation();
    
    // ... more async operations ...
    
    // Calculate session duration using CAPTURED value
    const duration = (currentProblem.timeLimit * 60) - capturedTimeRemaining;
    
    // ... rest of implementation ...
  } catch (error) {
    // ... error handling ...
  }
}, [currentProblem, sessionHook, timerWithExpiry, chat.messages]);
```

**Validation**:
- Session duration accurately reflects time from start to submission
- Duration doesn't include evaluation time
- Duration calculation is consistent

**Requirements Validated**: 5.1, 5.2, 5.3, 5.4

---

### Fix 6: Wire Chat with Proctor Callback

**Problem**: `useChat` is initialized without a proctor response callback, so the chat integration is incomplete. The `handleSendMessage` function manually calls proctor service and adds messages, duplicating logic that should be in the hook.

**Solution**: Initialize `useChat` with a proctor response callback that wraps `proctorService.respondToQuestion`. Simplify `handleSendMessage` to just call `chat.sendMessage()`.

**Changes**:
```typescript
// Initialize chat with proctor callback
const chat = useChat({
  onGetProctorResponse: async (userMessage: string) => {
    if (!currentProblem || !sessionHook.session) {
      throw new Error('No active session');
    }
    
    const context = {
      problem: currentProblem,
      currentCode: sessionHook.session.code,
      chatHistory: chat.messages,
      timeRemaining: timerWithExpiry.timeRemaining,
    };
    
    return await proctorService.respondToQuestion(userMessage, context);
  }
});

// Simplify handleSendMessage
const handleSendMessage = useCallback(async (message: string) => {
  await chat.sendMessage(message);
}, [chat]);
```

**Note**: This creates a circular dependency issue - `chat` initialization needs `chat.messages`. We have two options:

**Option A (Recommended)**: Keep current implementation, defer this fix to implementation phase
- Current `handleSendMessage` works correctly
- Refactoring to use callback adds complexity without clear benefit
- Mark as "optional improvement" in tasks

**Option B**: Use a ref to break the circular dependency
- More complex, requires careful implementation
- Provides cleaner separation of concerns

**Decision**: Use Option A - keep current implementation. The manual integration in `handleSendMessage` works correctly and is easier to understand. Mark callback integration as an optional improvement.

**Validation**:
- User messages appear in chat immediately
- Proctor responses appear after user messages
- Error messages appear when proctor service fails
- Chat state remains consistent

**Requirements Validated**: 6.1, 6.2, 6.3, 6.4, 6.5

---

### Fix 7: Remove Unused Variables and Parameters

**Problem**: Several unused variables and parameters cause TypeScript warnings.

**Solution**: Remove all unused declarations.

**Changes**:
```typescript
// REMOVE unused parameter:
const handleSubmitForEvaluation = useCallback(async (skipConfirmation: boolean = false) => {
  // Parameter 'skipConfirmation' is never used - REMOVE IT
}, [...]);

// AFTER:
const handleSubmitForEvaluation = useCallback(async () => {
  // No unused parameter
}, [...]);
```

**Note**: The `skipConfirmation` parameter was intended to distinguish timer expiry from manual submission, but it's never actually used in the function body. Since the function behavior is the same regardless, we can safely remove it.

**Validation**:
- TypeScript produces zero warnings about unused variables
- TypeScript produces zero warnings about unused parameters
- All functionality continues to work correctly

**Requirements Validated**: 7.1, 7.2, 7.3, 7.4

## Implementation Strategy

### Order of Changes

Apply fixes in this specific order to minimize intermediate broken states:

1. **Fix 4 first** (Reorder callbacks): This fixes the TypeScript error that prevents compilation
2. **Fix 1** (Remove duplicate timer): Simple removal, no dependencies
3. **Fix 7** (Remove unused variables): Simple cleanup, no dependencies
4. **Fix 3** (Correct JSX references): Fixes runtime errors in UI
5. **Fix 5** (Capture timeRemaining): Improves accuracy, no breaking changes
6. **Fix 2** (Consolidate chat state): Requires adding `addMessage` to useChat first, then updating App.tsx
7. **Fix 6** (Wire chat callback): Optional improvement, can be deferred

**Rationale**: 
- Fix compilation errors first (Fix 4)
- Then fix runtime errors (Fix 3)
- Then improve correctness (Fix 5, Fix 2)
- Finally, optional improvements (Fix 6)

### Testing Approach

**For Each Fix**:

1. **Before applying fix**: Document current error/warning
2. **Apply fix**: Make minimal changes as specified
3. **Verify TypeScript**: Run `tsc --noEmit` to check for errors
4. **Verify runtime**: Test affected functionality manually
5. **Verify requirements**: Check that acceptance criteria are met

**Specific Test Cases**:

**Fix 1 (Remove duplicate timer)**:
- ✓ TypeScript warning about unused `timer` is gone
- ✓ Timer countdown works correctly
- ✓ Timer expiry triggers submission

**Fix 2 (Consolidate chat state)**:
- ✓ Proctor intro message appears when session starts
- ✓ User messages appear immediately when sent
- ✓ Proctor responses appear after user messages
- ✓ Session records contain correct chat history
- ✓ No duplicate messages in UI

**Fix 3 (Correct JSX references)**:
- ✓ TypeScript errors about undefined `session` are gone
- ✓ Code editor displays current code
- ✓ Code editor updates when typing
- ✓ Submit button enable/disable works correctly

**Fix 4 (Reorder callbacks)**:
- ✓ TypeScript error about accessing before declaration is gone
- ✓ Timer expiry triggers submission correctly
- ✓ Manual submission works correctly

**Fix 5 (Capture timeRemaining)**:
- ✓ Session duration is accurate (doesn't include evaluation time)
- ✓ Duration calculation is consistent across submissions

**Fix 6 (Wire chat callback)**:
- ✓ User messages appear in chat
- ✓ Proctor responses appear in chat
- ✓ Error messages appear when proctor fails
- ✓ Chat state remains consistent

**Fix 7 (Remove unused variables)**:
- ✓ TypeScript produces zero warnings
- ✓ All functionality continues to work

### Rollback Plan

If issues arise during implementation:

1. **Git commit after each fix**: Allows easy rollback to last working state
2. **Test after each fix**: Catch issues early before they compound
3. **Keep fixes independent**: Each fix can be rolled back without affecting others
4. **Document any deviations**: If implementation differs from design, document why

**Rollback procedure**:
```bash
# If a fix causes issues:
git revert <commit-hash>  # Revert the problematic fix
# Fix the issue
# Re-apply the fix correctly
```

## Components and Interfaces

### Modified Components

**App.tsx**:
- Remove duplicate timer instance
- Consolidate chat state ownership
- Correct JSX variable references
- Reorder callback declarations
- Capture timeRemaining before async operations
- Optionally wire chat with proctor callback
- Remove unused variables

**useChat.ts**:
- Add `addMessage()` method for programmatic message addition
- Update return type to include `addMessage`

### Interface Changes

**UseChatReturn** (in types.ts or useChat.ts):
```typescript
export interface UseChatReturn {
  messages: ChatMessage[];
  sendMessage: (content: string) => Promise<void>;
  addMessage: (message: Omit<ChatMessage, 'id' | 'timestamp'>) => void;  // NEW
  isLoading: boolean;
  clearMessages: () => void;
}
```

**No other interface changes required** - this is a bugfix, not a feature addition.

## Data Models

No data model changes required. All existing types remain the same:
- `ChatMessage`
- `SessionRecord`
- `Problem`
- `EvaluationResult`
- etc.

## Correctness Properties

*A property is a characteristic or behavior that should hold true across all valid executions of a system—essentially, a formal statement about what the system should do. Properties serve as the bridge between human-readable specifications and machine-verifiable correctness guarantees.*

### Property 1: Single Timer Instance

*For any* execution of the App component, there should be exactly one timer instance managing the countdown.

**Validates: Requirements 1.1, 1.2, 1.3, 1.4**

**Test Strategy**: Code inspection - verify only one `useTimer()` call exists in App.tsx.

---

### Property 2: Chat State Ownership Exclusivity

*For any* chat message added during a session, it should be written to exactly one state location (Chat_Hook.messages), not multiple locations.

**Validates: Requirements 2.1, 2.2, 2.3**

**Test Strategy**: Code inspection - verify no calls to `sessionHook.addChatMessage` exist, all messages go through `chat.addMessage` or `chat.sendMessage`.

---

### Property 3: Chat State Read Consistency

*For any* operation that reads chat messages (rendering, saving session), it should read from the same source (Chat_Hook.messages).

**Validates: Requirements 2.4, 2.5**

**Test Strategy**: Code inspection - verify all chat message reads use `chat.messages`, not `sessionHook.session.chatHistory`.

---

### Property 4: Variable Reference Validity

*For any* JSX expression referencing session data, the variable should be defined and accessible in scope.

**Validates: Requirements 3.1, 3.2, 3.3, 3.4, 3.5**

**Test Strategy**: TypeScript compilation - zero errors about undefined variables.

---

### Property 5: Callback Declaration Order

*For any* callback that references another callback, the referenced callback should be declared before the referencing callback.

**Validates: Requirements 4.1, 4.2, 4.3, 4.4**

**Test Strategy**: TypeScript compilation - zero errors about accessing variables before declaration.

---

### Property 6: Duration Calculation Accuracy

*For any* session submission, the calculated duration should reflect the time from session start to submission, not including any async operation time.

**Validates: Requirements 5.1, 5.2, 5.3, 5.4**

**Test Strategy**: Manual testing - verify duration is accurate by comparing to actual elapsed time.

---

### Property 7: Chat Integration Completeness

*For any* user message sent during a session, the chat system should handle both the user message and proctor response without manual intervention from App component.

**Validates: Requirements 6.1, 6.2, 6.3, 6.4, 6.5**

**Test Strategy**: Manual testing - verify user messages and proctor responses appear correctly in chat.

---

### Property 8: Code Cleanliness

*For any* variable or parameter declared in App.tsx, it should be used at least once in the code.

**Validates: Requirements 7.1, 7.2, 7.3, 7.4**

**Test Strategy**: TypeScript compilation - zero warnings about unused variables or parameters.

---

### Property 9: Session Lifecycle Integrity

*For any* session from start to completion, all state transitions should occur in the correct order without errors.

**Validates: Requirements 8.1, 8.2, 8.3, 8.4**

**Test Strategy**: End-to-end manual testing - start session, interact with chat, submit solution, verify no errors occur.

## Error Handling

### Error Scenarios

**Scenario 1: Timer expiry during async operation**
- **Situation**: Timer expires while evaluation is in progress
- **Current behavior**: May cause race condition
- **Fix**: Timer is paused before evaluation starts, so expiry cannot occur during evaluation
- **Validation**: No change needed, existing behavior is correct

**Scenario 2: Proctor service failure**
- **Situation**: Proctor service throws error when getting response
- **Current behavior**: Error is caught and error message is added to chat
- **Fix**: No change needed, existing error handling is correct
- **Validation**: Verify error messages appear in chat when proctor fails

**Scenario 3: Session state desync**
- **Situation**: Multiple state sources have different values for same data
- **Current behavior**: Causes bugs and incorrect UI
- **Fix**: Consolidate to single source of truth (Fix 2)
- **Validation**: Verify chat messages are consistent across all views

**Scenario 4: Undefined variable access**
- **Situation**: JSX references undefined variable
- **Current behavior**: Runtime error, app crashes
- **Fix**: Correct variable references (Fix 3)
- **Validation**: Verify no runtime errors occur during session

## Testing Strategy

### Dual Testing Approach

We will use both unit tests and property-based tests to ensure comprehensive coverage:

**Unit Tests**: Verify specific examples, edge cases, and error conditions
- Specific scenarios like "timer expiry triggers submission"
- Edge cases like "submit with 0 seconds remaining"
- Error conditions like "proctor service failure"

**Property Tests**: Verify universal properties across all inputs
- Properties like "chat messages always have unique IDs"
- Properties like "duration calculation is always non-negative"
- Properties like "session state transitions are always valid"

**Balance**: Focus unit tests on concrete scenarios and integration points. Use property tests for data invariants and state machine properties.

### Property-Based Testing Configuration

**Library**: We will use `fast-check` for TypeScript property-based testing.

**Configuration**:
- Minimum 100 iterations per property test
- Each test tagged with feature name and property number
- Tag format: `// Feature: state-management-cleanup, Property N: <property text>`

**Example**:
```typescript
import fc from 'fast-check';

// Feature: state-management-cleanup, Property 2: Chat State Ownership Exclusivity
test('chat messages are written to exactly one location', () => {
  fc.assert(
    fc.property(fc.array(fc.string()), (messages) => {
      // Test that messages only go to chat.messages, not sessionHook.chatHistory
      // This is a code inspection property, not a runtime property
    }),
    { numRuns: 100 }
  );
});
```

### Test Coverage

**Each fix should have**:
- At least one unit test verifying the fix works
- At least one property test verifying the correctness property holds
- Manual testing to verify UI behavior

**Specific tests**:
- Fix 1: Unit test verifying timer works, property test verifying single instance
- Fix 2: Unit test verifying chat messages appear, property test verifying single source of truth
- Fix 3: Unit test verifying JSX renders, property test verifying variable validity
- Fix 4: Unit test verifying timer expiry works, property test verifying declaration order
- Fix 5: Unit test verifying duration accuracy, property test verifying calculation correctness
- Fix 6: Unit test verifying chat integration, property test verifying completeness
- Fix 7: Code inspection verifying no unused variables

## Out of Scope

The following improvements are valuable but explicitly OUT OF SCOPE for this bugfix:

### ProctorOrchestrator Service Layer
- **What**: A service layer to coordinate proctor interactions and manage context
- **Why valuable**: Would centralize proctor logic and reduce coupling
- **Why deferred**: Requires architectural changes beyond surgical bugfix scope
- **Follow-up**: Create separate spec for "proctor-service-refactor"

### Component Prop Interface Changes
- **What**: Updating component props to match actual usage
- **Why valuable**: Would fix TypeScript errors in component interfaces
- **Why deferred**: Requires changes to multiple components
- **Follow-up**: Address in separate bugfix or as part of component refactor

### Hook API Redesigns
- **What**: Redesigning hook APIs for better ergonomics
- **Why valuable**: Could simplify usage and reduce bugs
- **Why deferred**: Requires broader refactoring beyond bugfix scope
- **Follow-up**: Consider in future architecture improvements

### State Management Library
- **What**: Introducing Redux, Zustand, or other state management library
- **Why valuable**: Would provide better state management patterns
- **Why deferred**: Major architectural change, not appropriate for bugfix
- **Follow-up**: Consider if state management issues persist

### Comprehensive Test Suite
- **What**: Full test coverage for all components and hooks
- **Why valuable**: Would catch regressions and improve confidence
- **Why deferred**: Beyond scope of this bugfix
- **Follow-up**: Incremental test additions as features are developed

## Success Criteria

This bugfix is successful when:

1. ✓ Zero TypeScript errors in App.tsx
2. ✓ Zero TypeScript warnings in App.tsx
3. ✓ Zero runtime errors during session lifecycle
4. ✓ All 8 requirements satisfied (verified by acceptance criteria)
5. ✓ Code remains readable and maintainable
6. ✓ No regressions in existing functionality
7. ✓ All correctness properties hold

## Notes

- This is a SURGICAL BUGFIX - make minimal changes to achieve stability
- Keep existing architecture intact - no rewrites
- Focus on correctness first, optimization later
- Document any deviations from this design during implementation
- Consider follow-up specs for out-of-scope improvements
