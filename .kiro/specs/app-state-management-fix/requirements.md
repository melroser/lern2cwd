# Requirements Document

## Introduction

This bugfix specification addresses critical state management issues in the App.tsx component that cause instability, incorrect behavior, and TypeScript errors. The root cause is multiple sources of truth for timers and chat state, incorrect variable scoping, and callback ordering issues that create stale closures.

## Glossary

- **App_Component**: The main React component (App.tsx) that orchestrates the coding interview session
- **Timer_Hook**: The useTimer() hook that manages countdown functionality
- **Chat_Hook**: The useChat() hook that manages chat message state
- **Session_Hook**: The useSession() hook that manages session state and data
- **Session_View**: The JSX rendering section that displays the active coding session
- **Timer_Expiry_Handler**: The callback function that executes when the timer reaches zero
- **Submit_Handler**: The callback function that handles solution submission for evaluation
- **Time_Remaining**: The current countdown value in seconds from the timer
- **Chat_Message**: A message object in the chat conversation
- **Stale_Closure**: A closure that captures an outdated reference to a function or variable

## Requirements

### Requirement 1: Single Timer Instance

**User Story:** As a developer, I want only one timer instance in the App component, so that there is no confusion about which timer controls the countdown and no potential timing bugs from multiple timer sources.

#### Acceptance Criteria

1. THE App_Component SHALL instantiate exactly one Timer_Hook
2. WHEN the App_Component renders, THE Timer_Hook SHALL be the sole source of Time_Remaining values
3. THE App_Component SHALL NOT create unused Timer_Hook instances

### Requirement 2: Single Chat State Owner

**User Story:** As a developer, I want chat messages managed by a single source of truth, so that chat state remains synchronized and there are no duplicate or missing messages.

#### Acceptance Criteria

1. THE Chat_Hook SHALL be the sole owner of Chat_Message state
2. WHEN a Chat_Message is added, THE App_Component SHALL call only Chat_Hook methods
3. THE App_Component SHALL NOT write Chat_Message data to multiple state locations
4. THE Session_Hook SHALL NOT manage Chat_Message state
5. THE Chat_Hook SHALL expose an addMessage method for directly adding messages to state

### Requirement 3: Correct Variable References

**User Story:** As a developer, I want all JSX to reference correctly scoped variables, so that the application renders without runtime errors and displays accurate data.

#### Acceptance Criteria

1. WHEN the Session_View renders, THE App_Component SHALL reference sessionHook.session for session data
2. THE Session_View SHALL NOT reference undefined variables
3. THE App_Component SHALL pass correct props to all child components
4. WHEN accessing session code, THE App_Component SHALL use sessionHook.session?.code with null coalescing
5. WHEN accessing session status, THE App_Component SHALL use sessionHook.session?.status

### Requirement 4: Proper Callback Declaration Order

**User Story:** As a developer, I want callbacks declared in dependency order, so that there are no stale closure bugs where callbacks reference outdated function versions.

#### Acceptance Criteria

1. WHEN a callback references another callback, THE referenced callback SHALL be declared before the referencing callback
2. THE Timer_Expiry_Handler SHALL NOT capture a Stale_Closure of the Submit_Handler
3. THE App_Component SHALL declare the Submit_Handler before the Timer_Expiry_Handler

### Requirement 5: Captured Time Values Before Async Operations

**User Story:** As a developer, I want time-sensitive values captured before async operations, so that duration calculations use the correct time values and are not affected by async delays.

#### Acceptance Criteria

1. WHEN the Submit_Handler executes async operations, THE Time_Remaining SHALL be captured before the first async call
2. WHEN calculating session duration, THE App_Component SHALL use the captured Time_Remaining value
3. THE App_Component SHALL NOT read Time_Remaining after async operations complete

### Requirement 6: TypeScript Error Resolution

**User Story:** As a developer, I want all TypeScript errors resolved, so that the codebase type-checks successfully and catches type errors at compile time.

#### Acceptance Criteria

1. THE App_Component SHALL compile without TypeScript errors
2. THE App_Component SHALL NOT reference variables before they are declared
3. THE App_Component SHALL NOT use variables that are assigned but never read
4. THE App_Component SHALL include all required dependencies in React Hook dependency arrays

### Requirement 7: Single Source of Truth

**User Story:** As a developer, I want each piece of state managed by exactly one owner, so that the application maintains consistency and predictable behavior.

#### Acceptance Criteria

1. THE App_Component SHALL NOT duplicate state management across multiple hooks
2. WHEN state is updated, THE App_Component SHALL update it in exactly one location
3. THE App_Component SHALL delegate state management to the appropriate specialized hook
