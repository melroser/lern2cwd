import React from 'react';

/**
 * Header component props (extended to include settings button)
 */
export interface HeaderProps {
  problemTitle: string;
  timeRemaining: number; // seconds
  isSessionActive: boolean;
  onSettingsClick?: () => void;
  hasApiKey?: boolean;
}

/**
 * Header component - Displays problem title and countdown timer
 * 
 * Requirements: 2.2 - THE System SHALL display the timer and problem title at the top of the screen
 */

/**
 * Formats time in seconds to MM:SS format
 */
function formatTime(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
}

/**
 * Determines the timer color based on remaining time
 * - Red when <= 1 minute (critical)
 * - Orange when <= 5 minutes (warning)
 * - Default color otherwise
 */
function getTimerColor(timeRemaining: number): string {
  if (timeRemaining <= 60) {
    return '#dc3545'; // Red - critical
  }
  if (timeRemaining <= 300) {
    return '#fd7e14'; // Orange - warning
  }
  return '#28a745'; // Green - normal
}

const styles: Record<string, React.CSSProperties> = {
  header: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '16px 24px',
    backgroundColor: '#1a1a2e',
    borderBottom: '1px solid #333',
    color: '#fff',
  },
  titleSection: {
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
  },
  title: {
    margin: 0,
    fontSize: '1.25rem',
    fontWeight: 600,
    color: '#fff',
  },
  statusBadge: {
    padding: '4px 8px',
    borderRadius: '4px',
    fontSize: '0.75rem',
    fontWeight: 500,
    textTransform: 'uppercase' as const,
  },
  activeBadge: {
    backgroundColor: '#28a745',
    color: '#fff',
  },
  inactiveBadge: {
    backgroundColor: '#6c757d',
    color: '#fff',
  },
  rightSection: {
    display: 'flex',
    alignItems: 'center',
    gap: '16px',
  },
  timerSection: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
  },
  timerLabel: {
    fontSize: '0.875rem',
    color: '#adb5bd',
  },
  timer: {
    fontFamily: 'monospace',
    fontSize: '1.5rem',
    fontWeight: 700,
    padding: '8px 16px',
    borderRadius: '8px',
    backgroundColor: '#2d2d44',
    minWidth: '100px',
    textAlign: 'center' as const,
  },
  timerCritical: {
    animation: 'pulse 1s ease-in-out infinite',
  },
  settingsButton: {
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
    padding: '8px 16px',
    fontSize: '0.875rem',
    fontWeight: 500,
    color: '#cdd6f4',
    backgroundColor: '#313244',
    border: '1px solid #45475a',
    borderRadius: '8px',
    cursor: 'pointer',
    transition: 'all 0.2s ease',
  },
  settingsButtonWarning: {
    borderColor: '#f9e2af',
    color: '#f9e2af',
  },
  settingsIcon: {
    fontSize: '1rem',
  },
};

export const Header: React.FC<HeaderProps> = ({
  problemTitle,
  timeRemaining,
  isSessionActive,
  onSettingsClick,
  hasApiKey = true,
}) => {
  const timerColor = getTimerColor(timeRemaining);
  const isCritical = timeRemaining <= 60 && isSessionActive;

  return (
    <header style={styles.header} data-testid="header">
      <div style={styles.titleSection}>
        <h1 style={styles.title} data-testid="problem-title">
          {problemTitle || 'Coding Interview Simulator'}
        </h1>
        <span
          style={{
            ...styles.statusBadge,
            ...(isSessionActive ? styles.activeBadge : styles.inactiveBadge),
          }}
          data-testid="session-status"
        >
          {isSessionActive ? 'In Progress' : 'Not Started'}
        </span>
      </div>

      <div style={styles.rightSection}>
        <div style={styles.timerSection}>
          <span style={styles.timerLabel}>Time Remaining:</span>
          <div
            style={{
              ...styles.timer,
              color: timerColor,
              ...(isCritical ? styles.timerCritical : {}),
            }}
            data-testid="timer"
            aria-label={`Time remaining: ${formatTime(timeRemaining)}`}
          >
            {formatTime(timeRemaining)}
          </div>
        </div>

        {onSettingsClick && (
          <button
            style={{
              ...styles.settingsButton,
              ...(!hasApiKey ? styles.settingsButtonWarning : {}),
            }}
            onClick={onSettingsClick}
            data-testid="settings-button"
            aria-label="Open settings"
          >
            <span style={styles.settingsIcon}>⚙️</span>
            <span>Settings</span>
            {!hasApiKey && <span>⚠️</span>}
          </button>
        )}
      </div>

      {/* CSS for pulse animation */}
      <style>
        {`
          @keyframes pulse {
            0%, 100% { opacity: 1; }
            50% { opacity: 0.6; }
          }
        `}
      </style>
    </header>
  );
};

export default Header;

// Export utility functions for testing
export { formatTime, getTimerColor };
