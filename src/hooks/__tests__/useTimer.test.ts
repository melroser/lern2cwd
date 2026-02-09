import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useTimer } from '../useTimer';

describe('useTimer', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('initial state', () => {
    it('should initialize with timeRemaining as 0', () => {
      const { result } = renderHook(() => useTimer());
      expect(result.current.timeRemaining).toBe(0);
    });

    it('should initialize with isRunning as false', () => {
      const { result } = renderHook(() => useTimer());
      expect(result.current.isRunning).toBe(false);
    });
  });

  describe('start', () => {
    it('should set timeRemaining to the provided duration', () => {
      const { result } = renderHook(() => useTimer());
      
      act(() => {
        result.current.start(60);
      });

      expect(result.current.timeRemaining).toBe(60);
    });

    it('should set isRunning to true', () => {
      const { result } = renderHook(() => useTimer());
      
      act(() => {
        result.current.start(60);
      });

      expect(result.current.isRunning).toBe(true);
    });

    it('should handle zero duration', () => {
      const { result } = renderHook(() => useTimer());
      
      act(() => {
        result.current.start(0);
      });

      expect(result.current.timeRemaining).toBe(0);
      expect(result.current.isRunning).toBe(false);
    });

    it('should handle negative duration', () => {
      const { result } = renderHook(() => useTimer());
      
      act(() => {
        result.current.start(-10);
      });

      expect(result.current.timeRemaining).toBe(0);
      expect(result.current.isRunning).toBe(false);
    });

    it('should restart timer if called while running', () => {
      const { result } = renderHook(() => useTimer());
      
      act(() => {
        result.current.start(60);
      });

      // Advance time
      act(() => {
        vi.advanceTimersByTime(10000);
      });

      // Restart with new duration
      act(() => {
        result.current.start(120);
      });

      expect(result.current.timeRemaining).toBe(120);
      expect(result.current.isRunning).toBe(true);
    });
  });

  describe('countdown', () => {
    it('should decrement timeRemaining over time', async () => {
      const { result } = renderHook(() => useTimer());
      
      act(() => {
        result.current.start(10);
      });

      expect(result.current.timeRemaining).toBe(10);

      // Advance by 1 second
      act(() => {
        vi.advanceTimersByTime(1000);
      });

      expect(result.current.timeRemaining).toBe(9);

      // Advance by another 2 seconds
      act(() => {
        vi.advanceTimersByTime(2000);
      });

      expect(result.current.timeRemaining).toBe(7);
    });

    it('should not go below zero', () => {
      const { result } = renderHook(() => useTimer());
      
      act(() => {
        result.current.start(3);
      });

      // Advance past the timer duration
      act(() => {
        vi.advanceTimersByTime(5000);
      });

      expect(result.current.timeRemaining).toBe(0);
    });
  });

  describe('pause', () => {
    it('should stop the countdown', () => {
      const { result } = renderHook(() => useTimer());
      
      act(() => {
        result.current.start(60);
      });

      act(() => {
        vi.advanceTimersByTime(5000);
      });

      const timeBeforePause = result.current.timeRemaining;

      act(() => {
        result.current.pause();
      });

      // Advance time while paused
      act(() => {
        vi.advanceTimersByTime(10000);
      });

      expect(result.current.timeRemaining).toBe(timeBeforePause);
    });

    it('should set isRunning to false', () => {
      const { result } = renderHook(() => useTimer());
      
      act(() => {
        result.current.start(60);
      });

      act(() => {
        result.current.pause();
      });

      expect(result.current.isRunning).toBe(false);
    });

    it('should do nothing if timer is not running', () => {
      const { result } = renderHook(() => useTimer());
      
      act(() => {
        result.current.pause();
      });

      expect(result.current.timeRemaining).toBe(0);
      expect(result.current.isRunning).toBe(false);
    });
  });

  describe('reset', () => {
    it('should reset timeRemaining to 0', () => {
      const { result } = renderHook(() => useTimer());
      
      act(() => {
        result.current.start(60);
      });

      act(() => {
        vi.advanceTimersByTime(5000);
      });

      act(() => {
        result.current.reset();
      });

      expect(result.current.timeRemaining).toBe(0);
    });

    it('should set isRunning to false', () => {
      const { result } = renderHook(() => useTimer());
      
      act(() => {
        result.current.start(60);
      });

      act(() => {
        result.current.reset();
      });

      expect(result.current.isRunning).toBe(false);
    });

    it('should stop the countdown', () => {
      const { result } = renderHook(() => useTimer());
      
      act(() => {
        result.current.start(60);
      });

      act(() => {
        result.current.reset();
      });

      // Advance time after reset
      act(() => {
        vi.advanceTimersByTime(10000);
      });

      expect(result.current.timeRemaining).toBe(0);
    });
  });

  describe('onExpire callback', () => {
    it('should fire callback when timer reaches zero', () => {
      const onExpire = vi.fn();
      const { result } = renderHook(() => useTimer(onExpire));
      
      act(() => {
        result.current.start(3);
      });

      expect(onExpire).not.toHaveBeenCalled();

      // Advance to expiry
      act(() => {
        vi.advanceTimersByTime(3100);
      });

      expect(onExpire).toHaveBeenCalledTimes(1);
    });

    it('should set isRunning to false when timer expires', () => {
      const onExpire = vi.fn();
      const { result } = renderHook(() => useTimer(onExpire));
      
      act(() => {
        result.current.start(2);
      });

      act(() => {
        vi.advanceTimersByTime(2100);
      });

      expect(result.current.isRunning).toBe(false);
    });

    it('should only fire callback once', () => {
      const onExpire = vi.fn();
      const { result } = renderHook(() => useTimer(onExpire));
      
      act(() => {
        result.current.start(2);
      });

      // Advance well past expiry
      act(() => {
        vi.advanceTimersByTime(5000);
      });

      expect(onExpire).toHaveBeenCalledTimes(1);
    });

    it('should not fire callback if timer is reset before expiry', () => {
      const onExpire = vi.fn();
      const { result } = renderHook(() => useTimer(onExpire));
      
      act(() => {
        result.current.start(10);
      });

      act(() => {
        vi.advanceTimersByTime(5000);
      });

      act(() => {
        result.current.reset();
      });

      // Advance past original expiry time
      act(() => {
        vi.advanceTimersByTime(10000);
      });

      expect(onExpire).not.toHaveBeenCalled();
    });

    it('should not fire callback if timer is paused before expiry', () => {
      const onExpire = vi.fn();
      const { result } = renderHook(() => useTimer(onExpire));
      
      act(() => {
        result.current.start(5);
      });

      act(() => {
        vi.advanceTimersByTime(2000);
      });

      act(() => {
        result.current.pause();
      });

      // Advance past original expiry time
      act(() => {
        vi.advanceTimersByTime(10000);
      });

      expect(onExpire).not.toHaveBeenCalled();
    });
  });

  describe('timer accuracy', () => {
    it('should maintain accuracy over longer periods', () => {
      const { result } = renderHook(() => useTimer());
      
      act(() => {
        result.current.start(300); // 5 minutes
      });

      // Advance by 2 minutes
      act(() => {
        vi.advanceTimersByTime(120000);
      });

      expect(result.current.timeRemaining).toBe(180);
    });

    it('should handle rapid start/pause cycles', () => {
      const { result } = renderHook(() => useTimer());
      
      act(() => {
        result.current.start(60);
      });

      // Rapid pause/start cycles
      for (let i = 0; i < 5; i++) {
        act(() => {
          vi.advanceTimersByTime(1000);
        });
        act(() => {
          result.current.pause();
        });
        act(() => {
          result.current.start(result.current.timeRemaining);
        });
      }

      // Should have lost about 5 seconds
      expect(result.current.timeRemaining).toBeLessThanOrEqual(55);
      expect(result.current.timeRemaining).toBeGreaterThanOrEqual(54);
    });
  });

  describe('cleanup', () => {
    it('should clean up interval on unmount', () => {
      const clearIntervalSpy = vi.spyOn(globalThis, 'clearInterval');
      const { result, unmount } = renderHook(() => useTimer());
      
      act(() => {
        result.current.start(60);
      });

      unmount();

      expect(clearIntervalSpy).toHaveBeenCalled();
      clearIntervalSpy.mockRestore();
    });
  });

  describe('Requirements validation', () => {
    it('Requirement 1.1: should initialize timer with problem timeLimit in seconds', () => {
      // Simulating a problem with 30 minute timeLimit
      const timeLimitMinutes = 30;
      const timeLimitSeconds = timeLimitMinutes * 60;
      
      const { result } = renderHook(() => useTimer());
      
      act(() => {
        result.current.start(timeLimitSeconds);
      });

      expect(result.current.timeRemaining).toBe(1800);
      expect(result.current.isRunning).toBe(true);
    });

    it('Requirement 1.2: should display remaining time continuously', () => {
      const { result } = renderHook(() => useTimer());
      
      act(() => {
        result.current.start(10);
      });

      // Verify continuous updates
      for (let i = 10; i > 0; i--) {
        expect(result.current.timeRemaining).toBe(i);
        act(() => {
          vi.advanceTimersByTime(1000);
        });
      }

      expect(result.current.timeRemaining).toBe(0);
    });

    it('Requirement 1.3: should trigger evaluation callback when timer expires', () => {
      const triggerEvaluation = vi.fn();
      const { result } = renderHook(() => useTimer(triggerEvaluation));
      
      act(() => {
        result.current.start(5);
      });

      // Advance to expiry
      act(() => {
        vi.advanceTimersByTime(5100);
      });

      expect(triggerEvaluation).toHaveBeenCalledTimes(1);
      expect(result.current.timeRemaining).toBe(0);
      expect(result.current.isRunning).toBe(false);
    });
  });
});
