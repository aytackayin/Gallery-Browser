console.log("Gallery Extension: Content script v2.0 running...");

let dataFound = false;

// 1. Yöntem: Sayfa kaynağındaki script taglerini tara
function scrapeVideoData() {
    if (dataFound) return;

    const scripts = document.getElementsByTagName('script');
    for (let script of scripts) {
        if (script.textContent && script.textContent.includes('var ytInitialPlayerResponse =')) {
            try {
                const code = script.textContent;
                const start = code.indexOf('var ytInitialPlayerResponse =') + 29;
                let end = code.indexOf('};', start) + 1;
                if (end === 0) end = code.indexOf(';var', start); // indexOf returns -1 if not found, checking against 0 is wrong logic but safe here if +1 logic holds. Actually indexOf returns -1.
                if (end < start) end = code.length;

                const jsonStr = code.substring(start, end);
                const data = JSON.parse(jsonStr);

                console.log("Gallery Ext: Found initial data via scrape");
                processData(data);
                return true;
            } catch (e) { }
        }
    }
    return false;
}

// 2. Yöntem: Sayfa içine kod enjekte et (Interception)
function injectInterceptor() {
    if (document.getElementById('gallery-injector')) return;

    const s = document.createElement('script');
    s.id = 'gallery-injector';
    s.src = chrome.runtime.getURL('inject.js');
    s.onload = function () { this.remove(); };
    (document.head || document.documentElement).appendChild(s);
}

// 3. Veriyi İşle ve Kaydet
function processData(data) {
    if (!data || !data.streamingData) return;
    dataFound = true;

    let allFormats = [];
    if (data.streamingData.formats) allFormats = allFormats.concat(data.streamingData.formats);
    if (data.streamingData.adaptiveFormats) allFormats = allFormats.concat(data.streamingData.adaptiveFormats);

    const cleanFormats = allFormats
        .filter(f => f.mimeType && f.mimeType.includes('video'))
        .map(f => ({
            itag: f.itag,
            qualityLabel: f.qualityLabel,
            mimeType: f.mimeType,
            url: f.url
        }))
        .filter(f => f.url); // URL'i olanlar (403 olmayan indirilebilir linkler)

    const payload = {
        formats: cleanFormats,
        title: data.videoDetails?.title || "Video",
        url: location.href,
        timestamp: Date.now()
    };

    console.log("Gallery Ext: Storing", cleanFormats.length, "formats locally");

    // Yöntem A: Local Storage (Popup buradan okuyacak)
    chrome.storage.local.set({ 'yt_active_data': payload });

    // Yöntem B: Background'a Mesaj (Yedek)
    chrome.runtime.sendMessage({
        type: "YT_PAGE_DATA",
        formats: cleanFormats,
        title: payload.title
    });
}

// Dinleyici (Inject.js'ten gelen)
window.addEventListener("message", (event) => {
    if (event.source != window) return;
    if (event.data.type && event.data.type == "GALLERY_YT_DATA") {
        console.log("Gallery Ext: Received data via postMessage");
        processData(event.data.data);
    }
});

// Başlatıcılar
scrapeVideoData();
setTimeout(injectInterceptor, 1000); // Sayfa yüklenince inject et
setInterval(() => {
    if (!dataFound) {
        scrapeVideoData();
        injectInterceptor();
    }
}, 3000); // Bulana kadar 3 saniyede bir dene

// URL Değişimi Takibi (SPA)
let lastUrl = location.href;
new MutationObserver(() => {
    if (location.href !== lastUrl) {
        lastUrl = location.href;
        dataFound = false;
        console.log("URL Changed, resetting...");
        setTimeout(() => {
            scrapeVideoData();
            injectInterceptor();
        }, 1500);
    }
}).observe(document, { subtree: true, childList: true });
