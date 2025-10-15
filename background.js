// Background service worker for handling command and AI calls

async function getActiveTab() {
  const tabs = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
  return tabs && tabs.length ? tabs[0] : null;
}

function isMathProblem(text) {
  // Remove extra whitespace and normalize
  const normalizedText = text.trim().toLowerCase();
  
  // Check for mathematical expressions, equations, or problem indicators
  const mathPatterns = [
    // Equations with =, +, -, *, /, ^, etc.
    /[=+\-*/^()]/,
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

async function fetchOpenAIAnalysis(apiKey, model, selectedText) {
  const endpoint = "https://api.openai.com/v1/chat/completions";
  
  // Determine if this is a math problem
  const isMath = isMathProblem(selectedText);
  
  let systemPrompt, userPrompt;
  
  if (isMath) {
    systemPrompt = `You are an expert mathematics tutor with advanced data visualization capabilities. When given a math problem, provide a mathematically correct answer with clear, step-by-step reasoning. 

Format your response as follows:
• **Problem**: Restate the problem clearly
• **Solution Steps**: Show each step with clear explanations
• **Final Answer**: Provide the final answer clearly
• **Verification**: If applicable, show how to verify the answer
• **Visualization**: If the problem involves data, functions, or relationships that would benefit from a chart or graph, provide a Plotly visualization

For visualizations, use this format:
[CHART: plotly_code]
import plotly.graph_objects as go
import numpy as np

# Example for function graphing:
x = np.linspace(-10, 10, 1000)
y = (x + 3) / (x**2 + 4*x - 5)

fig = go.Figure()
fig.add_trace(go.Scatter(x=x, y=y, mode='lines', name='f(x)'))
fig.update_layout(
    title='Function Graph',
    xaxis_title='x',
    yaxis_title='f(x)',
    plot_bgcolor='rgba(0,0,0,0)',
    paper_bgcolor='rgba(0,0,0,0)',
    font=dict(color='white')
)
fig.update_xaxes(gridcolor='rgba(255,255,255,0.1)')
fig.update_yaxes(gridcolor='rgba(255,255,255,0.1)')
fig.show()
[END_CHART]

IMPORTANT: 
- Do NOT use LaTeX formatting symbols like \\(, \\), \\[, \\], or any other code formatting
- Write mathematical expressions in plain text using standard mathematical notation
- Use symbols like +, -, ×, ÷, =, <, >, ≤, ≥, √, π, etc. directly without any code wrapping
- When creating charts, use numpy for data generation and plotly for visualization
- Include proper titles, labels, and formatting for charts`;
    
    userPrompt = `Solve this math problem step by step:\n\n${selectedText}`;
  } else {
    systemPrompt = `You are a concise expert assistant with advanced data visualization capabilities. Provide a crisp, high-signal analysis of the user's selected text. Use bullet points where appropriate.

If the text contains data, statistics, trends, or relationships that would benefit from visualization, include a chart or graph using this format:
[CHART: plotly_code]
Your Plotly code here using numpy and plotly libraries
[END_CHART]

When creating visualizations:
- Use numpy for data generation and manipulation
- Use plotly for creating interactive charts
- Include proper titles, labels, and formatting
- Choose appropriate chart types (line, bar, scatter, pie, etc.) based on the data`;
    userPrompt = `Analyze the following text:\n\n${selectedText}`;
  }
  
  const body = {
    model: model || "gpt-4",
    temperature: isMath ? 0.1 : 0.2, // Lower temperature for math problems for more precise answers
    messages: [
      {
        role: "system",
        content: systemPrompt
      },
      {
        role: "user",
        content: userPrompt
      }
    ]
  };

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
  return content.trim();
}

chrome.commands.onCommand.addListener(async (command) => {
  if (command !== "analyze-selection") return;

  const tab = await getActiveTab();
  if (!tab || !tab.id) return;

  try {
    // Check if overlay is currently visible
    const overlayState = await chrome.tabs.sendMessage(tab.id, { type: "CHECK_OVERLAY_VISIBLE" });
    
    if (overlayState && overlayState.visible) {
      // If overlay is visible, close it
      await chrome.tabs.sendMessage(tab.id, { type: "CLOSE_OVERLAY" });
      return;
    }

    // If overlay is not visible, proceed with normal flow
    // Ask content script for current selection and show loading overlay
    const selection = await chrome.tabs.sendMessage(tab.id, { type: "GET_SELECTION_AND_SHOW_LOADING" });

    const selectedText = selection && selection.text ? selection.text.trim() : "";
    if (!selectedText) {
      await chrome.tabs.sendMessage(tab.id, { type: "SHOW_BUBBLE" });
      return;
    }

    const { apiKey, model } = await chrome.storage.sync.get({ apiKey: "", model: "gpt-4" });
    if (!apiKey) {
      await chrome.tabs.sendMessage(tab.id, { type: "SHOW_ERROR", error: "API key not set. Open extension options to add your OpenAI API key." });
      return;
    }

    let analysis;
    try {
      analysis = await fetchOpenAIAnalysis(apiKey, model, selectedText);
    } catch (err) {
      await chrome.tabs.sendMessage(tab.id, { type: "SHOW_ERROR", error: err && err.message ? err.message : String(err) });
      return;
    }

    await chrome.tabs.sendMessage(tab.id, { type: "SHOW_RESULT", content: analysis });
  } catch (err) {
    // Likely no content script on this page or other runtime error
    try {
      const tab = await getActiveTab();
      if (tab && tab.id) {
        await chrome.tabs.sendMessage(tab.id, { type: "SHOW_ERROR", error: "Unable to access selection. Try refreshing the page and ensure content scripts are allowed." });
      }
    } catch (_) {}
  }
});
