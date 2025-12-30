// Background service worker for Console & Network for Claude CLI
// Handles network request capture and VS Code bridge connection

const allErrors = new Map(); // tabId -> errors[]
const allNetworkRequests = new Map(); // tabId -> requests[]
const pendingRequests = new Map(); // requestId -> request data

let wsConnection = null;
let wsReconnectTimer = null;
let bridgePort = 9876;
let isCapturing = new Map(); // tabId -> boolean

// Default resource type exclusions
let excludedResourceTypes = {
  Font: true,
  Image: true,
  Stylesheet: false,
  Script: false,
  Media: true,
  Other: false
};

// URL patterns to exclude (e.g., base64 data URLs, common static assets)
let excludedPatterns = {
  base64: true,      // data: URLs and base64 encoded content
  fonts: true,       // .woff, .woff2, .ttf, .eot, .otf
  images: true,      // .png, .jpg, .jpeg, .gif, .svg, .webp, .ico
  sourcemaps: true   // .map files
};

// Check if a request should be excluded based on settings
function shouldExcludeRequest(resourceType, url) {
  // Check resource type exclusion
  if (excludedResourceTypes[resourceType]) {
    return true;
  }

  if (!url) return false;

  // Check URL patterns
  if (excludedPatterns.base64) {
    if (url.startsWith('data:') || url.includes('base64')) {
      return true;
    }
  }

  if (excludedPatterns.fonts) {
    if (/\.(woff2?|ttf|eot|otf)(\?|$)/i.test(url)) {
      return true;
    }
  }

  if (excludedPatterns.images) {
    if (/\.(png|jpe?g|gif|svg|webp|ico|bmp|avif)(\?|$)/i.test(url)) {
      return true;
    }
  }

  if (excludedPatterns.sourcemaps) {
    if (/\.map(\?|$)/i.test(url)) {
      return true;
    }
  }

  return false;
}

// ============ NETWORK CAPTURE ============

// Start capturing network for a tab using debugger
async function startNetworkCapture(tabId) {
  if (isCapturing.get(tabId)) return;
  
  try {
    await chrome.debugger.attach({ tabId }, '1.3');
    await chrome.debugger.sendCommand({ tabId }, 'Network.enable');
    isCapturing.set(tabId, true);
    console.log('[Claude] Network capture started for tab', tabId);
  } catch (e) {
    console.error('[Claude] Failed to start network capture:', e);
  }
}

// Stop capturing for a tab
async function stopNetworkCapture(tabId) {
  if (!isCapturing.get(tabId)) return;
  
  try {
    await chrome.debugger.detach({ tabId });
    isCapturing.set(tabId, false);
    console.log('[Claude] Network capture stopped for tab', tabId);
  } catch (e) {
    // Tab might be closed
  }
}

// Handle debugger events
chrome.debugger.onEvent.addListener((source, method, params) => {
  const tabId = source.tabId;
  
  if (!allNetworkRequests.has(tabId)) {
    allNetworkRequests.set(tabId, []);
  }
  
  const requests = allNetworkRequests.get(tabId);
  
  if (method === 'Network.requestWillBeSent') {
    // Check if this request should be excluded
    if (shouldExcludeRequest(params.type, params.request.url)) {
      return;
    }

    const request = {
      id: params.requestId,
      type: 'request',
      timestamp: new Date().toISOString(),
      url: params.request.url,
      method: params.request.method,
      headers: params.request.headers,
      postData: params.request.postData,
      resourceType: params.type,
      initiator: params.initiator?.type
    };

    // Store pending request
    pendingRequests.set(params.requestId, request);

    // Add to list
    requests.push(request);

    // Keep only last 100
    if (requests.length > 100) requests.shift();

    // Update badge
    updateBadge(tabId);

    // Send to VS Code bridge
    sendToBridge({
      type: 'network_request',
      tabId,
      data: request
    });
  }
  
  if (method === 'Network.responseReceived') {
    // Check if we have a pending request for this - if not, it was filtered out
    if (!pendingRequests.has(params.requestId)) {
      // Also check URL patterns for responses without pending requests
      if (shouldExcludeRequest(params.type, params.response.url)) {
        return;
      }
    }

    const response = {
      id: params.requestId,
      type: 'response',
      timestamp: new Date().toISOString(),
      url: params.response.url,
      status: params.response.status,
      statusText: params.response.statusText,
      headers: params.response.headers,
      mimeType: params.response.mimeType,
      timing: params.response.timing
    };

    // Try to get response body
    getResponseBody(tabId, params.requestId, response);

    requests.push(response);
    if (requests.length > 100) requests.shift();

    // Send to VS Code bridge
    sendToBridge({
      type: 'network_response',
      tabId,
      data: response
    });
  }
  
  if (method === 'Network.loadingFailed') {
    const failure = {
      id: params.requestId,
      type: 'failure',
      timestamp: new Date().toISOString(),
      errorText: params.errorText,
      canceled: params.canceled,
      blockedReason: params.blockedReason
    };
    
    requests.push(failure);
    
    sendToBridge({
      type: 'network_failure',
      tabId,
      data: failure
    });
  }
});

async function getResponseBody(tabId, requestId, responseObj) {
  try {
    const result = await chrome.debugger.sendCommand(
      { tabId },
      'Network.getResponseBody',
      { requestId }
    );
    
    if (result) {
      responseObj.body = result.base64Encoded 
        ? '[Base64 data - ' + (result.body?.length || 0) + ' chars]'
        : truncateBody(result.body);
    }
  } catch (e) {
    // Body might not be available
  }
}

function truncateBody(body) {
  if (!body) return null;
  if (body.length > 5000) {
    return body.substring(0, 5000) + '... [truncated]';
  }
  return body;
}

// ============ BADGE MANAGEMENT ============

function updateBadge(tabId) {
  const errors = allErrors.get(tabId) || [];
  const requests = allNetworkRequests.get(tabId) || [];
  const failedRequests = requests.filter(r => r.type === 'failure' || (r.type === 'response' && r.status >= 400));
  
  const count = errors.length + failedRequests.length;
  
  chrome.action.setBadgeText({
    text: count > 0 ? count.toString() : '',
    tabId
  });
  
  chrome.action.setBadgeBackgroundColor({
    color: errors.length > 0 ? '#e74c3c' : '#f39c12',
    tabId
  });
}

// ============ VS CODE BRIDGE ============

function connectToBridge() {
  if (wsConnection && wsConnection.readyState === WebSocket.OPEN) return;
  
  try {
    // Try to connect to local bridge server
    wsConnection = new WebSocket(`ws://localhost:${bridgePort}`);
    
    wsConnection.onopen = () => {
      console.log('[Claude] Connected to VS Code bridge');
      chrome.storage.local.set({ bridgeConnected: true });
    };
    
    wsConnection.onclose = () => {
      console.log('[Claude] Disconnected from VS Code bridge');
      chrome.storage.local.set({ bridgeConnected: false });
      wsConnection = null;
      
      // Try to reconnect after 5 seconds
      if (!wsReconnectTimer) {
        wsReconnectTimer = setTimeout(() => {
          wsReconnectTimer = null;
          connectToBridge();
        }, 5000);
      }
    };
    
    wsConnection.onerror = (e) => {
      console.log('[Claude] Bridge connection error - server may not be running');
    };
    
    wsConnection.onmessage = (event) => {
      handleBridgeMessage(JSON.parse(event.data));
    };
  } catch (e) {
    console.log('[Claude] Could not connect to bridge:', e);
  }
}

function sendToBridge(message) {
  if (wsConnection && wsConnection.readyState === WebSocket.OPEN) {
    wsConnection.send(JSON.stringify(message));
  }
}

async function handleBridgeMessage(message) {
  // Handle commands from VS Code/Claude CLI
  if (message.type === 'get_errors') {
    const tabId = message.tabId || await getActiveTabId();
    const errors = allErrors.get(tabId) || [];
    sendToBridge({
      type: 'errors',
      requestId: message.requestId,
      data: errors
    });
  }
  
  if (message.type === 'get_network') {
    const tabId = message.tabId || await getActiveTabId();
    const requests = allNetworkRequests.get(tabId) || [];
    sendToBridge({
      type: 'network',
      requestId: message.requestId,
      data: requests
    });
  }
  
  if (message.type === 'get_all') {
    const tabId = message.tabId || await getActiveTabId();
    sendToBridge({
      type: 'all_data',
      requestId: message.requestId,
      data: {
        errors: allErrors.get(tabId) || [],
        network: allNetworkRequests.get(tabId) || []
      }
    });
  }
  
  if (message.type === 'clear') {
    const tabId = message.tabId || await getActiveTabId();
    allErrors.delete(tabId);
    allNetworkRequests.delete(tabId);
    pendingRequests.clear();
    updateBadge(tabId);
    sendToBridge({ type: 'cleared', requestId: message.requestId });
  }
  
  if (message.type === 'start_capture') {
    const tabId = message.tabId || await getActiveTabId();
    await startNetworkCapture(tabId);
    sendToBridge({ type: 'capture_started', requestId: message.requestId });
  }
}

async function getActiveTabId() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  return tab?.id;
}

// ============ MESSAGE HANDLING FROM POPUP/CONTENT ============

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'ERROR_CAPTURED' && sender.tab) {
    const tabId = sender.tab.id;
    
    if (!allErrors.has(tabId)) {
      allErrors.set(tabId, []);
    }
    
    const errors = allErrors.get(tabId);
    errors.push(message.error);
    
    if (errors.length > 100) errors.shift();
    
    updateBadge(tabId);
    
    // Send to VS Code bridge
    sendToBridge({
      type: 'console_error',
      tabId,
      data: message.error
    });
  }
  
  if (message.type === 'GET_TAB_ERRORS') {
    sendResponse({ errors: allErrors.get(message.tabId) || [] });
  }
  
  if (message.type === 'GET_TAB_NETWORK') {
    sendResponse({ requests: allNetworkRequests.get(message.tabId) || [] });
  }
  
  if (message.type === 'CLEAR_TAB_ERRORS') {
    allErrors.delete(message.tabId);
    updateBadge(message.tabId);
    sendResponse({ success: true });
  }
  
  if (message.type === 'CLEAR_TAB_NETWORK') {
    allNetworkRequests.delete(message.tabId);
    sendResponse({ success: true });
  }
  
  if (message.type === 'START_NETWORK_CAPTURE') {
    startNetworkCapture(message.tabId).then(() => {
      sendResponse({ success: true });
    });
    return true;
  }
  
  if (message.type === 'STOP_NETWORK_CAPTURE') {
    stopNetworkCapture(message.tabId).then(() => {
      sendResponse({ success: true });
    });
    return true;
  }
  
  if (message.type === 'GET_BRIDGE_STATUS') {
    sendResponse({ 
      connected: wsConnection?.readyState === WebSocket.OPEN,
      port: bridgePort
    });
  }
  
  if (message.type === 'SET_BRIDGE_PORT') {
    bridgePort = message.port;
    chrome.storage.local.set({ bridgePort });
    // Reconnect with new port
    if (wsConnection) {
      wsConnection.close();
    }
    connectToBridge();
    sendResponse({ success: true });
  }
  
  if (message.type === 'GET_ALL_DATA') {
    const tabId = message.tabId;
    sendResponse({
      errors: allErrors.get(tabId) || [],
      network: allNetworkRequests.get(tabId) || []
    });
  }

  if (message.type === 'GET_EXCLUSION_SETTINGS') {
    sendResponse({
      resourceTypes: excludedResourceTypes,
      patterns: excludedPatterns
    });
  }

  if (message.type === 'SET_EXCLUSION_SETTINGS') {
    if (message.resourceTypes) {
      excludedResourceTypes = { ...excludedResourceTypes, ...message.resourceTypes };
      chrome.storage.local.set({ excludedResourceTypes });
    }
    if (message.patterns) {
      excludedPatterns = { ...excludedPatterns, ...message.patterns };
      chrome.storage.local.set({ excludedPatterns });
    }
    sendResponse({ success: true });
  }

  return true;
});

// Clean up when tab is closed
chrome.tabs.onRemoved.addListener((tabId) => {
  allErrors.delete(tabId);
  allNetworkRequests.delete(tabId);
  isCapturing.delete(tabId);
});

// Clean up when tab navigates
chrome.tabs.onUpdated.addListener((tabId, changeInfo) => {
  if (changeInfo.status === 'loading') {
    allErrors.delete(tabId);
    allNetworkRequests.delete(tabId);
    chrome.action.setBadgeText({ text: '', tabId });
  }
});

// Debugger detached
chrome.debugger.onDetach.addListener((source, reason) => {
  isCapturing.set(source.tabId, false);
  console.log('[Claude] Debugger detached:', reason);
});

// Initialize
chrome.storage.local.get(['bridgePort', 'excludedResourceTypes', 'excludedPatterns'], (result) => {
  if (result.bridgePort) {
    bridgePort = result.bridgePort;
  }
  if (result.excludedResourceTypes) {
    excludedResourceTypes = { ...excludedResourceTypes, ...result.excludedResourceTypes };
  }
  if (result.excludedPatterns) {
    excludedPatterns = { ...excludedPatterns, ...result.excludedPatterns };
  }
  // Try to connect to bridge on startup
  connectToBridge();
});

console.log('[Claude] Background service worker initialized');
