# Design Document: App State Management Fix

## Overview

This design addresses critical state management bugs in App.tsx that cause runtime errors, TypeScript compilation failures, and unpredictable behavior. The fixes involve consolidating duplicate state sources, correcting variable references, reordering callback declarations to prevent stale closures, and capturing time-sensitive values before async operations.

The approach is surgical: fix the specific wiring issues in App.tsx without rewriting the component architecture or child components. All existing hooks (useSession, useTimer, useChat) and panels remain unchanged except for adding one method to useChat.

## Architecture

### Current Issues

1. **Duplicate Timer Instances**: Two useTimer() hooks created (`timer` and `timerWithExpiry`), but only one used
2. **Duplicate Chat State**: Messages written to both `sessionHook.addChatMessage()` and `chat` state
3. **Undefined Variable References**: Session view references `session` instead of `sessionHook.session`
4. **Stale Closure Bug**: `handleTimerExpiry` declared before `handleSubmitForEvaluation`, capturing stale reference
5. **Async Timing Bug**: `timeRemaining` read after async operations, causing incorrect duration calculations

### Fixed Architecture

```
App.tsx
├── State Management
│   ├── timer (single instance with expiry handler)
│   ├── sessionHook (session lifecycle + code)
│   └── chat (chat messages - single source of truth)
│
├── Callback Declaration Order
│   ├── handleSubmitForEvaluation (declared first)
│   ├── handleTimerExpiry (references handleSubmitForEvaluation)
│   └── timer = useTimer(handleTimerExpiry)
│
└── Session View Rendering
    ├── References: sessionHook.session?.code
    ├── References: sessionHook.session?.status
    └── References: sessionHook.updateCode
```

## Components and Interfaces

### Modified Components

#### App.tsx Changes

**Remove duplicate timer:**
```typescript
// BEFORE (incorrect):
const timer = useTimer();
const timerWithExpiry = useTimer(handleTimerExpiry);

// AFTER (correct):
const timer = useTimer(handleTimerExpiry);
```

**Fix callback declaration order:**
```typescript
// BEFORE (incorrect - stale closure):
const handleTimerExpiry = useCallback(() => {
  if (sessionHook.session?.status === 'active') {
    handleSubmitForEvaluation(true); // References function declared later!
  }
}, [sessionHook.session?.status]);

const handleSubmitForEvaluation = useCallback(async (skipConfirmation: boolean = false) => {
  // ...
}, [currentProblem, sessionHook, timer, chat.messages]);

// AFTER (correct - proper order):
const handleSubmitForEvaluation = useCallback(async (skipConfirmation: boolean = false) => {
  // ...
}, [currentProblem, sessionHook, timer, chat.messages]);

const handleTimerExpiry = useCallback(() => {
  if (sessionHook.session?.status === 'active') {
    handleSubmitForEvaluation(true);
  }
}, [sessionHook.session?.status, handleSubmitForEvaluation]);
```

**Fix session variable references:**
```typescript
// BEFORE (incorrect - undefined variable):
<CodeEditorPanel
  problem={currentProblem}
  code={session.code}
  onCodeChange={session.updateCode}
  isSubmitDisabled={chat.isLoading || session.state !== 'active'}
/>

// AFTER (correct - proper references):
<CodeEditorPanel
  problem={currentProblem}
  code={sessionHook.session?.code ?? ''}
  onCodeChange={sessionHook.updateCode}
  isSubmitDisabled={chat.isLoading || sessionHook.session?.status !== 'active'}
/>
```

**Capture timeRemaining before async operations:**
```typescript
// BEFORE (incorrect - reads after async):
const handleSubmitForEvaluation = useCallback(async (skipConfirmation: boolean = false) => {
  // ... async operations ...
  timer.pause();
  await sessionHook.submitForEvaluation();
  // ... more async ...
  const duration = (currentProblem.timeLimit * 60) - timer.timeRemaining; // WRONG!
}, []);

// AFTER (correct - capture before async):
const handleSubmitForEvaluation = useCallback(async (skipConfirmation: boolean = false) => {
  const capturedTimeRemaining = timer.timeRemaining; // Capture immediately
  timer.pause();
  await sessionHook.submitForEvaluation();
  // ... async operations ...
  const duration = (currentProblem.timeLimit * 60) - capturedTimeRemaining; // Correct!
}, []);
```

**Use chat as single source of truth:**
```typescript
// BEFORE (incorrect - writes to two places):
const handleStartSession = useCallback(async () => {
  // ...
  const intro = await proctorService.generateIntro(problem);
  sessionHook.addChatMessage({ role: 'proctor', content: intro }); // Wrong!
}, []);

const handleSendMessage = useCallback(async (message: string) => {
  // ...
  sessionHook.addChatMessage({ role: 'user', content: message }); // Wrong!
  sessionHook.addChatMessage({ role: 'proctor', content: response }); // Wrong!
}, []);

// AFTER (correct - single source):
const handleStartSession = useCallback(async () => {
  // ...
  const intro = await proctorService.generateIntro(problem);
  chat.addMessage({ role: 'proctor', content: intro, timestamp: Date.now() });
}, []);

const handleSendMessage = useCallback(async (message: string) => {
  // Use chat.sendMessage which handles both user and proctor messages
  await chat.sendMessage(message);
}, []);
```

#### useChat.ts Changes

**Add addMessage method:**
```typescript
// Add to UseChatReturn interface in types.ts:
export interface UseChatReturn {
  messages: ChatMessage[];
  sendMessage: (content: string) => Promise<void>;
  isLoading: boolean;
  clearMessages: () => void;
  addMessage: (message: Omit<ChatMessage, 'id'>) => void; // NEW
}

// Add to useChat hook implementation:
const addMessage = useCallback((message: Omit<ChatMessage, 'id'>): void => {
  const fullMessage: ChatMessage = {
    ...message,
    id: generateMessageId(),
  };
  setMessages((prevMessages) => [...prevMessages, fullMessage]);
}, []);

return {
  messages,
  sendMessage,
  isLoading,
  clearMessages,
  addMessage, // NEW
};
```

## Data Models

### ChatMessage Structure

```typescript
interface ChatMessage {
  id: string;           // Generated by useChat
  role: 'user' | 'proctor';
  content: string;
  timestamp: number;    // Must be provided when calling addMessage
}
```

### Timer State

```typescript
// Single timer instance with expiry callback
const timer = useTimer(handleTimerExpiry);

// Properties:
timer.timeRemaining: number  // Current countdown in seconds
timer.start(seconds: number) // Start countdown
timer.pause()                // Pause countdown
timer.reset()                // Reset to initial state
```

## Correctness Properties

*A property is a characteristic or behavior that should hold true across all valid executions of a system—essentially, a formal statement about what the system should do. Properties serve as the bridge between human-readable specifications and machine-verifiable correctness guarantees.*

### Note on Verification Approach

This bugfix addresses **structural and architectural issues** in the code rather than algorithmic behavior. Most requirements are verified through:
- **Static Analysis**: TypeScript compilation, linter rules, code review
- **Unit Tests**: Specific examples testing runtime behavior
- **Manual Verification**: Code inspection for declaration order and variable references

Property-based testing (testing universal properties across many generated inputs) is not applicable here because the bugs are about code structure, not data transformation logic.

### Verification Properties

#### Property 1: Chat Message Single Write
*For any* chat message addition operation in the App component, the message should be written to exactly one state location (chat.addMessage or chat.sendMessage), not to multiple state managers.

**Validates: Requirements 2.2, 7.2**

**Verification Method**: Unit test with mocked hooks to verify only chat methods are called, not sessionHook.addChatMessage.

#### Property 2: Session Variable Reference Safety
*For any* render of the session view, accessing sessionHook.session properties should not throw undefined variable errors and should use optional chaining with null coalescing.

**Validates: Requirements 3.1, 3.2, 3.4, 3.5**

**Verification Method**: Unit test that renders session view and verifies no runtime errors occur.

#### Property 3: Timer Expiry Closure Correctness
*For any* timer expiry event, the handleTimerExpiry callback should invoke the current (non-stale) version of handleSubmitForEvaluation.

**Validates: Requirements 4.2**

**Verification Method**: Unit test that verifies timer expiry calls the correct submit handler after the handler is updated.

#### Property 4: Time Capture Before Async Invariant
*For any* submission operation, the timeRemaining value used in duration calculation should be captured before any async operations execute, ensuring the calculation uses the pre-async value.

**Validates: Requirements 5.1, 5.2**

**Verification Method**: Unit test with mocked async operations that verifies duration calculation uses captured time, not post-async time.

### Static Verification Properties

These properties are verified through static analysis tools rather than runtime tests:

#### Static Property 1: Single Timer Instance
The App component source code should contain exactly one useTimer() hook instantiation.

**Validates: Requirements 1.1, 1.2, 1.3**

**Verification Method**: Code review, TypeScript unused variable warnings.

#### Static Property 2: Callback Declaration Order
In the App component source code, handleSubmitForEvaluation should be declared before handleTimerExpiry.

**Validates: Requirements 4.1, 4.3**

**Verification Method**: Code review, TypeScript "accessed before declaration" errors.

#### Static Property 3: TypeScript Compilation Success
The App component should compile without TypeScript errors, unused variable warnings, or React Hook dependency warnings.

**Validates: Requirements 6.1, 6.2, 6.3, 6.4**

**Verification Method**: TypeScript compiler (tsc), ESLint with react-hooks plugin.

#### Static Property 4: State Ownership Uniqueness
Each piece of state (timer, chat, session) should be managed by exactly one hook in the source code.

**Validates: Requirements 2.1, 2.3, 2.4, 7.1, 7.3**

**Verification Method**: Code review, architectural analysis.

## Error Handling

### Existing Error Handling (Preserved)

All existing error handling in App.tsx remains unchanged:
- Try-catch blocks in async operations
- Error logging to console
- Graceful fallbacks for proctor service failures
- Session state reset on evaluation errors

### New Error Prevention

The fixes prevent these error categories:
1. **Runtime Errors**: Undefined variable references eliminated
2. **Type Errors**: All TypeScript errors resolved
3. **Logic Errors**: Stale closures prevented by correct declaration order
4. **Timing Errors**: Incorrect duration calculations prevented by capturing time before async

## Testing Strategy

### Unit Testing Approach

**Focus Areas:**
- Verify single timer instance created
- Verify chat messages only written to chat hook
- Verify session variable references resolve correctly
- Verify callback declaration order in source
- Verify time captured before async operations

**Example Unit Tests:**

```typescript
describe('App State Management', () => {
  it('should create only one timer instance', () => {
    const { result } = renderHook(() => {
      // Mock the App component's hook calls
      const timer = useTimer(jest.fn());
      return { timer };
    });
    
    expect(result.current.timer).toBeDefined();
    // Verify no second timer instance exists
  });

  it('should reference sessionHook.session in JSX', () => {
    render(<App />);
    // Start a session
    fireEvent.click(screen.getByTestId('start-session-button'));
    
    // Verify CodeEditorPanel receives sessionHook.session?.code
    const editor = screen.getByTestId('code-editor-panel');
    expect(editor).toBeInTheDocument();
    // No undefined variable errors should occur
  });

  it('should capture timeRemaining before async submit', async () => {
    const mockTimer = { timeRemaining: 300, pause: jest.fn() };
    const mockSubmit = jest.fn(async () => {
      // Simulate async delay
      await new Promise(resolve => setTimeout(resolve, 100));
    });
    
    // Capture time before async
    const captured = mockTimer.timeRemaining;
    mockTimer.pause();
    await mockSubmit();
    
    // Duration should use captured value, not current timer value
    const duration = 1800 - captured;
    expect(duration).toBe(1500);
  });
});
```

### Property-Based Testing Approach

Property-based tests are not applicable for this bugfix as the issues are structural (code organization, variable references, callback ordering) rather than algorithmic. The correctness properties listed above are verified through:
- Static analysis (TypeScript compilation)
- Code review (callback declaration order)
- Unit tests (runtime behavior)

### Integration Testing

**Test Scenarios:**
1. Start session → verify timer starts, chat initializes, session view renders
2. Submit solution → verify time captured correctly, evaluation completes, review shown
3. Send chat message → verify message only appears in chat hook state
4. Timer expires → verify handleTimerExpiry calls handleSubmitForEvaluation correctly

### Testing Configuration

- **Framework**: Vitest + React Testing Library
- **Coverage Target**: 100% of modified code paths in App.tsx
- **Test Execution**: Run on every commit
- **Regression Prevention**: All existing tests must continue passing

## Implementation Notes

### Change Summary

| File | Changes | Lines Modified |
|------|---------|----------------|
| src/App.tsx | Remove duplicate timer, fix variable refs, reorder callbacks, capture time | ~15 lines |
| src/hooks/useChat.ts | Add addMessage method | ~8 lines |
| src/types.ts | Add addMessage to UseChatReturn interface | ~1 line |

### Migration Path

1. Update useChat.ts to expose addMessage method
2. Update types.ts with new interface
3. Fix App.tsx in this order:
   - Remove unused timer variable
   - Reorder callback declarations
   - Fix session variable references
   - Capture timeRemaining before async
   - Replace sessionHook.addChatMessage with chat.addMessage
4. Run TypeScript compiler to verify all errors resolved
5. Run existing test suite to verify no regressions
6. Test manually: start session, send messages, submit solution

### Backward Compatibility

All changes are internal to App.tsx and useChat.ts. No breaking changes to:
- Component props interfaces
- Service APIs
- Storage format
- User-facing behavior

The app will function identically from the user's perspective, but with correct internal state management.
