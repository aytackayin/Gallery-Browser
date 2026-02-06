// Video akışlarını (mp4, m3u8 vb.) yakalamak için ağ trafiğini dinler
let capturedUrls = new Map(); // URL -> Metadata (Diğer siteler için)
let tabVideoData = new Map(); // tabId -> { title: string, formats: [] } (YouTube için)

// Youtube itag kodlarına göre çözünürlük haritası
const YT_ITAGS = {
    '137': '1080p Video',
    '248': '1080p WebM',
    '136': '720p Video',
    '247': '720p WebM',
    '135': '480p Video',
    '134': '360p Video',
    '140': 'Audio (m4a)',
    '251': 'Audio (webm)',
    '18': '360p (Sesli)',
    '22': '720p (Sesli)'
};

chrome.webRequest.onBeforeRequest.addListener(
    (details) => {
        const url = details.url;
        if (url.includes('google.com') && !url.includes('googlevideo.com')) return;
        if (url.includes('yandex')) return;

        if (url.includes('googlevideo.com')) {
            const urlObj = new URL(url);
            const mime = urlObj.searchParams.get('mime');
            const itag = urlObj.searchParams.get('itag');

            if (mime && (mime.includes('video') || mime.includes('audio'))) {
                let label = YT_ITAGS[itag] || `${itag} (${mime.split('/')[1]})`;
                const meta = {
                    url: url,
                    label: label,
                    itag: itag,
                    mime: mime,
                    timestamp: Date.now()
                };
                capturedUrls.set(`${itag}`, meta);
            }
            return;
        }

        const isVideo = url.includes('.mp4') || url.includes('.m3u8') || (url.includes('video') && !url.includes('upload'));
        if (isVideo) {
            capturedUrls.set(url, { url: url, label: 'Video File', timestamp: Date.now() });
            chrome.runtime.sendMessage({ type: "NEW_VIDEO_URL" });
        }
    },
    { urls: ["<all_urls>"], types: ["media", "xmlhttprequest", "other"] }
);

// Persistent storage for downloads using chrome.storage.local
chrome.downloads.onChanged.addListener((delta) => {
    if (delta.state && delta.state.current === 'complete') {
        const downloadId = delta.id;

        // Callback tabanlı (Firefox uyumlu)
        chrome.storage.local.get(['activeDownloads'], (result) => {
            const activeDownloads = result.activeDownloads || {};

            if (activeDownloads[downloadId]) {
                const meta = activeDownloads[downloadId];

                chrome.downloads.search({ id: downloadId }, (items) => {
                    if (items && items[0]) {
                        const item = items[0];
                        console.log("Download complete, notifying gallery:", item.filename);

                        fetch('http://localhost:3001/api/yt/client-notify', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({
                                filePath: item.filename,
                                url: meta.url,
                                title: meta.title,
                                hostname: meta.hostname
                            })
                        }).then(r => r.json())
                            .then(data => {
                                console.log("Gallery notified:", data);
                                // Cleanup storage
                                delete activeDownloads[downloadId];
                                chrome.storage.local.set({ activeDownloads });
                            })
                            .catch(e => console.error("Gallery notify error:", e));
                    }
                });
            }
        });
    }
});

// Register download notification & Data Handling
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {

    // Content script'ten gelen YouTube verisi
    if (message.type === "YT_PAGE_DATA") {
        if (sender.tab) {
            console.log("Received YT Data for tab", sender.tab.id, message.formats.length, "formats");
            tabVideoData.set(sender.tab.id, {
                title: message.title,
                formats: message.formats
            });
        }
        return;
    }

    if (message.type === "REGISTER_DOWNLOAD") {
        chrome.storage.local.get(['activeDownloads'], (result) => {
            const activeDownloads = result.activeDownloads || {};
            activeDownloads[message.downloadId] = {
                url: message.url,
                title: message.title,
                hostname: message.hostname
            };
            chrome.storage.local.set({ activeDownloads });
        });
        return true;
    }

    // Popup açıldığında listeyi gönder
    if (message.type === "GET_CAPTURED_URLS") {
        chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
            const tab = tabs[0];
            if (!tab) return sendResponse([]);

            if (tabVideoData.has(tab.id)) {
                const data = tabVideoData.get(tab.id);
                // Biçimlendir ve Sırala
                const list = data.formats.map(f => ({
                    url: f.url,
                    label: f.qualityLabel || 'Video',
                    mime: f.mimeType,
                    itag: f.itag
                })).sort((a, b) => {
                    const getRes = (l) => {
                        if (!l) return 0;
                        const m = l.match(/(\d+)p?/);
                        return m ? parseInt(m[1]) : 0;
                    };
                    return getRes(b.label) - getRes(a.label);
                });

                const uniqueList = [];
                const seen = new Set();
                for (const item of list) {
                    if (!seen.has(item.label)) {
                        uniqueList.push(item);
                        seen.add(item.label);
                    }
                }

                sendResponse(uniqueList);
            } else {
                const list = Array.from(capturedUrls.values()).sort((a, b) => b.timestamp - a.timestamp);
                sendResponse(list);
            }
        });
        return true; // Async response
    }

    if (message.type === "CLEAR_LIST") {
        capturedUrls.clear();
        tabVideoData.clear();
    }
});
