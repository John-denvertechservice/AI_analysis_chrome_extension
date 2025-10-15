async function loadSettings() {
  try {
    const { apiKey, model } = await chrome.storage.sync.get({ apiKey: '', model: 'gpt-4o-mini' });
    document.getElementById('apiKey').value = apiKey || '';
    document.getElementById('model').value = model || 'gpt-4o-mini';
  } catch (_) {}
}

async function saveSettings() {
  const statusEl = document.getElementById('status');
  const apiKey = document.getElementById('apiKey').value.trim();
  const model = document.getElementById('model').value;

  try {
    await chrome.storage.sync.set({ apiKey, model });
    statusEl.textContent = 'Saved';
    setTimeout(() => (statusEl.textContent = ''), 1200);
  } catch (e) {
    statusEl.textContent = 'Failed to save';
  }
}

document.addEventListener('DOMContentLoaded', () => {
  loadSettings();
  document.getElementById('save').addEventListener('click', saveSettings);
});
