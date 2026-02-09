import { useState, useEffect, useCallback } from 'react';
import { Header } from './components/Header';
import { CodeEditorPanel } from './components/CodeEditorPanel';
import { ChatPanel } from './components/ChatPanel';
import { ReviewPanel } from './components/ReviewPanel';
import { HistoryPanel } from './components/HistoryPanel';
import { SettingsModal } from './components/SettingsModal';
import { useSession } from './hooks/useSession';
import { useTimer } from './hooks/useTimer';
import { useChat } from './hooks/useChat';
import { problemService } from './services/problemService';
import { proctorService } from './services/proctorService';
import { storageService } from './services/storageService';
import type { Problem, EvaluationResult, SessionRecord } from './types';
import './App.css';

type ViewState = 'home' | 'session' | 'review' | 'history';

interface ConfirmDialogState {
  isOpen: boolean;
  timeRemaining: number;
}

function App() {
  // View state management
  const [currentView, setCurrentView] = useState<ViewState>('home');
  const [showSettings, setShowSettings] = useState(false);
  
  // Session state
  const [currentProblem, setCurrentProblem] = useState<Problem | null>(null);
  const [currentEvaluation, setCurrentEvaluation] = useState<EvaluationResult | null>(null);
  
  // Confirmation dialog state
  const [confirmDialog, setConfirmDialog] = useState<ConfirmDialogState>({
    isOpen: false,
    timeRemaining: 0,
  });
  
  // Hooks
  const sessionHook = useSession();
  const timer = useTimer();
  const chat = useChat();
  
  // Auto-save session state every 30 seconds
  useEffect(() => {
    if (sessionHook.session?.status === 'active' && sessionHook.session.id) {
      const interval = setInterval(() => {
        // Auto-save session draft to localStorage
        const sessionDraft = {
          sessionId: sessionHook.session!.id,
          problemId: currentProblem?.id,
          code: sessionHook.session!.code,
          chatHistory: chat.messages,
          timestamp: Date.now(),
        };
        localStorage.setItem(`session-draft-${sessionHook.session!.id}`, JSON.stringify(sessionDraft));
      }, 30000);
      
      return () => clearInterval(interval);
    }
  }, [sessionHook.session?.status, sessionHook.session?.id, sessionHook.session?.code, chat.messages, currentProblem?.id]);
  
  // Handle timer expiry
  const handleTimerExpiry = useCallback(() => {
    if (sessionHook.session?.status === 'active') {
      handleSubmitForEvaluation(true); // true = timer expired, skip confirmation
    }
  }, [sessionHook.session?.status]);
  
  const timerWithExpiry = useTimer(handleTimerExpiry);
  
  // Load problems on mount
  useEffect(() => {
    problemService.loadProblems().catch(console.error);
  }, []);
  
  // Start a new session
  const handleStartSession = useCallback(async () => {
    try {
      // Get a random problem
      const problem = problemService.getRandomProblem();
      if (!problem) {
        console.error('No problems available');
        return;
      }
      
      setCurrentProblem(problem);
      
      // Start session
      sessionHook.startSession(problem);
      
      // Start timer with problem's time limit
      timerWithExpiry.start(problem.timeLimit * 60); // Convert minutes to seconds
      
      // Generate proctor intro
      const intro = await proctorService.generateIntro(problem);
      sessionHook.addChatMessage({ role: 'proctor', content: intro });
      
      // Navigate to session view
      setCurrentView('session');
    } catch (error) {
      console.error('Failed to start session:', error);
    }
  }, [sessionHook, timerWithExpiry]);
  
  // Handle submit button click
  const handleSubmitClick = useCallback(() => {
    const timeRemaining = timerWithExpiry.timeRemaining;
    
    // If more than 5 minutes remaining, show confirmation dialog
    if (timeRemaining > 300) { // 5 minutes = 300 seconds
      setConfirmDialog({
        isOpen: true,
        timeRemaining,
      });
    } else {
      // Submit immediately
      handleSubmitForEvaluation(false);
    }
  }, [timerWithExpiry.timeRemaining]);
  
  // Handle actual submission for evaluation
  const handleSubmitForEvaluation = useCallback(async (skipConfirmation: boolean = false) => {
    if (!currentProblem || sessionHook.session?.status !== 'active') return;
    
    try {
      // Close confirmation dialog if open
      setConfirmDialog({ isOpen: false, timeRemaining: 0 });
      
      // Stop timer
      timerWithExpiry.pause();
      
      // Set session to evaluating state
      await sessionHook.submitForEvaluation();
      
      // Cancel any pending proctor requests
      proctorService.cancelPendingRequest();
      
      // Get evaluation
      const evaluation = await proctorService.evaluate(
        sessionHook.session!.code,
        currentProblem,
        chat.messages
      );
      
      setCurrentEvaluation(evaluation);
      
      // Calculate session duration
      const duration = (currentProblem.timeLimit * 60) - timerWithExpiry.timeRemaining;
      
      // Save session to storage
      const sessionRecord: SessionRecord = {
        id: sessionHook.session!.id,
        problemId: currentProblem.id,
        problemTitle: currentProblem.title,
        timestamp: Date.now(),
        duration,
        finalCode: sessionHook.session!.code,
        chatTranscript: chat.messages,
        evaluation,
      };
      
      storageService.saveSession(sessionRecord);
      
      // Complete session
      sessionHook.endSession();
      
      // Navigate to review
      setCurrentView('review');
    } catch (error) {
      console.error('Evaluation failed:', error);
      // Reset session state on error
      timerWithExpiry.reset();
      setCurrentView('home');
    }
  }, [currentProblem, sessionHook, timerWithExpiry, chat.messages]);
  
  // Handle chat message send
  const handleSendMessage = useCallback(async (message: string) => {
    if (!currentProblem || sessionHook.session?.status !== 'active') return;
    
    try {
      // Get proctor response
      const context = {
        problem: currentProblem,
        currentCode: sessionHook.session!.code,
        chatHistory: chat.messages,
        timeRemaining: timerWithExpiry.timeRemaining,
      };
      
      const response = await proctorService.respondToQuestion(message, context);
      
      // Add both user message and proctor response
      sessionHook.addChatMessage({ role: 'user', content: message });
      sessionHook.addChatMessage({ role: 'proctor', content: response });
    } catch (error) {
      console.error('Failed to get proctor response:', error);
      sessionHook.addChatMessage({ role: 'user', content: message });
      sessionHook.addChatMessage({ role: 'proctor', content: 'Sorry, I encountered an error. Please try asking your question again.' });
    }
  }, [currentProblem, sessionHook, chat.messages, timerWithExpiry.timeRemaining]);
  
  // Handle next problem
  const handleNextProblem = useCallback(() => {
    // Reset all state
    timerWithExpiry.reset();
    chat.clearMessages();
    setCurrentProblem(null);
    setCurrentEvaluation(null);
    
    // Start new session
    handleStartSession();
  }, [timerWithExpiry, chat, handleStartSession]);
  
  // Handle view history
  const handleViewHistory = useCallback(() => {
    setCurrentView('history');
  }, []);
  
  // Handle back to home
  const handleBackToHome = useCallback(() => {
    setCurrentView('home');
  }, []);
  
  // Handle session selection from history
  const handleSelectSession = useCallback((sessionId: string) => {
    const sessionRecord = storageService.getSession(sessionId);
    if (sessionRecord) {
      setCurrentEvaluation(sessionRecord.evaluation);
      setCurrentView('review');
    }
  }, []);
  
  // Get stored sessions for history
  const storedSessions = storageService.getSessions();
  
  // Format time remaining for confirmation dialog
  const formatTimeRemaining = (seconds: number): string => {
    const minutes = Math.floor(seconds / 60);
    return minutes === 1 ? '1 minute' : `${minutes} minutes`;
  };
  
  return (
    <div className="app">
      {/* Settings Modal */}
      {showSettings && (
        <SettingsModal
          isOpen={showSettings}
          onClose={() => setShowSettings(false)}
          onSave={(apiKey: string) => {
            // Handle API key save
            console.log('API key saved:', apiKey);
            setShowSettings(false);
          }}
        />
      )}
      
      {/* Confirmation Dialog */}
      {confirmDialog.isOpen && (
        <div className="modal-overlay" data-testid="confirm-dialog">
          <div className="modal-content">
            <h3>Submit Solution?</h3>
            <p>
              You have {formatTimeRemaining(confirmDialog.timeRemaining)} left. 
              Are you sure you want to submit now?
            </p>
            <div className="modal-actions">
              <button
                data-testid="dialog-cancel-button"
                onClick={() => setConfirmDialog({ isOpen: false, timeRemaining: 0 })}
              >
                Cancel
              </button>
              <button
                data-testid="dialog-confirm-button"
                onClick={() => handleSubmitForEvaluation(false)}
              >
                Submit
              </button>
            </div>
          </div>
        </div>
      )}
      
      {/* Home View */}
      {currentView === 'home' && (
        <div className="home-view" data-testid="home-view">
          <div className="home-content">
            <h1>Coding Interview Simulator</h1>
            <p>Practice coding interviews with AI-powered feedback</p>
            
            <div className="home-actions">
              <button
                data-testid="start-session-button"
                className="primary-button"
                onClick={handleStartSession}
              >
                Start Session
              </button>
              
              {storedSessions.length > 0 && (
                <button
                  data-testid="view-history-button"
                  className="secondary-button"
                  onClick={handleViewHistory}
                >
                  View History ({storedSessions.length} sessions)
                </button>
              )}
              
              <button
                className="secondary-button"
                onClick={() => setShowSettings(true)}
              >
                Settings
              </button>
            </div>
          </div>
        </div>
      )}
      
      {/* Session View */}
      {currentView === 'session' && currentProblem && (
        <div className="session-view" data-testid="session-view">
          <Header
            data-testid="header"
            problemTitle={currentProblem.title}
            timeRemaining={timerWithExpiry.timeRemaining}
            isSessionActive={sessionHook.session?.status === 'active'}
            onSettingsClick={() => setShowSettings(true)}
          />
          
          <div className="session-content">
            <div className="editor-section">
              <CodeEditorPanel
                data-testid="code-editor-panel"
                problem={currentProblem}
                code={session.code}
                onCodeChange={session.updateCode}
                onSubmit={handleSubmitClick}
                isSubmitDisabled={chat.isLoading || session.state !== 'active'}
              />
            </div>
            
            <div className="chat-section">
              <ChatPanel
                data-testid="chat-panel"
                messages={chat.messages}
                onSendMessage={handleSendMessage}
                isLoading={chat.isLoading}
              />
            </div>
          </div>
        </div>
      )}
      
      {/* Review View */}
      {currentView === 'review' && currentEvaluation && (
        <div className="review-view" data-testid="review-view">
          <ReviewPanel
            data-testid="review-panel"
            evaluation={currentEvaluation}
            onNextProblem={handleNextProblem}
            onViewHistory={handleViewHistory}
          />
        </div>
      )}
      
      {/* History View */}
      {currentView === 'history' && (
        <div className="history-view" data-testid="history-view">
          <HistoryPanel
            data-testid="history-panel"
            sessions={storedSessions}
            onSelectSession={handleSelectSession}
            onBackToHome={handleBackToHome}
          />
        </div>
      )}
    </div>
  );
}

export default App;