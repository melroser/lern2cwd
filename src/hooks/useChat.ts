import { useState, useCallback } from 'react';
import type { ChatMessage, UseChatReturn } from '../types';

/**
 * Generate a unique message ID
 * Uses timestamp + random string for uniqueness
 */
function generateMessageId(): string {
  const timestamp = Date.now().toString(36);
  const randomPart = Math.random().toString(36).substring(2, 7);
  return `msg-${timestamp}-${randomPart}`;
}

/**
 * Callback type for getting proctor responses
 * This will be wired to ProctorService later
 */
export type ProctorResponseCallback = (userMessage: string) => Promise<string>;

/**
 * Options for the useChat hook
 */
export interface UseChatOptions {
  /**
   * Callback function to get proctor responses
   * If not provided, only user messages will be added (no proctor response)
   */
  onGetProctorResponse?: ProctorResponseCallback;
}

/**
 * useChat - Chat state management hook
 * 
 * Manages the chat conversation between user and proctor:
 * - Maintains message history
 * - Handles sending messages and receiving proctor responses
 * - Tracks loading state while waiting for proctor
 * - Provides ability to clear all messages
 * 
 * Requirements:
 * - 6.2: WHEN a user submits a message, THE Chat_Panel SHALL send it to the Proctor 
 *        and display it in the history
 * 
 * @param options - Configuration options including proctor response callback
 * @returns UseChatReturn - Chat state and control functions
 */
export function useChat(options: UseChatOptions = {}): UseChatReturn {
  const { onGetProctorResponse } = options;

  // Message history state
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  
  // Loading state - true while waiting for proctor response
  const [isLoading, setIsLoading] = useState<boolean>(false);

  /**
   * Send a message from the user
   * 
   * This function:
   * 1. Creates a user message with unique ID and timestamp
   * 2. Adds it to the message history immediately
   * 3. If a proctor callback is provided, calls it and adds the response
   * 
   * Requirement 6.2: Send message to Proctor and display in history
   * 
   * @param content - The message content from the user
   */
  const sendMessage = useCallback(async (content: string): Promise<void> => {
    // Don't send empty messages
    if (!content.trim()) {
      return;
    }

    // Create user message
    const userMessage: ChatMessage = {
      id: generateMessageId(),
      role: 'user',
      content: content.trim(),
      timestamp: Date.now(),
    };

    // Add user message to history immediately (Requirement 6.2)
    setMessages((prevMessages) => [...prevMessages, userMessage]);

    // If we have a proctor callback, get the response
    if (onGetProctorResponse) {
      setIsLoading(true);

      try {
        // Get proctor response
        const proctorContent = await onGetProctorResponse(content.trim());

        // Create proctor message
        const proctorMessage: ChatMessage = {
          id: generateMessageId(),
          role: 'proctor',
          content: proctorContent,
          timestamp: Date.now(),
        };

        // Add proctor message to history
        setMessages((prevMessages) => [...prevMessages, proctorMessage]);
      } catch (error) {
        // Log error but don't throw - the user message is already in history
        console.error('Error getting proctor response:', error);
        
        // Optionally add an error message from the proctor
        const errorMessage: ChatMessage = {
          id: generateMessageId(),
          role: 'proctor',
          content: 'I apologize, but I encountered an error processing your message. Please try again.',
          timestamp: Date.now(),
        };

        setMessages((prevMessages) => [...prevMessages, errorMessage]);
      } finally {
        setIsLoading(false);
      }
    }
  }, [onGetProctorResponse]);

  /**
   * Clear all messages from the chat history
   * Useful when starting a new session or resetting the chat
   */
  const clearMessages = useCallback((): void => {
    setMessages([]);
    setIsLoading(false);
  }, []);

  /**
   * Add a message directly to the chat history
   * Generates ID and timestamp automatically
   * 
   * @param message - Message without id and timestamp
   */
  const addMessage = useCallback((message: Omit<ChatMessage, 'id' | 'timestamp'>): void => {
    const newMessage: ChatMessage = {
      ...message,
      id: generateMessageId(),
      timestamp: Date.now(),
    };
    
    setMessages((prevMessages) => [...prevMessages, newMessage]);
  }, []);

  return {
    messages,
    sendMessage,
    isLoading,
    clearMessages,
    addMessage,
  };
}

export default useChat;
