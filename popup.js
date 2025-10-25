function updateModelOptions(provider) {
  const modelSelect = document.getElementById('modelSelect');
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

document.addEventListener('DOMContentLoaded', async () => {
  const statusEl = document.getElementById('status');
  const openBtn = document.getElementById('openOptions');
  const modelSelect = document.getElementById('modelSelect');
  const providerSelect = document.getElementById('providerSelect');

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
    
    const currentApiKey = provider === 'claude' ? claudeApiKey : openaiApiKey;
    if (currentApiKey) {
      if (provider === 'claude' && !/^sk-ant-/i.test(currentApiKey)) {
        statusEl.textContent = 'Claude API key format looks invalid (expected sk-ant-...)';
        statusEl.className = 'row warn';
      } else {
        statusEl.textContent = `${provider === 'claude' ? 'Claude' : 'OpenAI'} API key is set.`;
        statusEl.className = 'row ok';
      }
    } else {
      statusEl.textContent = `${provider === 'claude' ? 'Claude' : 'OpenAI'} API key not set.`;
      statusEl.className = 'row warn';
    }
    
    // Set the selected provider and update model options
    if (providerSelect) {
      providerSelect.value = provider || 'openai';
      updateModelOptions(provider || 'openai');
    }
    
    // Set the selected model
    if (modelSelect) {
      modelSelect.value = effectiveModel || 'gpt-5-mini';
    }
  } catch (e) {
    statusEl.textContent = 'Unable to read settings.';
    statusEl.className = 'row warn';
  }

  openBtn.addEventListener('click', () => {
    chrome.runtime.openOptionsPage();
  });

  // Handle provider selection change
  if (providerSelect) {
    providerSelect.addEventListener('change', async (e) => {
      updateModelOptions(e.target.value);
      try {
        await chrome.storage.sync.set({ provider: e.target.value });
        console.log('Provider updated to:', e.target.value);
      } catch (error) {
        console.error('Failed to save provider selection:', error);
      }
    });
  }

  // Handle model selection change
  if (modelSelect) {
    modelSelect.addEventListener('change', async (e) => {
      try {
        await chrome.storage.sync.set({ model: e.target.value });
        console.log('Model updated to:', e.target.value);
      } catch (error) {
        console.error('Failed to save model selection:', error);
      }
    });
  }
});
