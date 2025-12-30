// Console Errors Capture for Claude CLI - React/Next.js Edition
// Captures React errors, hydration errors, Next.js errors, and standard console errors

(function() {
  'use strict';

  // Prevent double injection
  if (window.__CLAUDE_CONSOLE_INJECTED__) return;
  window.__CLAUDE_CONSOLE_INJECTED__ = true;

  // ============ INJECT PAGE SCRIPT FOR EARLY CAPTURE ============
  function injectPageScript() {
    const script = document.createElement('script');
    script.src = chrome.runtime.getURL('inject.js');
    script.onload = function() { this.remove(); };
    (document.head || document.documentElement).appendChild(script);
  }

  // Inject immediately
  injectPageScript();

  const MAX_ERRORS = 100;
  const errors = [];

  // Patterns to filter out junk from stack traces
  const JUNK_PATTERNS = [
    // Anonymous functions with hash-based filenames
    /\(anonymous\)@__[\w-]+\.js:\d+__/g,
    /__xhr@__[\w-]+\.js:\d+__/g,
    /__\w+@__[\w-]+\.js:\d+__/g,
    // Webpack chunk references with long hashes
    /webpack-internal:\/\/\/\([\w-]+\)\//g,
    /webpack:\/\/\S+\/_next\/static\/chunks\/[\w-]+\.js/g,
    // Next.js internal chunks
    /_next\/static\/chunks\/[\w-]{20,}\.js/g,
    // Generic minified file references with long hashes
    /@[\w-]{20,}\.js:\d+/g,
    // Chrome extension internal URLs
    /chrome-extension:\/\/[\w]+\//g,
    // Very long hash-based chunk names
    /[\w-]{32,}\.js/g,
    // Promise.then chains in minified code
    /Promise\.then_\w+@/g,
    // Anonymous computed properties
    /<computed>@/g,
    // Repeated underscores pattern
    /__+/g,
    // node_modules paths (keep package name only)
    /node_modules\/\.pnpm\/[^/]+\//g,
    // Turbopack internals
    /\[turbopack\]/g,
  ];

  // Patterns for stack trace lines to remove entirely
  const REMOVE_LINE_PATTERNS = [
    /^\s*at\s+[\w.<>]+\s+\([\w-]{20,}\.js:\d+:\d+\)\s*$/,
    /^\s*@[\w-]{20,}\.js:\d+\s*$/,
    /^\s*at\s+webpack_require/,
    /^\s*at\s+__webpack_/,
    /^\s*at\s+Object\.(\d+)\s*\[as/,
    /^\s*at\s+Module\.\d+\s*\(/,
  ];

  // React-specific error patterns to identify
  const REACT_ERROR_PATTERNS = {
    hydration: /hydrat|mismatch|server.*client|text content does not match/i,
    hooks: /hook|useState|useEffect|useRef|useMemo|useCallback|useContext|useReducer/i,
    render: /render|component|element|jsx|Invalid prop|Failed prop/i,
    nextjs: /getServerSideProps|getStaticProps|_app|_document|next\/|middleware/i,
  };

  function identifyReactErrorType(message) {
    if (!message) return null;
    for (const [type, pattern] of Object.entries(REACT_ERROR_PATTERNS)) {
      if (pattern.test(message)) return type;
    }
    return null;
  }

  function cleanErrorMessage(message) {
    if (!message || typeof message !== 'string') return message;

    let cleaned = message;

    // Apply junk patterns
    JUNK_PATTERNS.forEach(pattern => {
      cleaned = cleaned.replace(pattern, '');
    });

    // Clean up multiple spaces and newlines
    cleaned = cleaned.replace(/\s{2,}/g, ' ');
    cleaned = cleaned.replace(/\n{3,}/g, '\n\n');

    // Remove empty parentheses left over
    cleaned = cleaned.replace(/\(\s*\)/g, '');

    // Clean up Next.js webpack paths
    cleaned = cleaned.replace(/webpack-internal:\/\/\/\([^)]+\)\//g, '');
    cleaned = cleaned.replace(/\.next\/server\//g, '');
    cleaned = cleaned.replace(/\.next\/static\/chunks\//g, '');

    return cleaned.trim();
  }

  function cleanStackTrace(stack) {
    if (!stack || typeof stack !== 'string') return '';

    const lines = stack.split('\n');
    const cleanedLines = [];
    let lastFile = '';

    for (let line of lines) {
      // Check if this line should be removed entirely
      let shouldRemove = REMOVE_LINE_PATTERNS.some(pattern => pattern.test(line));

      if (!shouldRemove) {
        let cleanedLine = line;
        JUNK_PATTERNS.forEach(pattern => {
          cleanedLine = cleanedLine.replace(pattern, '');
        });

        // Clean Next.js/webpack paths to be more readable
        cleanedLine = cleanedLine.replace(/webpack-internal:\/\/\/\([^)]+\)\//g, '');
        cleanedLine = cleanedLine.replace(/\?[\da-f]+/g, ''); // Remove cache busters

        // Extract useful file info
        const fileMatch = cleanedLine.match(/at\s+(\S+)\s+\(([^)]+):(\d+):(\d+)\)/);
        if (fileMatch) {
          const [, func, file, line, col] = fileMatch;
          // Skip if same file as last line (reduce noise)
          const shortFile = file.split('/').slice(-2).join('/');
          if (shortFile !== lastFile) {
            cleanedLines.push(`  at ${func} (${shortFile}:${line}:${col})`);
            lastFile = shortFile;
          }
        } else if (cleanedLine.trim() && !cleanedLine.includes('webpack')) {
          cleanedLines.push(cleanedLine);
        }
      }
    }

    return cleanedLines.slice(0, 10).join('\n'); // Limit stack depth
  }

  function formatError(errorData) {
    const parts = [];
    const reactType = identifyReactErrorType(errorData.message);

    let typeLabel = errorData.type?.toUpperCase() || 'ERROR';
    if (reactType) {
      typeLabel += ` (React ${reactType})`;
    }
    parts.push(`[${typeLabel}]`);

    if (errorData.message) {
      parts.push(cleanErrorMessage(errorData.message));
    }

    if (errorData.source) {
      // Clean the source URL
      let source = errorData.source;
      source = source.replace(/[\w-]{32,}(?=\.js)/g, '[hash]');
      source = source.replace(/_next\/static\/chunks\//g, '');
      // Get just the filename
      const filename = source.split('/').pop()?.split('?')[0];
      if (filename && filename !== '[hash].js') {
        parts.push(`\n  File: ${filename}`);
      }
    }

    if (errorData.lineno && errorData.lineno > 0) {
      parts.push(`Line: ${errorData.lineno}${errorData.colno ? `, Col: ${errorData.colno}` : ''}`);
    }

    if (errorData.componentStack) {
      parts.push(`\n  Component Stack:\n${errorData.componentStack}`);
    }

    if (errorData.stack) {
      const cleanedStack = cleanStackTrace(errorData.stack);
      if (cleanedStack) {
        parts.push(`\n  Stack:\n${cleanedStack}`);
      }
    }

    return parts.join(' ');
  }

  function addError(errorData) {
    // Deduplicate - don't add if we already have this exact error
    const msgKey = (errorData.message || '').substring(0, 100);
    const isDupe = errors.some(e => 
      (e.raw?.message || '').substring(0, 100) === msgKey &&
      Date.now() - new Date(e.timestamp).getTime() < 1000
    );
    if (isDupe) return;

    const formattedError = {
      raw: errorData,
      cleaned: formatError(errorData),
      timestamp: new Date().toISOString(),
      url: window.location.href,
      reactType: identifyReactErrorType(errorData.message)
    };

    errors.push(formattedError);

    // Keep only the last MAX_ERRORS
    if (errors.length > MAX_ERRORS) {
      errors.shift();
    }

    // Store in extension storage
    try {
      chrome.runtime?.sendMessage({
        type: 'ERROR_CAPTURED',
        error: formattedError
      });
    } catch (e) {
      // Extension context may not be available
    }

    // Also log to help debugging
    console.debug('[Claude Console] Captured:', errorData.type, msgKey.substring(0, 50));
  }

  // ============ INTERCEPT CONSOLE METHODS ============

  const originalConsole = {
    error: console.error,
    warn: console.warn,
    log: console.log
  };

  function stringifyArg(arg) {
    if (arg instanceof Error) {
      return `${arg.name}: ${arg.message}`;
    }
    if (typeof arg === 'object' && arg !== null) {
      try {
        // Handle React fiber nodes and circular refs
        const seen = new WeakSet();
        return JSON.stringify(arg, (key, value) => {
          if (typeof value === 'object' && value !== null) {
            if (seen.has(value)) return '[Circular]';
            seen.add(value);
            // Skip React internals
            if (key.startsWith('_') || key === 'stateNode' || key === 'fiber') {
              return '[React Internal]';
            }
          }
          return value;
        }, 2).substring(0, 2000);
      } catch {
        return String(arg);
      }
    }
    return String(arg);
  }

  console.error = function(...args) {
    const message = args.map(stringifyArg).join(' ');
    const errorObj = args.find(a => a instanceof Error);

    addError({
      type: 'error',
      message: message,
      stack: errorObj?.stack || new Error().stack,
      componentStack: args.find(a => typeof a === 'string' && a.includes('at '))
    });

    originalConsole.error.apply(console, args);
  };

  console.warn = function(...args) {
    const message = args.map(stringifyArg).join(' ');

    // Capture React-specific warnings
    const isReactWarning = REACT_ERROR_PATTERNS.hydration.test(message) ||
                          REACT_ERROR_PATTERNS.hooks.test(message) ||
                          REACT_ERROR_PATTERNS.render.test(message);

    if (isReactWarning || message.toLowerCase().includes('error') || 
        message.toLowerCase().includes('warning') || message.toLowerCase().includes('failed')) {
      addError({
        type: 'warn',
        message: message,
        stack: new Error().stack
      });
    }

    originalConsole.warn.apply(console, args);
  };

  // ============ GLOBAL ERROR HANDLERS ============

  // Catch unhandled errors
  window.addEventListener('error', function(event) {
    addError({
      type: 'error',
      message: event.message || String(event.error),
      source: event.filename,
      lineno: event.lineno,
      colno: event.colno,
      stack: event.error?.stack
    });
  }, true); // Use capture phase to catch early

  // Catch unhandled promise rejections
  window.addEventListener('unhandledrejection', function(event) {
    let message = 'Unhandled Promise Rejection';
    let stack = '';

    if (event.reason) {
      if (event.reason instanceof Error) {
        message = `${event.reason.name}: ${event.reason.message}`;
        stack = event.reason.stack;
      } else if (typeof event.reason === 'string') {
        message = event.reason;
      } else {
        try {
          message = JSON.stringify(event.reason).substring(0, 1000);
        } catch {
          message = String(event.reason);
        }
      }
    }

    addError({
      type: 'promise',
      message: message,
      stack: stack || new Error().stack
    });
  }, true);

  // ============ REACT ERROR BOUNDARY DETECTION ============

  // Monkey-patch React's error handling if React is present
  function patchReact() {
    // Check for React DevTools hook (works with most React apps)
    const hook = window.__REACT_DEVTOOLS_GLOBAL_HOOK__;
    if (hook) {
      const originalOnCommitFiberRoot = hook.onCommitFiberRoot;
      if (originalOnCommitFiberRoot) {
        hook.onCommitFiberRoot = function(id, root, ...args) {
          try {
            // Check for error boundaries that caught errors
            const current = root.current;
            if (current?.memoizedState?.error) {
              addError({
                type: 'react-boundary',
                message: String(current.memoizedState.error),
                stack: current.memoizedState.error?.stack
              });
            }
          } catch (e) {
            // Ignore errors in our patch
          }
          return originalOnCommitFiberRoot.call(this, id, root, ...args);
        };
      }
    }
  }

  // ============ NEXT.JS SPECIFIC HANDLERS ============

  // Capture Next.js error overlay messages
  function watchNextJsOverlay() {
    const observer = new MutationObserver((mutations) => {
      mutations.forEach((mutation) => {
        mutation.addedNodes.forEach((node) => {
          if (node.nodeType === Node.ELEMENT_NODE) {
            // Check for Next.js error overlay
            const errorOverlay = node.querySelector?.('nextjs-portal') || 
                                (node.tagName === 'NEXTJS-PORTAL' ? node : null);
            if (errorOverlay) {
              const errorText = errorOverlay.textContent;
              if (errorText && errorText.length > 10) {
                addError({
                  type: 'nextjs-overlay',
                  message: errorText.substring(0, 2000)
                });
              }
            }

            // Check for error dialogs
            const errorDialog = node.querySelector?.('[data-nextjs-dialog]') ||
                               node.closest?.('[data-nextjs-dialog]');
            if (errorDialog) {
              addError({
                type: 'nextjs-dialog',
                message: errorDialog.textContent?.substring(0, 2000) || 'Next.js Error Dialog'
              });
            }
          }
        });
      });
    });

    observer.observe(document.documentElement, {
      childList: true,
      subtree: true
    });
  }

  // ============ INITIALIZATION ============

  // Try to patch React
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
      patchReact();
      watchNextJsOverlay();
    });
  } else {
    patchReact();
    watchNextJsOverlay();
  }

  // Also try after a delay (for dynamically loaded React)
  setTimeout(patchReact, 1000);
  setTimeout(patchReact, 3000);

  // ============ MESSAGE HANDLING ============

  // Listen for errors from injected page script
  window.addEventListener('message', function(event) {
    if (event.source !== window) return;
    if (event.data?.type === '__CLAUDE_CONSOLE_ERROR__') {
      addError(event.data.error);
    }
  });

  // Import any early errors captured before content script loaded
  function importEarlyErrors() {
    const earlyErrors = window.__CLAUDE_EARLY_ERRORS__ || [];
    earlyErrors.forEach(err => {
      addError(err);
    });
    // Clear early errors after import
    window.__CLAUDE_EARLY_ERRORS__ = [];
  }

  // Import early errors after a short delay to ensure page script ran
  setTimeout(importEarlyErrors, 100);
  setTimeout(importEarlyErrors, 500);

  chrome.runtime?.onMessage.addListener((message, sender, sendResponse) => {
    if (message.type === 'GET_ERRORS') {
      sendResponse({ errors: errors });
    } else if (message.type === 'CLEAR_ERRORS') {
      errors.length = 0;
      sendResponse({ success: true });
    } else if (message.type === 'PING') {
      sendResponse({ status: 'active', errorCount: errors.length });
    }
    return true;
  });

  // Announce we're ready
  originalConsole.log('[Console for Claude] React/Next.js error capture initialized ✓');
  originalConsole.log('[Console for Claude] Monitoring: console.error, console.warn, window.onerror, unhandledrejection');

})();
