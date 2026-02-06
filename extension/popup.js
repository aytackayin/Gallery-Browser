function updateList() {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        const tab = tabs[0];
        const list = document.getElementById('urlList');

        if (!tab) return;

        const isYouTube = (tab.url.includes('youtube.com') || tab.url.includes('youtu.be'));

        let hostname = "Web";
        try { hostname = new URL(tab.url).hostname.replace('www.', ''); } catch (e) { }
        if (isYouTube) hostname = "YouTube";

        // *** YOUTUBE MODU ***
        if (isYouTube && (tab.url.includes('/watch') || tab.url.includes('/shorts'))) {
            list.innerHTML = "<p style='color:#ccc;text-align:center;padding:20px'>🚀 Sunucudan bilgi alınıyor...</p>";

            fetch(`http://localhost:3001/api/yt/formats?url=${encodeURIComponent(tab.url)}`)
                .then(res => {
                    if (!res.ok) throw new Error(res.status === 404 ? "Endpoint 404 (EXE'yi yeniden başlatın)" : `Sunucu Hatası: ${res.status}`);
                    return res.json();
                })
                .then(data => {
                    if (data.formats && data.formats.length > 0) {
                        const items = data.formats.map(f => {
                            let lbl = (f.height ? f.height + 'p' : 'Video');
                            if (f.note && !lbl.includes(f.note) && f.note !== f.height && String(f.note) !== String(f.height) + 'p') {
                                lbl += ` ${f.note}`;
                            }
                            return {
                                url: f.url,
                                label: lbl,
                                mime: 'video/' + (f.ext || 'mp4'),
                                contentLength: f.filesize,
                                thumbnail: data.thumbnail,
                                title: data.title
                            };
                        });
                        renderItems(items, data.title, hostname);
                    } else {
                        list.innerHTML = `<div style='text-align:center;padding:15px;color:#f88'>Format bulunamadı.</div>`;
                    }
                })
                .catch(err => {
                    list.innerHTML = `<div style='text-align:center;padding:15px;color:#f55'>${err.message}<br><small>EXE çalışıyor mu?</small></div>`;
                });
            return;
        }

        // *** DİĞER SİTELER ***
        chrome.runtime.sendMessage({ type: "GET_CAPTURED_URLS" }, (urls) => {
            const filtered = (urls || []).filter(u => !u.url.includes('googlevideo.com'));
            if (filtered.length > 0) {
                renderItems(filtered, tab.title, hostname);
            } else {
                list.innerHTML = "<p style='color:#666;text-align:center;padding:20px'>Video bulunamadı.<br><small>Oynatmayı deneyin.</small></p>";
            }
        });

        function renderItems(items, title, host) {
            list.innerHTML = "";

            items.sort((a, b) => {
                const getVal = s => parseInt((s.label || "").replace(/\D/g, '')) || 0;
                return getVal(b) - getVal(a);
            });

            const seen = new Set();
            const unique = [];

            items.forEach(item => {
                const lbl = item.label || "Video";
                if (seen.has(item.url)) return;
                if (item.mime.includes('video') || lbl.includes('p')) {
                    seen.add(item.url);
                    unique.push(item);
                }
            });

            if (unique.length === 0) list.innerHTML = "<p style='color:#666;text-align:center;padding:20px'>Format yok.</p>";
            unique.slice(0, 10).forEach(meta => createRow(meta, title, host, list));
        }
    });
}

function createRow(meta, pageTitle, hostname, list) {
    const box = document.createElement('div');
    // Flex row container
    box.style.cssText = `
        margin-bottom: 8px;
        padding: 10px;
        background: #252525;
        color: #fff;
        border-radius: 8px;
        cursor: pointer;
        display: flex;
        align-items: center;
        border: 1px solid #333;
        transition: transform 0.1s, background 0.2s;
        user-select: none;
        gap: 12px;
    `;

    // 1. SOL: Thumbnail
    if (meta.thumbnail) {
        const thumb = document.createElement('img');
        thumb.src = meta.thumbnail;
        thumb.style.cssText = "width:80px; height:45px; object-fit:cover; border-radius:4px; flex-shrink:0;";
        box.appendChild(thumb);
    } else {
        const icon = document.createElement('div');
        icon.innerText = "▶";
        icon.style.cssText = "width:40px; height:40px; background:#333; display:flex; justify-content:center; align-items:center; border-radius:4px; font-size:18px; color:#666; flex-shrink:0;";
        box.appendChild(icon);
    }

    // 2. ORTA: Başlık + Kalite
    const infoGroup = document.createElement('div');
    infoGroup.style.cssText = "display:flex; flex-direction:column; flex:1; overflow:hidden;";

    const displayTitle = meta.title || pageTitle || "Video";
    const titleSpan = document.createElement('span');
    titleSpan.innerText = displayTitle;
    titleSpan.style.cssText = "font-size:12px; color:#ddd; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; margin-bottom:4px; font-weight:500;";
    titleSpan.title = displayTitle;

    const qualitySpan = document.createElement('span');
    qualitySpan.innerText = meta.label || "Video";
    qualitySpan.style.cssText = "font-weight:700; font-size:15px; color:#fff;";

    infoGroup.appendChild(titleSpan);
    infoGroup.appendChild(qualitySpan);
    box.appendChild(infoGroup);

    // 3. SAĞ: Boyut + Tip (Kırmızı Tag)
    const metaGroup = document.createElement('div');
    metaGroup.style.cssText = "display:flex; flex-direction:column; align-items:flex-end; font-size:10px; color:#aaa; min-width:50px;";

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
    // KIRMIZI TAG STİLİ
    extSpan.style.cssText = "font-size:9px; background:#e50914; color:#fff; padding:2px 5px; border-radius:3px; font-weight:bold; margin-top:3px;";

    metaGroup.appendChild(extSpan);

    box.appendChild(metaGroup);

    // Etkileşimler
    box.onmouseover = () => { if (!box.dataset.active) box.style.background = "#333"; };
    box.onmouseout = () => { if (!box.dataset.active) box.style.background = "#252525"; };
    box.onmousedown = () => { if (!box.dataset.active) box.style.transform = "scale(0.98)"; };
    box.onmouseup = () => { if (!box.dataset.active) box.style.transform = "scale(1)"; };

    box.onclick = () => {
        if (box.dataset.active) return;

        box.dataset.active = "true";
        box.style.background = "#1a1a1a";
        box.style.borderColor = "#28a745";

        const oldText = qualitySpan.innerText;
        qualitySpan.innerText = "İndiriliyor...";
        qualitySpan.style.color = "#28a745";

        const safeName = (displayTitle).replace(/[/\\?%*:|"<>]/g, '_').substring(0, 100);
        const qualityTag = (meta.label || "video").replace(/[^a-zA-Z0-9]/g, '').substring(0, 6);
        const fileExt = ext === 'WEBM' ? '.webm' : '.mp4';
        const suggestedFilename = `${safeName}_${qualityTag}${fileExt}`;

        chrome.downloads.download({
            url: meta.url,
            filename: suggestedFilename,
            saveAs: false
        }, (downloadId) => {
            if (chrome.runtime.lastError) {
                box.style.borderColor = "#f44";
                qualitySpan.innerText = "Hata";
                qualitySpan.style.color = "#f44";
                alert("Hata: " + chrome.runtime.lastError.message);
                box.dataset.active = "";
                return;
            }

            chrome.runtime.sendMessage({
                type: "REGISTER_DOWNLOAD",
                downloadId: downloadId,
                url: meta.url,
                title: pageTitle,
                hostname: hostname
            });

            qualitySpan.innerText = "✅ Başladı";
        });
    };

    list.appendChild(box);
}

document.getElementById('clearBtn').onclick = () => {
    chrome.runtime.sendMessage({ type: "CLEAR_LIST" });
    updateList();
};

updateList();

chrome.runtime.onMessage.addListener((msg) => {
    if (msg.type === "NEW_VIDEO_URL") {
        chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
            if (tabs[0] && !tabs[0].url.includes('youtube.com')) updateList();
        });
    }
});
