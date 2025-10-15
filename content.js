// Content script: captures selection and renders overlay UI

const OVERLAY_ID = "ai-analyze-overlay";

function getSelectionWithRect() {
  const selection = window.getSelection();
  if (!selection || selection.rangeCount === 0) return { text: "", rect: null };
  const range = selection.getRangeAt(0);
  const text = selection.toString();
  let rect = null;
  try {
    const r = range.getBoundingClientRect();
    rect = { top: r.top + window.scrollY, left: r.left + window.scrollX, bottom: r.bottom + window.scrollY, right: r.right + window.scrollX };
  } catch (_) {}
  return { text, rect };
}

function ensureOverlayContainer() {
  let el = document.getElementById(OVERLAY_ID);
  if (el) return el;
  el = document.createElement("div");
  el.id = OVERLAY_ID;
  el.style.opacity = "1";
  el.style.transition = "opacity 0.3s ease-in";
  document.documentElement.appendChild(el);
  return el;
}

function isOverlayVisible() {
  const el = document.getElementById(OVERLAY_ID);
  return el && el.style.display !== 'none' && el.children.length > 0;
}

function closeOverlay() {
  const el = document.getElementById(OVERLAY_ID);
  if (el) {
    // Add fade out animation
    el.style.opacity = "0";
    el.style.transition = "opacity 0.5s ease-out";
    
    // Remove element after animation completes
    setTimeout(() => {
      el.remove();
    }, 500);
  }
}

function positionOverlay(el, rect) {
  // Position in bottom-right corner of the browser window
  el.style.position = "fixed";
  el.style.bottom = "20px";
  el.style.right = "20px";
  el.style.top = "auto";
  el.style.left = "auto";
}

function getCurrentDateTime() {
  const now = new Date();
  const options = { 
    month: 'short', 
    day: 'numeric',
    hour: 'numeric', 
    minute: '2-digit',
    hour12: true 
  };
  return now.toLocaleDateString('en-US', options);
}

function renderOverlayLoading(rect) {
  const container = ensureOverlayContainer();
  container.innerHTML = "";
  const box = document.createElement("div");
  box.className = "ai-analyze-box";
  const header = document.createElement("div");
  header.className = "ai-analyze-header";
  
  // Create header with title and timestamp
  const headerContent = document.createElement("div");
  headerContent.style.display = "flex";
  headerContent.style.justifyContent = "space-between";
  headerContent.style.alignItems = "center";
  headerContent.style.width = "100%";
  
  const title = document.createElement("span");
  title.textContent = "Analyzing selection…";
  
  const timestamp = document.createElement("span");
  timestamp.className = "ai-analyze-timestamp";
  timestamp.textContent = getCurrentDateTime();
  
  headerContent.appendChild(title);
  headerContent.appendChild(timestamp);
  header.appendChild(headerContent);
  
  const body = document.createElement("div");
  body.className = "ai-analyze-body";
  
  // Create loading content with spinner
  const loadingContent = document.createElement("div");
  loadingContent.style.display = "flex";
  loadingContent.style.alignItems = "center";
  loadingContent.style.justifyContent = "center";
  
  const spinner = document.createElement("div");
  spinner.className = "ai-analyze-loading-spinner";
  
  const text = document.createElement("span");
  text.textContent = "Please wait";
  
  loadingContent.appendChild(spinner);
  loadingContent.appendChild(text);
  body.appendChild(loadingContent);
  
  const actions = document.createElement("div");
  actions.className = "ai-analyze-actions";
  const closeBtn = document.createElement("button");
  closeBtn.textContent = "Close";
  closeBtn.addEventListener("click", () => container.remove());
  actions.appendChild(closeBtn);
  box.appendChild(header);
  box.appendChild(body);
  box.appendChild(actions);
  container.appendChild(box);
  positionOverlay(container);
}

function loadPlotly() {
  return new Promise((resolve, reject) => {
    if (window.Plotly) {
      resolve();
      return;
    }
    
    // Check if script is already being loaded
    if (document.querySelector('script[src*="plotly"]')) {
      // Wait for existing script to load
      const checkInterval = setInterval(() => {
        if (window.Plotly) {
          clearInterval(checkInterval);
          resolve();
        }
      }, 100);
      
      // Timeout after 10 seconds
      setTimeout(() => {
        clearInterval(checkInterval);
        reject(new Error('Plotly loading timeout'));
      }, 10000);
      return;
    }
    
    const script = document.createElement('script');
    script.src = 'https://cdn.plot.ly/plotly-latest.min.js';
    script.crossOrigin = 'anonymous';
    script.onload = () => {
      console.log('Plotly loaded successfully');
      resolve();
    };
    script.onerror = (error) => {
      console.error('Failed to load Plotly:', error);
      reject(new Error('Failed to load Plotly library'));
    };
    
    // Add to head
    document.head.appendChild(script);
  });
}

function renderChart(plotlyCode) {
  return new Promise(async (resolve) => {
    try {
      await loadPlotly();
      
      // Create a container for the chart
      const chartContainer = document.createElement('div');
      chartContainer.style.width = '100%';
      chartContainer.style.height = '400px';
      chartContainer.style.margin = '10px 0';
      chartContainer.style.border = '1px solid rgba(255,255,255,0.2)';
      chartContainer.style.borderRadius = '4px';
      chartContainer.style.background = '#1a1a1a';
      
      // Execute the plotly code
      try {
        // Create a safe execution context
        const func = new Function('Plotly', 'numpy', plotlyCode);
        const numpy = {
          linspace: (start, stop, num) => {
            const step = (stop - start) / (num - 1);
            return Array.from({length: num}, (_, i) => start + step * i);
          },
          array: (arr) => arr,
          sin: Math.sin,
          cos: Math.cos,
          exp: Math.exp,
          log: Math.log,
          sqrt: Math.sqrt,
          pi: Math.PI,
          e: Math.E,
          arange: (start, stop, step = 1) => {
            const result = [];
            for (let i = start; i < stop; i += step) {
              result.push(i);
            }
            return result;
          }
        };
        
        // Execute the function and wait for it to complete
        const result = await func(Plotly, numpy);
        
        // If the function returns a promise, wait for it
        if (result && typeof result.then === 'function') {
          await result;
        }
        
        resolve(chartContainer);
      } catch (error) {
        console.error('Chart execution error:', error);
        chartContainer.innerHTML = `<div style="padding: 20px; text-align: center; color: #ff6b6b; font-family: Inter, sans-serif;">Chart Error: ${error.message}</div>`;
        resolve(chartContainer);
      }
    } catch (error) {
      console.error('Plotly loading error:', error);
      const errorDiv = document.createElement('div');
      errorDiv.innerHTML = `<div style="padding: 20px; text-align: center; color: #ff6b6b; font-family: Inter, sans-serif;">Failed to load chart library: ${error.message}</div>`;
      resolve(errorDiv);
    }
  });
}

function formatAIResponse(content) {
  if (!content) return "";
  
  // Filter out double asterisks for better readability
  const cleanedContent = content.replace(/\*\*/g, '');
  
  // Check for chart blocks
  const chartRegex = /\[CHART: plotly_code\]\s*([\s\S]*?)\s*\[END_CHART\]/g;
  const chartMatches = [...cleanedContent.matchAll(chartRegex)];
  
  if (chartMatches.length > 0) {
    // Process content with charts
    return processContentWithCharts(cleanedContent, chartMatches);
  }
  
  // Regular text processing without charts
  return processRegularContent(cleanedContent);
}

function processContentWithCharts(content, chartMatches) {
  const parts = [];
  let lastIndex = 0;
  
  for (const match of chartMatches) {
    // Add text before chart
    const beforeChart = content.substring(lastIndex, match.index).trim();
    if (beforeChart) {
      parts.push(processRegularContent(beforeChart));
    }
    
    // Add chart placeholder
    const chartId = `chart-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    parts.push(`<div id="${chartId}" class="chart-container"></div>`);
    
    // Store chart code for later execution
    window.chartQueue = window.chartQueue || [];
    window.chartQueue.push({
      id: chartId,
      code: match[1].trim()
    });
    
    lastIndex = match.index + match[0].length;
  }
  
  // Add remaining text after last chart
  const afterLastChart = content.substring(lastIndex).trim();
  if (afterLastChart) {
    parts.push(processRegularContent(afterLastChart));
  }
  
  return parts.join('<br>');
}

function processRegularContent(content) {
  // Split content into lines
  const lines = content.split('\n');
  const formattedLines = [];
  
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    
    // Check if this line looks like a category/header (starts with common patterns)
    const isCategory = /^[•\-\*]\s*[A-Z]/.test(line) || 
                      /^[A-Z][^:]*:$/.test(line) || 
                      /^[A-Z][^:]*\s*$/.test(line) ||
                      /^\d+\.\s*[A-Z]/.test(line);
    
    // Check if this line is a final answer (common patterns)
    const isFinalAnswer = /^Final Answer/i.test(line) || 
                         /^Answer/i.test(line) || 
                         /^Solution/i.test(line) ||
                         /^Result/i.test(line) ||
                         /^x\s*=\s*/.test(line) ||
                         /^y\s*=\s*/.test(line) ||
                         /^z\s*=\s*/.test(line) ||
                         /^[a-zA-Z]\s*=\s*/.test(line);
    
    // Check if this line is verification (common patterns)
    const isVerification = /^Verification/i.test(line) || 
                          /^Check/i.test(line) || 
                          /^Verify/i.test(line) ||
                          /^Substitute/i.test(line) ||
                          /^Plugging/i.test(line);
    
    if (isCategory && formattedLines.length > 0) {
      // Add blank line before category (except for first category)
      formattedLines.push('<br>');
    }
    
    if (isCategory) {
      // Keep category as regular text (no bold)
      formattedLines.push(line);
    } else if (isFinalAnswer) {
      // Make final answer bold
      formattedLines.push(`<strong>${line}</strong>`);
    } else if (isVerification) {
      // Make verification italic
      formattedLines.push(`<em>${line}</em>`);
    } else if (line) {
      // Regular content line
      formattedLines.push(line);
    } else {
      // Empty line
      formattedLines.push('<br>');
    }
  }
  
  return formattedLines.join('<br>');
}

async function renderCharts() {
  if (!window.chartQueue || window.chartQueue.length === 0) return;
  
  for (const chart of window.chartQueue) {
    const container = document.getElementById(chart.id);
    if (container) {
      try {
        const chartElement = await renderChart(chart.code);
        container.appendChild(chartElement);
      } catch (error) {
        console.error('Chart rendering failed:', error);
        // Create a fallback message
        const fallbackDiv = document.createElement('div');
        fallbackDiv.innerHTML = `
          <div style="padding: 20px; text-align: center; color: #888888; font-family: Inter, sans-serif; border: 1px solid rgba(255,255,255,0.2); border-radius: 4px; background: #1a1a1a;">
            <div style="margin-bottom: 10px;">📊 Chart Preview</div>
            <div style="font-size: 12px;">Interactive chart would appear here</div>
            <div style="font-size: 10px; margin-top: 5px; color: #666;">Chart library loading issue</div>
          </div>
        `;
        container.appendChild(fallbackDiv);
      }
    }
  }
  
  // Clear the queue
  window.chartQueue = [];
}

function renderBubble() {
  const container = ensureOverlayContainer();
  container.innerHTML = "";
  const bubble = document.createElement("div");
  bubble.className = "ai-analyze-bubble";
  bubble.textContent = "I am your AI companion!";
  container.appendChild(bubble);
  
  // Position bubble in bottom-right corner
  bubble.style.position = "fixed";
  bubble.style.bottom = "20px";
  bubble.style.right = "20px";
  bubble.style.zIndex = "2147483647";
  
  // Fade out after 3 seconds
  setTimeout(() => {
    bubble.style.opacity = "0";
    bubble.style.transition = "opacity 0.5s ease-out";
    setTimeout(() => {
      container.remove();
    }, 500);
  }, 3000);
}

function renderOverlayResult(content, isError, rect) {
  const container = ensureOverlayContainer();
  container.innerHTML = "";
  const box = document.createElement("div");
  box.className = "ai-analyze-box";
  const header = document.createElement("div");
  header.className = "ai-analyze-header";
  
  // Create header with title and timestamp
  const headerContent = document.createElement("div");
  headerContent.style.display = "flex";
  headerContent.style.justifyContent = "space-between";
  headerContent.style.alignItems = "center";
  headerContent.style.width = "100%";
  
  const title = document.createElement("span");
  title.textContent = isError ? "Error" : "AI Analysis";
  
  const timestamp = document.createElement("span");
  timestamp.className = "ai-analyze-timestamp";
  timestamp.textContent = getCurrentDateTime();
  
  headerContent.appendChild(title);
  headerContent.appendChild(timestamp);
  header.appendChild(headerContent);
  
  const body = document.createElement("div");
  body.className = "ai-analyze-body";
  
  if (isError) {
    body.textContent = content;
  } else {
    body.innerHTML = formatAIResponse(content);
    // Render charts after content is displayed
    setTimeout(() => renderCharts(), 100);
  }
  
  const actions = document.createElement("div");
  actions.className = "ai-analyze-actions";
  const copyBtn = document.createElement("button");
  copyBtn.textContent = "Copy";
  copyBtn.addEventListener("click", async () => {
    try {
      await navigator.clipboard.writeText(content);
      copyBtn.textContent = "Copied";
      setTimeout(() => (copyBtn.textContent = "Copy"), 1200);
    } catch (_) {}
  });
  const closeBtn = document.createElement("button");
  closeBtn.textContent = "Close";
  closeBtn.addEventListener("click", () => container.remove());
  actions.appendChild(copyBtn);
  actions.appendChild(closeBtn);
  box.appendChild(header);
  box.appendChild(body);
  box.appendChild(actions);
  container.appendChild(box);
  positionOverlay(container);
}

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message && message.type === "GET_SELECTION_AND_SHOW_LOADING") {
    const { text, rect } = getSelectionWithRect();
    if (text && text.trim()) renderOverlayLoading(rect);
    sendResponse({ text, rect });
    return true;
  }
  if (message && message.type === "SHOW_RESULT") {
    renderOverlayResult(message.content || "(empty)", false, null);
    return;
  }
  if (message && message.type === "SHOW_ERROR") {
    renderOverlayResult(message.error || "Unknown error", true, null);
    return;
  }
  if (message && message.type === "SHOW_BUBBLE") {
    renderBubble();
    return;
  }
  if (message && message.type === "CHECK_OVERLAY_VISIBLE") {
    sendResponse({ visible: isOverlayVisible() });
    return true;
  }
  if (message && message.type === "CLOSE_OVERLAY") {
    closeOverlay();
    return;
  }
});
