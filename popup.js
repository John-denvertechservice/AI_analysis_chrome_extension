document.addEventListener('DOMContentLoaded', async () => {
  const statusEl = document.getElementById('status');
  const openBtn = document.getElementById('openOptions');

  try {
    const { apiKey } = await chrome.storage.sync.get({ apiKey: '' });
    if (apiKey) {
      statusEl.textContent = 'API key is set.';
      statusEl.className = 'row ok';
    } else {
      statusEl.textContent = 'API key not set.';
      statusEl.className = 'row warn';
    }
  } catch (e) {
    statusEl.textContent = 'Unable to read settings.';
    statusEl.className = 'row warn';
  }

  openBtn.addEventListener('click', () => {
    chrome.runtime.openOptionsPage();
  });
});
