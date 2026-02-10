import { useState, useEffect, useCallback } from 'react';
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
import { getStoredApiKey, hasApiKey } from './utils/apiKeyStorage';
import { getEditorSettings } from './utils/editorSettings';
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
  const [apiKeyConfigured, setApiKeyConfigured] = useState(false);
  const [vimMode, setVimMode] = useState(false);
  
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
  const chat = useChat();
  
  // Check for API key on mount
  useEffect(() => {
    const keyExists = hasApiKey();
    setApiKeyConfigured(keyExists);
    if (!keyExists) {
      setShowSettings(true);
    }
    
    // Load vim mode setting
    const editorSettings = getEditorSettings();
    setVimMode(editorSettings.vimMode);
  }, []);
  
  // Auto-save session state every 30 seconds
  useEffect(() => {
    if (sessionHook.session?.status === 'active' && sessionHook.session?.id) {
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
  }, [sessionHook.session, chat.messages, currentProblem?.id]);
  
  // Load problems on mount
  useEffect(() => {
    problemService.loadProblems().catch(console.error);
  }, []);
  
  // Handle actual submission for evaluation
  const handleSubmitForEvaluation = useCallback(async () => {
    if (!currentProblem || sessionHook.session?.status !== 'active') return;
    
    // Capture timeRemaining immediately before any async operations
    const capturedTimeRemaining = timerWithExpiry.timeRemaining;
    
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
      
      // Calculate session duration using captured value
      const duration = (currentProblem.timeLimit * 60) - capturedTimeRemaining;
      
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentProblem, sessionHook, chat.messages]);
  
  // Handle timer expiry - triggers submission when time runs out
  const handleTimerExpiry = useCallback(() => {
    if (sessionHook.session?.status === 'active') {
      handleSubmitForEvaluation();
    }
  }, [sessionHook.session?.status, handleSubmitForEvaluation]);
  
  // Initialize timer with expiry callback
  const timerWithExpiry = useTimer(handleTimerExpiry);
  
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
      
      // Start session in waiting_to_start state
      sessionHook.startSession(problem);
      
      // DON'T start timer yet - wait for user to say ready
      
      // Generate proctor intro
      const intro = await proctorService.generateIntro(problem);
      chat.addMessage({ role: 'proctor', content: intro });
      
      // Navigate to session view
      setCurrentView('session');
    } catch (error) {
      console.error('Failed to start session:', error);
    }
  }, [sessionHook, chat]);
  
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
      handleSubmitForEvaluation();
    }
  }, [timerWithExpiry.timeRemaining, handleSubmitForEvaluation]);
  
  // Handle chat message send
  const handleSendMessage = useCallback(async (message: string) => {
    if (!currentProblem) return;
    
    // Check if user is ready to start (waiting_to_start state)
    if (sessionHook.session?.status === 'waiting_to_start') {
      const readyKeywords = ['ready', 'yes', 'start', 'go', 'begin', 'ok', 'sure', 'yep', 'yeah'];
      const isReady = readyKeywords.some(keyword => 
        message.toLowerCase().includes(keyword)
      );
      
      if (isReady) {
        // Add user message
        chat.addMessage({ role: 'user', content: message });
        
        // Activate session
        sessionHook.activateSession();
        
        // Start timer
        timerWithExpiry.start(currentProblem.timeLimit * 60);
        
        // Add proctor message
        chat.addMessage({ role: 'proctor', content: 'Timer started. Good luck!' });
        
        return;
      }
    }
    
    // Normal chat flow for active sessions
    if (sessionHook.session?.status !== 'active') return;
    
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
      chat.addMessage({ role: 'user', content: message });
      chat.addMessage({ role: 'proctor', content: response });
    } catch (error) {
      console.error('Failed to get proctor response:', error);
      chat.addMessage({ role: 'user', content: message });
      chat.addMessage({ role: 'proctor', content: 'Sorry, I encountered an error. Please try asking your question again.' });
    }
  }, [currentProblem, sessionHook, chat, timerWithExpiry]);
  
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
    <>
      {/* Background layers */}
      <div className="retro-grid" />
      <div className="retro-sun" />
      <div className="crt-overlay" />
      <div className="scanline" />
      
      <div className="app">
        <div className="crt">
          <div className="shell">
            {/* HUD Corners */}
            <div className="hud-corner tl"></div>
            <div className="hud-corner tr"></div>
            <div className="hud-corner bl"></div>
            <div className="hud-corner br"></div>

            {/* Settings Modal */}
            {showSettings && (
          <SettingsModal
            isOpen={showSettings}
            onClose={() => setShowSettings(false)}
            onSave={(apiKey: string) => {
              setApiKeyConfigured(apiKey.trim().length > 0);
              setShowSettings(false);
            }}
            onVimModeChange={(enabled: boolean) => setVimMode(enabled)}
            initialApiKey={getStoredApiKey() || ''}
            isFirstLaunch={!apiKeyConfigured}
            vimMode={vimMode}
          />
        )}
        
        {/* Confirmation Dialog */}
        {confirmDialog.isOpen && (
          <div style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0,0,0,0.8)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1000
          }} data-testid="confirm-dialog">
            <div style={{
              background: 'rgba(5,10,7,0.95)',
              borderRadius: '16px',
              padding: '2rem',
              maxWidth: '500px',
              width: '90%',
              border: '1px solid rgba(96,255,160,0.22)',
              boxShadow: '0 0 30px rgba(0,255,120,0.15)'
            }}>
              <h3 style={{ color: 'var(--cool)', marginBottom: '1rem' }}>Submit Solution?</h3>
              <p style={{ color: 'rgba(182,255,182,0.9)', marginBottom: '1.5rem' }}>
                You have {formatTimeRemaining(confirmDialog.timeRemaining)} left. 
                Are you sure you want to submit now?
              </p>
              <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end' }}>
                <button
                  className="btn"
                  data-testid="dialog-cancel-button"
                  onClick={() => setConfirmDialog({ isOpen: false, timeRemaining: 0 })}
                >
                  Cancel
                </button>
                <button
                  className="btn primary"
                  data-testid="dialog-confirm-button"
                  onClick={() => handleSubmitForEvaluation()}
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
                      className="btn primary"
                      onClick={handleStartSession}
                    >
                      Start Session
                    </button>
                    
                    {storedSessions.length > 0 && (
                      <button
                        data-testid="view-history-button"
                        className="btn"
                        onClick={handleViewHistory}
                      >
                        View History ({storedSessions.length} sessions)
                      </button>
                    )}
                    
                    <button
                      className="btn"
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
              <div className="session-view">
                <div className="topbar">
                  <div className="brand">
                    <span className="dot"></span>
                    <span>INTERVIEW SIMULATOR</span>
                    <span style={{ color: 'var(--cool)' }}>/</span>
                    <span style={{ color: 'var(--hot)' }}>{currentProblem.language.toUpperCase()}</span>
                  </div>
                  <div className="meta">
                    <div className="pill">
                      <span style={{ color: 'rgba(182,255,182,0.65)' }}>PROBLEM</span>
                      <span style={{ color: 'var(--cool)' }}>{currentProblem.title}</span>
                    </div>
                    <div className="pill">
                      <span style={{ color: 'rgba(182,255,182,0.65)' }}>TIMER</span>
                      <span className="timer">{Math.floor(timerWithExpiry.timeRemaining / 60).toString().padStart(2, '0')}:{(timerWithExpiry.timeRemaining % 60).toString().padStart(2, '0')}</span>
                    </div>
                    <button className="btn" onClick={() => setShowSettings(true)}>
                      Settings
                    </button>
                  </div>
                </div>
                
                <div className="neonLine"></div>
                
                <div className="main">
                  <section className="left-col">
                    <div className="problem">
                      <div className="title">
                        <h2>{currentProblem.title}</h2>
                        <div className="tags">
                          <span className="tag cool">{currentProblem.difficulty}</span>
                          <span className="tag">{currentProblem.language}</span>
                        </div>
                      </div>
                      
                      <p className="prompt">
                        {currentProblem.prompt}
                      </p>
                  
                      {currentProblem.constraints && currentProblem.constraints.length > 0 && (
                        <div style={{ marginTop: '1rem' }}>
                          <div style={{ fontSize: '0.9rem', fontWeight: 600, color: 'var(--cool)', marginBottom: '0.5rem' }}>
                            Constraints:
                          </div>
                          <ul style={{ margin: 0, paddingLeft: '1.5rem', fontSize: '0.9rem', lineHeight: '1.6' }}>
                            {currentProblem.constraints.map((constraint, i) => (
                              <li key={i}>{constraint}</li>
                            ))}
                          </ul>
                        </div>
                      )}
                      
                      {currentProblem.examples && currentProblem.examples.length > 0 && (
                        <div style={{ marginTop: '1rem' }}>
                          <div style={{ fontSize: '0.9rem', fontWeight: 600, color: 'var(--cool)', marginBottom: '0.5rem' }}>
                            Examples:
                          </div>
                          {currentProblem.examples.map((example, i) => (
                            <div key={i} style={{ marginBottom: '0.75rem', fontSize: '0.85rem', lineHeight: '1.6' }}>
                              <div><strong>Input:</strong> {example.input}</div>
                              <div><strong>Output:</strong> {example.output}</div>
                              {example.explanation && <div style={{ fontStyle: 'italic', opacity: 0.8 }}>{example.explanation}</div>}
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                    
                    <div className="editorWrap">
                      <div className="editorHeader">
                        <div className="leftBits">
                          <span className="statusLight"></span>
                          <span>EDITOR</span>
                          <span style={{ opacity: 0.6 }}>/ {currentProblem.language}</span>
                        </div>
                        <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
                          <span style={{ color: 'rgba(182,255,182,0.55)' }}>Mode:</span>
                          <span style={{ color: 'var(--hot)' }}>Assessment</span>
                        </div>
                      </div>
                      
                      <div className="editor">
                        <CodeEditorPanel
                          data-testid="code-editor-panel"
                          problemPrompt={currentProblem.prompt}
                          code={sessionHook.session?.code || ''}
                          onCodeChange={sessionHook.updateCode}
                          onSubmit={handleSubmitClick}
                          isDisabled={chat.isLoading || sessionHook.session?.status !== 'active'}
                          vimMode={vimMode}
                          language={currentProblem.language}
                        />
                      </div>
                    </div>
                  </section>
                  
                  <aside className="right-col">
                    <div className="chatHeader">
                      <div className="label">Proctor Channel</div>
                      <div className="signal">
                        <div className="bars" aria-hidden="true">
                          <span></span>
                          <span></span>
                          <span></span>
                          <span></span>
                        </div>
                        <span>secure link</span>
                      </div>
                    </div>
                    
                    <div className="chatLog">
                      <ChatPanel
                        data-testid="chat-panel"
                        messages={chat.messages}
                        onSendMessage={handleSendMessage}
                        isDisabled={chat.isLoading || (sessionHook.session?.status !== 'active' && sessionHook.session?.status !== 'waiting_to_start')}
                      />
                    </div>
                  </aside>
                </div>
              </div>
            )}
            
            {/* Review View */}
            {currentView === 'review' && currentEvaluation && (
              <div style={{ width: '100%', height: '100%', overflow: 'auto' }} data-testid="review-view">
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
              <div style={{ width: '100%', height: '100%', overflow: 'auto' }} data-testid="history-view">
                <HistoryPanel
                  data-testid="history-panel"
                  sessions={storedSessions}
                  onSelectSession={handleSelectSession}
                  onClose={handleBackToHome}
                />
              </div>
            )}
          </div>
        </div>
      </div>
    </>
  );
}

export default App;