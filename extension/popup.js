function updateList() {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        const tab = tabs[0];
        const list = document.getElementById('urlList');
        if (!tab) return;

        const isYouTube = (tab.url.includes('youtube.com') || tab.url.includes('youtu.be'));
        let hostname = isYouTube ? "YouTube" : "Web";

        if (isYouTube && (tab.url.includes('/watch') || tab.url.includes('/shorts'))) {
            list.innerHTML = "<p style='color:#ccc;text-align:center;padding:20px'>🚀 Sunucudan bilgi alınıyor...</p>";
            fetch(`http://127.0.0.1:3001/api/yt/formats?url=${encodeURIComponent(tab.url)}`)
                .then(res => res.json())
                .then(data => {
                    if (data.formats && data.formats.length > 0) {
                        const items = data.formats.map(f => ({
                            url: f.url,
                            label: (f.height ? f.height + 'p' : 'Video'),
                            mime: f.mime || ('video/' + (f.ext || 'mp4')),
                            contentLength: f.filesize,
                            thumbnail: data.thumbnail,
                            title: data.title,
                            channelHandle: data.uploader_id || null
                        }));
                        renderItems(items, data.title, hostname, tab.id, tab.url);
                    } else {
                        list.innerHTML = `<p style='color:#f88;text-align:center;padding:15px'>Format bulunamadı.</p>`;
                    }
                })
                .catch(err => {
                    list.innerHTML = `<p style='color:#f55;text-align:center;padding:15px'>Hata: Sunucuya ulaşılamıyor.</p>`;
                });
            return;
        }

        chrome.runtime.sendMessage({ type: "GET_CAPTURED_URLS" }, (urls) => {
            const filtered = (urls || []).filter(u => {
                // Ekstra Güvenlik: Uzantıya bakarak resimleri buradan da eliyoruz
                const path = u.url.split('?')[0].toLowerCase();
                return !path.endsWith('.jpg') && !path.endsWith('.png') && !path.endsWith('.jpeg') && !path.endsWith('.webp');
            });

            // Mükerrer Kaydı Domain Fark Etmeksizin Engelle
            // Eğer dosya adı (label) aynıysa, bunu tek video sayıyoruz
            const siteUniqueMap = new Map();
            filtered.forEach(u => {
                const pureLabel = u.label.toLowerCase();
                if (!siteUniqueMap.has(pureLabel)) {
                    siteUniqueMap.set(pureLabel, u);
                } else {
                    // Eğer mevcut link bir CDN linkiyse ama yeni gelen sitenin kendi linkiyse (get_file vb.)
                    // Sitenin kendi linkini tercih et (Kullanıcının istediği bu)
                    if (u.url.includes(hostname.toLowerCase()) || u.url.includes('get_file')) {
                        siteUniqueMap.set(pureLabel, u);
                    }
                }
            });

            renderItems(Array.from(siteUniqueMap.values()), tab.title, hostname, tab.id, tab.url);
        });

        function renderItems(items, title, host, currentTabId, currentTabUrl) {
            list.innerHTML = "";
            const uniqueMap = new Map();
            items.forEach(item => {
                const uniqueKey = `${item.title || title}_${item.label}_${item.mime}`;
                if (!uniqueMap.has(uniqueKey) || (item.contentLength > (uniqueMap.get(uniqueKey).contentLength || 0))) {
                    uniqueMap.set(uniqueKey, item);
                }
            });

            Array.from(uniqueMap.values()).forEach(meta => createRow(meta, title, host, list, currentTabId, currentTabUrl));
        }
    });
}

function createRow(meta, pageTitle, hostname, list, tabId, originalPageUrl) {
    const box = document.createElement('div');
    box.style.cssText = `
        margin-bottom: 8px; padding: 10px; background: #252525; color: #fff;
        border-radius: 8px; cursor: pointer; display: flex; align-items: center;
        border: 1px solid #333; transition: transform 0.1s, background 0.2s;
        user-select: none; gap: 12px; position: relative;
    `;

    // 1. SOL: Thumbnail
    if (meta.thumbnail) {
        const thumb = document.createElement('img');
        thumb.src = meta.thumbnail;
        thumb.style.cssText = "width:80px; height:45px; object-fit:cover; border-radius:4px; flex-shrink:0;";
        box.appendChild(thumb);
    } else {
        const icon = document.createElement('div');
        icon.innerHTML = `<svg width="24" height="24" viewBox="0 0 24 24" fill="#888"><path d="M8 5v14l11-7z"/></svg>`;
        icon.style.cssText = "width:60px; height:45px; background:#333; display:flex; justify-content:center; align-items:center; border-radius:4px; flex-shrink:0;";
        box.appendChild(icon);
    }

    // 2. ORTA: Bilgiler
    const infoGroup = document.createElement('div');
    infoGroup.style.cssText = "display:flex; flex-direction:column; flex:1; overflow:hidden;";

    const titleSpan = document.createElement('span');
    titleSpan.innerText = meta.title || pageTitle || "Video";
    titleSpan.style.cssText = "font-size:11px; color:#aaa; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; margin-bottom:2px;";

    const qualitySpan = document.createElement('span');
    qualitySpan.innerText = meta.label;
    qualitySpan.style.cssText = "font-weight:bold; font-size:15px; color:#fff;";

    infoGroup.appendChild(titleSpan);
    infoGroup.appendChild(qualitySpan);
    box.appendChild(infoGroup);

    // 3. SAĞ: Badge (Size & Ext)
    const metaGroup = document.createElement('div');
    metaGroup.style.cssText = "display:flex; flex-direction:column; align-items:flex-end; font-size:10px; min-width:55px;";

    if (meta.contentLength) {
        const mb = (parseInt(meta.contentLength) / 1024 / 1024).toFixed(1);
        const sizeSpan = document.createElement('span');
        sizeSpan.innerText = `${mb} MB`;
        sizeSpan.style.color = "#ccc";
        metaGroup.appendChild(sizeSpan);
    }

    let ext = 'MP4';
    if (meta.mime && meta.mime.includes('webm')) ext = 'WEBM';
    else if (meta.mime && meta.mime.includes('m3u8')) ext = 'HLS';

    const extSpan = document.createElement('span');
    extSpan.innerText = ext;
    extSpan.style.cssText = "font-size:9px; background:#e50914; color:#fff; padding:2px 5px; border-radius:3px; font-weight:bold; margin-top:4px;";
    metaGroup.appendChild(extSpan);
    box.appendChild(metaGroup);

    // Events
    box.onmouseover = () => { if (!box.dataset.active) box.style.background = "#333"; };
    box.onmouseout = () => { if (!box.dataset.active) box.style.background = "#252525"; };

    box.onclick = () => {
        if (box.dataset.active) return;
        box.dataset.active = "true";
        box.style.borderColor = "#28a745";
        qualitySpan.innerText = "🚀 Başlatıldı";
        qualitySpan.style.color = "#28a745";

        const safeName = (meta.title || pageTitle || "Video").replace(/[/\\?%*:|"<>]/g, '_').substring(0, 100);
        const fileExt = ext === 'WEBM' ? '.webm' : '.mp4';
        const suggestedFilename = `${safeName}${fileExt}`;

        chrome.runtime.sendMessage({
            type: "START_DOWNLOAD",
            url: meta.url,
            originalUrl: originalPageUrl,
            filename: suggestedFilename,
            title: meta.title || pageTitle,
            hostname: hostname,
            channelHandle: meta.channelHandle,
            tabId: tabId
        });
    };

    list.appendChild(box);
}

document.getElementById('clearBtn').onclick = () => {
    chrome.runtime.sendMessage({ type: "CLEAR_LIST" });
    updateList();
};

updateList();
chrome.runtime.onMessage.addListener((msg) => { if (msg.type === "NEW_VIDEO_URL") updateList(); });
