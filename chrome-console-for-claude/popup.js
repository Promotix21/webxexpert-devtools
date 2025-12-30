// Popup script for Console & Network for Claude CLI

let currentErrors = [];
let currentNetwork = [];
let currentTab = null;

// DOM elements
const consoleContainer = document.getElementById('consoleContainer');
const networkContainer = document.getElementById('networkContainer');
const copyBtn = document.getElementById('copyBtn');
const clearBtn = document.getElementById('clearBtn');
const refreshBtn = document.getElementById('refreshBtn');
const testBtn = document.getElementById('testBtn');
const toast = document.getElementById('toast');
const pageUrl = document.getElementById('pageUrl');

// Badges
const consoleBadge = document.getElementById('consoleBadge');
const networkBadge = document.getElementById('networkBadge');

// Status dots
const captureStatus = document.getElementById('captureStatus');
const captureText = document.getElementById('captureText');
const networkStatus = document.getElementById('networkStatus');
const networkText = document.getElementById('networkText');
const bridgeStatus = document.getElementById('bridgeStatus');
const bridgeText = document.getElementById('bridgeText');
const bridgeStatusSettings = document.getElementById('bridgeStatusSettings');
const bridgeStatusText = document.getElementById('bridgeStatusText');

// Options
const includeWarnings = document.getElementById('includeWarnings');
const includeStack = document.getElementById('includeStack');
const consoleFilter = document.getElementById('consoleFilter');
const showRequests = document.getElementById('showRequests');
const showResponses = document.getElementById('showResponses');
const onlyFetch = document.getElementById('onlyFetch');
const onlyErrors = document.getElementById('onlyErrors');
const networkFilter = document.getElementById('networkFilter');
const formatSelect = document.getElementById('formatSelect');
const bridgePort = document.getElementById('bridgePort');
const reconnectBtn = document.getElementById('reconnectBtn');
const startCaptureBtn = document.getElementById('startCaptureBtn');

// Exclusion settings
const excludeFont = document.getElementById('excludeFont');
const excludeImage = document.getElementById('excludeImage');
const excludeStylesheet = document.getElementById('excludeStylesheet');
const excludeScript = document.getElementById('excludeScript');
const excludeMedia = document.getElementById('excludeMedia');
const excludeBase64 = document.getElementById('excludeBase64');
const excludeSourcemaps = document.getElementById('excludeSourcemaps');

// Tabs
const tabs = document.querySelectorAll('.tab');
const tabContents = document.querySelectorAll('.tab-content');

// ============ INITIALIZATION ============

async function init() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  currentTab = tab;
  
  // Update page URL
  try {
    const url = new URL(tab.url);
    pageUrl.textContent = url.hostname + url.pathname.substring(0, 25);
  } catch {
    pageUrl.textContent = 'Unknown';
  }
  
  await checkAllStatus();
  await loadAllData();
  setupEventListeners();
}

// ============ STATUS CHECKING ============

async function checkAllStatus() {
  // Check console capture
  try {
    const response = await chrome.tabs.sendMessage(currentTab.id, { type: 'PING' });
    if (response?.status === 'active') {
      captureStatus.classList.add('active');
      captureText.textContent = 'Console ✓';
    }
  } catch {
    captureStatus.classList.remove('active');
    captureText.textContent = 'Console ✗';
  }

  // Check bridge status
  try {
    const response = await chrome.runtime.sendMessage({ type: 'GET_BRIDGE_STATUS' });
    if (response?.connected) {
      bridgeStatus.classList.add('active');
      bridgeText.textContent = 'VS Code ✓';
      bridgeStatusSettings?.classList.add('active');
      if (bridgeStatusText) bridgeStatusText.textContent = 'Connected';
    } else {
      bridgeStatus.classList.remove('active');
      bridgeText.textContent = 'VS Code ✗';
      bridgeStatusSettings?.classList.remove('active');
      if (bridgeStatusText) bridgeStatusText.textContent = 'Disconnected';
    }
    if (response?.port && bridgePort) {
      bridgePort.value = response.port;
    }
  } catch (e) {
    console.log('Bridge status check failed:', e);
  }

  // Load exclusion settings
  await loadExclusionSettings();
}

async function loadExclusionSettings() {
  try {
    const response = await chrome.runtime.sendMessage({ type: 'GET_EXCLUSION_SETTINGS' });
    if (response) {
      // Resource types
      if (excludeFont) excludeFont.checked = response.resourceTypes?.Font ?? true;
      if (excludeImage) excludeImage.checked = response.resourceTypes?.Image ?? true;
      if (excludeStylesheet) excludeStylesheet.checked = response.resourceTypes?.Stylesheet ?? false;
      if (excludeScript) excludeScript.checked = response.resourceTypes?.Script ?? false;
      if (excludeMedia) excludeMedia.checked = response.resourceTypes?.Media ?? true;
      // Patterns
      if (excludeBase64) excludeBase64.checked = response.patterns?.base64 ?? true;
      if (excludeSourcemaps) excludeSourcemaps.checked = response.patterns?.sourcemaps ?? true;
    }
  } catch (e) {
    console.log('Failed to load exclusion settings:', e);
  }
}

async function saveExclusionSettings() {
  const resourceTypes = {
    Font: excludeFont?.checked ?? true,
    Image: excludeImage?.checked ?? true,
    Stylesheet: excludeStylesheet?.checked ?? false,
    Script: excludeScript?.checked ?? false,
    Media: excludeMedia?.checked ?? true
  };

  const patterns = {
    base64: excludeBase64?.checked ?? true,
    fonts: excludeFont?.checked ?? true,
    images: excludeImage?.checked ?? true,
    sourcemaps: excludeSourcemaps?.checked ?? true
  };

  await chrome.runtime.sendMessage({
    type: 'SET_EXCLUSION_SETTINGS',
    resourceTypes,
    patterns
  });

  showToast('Filters saved');
}

// ============ DATA LOADING ============

async function loadAllData() {
  await loadErrors();
  await loadNetwork();
}

async function loadErrors() {
  try {
    const response = await chrome.tabs.sendMessage(currentTab.id, { type: 'GET_ERRORS' });
    currentErrors = response?.errors || [];
  } catch {
    try {
      const response = await chrome.runtime.sendMessage({ 
        type: 'GET_TAB_ERRORS', 
        tabId: currentTab.id 
      });
      currentErrors = response?.errors || [];
    } catch {
      currentErrors = [];
    }
  }
  renderConsole();
}

async function loadNetwork() {
  try {
    const response = await chrome.runtime.sendMessage({ 
      type: 'GET_TAB_NETWORK', 
      tabId: currentTab.id 
    });
    currentNetwork = response?.requests || [];
    
    if (currentNetwork.length > 0) {
      networkStatus.classList.add('active');
      networkText.textContent = 'Network ✓';
    }
  } catch {
    currentNetwork = [];
  }
  renderNetwork();
}

// ============ RENDERING ============

function renderConsole() {
  const showWarns = includeWarnings.checked;
  const showStack = includeStack.checked;
  const filter = consoleFilter.value.toLowerCase();
  
  let filtered = currentErrors;
  if (!showWarns) {
    filtered = filtered.filter(e => e.raw?.type !== 'warn');
  }
  if (filter) {
    filtered = filtered.filter(e => 
      (e.cleaned || '').toLowerCase().includes(filter) ||
      (e.raw?.message || '').toLowerCase().includes(filter)
    );
  }
  
  // Update badge
  consoleBadge.textContent = currentErrors.length;
  
  if (filtered.length === 0) {
    consoleContainer.innerHTML = `
      <div class="no-items">
        <div class="no-items-icon">✓</div>
        <div>No console errors captured</div>
      </div>
    `;
    return;
  }
  
  consoleContainer.innerHTML = filtered.map((error, idx) => {
    const type = error.raw?.type || 'error';
    const time = new Date(error.timestamp).toLocaleTimeString();
    const message = escapeHtml(error.cleaned || error.raw?.message || 'Unknown error');
    
    let details = '';
    if (showStack && error.raw?.stack) {
      details = `<div class="item-details"><pre>${escapeHtml(error.raw.stack)}</pre></div>`;
    }
    
    return `
      <div class="item ${type}">
        <div class="item-header">
          <span class="item-type ${type}">${type}</span>
          <span class="item-time">${time}</span>
        </div>
        <div class="item-message">${message}</div>
        ${details}
      </div>
    `;
  }).join('');
}

function renderNetwork() {
  const requests = showRequests.checked;
  const responses = showResponses.checked;
  const fetchOnly = onlyFetch.checked;
  const errorsOnly = onlyErrors.checked;
  const filter = networkFilter.value.toLowerCase();
  
  let filtered = currentNetwork;
  
  // Filter by type
  filtered = filtered.filter(item => {
    if (item.type === 'request' && !requests) return false;
    if (item.type === 'response' && !responses) return false;
    return true;
  });
  
  // Filter fetch/XHR only
  if (fetchOnly) {
    filtered = filtered.filter(item => 
      item.resourceType === 'Fetch' || 
      item.resourceType === 'XHR' ||
      item.type === 'response' || 
      item.type === 'failure'
    );
  }
  
  // Filter errors only
  if (errorsOnly) {
    filtered = filtered.filter(item => 
      item.type === 'failure' || 
      (item.type === 'response' && item.status >= 400)
    );
  }
  
  // URL filter
  if (filter) {
    filtered = filtered.filter(item => 
      (item.url || '').toLowerCase().includes(filter)
    );
  }
  
  // Update badge
  const failedCount = currentNetwork.filter(r => 
    r.type === 'failure' || (r.type === 'response' && r.status >= 400)
  ).length;
  networkBadge.textContent = currentNetwork.length;
  if (failedCount > 0) {
    networkBadge.classList.remove('warn');
    networkBadge.classList.add('error');
  }
  
  if (filtered.length === 0) {
    const hasData = currentNetwork.length > 0;
    networkContainer.innerHTML = `
      <div class="no-items">
        <div class="no-items-icon">${hasData ? '🔍' : '📡'}</div>
        <div>${hasData ? 'No matching requests' : 'No network requests captured'}</div>
        ${!hasData ? '<button class="btn-test" id="startCaptureBtn" style="margin-top: 12px;">▶ Start Capture</button>' : ''}
      </div>
    `;
    
    // Reattach event listener
    const btn = document.getElementById('startCaptureBtn');
    if (btn) btn.addEventListener('click', startNetworkCapture);
    return;
  }
  
  networkContainer.innerHTML = filtered.map(item => {
    const time = new Date(item.timestamp).toLocaleTimeString();
    
    if (item.type === 'request') {
      const shortUrl = truncateUrl(item.url);
      return `
        <div class="item request">
          <div class="item-header">
            <span>
              <span class="method-badge ${item.method}">${item.method}</span>
              <span class="item-type request">REQUEST</span>
            </span>
            <span class="item-time">${time}</span>
          </div>
          <div class="item-message">${escapeHtml(shortUrl)}</div>
          ${item.postData ? `<div class="item-details"><pre>${escapeHtml(truncateBody(item.postData))}</pre></div>` : ''}
        </div>
      `;
    }
    
    if (item.type === 'response') {
      const shortUrl = truncateUrl(item.url);
      const statusClass = item.status < 300 ? 'success' : item.status < 400 ? 'redirect' : 'error';
      const itemClass = item.status >= 400 ? 'response error' : 'response';
      
      return `
        <div class="item ${itemClass}">
          <div class="item-header">
            <span>
              <span class="status-badge ${statusClass}">${item.status}</span>
              <span class="item-type response">RESPONSE</span>
            </span>
            <span class="item-time">${time}</span>
          </div>
          <div class="item-message">${escapeHtml(shortUrl)}</div>
          ${item.body ? `<div class="item-details"><pre>${escapeHtml(truncateBody(item.body))}</pre></div>` : ''}
        </div>
      `;
    }
    
    if (item.type === 'failure') {
      return `
        <div class="item failure">
          <div class="item-header">
            <span class="item-type failure">FAILED</span>
            <span class="item-time">${time}</span>
          </div>
          <div class="item-message">${escapeHtml(item.errorText || 'Request failed')}</div>
        </div>
      `;
    }
    
    return '';
  }).join('');
}

// ============ ACTIONS ============

async function startNetworkCapture() {
  try {
    await chrome.runtime.sendMessage({ 
      type: 'START_NETWORK_CAPTURE', 
      tabId: currentTab.id 
    });
    networkStatus.classList.add('active');
    networkText.textContent = 'Network ✓';
    showToast('Network capture started');
  } catch (e) {
    showToast('Failed to start: ' + e.message);
  }
}

async function triggerTestError() {
  try {
    await chrome.scripting.executeScript({
      target: { tabId: currentTab.id },
      func: () => {
        console.error('[TEST] Test error from Console for Claude');
        console.warn('[TEST] Test warning from Console for Claude');
        
        // Test fetch
        fetch('/api/test-endpoint-that-does-not-exist')
          .catch(() => console.error('[TEST] Fetch error test'));
      }
    });
    showToast('Test triggered!');
    setTimeout(loadAllData, 500);
  } catch (e) {
    showToast('Failed: ' + e.message);
  }
}

async function clearAll() {
  await chrome.runtime.sendMessage({ type: 'CLEAR_TAB_ERRORS', tabId: currentTab.id });
  await chrome.runtime.sendMessage({ type: 'CLEAR_TAB_NETWORK', tabId: currentTab.id });
  await chrome.tabs.sendMessage(currentTab.id, { type: 'CLEAR_ERRORS' }).catch(() => {});
  
  currentErrors = [];
  currentNetwork = [];
  renderConsole();
  renderNetwork();
  showToast('Cleared');
}

function generateOutput() {
  const format = formatSelect.value;
  const activeTab = document.querySelector('.tab.active')?.dataset.tab || 'console';
  
  const data = {
    page: currentTab?.url || 'Unknown',
    timestamp: new Date().toISOString(),
    errors: currentErrors.map(e => ({
      type: e.raw?.type,
      message: e.cleaned,
      timestamp: e.timestamp
    })),
    network: currentNetwork.map(n => ({
      type: n.type,
      method: n.method,
      url: n.url,
      status: n.status,
      body: n.body || n.postData,
      timestamp: n.timestamp
    }))
  };
  
  if (format === 'json') {
    return JSON.stringify(data, null, 2);
  }
  
  if (format === 'plain') {
    let output = `Page: ${data.page}\n`;
    output += `Captured: ${data.timestamp}\n\n`;
    
    if (data.errors.length > 0) {
      output += `=== CONSOLE ERRORS (${data.errors.length}) ===\n\n`;
      data.errors.forEach((e, i) => {
        output += `[${i + 1}] ${e.type?.toUpperCase() || 'ERROR'}\n`;
        output += `${e.message}\n\n`;
      });
    }
    
    if (data.network.length > 0) {
      output += `=== NETWORK REQUESTS (${data.network.length}) ===\n\n`;
      data.network.forEach((n, i) => {
        if (n.type === 'request') {
          output += `[${i + 1}] ${n.method} ${n.url}\n`;
          if (n.body) output += `Body: ${n.body}\n`;
        } else if (n.type === 'response') {
          output += `[${i + 1}] ${n.status} ${n.url}\n`;
          if (n.body) output += `Response: ${n.body}\n`;
        }
        output += '\n';
      });
    }
    
    return output;
  }
  
  // Claude format (markdown)
  let output = `## Browser Debug Data\n\n`;
  output += `**Page:** ${data.page}\n`;
  output += `**Captured:** ${data.timestamp}\n\n`;
  
  if (data.errors.length > 0) {
    output += `### Console Errors (${data.errors.length})\n\n`;
    data.errors.forEach((e, i) => {
      output += `**${i + 1}. [${e.type?.toUpperCase() || 'ERROR'}]**\n`;
      output += '```\n' + e.message + '\n```\n\n';
    });
  }
  
  if (data.network.length > 0) {
    output += `### Network Requests (${data.network.length})\n\n`;
    
    // Group by request ID for cleaner output
    const requests = data.network.filter(n => n.type === 'request');
    const responses = data.network.filter(n => n.type === 'response');
    const failures = data.network.filter(n => n.type === 'failure');
    
    if (failures.length > 0) {
      output += `#### ❌ Failed Requests\n\n`;
      failures.forEach(f => {
        output += `- ${f.errorText || 'Unknown error'}\n`;
      });
      output += '\n';
    }
    
    const errorResponses = responses.filter(r => r.status >= 400);
    if (errorResponses.length > 0) {
      output += `#### ⚠️ Error Responses\n\n`;
      errorResponses.forEach(r => {
        output += `**${r.status}** \`${r.method || 'GET'} ${truncateUrl(r.url)}\`\n`;
        if (r.body) {
          output += '```json\n' + truncateBody(r.body) + '\n```\n';
        }
        output += '\n';
      });
    }
    
    // Show recent requests
    const recentRequests = requests.slice(-10);
    if (recentRequests.length > 0) {
      output += `#### Recent Requests\n\n`;
      recentRequests.forEach(req => {
        const response = responses.find(r => r.url === req.url);
        const status = response ? `→ ${response.status}` : '→ pending';
        output += `- \`${req.method}\` ${truncateUrl(req.url)} ${status}\n`;
      });
    }
  }
  
  return output;
}

async function copyToClipboard() {
  const output = generateOutput();
  
  try {
    await navigator.clipboard.writeText(output);
    showToast('Copied!');
  } catch {
    const textarea = document.createElement('textarea');
    textarea.value = output;
    document.body.appendChild(textarea);
    textarea.select();
    document.execCommand('copy');
    document.body.removeChild(textarea);
    showToast('Copied!');
  }
}

// ============ EVENT LISTENERS ============

function setupEventListeners() {
  // Tab switching
  tabs.forEach(tab => {
    tab.addEventListener('click', () => {
      tabs.forEach(t => t.classList.remove('active'));
      tabContents.forEach(c => c.classList.remove('active'));
      
      tab.classList.add('active');
      const tabName = tab.dataset.tab;
      document.getElementById(tabName + 'Tab')?.classList.add('active');
    });
  });
  
  // Buttons
  copyBtn.addEventListener('click', copyToClipboard);
  clearBtn.addEventListener('click', clearAll);
  refreshBtn.addEventListener('click', loadAllData);
  testBtn.addEventListener('click', triggerTestError);
  
  // Console options
  includeWarnings.addEventListener('change', renderConsole);
  includeStack.addEventListener('change', renderConsole);
  consoleFilter.addEventListener('input', renderConsole);
  
  // Network options
  showRequests.addEventListener('change', renderNetwork);
  showResponses.addEventListener('change', renderNetwork);
  onlyFetch.addEventListener('change', renderNetwork);
  onlyErrors.addEventListener('change', renderNetwork);
  networkFilter.addEventListener('input', renderNetwork);
  
  // Bridge settings
  reconnectBtn?.addEventListener('click', async () => {
    const port = parseInt(bridgePort.value) || 9876;
    await chrome.runtime.sendMessage({ type: 'SET_BRIDGE_PORT', port });
    showToast('Reconnecting...');
    setTimeout(checkAllStatus, 1000);
  });
  
  // Start capture button (if exists)
  startCaptureBtn?.addEventListener('click', startNetworkCapture);

  // Exclusion settings
  excludeFont?.addEventListener('change', saveExclusionSettings);
  excludeImage?.addEventListener('change', saveExclusionSettings);
  excludeStylesheet?.addEventListener('change', saveExclusionSettings);
  excludeScript?.addEventListener('change', saveExclusionSettings);
  excludeMedia?.addEventListener('change', saveExclusionSettings);
  excludeBase64?.addEventListener('change', saveExclusionSettings);
  excludeSourcemaps?.addEventListener('change', saveExclusionSettings);
}

// ============ UTILITIES ============

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text || '';
  return div.innerHTML;
}

function truncateUrl(url) {
  if (!url) return '';
  try {
    const u = new URL(url);
    return u.pathname + u.search;
  } catch {
    return url.substring(0, 80);
  }
}

function truncateBody(body) {
  if (!body) return '';
  if (body.length > 500) {
    return body.substring(0, 500) + '...';
  }
  return body;
}

function showToast(message) {
  toast.textContent = message;
  toast.classList.add('show');
  setTimeout(() => toast.classList.remove('show'), 2000);
}

// Initialize
init();
