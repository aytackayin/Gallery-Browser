const capturedVideos = new Map();
const tabMetadata = new Map();
const pendingDownloads = new Map();

console.log("Gallery Browser Helper: Background Loaded (v6)");

function reportToServer(filename, title, extra = {}) {
    fetch('http://127.0.0.1:3001/api/yt/client-notify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ filename, title, ...extra })
    }).catch(() => { });
}

// Radar selamı
reportToServer('LOG_DEBUG', 'Uzantı Aktif (v6)');

chrome.downloads.onChanged.addListener((delta) => {
    if (delta.state && delta.state.current === 'complete') {
        const data = pendingDownloads.get(delta.id);
        if (!data) return;

        pendingDownloads.delete(delta.id);
        setTimeout(() => {
            chrome.downloads.search({ id: delta.id }, (items) => {
                const item = items[0];
                if (item && item.filename) {
                    reportToServer(item.filename, data.title, {
                        url: data.originalUrl || data.url,
                        hostname: data.hostname,
                        channelHandle: data.channelHandle
                    });
                }
            });
        }, 1500);
    }
});

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    if (msg.type === "YT_PAGE_DATA" && sender.tab) {
        const current = tabMetadata.get(sender.tab.id) || {};
        current.channelHandle = msg.formats?.channelHandle || current.channelHandle;
        tabMetadata.set(sender.tab.id, current);
    }

    if (msg.type === "GET_CAPTURED_URLS") {
        sendResponse(Array.from(capturedVideos.values()).reverse());
        return true;
    }

    if (msg.type === "START_DOWNLOAD") {
        let handle = msg.channelHandle;
        if (!handle && msg.tabId) {
            handle = tabMetadata.get(msg.tabId)?.channelHandle;
        }

        console.log(`[EXT] Başlatılıyor: ${msg.title} | Kanal: ${handle}`);
        reportToServer('LOG_DEBUG', `İndirme Emri: ${msg.title}`, { channelHandle: handle });

        chrome.downloads.download({ url: msg.url, filename: msg.filename, saveAs: false }, (id) => {
            if (id) {
                pendingDownloads.set(id, {
                    url: msg.url,
                    originalUrl: msg.originalUrl,
                    title: msg.title,
                    hostname: msg.hostname,
                    channelHandle: handle
                });
            }
        });
    }

    if (msg.type === "CLEAR_LIST") {
        capturedVideos.clear();
        chrome.runtime.sendMessage({ type: "NEW_VIDEO_URL" });
    }
});

chrome.webRequest.onHeadersReceived.addListener((details) => {
    const url = details.url;
    if (url.includes('google.com') || url.includes('youtube.com') || url.includes('analytics')) return;
    const ct = (details.responseHeaders.find(h => h.name.toLowerCase() === 'content-type') || {}).value || '';
    if (ct.includes('video') || url.includes('.mp4')) {
        const baseUrl = url.split('?')[0];
        capturedVideos.set(baseUrl, { url, label: baseUrl.split('/').pop() || 'Video', mime: ct, tabId: details.tabId });
        chrome.runtime.sendMessage({ type: "NEW_VIDEO_URL" });
    }
}, { urls: ["<all_urls>"] }, ["responseHeaders"]);

chrome.tabs.onUpdated.addListener((tabId, change) => { if (change.url) tabMetadata.delete(tabId); });
chrome.tabs.onRemoved.addListener(tId => tabMetadata.delete(tId));
