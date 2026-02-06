// Background Script for Zen Browser / Firefox (Manifest V2 Compatible)

const capturedUrls = new Map();
const tabVideoData = new Map(); // Content script'ten gelen veriler (YouTube)

// Web Request Listener (Sniffer)
chrome.webRequest.onBeforeRequest.addListener((details) => {
    const url = details.url;

    // Ignore non-video or noise
    if (url.includes('google.com') && !url.includes('googlevideo.com')) return;
    if (url.includes('analytics') || url.includes('tracker')) return;

    // Check for video extensions or mime types in URL
    const isVideo = url.includes('.mp4') || url.includes('.m3u8') || url.includes('.webm') || (url.includes('googlevideo.com') && url.includes('videoplayback'));

    if (isVideo) {
        let label = 'Video File';
        if (url.includes('1080p')) label = '1080p';
        else if (url.includes('720p')) label = '720p';
        else if (url.includes('.m3u8')) label = 'HLS Stream';

        // Google Video (YouTube) ise etiketleme yap
        if (url.includes('googlevideo.com')) {
            const itag = url.match(/itag=(\d+)/)?.[1];
            if (itag) label = `YouTube (${itag})`;
        }

        const meta = {
            url: url,
            label: label,
            mime: url.includes('.m3u8') ? 'application/vnd.apple.mpegurl' : 'video/mp4',
            timestamp: Date.now()
        };

        capturedUrls.set(url, meta);

        // Notify popup if needed
        chrome.runtime.sendMessage({ type: "NEW_VIDEO_URL" });
    }
}, { urls: ["<all_urls>"] });

// Message Listener
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    if (msg.type === "YT_PAGE_DATA") {
        if (sender.tab) {
            tabVideoData.set(sender.tab.id, msg.formats);
            chrome.runtime.sendMessage({ type: "NEW_VIDEO_URL" });
        }
    }

    if (msg.type === "GET_CAPTURED_URLS") {
        // DÜZELTME: Sadece capturedUrls (Network Sniffer) verilerini döndür.
        // YouTube verileri artık popup'ta sunucu tarafından veya content script'ten ayrıca alınıyor.
        // Burada karışıklık olmamalı.

        const list = Array.from(capturedUrls.values()).reverse(); // En son yakalanan en üstte
        // (Optional) Sadece son 50 taneyi tut
        if (list.length > 50) list.length = 50;

        sendResponse(list);

        // Callback pattern için true dönmeye gerek yok (senkron cevap) ama Firefox için dönelim
        // return true; // (sendResponse asenkron değil burada)
    }

    if (msg.type === "REGISTER_DOWNLOAD") {
        notifyServer(msg.downloadId, msg.url, msg.title, msg.hostname);
    }

    if (msg.type === "CLEAR_LIST") {
        capturedUrls.clear();
        tabVideoData.clear();
    }
});

// Download Notification Logic (Server Integration)
function notifyServer(downloadId, url, title, hostname) {
    // ... (Mevcut logic, değişmedi) ...
    // İndirme tamamlanınca servera bildir
    chrome.downloads.onChanged.addListener(function listener(delta) {
        if (delta.id === downloadId && delta.state && delta.state.current === 'complete') {
            chrome.downloads.onChanged.removeListener(listener);

            // Dosya yolunu bul
            chrome.downloads.search({ id: downloadId }, (items) => {
                if (items && items[0]) {
                    const filename = items[0].filename; // Full path or relative

                    fetch('http://localhost:3001/api/yt/client-notify', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            filename: filename,
                            url: url,
                            title: title,
                            hostname: hostname
                        })
                    }).catch(err => console.error("Server notify error:", err));
                }
            });
        }
    });
}
