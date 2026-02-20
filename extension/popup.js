const statusEl = document.getElementById('status');
const startBtn = document.getElementById('startBtn');
const stopBtn = document.getElementById('stopBtn');
const transcriptEl = document.getElementById('transcript');

startBtn.addEventListener('click', () => {
    const customerLanguage = document.getElementById('customerLang').value;
    const agentLanguage = document.getElementById('agentLang').value;

    chrome.runtime.sendMessage({
        type: 'START_TRANSLATION',
        customerLanguage,
        agentLanguage
    });

    statusEl.textContent = 'Translation Active';
    statusEl.className = 'status active';
    startBtn.disabled = true;
    stopBtn.disabled = false;
    transcriptEl.textContent = 'Listening...';
});

stopBtn.addEventListener('click', () => {
    chrome.runtime.sendMessage({ type: 'STOP_TRANSLATION' });

    statusEl.textContent = 'Translation Inactive';
    statusEl.className = 'status inactive';
    startBtn.disabled = false;
    stopBtn.disabled = true;
});

// Update transcript when storage changes
chrome.storage.onChanged.addListener((changes) => {
    if (changes.transcript) {
        displayTranscript(changes.transcript.newValue);
    }
});

// Load existing transcript on popup open
chrome.storage.local.get(['transcript'], (result) => {
    if (result.transcript) {
        displayTranscript(result.transcript);
    }
});

function displayTranscript(transcript) {
    if (!transcript || transcript.length === 0) return;

    transcriptEl.innerHTML = transcript.map(entry => `
        <div class="entry">
            <strong>${entry.speaker}:</strong> ${entry.text}
            <br><em>${entry.translation}</em>
        </div>
    `).join('');

    transcriptEl.scrollTop = transcriptEl.scrollHeight;
}
