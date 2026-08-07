// Injected on demand (via chrome.scripting.executeScript) into whichever tab
// the user started Grey Parrot on. Just renders a subtitle overlay — no page
// hooks, no mic/WebRTC access, works on any page with a video.

(() => {
    if (window.__greyParrotInjected) {
        // Already injected on this page (e.g. user clicked Start again) —
        // just make sure the overlay is visible.
        window.__greyParrotShow?.();
        return;
    }
    window.__greyParrotInjected = true;

    let host = null;
    let hideTimer = null;

    function createOverlay() {
        host = document.createElement('div');
        host.id = 'grey-parrot-overlay-host';
        Object.assign(host.style, {
            position: 'fixed',
            left: '50%',
            bottom: '8vh',
            transform: 'translateX(-50%)',
            zIndex: '2147483647',
            maxWidth: '80vw',
            pointerEvents: 'none',
        });

        const shadow = host.attachShadow({ mode: 'open' });
        shadow.innerHTML = `
            <style>
                #caption {
                    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
                    font-size: 22px;
                    font-weight: 600;
                    line-height: 1.4;
                    color: #fff;
                    background: rgba(0, 0, 0, 0.75);
                    padding: 8px 16px;
                    border-radius: 8px;
                    text-align: center;
                    white-space: pre-wrap;
                }
            </style>
            <div id="caption"></div>
        `;
        document.body.appendChild(host);
    }

    function showCaption(text) {
        if (!host) createOverlay();
        const el = host.shadowRoot.getElementById('caption');
        el.textContent = text;
        host.style.display = 'block';

        clearTimeout(hideTimer);
        hideTimer = setTimeout(() => {
            if (host) host.style.display = 'none';
        }, 6000);
    }

    window.__greyParrotShow = () => {
        if (host) host.style.display = 'block';
    };

    chrome.runtime.onMessage.addListener((message) => {
        if (message.type === 'SUBTITLE_UPDATE') {
            showCaption(message.text);
        }
        if (message.type === 'STOP_OVERLAY') {
            clearTimeout(hideTimer);
            if (host) {
                host.remove();
                host = null;
            }
        }
    });
})();
