const statusEl = document.getElementById('status');
const startBtn = document.getElementById('startBtn');
const stopBtn = document.getElementById('stopBtn');
const targetLangEl = document.getElementById('targetLang');

function setActiveUI(active, lang) {
    if (active) {
        statusEl.textContent = 'Listening…';
        statusEl.className = 'status active';
        startBtn.disabled = true;
        stopBtn.disabled = false;
        if (lang) targetLangEl.value = lang;
        targetLangEl.disabled = true;
    } else {
        statusEl.textContent = 'Not running';
        statusEl.className = 'status inactive';
        startBtn.disabled = false;
        stopBtn.disabled = true;
        targetLangEl.disabled = false;
    }
}

startBtn.addEventListener('click', () => {
    const targetLanguage = targetLangEl.value;
    chrome.storage.local.set({ targetLanguage });
    chrome.runtime.sendMessage({ type: 'START', targetLanguage });
    setActiveUI(true, targetLanguage);
});

stopBtn.addEventListener('click', () => {
    chrome.runtime.sendMessage({ type: 'STOP' });
    setActiveUI(false);
});

// Reflect whatever background.js is actually doing (popup is ephemeral —
// it may reopen mid-session).
chrome.runtime.sendMessage({ type: 'GET_STATUS' }, (response) => {
    if (response) setActiveUI(response.isActive, response.targetLanguage);
});

chrome.storage.local.get(['targetLanguage'], (result) => {
    if (result.targetLanguage) targetLangEl.value = result.targetLanguage;
});
