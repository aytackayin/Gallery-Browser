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
app.use(express.json());

const getConfigs = () => {
    let rootPath = process.cwd();
    let autoPlay = false;
    let language = 'en';
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

            const lang = lines.find(l => l.trim().startsWith('Language='));
            if (lang) language = lang.split('=')[1].trim().toLowerCase();
        }

        const langPath = path.join(process.cwd(), 'languages', `${language}.json`);
        if (fs.existsSync(langPath)) {
            translations = JSON.parse(fs.readFileSync(langPath, 'utf8'));
        }
    } catch (e) { }
    return { rootPath: path.resolve(rootPath), autoPlay, language, translations };
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
            if (isDir || type.startsWith('image/') || type.startsWith('video/')) {
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
            .filter(item => item.type === 'folder' || item.type.startsWith('image/') || item.type.startsWith('video/'))
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

app.get('/api/info', (req, res) => {
    const row = db.prepare("SELECT info FROM item_info WHERE path = ?").get(req.query.path);
    res.json({ info: row ? row.info : "" });
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

app.use('/media', (req, res) => {
    const filePath = path.join(rootGalleryPath, decodeURIComponent(req.path));
    if (fs.existsSync(filePath)) res.sendFile(filePath);
    else res.status(404).send("Bulunamadı");
});

// Settings API
app.get('/api/settings', (req, res) => {
    try {
        const configPath = path.join(process.cwd(), 'config.ini');
        let settings = {
            galleryPath: process.cwd(),
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
        const { galleryPath, autoPlay, language, theme } = req.body;

        const content = `[Settings]
BrowserPath=default
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

app.listen(PORT, () => console.log(`Sunucu çalışıyor.`));
