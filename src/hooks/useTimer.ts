import { useState, useRef, useCallback, useEffect } from 'react';
import type { UseTimerReturn } from '../types';

/**
 * useTimer - Countdown timer management hook
 * 
 * Implements a countdown timer with start, pause, and reset functionality.
 * Handles browser tab visibility changes to prevent timer desync.
 * 
 * Requirements: 1.1, 1.2, 1.3
 * - 1.1: Initialize countdown timer using problem's timeLimit
 * - 1.2: Display remaining time continuously
 * - 1.3: Notify when timer expires and trigger evaluation
 * 
 * Error Handling (from design doc):
 * - Timer desync: Use performance.now() for elapsed time + Date.now() for wall clock
 * - Recalculate on visibilitychange event
 * 
 * @param onExpire - Optional callback fired when timer reaches zero
 * @returns UseTimerReturn - Timer state and control functions
 */
export function useTimer(onExpire?: () => void): UseTimerReturn {
  // Time remaining in seconds
  const [timeRemaining, setTimeRemaining] = useState<number>(0);
  // Whether the timer is currently running
  const [isRunning, setIsRunning] = useState<boolean>(false);

  // Refs for tracking time accurately across visibility changes
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const startTimeRef = useRef<number>(0); // Wall clock time when timer started/resumed
  const initialDurationRef = useRef<number>(0); // Initial duration in seconds
  const elapsedBeforePauseRef = useRef<number>(0); // Elapsed time before last pause
  const onExpireRef = useRef<(() => void) | undefined>(onExpire);
  const hasExpiredRef = useRef<boolean>(false); // Prevent multiple expiry callbacks

  // Keep onExpire ref updated
  useEffect(() => {
    onExpireRef.current = onExpire;
  }, [onExpire]);

  /**
   * Calculate remaining time based on wall clock
   * Uses Date.now() for wall clock accuracy across visibility changes
   */
  const calculateRemainingTime = useCallback((): number => {
    if (!isRunning) {
      return timeRemaining;
    }

    const now = Date.now();
    const elapsedSinceStart = (now - startTimeRef.current) / 1000;
    const totalElapsed = elapsedBeforePauseRef.current + elapsedSinceStart;
    const remaining = Math.max(0, initialDurationRef.current - totalElapsed);

    return Math.ceil(remaining);
  }, [isRunning, timeRemaining]);

  /**
   * Clear the interval timer
   */
  const clearTimer = useCallback(() => {
    if (intervalRef.current !== null) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
  }, []);

  /**
   * Start the countdown timer
   * @param durationSeconds - Duration in seconds to count down from
   */
  const start = useCallback((durationSeconds: number) => {
    // Clear any existing timer
    clearTimer();

    // Validate duration
    if (durationSeconds <= 0) {
      setTimeRemaining(0);
      setIsRunning(false);
      return;
    }

    // Initialize timer state
    initialDurationRef.current = durationSeconds;
    elapsedBeforePauseRef.current = 0;
    startTimeRef.current = Date.now();
    hasExpiredRef.current = false;

    setTimeRemaining(durationSeconds);
    setIsRunning(true);

    // Start interval to update display every second
    intervalRef.current = setInterval(() => {
      const now = Date.now();
      const elapsedSinceStart = (now - startTimeRef.current) / 1000;
      const totalElapsed = elapsedBeforePauseRef.current + elapsedSinceStart;
      const remaining = Math.max(0, initialDurationRef.current - totalElapsed);
      const remainingCeiled = Math.ceil(remaining);

      setTimeRemaining(remainingCeiled);

      // Check for expiry
      if (remaining <= 0 && !hasExpiredRef.current) {
        hasExpiredRef.current = true;
        clearTimer();
        setIsRunning(false);
        setTimeRemaining(0);
        
        // Fire expiry callback
        if (onExpireRef.current) {
          onExpireRef.current();
        }
      }
    }, 100); // Update more frequently for accuracy, but only update state when second changes
  }, [clearTimer]);

  /**
   * Pause the countdown timer
   */
  const pause = useCallback(() => {
    if (!isRunning) {
      return;
    }

    // Calculate elapsed time before pausing
    const now = Date.now();
    const elapsedSinceStart = (now - startTimeRef.current) / 1000;
    elapsedBeforePauseRef.current += elapsedSinceStart;

    clearTimer();
    setIsRunning(false);
  }, [isRunning, clearTimer]);

  /**
   * Reset the timer to initial state
   */
  const reset = useCallback(() => {
    clearTimer();
    setTimeRemaining(0);
    setIsRunning(false);
    initialDurationRef.current = 0;
    elapsedBeforePauseRef.current = 0;
    startTimeRef.current = 0;
    hasExpiredRef.current = false;
  }, [clearTimer]);

  /**
   * Handle visibility change to prevent timer desync
   * Recalculates remaining time when tab becomes visible again
   */
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible' && isRunning) {
        // Recalculate remaining time based on wall clock
        const remaining = calculateRemainingTime();
        setTimeRemaining(remaining);

        // Check if timer should have expired while hidden
        if (remaining <= 0 && !hasExpiredRef.current) {
          hasExpiredRef.current = true;
          clearTimer();
          setIsRunning(false);
          setTimeRemaining(0);
          
          if (onExpireRef.current) {
            onExpireRef.current();
          }
        }
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [isRunning, calculateRemainingTime, clearTimer]);

  /**
   * Cleanup on unmount
   */
  useEffect(() => {
    return () => {
      clearTimer();
    };
  }, [clearTimer]);

  return {
    timeRemaining,
    isRunning,
    start,
    pause,
    reset,
  };
}

export default useTimer;
