# Requirements Document

## Introduction

A coding assessment practice application that simulates real coding interviews. The app provides a timed session with an AI proctor, featuring a split-view interface with a chat panel and plain text editor. The proctor uses a consistent rubric to evaluate intent and logic (not syntax), then coaches users toward better answers. Progress tracking via "miss tags" enables targeted improvement over time.

## Glossary

- **Proctor**: The AI interviewer that conducts the assessment, evaluates using a rubric, and provides constructive coaching
- **Assessment_Session**: A timed coding practice session from problem presentation to evaluation
- **Chat_Panel**: The side panel where the Proctor communicates and the user asks questions
- **Code_Editor**: The main plain text editor where the user writes their solution or pseudocode
- **Problem_Bank**: A curated JSON collection of coding problems with metadata for consistent evaluation
- **Rubric**: The 4-category scoring system (Approach, Completeness, Complexity, Communication) used for evaluation
- **Miss_Tag**: A label identifying specific weaknesses (e.g., "edge-cases", "complexity-analysis") for tracking improvement
- **Verdict**: The overall assessment result: "Pass", "Borderline", or "No Pass"
- **Scaffold**: The starter code template provided for each problem (e.g., function signature with empty body)
- **Hint_Ladder**: Progressive guidance strategy: high-level approach → key insight → edge cases → small snippet
- **Fallback_Verdict**: Computed verdict used only when LLM verdict is missing or invalid

## Requirements

### Requirement 1: Assessment Session Management

**User Story:** As a user, I want to start and manage timed coding assessment sessions, so that I can practice under realistic interview conditions.

#### Acceptance Criteria

1. WHEN a user starts a new assessment session, THE System SHALL initialize a countdown timer using the problem's timeLimit (in minutes) and display it visibly at the top of the screen
2. WHILE an Assessment_Session is active, THE System SHALL display the remaining time continuously
3. WHEN the timer expires, THE Proctor SHALL notify the user that time is up and trigger evaluation
4. WHEN a user clicks "I'm done", THE System SHALL show a confirmation dialog before transitioning to evaluation
5. IF time remaining > 5 minutes when user clicks "I'm done", THE confirmation dialog SHALL warn "You have X minutes left. Are you sure?"
6. THE System SHALL auto-save session state to localStorage every 30 seconds

### Requirement 2: User Interface Layout

**User Story:** As a user, I want a clean split-view interface, so that I can code and chat with the proctor simultaneously.

#### Acceptance Criteria

1. THE System SHALL display a layout with the Code_Editor on the left and Chat_Panel on the right
2. THE System SHALL display the timer and problem title at the top of the screen
3. THE System SHALL display action buttons: "Ask question", "I'm done", "Next problem", "Review"
4. WHEN the interface loads, THE System SHALL render both panels visible and functional

### Requirement 3: AI Proctor Conversation

**User Story:** As a user, I want to interact with an AI proctor during the assessment, so that I can ask clarifying questions while working.

#### Acceptance Criteria

1. WHEN an Assessment_Session begins, THE Proctor SHALL introduce the problem and post the scaffold to the Code_Editor
2. WHEN a user sends a message, THE Proctor SHALL respond with relevant guidance without giving away the solution
3. WHEN the user asks a clarifying question, THE Proctor SHALL ask at most one clarifying question at a time in response
4. THE Proctor SHALL maintain a friendly, supportive interviewer tone throughout the session
5. THE Proctor SHALL never be pedantic about syntax issues like missing semicolons

### Requirement 4: Rubric-Based Evaluation

**User Story:** As a user, I want consistent rubric-based evaluation of my solution, so that I receive fair and actionable feedback.

#### Acceptance Criteria

1. WHEN the user clicks "I'm done" or time expires, THE Proctor SHALL evaluate the Code_Editor content using the Rubric
2. THE Proctor SHALL score 0-4 in each Rubric category: Approach, Completeness, Complexity, Communication
3. THE Proctor SHALL provide a Verdict of "Pass", "Borderline", or "No Pass" based on the scores
4. WHEN evaluating, THE Proctor SHALL assess intent and logic, accepting pseudocode as valid
5. WHEN evaluating, THE Proctor SHALL infer missing minor syntax but not invent missing logic
6. THE Proctor SHALL provide 2-3 targeted improvements, not exhaustive nitpicks
7. WHEN feedback is complete, THE Proctor SHALL provide one ideal answer showing the improved solution

### Requirement 5: Coaching and Guidance

**User Story:** As a user, I want the proctor to coach me toward better answers, so that I learn from my mistakes.

#### Acceptance Criteria

1. IF the solution approach is incorrect, THEN THE Proctor SHALL guide with hints rather than immediately showing the full solution
2. IF the solution is close to correct, THEN THE Proctor SHALL help the user cross the finish line
3. WHEN providing feedback, THE Proctor SHALL explain what is correct before addressing what is missing
4. THE Proctor SHALL discuss complexity, edge cases, and improvements as part of coaching

### Requirement 6: Chat Panel Functionality

**User Story:** As a user, I want a functional chat panel, so that I can communicate with the proctor during the assessment.

#### Acceptance Criteria

1. THE Chat_Panel SHALL display a scrollable message history
2. WHEN a user submits a message, THE Chat_Panel SHALL send it to the Proctor and display it in the history
3. WHEN the Proctor responds, THE Chat_Panel SHALL render the response with Markdown formatting (bold, bullets, code blocks)
4. THE Chat_Panel SHALL auto-scroll to the latest message, but preserve scroll position if user has scrolled up to read history
5. THE Chat_Panel SHALL visually distinguish between user messages and Proctor messages

### Requirement 7: Code Editor Functionality

**User Story:** As a user, I want a plain text editor, so that I can write my solution in a simple environment.

#### Acceptance Criteria

1. THE Code_Editor SHALL provide a plain text editing interface
2. WHEN the Proctor posts a scaffold, THE Code_Editor SHALL display it and allow editing
3. THE Code_Editor SHALL support Tab key for indentation (not focus change)
4. THE Code_Editor SHALL preserve the user's content throughout the Assessment_Session

### Requirement 8: Problem Bank

**User Story:** As a user, I want curated coding problems with consistent structure, so that the proctor can evaluate fairly.

#### Acceptance Criteria

1. THE Problem_Bank SHALL store problems as JSON with: title, prompt, constraints, examples, expected approach notes, common pitfalls, ideal solution outline, language
2. WHEN presenting a problem, THE Proctor SHALL use the problem metadata (including constraints) to provide consistent evaluation
3. THE System SHALL load problems from the Problem_Bank for each Assessment_Session
4. WHEN the user clicks "Next problem", THE System SHALL load a new problem from the Problem_Bank

### Requirement 9: Progress Tracking

**User Story:** As a user, I want my progress tracked, so that I can see improvement over time and focus on weaknesses.

#### Acceptance Criteria

1. WHEN an evaluation completes, THE System SHALL store: problem ID, final editor text, chat transcript, rubric scores, and Miss_Tags
2. THE System SHALL assign Miss_Tags identifying specific weaknesses (e.g., "edge-cases", "complexity-analysis", "data-structure-choice")
3. WHEN the user clicks "Review", THE System SHALL display past session results and identified patterns
5. THE System SHALL provide a "Clear All Data" button to delete all localStorage data
6. THE System SHALL display a notice that session data is stored locally only
