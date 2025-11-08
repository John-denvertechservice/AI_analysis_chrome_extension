// Content script: captures selection and renders overlay UI

const OVERLAY_ID = "ai-analyze-overlay";
let isAnalysisInProgress = false;
let lastAnalyzedText = "";
let lastAnalyzedImage = null;
const WORD_LIMIT = 50;
const SUPPORTED_FILE_MIME_TYPES = [
  "image/png",
  "image/jpeg",
  "image/webp",
  "image/gif",
  "image/heic",
  "image/heif"
];

// Lightweight in-page hotkey to trigger analysis without relying on Chrome's
// command shortcut registration. Works when the page has focus.
// Uses Alt+Shift+A on all platforms (Option+Shift+A on macOS).
const ENABLE_HOTKEY_LOGGING = false; // Feature flag for debugging

(function setupInPageHotkey() {
  // Guard against duplicate listeners on hot-reload
  if (window.__aiAnalyzeHotkeyBound) return;
  window.__aiAnalyzeHotkeyBound = true;

  document.addEventListener("keydown", (e) => {
    try {
      // Ignore if modifier involves Meta (Cmd) or Ctrl to reduce conflicts
      if (!e) return;
      const isAltShiftA = e.altKey && e.shiftKey && !e.metaKey && !e.ctrlKey && (
        e.code === "KeyA" || (typeof e.key === "string" && e.key.toLowerCase() === "a")
      );
      if (!isAltShiftA) return;

      // Ignore if user is typing in editable fields
      const target = e.target;
      if (target && (
        target.tagName === "INPUT" ||
        target.tagName === "TEXTAREA" ||
        target.isContentEditable ||
        target.closest("[contenteditable='true']")
      )) {
        if (ENABLE_HOTKEY_LOGGING) console.log("[AI Analyze] Hotkey ignored: in editable field");
        return;
      }

      // Check if there's a selection or selected image
      const selection = window.getSelection();
      const hasTextSelection = selection && selection.toString().trim().length > 0;
      const hasImageSelection = getSelectedImage() !== null;

      if (!hasTextSelection && !hasImageSelection) {
        if (ENABLE_HOTKEY_LOGGING) console.log("[AI Analyze] Hotkey ignored: no selection");
        return;
      }

      // Prevent default to avoid site-level handlers taking over
      e.preventDefault();
      e.stopPropagation();

      if (ENABLE_HOTKEY_LOGGING) console.log("[AI Analyze] Hotkey triggered: Alt+Shift+A");

      // Ask background to analyze current selection in this tab
      chrome.runtime.sendMessage({ type: "TRIGGER_ANALYZE_SELECTION" });
    } catch (err) {
      if (ENABLE_HOTKEY_LOGGING) console.error("[AI Analyze] Hotkey error:", err);
    }
  }, true);
})();

function isSupportedFileType(mimeType) {
  if (!mimeType) return false;
  if (mimeType.startsWith("image/")) return true;
  return SUPPORTED_FILE_MIME_TYPES.includes(mimeType);
}

function classifyFileType(mimeType) {
  if (mimeType && mimeType.startsWith("image/")) return "image";
  return "unknown";
}

function readFileAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(reader.error || new Error("Failed to read file"));
    reader.readAsDataURL(file);
  });
}

function decodeDataUrl(dataUrl) {
  if (!dataUrl || typeof dataUrl !== "string") return null;
  const parts = dataUrl.split(",");
  return parts.length > 1 ? parts[1] : null;
}

function inferMimeTypeFromSrc(src) {
  if (!src || typeof src !== "string") return "";
  if (!src.startsWith("data:")) return "";
  const match = src.match(/^data:([^;]+);/);
  return match ? match[1] : "";
}

function formatFileSize(bytes) {
  if (!bytes || Number.isNaN(bytes)) return "";
  if (bytes < 1024) return `${bytes} B`;
  const kb = bytes / 1024;
  if (kb < 1024) return `${kb.toFixed(1)} KB`;
  const mb = kb / 1024;
  return `${mb.toFixed(1)} MB`;
}

function setupFileDropZone(element, onFileSelected) {
  if (!element) return;

  element.addEventListener("dragover", (event) => {
    event.preventDefault();
    element.classList.add("dragover");
  });

  element.addEventListener("dragleave", () => {
    element.classList.remove("dragover");
  });

  element.addEventListener("drop", (event) => {
    event.preventDefault();
    element.classList.remove("dragover");
    const files = event.dataTransfer?.files;
    if (files && files.length && onFileSelected) {
      onFileSelected(files[0]);
    }
  });
}

function createHiddenFileInput(onFileSelected) {
  const input = document.createElement("input");
  input.type = "file";
  input.accept = "image/*";
  input.style.display = "none";
  input.addEventListener("change", () => {
    const file = input.files && input.files[0];
    if (file && onFileSelected) {
      onFileSelected(file);
    }
    input.value = "";
  });
  return input;
}

function sendFileForAnalysis(filePayload) {
  return new Promise((resolve, reject) => {
    chrome.runtime.sendMessage(
      {
        type: "ANALYZE_FILE",
        fileData: filePayload
      },
      (response) => {
        if (chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message));
          return;
        }
        resolve(response);
      }
    );
  });
}

async function analyzeUserFile(file) {
  if (!file) return;

  const mimeType = file.type || "";
  if (!isSupportedFileType(mimeType)) {
    renderOverlayResult("Unsupported file type. Please upload an image.", true, null);
    return;
  }

  const category = classifyFileType(mimeType);
  let dataUrl;
  try {
    dataUrl = await readFileAsDataUrl(file);
  } catch (error) {
    renderOverlayResult(`Failed to read file: ${error.message || error}`, true, null);
    return;
  }

  const base64 = decodeDataUrl(dataUrl);
  if (!base64) {
    renderOverlayResult("Unable to process file contents.", true, null);
    return;
  }

  isAnalysisInProgress = true;
  renderOverlayLoading(null, category === "image" ? "image" : "file");

  try {
    const response = await sendFileForAnalysis({
      base64,
      mimeType: mimeType || "image/png",
      name: file.name || `uploaded-${Date.now()}`,
      size: file.size || 0
    });

    if (!response || !response.success) {
      const errorMessage = response?.error || "Analysis failed.";
      isAnalysisInProgress = false;
      renderImageAnalysis(
        {
          src: category === "image" ? dataUrl : "",
          mimeType,
          name: file.name || "Uploaded file",
          base64
        },
        errorMessage,
        true
      );
      return;
    }

    isAnalysisInProgress = false;
    renderImageAnalysis(
      {
        src: category === "image" ? dataUrl : "",
        mimeType,
        name: file.name || "Uploaded file",
        base64
      },
      response.content,
      false,
      response.conversationHistory || [],
      { originalCategory: category }
    );
  } catch (error) {
    isAnalysisInProgress = false;
    renderImageAnalysis(
      {
        src: category === "image" ? dataUrl : "",
        mimeType,
        name: file.name || "Uploaded file",
        base64
      },
      error.message || "Unexpected error during analysis.",
      true
    );
  }
}

function getSelectionWithRect() {
  const selection = window.getSelection();
  if (!selection || selection.rangeCount === 0) {
    // Check if there's a selected image
    const selectedImage = getSelectedImage();
    if (selectedImage) {
      return { 
        text: "", 
        rect: null, 
        image: selectedImage,
        type: "image"
      };
    }
    return { text: "", rect: null, type: "text" };
  }
  
  const range = selection.getRangeAt(0);
  const text = selection.toString();
  let rect = null;
  try {
    const r = range.getBoundingClientRect();
    rect = { top: r.top + window.scrollY, left: r.left + window.scrollX, bottom: r.bottom + window.scrollY, right: r.right + window.scrollX };
  } catch (_) {}
  
  // Check if selection contains an image
  const selectedImage = getSelectedImage();
  if (selectedImage) {
    return { 
      text, 
      rect, 
      image: selectedImage,
      type: "image"
    };
  }
  
  return { text, rect, type: "text" };
}

function getSelectedImage() {
  const selection = window.getSelection();
  if (!selection || selection.rangeCount === 0) return null;
  
  const range = selection.getRangeAt(0);
  const container = range.commonAncestorContainer;
  
  // Check if the selection is within an image
  let element = container.nodeType === Node.ELEMENT_NODE ? container : container.parentElement;
  
  while (element && element !== document.body) {
    if (element.tagName === 'IMG') {
      return {
        src: element.src,
        alt: element.alt || '',
        width: element.naturalWidth || element.width,
        height: element.naturalHeight || element.height,
        element: element
      };
    }
    element = element.parentElement;
  }
  
  return null;
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

function getOverlayState(container) {
  const target = container || document.getElementById(OVERLAY_ID);
  if (!target) return null;
  if (!target.__aiAnalyzeState) {
    target.__aiAnalyzeState = {
      conversationHistory: [],
      baseConversationLength: 0,
      originalContent: "",
      originalCategory: null,
      attachmentData: null
    };
  }
  return target.__aiAnalyzeState;
}

function resetOverlayState(container) {
  const state = getOverlayState(container || document.getElementById(OVERLAY_ID));
  if (!state) return null;
  state.conversationHistory = [];
  state.baseConversationLength = 0;
  state.originalContent = "";
  state.originalCategory = null;
  state.attachmentData = null;
  return state;
}

function normalizeConversationHistory(history) {
  if (!Array.isArray(history)) return [];
  return history
    .map((msg) => {
      if (!msg || typeof msg !== "object") return null;
      const role = typeof msg.role === "string" ? msg.role.trim().toLowerCase() : "";
      const content = typeof msg.content === "string" ? msg.content : "";
      if (!content || (role !== "user" && role !== "assistant")) return null;
      return { role, content };
    })
    .filter(Boolean);
}

function buildInitialConversationHistory(providedHistory, assistantContent, userContent) {
  const normalized = normalizeConversationHistory(providedHistory);
  if (normalized.length > 0) {
    return normalized;
  }

  const history = [];
  const userText = typeof userContent === "string" ? userContent.trim() : "";
  const assistantText = typeof assistantContent === "string" ? assistantContent.trim() : "";

  if (userText) {
    history.push({ role: "user", content: userText });
  }

  if (assistantText) {
    history.push({ role: "assistant", content: assistantText });
  }

  return history;
}

function describeAttachmentForHistory(attachment, originalCategory) {
  if (!attachment) return "";
  const details = [];
  if (attachment.name) details.push(attachment.name);
  else if (attachment.alt) details.push(attachment.alt);
  else if (attachment.mimeType) details.push(attachment.mimeType);
  else if (attachment.src && typeof attachment.src === "string") {
    try {
      const url = new URL(attachment.src);
      const lastSegment = url.pathname.split("/").filter(Boolean).pop();
      if (lastSegment) {
        details.push(lastSegment);
      } else {
        details.push(url.hostname);
      }
    } catch (_) {
      details.push("uploaded file");
    }
  } else {
    details.push("uploaded file");
  }

  const descriptor = details.join(" ").trim() || "uploaded file";
  const category = (originalCategory || attachment.mimeType || "").toLowerCase();
  if (category.includes("image")) {
    return `Analyze image: ${descriptor}`;
  }
  return `Analyze file: ${descriptor}`;
}

function renderConversationMessages(conversationDiv, history, skipCount) {
  if (!conversationDiv) return;
  const safeHistory = Array.isArray(history) ? history : [];
  const startIndex = Math.max(0, skipCount || 0);
  const displayMessages = safeHistory.slice(startIndex);

  conversationDiv.innerHTML = "";

  displayMessages.forEach((msg) => {
    if (!msg || typeof msg.content !== "string") return;
    if (msg.role === "user") {
      const messageDiv = document.createElement("div");
      messageDiv.className = `ai-analyze-message ${msg.role}`;
      messageDiv.textContent = msg.content;
      conversationDiv.appendChild(messageDiv);
    } else if (msg.role === "assistant") {
      const responseDiv = document.createElement("div");
      responseDiv.className = "ai-analyze-follow-up-response";
      responseDiv.innerHTML = formatAIResponse(msg.content);
      conversationDiv.appendChild(responseDiv);
    }
  });

  if (conversationDiv.parentElement) {
    conversationDiv.parentElement.scrollTop = conversationDiv.parentElement.scrollHeight;
  }
}

function isOverlayVisible() {
  const el = document.getElementById(OVERLAY_ID);
  return el && el.style.display !== 'none' && el.children.length > 0 && el.dataset.closing !== "true";
}

function closeOverlay() {
  const el = document.getElementById(OVERLAY_ID);
  if (el) {
    isAnalysisInProgress = false;
    el.dataset.closing = "true";
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
  // Position in bottom-right corner with margin
  el.style.position = "fixed";
  el.style.bottom = "20px";
  el.style.right = "20px";
  el.style.top = "auto";
  el.style.left = "auto";
  el.style.transform = "none";
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

function renderOverlayLoading(rect, type = "text") {
  const container = ensureOverlayContainer();
  container.innerHTML = "";
  const box = document.createElement("div");
  box.className = "ai-analyze-box";
  const header = document.createElement("div");
  header.className = "ai-analyze-header";
  
  // Create header with title and timestamp
  const headerContent = document.createElement("div");
  headerContent.className = "ai-analyze-header-content";
  
  const title = document.createElement("span");
  if (type === "image") {
    title.textContent = "Analyzing image…";
  } else if (type === "file") {
    title.textContent = "Analyzing file…";
  } else {
    title.textContent = "Analyzing";
  }
  
  const timestamp = document.createElement("span");
  timestamp.className = "ai-analyze-timestamp";
  timestamp.textContent = getCurrentDateTime();
  
  // Add minimize button
  const minimizeBtn = document.createElement("button");
  minimizeBtn.className = "ai-analyze-minimize-btn";
  minimizeBtn.innerHTML = "▼";
  minimizeBtn.title = "Minimize";
  
  headerContent.appendChild(title);
  headerContent.appendChild(timestamp);
  headerContent.appendChild(minimizeBtn);
  header.appendChild(headerContent);
  
  // Add minimize/maximize functionality
  addMinimizeMaximizeFunctionality(box, minimizeBtn);
  
  const body = document.createElement("div");
  body.className = "ai-analyze-body";
  
  // Create loading content with spinner
  const loadingContent = document.createElement("div");
  loadingContent.style.display = "flex";
  loadingContent.style.alignItems = "center";
  loadingContent.style.justifyContent = "center";
  loadingContent.style.gap = "10px";
  
  const spinner = document.createElement("div");
  spinner.className = "ai-analyze-loading-spinner";
  
  const text = document.createElement("span");
  text.textContent = "Please wait";
  text.style.color = "rgba(255, 255, 255, 0.8)";
  text.style.fontSize = "14px";
  
  loadingContent.appendChild(spinner);
  loadingContent.appendChild(text);
  body.appendChild(loadingContent);
  
  const actions = document.createElement("div");
  actions.className = "ai-analyze-actions";
  const closeBtn = document.createElement("button");
  closeBtn.textContent = "Close";
  closeBtn.addEventListener("click", () => {
    isAnalysisInProgress = false;
    container.remove();
  });
  actions.appendChild(closeBtn);
  box.appendChild(header);
  box.appendChild(body);
  box.appendChild(actions);
  container.appendChild(box);
  positionOverlay(container);
}



function detectFinalAnswer(content) {
  if (!content) return null;
  
  // Patterns to detect final answers
  const finalAnswerPatterns = [
    /Final Answer[:\s]*([^\n]+)/i,
    /Answer[:\s]*([^\n]+)/i,
    /Solution[:\s]*([^\n]+)/i,
    /Result[:\s]*([^\n]+)/i,
    /Conclusion[:\s]*([^\n]+)/i,
    /Therefore[,\s]*([^\n]+)/i,
    /So[,\s]*([^\n]+)/i,
    /Thus[,\s]*([^\n]+)/i,
    /In conclusion[,\s]*([^\n]+)/i,
    /The answer is[:\s]*([^\n]+)/i,
    /The solution is[:\s]*([^\n]+)/i,
    /The result is[:\s]*([^\n]+)/i,
    /x\s*=\s*([^\n]+)/i,
    /y\s*=\s*([^\n]+)/i,
    /z\s*=\s*([^\n]+)/i,
    /[a-zA-Z]\s*=\s*([^\n]+)/i
  ];
  
  for (const pattern of finalAnswerPatterns) {
    const match = content.match(pattern);
    if (match && match[1]) {
      const answer = match[1].trim();
      // Only return if the answer is substantial (more than just a word or two)
      if (answer.length > 3 && !answer.match(/^(is|are|was|were|the|a|an)$/i)) {
        return {
          text: answer,
          pattern: pattern.source,
          fullMatch: match[0]
        };
      }
    }
  }
  
  return null;
}

function convertExponentsToSuperscript(text) {
  if (!text) return text;
  
  // Check if KaTeX or MathJax is available
  if (typeof katex !== 'undefined' || typeof MathJax !== 'undefined') {
    // If math rendering library is available, use it
    // For now, fall through to regex-based transform
  }
  
  // Regex-based transform: convert patterns like a^2, x^10, a^7.5, b^5.4 to superscripts
  // Pattern: base^exponent where base is alphanumeric and exponent is a number (integer or decimal)
  // Avoid matching carets in normal prose by requiring the pattern to be in a mathematical context
  // Match: letter/number followed by ^ followed by number (with optional decimal), followed by non-alphanumeric or end of string
  return text.replace(/([A-Za-z0-9]+)\^(\d+(?:\.\d+)?)(?![A-Za-z0-9])/g, '$1<sup>$2</sup>');
}

function createFinalAnswerDisplay(answerText) {
  // First, convert mathematical exponents (like x^2) to superscripts
  // This must happen before stripping ^ characters
  let processedAnswer = convertExponentsToSuperscript(answerText);
  
  // Then strip any remaining ^ delimiter characters that aren't part of mathematical expressions
  // Since exponents are already converted to <sup> tags, we can safely remove remaining ^
  // This prevents truncation issues while preserving converted superscripts
  processedAnswer = processedAnswer
    .replace(/\^([^\n^<]+)\^/g, '$1') // Remove ^ wrapping (but not if it contains < which indicates HTML)
    .replace(/^\^+/gm, '') // Remove leading ^ at start of lines
    .replace(/\^+$/gm, '') // Remove trailing ^ at end of lines
    .replace(/\^/g, '') // Remove any remaining standalone ^ characters (exponents already converted)
    .trim();
  
  return `
    <div class="ai-analyze-final-answer">
      <div class="ai-analyze-final-answer-header">🎯 Final Answer</div>
      <div class="ai-analyze-final-answer-content">${processedAnswer}</div>
    </div>
  `;
}

function formatAIResponse(content) {
  if (!content) return "";
  
  // Filter out double asterisks for better readability
  let cleanedContent = content.replace(/\*\*/g, '');
  // Remove common markup artifacts that sometimes appear
  cleanedContent = cleanedContent
    // Strip fenced code blocks
    .replace(/```[\s\S]*?```/g, (m) => m.replace(/```/g, ''))
    // Strip inline code backticks
    .replace(/`([^`]+)`/g, '$1')
    // Strip LaTeX dollar math wrappers
    .replace(/\$\$([\s\S]*?)\$\$/g, '$1')
    .replace(/\$([^$]+)\$/g, '$1')
    // Strip LaTeX inline parens/brackets
    .replace(/\\\(|\\\)|\\\[|\\\]/g, '');
  
  // Strip ^ delimiter characters that wrap text (e.g., ^Final Answer:^ → Final Answer:)
  // This prevents ^ characters from cutting off answer text
  cleanedContent = cleanedContent.replace(/\^([^\n^]+)\^/g, '$1'); // Remove ^ wrapping
  cleanedContent = cleanedContent.replace(/^\^+/gm, ''); // Remove leading ^ at start of lines
  cleanedContent = cleanedContent.replace(/\^+$/gm, ''); // Remove trailing ^ at end of lines
  
  // Check for final answer
  const finalAnswer = detectFinalAnswer(cleanedContent);
  
  // Regular text processing
  // Typography: convert simple exponents/subscripts to HTML for readability
  const applyMathTypography = (txt) => {
    let out = txt;
    // Exponents like 3^4, x^2, y^10, a^7.5, b^5.4 (handles integers and decimals)
    out = convertExponentsToSuperscript(out);
    // Subscripts like x_1, a_10
    out = out.replace(/\b([A-Za-z])_(\d{1,3})\b/g, '$1<sub>$2</sub>');
    // Chemical style: H2O, CO2 (avoid changing within longer words)
    out = out.replace(/(?<![A-Za-z0-9])([A-Z][a-z]?)(\d{1,3})(?![A-Za-z0-9])/g, '$1<sub>$2</sub>');
    return out;
  };

  const processedContent = applyMathTypography(processRegularContent(cleanedContent));
  
  // If we found a final answer, prepend it to the content
  if (finalAnswer) {
    return createFinalAnswerDisplay(finalAnswer.text) + processedContent;
  }
  
  return processedContent;
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


function renderBubble() {
  const container = ensureOverlayContainer();
  container.innerHTML = "";
  const bubble = document.createElement("div");
  bubble.className = "ai-analyze-bubble";
  
  const message = document.createElement("div");
  message.className = "ai-analyze-bubble-text";
  message.textContent = "I am your AI companion! 🚀";

  const searchWrapper = document.createElement("form");
  searchWrapper.className = "ai-analyze-bubble-search";

  const searchInput = document.createElement("input");
  searchInput.type = "text";
  searchInput.placeholder = "search anything!";
  searchInput.setAttribute("aria-label", "Search anything");
  searchInput.autocomplete = "off";

  searchInput.addEventListener("input", () => {
    const words = searchInput.value.trim().split(/\s+/).filter(Boolean);
    if (words.length > WORD_LIMIT) {
      searchInput.value = words.slice(0, WORD_LIMIT).join(" ");
    }
  });

  searchWrapper.addEventListener("submit", (event) => {
    event.preventDefault();
    const query = searchInput.value.trim();
    if (!query) return;

    const existingOverlay = document.getElementById(OVERLAY_ID);
    if (existingOverlay) existingOverlay.remove();

    isAnalysisInProgress = true;
    renderOverlayLoading(null, "text");
    chrome.runtime.sendMessage({ type: "ANALYZE_TEXT_INPUT", text: query });
  });

  const searchButton = document.createElement("button");
  searchButton.type = "submit";
  searchButton.textContent = "Go";

  const uploadButton = document.createElement("button");
  uploadButton.type = "button";
  uploadButton.className = "ai-analyze-upload-trigger";
  uploadButton.textContent = "Upload image";

  const hiddenInput = createHiddenFileInput(analyzeUserFile);
  bubble.appendChild(hiddenInput);

  uploadButton.addEventListener("click", () => hiddenInput.click());

  searchWrapper.appendChild(searchInput);
  searchWrapper.appendChild(searchButton);
  searchWrapper.appendChild(uploadButton);

  const dropHint = document.createElement("div");
  dropHint.className = "ai-analyze-bubble-hint";
  dropHint.textContent = "Drag & drop an image to analyze instantly.";
  dropHint.addEventListener("click", () => hiddenInput.click());

  bubble.appendChild(message);
  bubble.appendChild(searchWrapper);
  bubble.appendChild(dropHint);
  container.appendChild(bubble);
  
  // Position bubble in bottom-right corner
  bubble.style.position = "fixed";
  bubble.style.bottom = "20px";
  bubble.style.right = "20px";
  bubble.style.zIndex = "2147483647";

  setupFileDropZone(bubble, analyzeUserFile);
  searchInput.focus();
}

function countWords(text) {
  return text.trim().split(/\s+/).filter(word => word.length > 0).length;
}

function isSameSelection(selection) {
  if (selection.type === "image" && selection.image) {
    return lastAnalyzedImage && 
           lastAnalyzedImage.src === selection.image.src &&
           lastAnalyzedImage.alt === selection.image.alt;
  } else if (selection.type === "text" && selection.text) {
    return lastAnalyzedText === selection.text.trim();
  }
  return false;
}

function updateLastAnalyzed(selection) {
  if (selection.type === "image" && selection.image) {
    lastAnalyzedImage = {
      src: selection.image.src,
      alt: selection.image.alt
    };
    lastAnalyzedText = "";
  } else if (selection.type === "text" && selection.text) {
    lastAnalyzedText = selection.text.trim();
    lastAnalyzedImage = null;
  }
}

function positionMenu(menu, button, box) {
  const buttonRect = button.getBoundingClientRect();
  const boxRect = box.getBoundingClientRect();
  const menuRect = menu.getBoundingClientRect();
  const viewportWidth = window.innerWidth;
  const viewportHeight = window.innerHeight;
  
  // Reset positioning
  menu.style.top = '';
  menu.style.bottom = '';
  menu.style.left = '';
  menu.style.right = '';
  
  // Position relative to button (button is in header, header is in box)
  const header = box.querySelector('.ai-analyze-header');
  const headerRect = header ? header.getBoundingClientRect() : boxRect;
  
  // Calculate position relative to box
  const buttonOffsetRight = boxRect.right - buttonRect.right;
  const buttonOffsetTop = buttonRect.top - boxRect.top;
  
  // Default: position below button, aligned to right
  let top = buttonOffsetTop + buttonRect.height + 4;
  let right = buttonOffsetRight;
  
  // Check if menu would overflow bottom of viewport
  const menuBottom = buttonRect.bottom + menuRect.height + 4;
  if (menuBottom > viewportHeight) {
    // Flip to above button
    top = buttonOffsetTop - menuRect.height - 4;
    menu.style.bottom = `${boxRect.height - buttonOffsetTop + 4}px`;
    menu.style.top = 'auto';
  } else {
    menu.style.top = `${top}px`;
    menu.style.bottom = 'auto';
  }
  
  // Check if menu would overflow right edge of viewport
  const menuRight = buttonRect.right;
  if (menuRight > viewportWidth - menuRect.width) {
    // Align to left edge of button instead
    const buttonOffsetLeft = buttonRect.left - boxRect.left;
    menu.style.right = 'auto';
    menu.style.left = `${buttonOffsetLeft}px`;
  } else {
    menu.style.right = `${right}px`;
    menu.style.left = 'auto';
  }
}

function addMinimizeMaximizeFunctionality(box, minimizeBtn) {
  let isMinimized = false;
  let menuVisible = false;
  let menu = null;
  
  function createMenu() {
    if (menu) return menu;
    
    menu = document.createElement('div');
    menu.className = 'ai-analyze-menu';
    menu.style.display = 'none';
    
    const menuItems = [
      { text: 'Minimize', action: () => toggleMinimize() },
      { text: 'Copy', action: () => copyContent(box) },
      { text: 'Close', action: () => closeOverlay(box) }
    ];
    
    menuItems.forEach(item => {
      const menuItem = document.createElement('div');
      menuItem.className = 'ai-analyze-menu-item';
      menuItem.textContent = item.text;
      menuItem.setAttribute('tabindex', '0');
      menuItem.addEventListener('click', (e) => {
        e.stopPropagation();
        item.action();
        hideMenu();
      });
      menuItem.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          e.stopPropagation();
          item.action();
          hideMenu();
        }
      });
      menu.appendChild(menuItem);
    });
    
    box.appendChild(menu);
    return menu;
  }
  
  function showMenu() {
    if (!menu) menu = createMenu();
    menu.style.display = 'block';
    menuVisible = true;
    
    // Position menu relative to button (need to measure after display)
    requestAnimationFrame(() => {
      positionMenu(menu, minimizeBtn, box);
    });
    
    // Close menu when clicking outside
    setTimeout(() => {
      document.addEventListener('click', hideMenuOnOutsideClick, true);
    }, 0);
  }
  
  function hideMenu() {
    if (menu) {
      menu.style.display = 'none';
      menuVisible = false;
    }
    document.removeEventListener('click', hideMenuOnOutsideClick, true);
  }
  
  function hideMenuOnOutsideClick(e) {
    if (menu && !menu.contains(e.target) && !minimizeBtn.contains(e.target)) {
      hideMenu();
    }
  }
  
  function toggleMinimize() {
    isMinimized = !isMinimized;
    if (isMinimized) {
      box.classList.add('minimized');
      minimizeBtn.innerHTML = "▲";
      minimizeBtn.title = "Maximize";
    } else {
      box.classList.remove('minimized');
      minimizeBtn.innerHTML = "▼";
      minimizeBtn.title = "Minimize";
    }
  }
  
  function copyContent(box) {
    const body = box.querySelector('.ai-analyze-body');
    if (body) {
      const text = body.textContent || body.innerText;
      navigator.clipboard.writeText(text).catch(() => {});
    }
  }
  
  function closeOverlay(box) {
    const container = box.closest('#ai-analyze-overlay');
    if (container) {
      isAnalysisInProgress = false;
      container.remove();
    }
  }
  
  minimizeBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    if (menuVisible) {
      hideMenu();
    } else {
      showMenu();
    }
  });
  
  // Also allow clicking the header to toggle minimize
  const header = box.querySelector('.ai-analyze-header');
  if (header) {
    header.addEventListener('click', (e) => {
      if (e.target === minimizeBtn || minimizeBtn.contains(e.target)) return;
      toggleMinimize();
    });
  }
}

function appendConversationMessage(content, conversationHistory) {
  const container = document.getElementById(OVERLAY_ID);
  if (!container) return;
  const box = container.querySelector('.ai-analyze-box');
  if (!box) return;
  const body = box.querySelector('.ai-analyze-body');
  if (!body) return;

  const state = getOverlayState(container);
  if (Array.isArray(conversationHistory) && conversationHistory.length > 0) {
    state.conversationHistory = normalizeConversationHistory(conversationHistory);
  }
  if (!state.conversationHistory) {
    state.conversationHistory = [];
  }
  if (!Number.isInteger(state.baseConversationLength)) {
    state.baseConversationLength = 0;
  }

  // Find the conversation history container
  let conversationDiv = body.querySelector('.ai-analyze-conversation-history');
  if (!conversationDiv) {
    // Create conversation history container if it doesn't exist
    conversationDiv = document.createElement("div");
    conversationDiv.className = "ai-analyze-conversation-history";
    body.appendChild(conversationDiv);
  }

  renderConversationMessages(conversationDiv, state.conversationHistory, state.baseConversationLength || 0);
}

function createConversationInterface(originalContent, conversationHistory, options = {}) {
  const container = ensureOverlayContainer();
  const state = getOverlayState(container);
  if (options.fileData) {
    state.attachmentData = options.fileData;
  }
  if (options.originalCategory) {
    state.originalCategory = options.originalCategory;
  }
  if (typeof originalContent === "string") {
    state.originalContent = originalContent;
  }

  if (!Array.isArray(state.conversationHistory) || state.conversationHistory.length === 0) {
    state.conversationHistory = buildInitialConversationHistory(
      conversationHistory,
      state.originalContent,
      state.originalCategory === "image" || state.originalCategory === "file"
        ? describeAttachmentForHistory(state.attachmentData, state.originalCategory)
        : lastAnalyzedText
    );
    state.baseConversationLength = state.conversationHistory.length;
  }

  const conversation = document.createElement("div");
  conversation.className = "ai-analyze-conversation";
  
  const uploadBar = document.createElement("div");
  uploadBar.className = "ai-analyze-upload-bar";

  const uploadHint = document.createElement("span");
  uploadHint.className = "ai-analyze-upload-hint";
  uploadHint.textContent = "Drop an image here, or";

  const uploadButton = document.createElement("button");
  uploadButton.type = "button";
  uploadButton.className = "ai-analyze-upload-trigger";
  uploadButton.textContent = "Upload image";

  const hiddenInput = createHiddenFileInput((file) => analyzeUserFile(file));
  uploadBar.appendChild(uploadHint);
  uploadBar.appendChild(uploadButton);
  uploadBar.appendChild(hiddenInput);

  uploadButton.addEventListener("click", () => hiddenInput.click());
  setupFileDropZone(uploadBar, analyzeUserFile);

  const inputContainer = document.createElement("div");
  inputContainer.className = "ai-analyze-input-container";
  
  const input = document.createElement("textarea");
  input.className = "ai-analyze-input";
  input.placeholder = "Ask a follow up or clarification!";
  input.rows = 1;
  
  const sendBtn = document.createElement("button");
  sendBtn.className = "ai-analyze-send-btn";
  sendBtn.textContent = "Send";
  sendBtn.disabled = true;
  
  const wordCount = document.createElement("div");
  wordCount.className = "ai-analyze-word-count";
  wordCount.textContent = `0/${WORD_LIMIT} words`;
  
  // Auto-resize textarea
  input.addEventListener('input', () => {
    input.style.height = 'auto';
    input.style.height = Math.min(input.scrollHeight, 80) + 'px';
    
    const words = countWords(input.value);
    wordCount.textContent = `${words}/${WORD_LIMIT} words`;
    
    if (words > WORD_LIMIT) {
      wordCount.className = "ai-analyze-word-count warning";
      sendBtn.disabled = true;
    } else if (words > 0) {
      wordCount.className = "ai-analyze-word-count";
      sendBtn.disabled = false;
    } else {
      wordCount.className = "ai-analyze-word-count";
      sendBtn.disabled = true;
    }
  });
  
  // Handle Enter key (but not Shift+Enter)
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      if (!sendBtn.disabled) {
        sendBtn.click();
      }
    }
  });
  
  // Send button click handler
  sendBtn.addEventListener('click', async () => {
    const userInput = input.value.trim();
    if (userInput && countWords(userInput) <= WORD_LIMIT) {
      const latestState = getOverlayState(container);
      const historyForSend = Array.isArray(latestState?.conversationHistory)
        ? latestState.conversationHistory
        : [];
      const originalAnalysis = latestState?.originalContent || originalContent;
      const fileData = latestState?.attachmentData || options.fileData || null;
      const isAttachmentConversation = Boolean(fileData);

      // Disable input while processing
      input.disabled = true;
      sendBtn.disabled = true;
      
      // Add loading spinner to send button
      const spinner = document.createElement("div");
      spinner.className = "ai-analyze-send-spinner";
      
      // Hide text and add spinner
      sendBtn.textContent = "";
      sendBtn.appendChild(spinner);
      
      try {
        if (isAttachmentConversation) {
          isAnalysisInProgress = true;
        }
        
        // Send follow-up request to background script with timeout
        const response = await Promise.race([
          chrome.runtime.sendMessage({
            type: isAttachmentConversation ? "FOLLOW_UP_ATTACHMENT_REQUEST" : "FOLLOW_UP_REQUEST",
            userInput: userInput,
            originalContent: originalAnalysis,
            conversationHistory: historyForSend,
            attachmentData: fileData
          }),
          new Promise((_, reject) => 
            setTimeout(() => reject(new Error("Request timeout after 30 seconds")), 30000)
          )
        ]);
        
        if (response && response.success) {
          // Clear the input after successful send
          input.value = "";
          input.style.height = 'auto';
          wordCount.textContent = `0/${WORD_LIMIT} words`;
          wordCount.className = "ai-analyze-word-count";
          // Re-enable input and restore button
          input.disabled = false;
          sendBtn.disabled = false;
          sendBtn.textContent = "Send";
          sendBtn.innerHTML = "Send"; // Remove spinner
          isAnalysisInProgress = false;
        } else {
          const errorMsg = response?.error || "Failed to get response from background script";
          console.error("Follow-up request failed:", errorMsg);
          throw new Error(errorMsg);
        }
      } catch (error) {
        console.error("Follow-up request failed:", error);
        isAnalysisInProgress = false;
        // Re-enable input on error and restore button
        input.disabled = false;
        sendBtn.disabled = false;
        sendBtn.textContent = "Send";
        sendBtn.innerHTML = "Send"; // Remove spinner
      }
    }
  });
  
  inputContainer.appendChild(input);
  inputContainer.appendChild(sendBtn);
  conversation.appendChild(uploadBar);
  conversation.appendChild(inputContainer);
  conversation.appendChild(wordCount);
  
  return conversation;
}

function renderImageAnalysis(imageData, content, isError, conversationHistory = [], options = {}) {
  const container = ensureOverlayContainer();
  container.innerHTML = "";
  const state = resetOverlayState(container);
  const box = document.createElement("div");
  box.className = "ai-analyze-box";
  const header = document.createElement("div");
  header.className = "ai-analyze-header";
  
  // Create header with title and timestamp
  const headerContent = document.createElement("div");
  headerContent.className = "ai-analyze-header-content";
  
  const inferredMime = imageData?.mimeType || inferMimeTypeFromSrc(imageData?.src);
  const categoryHint = options.originalCategory || classifyFileType(inferredMime || (imageData?.src ? inferMimeTypeFromSrc(imageData.src) : ""));
  const isImage = categoryHint === "image" || !categoryHint || categoryHint === "unknown";

  const title = document.createElement("span");
  if (isError) {
    title.textContent = "Error";
  } else if (isImage) {
    title.textContent = "Image Analysis";
  } else {
    title.textContent = "File Analysis";
  }
  
  const timestamp = document.createElement("span");
  timestamp.className = "ai-analyze-timestamp";
  timestamp.textContent = getCurrentDateTime();
  
  // Add minimize button
  const minimizeBtn = document.createElement("button");
  minimizeBtn.className = "ai-analyze-minimize-btn";
  minimizeBtn.innerHTML = "▼";
  minimizeBtn.title = "Minimize";
  
  headerContent.appendChild(title);
  headerContent.appendChild(timestamp);
  headerContent.appendChild(minimizeBtn);
  header.appendChild(headerContent);
  
  // Add minimize/maximize functionality
  addMinimizeMaximizeFunctionality(box, minimizeBtn);
  
  const body = document.createElement("div");
  body.className = "ai-analyze-body";
  
  // Add preview
  if (isImage && imageData?.src) {
    const imagePreview = document.createElement("div");
    imagePreview.className = "ai-analyze-image-preview";
    
    const img = document.createElement("img");
    img.src = imageData.src;
    img.alt = imageData.alt || imageData.name || "Uploaded image";
    img.style.maxWidth = "100%";
    img.style.maxHeight = "220px";
    img.style.borderRadius = "6px";
    img.style.border = "1px solid rgba(255,255,255,0.2)";
    
    imagePreview.appendChild(img);
    body.appendChild(imagePreview);
  } else {
    const filePreview = document.createElement("div");
    filePreview.className = "ai-analyze-file-preview";
    
    const icon = document.createElement("div");
    icon.className = "ai-analyze-file-icon";
    icon.textContent = "📄";
    
    const meta = document.createElement("div");
    meta.className = "ai-analyze-file-meta";
    const name = document.createElement("div");
    name.className = "ai-analyze-file-name";
    name.textContent = imageData?.name || "Uploaded file";
    const details = document.createElement("div");
    details.className = "ai-analyze-file-details";
    const sizeText = formatFileSize(imageData?.size);
    const detailParts = [];
    if (sizeText) detailParts.push(sizeText);
    details.textContent = detailParts.join(" • ");
    meta.appendChild(name);
    meta.appendChild(details);
    
    filePreview.appendChild(icon);
    filePreview.appendChild(meta);
    body.appendChild(filePreview);
  }
  
  if (isError) {
    const errorDiv = document.createElement("div");
    errorDiv.textContent = content;
    errorDiv.style.marginTop = "10px";
    body.appendChild(errorDiv);
  } else {
    const analysisDiv = document.createElement("div");
    analysisDiv.className = "ai-analyze-image-analysis";
    analysisDiv.innerHTML = formatAIResponse(content);
    body.appendChild(analysisDiv);
  }
  
  const followUpAttachment = {
    src: imageData?.src || "",
    base64: imageData?.base64 || null,
    mimeType: inferredMime || "image/png",
    name: imageData?.name || imageData?.alt || (isImage ? "Uploaded image" : "Uploaded file"),
    size: imageData?.size || null
  };

  state.originalContent = typeof content === "string" ? content : "";
  state.originalCategory = isImage ? "image" : "file";
  state.attachmentData = followUpAttachment;
  state.conversationHistory = buildInitialConversationHistory(
    conversationHistory,
    state.originalContent,
    describeAttachmentForHistory(followUpAttachment, state.originalCategory)
  );
  state.baseConversationLength = state.conversationHistory.length;
  
  // Add conversation history if it exists
  if (state.conversationHistory.length > state.baseConversationLength) {
    const conversationDiv = document.createElement("div");
    conversationDiv.className = "ai-analyze-conversation-history";
    renderConversationMessages(conversationDiv, state.conversationHistory, state.baseConversationLength);
    body.appendChild(conversationDiv);
  }
  
  const actions = document.createElement("div");
  actions.className = "ai-analyze-actions";
  
  // Create feedback buttons
  const feedbackContainer = document.createElement("div");
  feedbackContainer.className = "ai-analyze-feedback";
  
  const thumbsUpBtn = document.createElement("button");
  thumbsUpBtn.className = "ai-analyze-feedback-btn";
  thumbsUpBtn.innerHTML = "✓";
  thumbsUpBtn.title = "Good response";
  thumbsUpBtn.setAttribute("data-feedback", "up");
  
  const thumbsDownBtn = document.createElement("button");
  thumbsDownBtn.className = "ai-analyze-feedback-btn";
  thumbsDownBtn.innerHTML = "✗";
  thumbsDownBtn.title = "Bad response";
  thumbsDownBtn.setAttribute("data-feedback", "down");
  
  thumbsUpBtn.addEventListener("click", () => {
    thumbsUpBtn.classList.toggle("active");
    thumbsDownBtn.classList.remove("active");
  });
  
  thumbsDownBtn.addEventListener("click", () => {
    thumbsDownBtn.classList.toggle("active");
    thumbsUpBtn.classList.remove("active");
  });
  
  feedbackContainer.appendChild(thumbsUpBtn);
  feedbackContainer.appendChild(thumbsDownBtn);
  
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
  closeBtn.addEventListener("click", () => {
    isAnalysisInProgress = false;
    container.remove();
  });
  
  actions.appendChild(feedbackContainer);
  actions.appendChild(copyBtn);
  actions.appendChild(closeBtn);
  
  // Add conversation interface if not an error
  if (!isError) {
    const conversation = createConversationInterface(content, state.conversationHistory, {
      fileData: followUpAttachment,
      originalCategory: state.originalCategory
    });
    box.appendChild(header);
    box.appendChild(body);
    box.appendChild(conversation);
    box.appendChild(actions);
  } else {
    box.appendChild(header);
    box.appendChild(body);
    box.appendChild(actions);
  }
  
  container.appendChild(box);
  positionOverlay(container);
}

function renderOverlayResult(content, isError, rect, conversationHistory = []) {
  const container = ensureOverlayContainer();
  container.innerHTML = "";
  const state = resetOverlayState(container);
  const box = document.createElement("div");
  box.className = "ai-analyze-box";
  const header = document.createElement("div");
  header.className = "ai-analyze-header";
  
  // Create header with title and timestamp
  const headerContent = document.createElement("div");
  headerContent.className = "ai-analyze-header-content";
  
  const title = document.createElement("span");
  title.textContent = isError ? "Error" : "AI Analysis";
  
  const timestamp = document.createElement("span");
  timestamp.className = "ai-analyze-timestamp";
  timestamp.textContent = getCurrentDateTime();
  
  // Add minimize button
  const minimizeBtn = document.createElement("button");
  minimizeBtn.className = "ai-analyze-minimize-btn";
  minimizeBtn.innerHTML = "▼";
  minimizeBtn.title = "Minimize";
  
  headerContent.appendChild(title);
  headerContent.appendChild(timestamp);
  headerContent.appendChild(minimizeBtn);
  header.appendChild(headerContent);
  
  // Add minimize/maximize functionality
  addMinimizeMaximizeFunctionality(box, minimizeBtn);
  
  const body = document.createElement("div");
  body.className = "ai-analyze-body";
  
  if (isError) {
    body.textContent = content;
  } else {
    body.innerHTML = formatAIResponse(content);
  }

  state.originalContent = typeof content === "string" ? content : "";
  state.originalCategory = "text";
  state.attachmentData = null;
  state.conversationHistory = buildInitialConversationHistory(
    conversationHistory,
    state.originalContent,
    lastAnalyzedText
  );
  state.baseConversationLength = state.conversationHistory.length;
  
  if (state.conversationHistory.length > state.baseConversationLength) {
    const conversationDiv = document.createElement("div");
    conversationDiv.className = "ai-analyze-conversation-history";
    renderConversationMessages(conversationDiv, state.conversationHistory, state.baseConversationLength);
    body.appendChild(conversationDiv);
  }
  
  const actions = document.createElement("div");
  actions.className = "ai-analyze-actions";
  
  // Create feedback buttons
  const feedbackContainer = document.createElement("div");
  feedbackContainer.className = "ai-analyze-feedback";
  
  const thumbsUpBtn = document.createElement("button");
  thumbsUpBtn.className = "ai-analyze-feedback-btn";
  thumbsUpBtn.innerHTML = "✓";
  thumbsUpBtn.title = "Good response";
  thumbsUpBtn.setAttribute("data-feedback", "up");
  
  const thumbsDownBtn = document.createElement("button");
  thumbsDownBtn.className = "ai-analyze-feedback-btn";
  thumbsDownBtn.innerHTML = "✗";
  thumbsDownBtn.title = "Bad response";
  thumbsDownBtn.setAttribute("data-feedback", "down");
  
  thumbsUpBtn.addEventListener("click", () => {
    thumbsUpBtn.classList.toggle("active");
    thumbsDownBtn.classList.remove("active");
  });
  
  thumbsDownBtn.addEventListener("click", () => {
    thumbsDownBtn.classList.toggle("active");
    thumbsUpBtn.classList.remove("active");
  });
  
  feedbackContainer.appendChild(thumbsUpBtn);
  feedbackContainer.appendChild(thumbsDownBtn);
  
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
  closeBtn.addEventListener("click", () => {
    isAnalysisInProgress = false;
    container.remove();
  });
  
  actions.appendChild(feedbackContainer);
  actions.appendChild(copyBtn);
  actions.appendChild(closeBtn);
  
  // Add conversation interface if not an error
  if (!isError) {
    const conversation = createConversationInterface(content, state.conversationHistory);
    box.appendChild(header);
    box.appendChild(body);
    box.appendChild(conversation);
    box.appendChild(actions);
  } else {
    box.appendChild(header);
    box.appendChild(body);
    box.appendChild(actions);
  }
  
  container.appendChild(box);
  positionOverlay(container);
}

// ============================================================================
// OPTIMIZATION: Streaming support - accumulate and display chunks in real-time
// ============================================================================
let streamingContent = "";
let streamingActive = false;

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message && message.type === "GET_SELECTION_AND_SHOW_LOADING") {
    const selection = getSelectionWithRect();
    
    // Check if this is the same selection as last time
    if (isSameSelection(selection)) {
      // Close existing overlay and return without analyzing
      closeOverlay();
      sendResponse(selection);
      return true;
    }
    
    // Reset streaming state for new request
    streamingContent = "";
    streamingActive = true;
    
    if (selection.type === "image" && selection.image) {
      isAnalysisInProgress = true;
      renderOverlayLoading(selection.rect, "image");
    } else if (selection.text && selection.text.trim()) {
      isAnalysisInProgress = true;
      renderOverlayLoading(selection.rect, "text");
    }
    sendResponse(selection);
    return true;
  }
  
  // OPTIMIZATION: Handle streaming chunks
  if (message && message.type === "STREAM_CHUNK") {
    if (!streamingActive) return;
    
    streamingContent += message.chunk;
    
    // Update the overlay with accumulated content
    const container = document.getElementById(OVERLAY_ID);
    if (!container) {
      streamingActive = false;
      return;
    }
    
    const box = container.querySelector('.ai-analyze-box');
    if (!box) {
      streamingActive = false;
      return;
    }
    
    let body = box.querySelector('.ai-analyze-body');
    if (!body) {
      // If body doesn't exist yet, create it (replace loading state)
      const existingBody = box.querySelector('.ai-analyze-body');
      if (existingBody) {
        body = existingBody;
      } else {
        streamingActive = false;
        return;
      }
    }
    
    // Update body with formatted streaming content + cursor
    body.innerHTML = formatAIResponse(streamingContent) + '<span class="ai-analyze-streaming-cursor"></span>';
    
    return;
  }
  
  if (message && message.type === "SHOW_RESULT") {
    // Stop streaming, show final result
    streamingActive = false;
    streamingContent = "";
    if (isAnalysisInProgress) {
      isAnalysisInProgress = false;
      // Update last analyzed content for text results
      const selection = getSelectionWithRect();
      if (selection.type === "text" && selection.text) {
        updateLastAnalyzed(selection);
      }
      renderOverlayResult(message.content || "(empty)", false, null, message.conversationHistory || []);
    }
    return;
  }
  if (message && message.type === "SHOW_ERROR") {
    if (isAnalysisInProgress) {
      isAnalysisInProgress = false;
      renderOverlayResult(message.error || "Unknown error", true, null);
    }
    return;
  }
  if (message && message.type === "SHOW_LOADING") {
    isAnalysisInProgress = true;
    const variant = message.variant || (message.payload && message.payload.variant) || "text";
    renderOverlayLoading(null, variant);
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
  if (message && message.type === "FOLLOW_UP_RESPONSE") {
    // Handle follow-up response by appending to existing overlay
    appendConversationMessage(message.content || "(empty)", message.conversationHistory || []);
    return;
  }
  if (message && message.type === "SHOW_IMAGE_RESULT") {
    if (isAnalysisInProgress) {
      isAnalysisInProgress = false;
      // Update last analyzed content for image results
      const selection = getSelectionWithRect();
      if (selection.type === "image" && selection.image) {
        updateLastAnalyzed(selection);
      }
      const mimeType = message.imageData && (message.imageData.mimeType || inferMimeTypeFromSrc(message.imageData.src));
      const category = mimeType ? classifyFileType(mimeType) : "unknown";
      const options = category === "unknown" ? {} : { originalCategory: category };
      renderImageAnalysis(message.imageData, message.content || "(empty)", false, message.conversationHistory || [], options);
    }
    return;
  }
  if (message && message.type === "SHOW_IMAGE_ERROR") {
    if (isAnalysisInProgress) {
      isAnalysisInProgress = false;
      const mimeType = message.imageData && (message.imageData.mimeType || inferMimeTypeFromSrc(message.imageData.src));
      const category = mimeType ? classifyFileType(mimeType) : "unknown";
      const options = category === "unknown" ? {} : { originalCategory: category };
      renderImageAnalysis(message.imageData, message.error || "Unknown error", true, [], options);
    }
    return;
  }
});
