import { useState, useCallback } from 'react';
import type { Session, Problem, ChatMessage, UseSessionReturn } from '../types';

/**
 * Generate a unique session ID
 * Uses timestamp + random string for uniqueness
 */
function generateSessionId(): string {
  const timestamp = Date.now().toString(36);
  const randomPart = Math.random().toString(36).substring(2, 9);
  return `session-${timestamp}-${randomPart}`;
}

/**
 * Generate a unique message ID
 */
function generateMessageId(): string {
  const timestamp = Date.now().toString(36);
  const randomPart = Math.random().toString(36).substring(2, 7);
  return `msg-${timestamp}-${randomPart}`;
}

/**
 * useSession - Session state management hook
 * 
 * Manages the lifecycle of a coding assessment session:
 * - idle (session is null) → active → evaluating → completed
 * 
 * Requirements:
 * - 1.4: WHEN a user clicks "I'm done", THE System SHALL show a confirmation dialog 
 *        before transitioning to evaluation
 * - 3.1: WHEN an Assessment_Session begins, THE Proctor SHALL introduce the problem 
 *        and post the scaffold to the Code_Editor
 * - 7.4: THE Code_Editor SHALL preserve the user's content throughout the Assessment_Session
 * 
 * @returns UseSessionReturn - Session state and control functions
 */
export function useSession(): UseSessionReturn & {
  addChatMessage: (message: Omit<ChatMessage, 'id' | 'timestamp'>) => void;
} {
  // Session state - null when idle (no active session)
  const [session, setSession] = useState<Session | null>(null);

  /**
   * Start a new session with the given problem
   * Creates a new session with:
   * - Unique session ID
   * - Problem's scaffold as initial code (Requirement 3.1)
   * - Empty chat history
   * - Active status
   * 
   * @param problem - The problem to start the session with
   */
  const startSession = useCallback((problem: Problem) => {
    const newSession: Session = {
      id: generateSessionId(),
      problemId: problem.id,
      startTime: Date.now(),
      endTime: null,
      status: 'active',
      code: problem.scaffold, // Requirement 3.1: Post scaffold to Code_Editor
      chatHistory: [],
    };

    setSession(newSession);
  }, []);

  /**
   * End the current session
   * Sets the end time and transitions to completed status
   */
  const endSession = useCallback(() => {
    setSession((currentSession) => {
      if (!currentSession) {
        return null;
      }

      return {
        ...currentSession,
        endTime: Date.now(),
        status: 'completed',
      };
    });
  }, []);

  /**
   * Update the code content in the current session
   * Preserves user content throughout the session (Requirement 7.4)
   * 
   * @param code - The new code content
   */
  const updateCode = useCallback((code: string) => {
    setSession((currentSession) => {
      if (!currentSession) {
        return null;
      }

      // Only update if session is active (Requirement 7.4: preserve content)
      if (currentSession.status !== 'active') {
        return currentSession;
      }

      return {
        ...currentSession,
        code,
      };
    });
  }, []);

  /**
   * Submit the current session for evaluation
   * Transitions from 'active' to 'evaluating' status (Requirement 1.4)
   * 
   * Note: The confirmation dialog should be handled by the UI component
   * before calling this function.
   */
  const submitForEvaluation = useCallback(async (): Promise<void> => {
    setSession((currentSession) => {
      if (!currentSession) {
        return null;
      }

      // Only allow submission from active state
      if (currentSession.status !== 'active') {
        return currentSession;
      }

      return {
        ...currentSession,
        status: 'evaluating',
      };
    });
  }, []);

  /**
   * Add a chat message to the session's chat history
   * 
   * @param message - The message to add (without id and timestamp)
   */
  const addChatMessage = useCallback((message: Omit<ChatMessage, 'id' | 'timestamp'>) => {
    setSession((currentSession) => {
      if (!currentSession) {
        return null;
      }

      const newMessage: ChatMessage = {
        ...message,
        id: generateMessageId(),
        timestamp: Date.now(),
      };

      return {
        ...currentSession,
        chatHistory: [...currentSession.chatHistory, newMessage],
      };
    });
  }, []);

  return {
    session,
    startSession,
    endSession,
    updateCode,
    submitForEvaluation,
    addChatMessage,
  };
}

export default useSession;
