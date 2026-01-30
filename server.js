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

app.use('/media', (req, res) => {
    const filePath = path.join(rootGalleryPath, decodeURIComponent(req.path));
    if (fs.existsSync(filePath)) res.sendFile(filePath);
    else res.status(404).send("Bulunamadı");
});

app.listen(PORT, () => console.log(`Sunucu çalışıyor.`));
