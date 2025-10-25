async function loadSettings() {
  try {
    const { openaiApiKey, claudeApiKey, model, provider } = await chrome.storage.sync.get({
      openaiApiKey: '',
      claudeApiKey: '',
      model: 'gpt-5-mini',
      provider: 'openai'
    });
    // Migrate deprecated Claude 3 Sonnet and Haiku model ids to 3.5 Sonnet
    let effectiveModel = model;
    if (model === 'claude-3-sonnet-20240229' || model === 'claude-3-haiku-20240307') {
      effectiveModel = 'claude-3-5-sonnet-20241022';
      try { await chrome.storage.sync.set({ model: effectiveModel }); } catch (_) {}
    }

    document.getElementById('openaiApiKey').value = openaiApiKey || '';
    document.getElementById('claudeApiKey').value = claudeApiKey || '';
    document.getElementById('model').value = effectiveModel || 'gpt-5-mini';
    document.getElementById('provider').value = provider || 'openai';
    
    // Update model options and API key visibility based on provider
    updateModelOptions(provider || 'openai');
    updateApiKeyVisibility(provider || 'openai');
  } catch (_) {}
}

function updateModelOptions(provider) {
  const modelSelect = document.getElementById('model');
  const currentModel = modelSelect.value;
  
  // Clear existing options
  modelSelect.innerHTML = '';
  
  if (provider === 'openai') {
    modelSelect.innerHTML = `
      <option value="gpt-5-mini">GPT-5 Mini</option>
      <option value="gpt-5-nano">GPT-5 Nano</option>
    `;
  } else if (provider === 'claude') {
    modelSelect.innerHTML = `
      <option value="claude-3-5-sonnet-20241022">Claude 3.5 Sonnet</option>
      <option value="claude-3-5-haiku-20241022">Claude 3.5 Haiku</option>
      <option value="claude-3-opus-20240229">Claude 3 Opus</option>
    `;
  }
  
  // Try to maintain the current model if it's valid for the new provider
  if (modelSelect.querySelector(`option[value="${currentModel}"]`)) {
    modelSelect.value = currentModel;
  } else {
    // Set to first available option
    modelSelect.selectedIndex = 0;
  }
}

function updateApiKeyVisibility(provider) {
  const openaiSection = document.getElementById('openaiApiKeySection');
  const claudeSection = document.getElementById('claudeApiKeySection');
  
  if (provider === 'openai') {
    openaiSection.style.display = 'block';
    claudeSection.style.display = 'none';
  } else if (provider === 'claude') {
    openaiSection.style.display = 'none';
    claudeSection.style.display = 'block';
  }
}

async function saveSettings() {
  const statusEl = document.getElementById('status');
  const openaiApiKey = document.getElementById('openaiApiKey').value.trim();
  const claudeApiKey = document.getElementById('claudeApiKey').value.trim();
  const model = document.getElementById('model').value;
  const provider = document.getElementById('provider').value;

  try {
    await chrome.storage.sync.set({ openaiApiKey, claudeApiKey, model, provider });
    
    // Clear model cache when settings change (OPTIMIZATION: Model Caching)
    try {
      await chrome.runtime.sendMessage({ type: "CLEAR_MODEL_CACHE" });
    } catch (e) {
      // Ignore if background script isn't ready
      console.log("Cache clear skipped:", e);
    }
    
    if (provider === 'claude' && claudeApiKey && !/^sk-ant-/i.test(claudeApiKey)) {
      statusEl.textContent = 'Saved, but Claude key format looks invalid (expected sk-ant-...)';
    } else {
      statusEl.textContent = 'Saved';
    }
    setTimeout(() => (statusEl.textContent = ''), 1200);
  } catch (e) {
    statusEl.textContent = 'Failed to save';
  }
}

document.addEventListener('DOMContentLoaded', () => {
  loadSettings();
  document.getElementById('save').addEventListener('click', saveSettings);
  
  // Handle provider change
  document.getElementById('provider').addEventListener('change', (e) => {
    updateModelOptions(e.target.value);
    updateApiKeyVisibility(e.target.value);
  });
});