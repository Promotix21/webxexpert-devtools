// This script gets injected into the page context to capture errors
// before the content script even loads - critical for React/Next.js apps

(function() {
  'use strict';
  
  if (window.__CLAUDE_PAGE_INJECTED__) return;
  window.__CLAUDE_PAGE_INJECTED__ = true;

  // Store for early errors before content script is ready
  window.__CLAUDE_EARLY_ERRORS__ = window.__CLAUDE_EARLY_ERRORS__ || [];

  const earlyErrors = window.__CLAUDE_EARLY_ERRORS__;

  function captureError(errorData) {
    earlyErrors.push({
      ...errorData,
      timestamp: new Date().toISOString(),
      url: window.location.href
    });
    
    // Keep only last 50 early errors
    if (earlyErrors.length > 50) {
      earlyErrors.shift();
    }
    
    // Try to notify content script if it's ready
    window.postMessage({
      type: '__CLAUDE_CONSOLE_ERROR__',
      error: errorData
    }, '*');
  }

  // Capture console.error ASAP
  const originalError = console.error;
  console.error = function(...args) {
    const message = args.map(arg => {
      if (arg instanceof Error) return `${arg.name}: ${arg.message}`;
      if (typeof arg === 'object') {
        try { return JSON.stringify(arg).substring(0, 1000); }
        catch { return String(arg); }
      }
      return String(arg);
    }).join(' ');

    captureError({
      type: 'error',
      message: message,
      stack: args.find(a => a instanceof Error)?.stack || new Error().stack
    });

    return originalError.apply(console, args);
  };

  // Capture console.warn for React warnings
  const originalWarn = console.warn;
  console.warn = function(...args) {
    const message = args.map(arg => String(arg)).join(' ');
    
    // Only capture React/Next related warnings
    if (message.includes('React') || message.includes('Warning') || 
        message.includes('hydrat') || message.includes('Error') ||
        message.includes('Next.js') || message.includes('hook')) {
      captureError({
        type: 'warn',
        message: message
      });
    }

    return originalWarn.apply(console, args);
  };

  // Global error handler
  window.addEventListener('error', function(event) {
    captureError({
      type: 'error',
      message: event.message,
      source: event.filename,
      lineno: event.lineno,
      colno: event.colno,
      stack: event.error?.stack
    });
  }, true);

  // Promise rejection handler
  window.addEventListener('unhandledrejection', function(event) {
    let message = 'Unhandled Promise Rejection';
    let stack = '';

    if (event.reason instanceof Error) {
      message = `${event.reason.name}: ${event.reason.message}`;
      stack = event.reason.stack;
    } else if (event.reason) {
      message = String(event.reason);
    }

    captureError({
      type: 'promise',
      message: message,
      stack: stack
    });
  }, true);

  console.log('[Console for Claude] Early error capture ready');
})();
