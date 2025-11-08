const STORAGE_KEYS = ['openaiApiKey', 'claudeApiKey', 'model', 'provider'];
const DEFAULT_SETTINGS = {
  openaiApiKey: '',
  claudeApiKey: '',
  model: 'gpt-5-mini',
  provider: 'openai'
};

async function getStoredSettings() {
  try {
    const localValues = await chrome.storage.local.get(STORAGE_KEYS);
    const hasLocal = STORAGE_KEYS.some((key) => Object.prototype.hasOwnProperty.call(localValues, key));
    if (hasLocal) {
      return { ...DEFAULT_SETTINGS, ...localValues };
    }

    if (chrome.storage?.sync) {
      const legacyValues = await chrome.storage.sync.get(STORAGE_KEYS);
      const hasLegacy = STORAGE_KEYS.some((key) => Object.prototype.hasOwnProperty.call(legacyValues, key));
      if (hasLegacy) {
        const merged = { ...DEFAULT_SETTINGS, ...legacyValues };
        await chrome.storage.local.set(merged);
        try {
          await chrome.storage.sync.remove(STORAGE_KEYS);
        } catch (_) {}
        return merged;
      }
    }
  } catch (_) {}

  return { ...DEFAULT_SETTINGS };
}

async function persistSettings(values) {
  await chrome.storage.local.set(values);
  if (chrome.storage?.sync) {
    try {
      await chrome.storage.sync.remove(STORAGE_KEYS);
    } catch (_) {}
  }
}

document.addEventListener('DOMContentLoaded', async () => {
  const statusEl = document.getElementById('status');
  const openBtn = document.getElementById('openOptions');
  const providerSelect = document.getElementById('providerSelect');
  const modelSelect = document.getElementById('modelSelect');

  // Always ensure button opens the options page
  if (openBtn) {
    openBtn.addEventListener('click', () => {
      chrome.runtime.openOptionsPage();
    });
  }

  try {
    const { openaiApiKey, claudeApiKey, model, provider } = await getStoredSettings();

    // Migrate deprecated Claude 3 ids to 3.5 Sonnet
    let effectiveModel = model;
    if (model === 'claude-3-sonnet-20240229' || model === 'claude-3-haiku-20240307') {
      effectiveModel = 'claude-3-5-sonnet-20241022';
      try { await persistSettings({ model: effectiveModel }); } catch (_) {}
    }

    const currentProvider = provider || 'openai';
    if (providerSelect) providerSelect.value = currentProvider;

    // Adjust model options to match provider
    if (modelSelect) {
      if (currentProvider === 'openai') {
        modelSelect.innerHTML = `
          <option value="gpt-5-mini">GPT-5 Mini</option>
          <option value="gpt-5-nano">GPT-5 Nano</option>
        `;
      } else {
        modelSelect.innerHTML = `
          <option value="claude-3-5-sonnet-20241022">Claude 3.5 Sonnet</option>
          <option value="claude-3-5-haiku-20241022">Claude 3.5 Haiku</option>
          <option value="claude-3-opus-20240229">Claude 3 Opus</option>
        `;
      }
      // Set current model if present, otherwise first option
      modelSelect.value = effectiveModel || modelSelect.options[0]?.value || 'gpt-5-mini';
    }

    // Status based on API key presence
    const currentApiKey = currentProvider === 'claude' ? claudeApiKey : openaiApiKey;
    if (currentApiKey) {
      if (currentProvider === 'claude' && !/^sk-ant-/i.test(currentApiKey)) {
        statusEl.textContent = 'Claude API key format looks invalid';
        statusEl.className = 'status warn';
      } else {
        statusEl.textContent = `${currentProvider === 'claude' ? 'Claude' : 'OpenAI'} API key is set`;
        statusEl.className = 'status ok';
      }
    } else {
      statusEl.textContent = `${currentProvider === 'claude' ? 'Claude' : 'OpenAI'} API key not set`;
      statusEl.className = 'status warn';
    }

    // Persist selection changes from popup for convenience
    if (providerSelect) {
      providerSelect.addEventListener('change', async () => {
        const newProvider = providerSelect.value;
        // Update model options when provider changes
        if (modelSelect) {
          if (newProvider === 'openai') {
            modelSelect.innerHTML = `
              <option value="gpt-5-mini">GPT-5 Mini</option>
              <option value="gpt-5-nano">GPT-5 Nano</option>
            `;
          } else {
            modelSelect.innerHTML = `
              <option value="claude-3-5-sonnet-20241022">Claude 3.5 Sonnet</option>
              <option value="claude-3-5-haiku-20241022">Claude 3.5 Haiku</option>
              <option value="claude-3-opus-20240229">Claude 3 Opus</option>
            `;
          }
        }
        await persistSettings({ provider: newProvider, model: modelSelect?.value });
      });
    }
    if (modelSelect) {
      modelSelect.addEventListener('change', async () => {
        await persistSettings({ model: modelSelect.value });
      });
    }
  } catch (_) {
    if (statusEl) {
      statusEl.textContent = 'Unable to read settings';
      statusEl.className = 'status warn';
    }
  }
});
