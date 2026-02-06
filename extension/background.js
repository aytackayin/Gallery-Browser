// Background Script for Zen Browser / Firefox (Manifest V2 Compatible)

const capturedVideos = new Map();
const tabMetadata = new Map(); // Key: TabID, Value: Thumbnail URL

// Web Request Listener
chrome.webRequest.onHeadersReceived.addListener((details) => {
    const url = details.url;

    if (url.includes('google.com') && !url.includes('googlevideo.com')) return;
    if (url.includes('analytics') || url.includes('tracker') || url.includes('ads')) return;
    if (url.includes('youtube.com')) return;

    const headers = details.responseHeaders || [];
    const typeHeader = headers.find(h => h.name.toLowerCase() === 'content-type');
    const lenHeader = headers.find(h => h.name.toLowerCase() === 'content-length');

    const contentType = typeHeader ? typeHeader.value.toLowerCase() : '';
    const contentLength = lenHeader ? parseInt(lenHeader.value) : 0;

    const isVideoType = contentType.includes('video') || contentType.includes('mpegurl') || contentType.includes('application/x-mpegURL');
    const isVideoExt = url.includes('.mp4') || url.includes('.m3u8') || url.includes('.webm') || url.includes('.mov');

    if (isVideoType || isVideoExt) {

        const isHLS = contentType.includes('mpegurl') || url.includes('.m3u8');
        if (!isHLS && contentLength > 0 && contentLength < 1024 * 1024) {
            return;
        }

        const baseUrl = url.split('?')[0];

        let filename = baseUrl.split('/').pop();
        if (filename.length > 25) filename = filename.substring(0, 25) + '...';

        let label = filename || 'Video File';
        if (url.includes('1080p')) label = '1080p Video';
        else if (url.includes('720p')) label = '720p Video';

        const tabThumb = tabMetadata.get(details.tabId);

        const meta = {
            url: url,
            label: label,
            mime: contentType || 'video/mp4',
            contentLength: contentLength,
            thumbnail: tabThumb || null,
            tabId: details.tabId,
            timestamp: Date.now()
        };

        capturedVideos.set(baseUrl, meta);
        chrome.runtime.sendMessage({ type: "NEW_VIDEO_URL" });
    }

}, { urls: ["<all_urls>"] }, ["responseHeaders"]);

// Message Listener
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {

    if (msg.type === "UPDATE_TAB_METADATA") {
        if (sender.tab) {
            const tabId = sender.tab.id;
            const thumb = msg.thumbnail;

            tabMetadata.set(tabId, thumb);

            let updated = false;
            for (let [key, meta] of capturedVideos.entries()) {
                if (meta.tabId === tabId && !meta.thumbnail) {
                    meta.thumbnail = thumb;
                    capturedVideos.set(key, meta);
                    updated = true;
                }
            }

            if (updated) {
                chrome.runtime.sendMessage({ type: "NEW_VIDEO_URL" });
            }
        }
    }

    if (msg.type === "GET_CAPTURED_URLS") {
        // TARTIŞMALI: Hepsini mi dönelim yoksa sadece aktif sekmeyi mi?
        // Popup.js şu an hepsini alıp filter yapmıyor (googlevideo hariç).
        // Kullanıcı karışıklık istemediği için, SADECE AKTİF TAB'a ait olanları filtreleyip dönmek daha mantıklı olabilir mi?
        // Hayır, Popup.js tabId'sini bilmiyor (sendMessage callback içinde).
        // En iyisi Hepsini dön but onUpdated ile temizlendiği için sorun kalmaz.

        const list = Array.from(capturedVideos.values()).reverse();
        if (list.length > 50) list.length = 50;
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

// TEMİZLİK: Sayfa yenilendiğinde veya URL değiştiğinde o tab'ın önceki videolarını sil
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
    if (changeInfo.status === 'loading') {
        const url = tab.url || "";
        // YouTube hariç (YouTube kendi state'ini yönetiyor veya content script yolluyor)
        // Ama YouTube için de temizlense fena olmaz.

        // Metadata sil
        tabMetadata.delete(tabId);

        // O tab'a ait videoları sil
        let deleted = false;
        for (let [key, meta] of capturedVideos.entries()) {
            if (meta.tabId === tabId) {
                capturedVideos.delete(key);
                deleted = true;
            }
        }

        if (deleted) {
            chrome.runtime.sendMessage({ type: "NEW_VIDEO_URL" });
        }
    }
});

chrome.tabs.onRemoved.addListener((tabId) => {
    tabMetadata.delete(tabId);
    for (let [key, meta] of capturedVideos.entries()) {
        if (meta.tabId === tabId) {
            capturedVideos.delete(key);
        }
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
