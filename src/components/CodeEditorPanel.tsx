import React, { useRef, useEffect, useCallback } from 'react';
import { EditorView, keymap, lineNumbers, highlightActiveLine, highlightActiveLineGutter, placeholder as cmPlaceholder } from '@codemirror/view';
import { EditorState, Compartment } from '@codemirror/state';
import { defaultKeymap, indentWithTab, history, historyKeymap } from '@codemirror/commands';
import { javascript } from '@codemirror/lang-javascript';
import { python } from '@codemirror/lang-python';
import { oneDark } from '@codemirror/theme-one-dark';
import { syntaxHighlighting, defaultHighlightStyle, bracketMatching } from '@codemirror/language';
import { vim } from '@replit/codemirror-vim';
import type { CodeEditorPanelProps } from '../types';

/**
 * CodeEditorPanel - Left panel with CodeMirror 6 editor
 *
 * Requirements:
 * - 7.1: Plain text editing interface
 * - 7.2: Scaffold display and editing
 * - 7.3: Tab key for indentation
 * - 7.4: Preserve user content throughout session
 */

const styles: Record<string, React.CSSProperties> = {
  container: {
    display: 'flex',
    flexDirection: 'column',
    height: '100%',
    backgroundColor: '#1e1e2e',
    color: '#cdd6f4',
  },
  promptSection: {
    padding: '16px',
    borderBottom: '1px solid #45475a',
    backgroundColor: '#181825',
    maxHeight: '200px',
    overflowY: 'auto',
  },
  promptLabel: {
    fontSize: '0.75rem',
    fontWeight: 600,
    textTransform: 'uppercase' as const,
    color: '#89b4fa',
    marginBottom: '8px',
    letterSpacing: '0.5px',
  },
  promptText: {
    fontSize: '0.9rem',
    lineHeight: 1.6,
    color: '#cdd6f4',
    whiteSpace: 'pre-wrap',
    margin: 0,
  },
  editorSection: {
    flex: 1,
    display: 'flex',
    flexDirection: 'column',
    overflow: 'hidden',
  },
  editorLabel: {
    padding: '12px 16px',
    fontSize: '0.75rem',
    fontWeight: 600,
    textTransform: 'uppercase' as const,
    color: '#89b4fa',
    backgroundColor: '#181825',
    borderBottom: '1px solid #45475a',
    letterSpacing: '0.5px',
  },
  editorWrapper: {
    flex: 1,
    overflow: 'auto',
    backgroundColor: '#1e1e2e',
  },
  footer: {
    padding: '16px',
    borderTop: '1px solid #45475a',
    backgroundColor: '#181825',
    display: 'flex',
    justifyContent: 'flex-end',
    alignItems: 'center',
    gap: '12px',
  },
  submitButton: {
    padding: '12px 24px',
    fontSize: '1rem',
    fontWeight: 600,
    color: '#1e1e2e',
    backgroundColor: '#a6e3a1',
    border: 'none',
    borderRadius: '8px',
    cursor: 'pointer',
    transition: 'all 0.2s ease',
  },
  submitButtonDisabled: {
    backgroundColor: '#585b70',
    color: '#9399b2',
    cursor: 'not-allowed',
  },
  submitButtonHover: {
    backgroundColor: '#94e2d5',
    transform: 'translateY(-1px)',
  },
};

// Compartments let us reconfigure extensions dynamically
const languageCompartment = new Compartment();
const readOnlyCompartment = new Compartment();
const vimCompartment = new Compartment();

/**
 * Detect language from code content and return the appropriate CM extension
 */
function detectLanguage(code: string) {
  if (code.includes(': string') || code.includes(': number') || code.includes('interface ') || code.includes('<T>')) {
    return javascript({ typescript: true });
  }
  if (code.includes('function ') || code.includes('const ') || code.includes('let ') || code.includes('=>')) {
    return javascript();
  }
  // Default to Python
  return python();
}

export interface CodeEditorPanelExtendedProps extends CodeEditorPanelProps {
  vimMode?: boolean;
  language?: string;
}

export const CodeEditorPanel: React.FC<CodeEditorPanelExtendedProps> = ({
  problemPrompt,
  code,
  onCodeChange,
  onSubmit,
  isDisabled,
  vimMode = false,
  language,
}) => {
  const [isHovered, setIsHovered] = React.useState(false);
  const editorRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<EditorView | null>(null);
  // Track the latest code from parent to avoid echoing our own updates back
  const externalCodeRef = useRef(code);

  // Keep externalCodeRef in sync
  useEffect(() => {
    externalCodeRef.current = code;
  }, [code]);

  // Create the editor once on mount
  useEffect(() => {
    if (!editorRef.current) return;

    const langExt = language === 'python'
      ? python()
      : language === 'typescript'
        ? javascript({ typescript: true })
        : detectLanguage(code);

    const startState = EditorState.create({
      doc: code,
      extensions: [
        vimCompartment.of(vimMode ? vim() : []),
        lineNumbers(),
        highlightActiveLine(),
        highlightActiveLineGutter(),
        bracketMatching(),
        history(),
        syntaxHighlighting(defaultHighlightStyle, { fallback: true }),
        oneDark,
        languageCompartment.of(langExt),
        readOnlyCompartment.of(EditorState.readOnly.of(isDisabled)),
        keymap.of([...defaultKeymap, ...historyKeymap, indentWithTab]),
        cmPlaceholder('# Write your solution here...'),
        EditorView.updateListener.of((update) => {
          if (update.docChanged) {
            const newDoc = update.state.doc.toString();
            // Only notify parent if the change didn't come from parent
            if (newDoc !== externalCodeRef.current) {
              externalCodeRef.current = newDoc;
              onCodeChange(newDoc);
            }
          }
        }),
        EditorView.theme({
          '&': {
            height: '100%',
            fontSize: '14px',
          },
          '.cm-scroller': {
            fontFamily: '"Fira Code", "Consolas", "Monaco", monospace',
            lineHeight: '1.6',
          },
          '.cm-content': {
            caretColor: '#f5e0dc',
            padding: '8px 0',
          },
          '.cm-gutters': {
            backgroundColor: '#181825',
            color: '#6c7086',
            border: 'none',
            minWidth: '40px',
          },
          '.cm-activeLineGutter': {
            backgroundColor: '#313244',
          },
          '&.cm-focused .cm-cursor': {
            borderLeftColor: '#f5e0dc',
          },
          '&.cm-focused .cm-selectionBackground, .cm-selectionBackground': {
            backgroundColor: '#45475a !important',
          },
          '.cm-activeLine': {
            backgroundColor: 'rgba(69, 71, 90, 0.4)',
          },
          // Vim status bar styling
          '.cm-vim-panel': {
            backgroundColor: '#181825',
            color: '#cdd6f4',
            padding: '2px 8px',
            fontSize: '12px',
            fontFamily: '"Fira Code", monospace',
          },
        }),
      ],
    });

    const view = new EditorView({
      state: startState,
      parent: editorRef.current,
    });

    viewRef.current = view;

    return () => {
      view.destroy();
      viewRef.current = null;
    };
    // Only run on mount/unmount — we handle updates via dispatch below
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Sync code from parent → editor (e.g. scaffold load)
  useEffect(() => {
    const view = viewRef.current;
    if (!view) return;
    const currentDoc = view.state.doc.toString();
    if (code !== currentDoc) {
      view.dispatch({
        changes: { from: 0, to: currentDoc.length, insert: code },
      });
    }
  }, [code]);

  // Toggle vim mode dynamically
  useEffect(() => {
    const view = viewRef.current;
    if (!view) return;
    view.dispatch({
      effects: vimCompartment.reconfigure(vimMode ? vim() : []),
    });
  }, [vimMode]);

  // Toggle read-only dynamically
  useEffect(() => {
    const view = viewRef.current;
    if (!view) return;
    view.dispatch({
      effects: readOnlyCompartment.reconfigure(EditorState.readOnly.of(isDisabled)),
    });
  }, [isDisabled]);

  const handleKeyDown = useCallback((event: React.KeyboardEvent) => {
    if (event.key === 'Enter' && event.ctrlKey) {
      event.preventDefault();
      if (!isDisabled) {
        onSubmit();
      }
    }
  }, [isDisabled, onSubmit]);

  return (
    <div style={styles.container} data-testid="code-editor-panel">
      {/* Problem Prompt Section */}
      <div style={styles.promptSection} data-testid="problem-prompt-section">
        <div style={styles.promptLabel}>Problem</div>
        <pre style={styles.promptText} data-testid="problem-prompt">
          {problemPrompt || 'No problem loaded'}
        </pre>
      </div>

      {/* Code Editor Section */}
      <div style={styles.editorSection}>
        <div style={styles.editorLabel}>
          Your Solution
          {vimMode && (
            <span style={{ marginLeft: '12px', color: '#a6e3a1', fontSize: '0.7rem', fontWeight: 400 }}>
              VIM
            </span>
          )}
        </div>
        <div
          style={{
            ...styles.editorWrapper,
            ...(isDisabled ? { opacity: 0.6 } : {}),
          }}
          onKeyDown={handleKeyDown}
          data-testid="editor-wrapper"
          ref={editorRef}
        />
      </div>

      {/* Footer with Submit Button */}
      <div style={styles.footer}>
        <button
          onClick={onSubmit}
          disabled={isDisabled}
          onMouseEnter={() => setIsHovered(true)}
          onMouseLeave={() => setIsHovered(false)}
          style={{
            ...styles.submitButton,
            ...(isDisabled ? styles.submitButtonDisabled : {}),
            ...(!isDisabled && isHovered ? styles.submitButtonHover : {}),
          }}
          data-testid="submit-button"
          aria-label="Submit solution"
        >
          I'm Done
        </button>
      </div>
    </div>
  );
};

export default CodeEditorPanel;
