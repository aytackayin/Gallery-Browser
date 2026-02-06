function updateList() {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        const tab = tabs[0];
        const list = document.getElementById('urlList');

        if (!tab || (!tab.url.includes('youtube.com/watch') && !tab.url.includes('youtu.be'))) {
            list.innerHTML = "<p style='color:#666;text-align:center;padding:20px'>Lütfen bir YouTube videosu açın.</p>";
            return;
        }

        const pageTitle = tab.title || "Video";
        const hostname = "YouTube";

        // Render fonksiyonu
        function renderItems(items, titleOverride) {
            list.innerHTML = "";
            if (!items || items.length === 0) {
                list.innerHTML = "<p style='color:#666; text-align:center; padding:20px;'>İndirilebilir format bulunamadı.</p>";
                return;
            }

            // Temizleme ve Sıralama
            const unique = [];
            const seen = new Set();

            // Sıralama
            items.sort((a, b) => {
                const getRes = (l) => {
                    if (!l) return 0;
                    const m = l.match(/(\d+)p?/);
                    return m ? parseInt(m[1]) : 0;
                };
                return getRes(b.label || "") - getRes(a.label || "");
            });

            // Filtreleme
            items.forEach(item => {
                const lbl = item.label || "Video";
                if (seen.has(lbl)) return;
                // Eger boyut varsa veya video ise
                if (item.contentLength || item.mime.includes('video')) {
                    seen.add(lbl);
                    unique.push(item);
                }
            });

            unique.slice(0, 8).forEach(meta => {
                createRow(meta, titleOverride || pageTitle, hostname, list);
            });
        }

        // 1. Yöntem: Sunucuya Sor
        list.innerHTML = "<p style='color:#ccc;text-align:center;padding:20px'>🚀 Sunucudan bilgi alınıyor...<br><span style='font-size:10px'>Lütfen bekleyin (5-10sn)...</span></p>";

        const apiUrl = `http://localhost:3001/api/yt/formats?url=${encodeURIComponent(tab.url)}`;

        fetch(apiUrl)
            .then(res => {
                if (!res.ok) throw new Error(res.status === 404 ? "Endpoint 404" : `Sunucu Hatası: ${res.status}`);
                return res.json();
            })
            .then(data => {
                if (data.formats && data.formats.length > 0) {
                    const items = data.formats.map(f => ({
                        url: f.url,
                        label: (f.height ? f.height + 'p' : 'Video') + (f.note ? ` ${f.note}` : ''),
                        mime: 'video/' + (f.ext || 'mp4'),
                        contentLength: f.filesize
                    }));
                    renderItems(items, data.title);
                } else {
                    // YT-DLP boş liste döndü
                    list.innerHTML = `<div style='text-align:center;padding:15px;color:#f88;font-size:12px'>
                        <b>Format Bulunamadı!</b><br><br>
                        Sunucu (yt-dlp) video linklerini çözemedi.<br><br>
                        1. <b>yt-dlp.exe</b> güncel olmayabilir.<br>
                        2. Video korumalı olabilir.<br>
                        3. EXE'yi kapatıp açmayı deneyin.
                    </div>`;
                }
            })
            .catch(serverErr => {
                console.error("Server failed", serverErr);

                // Fallback: Local Storage
                chrome.storage.local.get(['yt_active_data'], (res) => {
                    const data = res.yt_active_data;
                    const currentVidId = tab.url.match(/v=([^&]+)/)?.[1];
                    const storedVidId = data?.url?.match(/v=([^&]+)/)?.[1];

                    if (data && currentVidId && storedVidId === currentVidId) {
                        renderItems(data.formats);
                        // Uyarı ekle
                        const warn = document.createElement('div');
                        warn.innerHTML = "<small style='color:#fa0'>⚠️ Sunucuya erişilemedi, önbellek kullanılıyor.</small>";
                        list.prepend(warn);
                    } else {
                        // Background Sniffer
                        chrome.runtime.sendMessage({ type: "GET_CAPTURED_URLS" }, (urls) => {
                            if (urls && urls.length > 0) {
                                renderItems(urls);
                                const warn = document.createElement('div');
                                warn.innerHTML = "<small style='color:#fa0'>⚠️ Sunucu hatası, ağ trafiği kullanılıyor.</small>";
                                list.prepend(warn);
                            } else {
                                const errMsg = serverErr.message.includes('404')
                                    ? "Sunucu Güncellemesi Gerekli (404).<br>Lütfen EXE'yi kapatıp açın."
                                    : serverErr.message.includes('Failed to fetch')
                                        ? "Sunucuya Veri Gönderilemedi.<br>EXE çalışıyor mu?"
                                        : serverErr.message;

                                list.innerHTML = `<div style='text-align:center;padding:15px;color:#ff5555;font-size:12px'>
                                    <b>Hata:</b><br>${errMsg}<br><br>
                                    <button onclick='window.location.reload()'>Tekrar Dene</button>
                                 </div>`;
                            }
                        });
                    }
                });
            });
    });
}

function createRow(meta, pageTitle, hostname, list) {
    const container = document.createElement('div');
    container.style.cssText = "margin-bottom:10px; border:1px solid #333; border-radius:6px; background:#1a1a1a; overflow:hidden; display:flex; flex-direction:column;";

    const header = document.createElement('div');
    header.style.cssText = "padding:8px; background:#252525; border-bottom:1px solid #333; display:flex; justify-content:space-between; align-items:center;";

    const title = document.createElement('span');
    title.style.cssText = "font-weight:bold; color:#fff; font-size:12px;";
    title.innerText = meta.label || "Video";

    if (meta.contentLength) {
        const mb = (parseInt(meta.contentLength) / 1024 / 1024).toFixed(1);
        title.innerText += ` (${mb} MB)`;
    }

    const badge = document.createElement('span');
    badge.style.cssText = "font-size:10px; background:#e50914; color:#fff; padding:2px 6px; border-radius:4px;";
    let mime = meta.mime || 'mp4';
    badge.innerText = mime.split('/')[1] ? mime.split('/')[1].toUpperCase() : 'MP4';

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
        const qualityTag = (meta.label || "").replace(/ /g, '').substring(0, 10);
        const ext = mime.includes('webm') ? '.webm' : '.mp4';
        const suggestedFilename = `${safeName}_${qualityTag}${ext}`;

        chrome.downloads.download({
            url: meta.url,
            filename: suggestedFilename,
            saveAs: false
        }, (downloadId) => {
            if (chrome.runtime.lastError) {
                downloadBtn.innerText = "❌ Hata";
                alert("Hata: " + chrome.runtime.lastError.message);
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
    updateList();
};

updateList();

chrome.runtime.onMessage.addListener((msg) => {
    // Mesaj dinleyicisi
});
