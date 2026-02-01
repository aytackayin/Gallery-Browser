import express from 'express';
import cors from 'cors';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import mime from 'mime-types';
import Database from 'better-sqlite3';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

import ffmpeg from 'fluent-ffmpeg';
import crypto from 'crypto';

const app = express();
const PORT = 3001;

app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));

const getConfigs = () => {
    let rootPath = process.cwd();
    let autoPlay = false;
    let language = 'en';
    let browserPath = 'default';
    let translations = {};
    try {
        const configPath = path.join(process.cwd(), 'config.ini');
        if (fs.existsSync(configPath)) {
            const content = fs.readFileSync(configPath, 'utf8');
            const lines = content.split(/\r?\n/);
            const gPath = lines.find(l => l.trim().startsWith('GalleryPath='));
            if (gPath) {
                let val = gPath.split('=')[1].trim().replace(/^["']|["']$/g, '');
                if (val && val.toLowerCase() !== 'default') rootPath = val;
            }
            const aPlay = lines.find(l => l.trim().startsWith('AutoPlay='));
            if (aPlay) autoPlay = aPlay.split('=')[1].trim() === '1';

            const bPath = lines.find(l => l.trim().startsWith('BrowserPath='));
            if (bPath) browserPath = bPath.split('=')[1].trim().replace(/^["']|["']$/g, '');

            const lang = lines.find(l => l.trim().startsWith('Language='));
            if (lang) language = lang.split('=')[1].trim().toLowerCase();
        }

        const langPath = path.join(process.cwd(), 'languages', `${language}.json`);
        if (fs.existsSync(langPath)) {
            translations = JSON.parse(fs.readFileSync(langPath, 'utf8'));
        }
    } catch (e) { }
    return { rootPath: path.resolve(rootPath), autoPlay, language, browserPath, translations };
};

const settings = getConfigs();
const rootGalleryPath = settings.rootPath;

// Thumbnail klasörü
const thumbDir = path.join(rootGalleryPath, '.gallery_thumbs');
if (!fs.existsSync(thumbDir)) fs.mkdirSync(thumbDir, { recursive: true });

const dbPath = path.join(rootGalleryPath, 'gallery_data.db');
const db = new Database(dbPath);
db.pragma('journal_mode = WAL');
db.exec(`CREATE TABLE IF NOT EXISTS item_info (path TEXT PRIMARY KEY, info TEXT, updated_at DATETIME DEFAULT CURRENT_TIMESTAMP)`);

const EXCLUDED_DIRS = ['node_modules', '.git', 'dist', '.agent', 'public', 'src', '$RECYCLE.BIN', 'System Volume Information', '.gallery_thumbs'];
const EXCLUDED_FILES = ['gallery_data.db', 'icon.png', 'config.ini', 'GalleryLauncher.exe', 'build.bat', 'Launcher.cs', 'server.js', 'package.json', 'package-lock.json', 'index.html', 'vite.config.js', 'app.ico', 'Thumbs.db', 'desktop.ini'];

const getThumbPath = (itemPath) => {
    const hash = crypto.createHash('md5').update(itemPath).digest('hex');
    return path.join(thumbDir, `${hash}.jpg`);
};

app.get('/api/thumb', async (req, res) => {
    const itemRelPath = req.query.path;
    const fullPath = path.join(rootGalleryPath, itemRelPath);
    const thumbPath = getThumbPath(itemRelPath);

    if (!fs.existsSync(fullPath)) return res.status(404).end();

    if (fs.existsSync(thumbPath)) {
        return res.sendFile(thumbPath);
    }

    try {
        const type = mime.lookup(fullPath) || '';
        if (type.startsWith('image/')) {
            ffmpeg(fullPath)
                .screenshots({
                    timestamps: [0],
                    folder: path.dirname(thumbPath),
                    filename: path.basename(thumbPath),
                    size: '400x?'
                })
                .on('end', () => res.sendFile(thumbPath))
                .on('error', () => res.sendFile(fullPath)); // Hata olursa orijinali gönder
        } else if (type.startsWith('video/')) {
            ffmpeg(fullPath)
                .screenshots({
                    timestamps: ['1'],
                    folder: path.dirname(thumbPath),
                    filename: path.basename(thumbPath),
                    size: '400x?'
                })
                .on('end', () => res.sendFile(thumbPath))
                .on('error', () => res.status(500).end());
        } else {
            res.status(400).end();
        }
    } catch (e) {
        res.status(500).end();
    }
});

const getAllItems = (dir, baseDir, allFiles = []) => {
    try {
        const files = fs.readdirSync(dir, { withFileTypes: true });
        for (const file of files) {
            if (file.name.startsWith('$')) continue;
            if (file.isDirectory() && EXCLUDED_DIRS.includes(file.name)) continue;
            if (!file.isDirectory() && EXCLUDED_FILES.includes(file.name)) continue;
            const res = path.join(dir, file.name);
            const relPath = path.relative(baseDir, res).replace(/\\/g, '/');
            const isDir = file.isDirectory();
            const type = isDir ? 'folder' : (mime.lookup(file.name) || 'unknown');
            if (isDir || type.startsWith('image/') || type.startsWith('video/') || type.startsWith('audio/')) {
                allFiles.push({ name: file.name, path: relPath, type });
            }
            if (isDir) getAllItems(res, baseDir, allFiles);
        }
    } catch (e) { }
    return allFiles;
};

app.get('/api/scan', (req, res) => {
    try {
        const subPath = req.query.path || '';
        const targetPath = path.join(rootGalleryPath, subPath);
        const absolutePath = path.resolve(targetPath);
        if (!absolutePath.toLowerCase().startsWith(rootGalleryPath.toLowerCase()) || !fs.existsSync(absolutePath)) {
            return res.status(404).json({ error: "Erişim yok", items: [] });
        }
        const items = fs.readdirSync(absolutePath, { withFileTypes: true });
        const result = items
            .filter(item => {
                if (item.name.startsWith('$')) return false;
                return item.isDirectory() ? !EXCLUDED_DIRS.includes(item.name) : !EXCLUDED_FILES.includes(item.name);
            })
            .map(item => {
                const fullPath = path.join(absolutePath, item.name);
                const relPath = path.relative(rootGalleryPath, fullPath).replace(/\\/g, '/');
                return { name: item.name, path: relPath, type: item.isDirectory() ? 'folder' : (mime.lookup(item.name) || 'unknown') };
            })
            .filter(item => item.type === 'folder' || item.type.startsWith('image/') || item.type.startsWith('video/') || item.type.startsWith('audio/'))
            .sort((a, b) => (b.type === 'folder' ? 1 : -1) - (a.type === 'folder' ? 1 : -1) || a.name.localeCompare(b.name));
        res.json({
            currentPath: subPath,
            items: result,
            autoPlay: settings.autoPlay,
            language: settings.language,
            translations: settings.translations
        });
    } catch (error) { res.status(500).json({ error: error.message }); }
});

app.get('/api/search', (req, res) => {
    try {
        const query = (req.query.q || '').toLowerCase();
        if (!query) return res.json({ items: [] });
        const allItems = getAllItems(rootGalleryPath, rootGalleryPath);
        const dbItems = db.prepare("SELECT path FROM item_info WHERE LOWER(info) LIKE ?").all(`%${query}%`).map(row => row.path.toLowerCase());
        const filtered = allItems.filter(item => {
            const nameMatch = item.name.toLowerCase().includes(query);
            const infoMatch = dbItems.includes(item.path.toLowerCase());
            // ARTIK pathMatch (klasör içindekileri getirme) YOK
            return nameMatch || infoMatch;
        });
        res.json({ items: filtered });
    } catch (error) { res.status(500).json({ error: error.message }); }
});

app.get('/api/info', async (req, res) => {
    try {
        const itemPath = req.query.path;
        if (!itemPath) return res.json({ info: "" });

        const row = db.prepare("SELECT info FROM item_info WHERE path = ?").get(itemPath);
        const fullPath = path.join(rootGalleryPath, itemPath);

        let metadata = { info: row ? row.info : "" };

        if (fs.existsSync(fullPath) && fs.lstatSync(fullPath).isFile()) {
            const stats = fs.statSync(fullPath);
            metadata.size = stats.size;

            // Format size
            const units = ['B', 'KB', 'MB', 'GB', 'TB'];
            let size = stats.size;
            let i = 0;
            while (size >= 1024 && i < units.length - 1) {
                size /= 1024;
                i++;
            }
            metadata.formattedSize = `${size.toFixed(2)} ${units[i]}`;

            // Get resolution/duration using ffprobe
            await new Promise((resolve) => {
                ffmpeg.ffprobe(fullPath, (err, data) => {
                    if (!err && data) {
                        if (data.streams) {
                            const videoStream = data.streams.find(s => s.width && s.height);
                            if (videoStream) {
                                metadata.width = videoStream.width;
                                metadata.height = videoStream.height;
                                metadata.resolution = `${videoStream.width}x${videoStream.height}`;
                            }
                        }

                        // Duration: Take the maximum among format and all streams for robustness
                        let maxDur = 0;
                        if (data.format && data.format.duration) maxDur = parseFloat(data.format.duration);
                        if (data.streams) {
                            data.streams.forEach(s => {
                                // 1. Standart duration alanını kontrol et
                                if (s.duration) {
                                    const sd = parseFloat(s.duration);
                                    if (sd > maxDur) maxDur = sd;
                                }
                                // 2. Tags içindeki tüm olası duration formatlarını tara (HH:MM:SS veya saniye)
                                Object.keys(s.tags || {}).forEach(tag => {
                                    if (tag.toLowerCase().includes('duration')) {
                                        const val = s.tags[tag];
                                        if (typeof val === 'string' && val.includes(':')) {
                                            const parts = val.split(':').reverse();
                                            let sec = 0;
                                            if (parts[0]) sec += parseFloat(parts[0]);
                                            if (parts[1]) sec += parseFloat(parts[1]) * 60;
                                            if (parts[2]) sec += parseFloat(parts[2]) * 3600;
                                            if (sec > maxDur) maxDur = sec;
                                        } else {
                                            const parsed = parseFloat(val);
                                            if (!isNaN(parsed) && parsed > maxDur) maxDur = parsed;
                                        }
                                    }
                                });
                            });
                        }

                        if (maxDur > 0 && !isNaN(maxDur)) {
                            metadata.durationSeconds = maxDur;
                            const min = Math.floor(maxDur / 60);
                            const sec = Math.floor(maxDur % 60);
                            metadata.duration = `${min}:${sec.toString().padStart(2, '0')}`;
                        }
                    }
                    resolve();
                });
            });
        }

        res.json(metadata);
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

app.post('/api/info', (req, res) => {
    const { path, info } = req.body;
    db.prepare("INSERT OR REPLACE INTO item_info (path, info) VALUES (?, ?)").run(path, info);
    res.json({ success: true });
});

app.delete('/api/delete', (req, res) => {
    const itemPath = req.query.path;
    const absolutePath = path.join(rootGalleryPath, itemPath);
    if (!absolutePath.toLowerCase().startsWith(rootGalleryPath.toLowerCase())) return res.status(403).json({ error: "Yasak" });
    try {
        if (fs.existsSync(absolutePath)) {
            if (fs.lstatSync(absolutePath).isDirectory()) fs.rmSync(absolutePath, { recursive: true, force: true });
            else fs.unlinkSync(absolutePath);
            db.prepare("DELETE FROM item_info WHERE path = ?").run(itemPath);
            res.json({ success: true });
        } else { res.status(404).json({ error: "Bulunamadı" }); }
    } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/move', (req, res) => {
    const { sourcePath, destFolderPath, overwrite } = req.body;
    const fullSource = path.join(rootGalleryPath, sourcePath);
    const fullDestFolder = path.join(rootGalleryPath, destFolderPath);
    const fileName = path.basename(sourcePath);
    const fullDest = path.join(fullDestFolder, fileName);
    const newRelPath = path.join(destFolderPath, fileName).replace(/\\/g, '/');

    if (!fullSource.toLowerCase().startsWith(rootGalleryPath.toLowerCase()) ||
        !fullDestFolder.toLowerCase().startsWith(rootGalleryPath.toLowerCase())) {
        return res.status(403).json({ error: "Yasak" });
    }

    try {
        if (fs.existsSync(fullSource)) {
            if (!fs.existsSync(fullDestFolder)) {
                return res.status(404).json({ error: "Hedef klasör bulunamadı" });
            }
            if (fs.existsSync(fullDest)) {
                if (!overwrite) {
                    return res.status(409).json({ error: "Dosya zaten var", code: 'CONFLICT' });
                }
                // Overwrite: Hedef dosyayı sil
                try { fs.unlinkSync(fullDest); } catch (e) { }
            }

            fs.renameSync(fullSource, fullDest);

            // Veritabanını güncelle
            // Eski kaydı güncelle, eğer hedefte zaten kayıt varsa (overwrite durumunda) onu silmemiz gerekebilir ama
            // rename işlemi üstüne yazdığı için hedefteki path'in id'si kalabilir ya da çakışma olabilir.
            // Basitlik adına: Varsa eski hedef kaydı sil, sonra güncelle.
            db.prepare("DELETE FROM item_info WHERE path = ?").run(newRelPath);
            db.prepare("UPDATE item_info SET path = ? WHERE path = ?").run(newRelPath, sourcePath);

            res.json({ success: true, newPath: newRelPath });
        } else {
            res.status(404).json({ error: "Kaynak dosya bulunamadı" });
        }
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

app.post('/api/save-image', (req, res) => {
    const { path: itemPath, imageData } = req.body; // imageData is base64 string
    if (!itemPath || !imageData) return res.status(400).json({ error: "Eksik veri" });

    const absolutePath = path.join(rootGalleryPath, itemPath);
    if (!absolutePath.toLowerCase().startsWith(rootGalleryPath.toLowerCase())) {
        return res.status(403).json({ error: "Yasak" });
    }

    try {
        const base64Data = imageData.replace(/^data:image\/\w+;base64,/, "");
        const buffer = Buffer.from(base64Data, 'base64');

        fs.writeFileSync(absolutePath, buffer);

        // Thumbnail'ı temizle
        const thumbPath = getThumbPath(itemPath);
        if (fs.existsSync(thumbPath)) {
            fs.unlinkSync(thumbPath);
        }

        res.json({ success: true, message: "Resim kaydedildi" });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

app.post('/api/update', (req, res) => {
    const { oldPath, newName, info } = req.body;

    // Eğer sadece info güncellenecekse (isim değişmediyse)
    if (!newName || newName === path.basename(oldPath)) {
        try {
            db.prepare("INSERT OR REPLACE INTO item_info (path, info) VALUES (?, ?)").run(oldPath, info || '');
            res.json({ success: true, newPath: oldPath });
        } catch (e) { res.status(500).json({ error: e.message }); }
        return;
    }

    // İsim değişikliği varsa
    const fullOldPath = path.join(rootGalleryPath, oldPath);
    const dir = path.dirname(fullOldPath);
    const fullNewPath = path.join(dir, newName);
    const startDir = path.dirname(oldPath);
    const newRelPath = path.join(startDir, newName).replace(/\\/g, '/');

    if (!fullOldPath.toLowerCase().startsWith(rootGalleryPath.toLowerCase()) ||
        !fullNewPath.toLowerCase().startsWith(rootGalleryPath.toLowerCase())) {
        return res.status(403).json({ error: "Yasak" });
    }

    try {
        if (fs.existsSync(fullOldPath)) {
            if (fs.existsSync(fullNewPath)) {
                return res.status(409).json({ error: "Bu isimde dosya zaten var" });
            }
            fs.renameSync(fullOldPath, fullNewPath);

            // Path'i güncelle
            db.prepare("UPDATE item_info SET path = ? WHERE path = ?").run(newRelPath, oldPath);
            // Info'yu güncelle (Varsa)
            if (info !== undefined) {
                db.prepare("INSERT OR REPLACE INTO item_info (path, info) VALUES (?, ?)").run(newRelPath, info);
            }

            res.json({ success: true, newPath: newRelPath });
        } else {
            res.status(404).json({ error: "Dosya bulunamadı" });
        }
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

app.post('/api/batch-delete', (req, res) => {
    const { paths } = req.body;
    if (!Array.isArray(paths)) return res.status(400).json({ error: "Invalid input" });

    let deleted = [];
    let failed = [];

    paths.forEach(p => {
        const fullPath = path.join(rootGalleryPath, p);
        if (!fullPath.toLowerCase().startsWith(rootGalleryPath.toLowerCase())) {
            failed.push({ path: p, error: "Access denied" });
            return;
        }
        try {
            if (fs.existsSync(fullPath)) {
                if (fs.lstatSync(fullPath).isDirectory()) {
                    fs.rmSync(fullPath, { recursive: true, force: true });
                } else {
                    fs.unlinkSync(fullPath);
                }
                const relativePath = p.replace(/\\/g, '/');
                db.prepare("DELETE FROM item_info WHERE path = ?").run(relativePath);
                deleted.push(p);
            } else {
                failed.push({ path: p, error: "Not found" });
            }
        } catch (e) {
            failed.push({ path: p, error: e.message });
        }
    });
    res.json({ success: true, deleted, failed });
});

app.post('/api/batch-move', (req, res) => {
    const { sourcePaths, destFolderPath, overwrite } = req.body;
    if (!Array.isArray(sourcePaths) || !destFolderPath) return res.status(400).json({ error: "Invalid input" });

    const fullDestDir = path.join(rootGalleryPath, destFolderPath);
    if (!fullDestDir.toLowerCase().startsWith(rootGalleryPath.toLowerCase())) return res.status(403).json({ error: "Access denied" });

    let moved = [];
    let conflicts = [];
    let failed = [];

    sourcePaths.forEach(src => {
        const fullSrcPath = path.join(rootGalleryPath, src);
        const fileName = path.basename(src);
        const fullDestPath = path.join(fullDestDir, fileName);
        const newRelPath = path.join(destFolderPath, fileName).replace(/\\/g, '/');

        if (!fullSrcPath.toLowerCase().startsWith(rootGalleryPath.toLowerCase())) {
            failed.push({ path: src, error: "Access denied" });
            return;
        }

        try {
            if (!fs.existsSync(fullSrcPath)) {
                failed.push({ path: src, error: "Source not found" });
                return;
            }

            if (fs.existsSync(fullDestPath)) {
                if (!overwrite) {
                    conflicts.push(src);
                    return;
                }
                // Overwrite: Hedefi sil
                if (fs.lstatSync(fullDestPath).isDirectory()) {
                    fs.rmSync(fullDestPath, { recursive: true, force: true });
                } else {
                    fs.unlinkSync(fullDestPath);
                }
                // Eski info'yu sil
                db.prepare("DELETE FROM item_info WHERE path = ?").run(newRelPath);
            }

            fs.renameSync(fullSrcPath, fullDestPath);

            // DB güncelle
            const oldRelPath = src.replace(/\\/g, '/');
            db.prepare("UPDATE item_info SET path = ? WHERE path = ?").run(newRelPath, oldRelPath);
            moved.push(src);

        } catch (e) {
            failed.push({ path: src, error: e.message });
        }
    });

    res.json({ success: true, moved, conflicts, failed });
});

app.get('/media/*', (req, res) => {
    try {
        const itemRelPath = decodeURIComponent(req.params[0]);
        const filePath = path.join(rootGalleryPath, itemRelPath);

        if (fs.existsSync(filePath)) {
            res.sendFile(filePath, {
                acceptRanges: true,
                lastModified: true,
                dotfiles: 'deny'
            });
        } else {
            res.status(404).end();
        }
    } catch (e) {
        res.status(500).end();
    }
});

// Settings API
app.get('/api/settings', (req, res) => {
    try {
        const configPath = path.join(process.cwd(), 'config.ini');
        let settings = {
            galleryPath: process.cwd(),
            browserPath: 'default',
            autoPlay: false,
            language: 'en',
            theme: 'system'
        };

        if (fs.existsSync(configPath)) {
            const content = fs.readFileSync(configPath, 'utf8');
            const lines = content.split(/\r?\n/);

            const gPath = lines.find(l => l.trim().startsWith('GalleryPath='));
            if (gPath) settings.galleryPath = gPath.split('=')[1].trim().replace(/^["']|["']$/g, '');

            const aPlay = lines.find(l => l.trim().startsWith('AutoPlay='));
            if (aPlay) settings.autoPlay = aPlay.split('=')[1].trim() === '1';

            const lang = lines.find(l => l.trim().startsWith('Language='));
            if (lang) settings.language = lang.split('=')[1].trim().toLowerCase();

            const bPath = lines.find(l => l.trim().startsWith('BrowserPath='));
            if (bPath) settings.browserPath = bPath.split('=')[1].trim().replace(/^["']|["']$/g, '');

            const theme = lines.find(l => l.trim().startsWith('Theme='));
            if (theme) settings.theme = theme.split('=')[1].trim().toLowerCase();
        }

        res.json(settings);
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

app.post('/api/settings', (req, res) => {
    try {
        const configPath = path.join(process.cwd(), 'config.ini');
        const { galleryPath, browserPath, autoPlay, language, theme } = req.body;

        const content = `[Settings]
BrowserPath=${browserPath || 'default'}
GalleryPath=${galleryPath || 'I:\\\\'}

; AutoPlay? (1=Yes, 0=No)
AutoPlay=${autoPlay ? '1' : '0'}

; Language (tr or en)
Language=${language || 'en'}

; Theme (system, dark, light)
Theme=${theme || 'system'}
`;

        fs.writeFileSync(configPath, content, 'utf8');
        res.json({ success: true, message: 'Settings saved. Restart required for some changes.' });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

app.post('/api/process-video', async (req, res) => {
    const { timeline, path: sourcePath, newPath } = req.body;
    if (!timeline || !timeline.tracks) return res.status(400).json({ error: "Eksik timeline verisi" });

    try {
        let clips = [];
        timeline.tracks.forEach(t => {
            t.clips.forEach(c => {
                if (c.duration > 0.05) clips.push({ ...c, trackType: t.type });
            });
        });

        if (clips.length === 0) return res.status(400).json({ error: "İşlenecek geçerli bir klip yok" });

        // Tüm kliplerin metadatasını önden alalım
        const clipMetadata = {};
        for (const clip of clips) {
            const fullPath = path.join(rootGalleryPath, clip.path);
            await new Promise((resolve) => {
                ffmpeg.ffprobe(fullPath, (err, data) => {
                    if (!err && data) {
                        const vStream = data.streams.find(s => s.codec_type === 'video');
                        const aStream = data.streams.find(s => s.codec_type === 'audio');
                        clipMetadata[clip.id] = {
                            w: vStream ? vStream.width : 0,
                            h: vStream ? vStream.height : 0,
                            hasAudio: !!aStream,
                            isImage: (mime.lookup(fullPath) || '').startsWith('image/')
                        };
                    } else {
                        clipMetadata[clip.id] = { w: 0, h: 0, hasAudio: false, isImage: false };
                    }
                    resolve();
                });
            });
        }

        // Proje boyutunu belirle: Timeline'dan gelen canvasSize'ı kullan, yoksa kliplerden hesapla
        let targetW = (timeline.canvasSize && timeline.canvasSize.w) ? parseInt(timeline.canvasSize.w) : 0;
        let targetH = (timeline.canvasSize && timeline.canvasSize.h) ? parseInt(timeline.canvasSize.h) : 0;

        // Auto-calculate only if not provided
        if (targetW === 0 || targetH === 0) {
            clips.forEach(clip => {
                const meta = clipMetadata[clip.id];
                if (!meta) return;

                // Efektif boyut (Crop uygulanmış hali)
                let cw = meta.w;
                let ch = meta.h;

                if (clip.crop) {
                    const rw = (clip.crop.w || 100) / 100;
                    const rh = (clip.crop.h || 100) / 100;
                    cw = Math.round(meta.w * rw);
                    ch = Math.round(meta.h * rh);
                }

                if (cw > targetW) targetW = cw;
                if (ch > targetH) targetH = ch;
            });
        }

        // Eğer hiçbir video klibi yoksa varsayılan
        if (targetW === 0) targetW = 1920;
        if (targetH === 0) targetH = 1080;

        // Çift sayıya zorla
        if (targetW % 2 !== 0) targetW -= 1;
        if (targetH % 2 !== 0) targetH -= 1;

        const command = ffmpeg();
        clips.forEach(c => command.input(path.join(rootGalleryPath, c.path)));

        const sourceDir = path.dirname(sourcePath);
        const targetFilename = newPath || path.basename(sourcePath);
        const targetPath = path.join(rootGalleryPath, sourceDir, targetFilename);
        const tempPath = targetPath + '.tmp.mp4';

        let totalTimelineDuration = 0;
        clips.forEach(c => {
            const end = c.offset + c.duration;
            if (end > totalTimelineDuration) totalTimelineDuration = end;
        });
        totalTimelineDuration = Math.max(1, totalTimelineDuration);

        const filterComplex = [];
        const audioStreams = [];

        filterComplex.push({
            filter: `color=s=${targetW}x${targetH}:c=black:d=${totalTimelineDuration},setsar=1`,
            outputs: 'base_v'
        });

        let currentVLabel = 'base_v';
        let vClipCounter = 0;

        clips.forEach((clip, idx) => {
            if (clip.trackType !== 'video') return;

            const meta = clipMetadata[clip.id];
            const outLabel = `vclip_${vClipCounter}`;

            const bRatio = (clip.filters.brightness || 100) / 100;
            const cVal = (clip.filters.contrast || 100) / 100;
            const s = (clip.filters.saturation || 100) / 100;
            const g = (clip.filters.gamma || 1.0);

            // 1. ADIM: Klibi Hazırla (Loop + Crop)
            let vFilters = [];
            if (meta.isImage) vFilters.push(`loop=loop=-1:size=1:start=0`);

            const clipCrop = clip.crop || {};
            // Source dimensions
            const srcW = meta.w;
            const srcH = meta.h;

            // Calculate Crop (Source crop - e.g. from ImageEditor or default)
            let cw = srcW;
            let ch = srcH;
            let cx = 0;
            let cy = 0;

            if (clipCrop.w && clipCrop.h) {
                cw = Math.round((clipCrop.w / 100) * srcW);
                ch = Math.round((clipCrop.h / 100) * srcH);
                cx = Math.round((clipCrop.x / 100) * srcW);
                cy = Math.round((clipCrop.y / 100) * srcH);

                // Safety clamp
                if (cw + cx > srcW) cw = srcW - cx;
                if (ch + cy > srcH) ch = srcH - cy;
                if (cw < 1) cw = 1;
                if (ch < 1) ch = 1;

                // Even check for ffmpeg
                if (cw % 2 !== 0) cw -= 1;
                if (ch % 2 !== 0) ch -= 1;

                if (cw > 0 && ch > 0 && (cw !== srcW || ch !== srcH)) {
                    vFilters.push(`crop=w=${cw}:h=${ch}:x=${cx}:y=${cy}`);
                }
            }

            // 2. ADIM: Zamanlama (Trim)
            vFilters.push(`trim=start=${clip.start}:duration=${clip.duration}`);
            vFilters.push(`setpts=PTS-STARTPTS+(${clip.offset}/TB)`);

            // 3. ADIM: Filtreler (EQ)
            vFilters.push(`eq=brightness=0:contrast=${cVal}:saturation=${s}:gamma=${g}`);
            if (bRatio !== 1) vFilters.push(`lutyuv=y=val*${bRatio}`);

            // 4. ADIM: Scale (Fit + Zoom)
            // Legacy Fit Logic Removed to match Frontend 1:1 pixel mapping
            // Frontend renders clips at 'sourceWidth' relative to 'canvasWidth'.
            const fitScale = 1;

            // Resulting size after fit
            const fittedW = cw * fitScale;
            const fittedH = ch * fitScale;

            // Apply User Zoom (Scale)
            const userScale = clip.transform?.scale || 1;
            const finalScale = fitScale * userScale;

            let scaledW = Math.round(cw * finalScale);
            let scaledH = Math.round(ch * finalScale);

            // Even dimensions constraint
            if (scaledW % 2 !== 0) scaledW += 1;
            if (scaledH % 2 !== 0) scaledH += 1;

            vFilters.push(`scale=${scaledW}:${scaledH}`);

            // 5. ADIM: Rotate / Flip
            if (clip.rotate) {
                if (clip.rotate === 90) vFilters.push('transpose=1');
                else if (clip.rotate === 180) vFilters.push('transpose=1,transpose=1');
                else if (clip.rotate === 270) vFilters.push('transpose=2');
            }
            if (clip.flipH) vFilters.push('hflip');
            vFilters.push('format=yuv420p');

            filterComplex.push({
                inputs: `${idx}:v`,
                filter: vFilters.join(','),
                outputs: outLabel
            });

            // 6. ADIM: Tuvale Yerleştir (Positioning)
            // Determine final dimensions after rotation
            let finalW = scaledW;
            let finalH = scaledH;
            if (clip.rotate === 90 || clip.rotate === 270) {
                finalW = scaledH;
                finalH = scaledW;
            }

            const userX = clip.transform?.x || 0;
            const userY = clip.transform?.y || 0;

            // Use Absolute Top-Left Coordinates directly (Frontend now sends absolute x/y)
            const overlayX = Math.round(userX);
            const overlayY = Math.round(userY);

            const nextVLabel = `ov_${vClipCounter}`;
            filterComplex.push({
                inputs: [currentVLabel, outLabel],
                filter: `overlay=x=${overlayX}:y=${overlayY}:enable='between(t,${clip.offset},${clip.offset + clip.duration})':eof_action=pass`,
                outputs: nextVLabel
            });
            currentVLabel = nextVLabel;
            vClipCounter++;

            if (!meta.isImage && meta.hasAudio) {
                const aLabel = `vaudio_${idx}`;
                const delay = Math.round(clip.offset * 1000);
                filterComplex.push({
                    inputs: `${idx}:a`,
                    filter: `atrim=start=${clip.start}:duration=${clip.duration},asetpts=PTS-STARTPTS,volume=${(clip.volume || 100) / 100},adelay=${delay}:all=1`,
                    outputs: aLabel
                });
                audioStreams.push(aLabel);
            }
        });

        // Add pure audio tracks
        clips.forEach((clip, idx) => {
            const meta = clipMetadata[clip.id];
            if (clip.trackType !== 'audio' || !meta.hasAudio) return;
            const aLabel = `aaudio_${idx}`;
            const delay = Math.round(clip.offset * 1000);
            filterComplex.push({
                inputs: `${idx}:a`,
                filter: `atrim=start=${clip.start}:duration=${clip.duration},asetpts=PTS-STARTPTS,volume=${(clip.volume || 100) / 100},adelay=${delay}:all=1`,
                outputs: aLabel
            });
            audioStreams.push(aLabel);
        });

        let finalAudioLabel = null;
        if (audioStreams.length > 0) {
            filterComplex.push({ inputs: audioStreams, filter: `amix=inputs=${audioStreams.length}:normalize=0`, outputs: 'af' });
            finalAudioLabel = 'af';
        }

        const outputLabels = [currentVLabel];
        if (finalAudioLabel) outputLabels.push(finalAudioLabel);

        command
            .complexFilter(filterComplex, outputLabels)
            .on('start', cmd => console.log('FFmpeg command:', cmd))
            .on('error', (err) => {
                console.error('FFmpeg error:', err);
                if (fs.existsSync(tempPath)) fs.unlinkSync(tempPath);
                res.status(500).json({ error: err.message });
            })
            .on('end', () => {
                try {
                    if (fs.existsSync(targetPath) && tempPath !== targetPath) {
                        try { fs.unlinkSync(targetPath); } catch (e) { }
                    }
                    fs.renameSync(tempPath, targetPath);
                    const finalRelPath = path.relative(rootGalleryPath, targetPath).replace(/\\/g, '/');
                    const thumbPath = getThumbPath(finalRelPath);
                    if (fs.existsSync(thumbPath)) fs.unlinkSync(thumbPath);
                    res.json({ success: true, message: "Video başarıyla işlendi", path: finalRelPath });
                } catch (e) {
                    res.status(500).json({ error: e.message });
                }
            })
            .save(tempPath);

    } catch (e) {
        console.error('Server error:', e);
        res.status(500).json({ error: e.message });
    }
});

app.listen(PORT, () => console.log(`Sunucu çalışıyor.`));
