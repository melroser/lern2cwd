# Requirements Document: State Management Cleanup

## Introduction

This bugfix specification addresses critical state management issues in the App.tsx component of the coding interview simulator application. The component currently has multiple sources of truth for the same data, causing runtime errors, potential state desyncs, and incorrect variable references. This fix will consolidate state management to ensure a single source of truth for each piece of state, correct variable references, and fix callback ordering issues.

## Glossary

- **App_Component**: The main React component (App.tsx) that orchestrates the coding interview session
- **Timer_Hook**: The useTimer custom hook that manages countdown functionality
- **Chat_Hook**: The useChat custom hook that manages chat message state
- **Session_Hook**: The useSession custom hook that manages session lifecycle and state
- **Proctor_Service**: The service that provides AI-powered interview proctor responses
- **State_Desync**: A condition where multiple state variables representing the same data have different values
- **Stale_Closure**: A JavaScript closure that captures an outdated reference to a variable or function

## Requirements

### Requirement 1: Single Timer Instance

**User Story:** As a developer, I want only one timer instance managing the countdown, so that there are no conflicting timer states causing bugs.

#### Acceptance Criteria

1. THE App_Component SHALL use exactly one Timer_Hook instance
2. WHEN the App_Component initializes, THE unused timer instance SHALL be removed
3. THE remaining Timer_Hook instance SHALL be named descriptively to indicate it handles expiry callbacks
4. THE Timer_Hook instance SHALL be used consistently throughout all timer-related operations

### Requirement 2: Single Chat State Owner

**User Story:** As a developer, I want chat messages managed by a single state owner, so that the UI always displays the correct message history without desyncs.

#### Acceptance Criteria

1. THE Chat_Hook SHALL be the single source of truth for all chat messages
2. WHEN a chat message is added, THE App_Component SHALL only write to Chat_Hook state
3. THE App_Component SHALL NOT write chat messages to Session_Hook.chatHistory
4. WHEN rendering chat messages, THE App_Component SHALL read from Chat_Hook.messages
5. WHEN saving a session record, THE App_Component SHALL read chat history from Chat_Hook.messages

### Requirement 3: Correct Variable References

**User Story:** As a developer, I want all JSX to reference the correct variable names, so that the application runs without undefined variable errors.

#### Acceptance Criteria

1. WHEN referencing session code in JSX, THE App_Component SHALL use sessionHook.session.code
2. WHEN referencing session status in JSX, THE App_Component SHALL use sessionHook.session.status
3. WHEN referencing session update methods in JSX, THE App_Component SHALL use sessionHook.updateCode
4. THE App_Component SHALL NOT reference undefined variables named "session"
5. WHEN TypeScript compilation occurs, THE App_Component SHALL produce zero errors related to undefined variables

### Requirement 4: Correct Callback Declaration Order

**User Story:** As a developer, I want callbacks declared before they are referenced, so that there are no stale closure bugs or "accessed before declaration" errors.

#### Acceptance Criteria

1. THE handleSubmitForEvaluation callback SHALL be declared before handleTimerExpiry
2. WHEN handleTimerExpiry references handleSubmitForEvaluation, THE reference SHALL be to the current version
3. THE Timer_Hook initialization SHALL occur after handleTimerExpiry is declared
4. WHEN TypeScript compilation occurs, THE App_Component SHALL produce zero errors related to accessing variables before declaration

### Requirement 5: Accurate Duration Calculation

**User Story:** As a developer, I want session duration calculated accurately, so that session records reflect the actual time spent coding.

#### Acceptance Criteria

1. WHEN calculating session duration, THE App_Component SHALL capture timeRemaining before any async operations
2. THE timeRemaining value SHALL be captured immediately when handleSubmitForEvaluation begins execution
3. THE duration calculation SHALL use the captured timeRemaining value, not a value read after async operations
4. WHEN a session is submitted, THE calculated duration SHALL accurately reflect the time from session start to submission

### Requirement 6: Proper Chat Integration

**User Story:** As a developer, I want the Chat_Hook properly integrated with the Proctor_Service, so that user messages and proctor responses are handled correctly.

#### Acceptance Criteria

1. WHEN initializing Chat_Hook, THE App_Component SHALL provide a proctor response callback
2. THE proctor response callback SHALL invoke Proctor_Service.respondToQuestion
3. WHEN a user sends a message, THE Chat_Hook SHALL handle both user message and proctor response
4. THE App_Component SHALL NOT manually add messages to Chat_Hook after sending
5. WHEN an error occurs getting a proctor response, THE Chat_Hook SHALL handle the error and add an error message

### Requirement 7: Remove Unused Code

**User Story:** As a developer, I want unused variables and parameters removed, so that the codebase is clean and TypeScript produces no warnings.

#### Acceptance Criteria

1. THE App_Component SHALL NOT declare unused variables
2. THE App_Component SHALL NOT declare unused function parameters
3. WHEN TypeScript compilation occurs, THE App_Component SHALL produce zero warnings about unused variables
4. WHEN TypeScript compilation occurs, THE App_Component SHALL produce zero warnings about unused parameters

### Requirement 8: Session Lifecycle Integrity

**User Story:** As a user, I want the complete 