function updateList() {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        const tab = tabs[0];
        const list = document.getElementById('urlList');

        if (!tab) return;

        const isYouTube = (tab.url.includes('youtube.com') || tab.url.includes('youtu.be'));

        // Hostname
        let hostname = "Web";
        try { hostname = new URL(tab.url).hostname.replace('www.', ''); } catch (e) { }
        if (isYouTube) hostname = "YouTube";

        // *** YOUTUBE MODU ***
        if (isYouTube && (tab.url.includes('/watch') || tab.url.includes('/shorts'))) {
            list.innerHTML = "<p style='color:#ccc;text-align:center;padding:20px'>🚀 Sunucudan bilgi alınıyor...<br><span style='font-size:10px'>Lütfen bekleyin...</span></p>";

            fetch(`http://localhost:3001/api/yt/formats?url=${encodeURIComponent(tab.url)}`)
                .then(res => {
                    if (!res.ok) throw new Error(res.status === 404 ? "Endpoint 404 (EXE'yi yeniden başlatın)" : `Sunucu Hatası: ${res.status}`);
                    return res.json();
                })
                .then(data => {
                    if (data.formats && data.formats.length > 0) {
                        const items = data.formats.map(f => {
                            let lbl = (f.height ? f.height + 'p' : 'Video');
                            // Tekrarlayan notları engelle (Örn: "720p 720p" -> "720p")
                            if (f.note && !lbl.includes(f.note) && f.note !== f.height) {
                                lbl += ` ${f.note}`;
                            }
                            return {
                                url: f.url,
                                label: lbl,
                                mime: 'video/' + (f.ext || 'mp4'),
                                contentLength: f.filesize
                            };
                        });
                        renderItems(items, data.title, hostname);
                    } else {
                        list.innerHTML = `<div style='text-align:center;padding:15px;color:#f88'>Format listesi boş.<br><small>Video korumalı olabilir veya yt-dlp güncel değil.</small></div>`;
                    }
                })
                .catch(err => {
                    list.innerHTML = `<div style='text-align:center;padding:15px;color:#f55'>
                        <b>Bağlantı Hatası</b><br><br>
                        <span style='font-size:11px'>${err.message}</span><br><br>
                        <small>EXE çalışıyor mu?</small>
                    </div>`;
                });
            return;
        }

        // *** DİĞER SİTELER MODU ***
        chrome.runtime.sendMessage({ type: "GET_CAPTURED_URLS" }, (urls) => {
            // Sadece YouTube olmayanları göster
            const filtered = (urls || []).filter(u => !u.url.includes('googlevideo.com'));

            if (filtered.length > 0) {
                renderItems(filtered, tab.title, hostname);
            } else {
                list.innerHTML = "<p style='color:#666;text-align:center;padding:20px'>Video bulunamadı.<br><small>Videoyu oynatın ve tekrar deneyin.</small></p>";
            }
        });

        // Ortak Render Fonksiyonu
        function renderItems(items, title, host) {
            list.innerHTML = "";

            // Sıralama
            items.sort((a, b) => {
                const getVal = s => parseInt((s.label || "").replace(/\D/g, '')) || 0;
                return getVal(b) - getVal(a);
            });

            const seen = new Set();
            const unique = [];

            items.forEach(item => {
                const lbl = item.label || "Video";
                if (seen.has(item.url)) return;
                // Sadece video veya p değeri olanlar
                if (item.mime.includes('video') || lbl.includes('p')) {
                    seen.add(item.url);
                    unique.push(item);
                }
            });

            if (unique.length === 0) {
                list.innerHTML = "<p style='color:#666;text-align:center;padding:20px'>Gösterilecek format yok.</p>";
                return;
            }

            unique.slice(0, 10).forEach(meta => {
                createRow(meta, title, host, list);
            });
        }
    });
}

function createRow(meta, pageTitle, hostname, list) {
    const container = document.createElement('div');
    container.style.cssText = "margin-bottom:10px; border:1px solid #333; border-radius:6px; background:#1a1a1a; overflow:hidden; display:flex; flex-direction:column;";

    const header = document.createElement('div');
    header.style.cssText = "padding:8px; background:#252525; border-bottom:1px solid #333; display:flex; justify-content:space-between; align-items:center;";

    let labelText = meta.label || "Video";
    if (labelText === "Video File" && meta.url) {
        try { labelText = meta.url.split('/').pop().split('?')[0].substring(0, 20); } catch (e) { }
    }

    const title = document.createElement('span');
    title.style.cssText = "font-weight:bold; color:#fff; font-size:12px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; max-width:180px;";
    title.innerText = labelText;
    title.title = labelText;

    if (meta.contentLength) {
        const mb = (parseInt(meta.contentLength) / 1024 / 1024).toFixed(1);
        title.innerText += ` (${mb} MB)`;
    }

    const badge = document.createElement('span');
    badge.style.cssText = "font-size:10px; background:#e50914; color:#fff; padding:2px 6px; border-radius:4px;";
    let mime = meta.mime || 'video';
    let ext = 'MP4';
    if (mime.includes('webm')) ext = 'WEBM';
    else if (mime.includes('m3u8') || meta.url.includes('.m3u8')) ext = 'HLS';

    badge.innerText = ext;

    header.appendChild(title);
    header.appendChild(badge);

    const downloadBtn = document.createElement('button');
    downloadBtn.innerText = "⚡ İndir";
    downloadBtn.style.cssText = "padding:10px; border:none; background:transparent; color:#ccc; cursor:pointer; text-align:left; font-size:12px; transition:all 0.2s;";

    downloadBtn.onmouseover = () => { downloadBtn.style.background = "#333"; downloadBtn.style.color = "#fff"; };
    downloadBtn.onmouseout = () => { downloadBtn.style.background = "transparent"; downloadBtn.style.color = "#ccc"; };

    downloadBtn.onclick = () => {
        downloadBtn.innerText = "⏳ Başlatılıyor...";
        downloadBtn.disabled = true;

        const safeName = (pageTitle || "video").replace(/[/\\?%*:|"<>]/g, '_').substring(0, 100);
        let fileExt = '.mp4';
        if (ext === 'WEBM') fileExt = '.webm';
        if (ext === 'HLS') fileExt = '.m3u8';

        const qualityTag = (labelText || "").replace(/[^a-zA-Z0-9]/g, '').substring(0, 6);
        const suggestedFilename = `${safeName}_${qualityTag}${fileExt}`;

        chrome.downloads.download({
            url: meta.url,
            filename: suggestedFilename,
            saveAs: false
        }, (downloadId) => {
            if (chrome.runtime.lastError) {
                downloadBtn.innerText = "❌ Hata";
                console.error(chrome.runtime.lastError);
                return;
            }
            chrome.runtime.sendMessage({
                type: "REGISTER_DOWNLOAD",
                downloadId: downloadId,
                url: meta.url,
                title: pageTitle,
                hostname: hostname
            });
            downloadBtn.innerText = "✅ İniyor";
            downloadBtn.style.color = "#46d369";
        });
    };

    container.appendChild(header);
    container.appendChild(downloadBtn);
    list.appendChild(container);
}

document.getElementById('clearBtn').onclick = () => {
    chrome.runtime.sendMessage({ type: "CLEAR_LIST" });
    updateList();
};

updateList();

chrome.runtime.onMessage.addListener((msg) => {
    if (msg.type === "NEW_VIDEO_URL") {
        chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
            if (tabs[0] && !tabs[0].url.includes('youtube.com')) {
                updateList();
            }
        });
    }
});
