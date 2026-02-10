import { useState, useEffect, useRef } from 'react';

export interface UseTypewriterOptions {
  text: string;
  speed?: number; // characters per second
  onComplete?: () => void;
  enabled?: boolean; // if false, show text immediately
}

export interface UseTypewriterReturn {
  displayText: string;
  isComplete: boolean;
  reset: () => void;
}

/**
 * useTypewriter - Animated typewriter effect hook
 * 
 * Displays text character by character with configurable speed
 * 
 * @param options - Configuration options
 * @returns Typewriter state and controls
 */
export function useTypewriter({
  text,
  speed = 50, // 50 chars per second by default
  onComplete,
  enabled = true,
}: UseTypewriterOptions): UseTypewriterReturn {
  const [displayText, setDisplayText] = useState(enabled ? '' : text);
  const [isComplete, setIsComplete] = useState(!enabled);
  const indexRef = useRef(0);
  const onCompleteRef = useRef(onComplete);

  // Keep onComplete ref up to date
  useEffect(() => {
    onCompleteRef.current = onComplete;
  }, [onComplete]);

  // Reset when text changes
  useEffect(() => {
    if (!enabled) {
      setDisplayText(text);
      setIsComplete(true);
      return;
    }

    indexRef.current = 0;
    setDisplayText('');
    setIsComplete(false);
  }, [text, enabled]);

  // Typewriter animation
  useEffect(() => {
    if (!enabled || isComplete) return;

    const interval = setInterval(() => {
      if (indexRef.current < text.length) {
        indexRef.current += 1;
        setDisplayText(text.slice(0, indexRef.current));
      } else {
        setIsComplete(true);
        clearInterval(interval);
        onCompleteRef.current?.();
      }
    }, 1000 / speed);

    return () => clearInterval(interval);
  }, [text, speed, enabled, isComplete]);

  const reset = () => {
    indexRef.current = 0;
    setDisplayText(enabled ? '' : text);
    setIsComplete(!enabled);
  };

  return {
    displayText,
    isComplete,
    reset,
  };
}
