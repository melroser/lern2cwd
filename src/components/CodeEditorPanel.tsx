import React, { useCallback, useEffect, useRef } from 'react';
import {
  EditorView,
  highlightActiveLine,
  highlightActiveLineGutter,
  keymap,
  lineNumbers,
  placeholder as cmPlaceholder,
} from '@codemirror/view';
import { Compartment, EditorState } from '@codemirror/state';
import { defaultKeymap, history, historyKeymap, indentWithTab } from '@codemirror/commands';
import { javascript } from '@codemirror/lang-javascript';
import { python } from '@codemirror/lang-python';
import { bracketMatching, defaultHighlightStyle, indentUnit, syntaxHighlighting } from '@codemirror/language';
import { oneDark } from '@codemirror/theme-one-dark';
import { vim, Vim } from '@replit/codemirror-vim';
import type { CodeEditorPanelProps } from '../types';

const styles: Record<string, React.CSSProperties> = {
  container: {
    display: 'flex',
    flexDirection: 'column',
    height: '100%',
    backgroundColor: 'var(--editor-surface)',
    color: 'var(--text-strong)',
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
    textTransform: 'uppercase',
    color: 'var(--accent-primary)',
    backgroundColor: 'var(--editor-header-bg)',
    borderBottom: '1px solid var(--panel-border-strong)',
    letterSpacing: '0.5px',
  },
  editorWrapper: {
    flex: 1,
    overflow: 'auto',
    backgroundColor: 'var(--editor-surface)',
  },
  footer: {
    padding: '16px',
    borderTop: '1px solid var(--panel-border-strong)',
    backgroundColor: 'var(--editor-header-bg)',
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: '12px',
    flexWrap: 'wrap',
  },
  submitHelpText: {
    color: 'var(--text-soft)',
    fontSize: '0.84rem',
    lineHeight: 1.5,
    maxWidth: '520px',
  },
  submitButton: {
    padding: '12px 24px',
    fontSize: '1rem',
    fontWeight: 600,
    color: 'var(--button-primary-text)',
    backgroundColor: 'var(--button-primary-bg)',
    border: 'none',
    borderRadius: '8px',
    cursor: 'pointer',
    transition: 'all 0.2s ease',
  },
  submitButtonDisabled: {
    backgroundColor: 'var(--button-disabled-bg)',
    color: 'var(--button-disabled-text)',
    cursor: 'not-allowed',
  },
  submitButtonHover: {
    backgroundColor: 'var(--button-primary-hover)',
    transform: 'translateY(-1px)',
  },
};

const languageCompartment = new Compartment();
const readOnlyCompartment = new Compartment();
const vimCompartment = new Compartment();
const editorThemeCompartment = new Compartment();
const chromeThemeCompartment = new Compartment();
let vimMappingsInitialized = false;

function initVimMappings() {
  if (vimMappingsInitialized) return;
  Vim.map('jj', '<Esc>', 'insert');
  vimMappingsInitialized = true;
}

function detectLanguage(code: string) {
  if (code.includes(': string') || code.includes(': number') || code.includes('interface ') || code.includes('<T>')) {
    return javascript({ typescript: true });
  }
  if (code.includes('function ') || code.includes('const ') || code.includes('let ') || code.includes('=>')) {
    return javascript();
  }
  return python();
}

function createEditorChromeTheme(theme: 'dark' | 'light') {
  const colors = theme === 'light'
    ? {
        background: '#ffffff',
        gutter: '#eef2f7',
        gutterActive: '#e2e8f0',
        gutterText: '#5d6b7a',
        cursor: '#2563eb',
        selection: 'rgba(37, 99, 235, 0.16)',
        activeLine: 'rgba(37, 99, 235, 0.07)',
        panelBg: '#eef2f7',
        panelText: '#17202a',
      }
    : {
        background: '#181818',
        gutter: '#232323',
        gutterActive: '#303030',
        gutterText: '#9f988e',
        cursor: '#8ab4f8',
        selection: 'rgba(138, 180, 248, 0.18)',
        activeLine: 'rgba(244, 241, 234, 0.06)',
        panelBg: '#222222',
        panelText: '#f4f1ea',
      };

  return EditorView.theme({
    '&': {
      height: '100%',
      fontSize: '16px',
      backgroundColor: colors.background,
    },
    '.cm-scroller': {
      fontFamily: 'var(--font-code)',
      lineHeight: '1.6',
    },
    '.cm-content': {
      caretColor: colors.cursor,
      padding: '8px 0',
    },
    '.cm-gutters': {
      backgroundColor: colors.gutter,
      color: colors.gutterText,
      border: 'none',
      minWidth: '40px',
    },
    '.cm-activeLineGutter': {
      backgroundColor: colors.gutterActive,
    },
    '&.cm-focused .cm-cursor': {
      borderLeftColor: colors.cursor,
    },
    '&.cm-focused .cm-selectionBackground, .cm-selectionBackground': {
      backgroundColor: `${colors.selection} !important`,
    },
    '.cm-activeLine': {
      backgroundColor: colors.activeLine,
    },
    '.cm-vim-panel': {
      backgroundColor: colors.panelBg,
      color: colors.panelText,
      padding: '2px 8px',
      fontSize: '12px',
      fontFamily: '"Fira Code", monospace',
    },
  });
}

export interface CodeEditorPanelExtendedProps extends CodeEditorPanelProps {
  vimMode?: boolean;
  language?: string;
  resolvedTheme?: 'light' | 'dark';
}

export const CodeEditorPanel: React.FC<CodeEditorPanelExtendedProps> = ({
  code,
  onCodeChange,
  onSubmit,
  isDisabled,
  vimMode = false,
  language,
  resolvedTheme = 'dark',
  submitLabel = 'Submit my attempt',
  submitHelpText = 'Submit when you think it is done. This ends the rep and shows feedback.',
}) => {
  const [isHovered, setIsHovered] = React.useState(false);
  const editorRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<EditorView | null>(null);
  const externalCodeRef = useRef(code);

  useEffect(() => {
    externalCodeRef.current = code;
  }, [code]);

  useEffect(() => {
    if (!editorRef.current) return;
    initVimMappings();

    const langExt = language === 'python'
      ? python()
      : language === 'typescript'
        ? javascript({ typescript: true })
        : language === 'javascript'
          ? javascript()
          : language
            ? []
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
        editorThemeCompartment.of(resolvedTheme === 'dark' ? oneDark : []),
        chromeThemeCompartment.of(createEditorChromeTheme(resolvedTheme)),
        EditorState.tabSize.of(4),
        indentUnit.of('    '),
        languageCompartment.of(langExt),
        readOnlyCompartment.of(EditorState.readOnly.of(isDisabled)),
        keymap.of([...defaultKeymap, ...historyKeymap, indentWithTab]),
        cmPlaceholder('# Type your answer here...'),
        EditorView.updateListener.of((update) => {
          if (update.docChanged) {
            const newDoc = update.state.doc.toString();
            if (newDoc !== externalCodeRef.current) {
              externalCodeRef.current = newDoc;
              onCodeChange(newDoc);
            }
          }
        }),
      ],
    });

    const view = new EditorView({
      state: startState,
      parent: editorRef.current,
    });

    viewRef.current = view;

    const ro = new ResizeObserver(() => {
      view.requestMeasure();
    });
    ro.observe(editorRef.current);

    return () => {
      ro.disconnect();
      view.destroy();
      viewRef.current = null;
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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

  useEffect(() => {
    const view = viewRef.current;
    if (!view) return;
    view.dispatch({
      effects: vimCompartment.reconfigure(vimMode ? vim() : []),
    });
  }, [vimMode]);

  useEffect(() => {
    const view = viewRef.current;
    if (!view) return;
    view.dispatch({
      effects: readOnlyCompartment.reconfigure(EditorState.readOnly.of(isDisabled)),
    });
  }, [isDisabled]);

  useEffect(() => {
    const view = viewRef.current;
    if (!view) return;
    view.dispatch({
      effects: [
        editorThemeCompartment.reconfigure(resolvedTheme === 'dark' ? oneDark : []),
        chromeThemeCompartment.reconfigure(createEditorChromeTheme(resolvedTheme)),
      ],
    });
  }, [resolvedTheme]);

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
      <div style={styles.editorSection}>
        <div style={styles.editorLabel}>
          Your Answer
          {vimMode && (
            <span style={{ marginLeft: '12px', color: 'var(--success-accent)', fontSize: '0.7rem', fontWeight: 400 }}>
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

      <div style={styles.footer}>
        <div style={styles.submitHelpText}>{submitHelpText}</div>
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
          aria-label={submitLabel}
        >
          {submitLabel}
        </button>
      </div>
    </div>
  );
};

export default CodeEditorPanel;
