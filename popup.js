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

function getModelDisplayName(modelId) {
  if (!modelId) return '—';

  const modelMap = {
    'gpt-5-mini': 'GPT-5 Mini',
    'gpt-5-nano': 'GPT-5 Nano',
    'claude-3-5-sonnet-20241022': 'Claude 3.5 Sonnet',
    'claude-3-5-haiku-20241022': 'Claude 3.5 Haiku',
    'claude-3-opus-20240229': 'Claude 3 Opus',
    'claude-3-sonnet-20240229': 'Claude 3 Sonnet',
    'claude-3-haiku-20240307': 'Claude 3 Haiku'
  };

  return modelMap[modelId] || modelId;
}

function getProviderDisplayName(provider) {
  if (provider === 'claude') return 'Claude (Anthropic)';
  if (provider === 'openai') return 'OpenAI';
  return provider || '—';
}

document.addEventListener('DOMContentLoaded', async () => {
  const statusEl = document.getElementById('status');
  const openBtn = document.getElementById('openOptions');
  const providerSelect = document.getElementById('providerSelect');
  const modelSelect = document.getElementById('modelSelect');

  try {
    const { openaiApiKey, claudeApiKey, model, provider } = await getStoredSettings();

    // Migrate deprecated Claude 3 Sonnet and Haiku model ids to 3.5 Sonnet
    let effectiveModel = model;
    if (model === 'claude-3-sonnet-20240229' || model === 'claude-3-haiku-20240307') {
      effectiveModel = 'claude-3-5-sonnet-20241022';
      try { await persistSettings({ model: effectiveModel }); } catch (_) {}
    }

    // Set provider and model select values
    const currentProvider = provider || 'openai';
    providerSelect.value = currentProvider;
    modelSelect.value = effectiveModel;

    // Update status
    const currentApiKey = currentProvider === 'claude' ? claudeApiKey : openaiApiKey;
    if (currentApiKey) {
      if (currentProvider === 'claude' && !/^sk-ant-/i.test(currentApiKey)) {
        statusEl.textContent = 'Claude API key format looks invalid';
        statusEl.className = 'status warn';
      } else {
        statusEl.textContent = `${getProviderDisplayName(currentProvider)} API key is set`;
        statusEl.className = 'status ok';
      }
    } else {
      statusEl.textContent = `${getProviderDisplayName(currentProvider)} API key not set`;
      statusEl.className = 'status warn';
    }
  } catch (e) {
    statusEl.textContent = 'Unable to read settings';
    statusEl.className = 'status warn';
  }

  openBtn.addEventListener('click', () => {
    chrome.runtime.openOptionsPage();
  });
});
