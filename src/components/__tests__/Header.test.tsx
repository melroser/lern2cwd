import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Header, formatTime, getTimerColor } from '../Header';

/**
 * Unit tests for Header component
 * 
 * Requirements: 2.2 - THE System SHALL display the timer and problem title at the top of the screen
 */

describe('Header Component', () => {
  describe('formatTime utility', () => {
    it('formats 0 seconds as 00:00', () => {
      expect(formatTime(0)).toBe('00:00');
    });

    it('formats seconds less than a minute correctly', () => {
      expect(formatTime(45)).toBe('00:45');
    });

    it('formats exactly one minute as 01:00', () => {
      expect(formatTime(60)).toBe('01:00');
    });

    it('formats minutes and seconds correctly', () => {
      expect(formatTime(125)).toBe('02:05');
    });

    it('formats 30 minutes correctly', () => {
      expect(formatTime(1800)).toBe('30:00');
    });

    it('pads single digit minutes and seconds', () => {
      expect(formatTime(65)).toBe('01:05');
    });

    it('handles large time values', () => {
      expect(formatTime(3661)).toBe('61:01');
    });
  });

  describe('getTimerColor utility', () => {
    it('returns red for time <= 60 seconds (critical)', () => {
      expect(getTimerColor(60)).toBe('#dc3545');
      expect(getTimerColor(30)).toBe('#dc3545');
      expect(getTimerColor(0)).toBe('#dc3545');
    });

    it('returns orange for time <= 300 seconds (warning)', () => {
      expect(getTimerColor(300)).toBe('#fd7e14');
      expect(getTimerColor(180)).toBe('#fd7e14');
      expect(getTimerColor(61)).toBe('#fd7e14');
    });

    it('returns green for time > 300 seconds (normal)', () => {
      expect(getTimerColor(301)).toBe('#28a745');
      expect(getTimerColor(600)).toBe('#28a745');
      expect(getTimerColor(1800)).toBe('#28a745');
    });
  });

  describe('rendering', () => {
    it('renders the header element', () => {
      render(
        <Header
          problemTitle="Two Sum"
          timeRemaining={1800}
          isSessionActive={true}
        />
      );
      
      expect(screen.getByTestId('header')).toBeInTheDocument();
    });

    it('displays the problem title', () => {
      render(
        <Header
          problemTitle="Two Sum"
          timeRemaining={1800}
          isSessionActive={true}
        />
      );
      
      expect(screen.getByTestId('problem-title')).toHaveTextContent('Two Sum');
    });

    it('displays default title when problemTitle is empty', () => {
      render(
        <Header
          problemTitle=""
          timeRemaining={1800}
          isSessionActive={false}
        />
      );
      
      expect(screen.getByTestId('problem-title')).toHaveTextContent('Coding Interview Simulator');
    });

    it('displays the timer in MM:SS format', () => {
      render(
        <Header
          problemTitle="FizzBuzz"
          timeRemaining={1800}
          isSessionActive={true}
        />
      );
      
      expect(screen.getByTestId('timer')).toHaveTextContent('30:00');
    });

    it('displays timer with correct format for various times', () => {
      const { rerender } = render(
        <Header
          problemTitle="Test"
          timeRemaining={125}
          isSessionActive={true}
        />
      );
      
      expect(screen.getByTestId('timer')).toHaveTextContent('02:05');

      rerender(
        <Header
          problemTitle="Test"
          timeRemaining={0}
          isSessionActive={true}
        />
      );
      
      expect(screen.getByTestId('timer')).toHaveTextContent('00:00');
    });
  });

  describe('session status', () => {
    it('shows "In Progress" when session is active', () => {
      render(
        <Header
          problemTitle="Two Sum"
          timeRemaining={1800}
          isSessionActive={true}
        />
      );
      
      expect(screen.getByTestId('session-status')).toHaveTextContent('In Progress');
    });

    it('shows "Not Started" when session is not active', () => {
      render(
        <Header
          problemTitle="Two Sum"
          timeRemaining={1800}
          isSessionActive={false}
        />
      );
      
      expect(screen.getByTestId('session-status')).toHaveTextContent('Not Started');
    });
  });

  describe('timer visual states', () => {
    it('has green color when time > 5 minutes', () => {
      render(
        <Header
          problemTitle="Test"
          timeRemaining={600}
          isSessionActive={true}
        />
      );
      
      const timer = screen.getByTestId('timer');
      expect(timer).toHaveStyle({ color: '#28a745' });
    });

    it('has orange color when time <= 5 minutes', () => {
      render(
        <Header
          problemTitle="Test"
          timeRemaining={300}
          isSessionActive={true}
        />
      );
      
      const timer = screen.getByTestId('timer');
      expect(timer).toHaveStyle({ color: '#fd7e14' });
    });

    it('has red color when time <= 1 minute', () => {
      render(
        <Header
          problemTitle="Test"
          timeRemaining={60}
          isSessionActive={true}
        />
      );
      
      const timer = screen.getByTestId('timer');
      expect(timer).toHaveStyle({ color: '#dc3545' });
    });
  });

  describe('accessibility', () => {
    it('has aria-label on timer for screen readers', () => {
      render(
        <Header
          problemTitle="Test"
          timeRemaining={125}
          isSessionActive={true}
        />
      );
      
      const timer = screen.getByTestId('timer');
      expect(timer).toHaveAttribute('aria-label', 'Time remaining: 02:05');
    });
  });
});


describe('Settings Button', () => {
  it('does not render settings button when onSettingsClick is not provided', () => {
    render(
      <Header
        problemTitle="Test"
        timeRemaining={1800}
        isSessionActive={true}
      />
    );
    
    expect(screen.queryByTestId('settings-button')).not.toBeInTheDocument();
  });

  it('renders settings button when onSettingsClick is provided', () => {
    const mockOnSettingsClick = vi.fn();
    render(
      <Header
        problemTitle="Test"
        timeRemaining={1800}
        isSessionActive={true}
        onSettingsClick={mockOnSettingsClick}
      />
    );
    
    expect(screen.getByTestId('settings-button')).toBeInTheDocument();
  });

  it('calls onSettingsClick when settings button is clicked', async () => {
    const mockOnSettingsClick = vi.fn();
    const user = userEvent.setup();
    
    render(
      <Header
        problemTitle="Test"
        timeRemaining={1800}
        isSessionActive={true}
        onSettingsClick={mockOnSettingsClick}
      />
    );
    
    await user.click(screen.getByTestId('settings-button'));
    expect(mockOnSettingsClick).toHaveBeenCalled();
  });

  it('shows warning indicator when hasApiKey is false', () => {
    const mockOnSettingsClick = vi.fn();
    render(
      <Header
        problemTitle="Test"
        timeRemaining={1800}
        isSessionActive={true}
        onSettingsClick={mockOnSettingsClick}
        hasApiKey={false}
      />
    );
    
    const button = screen.getByTestId('settings-button');
    expect(button).toHaveTextContent('⚠️');
  });

  it('does not show warning indicator when hasApiKey is true', () => {
    const mockOnSettingsClick = vi.fn();
    render(
      <Header
        problemTitle="Test"
        timeRemaining={1800}
        isSessionActive={true}
        onSettingsClick={mockOnSettingsClick}
        hasApiKey={true}
      />
    );
    
    const button = screen.getByTestId('settings-button');
    // Should have Settings text but not the warning emoji
    expect(button).toHaveTextContent('Settings');
    // The button should not contain the warning emoji when hasApiKey is true
    expect(button.textContent).not.toContain('⚠️');
  });

  it('has aria-label for accessibility', () => {
    const mockOnSettingsClick = vi.fn();
    render(
      <Header
        problemTitle="Test"
        timeRemaining={1800}
        isSessionActive={true}
        onSettingsClick={mockOnSettingsClick}
      />
    );
    
    const button = screen.getByTestId('settings-button');
    expect(button).toHaveAttribute('aria-label', 'Open settings');
  });
});
