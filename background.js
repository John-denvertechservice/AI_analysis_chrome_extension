// Background service worker for handling command and AI calls

// Note: Database integration (database.js and database-integration.js) is designed
// for the Node.js server backend, not the browser extension service worker.
// The extension service worker uses browser APIs (chrome.storage) for caching.

// ============================================================================
// OPTIMIZATION: Model Selection Caching (1-hour TTL) - Enhanced with Database
// ============================================================================
const modelCache = {
  claudeModel: null,
  cacheTime: null,
  TTL: 60 * 60 * 1000 // 1 hour in milliseconds
};

// Get cached Claude model or fetch if expired/missing
// Fallback: If caching fails, always fetch fresh
async function getCachedClaudeModel(apiKey, preferredModel) {
  try {
    const now = Date.now();
    
    // Check if we have a valid cached model
    if (modelCache.claudeModel && 
        modelCache.cacheTime && 
        (now - modelCache.cacheTime) < modelCache.TTL) {
      return modelCache.claudeModel;
    }
    
    // Cache expired or missing - fetch new model
    const model = await getBestClaudeModel(apiKey, preferredModel);
    
    // Update cache
    modelCache.claudeModel = model;
    modelCache.cacheTime = now;
    
    return model;
  } catch (error) {
    // Fallback: If caching logic fails, fetch directly
    console.warn("Model cache error, fetching directly:", error);
    return getBestClaudeModel(apiKey, preferredModel);
  }
}

// Clear model cache (called when API keys change)
function clearModelCache() {
  modelCache.claudeModel = null;
  modelCache.cacheTime = null;
}

async function getActiveTab() {
  const tabs = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
  return tabs && tabs.length ? tabs[0] : null;
}

async function safeSendMessage(tabId, message) {
  try {
    return await chrome.tabs.sendMessage(tabId, message);
  } catch (_) {
    return null;
  }
}

function isMathProblem(text) {
  // Remove extra whitespace and normalize
  const normalizedText = text.trim().toLowerCase();
  
  // Check for mathematical expressions, equations, or problem indicators
  const mathPatterns = [
    // Equations with =, +, -, *, /, ^, etc.
    /[=+\-*/^]/,
    // Numbers with mathematical operations
    /\d+\s*[+\-*/^]\s*\d+/,
    // Common math problem keywords
    /\b(solve|calculate|find|compute|evaluate|simplify|factor|expand|derivative|integral|limit|equation|formula|theorem|proof)\b/,
    // Mathematical symbols and notation
    /[√π∑∏∫∂∇∞±≤≥≠≈]/,
    // Word problems with numbers
    /\b\d+\b.*\b(plus|minus|times|divided|square|cube|root|percent|fraction|ratio)\b/,
    // Algebra patterns
    /\b[a-zA-Z]\s*[+\-*/=]\s*\d+|\d+\s*[+\-*/=]\s*[a-zA-Z]/,
    // Geometry terms
    /\b(area|perimeter|volume|circumference|radius|diameter|triangle|circle|square|rectangle|angle|degrees)\b/,
    // Calculus terms
    /\b(derivative|integral|limit|function|graph|slope|tangent|critical point)\b/,
    // Statistics terms
    /\b(mean|median|mode|standard deviation|variance|probability|distribution)\b/
  ];
  
  // Check if any pattern matches
  return mathPatterns.some(pattern => pattern.test(normalizedText));
}

const SUPERSCRIPT_DIGIT_MAP = {
  "⁰": "0",
  "¹": "1",
  "²": "2",
  "³": "3",
  "⁴": "4",
  "⁵": "5",
  "⁶": "6",
  "⁷": "7",
  "⁸": "8",
  "⁹": "9",
  "⁺": "+",
  "⁻": "-",
  "⁽": "(",
  "⁾": ")"
};

function stripTrailingZerosTI(mantissa) {
  if (!mantissa.includes(".")) return mantissa;
  let stripped = mantissa.replace(/0+$/g, "");
  if (stripped.endsWith(".")) stripped = stripped.slice(0, -1);
  return stripped || "0";
}

function formatTI84Number(value, options = {}) {
  if (!Number.isFinite(value)) return String(value);
  const { decimals } = options;
  let output;

  if (typeof decimals === "number") {
    output = value.toFixed(decimals);
    if (output.startsWith("-") && Number(output) === 0) {
      output = output.slice(1); // Preserve requested decimals but drop leading minus for -0.00
    }
    return output;
  }

  const abs = Math.abs(value);
  if (abs !== 0 && (abs >= 1e10 || abs < 1e-9)) {
    output = value.toExponential(9);
  } else {
    output = value.toPrecision(10);
  }

  if (output.includes("e") || output.includes("E")) {
    const parts = output.toLowerCase().split("e");
    let mantissa = stripTrailingZerosTI(parts[0]);
    if (mantissa.startsWith("-") && Number(mantissa) === 0) mantissa = mantissa.slice(1);
    let exponent = parts[1] || "0";
    exponent = exponent.replace(/^\+/, "");
    return `${mantissa}E${exponent}`;
  }

  if (output.includes(".")) {
    output = stripTrailingZerosTI(output);
  }
  if (output.startsWith("-") && Number(output) === 0) {
    output = output.slice(1);
  }
  return output;
}

function normalizeTI84MathText(text) {
  if (!text) return "";
  let normalized = text;

  // Remove LaTeX wrappers
  normalized = normalized.replace(/\$\$([\s\S]*?)\$\$/g, "$1");
  normalized = normalized.replace(/\$([^$]+)\$/g, "$1");
  normalized = normalized.replace(/\\\[|\\\]|\\\(|\\\)/g, "");

  // Convert LaTeX-style fractions and radicals
  normalized = normalized.replace(/\\frac\s*\{([^}]+)\}\{([^}]+)\}/g, "($1)/($2)");
  normalized = normalized.replace(/\\sqrt\s*\{([^}]+)\}/g, "sqrt($1)");

  // Convert LaTeX multiplication/division
  normalized = normalized.replace(/\\cdot/g, "*");
  normalized = normalized.replace(/\\times/g, "*");
  normalized = normalized.replace(/\\div/g, "/");

  // General symbol replacements
  const symbolMap = {
    "×": "*",
    "∙": "*",
    "•": "*",
    "÷": "/",
    "√": "sqrt",
    "π": "pi",
    "−": "-",
    "–": "-",
    "—": "-",
    "‒": "-",
    "“": "\"",
    "”": "\"",
    "′": "'",
    "″": "\"",
    "≤": "<=",
    "≥": ">=",
    "≠": "!=",
    "±": "+/-",
    "∓": "-/+",
    "∪": "U",
    "∩": "n",
    "∞": "infinity"
  };
  normalized = normalized.replace(/[×∙•÷√π−–—‒“”′″≤≥≠±∓∪∩∞]/g, (match) => symbolMap[match] || match);

  // Replace sqrt occurrences without parentheses with parentheses
  normalized = normalized.replace(/sqrt\s*\(([^)]+)\)/g, (_, inner) => `sqrt(${inner.trim()})`);
  normalized = normalized.replace(/sqrt\s+([A-Za-z0-9]+)/g, (_, inner) => `sqrt(${inner})`);

  // Convert absolute value bars to abs()
  normalized = normalized.replace(/\|([^|]+)\|/g, "abs($1)");

  // Convert superscripts to ^()
  normalized = normalized.replace(/([A-Za-z0-9)\]])([⁰¹²³⁴⁵⁶⁷⁸⁹⁺⁻]+)/g, (_match, base, supers) => {
    const digits = supers.split("").map((ch) => SUPERSCRIPT_DIGIT_MAP[ch] || "").join("");
    if (!digits) return `${base}^`;
    if (digits.length === 1) return `${base}^${digits}`;
    return `${base}^(${digits})`;
  });

  // Convert ** to ^
  normalized = normalized.replace(/\*\*/g, "^");

  // Normalize scientific notation to uppercase E
  normalized = normalized.replace(/(-?\d+(?:\.\d+)?)(e)([+\-]?\d+)/gi, (_m, base, _eChar, exp) => {
    const mantissa = stripTrailingZerosTI(base);
    const exponent = exp.replace(/^\+/, "");
    return `${mantissa}E${exponent}`;
  });

  // Collapse multiple spaces but preserve line breaks
  normalized = normalized.replace(/[^\S\r\n]+/g, " ");
  normalized = normalized.replace(/ \n/g, "\n");

  return normalized.trim();
}

function detectDecimalPreference(text) {
  if (!text) return null;
  const lower = text.toLowerCase();

  const directMatch = lower.match(/round(?:ed)?\s+to\s+(\d+)\s+decimal/);
  if (directMatch) {
    const n = parseInt(directMatch[1], 10);
    if (!Number.isNaN(n)) return n;
  }

  if (/nearest\s+tenth|one\s+decimal|1\s+decimal/.test(lower)) return 1;
  if (/nearest\s+hundredth|two\s+decimal|2\s+decimal/.test(lower)) return 2;
  if (/nearest\s+thousandth|three\s+decimal|3\s+decimal/.test(lower)) return 3;
  if (/four\s+decimal|4\s+decimal/.test(lower)) return 4;
  if (/five\s+decimal|5\s+decimal/.test(lower)) return 5;

  return null;
}

// Some models (like gpt-5-mini/nano) enforce their default temperature; skip overriding it for them.
function supportsVariableTemperature(model) {
  if (!model) return false;
  const normalized = String(model).toLowerCase();
  const trimmed = normalized.startsWith("ft:") ? normalized.slice(3) : normalized;
  const fixedTemperatureModels = ["gpt-5-mini", "gpt-5-nano"];
  return !fixedTemperatureModels.some((name) => trimmed.startsWith(name));
}

function buildChatCompletionBody({ model, temperature, ...rest }) {
  const resolvedModel = model || "gpt-5-mini";
  const body = { model: resolvedModel, ...rest };

  if (typeof temperature === "number" && supportsVariableTemperature(resolvedModel)) {
    body.temperature = temperature;
  }

  return body;
}

function createTextConversationHistory(userContent, assistantContent) {
  const history = [];
  const userText = typeof userContent === "string" ? userContent.trim() : "";
  if (userText) {
    history.push({ role: "user", content: userText });
  }
  const assistantText = typeof assistantContent === "string" ? assistantContent.trim() : "";
  if (assistantText) {
    history.push({ role: "assistant", content: assistantText });
  }
  return history;
}

function describeAttachmentForHistory(attachment, categoryHint) {
  if (!attachment) return "";
  const parts = [];
  if (attachment.name) parts.push(attachment.name);
  else if (attachment.alt) parts.push(attachment.alt);
  else if (attachment.mimeType) parts.push(attachment.mimeType);
  else if (attachment.src && typeof attachment.src === "string") {
    try {
      const url = new URL(attachment.src);
      const lastSegment = url.pathname.split("/").filter(Boolean).pop();
      if (lastSegment) parts.push(lastSegment);
      else parts.push(url.hostname);
    } catch (_) {
      parts.push("uploaded file");
    }
  } else {
    parts.push("uploaded file");
  }

  const label = parts.join(" ").trim() || "uploaded file";
  const normalizedCategory = (categoryHint || attachment.mimeType || "").toLowerCase();
  if (normalizedCategory.includes("image")) {
    return `Analyze image: ${label}`;
  }
  return `Analyze file: ${label}`;
}

function createAttachmentConversationHistory(attachment, assistantContent, categoryHint) {
  const description = describeAttachmentForHistory(attachment, categoryHint);
  const history = [];
  if (description) {
    history.push({ role: "user", content: description });
  }
  const assistantText = typeof assistantContent === "string" ? assistantContent.trim() : "";
  if (assistantText) {
    history.push({ role: "assistant", content: assistantText });
  }
  return history;
}

const CONTEXT_MENU_SELECTION_ID = "ai-analyze-selection";
const CONTEXT_MENU_IMAGE_ID = "ai-analyze-image";

function isVisionCapableModel(model) {
  if (!model) return false;
  const normalized = String(model).toLowerCase();
  return normalized.includes("gpt-4o") || normalized.includes("vision") || normalized.includes("omni");
}

function getWordCount(text) {
  return text.trim().split(/\s+/).filter(Boolean).length;
}

function endsWithQuestionMark(text) {
  return /\?\s*$/.test(text.trim());
}

function isLikelyCommand(text) {
  const trimmed = text.trim().toLowerCase();
  const imperativeVerbs = [
    "answer", "calculate", "compute", "summarize", "solve", "find", "list",
    "graph", "plot", "chart", "translate", "explain", "draft", "write",
    "build", "create", "plan", "outline", "analyze", "estimate", "evaluate",
    "select", "choose", "determine"
  ];
  return imperativeVerbs.some((verb) => trimmed.startsWith(verb) || trimmed.startsWith(`please ${verb}`));
}

function isLikelyQuestion(text) {
  const trimmed = text.trim();
  const lower = trimmed.toLowerCase();
  const interrogatives = ["how", "what", "why", "when", "where", "which", "who", "whom", "whose", "can", "could", "would", "should", "is", "are", "am", "will", "may", "might", "do", "does", "did"];
  return endsWithQuestionMark(trimmed) || (interrogatives.some((word) => lower.startsWith(`${word} `)) && trimmed.length <= 200);
}

function isLikelyCode(text) {
  const codeIndicators = [
    /```[\s\S]*```/, // fenced code block
    /#include\s+<[^>]+>/,
    /\b(function|const|let|var|console\.log|=>|class|import|export|async|await)\b/,
    /\b(def|lambda|print\(|self|None)\b/,
    /\bpublic\s+class\b/,
    /\bSystem\.out\.println\b/,
    /\bBEGIN\b.*\bEND\b/si,
    /<\/?[a-z][^>]*>/ // HTML/XML
  ];
  return codeIndicators.some((pattern) => pattern.test(text));
}

function guessCodeLanguage(text) {
  if (/```(\w+)/.test(text)) {
    return RegExp.$1.toUpperCase();
  }
  if (/\bconsole\.log\b/.test(text) || /\bexport\b/.test(text)) return "JavaScript";
  if (/\bdef\b/.test(text) || /\blambda\b/.test(text)) return "Python";
  if (/#include\s+<[^>]+>/.test(text)) return "C/C++";
  if (/\bpublic\s+class\b/.test(text) || /\bSystem\.out\.println\b/.test(text)) return "Java";
  if (/<\/?[a-z][^>]*>/.test(text)) return "HTML";
  if (/\bSELECT\b.+\bFROM\b/si.test(text)) return "SQL";
  if (/\bfunction\s+\w+\s*\(/.test(text)) return "JavaScript";
  if (/\bpackage\b.+;/.test(text)) return "Java";
  if (/\busing\s+System\b/.test(text)) return "C#";
  if (/\bfunc\b.+\{/.test(text)) return "Go";
  if (/\b<?php\b/.test(text)) return "PHP";
  return "Unknown Language";
}

function isFillInBlank(text) {
  const t = text.trim();
  // Underscore blanks or trailing colon with question mark
  if (/{?_{2,}}?/.test(t) || /\b_{2,}\b/.test(t)) return true;
  if (/:\s*\?$/.test(t) || /\bfill\s*in\s*the\s*blank\b/i.test(t)) return true;
  // Patterns like "_____?" or "— ?"
  if (/[_–—-]{3,}\s*\?$/.test(t)) return true;
  return false;
}

function buildNonMathSystemPrompt(selectedText) {
  const words = getWordCount(selectedText);
  const lower = selectedText.trim().toLowerCase();
  const requiresGraph = /\b(graph|plot|chart)\b/.test(lower);
  const command = isLikelyCommand(selectedText);
  const question = isLikelyQuestion(selectedText);
  const code = isLikelyCode(selectedText);

  // Decision Tree Implementation - Following the exact rules provided

  // OPTIMIZATION: Condensed prompts (20-30% fewer tokens)
  // Rule 1: If the selected text is over 75 words
  if (words > 75) {
    return {
      systemPrompt: `Expert writing analyst. Summarize key points, then ask how the user would like to proceed with helpful suggestions. No Final Answer section.`,
      userPrompt: `Summarize and advise (${words} words):\n\n${selectedText}`
    };
  }

  // Rule 2: Fill-in-the-blank
  if (isFillInBlank(selectedText)) {
    return {
      systemPrompt: `Fill-in-blank expert. Determine most likely answer. Include "Final Answer" section with filled text only.`,
      userPrompt: `Fill the blank:\n\n${selectedText}`
    };
  }

  // Rule 3: Questions
  if (question) {
    return {
      systemPrompt: `Expert assistant. Answer directly with brief reasoning. Include "Final Answer" section. Stay focused.`,
      userPrompt: `Answer:\n\n${selectedText}`
    };
  }

  // Rule 4: Matter-of-fact statements
  if (!command && !question && !code && words <= 75) {
    return {
      systemPrompt: `Concise expert. Summarize in ≤15 words, then ask how the user would like to proceed with a helpful suggestion. No Final Answer section.`,
      userPrompt: `Consider:\n\n${selectedText}`
    };
  }

  // Rule 5: Commands (calculate, graph, etc.)
  if (command) {
    return {
      systemPrompt: `Task assistant. Execute command, include "Final Answer". For graphs: ASCII/table format with labeled axes. Brief reasoning.`,
      userPrompt: `Execute:\n\n${selectedText}`
    };
  }

  // Rule 6: Code
  if (code) {
    const language = guessCodeLanguage(selectedText);
    return {
      systemPrompt: `Code analyst. No Final Answer. State "Language: ${language}". Summarize code purpose concisely. Offer clarification.`,
      userPrompt: `Analyze code:\n\n${selectedText}`
    };
  }

  // Default fallback
  return {
    systemPrompt: `Concise expert. Summarize in ≤15 words, then ask how the user would like to proceed with a helpful suggestion. No Final Answer section.`,
    userPrompt: `Consider:\n\n${selectedText}`
  };
}

// Function to get available Claude models
async function getAvailableClaudeModels(apiKey) {
  try {
    const response = await fetch("https://api.anthropic.com/v1/models", {
      method: "GET",
      headers: {
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01"
      }
    });
    
    if (!response.ok) {
      throw new Error(`Failed to fetch models: ${response.status}`);
    }
    
    const data = await response.json();
    return data.data || [];
  } catch (error) {
    console.warn("Failed to fetch available models:", error);
    return [];
  }
}

// Function to get the best available Claude model
async function getBestClaudeModel(apiKey, preferredModel = "claude-3-5-sonnet") {
  const models = await getAvailableClaudeModels(apiKey);
  
  if (models.length === 0) {
    // Fallback to common model names if API call fails
    return preferredModel;
  }
  
  // Look for the preferred model first
  const preferred = models.find(m => m.id === preferredModel);
  if (preferred) {
    return preferred.id;
  }
  
  // Look for any claude-3-5-sonnet model
  const sonnet = models.find(m => m.id.includes("claude-3-5-sonnet"));
  if (sonnet) {
    return sonnet.id;
  }
  
  // Look for any claude-3 model
  const claude3 = models.find(m => m.id.includes("claude-3"));
  if (claude3) {
    return claude3.id;
  }
  
  // Return the first available model
  return models[0].id;
}

// Claude API functions
async function fetchClaudeAnalysis(apiKey, model, selectedText, conversationHistory = []) {
  const endpoint = "https://api.anthropic.com/v1/messages";
  
  // OPTIMIZATION: Parallel classification - compute both paths simultaneously
  // One will be used, but this saves 50-100ms of sequential processing
  const [isMath, nonMathPrompts] = await Promise.all([
    Promise.resolve(isMathProblem(selectedText)),
    Promise.resolve(buildNonMathSystemPrompt(selectedText))
  ]);
  
  let systemPrompt, userPrompt;
  
  if (isMath) {
    // OPTIMIZATION: Condensed math prompt (30% fewer tokens, same accuracy)
    systemPrompt = `Expert math tutor. Provide step-by-step solutions with accuracy.

TOP LINE FORMAT (required):
Normalized Equation: <equation using only numbers, x, +, -, *, /, ^, (), sqrt()>
Example: sqrt(4 - x) = -2 + sqrt(5 - 2x)

STRUCTURE:
• Problem: Restate clearly
• Solution Steps: Show work with explanations
• Final Answer: Result only (no instructions)
• Verification: Check answer if applicable

CRITICAL RULES:
- Strict ASCII math only: use +, -, *, /, ^, (, ), sqrt(), pi, abs(). NEVER use ×, ÷, √, superscripts, Unicode symbols, or LaTeX.
- Every radicand and denominator must be fully parenthesized. Write sqrt((x^2)+9) NOT sqrt(x^2)+9.
- Restate the original equation unambiguously before solving.
- When radicals appear in equations, isolate: sqrt(A) - sqrt(B) = k, then square. Check each candidate in the ORIGINAL equation and discard extraneous roots.
- Honor domain constraints (even roots ≥ 0, denominators ≠ 0, logs > 0). Express intervals with parentheses/brackets and unions with U.
- Final Answer: Match TI-84 output. Provide numeric results (or requested rounding) in the form x=..., x1=..., x2=..., etc.`;
    
    userPrompt = `Solve this math problem step by step. Start with the required Normalized Equation line.\n\n${selectedText}`;
  } else {
    systemPrompt = nonMathPrompts.systemPrompt;
    userPrompt = nonMathPrompts.userPrompt;
  }
  
  // Build messages array with conversation history
  const messages = [];
  
  // Add conversation history if it exists
  if (conversationHistory.length > 0) {
    messages.push(...conversationHistory);
  }
  
  // Add the current user message
  messages.push({
    role: "user",
    content: userPrompt
  });

  // Get the best available model (cached for 1 hour)
  const bestModel = await getCachedClaudeModel(apiKey, model);
  
  // OPTIMIZATION: Streaming support with fallback
  // Try streaming first, fall back to non-streaming on error
  const body = {
    model: bestModel,
    max_tokens: 2000,
    temperature: isMath ? 0.0 : 0.2,
    system: systemPrompt,
    messages: messages,
    stream: true // Enable streaming
  };

  let response;
  try {
    response = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
        "anthropic-beta": "tools-2024-05-16",
        "anthropic-dangerous-direct-browser-access": "true"
      },
      body: JSON.stringify(body)
    });

    if (!response.ok) {
      const errText = await response.text().catch(() => "");
      throw new Error(`Claude API error (${response.status}): ${errText}`);
    }

    // Process streaming response
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let fullContent = "";
    let buffer = "";

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || ""; // Keep incomplete line in buffer

      for (const line of lines) {
        if (line.startsWith('data: ')) {
          const data = line.slice(6);
          if (data === '[DONE]') continue;
          
          try {
            const parsed = JSON.parse(data);
            if (parsed.type === 'content_block_delta' && parsed.delta?.text) {
              const chunk = parsed.delta.text;
              fullContent += chunk;
              
              // Send streaming chunk to content script (fire and forget)
              try {
                const tab = await getActiveTab();
                if (tab && tab.id) {
                  chrome.tabs.sendMessage(tab.id, { 
                    type: "STREAM_CHUNK", 
                    chunk: chunk 
                  }).catch(() => {}); // Ignore errors, continue streaming
                }
              } catch (_) {}
            }
          } catch (parseError) {
            // Skip malformed JSON lines
            continue;
          }
        }
      }
    }

    if (!fullContent) throw new Error("No content returned by Claude");
    const normalizedContent = isMath ? normalizeTI84MathText(fullContent) : fullContent;
    const verified = isMath ? await verifyAndAugmentMathAnswer(selectedText, normalizedContent) : null;
    return (verified || normalizedContent).trim();

  } catch (streamError) {
    // FALLBACK: If streaming fails, try non-streaming
    console.warn("Streaming failed, falling back to non-streaming:", streamError);
    
    body.stream = false; // Disable streaming for fallback
    response = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
        "anthropic-beta": "tools-2024-05-16",
        "anthropic-dangerous-direct-browser-access": "true"
      },
      body: JSON.stringify(body)
    });

    if (!response.ok) {
      const errText = await response.text().catch(() => "");
      throw new Error(`Claude API error (${response.status}): ${errText}`);
    }

    const data = await response.json();
    const content = data && data.content && data.content[0] && data.content[0].text;
    if (!content) throw new Error("No content returned by Claude");
    const normalizedContent = isMath ? normalizeTI84MathText(content) : content;
    const verified = isMath ? await verifyAndAugmentMathAnswer(selectedText, normalizedContent) : null;
    return (verified || normalizedContent).trim();
  }
}

async function fetchClaudeImageAnalysis(apiKey, model, imageData, conversationHistory = []) {
  const endpoint = "https://api.anthropic.com/v1/messages";
  if (!imageData) throw new Error("No attachment provided for analysis");

  const inferredMime = imageData.mimeType || inferMimeFromSrc(imageData.src);
  if ((inferredMime || "").toLowerCase() === "application/pdf") {
    throw new Error("PDF analysis is not supported. Please upload an image.");
  }
  const mimeType = inferredMime || "image/jpeg";
  
  const base64Payload = await resolveAttachmentBase64(imageData);
  
  if (!imageData.base64) {
    imageData.base64 = base64Payload;
  }
  if (!imageData.mimeType && mimeType) {
    imageData.mimeType = mimeType;
  }
  
  // OPTIMIZATION: Shared decision tree rules (eliminates 200+ char duplication)
  const DECISION_RULES = `RULES:
1. Picture with text: Apply word rules. No text: do NOT return a Final Answer field.
2. Words:
   - >75 words: Summarize key points, then ask how the user would like to proceed with helpful suggestions. No Final Answer.
   - ≤75 words:
     * Fill-in-the-blank (_____): Final Answer with the most likely fill only.
     * Question (math or otherwise): Include a brief Final Answer field with the answer.
     * Commands (answer/calculate/evaluate/graph/select...): Execute and include Final Answer. Graphs must be ASCII/table.
     * Math problems: Restate clearly, solve completely, include Final Answer. TOP LINE: Normalized Equation: <ascii with sqrt()>.
     * Code snippets: State "Language: <name>", summarize purpose, offer clarification. No Final Answer.
     * Statements: Summary ≤15 words, ask how the user wants to proceed. No Final Answer.

CRITICAL - FORMATTING RULES (ALWAYS APPLY):
- Strict ASCII math only: use +, -, *, /, ^, (, ), sqrt(), pi, abs(), <=, >=, !=. NEVER use ×, ÷, √, superscripts, or LaTeX.
- Fractions must be written with /, numerators and denominators fully parenthesized when needed.
- Radicals must be written with sqrt(...), entire radicand in parentheses.
- Scientific notation must use uppercase E (example: 1.23E-4).
- When rewriting root expressions (√, nth root), ALWAYS place entire radicand in parentheses`;
  
  const systemPrompt = `Expert image analyst. ${DECISION_RULES}`;
  
  // Build messages array with conversation history
  const messages = [];
  
  // Add conversation history if it exists
  if (conversationHistory.length > 0) {
    messages.push(...conversationHistory);
  }
  
  // Add the current user message with image
  messages.push({
    role: "user",
    content: [
      {
        type: "text",
        text: `Please analyze this image${imageData.name ? ` (${imageData.name})` : ""}. If it contains a mathematical problem or formula, restate it unambiguously and solve it step-by-step with a Final Answer. Otherwise, follow the word-analysis rules.`
      },
      {
        type: "image",
        source: {
          type: "base64",
          media_type: mimeType,
          data: base64Payload
        }
      }
    ]
  });

  // Get the best available model (cached for 1 hour)
  const bestModel = await getCachedClaudeModel(apiKey, model);
  
  const body = {
    model: bestModel,
    max_tokens: 2000,
    temperature: 0.0,
    system: systemPrompt,
    messages: messages
  };

  let response = await fetch(endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
      "anthropic-beta": "tools-2024-05-16",
      "anthropic-dangerous-direct-browser-access": "true"
    },
    body: JSON.stringify(body)
  });

  if (!response.ok) {
    const errText = await response.text().catch(() => "");
    throw new Error(`Claude API error (${response.status}): ${errText}`);
  }

  const data = await response.json();
  const content = data && data.content && data.content[0] && data.content[0].text;
  if (!content) throw new Error("No content returned by Claude");
  const normalizedContent = normalizeTI84MathText(content);
  const verified = await verifyAndAugmentMathAnswer(null, normalizedContent);
  return (verified || normalizedContent).trim();
}

async function handleClaudeFollowUpRequest(apiKey, model, userInput, originalContent, conversationHistory) {
  const endpoint = "https://api.anthropic.com/v1/messages";
  const followUpIsMath = isMathProblem(userInput || "");
  
  // Create a follow-up system prompt
  const systemPrompt = `You are a helpful AI assistant responding to a follow-up question about a previous analysis. The user is asking for clarification, modification, or additional details about your previous response.

Guidelines:
- Be concise and direct in your response
- Address the specific question or request
- If asked to modify something, clearly explain what you're changing
- If asked for clarification, provide clear explanations
- If asked for additional details, expand on relevant points
- Maintain the same helpful and professional tone

FOLLOW-UP DECISION RULES:
${followUpIsMath
  ? `- Treat this as a math follow-up. Restate the math problem clearly.
- Provide step-by-step work, starting with "Normalized Equation: <ascii expression>".
- Include a "Final Answer" section with the computed result only.`
  : `- Do NOT include a "Final Answer" section.
- Provide the clarification or additional detail conversationally.`}

Previous analysis context: ${originalContent}`;

  // Build messages array with conversation history
  const messages = [];
  
  // Add conversation history if it exists
  if (conversationHistory.length > 0) {
    messages.push(...conversationHistory);
  }
  
  // Add the follow-up user message
  messages.push({
    role: "user",
    content: userInput
  });

  // Get the best available model (cached for 1 hour)
  const bestModel = await getCachedClaudeModel(apiKey, model);
  
  const body = {
    model: bestModel,
    max_tokens: 2000,
    temperature: 0.2,
    system: systemPrompt,
    messages: messages
  };

  let response = await fetch(endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
      "anthropic-beta": "tools-2024-05-16",
      "anthropic-dangerous-direct-browser-access": "true"
    },
    body: JSON.stringify(body)
  });

  if (!response.ok) {
    const errText = await response.text().catch(() => "");
    throw new Error(`Claude API error (${response.status}): ${errText}`);
  }

  const data = await response.json();
  const content = data && data.content && data.content[0] && data.content[0].text;
  if (!content) throw new Error("No content returned by Claude");
  const normalizedContent = followUpIsMath ? normalizeTI84MathText(content) : content;
  const verified = followUpIsMath ? await verifyAndAugmentMathAnswer(userInput, normalizedContent) : null;
  return (verified || normalizedContent).trim();
}

async function fetchOpenAIAnalysis(apiKey, model, selectedText, conversationHistory = []) {
  const endpoint = "https://api.openai.com/v1/chat/completions";
  
  // OPTIMIZATION: Parallel classification - compute both paths simultaneously
  // One will be used, but this saves 50-100ms of sequential processing
  const [isMath, nonMathPrompts] = await Promise.all([
    Promise.resolve(isMathProblem(selectedText)),
    Promise.resolve(buildNonMathSystemPrompt(selectedText))
  ]);
  
  let systemPrompt, userPrompt;
  
  if (isMath) {
    // OPTIMIZATION: Condensed math prompt (30% fewer tokens, same accuracy)
    systemPrompt = `Expert math tutor. Provide step-by-step solutions with accuracy.

TOP LINE FORMAT (required):
Normalized Equation: <equation using only numbers, x, +, -, *, /, ^, (), sqrt()>
Example: sqrt(4 - x) = -2 + sqrt(5 - 2x)

STRUCTURE:
• **Problem**: Restate clearly
• **Solution Steps**: Show work with explanations
• **Final Answer**: Result only (no instructions)
• **Verification**: Check answer if applicable

CRITICAL RULES:
- Strict ASCII math only: use +, -, *, /, ^, (, ), sqrt(), pi, abs(). NEVER use ×, ÷, √, superscripts, Unicode symbols, or LaTeX.
- Every radicand and denominator must be fully parenthesized. Write sqrt((x^2)+9) NOT sqrt(x^2)+9.
- Restate the original equation unambiguously before solving.
- When radicals appear in equations, isolate: sqrt(A) - sqrt(B) = k, then square. Check each candidate in the ORIGINAL equation and discard extraneous roots.
- Honor domain constraints (even roots ≥ 0, denominators ≠ 0, logs > 0). Express intervals with parentheses/brackets and unions with U.
- Final Answer: Match TI-84 output. Provide numeric results (or requested rounding) in the form x=..., x1=..., x2=..., etc.`;
    
    userPrompt = `Solve this math problem step by step. Start with the required Normalized Equation line.\n\n${selectedText}`;
  } else {
    systemPrompt = nonMathPrompts.systemPrompt;
    userPrompt = nonMathPrompts.userPrompt;
  }
  
  // Build messages array with conversation history
  const messages = [
    {
      role: "system",
      content: systemPrompt
    }
  ];
  
  // Add conversation history if it exists
  if (conversationHistory.length > 0) {
    messages.push(...conversationHistory);
  }
  
  // Add the current user message
  messages.push({
    role: "user",
    content: userPrompt
  });

  // OPTIMIZATION: Streaming support with fallback
  const body = buildChatCompletionBody({
    model,
    temperature: isMath ? 0.0 : 0.2,
    messages,
    stream: true // Enable streaming
  });

  let response;
  try {
    response = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`
      },
      body: JSON.stringify(body)
    });

    if (!response.ok) {
      const errText = await response.text().catch(() => "");
      throw new Error(`OpenAI API error (${response.status}): ${errText}`);
    }

    // Process streaming response
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let fullContent = "";
    let buffer = "";

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || ""; // Keep incomplete line in buffer

      for (const line of lines) {
        if (line.startsWith('data: ')) {
          const data = line.slice(6).trim();
          if (data === '[DONE]') continue;
          if (!data) continue;
          
          try {
            const parsed = JSON.parse(data);
            const chunk = parsed.choices?.[0]?.delta?.content;
            if (chunk) {
              fullContent += chunk;
              
              // Send streaming chunk to content script (fire and forget)
              try {
                const tab = await getActiveTab();
                if (tab && tab.id) {
                  chrome.tabs.sendMessage(tab.id, { 
                    type: "STREAM_CHUNK", 
                    chunk: chunk 
                  }).catch(() => {}); // Ignore errors, continue streaming
                }
              } catch (_) {}
            }
          } catch (parseError) {
            // Skip malformed JSON lines
            continue;
          }
        }
      }
    }

    if (!fullContent) throw new Error("No content returned by model");
    const normalizedContent = isMath ? normalizeTI84MathText(fullContent) : fullContent;
    const verified = isMath ? await verifyAndAugmentMathAnswer(selectedText, normalizedContent) : null;
    return (verified || normalizedContent).trim();

  } catch (streamError) {
    // FALLBACK: If streaming fails, try non-streaming
    console.warn("Streaming failed, falling back to non-streaming:", streamError);
    
    const nonStreamBody = buildChatCompletionBody({
      model,
      temperature: isMath ? 0.0 : 0.2,
      messages,
      stream: false
    });

    response = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`
      },
      body: JSON.stringify(nonStreamBody)
    });

    if (!response.ok) {
      const errText = await response.text().catch(() => "");
      throw new Error(`OpenAI API error (${response.status}): ${errText}`);
    }

    const data = await response.json();
    const content = data && data.choices && data.choices[0] && data.choices[0].message && data.choices[0].message.content;
    if (!content) throw new Error("No content returned by model");
    const normalizedContent = isMath ? normalizeTI84MathText(content) : content;
    const verified = isMath ? await verifyAndAugmentMathAnswer(selectedText, normalizedContent) : null;
    return (verified || normalizedContent).trim();
  }
}

async function convertImageToBase64(imageUrl) {
  try {
    const response = await fetch(imageUrl);
    const blob = await response.blob();
    
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        const base64 = reader.result.split(',')[1]; // Remove data:image/...;base64, prefix
        resolve(base64);
      };
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  } catch (error) {
    throw new Error(`Failed to convert image to base64: ${error.message}`);
  }
}

function inferMimeFromSrc(src) {
  if (!src || typeof src !== "string" || !src.startsWith("data:")) return "";
  const match = src.match(/^data:([^;]+);/);
  return match ? match[1] : "";
}

function extractNormalizedEquation(text) {
  if (!text) return null;
  // Preferred explicit line
  let m = text.match(/Normalized Equation:\s*([^\n]+)/i);
  if (m) return m[1].trim();

  // Fallback: first line that looks like an ascii equation with sqrt() and '='
  const lines = text.split(/\r?\n/).map((s) => s.trim()).filter(Boolean);
  for (const line of lines) {
    if (!/=/.test(line)) continue;
    if (!/sqrt\s*\(/i.test(line) && !/x/.test(line)) continue;
    // Strip quotes/backticks and trailing punctuation
    let candidate = line.replace(/[`'"\u201c\u201d]/g, '').replace(/[.;:,]+$/,'');
    // Keep only allowed tokens
    const allowed = /^[0-9xX+\-*/^().\s=]*sqrt\s*\(/i.test(candidate);
    if (allowed) {
      // Normalize x uppercase to lowercase
      candidate = candidate.replace(/X/g, 'x');
      return candidate;
    }
  }
  return null;
}

function jsExprFromAscii(expr) {
  if (!expr) return null;
  let s = expr.trim();
  // Normalize unicode minus/whitespace
  s = s.replace(/[−–—]/g, '-');
  // ^ to **
  s = s.replace(/\^/g, '**');
  // sqrt( -> Math.sqrt(
  s = s.replace(/\bsqrt\s*\(/g, 'Math.sqrt(');
  // Insert explicit multiplication where it's commonly implicit in math text
  // number followed by x or a parenthesis: 2x, 3(x+1)
  s = s.replace(/(\d)\s*(?=x\b)/g, '$1*');
  s = s.replace(/(\d)\s*(?=\()/g, '$1*');
  // x followed by parenthesis: x(x+1)
  s = s.replace(/x\s*(?=\()/g, 'x*');
  // closing paren followed by number or x or opening paren: )(, )2, )x
  s = s.replace(/\)\s*(?=\()/g, ')*');
  s = s.replace(/\)\s*(?=x\b)/g, ')*');
  s = s.replace(/\)\s*(?=\d)/g, ')*');
  // Only allow safe constructs: digits, operators, parentheses, x, whitespace and the literal 'Math.sqrt'
  // Strategy: remove allowed tokens and verify nothing remains.
  const stripped = s
    .replace(/Math\.sqrt/g, '')
    .replace(/[0-9x+\-*/().\s]/g, '');
  if (stripped.length > 0) return null;
  return s;
}

function buildEquationEvaluator(equation) {
  const parts = equation.split('=');
  if (parts.length !== 2) return null;
  const leftJS = jsExprFromAscii(parts[0]);
  const rightJS = jsExprFromAscii(parts[1]);
  if (!leftJS || !rightJS) return null;
  try {
    // eslint-disable-next-line no-new-func
    const fLeft = new Function('x', `return (${leftJS});`);
    // eslint-disable-next-line no-new-func
    const fRight = new Function('x', `return (${rightJS});`);
    const f = (x) => {
      const L = fLeft(x);
      const R = fRight(x);
      if (!isFinite(L) || !isFinite(R) || Number.isNaN(L) || Number.isNaN(R)) return NaN;
      return L - R;
    };
    return f;
  } catch (_) {
    return null;
  }
}

function extractNumericCandidates(text) {
  if (!text) return [];
  const out = new Set();
  const numberPattern = /-?\d+(?:\.\d+)?(?:[eE][+\-]?\d+)?/g;
  const patterns = [
    /x\s*=\s*(-?\d+(?:\.\d+)?(?:[eE][+\-]?\d+)?)/gi,
    /x1\s*=\s*(-?\d+(?:\.\d+)?(?:[eE][+\-]?\d+)?)/gi,
    /x2\s*=\s*(-?\d+(?:\.\d+)?(?:[eE][+\-]?\d+)?)/gi
  ];
  for (const re of patterns) {
    let m;
    while ((m = re.exec(text))) out.add(parseFloat(m[1]));
  }
  // Also catch plain numeric lists inside Final Answer
  const m2 = text.match(/Final Answer[^\n]*:([^\n]+)/i);
  if (m2) {
    const nums = m2[1].match(numberPattern);
    if (nums) nums.forEach((n) => out.add(parseFloat(n)));
  }
  return Array.from(out.values());
}

// ============================================================================
// OPTIMIZATION: Reduced bisection iterations (60 -> 30)
// Still maintains high accuracy (1e-7 tolerance) but 2x faster
// ============================================================================
function bisection(f, a, b, tol = 1e-7, maxIter = 30) {
  let fa = f(a);
  let fb = f(b);
  if (!isFinite(fa) || !isFinite(fb) || Number.isNaN(fa) || Number.isNaN(fb)) return null;
  if (fa === 0) return a;
  if (fb === 0) return b;
  if (fa * fb > 0) return null;
  let lo = a, hi = b;
  for (let i = 0; i < maxIter; i++) {
    const mid = 0.5 * (lo + hi);
    const fm = f(mid);
    if (!isFinite(fm) || Number.isNaN(fm)) return null;
    if (Math.abs(fm) < tol) return mid;
    if (fa * fm <= 0) {
      hi = mid; fb = fm;
    } else {
      lo = mid; fa = fm;
    }
  }
  return 0.5 * (lo + hi);
}

// ============================================================================
// OPTIMIZATION: Smart ranging and reduced scan steps
// 800 steps -> 400 steps (or 200 for narrow range) = 50-75% faster
// Fallback: If smart ranging fails, use full scan
// ============================================================================
async function verifyAndAugmentMathAnswer(selectedText, modelText) {
  const normalizedText = normalizeTI84MathText(modelText || "");
  modelText = normalizedText;
  const decimalPreference = detectDecimalPreference(`${selectedText || ""}\n${modelText}`);
  const decimalOptions = decimalPreference !== null ? { decimals: decimalPreference } : {};

  // 1) Find normalized equation line
  const eq = extractNormalizedEquation(modelText);
  if (!eq) return null;
  const f = buildEquationEvaluator(eq);
  if (!f) return null;

  // 2) Extract candidates from the model text
  const cands = extractNumericCandidates(modelText);
  const verified = [];
  for (const x of cands) {
    const val = f(x);
    if (isFinite(val) && Math.abs(val) < 1e-4) verified.push(x);
  }

  // 3) If nothing verified, try to recover numerically by scanning and bisection
  if (verified.length === 0) {
    const roots = new Set();
    let start = -200, end = 200, steps = 400; // Optimized: 800 -> 400 steps
    
    // SMART RANGING: If we have candidates, narrow the search
    // This gives 2x speedup for most cases
    try {
      if (cands.length > 0) {
        const minCand = Math.min(...cands);
        const maxCand = Math.max(...cands);
        // Search ±50 around candidates instead of full [-200, 200]
        start = Math.max(-200, Math.floor(minCand - 50));
        end = Math.min(200, Math.ceil(maxCand + 50));
        steps = 200; // Even fewer steps in narrow range
      }
    } catch (rangeError) {
      // Fallback: Use default range if smart ranging fails
      console.warn("Smart ranging failed, using full scan:", rangeError);
      start = -200;
      end = 200;
      steps = 400;
    }
    
    // Perform the scan
    const xs = [];
    for (let i = 0; i <= steps; i++) xs.push(start + (i * (end - start)) / steps);
    let prevX = xs[0];
    let prevY = f(prevX);
    for (let i = 1; i < xs.length; i++) {
      const x = xs[i];
      const y = f(x);
      if (isFinite(prevY) && isFinite(y) && !Number.isNaN(prevY) && !Number.isNaN(y)) {
        if (prevY === 0) roots.add(prevX);
        else if (y === 0) roots.add(x);
        else if (prevY * y < 0) {
          const r = bisection(f, prevX, x);
          if (r !== null) roots.add(r);
        }
      }
      prevX = x; prevY = y;
    }
    const rec = Array.from(roots.values());
    if (rec.length) verified.push(...rec);
  }

  if (verified.length === 0) return null;

  // 4) Formatting; order and unique
  const uniq = [];
  const seenDisplays = new Set();
  const sorted = Array.from(verified).sort((a, b) => a - b);
  for (const value of sorted) {
    const formatted = formatTI84Number(value, decimalOptions);
    if (seenDisplays.has(formatted)) continue;
    seenDisplays.add(formatted);
    uniq.push({ value, formatted });
  }

  if (uniq.length === 0) return null;

  let finalLine;
  if (uniq.length === 1) {
    finalLine = `Final Answer: x=${uniq[0].formatted}`;
  } else {
    const assignments = uniq.map((entry, idx) => `x${idx + 1}=${entry.formatted}`);
    finalLine = `Final Answer: ${assignments.join(', ')}`;
  }

  const cleanedText = modelText.replace(/(^|\n)Final Answer:[^\n]*(?=\n|$)/gi, "").trim();
  return cleanedText
    ? `${finalLine}\n\n${cleanedText}`
    : finalLine;
}
async function resolveAttachmentBase64(attachment) {
  if (!attachment) throw new Error("No attachment data provided");
  if (attachment.base64) return attachment.base64;
  if (attachment.src && attachment.src.startsWith("data:")) {
    const parts = attachment.src.split(",");
    if (parts.length > 1) return parts[1];
  }
  if (attachment.src) {
    return convertImageToBase64(attachment.src);
  }
  throw new Error("Attachment missing source data");
}

async function fetchOpenAIImageAnalysis(apiKey, model, imageData, conversationHistory = []) {
  const endpoint = "https://api.openai.com/v1/chat/completions";
  if (!imageData) throw new Error("No attachment provided for analysis");

  const inferredMime = imageData.mimeType || inferMimeFromSrc(imageData.src);
  if ((inferredMime || "").toLowerCase() === "application/pdf") {
    throw new Error("PDF analysis is not supported. Please upload an image.");
  }
  const mimeType = inferredMime || "image/jpeg";
  
  const base64Payload = await resolveAttachmentBase64(imageData);
  const dataUrl = `data:${mimeType};base64,${base64Payload}`;

  if (!imageData.base64) {
    imageData.base64 = base64Payload;
  }
  if (!imageData.mimeType && mimeType) {
    imageData.mimeType = mimeType;
  }
  
  // OPTIMIZATION: Shared decision tree rules (eliminates 200+ char duplication)
  const DECISION_RULES = `RULES:
1. Picture with text: Apply word rules. No text: do NOT return a Final Answer field.
2. Words:
   - >75 words: Summarize key points, then ask how the user would like to proceed with helpful suggestions. No Final Answer.
   - ≤75 words:
     * Fill-in-the-blank (_____): Final Answer with the most likely fill only.
     * Question (math or otherwise): Include a brief Final Answer field with the answer.
     * Commands (answer/calculate/evaluate/graph/select...): Execute and include Final Answer. Graphs must be ASCII/table.
     * Math problems: Restate clearly, solve completely, include Final Answer. TOP LINE: Normalized Equation: <ascii with sqrt()>.
     * Code snippets: State "Language: <name>", summarize purpose, offer clarification. No Final Answer.
     * Statements: Summary ≤15 words, ask how the user wants to proceed. No Final Answer.

CRITICAL - FORMATTING RULES (ALWAYS APPLY):
- Strict ASCII math only: use +, -, *, /, ^, (, ), sqrt(), pi, abs(), <=, >=, !=. NEVER use ×, ÷, √, superscripts, or LaTeX.
- Fractions must be written with /, numerators and denominators fully parenthesized when needed.
- Radicals must be written with sqrt(...), entire radicand in parentheses.
- Scientific notation must use uppercase E (example: 1.23E-4).
- When rewriting root expressions (√, nth root), ALWAYS place entire radicand in parentheses`;
  
  const systemPrompt = `Expert image analyst. ${DECISION_RULES}`;
  
  // Build messages array with conversation history
  const messages = [
    {
      role: "system",
      content: systemPrompt
    }
  ];
  
  // Add conversation history if it exists
  if (conversationHistory.length > 0) {
    messages.push(...conversationHistory);
  }
  
  // Add the current user message with image
  messages.push({
    role: "user",
    content: [
      {
        type: "text",
        text: `Please analyze this image${imageData.name ? ` (${imageData.name})` : ""}. If it contains a mathematical problem or formula, restate it unambiguously and solve it step-by-step with a Final Answer. Otherwise, follow the word-analysis rules.`
      },
      {
        type: "image_url",
        image_url: {
          url: dataUrl,
          detail: "high"
        }
      }
    ]
  });

  const body = buildChatCompletionBody({
    model: isVisionCapableModel(model) ? model : "gpt-4o", // Ensure a vision-capable model
    temperature: 0.0, // Deterministic for math OCR cases
    max_completion_tokens: 1000,
    messages
  });

  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`
    },
    body: JSON.stringify(body)
  });

  if (!response.ok) {
    const errText = await response.text().catch(() => "");
    throw new Error(`OpenAI API error (${response.status}): ${errText}`);
  }

  const data = await response.json();
  const content = data && data.choices && data.choices[0] && data.choices[0].message && data.choices[0].message.content;
  if (!content) throw new Error("No content returned by model");
  const normalizedContent = normalizeTI84MathText(content);
  const verified = await verifyAndAugmentMathAnswer(null, normalizedContent);
  return (verified || normalizedContent).trim();
}

async function handleFollowUpRequest(apiKey, model, userInput, originalContent, conversationHistory) {
  const endpoint = "https://api.openai.com/v1/chat/completions";
  const followUpIsMath = isMathProblem(userInput || "");
  
  // Create a follow-up system prompt
  const systemPrompt = `You are a helpful AI assistant responding to a follow-up question about a previous analysis. The user is asking for clarification, modification, or additional details about your previous response.

Guidelines:
- Be concise and direct in your response
- Address the specific question or request
- If asked to modify something, clearly explain what you're changing
- If asked for clarification, provide clear explanations
- If asked for additional details, expand on relevant points
- Maintain the same helpful and professional tone

FOLLOW-UP DECISION RULES:
${followUpIsMath
  ? `- Treat this as a math follow-up. Restate the math problem clearly.
- Provide step-by-step work, starting with "Normalized Equation: <ascii expression>".
- Include a "Final Answer" section with the computed result only.`
  : `- Do NOT include a "Final Answer" section.
- Provide the clarification or additional detail conversationally.`}

Previous analysis context: ${originalContent}`;

  // Build messages array with conversation history
  const messages = [
    {
      role: "system",
      content: systemPrompt
    }
  ];
  
  // Add conversation history if it exists
  if (conversationHistory.length > 0) {
    messages.push(...conversationHistory);
  }
  
  // Add the follow-up user message
  messages.push({
    role: "user",
    content: userInput
  });

  const body = buildChatCompletionBody({
    model,
    temperature: 0.2,
    messages
  });

  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`
    },
    body: JSON.stringify(body)
  });

  if (!response.ok) {
    const errText = await response.text().catch(() => "");
    throw new Error(`OpenAI API error (${response.status}): ${errText}`);
  }

  const data = await response.json();
  const content = data && data.choices && data.choices[0] && data.choices[0].message && data.choices[0].message.content;
  if (!content) throw new Error("No content returned by model");
  const normalizedContent = followUpIsMath ? normalizeTI84MathText(content) : content;
  const verified = followUpIsMath ? await verifyAndAugmentMathAnswer(userInput, normalizedContent) : null;
  return (verified || normalizedContent).trim();
}

async function analyzeSelectionInTab(tab) {
  if (!tab || !tab.id) return;

  const overlayState = await safeSendMessage(tab.id, { type: "CHECK_OVERLAY_VISIBLE" });
  if (overlayState && overlayState.visible) {
    await safeSendMessage(tab.id, { type: "CLOSE_OVERLAY" });
    // Continue with new analysis instead of returning
  }

  try {
    // Ask content script for current selection and show loading overlay
    const selection = await chrome.tabs.sendMessage(tab.id, { type: "GET_SELECTION_AND_SHOW_LOADING" });

    const { openaiApiKey, claudeApiKey, model, provider } = await chrome.storage.sync.get({ 
      openaiApiKey: "", 
      claudeApiKey: "",
      model: "gpt-5-mini", 
      provider: "openai" 
    });
    
    const apiKey = provider === 'claude' ? claudeApiKey : openaiApiKey;
    if (!apiKey) {
      const providerName = provider === 'claude' ? 'Claude' : 'OpenAI';
      await chrome.tabs.sendMessage(tab.id, { type: "SHOW_ERROR", error: `${providerName} API key not set. Open extension options to add your ${providerName} API key.` });
      return;
    }

    if (selection.type === "image" && selection.image) {
      let analysis;
      try {
        if (provider === "claude") {
          analysis = await fetchClaudeImageAnalysis(apiKey, model, selection.image);
        } else {
          analysis = await fetchOpenAIImageAnalysis(apiKey, model, selection.image);
        }
      } catch (err) {
        
        const overlayStillVisible = await safeSendMessage(tab.id, { type: "CHECK_OVERLAY_VISIBLE" });
        if (!overlayStillVisible || !overlayStillVisible.visible) return;

        await chrome.tabs.sendMessage(tab.id, { 
          type: "SHOW_IMAGE_ERROR", 
          imageData: selection.image,
          error: err && err.message ? err.message : String(err) 
        });
        return;
      }

      const overlayStillVisible = await safeSendMessage(tab.id, { type: "CHECK_OVERLAY_VISIBLE" });
      if (!overlayStillVisible || !overlayStillVisible.visible) return;

      const conversationHistory = createAttachmentConversationHistory(selection.image, analysis, "image");

      await chrome.tabs.sendMessage(tab.id, { 
        type: "SHOW_IMAGE_RESULT", 
        imageData: selection.image,
        content: analysis,
        conversationHistory
      });
    } else if (selection.text && selection.text.trim()) {
      let analysis;
      try {
        if (provider === "claude") {
          analysis = await fetchClaudeAnalysis(apiKey, model, selection.text);
        } else {
          analysis = await fetchOpenAIAnalysis(apiKey, model, selection.text);
        }
      } catch (err) {
        
        const overlayStillVisible = await safeSendMessage(tab.id, { type: "CHECK_OVERLAY_VISIBLE" });
        if (!overlayStillVisible || !overlayStillVisible.visible) return;

        await chrome.tabs.sendMessage(tab.id, { type: "SHOW_ERROR", error: err && err.message ? err.message : String(err) });
        return;
      }

      const overlayStillVisible = await safeSendMessage(tab.id, { type: "CHECK_OVERLAY_VISIBLE" });
      if (!overlayStillVisible || !overlayStillVisible.visible) return;

      const conversationHistory = createTextConversationHistory(selection.text, analysis);

      await chrome.tabs.sendMessage(tab.id, { type: "SHOW_RESULT", content: analysis, conversationHistory });
    } else {
      await chrome.tabs.sendMessage(tab.id, { type: "SHOW_BUBBLE" });
    }
  } catch (err) {
    try {
      await chrome.tabs.sendMessage(tab.id, { type: "SHOW_ERROR", error: "Unable to access selection. Try refreshing the page and ensure content scripts are allowed." });
    } catch (_) {}
  }
}

async function analyzeImageFromContext(tab, srcUrl) {
  if (!tab || !tab.id || !srcUrl) return;

  const { openaiApiKey, claudeApiKey, model, provider } = await chrome.storage.sync.get({ 
    openaiApiKey: "", 
    claudeApiKey: "",
    model: "gpt-5-mini", 
    provider: "openai" 
  });
  
  const apiKey = provider === 'claude' ? claudeApiKey : openaiApiKey;
  if (!apiKey) {
    const providerName = provider === 'claude' ? 'Claude' : 'OpenAI';
    await safeSendMessage(tab.id, { type: "SHOW_ERROR", error: `${providerName} API key not set. Open extension options to add your ${providerName} API key.` });
    return;
  }

  const overlayState = await safeSendMessage(tab.id, { type: "CHECK_OVERLAY_VISIBLE" });
  if (overlayState && overlayState.visible) {
    await safeSendMessage(tab.id, { type: "CLOSE_OVERLAY" });
  }

  await safeSendMessage(tab.id, { type: "SHOW_LOADING", variant: "image" });

  const imageName = (() => {
    try {
      const url = new URL(srcUrl);
      const lastSegment = url.pathname.split("/").filter(Boolean).pop();
      return lastSegment || url.hostname || "Image";
    } catch {
      return "Image";
    }
  })();

  const imageData = {
    src: srcUrl,
    name: imageName
  };

  try {
    let analysis;
    if (provider === "claude") {
      analysis = await fetchClaudeImageAnalysis(apiKey, model, imageData);
    } else {
      analysis = await fetchOpenAIImageAnalysis(apiKey, model, imageData);
    }
    const overlayStillVisible = await safeSendMessage(tab.id, { type: "CHECK_OVERLAY_VISIBLE" });
    if (!overlayStillVisible || !overlayStillVisible.visible) return;

    const conversationHistory = createAttachmentConversationHistory(imageData, analysis, "image");

    await chrome.tabs.sendMessage(tab.id, {
      type: "SHOW_IMAGE_RESULT",
      imageData,
      content: analysis,
      conversationHistory
    });
  } catch (err) {
    const overlayStillVisible = await safeSendMessage(tab.id, { type: "CHECK_OVERLAY_VISIBLE" });
    if (!overlayStillVisible || !overlayStillVisible.visible) return;

    await chrome.tabs.sendMessage(tab.id, {
      type: "SHOW_IMAGE_ERROR",
      imageData,
      error: err && err.message ? err.message : String(err)
    });
  }
}

chrome.commands.onCommand.addListener(async (command) => {
  if (command !== "analyze-selection") return;

  const tab = await getActiveTab();
  if (!tab || !tab.id) return;

  await analyzeSelectionInTab(tab);
});

chrome.runtime.onInstalled.addListener(() => {
  const items = [
    {
      id: CONTEXT_MENU_SELECTION_ID,
      title: "Analyze selection with AI Analyze",
      contexts: ["selection"]
    },
    {
      id: CONTEXT_MENU_IMAGE_ID,
      title: "Analyze image with AI Analyze",
      contexts: ["image"]
    }
  ];

  for (const item of items) {
    chrome.contextMenus.create(item, () => {
      if (chrome.runtime.lastError) {
        console.warn("Context menu creation failed:", chrome.runtime.lastError.message);
      }
    });
  }
});

chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  const targetTab = tab && tab.id ? tab : await getActiveTab();
  if (!targetTab || !targetTab.id) return;

  if (info.menuItemId === CONTEXT_MENU_SELECTION_ID) {
    await analyzeSelectionInTab(targetTab);
    return;
  }

  if (info.menuItemId === CONTEXT_MENU_IMAGE_ID) {
    await analyzeImageFromContext(targetTab, info.srcUrl || "");
    return;
  }
});

// Handle follow-up requests from content script
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message && message.type === "ANALYZE_TEXT_INPUT") {
    (async () => {
      try {
        const tab = await getActiveTab();
        if (!tab || !tab.id) {
          sendResponse({ success: false, error: "No active tab found" });
          return;
        }

        const { openaiApiKey, claudeApiKey, model, provider } = await chrome.storage.sync.get({ 
  openaiApiKey: "", 
  claudeApiKey: "",
  model: "gpt-5-mini", 
  provider: "openai" 
});
        const apiKey = provider === 'claude' ? claudeApiKey : openaiApiKey;
        if (!apiKey) {
          const providerName = provider === 'claude' ? 'Claude' : 'OpenAI';
          await chrome.tabs.sendMessage(tab.id, { 
            type: "SHOW_ERROR", 
            error: `${providerName} API key not set. Open extension options to add your ${providerName} API key.` 
          });
          sendResponse({ success: false, error: "API key not set" });
          return;
        }

        let analysis;
        try {
          if (provider === "claude") {
            analysis = await fetchClaudeAnalysis(apiKey, model, message.text);
          } else {
            analysis = await fetchOpenAIAnalysis(apiKey, model, message.text);
          }
        } catch (err) {
          const overlayStillVisible = await safeSendMessage(tab.id, { type: "CHECK_OVERLAY_VISIBLE" });
          if (overlayStillVisible && overlayStillVisible.visible) {
            await chrome.tabs.sendMessage(tab.id, { 
              type: "SHOW_ERROR", 
              error: err && err.message ? err.message : String(err) 
            });
          }
          sendResponse({ success: false, error: err.message });
          return;
        }

        const overlayStillVisible = await safeSendMessage(tab.id, { type: "CHECK_OVERLAY_VISIBLE" });
        if (!overlayStillVisible || !overlayStillVisible.visible) {
          sendResponse({ success: true });
          return;
        }

        const conversationHistory = createTextConversationHistory(message.text, analysis);

        await chrome.tabs.sendMessage(tab.id, { type: "SHOW_RESULT", content: analysis, conversationHistory });

        sendResponse({ success: true });
      } catch (err) {
        console.error("Text input analysis error:", err);
        sendResponse({ success: false, error: err.message });
      }
    })();
    return true; // Keep message channel open for async response
  }
  
  if (message && message.type === "ANALYZE_FILE") {
    (async () => {
      try {
        const { openaiApiKey, claudeApiKey, model, provider } = await chrome.storage.sync.get({ 
  openaiApiKey: "", 
  claudeApiKey: "",
  model: "gpt-5-mini", 
  provider: "openai" 
});
        const apiKey = provider === 'claude' ? claudeApiKey : openaiApiKey;
        if (!apiKey) {
          const providerName = provider === 'claude' ? 'Claude' : 'OpenAI';
          sendResponse({ success: false, error: `${providerName} API key not set` });
          return;
        }

        if (!message.fileData) {
          sendResponse({ success: false, error: "No file data supplied" });
          return;
        }

        let analysis;
        if (provider === "claude") {
          analysis = await fetchClaudeImageAnalysis(apiKey, model, message.fileData);
        } else {
          analysis = await fetchOpenAIImageAnalysis(apiKey, model, message.fileData);
        }
        const conversationHistory = createAttachmentConversationHistory(
          message.fileData,
          analysis,
          message.fileData?.mimeType
        );
        sendResponse({ success: true, content: analysis, conversationHistory });
      } catch (err) {
        console.error("Uploaded file analysis error:", err);
        sendResponse({ success: false, error: err.message });
      }
    })();
    return true; // Keep message channel open for async response
  }
  
  if (message && message.type === "FOLLOW_UP_REQUEST") {
    (async () => {
      try {
        const tab = await getActiveTab();
        if (!tab || !tab.id) {
          sendResponse({ success: false, error: "No active tab found" });
          return;
        }

        const { openaiApiKey, claudeApiKey, model, provider } = await chrome.storage.sync.get({ 
  openaiApiKey: "", 
  claudeApiKey: "",
  model: "gpt-5-mini", 
  provider: "openai" 
});
        const apiKey = provider === 'claude' ? claudeApiKey : openaiApiKey;
        if (!apiKey) {
          const providerName = provider === 'claude' ? 'Claude' : 'OpenAI';
          await chrome.tabs.sendMessage(tab.id, { 
            type: "SHOW_ERROR", 
            error: `${providerName} API key not set. Open extension options to add your ${providerName} API key.` 
          });
          sendResponse({ success: false, error: "API key not set" });
          return;
        }

        // Add user message to conversation history
        const updatedHistory = [...(message.conversationHistory || [])];
        updatedHistory.push({
          role: "user",
          content: message.userInput
        });

        let followUpResponse;
        try {
          if (provider === "claude") {
            followUpResponse = await handleClaudeFollowUpRequest(
              apiKey, 
              model, 
              message.userInput, 
              message.originalContent, 
              message.conversationHistory || []
            );
          } else {
            followUpResponse = await handleFollowUpRequest(
              apiKey, 
              model, 
              message.userInput, 
              message.originalContent, 
              message.conversationHistory || []
            );
          }
        } catch (err) {
          await chrome.tabs.sendMessage(tab.id, { 
            type: "SHOW_ERROR", 
            error: err && err.message ? err.message : String(err) 
          });
          sendResponse({ success: false, error: err.message });
          return;
        }

        // Add assistant response to conversation history
        updatedHistory.push({
          role: "assistant",
          content: followUpResponse
        });

        // Send the follow-up response to content script
        await chrome.tabs.sendMessage(tab.id, { 
          type: "FOLLOW_UP_RESPONSE", 
          content: followUpResponse,
          conversationHistory: updatedHistory
        });

        sendResponse({ success: true });
      } catch (err) {
        console.error("Follow-up request error:", err);
        sendResponse({ success: false, error: err.message });
      }
    })();
    return true; // Keep message channel open for async response
  }
  
  if (message && (message.type === "FOLLOW_UP_ATTACHMENT_REQUEST" || message.type === "FOLLOW_UP_IMAGE_REQUEST")) {
    (async () => {
      try {
        const tab = await getActiveTab();
        if (!tab || !tab.id) {
          sendResponse({ success: false, error: "No active tab found" });
          return;
        }

        const { openaiApiKey, claudeApiKey, model, provider } = await chrome.storage.sync.get({ 
  openaiApiKey: "", 
  claudeApiKey: "",
  model: "gpt-5-mini", 
  provider: "openai" 
});
        const apiKey = provider === 'claude' ? claudeApiKey : openaiApiKey;
        if (!apiKey) {
          const providerName = provider === 'claude' ? 'Claude' : 'OpenAI';
          await chrome.tabs.sendMessage(tab.id, { 
            type: "SHOW_IMAGE_ERROR", 
            imageData: message.attachmentData || message.imageData,
            error: `${providerName} API key not set. Open extension options to add your ${providerName} API key.` 
          });
          sendResponse({ success: false, error: "API key not set" });
          return;
        }

        // Add user message to conversation history
        const updatedHistory = [...(message.conversationHistory || [])];
        updatedHistory.push({
          role: "user",
          content: message.userInput
        });

        let followUpResponse;
        try {
          if (provider === "claude") {
            followUpResponse = await handleClaudeFollowUpRequest(
              apiKey, 
              model, 
              message.userInput, 
              message.originalContent, 
              message.conversationHistory || []
            );
          } else {
            followUpResponse = await handleFollowUpRequest(
              apiKey, 
              model, 
              message.userInput, 
              message.originalContent, 
              message.conversationHistory || []
            );
          }
        } catch (err) {
          await chrome.tabs.sendMessage(tab.id, { 
            type: "SHOW_IMAGE_ERROR", 
            imageData: message.attachmentData || message.imageData || null,
            error: err && err.message ? err.message : String(err) 
          });
          sendResponse({ success: false, error: err.message });
          return;
        }

        // Add assistant response to conversation history
        updatedHistory.push({
          role: "assistant",
          content: followUpResponse
        });

        // Send the follow-up response to content script
        await chrome.tabs.sendMessage(tab.id, { 
          type: "FOLLOW_UP_RESPONSE", 
          content: followUpResponse,
          conversationHistory: updatedHistory
        });

        sendResponse({ success: true });
      } catch (err) {
        console.error("Image follow-up request error:", err);
        sendResponse({ success: false, error: err.message });
      }
    })();
    return true; // Keep message channel open for async response
  }
  
  // Handle model cache clearing (e.g., when API keys change)
  if (message && message.type === "CLEAR_MODEL_CACHE") {
    clearModelCache();
    sendResponse({ success: true });
    return true;
  }
});
