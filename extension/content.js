// YouTube Data Extraction (Mevcut)
function extractYouTubeData() {
    if (!window.location.href.includes('watch') && !window.location.href.includes('shorts')) return null;

    try {
        const player = document.querySelector('#movie_player');
        if (player && player.getVideoData) {
            const data = player.getVideoData();
            return {
                title: data.title,
                video_id: data.video_id,
                author: data.author,
                formats: []
            };
        }
    } catch (e) { console.error(e); }
    return null;
}

// Genel Data Extraction (DİĞER SİTELER)
function findBestThumbnail() {
    if (window.location.host.includes('youtube.com')) return null;

    // 1. Open Graph
    let el = document.querySelector('meta[property="og:image"]');
    if (el && el.content) return el.content;

    // 2. Twitter Card
    el = document.querySelector('meta[name="twitter:image"]');
    if (el && el.content) return el.content;

    // 3. Video Poster (En görünür olanı seçmeye çalışabiliriz ama ilk bulan da iyidir)
    el = document.querySelector('video[poster]');
    if (el && el.poster) return el.poster;

    // 4. Schema.org Image
    el = document.querySelector('meta[itemprop="image"]');
    if (el && el.content) return el.content;

    // 5. Link Rel Image
    el = document.querySelector('link[rel="image_src"]');
    if (el && el.href) return el.href;

    return null;
}

function sendMetadata() {
    // YouTube Data Gönderimi
    const ytData = extractYouTubeData();
    if (ytData) {
        chrome.runtime.sendMessage({ type: "YT_PAGE_DATA", formats: ytData });
        chrome.storage.local.set({ 'yt_active_data': ytData });
    }

    // Genel Metadata (Thumbnail) Gönderimi
    const thumb = findBestThumbnail();
    if (thumb) {
        chrome.runtime.sendMessage({
            type: "UPDATE_TAB_METADATA",
            thumbnail: thumb
        });
    }
}

// Event Listeners
setInterval(sendMetadata, 2000); // Periyodik kontrol (SPA ve Dinamik yüklemeler için)

// URL Değişimi Takibi
let lastUrl = location.href;
new MutationObserver(() => {
    if (location.href !== lastUrl) {
        lastUrl = location.href;
        chrome.storage.local.remove('yt_active_data');
        setTimeout(sendMetadata, 500);
    }
}).observe(document, { subtree: true, childList: true });

sendMetadata();
