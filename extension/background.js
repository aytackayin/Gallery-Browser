// Background Script for Zen Browser / Firefox (Manifest V2 Compatible)

// Key: BaseURL (parametreler hariç), Value: Video Meta
const capturedVideos = new Map();

// Web Request Listener (Headers Received - Daha doğru analiz için)
chrome.webRequest.onHeadersReceived.addListener((details) => {
    const url = details.url;

    // Temel Filtreler
    if (url.includes('google.com') && !url.includes('googlevideo.com')) return;
    if (url.includes('analytics') || url.includes('tracker') || url.includes('ads')) return;
    if (url.includes('youtube.com')) return; // YouTube'u popup.js yönetiyor

    // Header Analizi
    const headers = details.responseHeaders || [];
    const typeHeader = headers.find(h => h.name.toLowerCase() === 'content-type');
    const lenHeader = headers.find(h => h.name.toLowerCase() === 'content-length');

    const contentType = typeHeader ? typeHeader.value.toLowerCase() : '';
    const contentLength = lenHeader ? parseInt(lenHeader.value) : 0;

    // Video Kontrolü
    const isVideoType = contentType.includes('video') || contentType.includes('mpegurl') || contentType.includes('application/x-mpegURL');
    const isVideoExt = url.includes('.mp4') || url.includes('.m3u8') || url.includes('.webm') || url.includes('.mov');

    if (isVideoType || isVideoExt) {

        // 1. Kural: Çok küçük dosyaları (1MB altı) ele (Reklam, icon, preview vs.)
        // Ancak HLS (.m3u8) playlist dosyaları küçüktür, onları eleme!
        const isHLS = contentType.includes('mpegurl') || url.includes('.m3u8');

        if (!isHLS && contentLength > 0 && contentLength < 1024 * 1024) {
            // 1MB altı video dosyası (mp4/webm) -> Yoksay
            return;
        }

        // 2. Kural: Duplicate Önleme
        // URL'in soru işaretinden önceki kısmını (Base URL) anahtar olarak kullan.
        // Böylece aynı videonun farklı token/zaman damgasıyla gelen istekleri listeyi doldurmaz, günceller.
        const baseUrl = url.split('?')[0];

        // Dosya adını etikete koy (daha açıklayıcı olması için)
        // url: .../my-video.mp4?token=... -> "my-video.mp4"
        let filename = baseUrl.split('/').pop();
        if (filename.length > 25) filename = filename.substring(0, 25) + '...';

        // Etiket
        let label = filename || 'Video File';
        if (url.includes('1080p')) label = '1080p Video';
        else if (url.includes('720p')) label = '720p Video';

        const meta = {
            url: url, // İndirme için TAM URL (tokenlı)
            label: label,
            mime: contentType || 'video/mp4',
            contentLength: contentLength,
            timestamp: Date.now()
        };

        capturedVideos.set(baseUrl, meta);

        // Popup'a bildir
        chrome.runtime.sendMessage({ type: "NEW_VIDEO_URL" });
    }

}, { urls: ["<all_urls>"] }, ["responseHeaders"]);

// Message Listener
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {

    if (msg.type === "GET_CAPTURED_URLS") {
        // Sadece capturedVideos map'ini döndür
        const list = Array.from(capturedVideos.values()).reverse(); // En son yakalanan en üstte
        // Sınırla (Son 20 video yeterli)
        if (list.length > 20) list.length = 20;
        sendResponse(list);
    }

    if (msg.type === "REGISTER_DOWNLOAD") {
        notifyServer(msg.downloadId, msg.url, msg.title, msg.hostname);
    }

    if (msg.type === "CLEAR_LIST") {
        capturedVideos.clear();
        chrome.runtime.sendMessage({ type: "NEW_VIDEO_URL" });
    }
});

function notifyServer(downloadId, url, title, hostname) {
    chrome.downloads.onChanged.addListener(function listener(delta) {
        if (delta.id === downloadId && delta.state && delta.state.current === 'complete') {
            chrome.downloads.onChanged.removeListener(listener);
            chrome.downloads.search({ id: downloadId }, (items) => {
                if (items && items[0]) {
                    fetch('http://localhost:3001/api/yt/client-notify', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            filename: items[0].filename,
                            url: url,
                            title: title,
                            hostname: hostname
                        })
                    }).catch(err => console.error(err));
                }
            });
        }
    });
}
