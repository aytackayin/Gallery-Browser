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
import { spawn } from 'child_process';

const app = express();
const PORT = 3001;

// Global process tracking for video editing
const activeProcesses = new Map();
const activeThumbProcesses = new Map(); // path -> proc
const activeYtProcesses = new Map(); // processId -> proc

app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));

const getConfigs = () => {
    let rootPath = process.cwd();
    let autoPlay = false;
    let autoPlaySlides = false;
    let slideDuration = 5;
    let videoLoop = false;
    let slideLoop = false;
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

            const apSlides = lines.find(l => l.trim().startsWith('AutoPlaySlides='));
            if (apSlides) autoPlaySlides = apSlides.split('=')[1].trim() === '1';

            const sDur = lines.find(l => l.trim().startsWith('SlideDuration='));
            if (sDur) slideDuration = parseInt(sDur.split('=')[1].trim()) || 5;

            const vLoop = lines.find(l => l.trim().startsWith('VideoLoop='));
            if (vLoop) videoLoop = vLoop.split('=')[1].trim() === '1';

            const sLoop = lines.find(l => l.trim().startsWith('SlideLoop='));
            if (sLoop) slideLoop = sLoop.split('=')[1].trim() === '1';
        }

        const langPath = path.join(process.cwd(), 'languages', `${language}.json`);
        if (fs.existsSync(langPath)) {
            translations = JSON.parse(fs.readFileSync(langPath, 'utf8'));
        }
    } catch (e) { }
    return { rootPath: path.resolve(rootPath), autoPlay, autoPlaySlides, slideDuration, videoLoop, slideLoop, language, browserPath, translations };
};

const settings = getConfigs();
const rootGalleryPath = settings.rootPath;

// Thumbnail klasörü
const thumbDir = path.join(rootGalleryPath, '.gallery_thumbs');
const timelineCacheDir = path.join(thumbDir, 'timeline_cache');
if (!fs.existsSync(thumbDir)) fs.mkdirSync(thumbDir, { recursive: true });
if (!fs.existsSync(timelineCacheDir)) fs.mkdirSync(timelineCacheDir, { recursive: true });

const dbPath = path.join(rootGalleryPath, 'gallery_data.db');
const db = new Database(dbPath);
db.pragma('journal_mode = WAL');
db.exec(`CREATE TABLE IF NOT EXISTS item_info (path TEXT PRIMARY KEY, info TEXT, updated_at DATETIME DEFAULT CURRENT_TIMESTAMP)`);
db.exec(`CREATE TABLE IF NOT EXISTS thumb_map (path TEXT PRIMARY KEY, hash TEXT)`);

const EXCLUDED_DIRS = ['node_modules', '.git', 'dist', '.agent', 'public', 'src', '$RECYCLE.BIN', 'System Volume Information', '.gallery_thumbs'];
const EXCLUDED_FILES = ['gallery_data.db', 'icon.png', 'config.ini', 'GalleryLauncher.exe', 'build.bat', 'Launcher.cs', 'server.js', 'package.json', 'package-lock.json', 'index.html', 'vite.config.js', 'app.ico', 'Thumbs.db', 'desktop.ini'];

const getThumbPath = (itemPath) => {
    const hash = crypto.createHash('md5').update(itemPath).digest('hex');
    return path.join(thumbDir, `${hash}.jpg`);
};

const findUniquePath = (fullPath) => {
    if (!fs.existsSync(fullPath)) return fullPath;
    const dir = path.dirname(fullPath);
    const ext = path.extname(fullPath);
    const name = path.basename(fullPath, ext);
    let counter = 1;
    while (true) {
        const newPath = path.join(dir, `${name} (${counter})${ext}`);
        if (!fs.existsSync(newPath)) return newPath;
        counter++;
    }
};

const syncDatabasePaths = (oldRelPath, newRelPath) => {
    const isFolder = oldRelPath.endsWith('/') || (fs.existsSync(path.join(rootGalleryPath, newRelPath)) && fs.lstatSync(path.join(rootGalleryPath, newRelPath)).isDirectory());
    const oldPathForQuery = oldRelPath.replace(/\\/g, '/');
    const newPathForQuery = newRelPath.replace(/\\/g, '/');

    if (isFolder) {
        const oldPrefix = oldPathForQuery.endsWith('/') ? oldPathForQuery : oldPathForQuery + '/';
        const newPrefix = newPathForQuery.endsWith('/') ? newPathForQuery : newPathForQuery + '/';

        // 1. Update item_info for the folder itself and all children
        db.prepare("UPDATE item_info SET path = ? || SUBSTR(path, ?) WHERE path = ? OR path LIKE ?")
            .run(newPrefix, oldPrefix.length + 1, oldPathForQuery, oldPrefix + '%');

        // 2. Update thumb_map for the folder and all children
        db.prepare("UPDATE thumb_map SET path = ? || SUBSTR(path, ?) WHERE path = ? OR path LIKE ?")
            .run(newPrefix, oldPrefix.length + 1, oldPathForQuery, oldPrefix + '%');
    } else {
        // Single file update
        db.prepare("UPDATE item_info SET path = ? WHERE path = ?").run(newPathForQuery, oldPathForQuery);
        db.prepare("UPDATE thumb_map SET path = ? WHERE path = ?").run(newPathForQuery, oldPathForQuery);
    }
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
        const tHash = crypto.createHash('md5').update(itemRelPath).digest('hex');
        db.prepare("INSERT OR REPLACE INTO thumb_map (path, hash) VALUES (?, ?)").run(itemRelPath, tHash);

        const proc = ffmpeg(fullPath);
        activeThumbProcesses.set(itemRelPath, proc);

        if (type.startsWith('image/')) {
            proc.screenshots({
                timestamps: [0],
                folder: path.dirname(thumbPath),
                filename: path.basename(thumbPath),
                size: '400x?'
            })
                .on('end', () => {
                    activeThumbProcesses.delete(itemRelPath);
                    res.sendFile(thumbPath);
                })
                .on('error', () => {
                    activeThumbProcesses.delete(itemRelPath);
                    res.sendFile(fullPath);
                });
        } else if (type.startsWith('video/')) {
            ffmpeg.ffprobe(fullPath, (err, metadata) => {
                let seek = 0;
                if (!err && metadata && metadata.format.duration) {
                    seek = Math.floor(metadata.format.duration / 2);
                }

                proc.screenshots({
                    timestamps: [seek],
                    folder: path.dirname(thumbPath),
                    filename: path.basename(thumbPath),
                    size: '400x?'
                })
                    .on('end', () => {
                        activeThumbProcesses.delete(itemRelPath);
                        res.sendFile(thumbPath);
                    })
                    .on('error', () => {
                        activeThumbProcesses.delete(itemRelPath);
                        res.status(500).end();
                    });
            });
        } else {
            activeThumbProcesses.delete(itemRelPath);
            res.status(400).end();
        }
    } catch (e) {
        activeThumbProcesses.delete(itemRelPath);
        res.status(500).end();
    }
});

const getAllItems = (dir, baseDir, allFiles = [], showAudio = false) => {
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
            const isMedia = type.startsWith('image/') || type.startsWith('video/');
            const isAudio = type.startsWith('audio/');
            if (isDir || isMedia || (showAudio && isAudio)) {
                allFiles.push({ name: file.name, path: relPath, type });
            }
            if (isDir) getAllItems(res, baseDir, allFiles, showAudio);
        }
    } catch (e) { }
    return allFiles;
};

app.get('/api/scan', (req, res) => {
    try {
        const subPath = req.query.path || '';
        const showAudio = req.query.audio === 'true';
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

                // Track existing thumbnails automatically
                const tPath = getThumbPath(relPath);
                if (fs.existsSync(tPath)) {
                    db.prepare("INSERT OR IGNORE INTO thumb_map (path, hash) VALUES (?, ?)").run(relPath, crypto.createHash('md5').update(relPath).digest('hex'));
                }

                let hasSubfolders = false;
                if (item.isDirectory()) {
                    try {
                        const subItems = fs.readdirSync(fullPath, { withFileTypes: true });
                        hasSubfolders = subItems.some(si => si.isDirectory() && !EXCLUDED_DIRS.includes(si.name));
                    } catch (e) { }
                }

                return {
                    name: item.name,
                    path: relPath,
                    type: item.isDirectory() ? 'folder' : (mime.lookup(item.name) || 'unknown'),
                    hasSubfolders
                };
            })
            .filter(item => {
                if (item.type === 'folder') return true;
                if (item.type.startsWith('image/') || item.type.startsWith('video/')) return true;
                if (showAudio && item.type.startsWith('audio/')) return true;
                return false;
            })
            .sort((a, b) => (b.type === 'folder' ? 1 : -1) - (a.type === 'folder' ? 1 : -1) || a.name.localeCompare(b.name));
        res.json({
            currentPath: subPath,
            items: result,
            autoPlay: settings.autoPlay,
            autoPlaySlides: settings.autoPlaySlides,
            slideDuration: settings.slideDuration,
            videoLoop: settings.videoLoop,
            slideLoop: settings.slideLoop,
            language: settings.language,
            translations: settings.translations
        });
    } catch (error) { res.status(500).json({ error: error.message }); }
});

app.post('/api/create-folder', (req, res) => {
    const { parentPath, folderName } = req.body;
    if (!folderName) return res.status(400).json({ error: "Klasör ismi gerekli" });

    const fullParentPath = path.join(rootGalleryPath, parentPath);
    const fullNewPath = path.join(fullParentPath, folderName);

    if (!fullNewPath.toLowerCase().startsWith(rootGalleryPath.toLowerCase())) {
        return res.status(403).json({ error: "Yasak" });
    }

    try {
        if (fs.existsSync(fullNewPath)) {
            return res.status(409).json({ error: "Klasör zaten var" });
        }
        fs.mkdirSync(fullNewPath, { recursive: true });
        res.json({ success: true, path: path.relative(rootGalleryPath, fullNewPath).replace(/\\/g, '/') });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

app.get('/api/search', (req, res) => {
    try {
        const query = (req.query.q || '').toLowerCase();
        const showAudio = req.query.audio === 'true';
        if (!query) return res.json({ items: [] });
        const allItems = getAllItems(rootGalleryPath, rootGalleryPath, [], showAudio);
        const dbItems = db.prepare("SELECT path FROM item_info WHERE LOWER(info) LIKE ?").all(`%${query}%`).map(row => row.path.toLowerCase());
        const filtered = allItems.filter(item => {
            const nameMatch = item.name.toLowerCase().includes(query);
            const infoMatch = dbItems.includes(item.path.toLowerCase());
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

// Video Timeline Thumbnails (Filmstrip)
app.get('/api/video-timeline-thumbs', async (req, res) => {
    try {
        const { path: itemPath, count = 1, width = 40, height = 20, startTime = 0, duration = 0 } = req.query;
        if (!itemPath) return res.status(400).end();

        const fullPath = path.join(rootGalleryPath, itemPath);
        if (!fs.existsSync(fullPath)) return res.status(404).end();

        const totalCount = parseInt(count);
        const w = parseInt(width);
        const h = parseInt(height);
        const start = parseFloat(startTime);
        const dur = parseFloat(duration);

        const hash = crypto.createHash('md5').update(`${itemPath}_thumbs_${totalCount}_${w}_${h}_${start}_${dur}`).digest('hex');
        const cachePath = path.join(timelineCacheDir, `strip_${hash}.jpg`);

        if (fs.existsSync(cachePath)) {
            return res.sendFile(cachePath);
        }

        const fps = (totalCount > 1 && dur > 0) ? (totalCount / dur) : 1;

        const proc = ffmpeg(fullPath);
        activeThumbProcesses.set(itemPath, proc);

        // EXTRA FAST SETTINGS
        proc.inputOptions([
            `-ss ${start}`,      // Fast seek before input
            `-t ${dur + 0.5}`,   // Limit data read
            '-re'               // Read at native rate or just let it fly
        ]);

        proc.complexFilter([
            `fps=${fps},scale=${w}:${h}:force_original_aspect_ratio=increase,crop=${w}:${h},tile=${totalCount}x1`
        ])
            .frames(1)
            .outputOptions([
                '-q:v 6',            // Slightly lower quality for much faster encoding
                '-v quiet',          // No logging overhead
                '-threads 2'         // Limit threads per small job
            ])
            .noAudio()
            .output(cachePath);

        proc.on('start', (commandLine) => {
            // Optional: console.log('Spawned FFmpeg with command: ' + commandLine);
        });

        proc.on('end', () => {
            activeThumbProcesses.delete(itemPath);
            if (fs.existsSync(cachePath)) {
                res.sendFile(cachePath);
            } else {
                if (!res.headersSent) res.status(500).end();
            }
        });

        proc.on('error', (err) => {
            activeThumbProcesses.delete(itemPath);
            if (!res.headersSent) res.status(500).end();
        });

        // CRITICAL: Immediately kill the process if the client closes the connection
        req.on('close', () => {
            if (activeThumbProcesses.has(itemPath)) {
                try {
                    // Try to kill the process group or the process itself
                    activeThumbProcesses.get(itemPath).kill('SIGKILL');
                } catch (e) { }
                activeThumbProcesses.delete(itemPath);
            }
        });

        proc.run();

    } catch (e) {
        if (!res.headersSent) res.status(500).end();
    }
});

// Audio Waveform Generation
const killRelatedProcesses = (normalizedPath) => {
    const folderPath = normalizedPath.endsWith('/') ? normalizedPath : normalizedPath + '/';

    // Kill video editing processes
    activeProcesses.forEach((proc, id) => {
        // Unfortunately activeProcesses doesn't store path easily, but usually it's one per session
    });

    // Kill thumb processes
    activeThumbProcesses.forEach((proc, p) => {
        if (p === normalizedPath || p.startsWith(folderPath)) {
            try { proc.kill('SIGKILL'); } catch (e) { }
            activeThumbProcesses.delete(p);
        }
    });
};

app.get('/api/audio-waveform', async (req, res) => {
    try {
        const { path: itemPath, width = 100, height = 45, color = '0x46d369', startTime = 0, duration = 0 } = req.query;
        if (!itemPath) return res.status(400).end();

        const fullPath = path.join(rootGalleryPath, itemPath);
        if (!fs.existsSync(fullPath)) return res.status(404).end();

        const w = parseInt(width);
        const h = parseInt(height);
        const start = parseFloat(startTime);
        const dur = parseFloat(duration);

        const hash = crypto.createHash('md5').update(`${itemPath}_wave_${w}_${h}_${color}_${start}_${dur}`).digest('hex');
        const cachePath = path.join(timelineCacheDir, `wave_${hash}.png`);

        if (fs.existsSync(cachePath)) {
            return res.sendFile(cachePath);
        }

        const proc = ffmpeg(fullPath);
        activeThumbProcesses.set(itemPath, proc);

        // Audio fast seek and duration
        proc.inputOptions([`-ss ${start}`]);
        if (dur > 0) proc.inputOptions([`-t ${dur + 0.5}`]);

        proc.complexFilter([
            `aformat=channel_layouts=mono,showwavespic=s=${w}x${h}:colors=${color}`
        ])
            .frames(1)
            .noAudio()
            .output(cachePath);

        proc.on('end', () => {
            activeThumbProcesses.delete(itemPath);
            if (fs.existsSync(cachePath)) {
                res.sendFile(cachePath);
            } else {
                if (!res.headersSent) res.status(500).end();
            }
        })
            .on('error', (err) => {
                activeThumbProcesses.delete(itemPath);
                if (!res.headersSent) res.status(500).end();
            });

        req.on('close', () => {
            if (activeThumbProcesses.has(itemPath)) {
                try { activeThumbProcesses.get(itemPath).kill('SIGKILL'); } catch (e) { }
                activeThumbProcesses.delete(itemPath);
            }
        });

        proc.run();

    } catch (e) {
        if (!res.headersSent) res.status(500).end();
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
        const normalizedItemPath = itemPath.replace(/\\/g, '/');
        const folderPath = normalizedItemPath.endsWith('/') ? normalizedItemPath : normalizedItemPath + '/';

        // 1. Kill any active processes related to this path
        killRelatedProcesses(normalizedItemPath);

        // 2. Database Cleanup First (Success likely, unless DB locked)
        const relatedThumbs = db.prepare("SELECT hash FROM thumb_map WHERE path = ? OR path LIKE ?").all(normalizedItemPath, folderPath + '%');
        relatedThumbs.forEach(t => {
            const tPath = path.join(thumbDir, `${t.hash}.jpg`);
            if (fs.existsSync(tPath)) try { fs.unlinkSync(tPath); } catch (e) { }
        });
        db.prepare("DELETE FROM thumb_map WHERE path = ? OR path LIKE ?").run(normalizedItemPath, folderPath + '%');
        db.prepare("DELETE FROM item_info WHERE path = ? OR path LIKE ?").run(normalizedItemPath, folderPath + '%');

        // 3. Filesystem Cleanup
        if (fs.existsSync(absolutePath)) {
            if (fs.lstatSync(absolutePath).isDirectory()) {
                // Be extra careful with recursive delete on Windows
                fs.rmSync(absolutePath, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 });
            } else {
                fs.unlinkSync(absolutePath);
            }
        }

        res.json({ success: true });
    } catch (e) {
        console.error("Delete error:", e);
        res.status(500).json({ error: "Delete failed: " + e.message });
    }
});

app.post('/api/move', (req, res) => {
    const { sourcePath, destFolderPath, overwrite, autoRename } = req.body;
    const fullSource = path.join(rootGalleryPath, sourcePath);
    const fullDestFolder = path.join(rootGalleryPath, destFolderPath);
    const fileName = path.basename(sourcePath);
    let fullDest = path.join(fullDestFolder, fileName);
    let newRelPath = path.join(destFolderPath, fileName).replace(/\\/g, '/');

    if (!fullSource.toLowerCase().startsWith(rootGalleryPath.toLowerCase()) ||
        !fullDestFolder.toLowerCase().startsWith(rootGalleryPath.toLowerCase())) {
        return res.status(403).json({ error: "Yasak" });
    }

    try {
        if (fs.existsSync(fullSource)) {
            if (!fs.existsSync(fullDestFolder)) {
                return res.status(404).json({ error: "Hedef klasör bulunamadı" });
            }

            // Eğer kaynak ve hedef aynıysa (isimlendirme aynı, sadece üzerine yaz denmişse)
            if (fullSource.toLowerCase() === fullDest.toLowerCase() && !autoRename) {
                // Hiçbir şey yapma, başarılı dön
                return res.json({ success: true, newPath: sourcePath.replace(/\\/g, '/') });
            }

            if (fs.existsSync(fullDest)) {
                if (autoRename) {
                    fullDest = findUniquePath(fullDest);
                    newRelPath = path.relative(rootGalleryPath, fullDest).replace(/\\/g, '/');
                } else if (!overwrite) {
                    return res.status(409).json({ error: "Dosya zaten var", code: 'CONFLICT' });
                } else {
                    // Overwrite: Hedef dosyayı sil
                    try {
                        if (fs.lstatSync(fullDest).isDirectory()) {
                            fs.rmSync(fullDest, { recursive: true, force: true });
                        } else {
                            fs.unlinkSync(fullDest);
                        }
                    } catch (e) { }
                }
            }

            fs.renameSync(fullSource, fullDest);

            // Veritabanını Tam Senkronize Et (Folder & File)
            if (!autoRename || (autoRename && sourcePath !== newRelPath)) {
                syncDatabasePaths(sourcePath, newRelPath);
            }

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

app.post('/api/save-screenshot', (req, res) => {
    const { folderPath, imageData } = req.body;
    if (!folderPath || !imageData) return res.status(400).json({ error: "Eksik veri" });

    const fullFolderPath = path.join(rootGalleryPath, folderPath);
    if (!fullFolderPath.toLowerCase().startsWith(rootGalleryPath.toLowerCase())) {
        return res.status(403).json({ error: "Yasak" });
    }

    try {
        const timestamp = Date.now();
        const randomSuffix = crypto.randomBytes(4).toString('hex');
        const fileName = `Screenshot_${timestamp}_${randomSuffix}.jpg`;
        const absolutePath = path.join(fullFolderPath, fileName);

        const base64Data = imageData.replace(/^data:image\/\w+;base64,/, "");
        const buffer = Buffer.from(base64Data, 'base64');

        fs.writeFileSync(absolutePath, buffer);

        // Veritabanı ve thumb sistemine kaydet (Opsiyonel ama iyi olur)
        const relPath = path.join(folderPath, fileName).replace(/\\/g, '/');
        const tHash = crypto.createHash('md5').update(relPath).digest('hex');
        db.prepare("INSERT OR REPLACE INTO thumb_map (path, hash) VALUES (?, ?)").run(relPath, tHash);
        // Thumb oluştur
        const thumbPath = path.join(thumbDir, `${tHash}.jpg`);
        // Screenshot zaten resim, thumb olarak da küçültülüp kullanılabilir ama şimdilik backend'in otomatik thumb sistemine bırakalım
        // Veya direkt buffer'ı thumb olarak kopyalayabiliriz (büyük olur ama çalışır)

        res.json({ success: true, message: "Screenshot kaydedildi", newPath: relPath });
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
            if (fullOldPath.toLowerCase() === fullNewPath.toLowerCase()) {
                // Sadece info güncelle
                if (info !== undefined) {
                    db.prepare("INSERT OR REPLACE INTO item_info (path, info) VALUES (?, ?)").run(oldPath, info || '');
                }
                return res.json({ success: true, newPath: oldPath });
            }

            if (fs.existsSync(fullNewPath)) {
                return res.status(409).json({ error: "Bu isimde dosya zaten var" });
            }
            fs.renameSync(fullOldPath, fullNewPath);

            // Veritabanını Tam Senkronize Et (Folder & File)
            syncDatabasePaths(oldPath, newRelPath);

            // Info'yu güncelle (Eğer not girilmişse üzerine yaz)
            if (info !== undefined && info !== null) {
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

    let deletedCount = 0;
    let failed = [];

    paths.forEach(p => {
        const absolutePath = path.join(rootGalleryPath, p);
        if (!absolutePath.toLowerCase().startsWith(rootGalleryPath.toLowerCase())) {
            failed.push({ path: p, error: "Access denied" });
            return;
        }

        try {
            const normalizedPath = p.replace(/\\/g, '/');
            const folderPath = normalizedPath.endsWith('/') ? normalizedPath : normalizedPath + '/';

            // 1. Kill related procs
            killRelatedProcesses(normalizedPath);

            // 2. DB and Thumbs cleanup
            const relatedThumbs = db.prepare("SELECT hash FROM thumb_map WHERE path = ? OR path LIKE ?").all(normalizedPath, folderPath + '%');
            relatedThumbs.forEach(t => {
                const tPath = path.join(thumbDir, `${t.hash}.jpg`);
                if (fs.existsSync(tPath)) try { fs.unlinkSync(tPath); } catch (e) { }
            });
            db.prepare("DELETE FROM thumb_map WHERE path = ? OR path LIKE ?").run(normalizedPath, folderPath + '%');
            db.prepare("DELETE FROM item_info WHERE path = ? OR path LIKE ?").run(normalizedPath, folderPath + '%');

            // 3. Filesystem
            if (fs.existsSync(absolutePath)) {
                if (fs.lstatSync(absolutePath).isDirectory()) {
                    fs.rmSync(absolutePath, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 });
                } else {
                    fs.unlinkSync(absolutePath);
                }
            }
            deletedCount++;
        } catch (e) {
            failed.push({ path: p, error: e.message });
        }
    });

    res.json({ success: true, count: deletedCount, failed });
});

app.post('/api/batch-move', (req, res) => {
    const { sourcePaths, destFolderPath, overwrite, autoRename } = req.body;
    if (!Array.isArray(sourcePaths) || !destFolderPath) return res.status(400).json({ error: "Invalid input" });

    const fullDestDir = path.join(rootGalleryPath, destFolderPath);
    if (!fullDestDir.toLowerCase().startsWith(rootGalleryPath.toLowerCase())) return res.status(403).json({ error: "Access denied" });

    let moved = [];
    let conflicts = [];
    let failed = [];

    sourcePaths.forEach(src => {
        const fullSrcPath = path.join(rootGalleryPath, src);
        const fileName = path.basename(src);
        let fullDestPath = path.join(fullDestDir, fileName);
        let newRelPath = path.join(destFolderPath, fileName).replace(/\\/g, '/');

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
                if (autoRename) {
                    fullDestPath = findUniquePath(fullDestPath);
                    newRelPath = path.relative(rootGalleryPath, fullDestPath).replace(/\\/g, '/');
                } else if (!overwrite) {
                    conflicts.push(src);
                    return;
                } else {
                    // Overwrite: Hedefi sil
                    if (fs.lstatSync(fullDestPath).isDirectory()) {
                        fs.rmSync(fullDestPath, { recursive: true, force: true });
                    } else {
                        fs.unlinkSync(fullDestPath);
                    }
                    // Eski info'yu sil
                    db.prepare("DELETE FROM item_info WHERE path = ?").run(newRelPath);
                }
            }

            fs.renameSync(fullSrcPath, fullDestPath);

            // DB Tam Senkronizasyon
            const oldRelPath = src.replace(/\\/g, '/');
            syncDatabasePaths(oldRelPath, newRelPath);
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
            theme: 'system',
            autoPlaySlides: false,
            slideDuration: 5,
            videoLoop: false,
            slideLoop: false
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

            const apSlides = lines.find(l => l.trim().startsWith('AutoPlaySlides='));
            if (apSlides) settings.autoPlaySlides = apSlides.split('=')[1].trim() === '1';

            const sDur = lines.find(l => l.trim().startsWith('SlideDuration='));
            if (sDur) settings.slideDuration = parseInt(sDur.split('=')[1].trim()) || 5;

            const vLoop = lines.find(l => l.trim().startsWith('VideoLoop='));
            if (vLoop) settings.videoLoop = vLoop.split('=')[1].trim() === '1';

            const sLoop = lines.find(l => l.trim().startsWith('SlideLoop='));
            if (sLoop) settings.slideLoop = sLoop.split('=')[1].trim() === '1';
        }

        res.json(settings);
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

app.post('/api/settings', (req, res) => {
    try {
        const configPath = path.join(process.cwd(), 'config.ini');
        const { galleryPath, browserPath, autoPlay, language, theme, autoPlaySlides, slideDuration, videoLoop, slideLoop } = req.body;

        const content = `[Settings]
BrowserPath=${browserPath || 'default'}
GalleryPath=${galleryPath || 'I:\\\\'}

; AutoPlay? (1=Yes, 0=No)
AutoPlay=${autoPlay ? '1' : '0'}

; Language (tr or en)
Language=${language || 'en'}

; Theme (system, dark, light)
Theme=${theme || 'system'}

; Slideshow Settings
AutoPlaySlides=${autoPlaySlides ? '1' : '0'}
SlideDuration=${slideDuration || 5}
VideoLoop=${videoLoop ? '1' : '0'}
SlideLoop=${slideLoop ? '1' : '0'}
`;

        fs.writeFileSync(configPath, content, 'utf8');
        res.json({ success: true, message: 'Settings saved. Restart required for some changes.' });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

app.post('/api/process-video', async (req, res) => {
    const { timeline, path: sourcePath, newPath, overwrite } = req.body;
    if (!timeline || !timeline.tracks) return res.status(400).json({ error: "Eksik timeline verisi" });

    try {
        let clips = [];
        timeline.tracks.forEach(t => {
            t.clips.forEach(c => {
                if (c.duration > 0.05) clips.push({ ...c, trackType: t.type });
            });
        });

        if (clips.length === 0) return res.status(400).json({ error: "İşlenecek geçerli bir klip yok" });

        // Determine target path
        const sourceDir = path.dirname(sourcePath);
        const targetFilename = newPath || path.basename(sourcePath);
        const targetPath = path.join(rootGalleryPath, sourceDir, targetFilename);

        // Check if file exists (unless overwrite is explicitly true)
        if (!overwrite && fs.existsSync(targetPath)) {
            return res.status(409).json({
                error: "Dosya zaten mevcut",
                code: 'FILE_EXISTS',
                existingFile: targetFilename
            });
        }

        // Tüm kliplerin metadatasını önden alalım
        const clipMetadata = {};
        for (const clip of clips) {
            const fullPath = path.join(rootGalleryPath, clip.path);
            const isImage = (mime.lookup(fullPath) || '').startsWith('image/');

            // Metadata Strategy: TRUST THE FRONTEND.
            // If the frontend sent source dimensions, use them. They represent exactly what the user saw.
            // Only use ffprobe for audio detection or if dimensions are missing.
            await new Promise((resolve) => {
                let w = clip.sourceWidth;
                let h = clip.sourceHeight;
                let hasAudio = false;

                // Check audio existence quickly if possible, or assume false for images
                const checkAudio = () => {
                    ffmpeg.ffprobe(fullPath, (err, data) => {
                        if (!err && data && data.streams) {
                            const aStream = data.streams.find(s => s.codec_type === 'audio');
                            hasAudio = !!aStream;

                            // Fallback dimensions if frontend was empty
                            if (!w || !h) {
                                const vStreams = data.streams
                                    .filter(s => s.width && s.height)
                                    .sort((a, b) => (b.width * b.height) - (a.width * a.height));
                                const vStream = vStreams[0];
                                if (vStream) {
                                    w = vStream.width;
                                    h = vStream.height;
                                }
                            }
                        }
                        // Final Fallback
                        if (!w) w = 1920;
                        if (!h) h = 1080;

                        clipMetadata[clip.id] = { w, h, hasAudio, isImage };
                        console.log(`[Metadata] Clip ${clip.id} (${clip.name}): ${w}x${h} (Source: ${clip.sourceWidth ? 'Frontend' : 'FFprobe'})`);
                        resolve();
                    });
                };

                if (isImage) {
                    // Images usually don't have audio we care about for this editor context (unless specific format)
                    // And we trust frontend dims implicitly for images to fix rotation/thumbnail orientation issues
                    if (w && h) {
                        clipMetadata[clip.id] = { w, h, hasAudio: false, isImage: true };
                        console.log(`[Metadata] Clip ${clip.id} (${clip.name}): ${w}x${h} (Source: Frontend-Image)`);
                        resolve();
                    } else {
                        checkAudio();
                    }
                } else {
                    checkAudio();
                }
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
            if (meta.isImage) {
                vFilters.push(`loop=loop=-1:size=1:start=0`);
            }

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

            // Calculate speed factor
            const sourceDur = clip.sourceDuration || clip.duration;
            const timelineDur = clip.duration || 0.1;
            const speedFactor = sourceDur / timelineDur; // e.g. 0.5 for slowing down to 2x duration

            // Safety: Ensure we don't trim more than exists in source metadata
            const safeSourceDur = (meta.duration && (clip.start + sourceDur > meta.duration))
                ? Math.max(0.1, meta.duration - clip.start)
                : sourceDur;

            console.log(`[Speed] Clip ${clip.id}: SourceDur=${sourceDur.toFixed(2)} (Safe=${safeSourceDur.toFixed(2)}), TimelineDur=${timelineDur.toFixed(2)}, Speed=${speedFactor.toFixed(2)}x`);

            // 2. ADIM: Zamanlama (Trim & PTS)
            vFilters.push(`trim=start=${clip.start}:duration=${safeSourceDur}`);
            vFilters.push(`setpts=PTS-STARTPTS`); // Reset to 0
            vFilters.push(`setpts=(${1 / speedFactor})*PTS`); // Stretch/Compress
            vFilters.push(`fps=30`); // Ensure frames are generated/sampled at 30fps for the new duration
            vFilters.push(`setpts=PTS+(${clip.offset}/TB)`); // Move to timeline position

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

            const userX = parseFloat(clip.transform?.x || 0);
            const userY = parseFloat(clip.transform?.y || 0);
            // userScale is already defined above in ADIM 4
            const currentScale = parseFloat(userScale || 1);

            // Mathematical Conversion: Center-Pivot (Frontend) to FFmpeg Top-Left
            // 1. Calculate the Visual Pivot (Center of the unrotated, uncropped original box on canvas)
            const pivotX = userX + Number(srcW) / 2;
            const pivotY = userY + Number(srcH) / 2;

            // 2. Calculate the Relative Center of the CROPPED clip (relative to the pivot)
            // Before rotation, the center of the cropped part is at (cx + cw/2, cy + ch/2) relative to top-left(0,0)
            // Relative to pivot (srcW/2, srcH/2):
            const relCX = (Number(cx) + Number(cw) / 2) - Number(srcW) / 2;
            const relCY = (Number(cy) + Number(ch) / 2) - Number(srcH) / 2;

            // 3. Apply Rotation and Scale to this relative vector
            // Standard Grid: X right, Y down. Rotation is Clockwise.
            let rotatedRelX = relCX;
            let rotatedRelY = relCY;

            if (clip.rotate === 90) {
                // (x, y) -> (-y, x)
                rotatedRelX = -relCY;
                rotatedRelY = relCX;
            } else if (clip.rotate === 180) {
                // (x, y) -> (-x, -y)
                rotatedRelX = -relCX;
                rotatedRelY = -relCY;
            } else if (clip.rotate === 270) {
                // (x, y) -> (y, -x)
                rotatedRelX = relCY;
                rotatedRelY = -relCX;
            }

            // Apply Scale
            const finalRelX = rotatedRelX * currentScale;
            const finalRelY = rotatedRelY * currentScale;

            // 4. Calculate Final Center in Absolute Coords
            const finalCenterX = pivotX + finalRelX;
            const finalCenterY = pivotY + finalRelY;

            // 5. Calculate Top-Left for Overlay (subtract half of the FINAL ROTATED dimensions)
            const overlayX = Math.round(finalCenterX - finalW / 2);
            const overlayY = Math.round(finalCenterY - finalH / 2);

            console.log(`[Overlay] Clip ${idx} (${clip.name}): x=${overlayX}, y=${overlayY}, scale=${currentScale}`);

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
                // const sourceDur = clip.sourceDuration || clip.duration; // Already defined above
                // const timelineDur = clip.duration || 0.1; // Already defined above
                // const speedFactor = sourceDur / timelineDur; // Already defined above

                let aFilters = [`atrim=start=${clip.start}:duration=${sourceDur}`, `asetpts=PTS-STARTPTS`];

                // atempo handles 0.5 - 2.0. Chain them if outside.
                let tempSpeed = speedFactor;
                while (tempSpeed > 2.0) { aFilters.push(`atempo=2.0`); tempSpeed /= 2.0; }
                while (tempSpeed < 0.5) { aFilters.push(`atempo=0.5`); tempSpeed /= 0.5; }
                if (Math.abs(tempSpeed - 1.0) > 0.01) aFilters.push(`atempo=${tempSpeed}`);

                aFilters.push(`volume=${(clip.volume || 100) / 100}`, `adelay=${delay}:all=1`);

                filterComplex.push({
                    inputs: `${idx}:a`,
                    filter: aFilters.join(','),
                    outputs: aLabel
                });
                audioStreams.push(aLabel);
            }
        });

        // Add pure audio tracks
        clips.forEach((clip, idx) => {
            const meta = clipMetadata[clip.id];
            if (clip.trackType !== 'audio' || !meta.hasAudio) return;
            const aLabel = `audio_${idx}`;
            const delay = Math.round(clip.offset * 1000);
            const sourceDur = clip.sourceDuration || clip.duration;
            const timelineDur = clip.duration || 0.1;
            const speedFactor = sourceDur / timelineDur;

            let aFilters = [`atrim=start=${clip.start}:duration=${sourceDur}`, `asetpts=PTS-STARTPTS`];

            let tempSpeed = speedFactor;
            while (tempSpeed > 2.0) { aFilters.push(`atempo=2.0`); tempSpeed /= 2.0; }
            while (tempSpeed < 0.5) { aFilters.push(`atempo=0.5`); tempSpeed /= 0.5; }
            if (Math.abs(tempSpeed - 1.0) > 0.01) aFilters.push(`atempo=${tempSpeed}`);

            aFilters.push(`volume=${(clip.volume || 100) / 100}`, `adelay=${delay}:all=1`);

            filterComplex.push({
                inputs: `${idx}:a`,
                filter: aFilters.join(','),
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

        // File existence already checked at the beginning of this function
        // Now start SSE stream for processing
        const processId = Date.now().toString();
        res.setHeader('Content-Type', 'text/event-stream');
        res.setHeader('Cache-Control', 'no-cache');
        res.setHeader('Connection', 'keep-alive');

        const sendUpdate = (data) => {
            res.write(`data: ${JSON.stringify(data)}\n\n`);
        };

        // Send processId immediately so frontend can cancel
        sendUpdate({ type: 'started', processId });

        command
            .complexFilter(filterComplex, outputLabels)
            .on('start', cmd => {
                console.log('FFmpeg command:', cmd);
                activeProcesses.set(processId, command);
            })
            .on('progress', progress => {
                if (progress.percent) {
                    sendUpdate({ type: 'progress', percent: Math.min(99, Math.max(0, progress.percent)), processId });
                }
            })
            .on('error', (err) => {
                console.error('FFmpeg error:', err);
                activeProcesses.delete(processId);
                if (fs.existsSync(tempPath)) { try { fs.unlinkSync(tempPath); } catch (e) { } }
                sendUpdate({ type: 'error', error: err.message });
                res.end();
            })
            .on('end', () => {
                try {
                    activeProcesses.delete(processId);
                    if (fs.existsSync(targetPath) && tempPath !== targetPath) {
                        try { fs.unlinkSync(targetPath); } catch (e) { }
                    }
                    fs.renameSync(tempPath, targetPath);
                    const finalRelPath = path.relative(rootGalleryPath, targetPath).replace(/\\/g, '/');
                    const tHash = crypto.createHash('md5').update(finalRelPath).digest('hex');
                    db.prepare("INSERT OR REPLACE INTO thumb_map (path, hash) VALUES (?, ?)").run(finalRelPath, tHash);

                    const thumbPath = getThumbPath(finalRelPath);
                    if (fs.existsSync(thumbPath)) { try { fs.unlinkSync(thumbPath); } catch (e) { } }

                    sendUpdate({ type: 'success', message: "Video başarıyla işlendi", path: finalRelPath, processId });
                    res.end();
                } catch (e) {
                    sendUpdate({ type: 'error', error: e.message });
                    res.end();
                }
            })
            .save(tempPath);

        // Handle client disconnect
        req.on('close', () => {
            // Optional: Auto-kill on disconnect? User asked for a cancel button, 
            // but killing on close is good practice for orphan processes.
            // activeProcesses.get(processId)?.kill();
            // activeProcesses.delete(processId);
        });

    } catch (e) {
        console.error('Server error:', e);
        res.write(`data: ${JSON.stringify({ type: 'error', error: e.message })}\n\n`);
        res.end();
    }
});

app.post('/api/cancel-video', (req, res) => {
    const { processId } = req.body;
    if (activeProcesses.has(processId)) {
        const command = activeProcesses.get(processId);
        command.kill('SIGKILL');
        activeProcesses.delete(processId);
        res.json({ success: true, message: "İşlem iptal edildi" });
    } else {
        res.status(404).json({ error: "İşlem bulunamadı veya çoktan bitti" });
    }
});

const discoverThumbs = async (currentDir = rootGalleryPath) => {
    try {
        const files = fs.readdirSync(currentDir, { withFileTypes: true });
        for (const file of files) {
            const resPath = path.join(currentDir, file.name);
            const relPath = path.relative(rootGalleryPath, resPath).replace(/\\/g, '/');

            if (file.isDirectory()) {
                if (EXCLUDED_DIRS.includes(file.name)) continue;
                await discoverThumbs(resPath);
            } else {
                const type = mime.lookup(file.name) || '';
                if (type.startsWith('image/') || type.startsWith('video/')) {
                    const hash = crypto.createHash('md5').update(relPath).digest('hex');
                    const tPath = path.join(thumbDir, `${hash}.jpg`);
                    if (fs.existsSync(tPath)) {
                        db.prepare("INSERT OR IGNORE INTO thumb_map (path, hash) VALUES (?, ?)").run(relPath, hash);
                    }
                }
            }
        }
    } catch (e) { }
};

const cleanupMap = async () => {
    let count = 0;
    try {
        const infoEntries = db.prepare("SELECT path FROM item_info").all();
        for (const entry of infoEntries) {
            if (!fs.existsSync(path.join(rootGalleryPath, entry.path))) {
                db.prepare("DELETE FROM item_info WHERE path = ?").run(entry.path);
                count++;
            }
        }
        const mapEntries = db.prepare("SELECT path, hash FROM thumb_map").all();
        for (const entry of mapEntries) {
            if (!fs.existsSync(path.join(rootGalleryPath, entry.path))) {
                const tPath = path.join(thumbDir, `${entry.hash}.jpg`);
                if (fs.existsSync(tPath)) try { fs.unlinkSync(tPath); } catch (e) { }
                db.prepare("DELETE FROM thumb_map WHERE path = ?").run(entry.path);
            }
        }
    } catch (e) { }
    return count;
};

app.post('/api/admin/cleanup-thumbs', async (req, res) => {
    try {
        await discoverThumbs();
        const deletedCount = await cleanupMap();
        res.json({ success: true, deletedCount });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

app.listen(PORT, () => {
    console.log(`Sunucu çalışıyor.`);
    const runCycle = async () => {
        await discoverThumbs();
        await cleanupMap();
        setTimeout(runCycle, 600000);
    };
    runCycle();
});

// Clear Timeline Cache
app.post('/api/clear-timeline-cache', (req, res) => {
    try {
        // Kill all active thumbnail processes
        activeThumbProcesses.forEach((proc, p) => {
            try { proc.kill('SIGKILL'); } catch (e) { }
        });
        activeThumbProcesses.clear();

        if (fs.existsSync(timelineCacheDir)) {
            const files = fs.readdirSync(timelineCacheDir);
            for (const file of files) {
                try {
                    fs.unlinkSync(path.join(timelineCacheDir, file));
                } catch (e) { }
            }
        }
        res.json({ success: true });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// Helper to get yt-dlp path
const getYtDlpPath = () => path.join(process.cwd(), 'yt-dlp.exe');

app.get('/api/yt/info', async (req, res) => {
    try {
        const { url } = req.query;
        if (!url) return res.status(400).json({ error: "URL is required" });

        const ytDlpPath = getYtDlpPath();
        const proc = spawn(ytDlpPath, ['--dump-json', '--flat-playlist', url]);

        let output = '';
        let errorOutput = '';

        proc.stdout.on('data', (data) => { output += data.toString(); });
        proc.stderr.on('data', (data) => { errorOutput += data.toString(); });

        proc.on('close', (code) => {
            if (code !== 0) {
                return res.status(500).json({ error: errorOutput || "yt-dlp error" });
            }

            try {
                // If it's a playlist, dump-json returns multiple objects separated by newlines
                const lines = output.trim().split('\n');
                const results = lines.map(line => JSON.parse(line));

                if (results.length === 1 && results[0]._type !== 'playlist') {
                    // Single video
                    const vid = results[0];
                    res.json({
                        type: 'video',
                        title: vid.title,
                        uploader: vid.uploader || vid.channel || vid.uploader_id || "YouTube",
                        uploader_id: vid.uploader_id || "",
                        uploader_url: vid.uploader_url || vid.channel_url || "",
                        url: vid.webpage_url || url,
                        thumbnails: vid.thumbnails
                    });
                } else {
                    // Playlist
                    const playlist = results.find(r => r._type === 'playlist') || { title: 'Unknown Playlist', entries: results.filter(r => r._type !== 'playlist') };
                    const entries = results.filter(r => r.url || r.webpage_url);

                    res.json({
                        type: 'playlist',
                        title: playlist.title || "YouTube List",
                        uploader: playlist.uploader || playlist.channel || "",
                        uploader_id: playlist.uploader_id || "",
                        uploader_url: playlist.uploader_url || playlist.channel_url || "",
                        entries: entries.map(e => ({
                            title: e.title,
                            url: e.url || e.webpage_url,
                            uploader: e.uploader || e.channel || playlist.uploader || playlist.channel || "YouTube",
                            uploader_id: e.uploader_id || playlist.uploader_id || "",
                            uploader_url: e.uploader_url || playlist.uploader_url || ""
                        }))
                    });
                }
            } catch (e) {
                res.status(500).json({ error: "JSON parse error: " + e.message });
            }
        });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

app.get('/api/yt/download-stream', (req, res) => {
    try {
        const { videos: videosJson, currentPath } = req.query;
        const videos = JSON.parse(videosJson);
        const processId = `yt_${Date.now()}`;

        // SSE Keep-alive and timeout prevention
        req.socket.setTimeout(0);
        req.socket.setNoDelay(true);
        req.socket.setKeepAlive(true);

        res.setHeader('Content-Type', 'text/event-stream');
        res.setHeader('Cache-Control', 'no-cache');
        res.setHeader('Connection', 'keep-alive');

        const sendUpdate = (data) => {
            if (res.writableEnded) return;
            res.write(`data: ${JSON.stringify(data)}\n\n`);
        };

        // Heartbeat to keep connection alive every 20 seconds
        const heartbeat = setInterval(() => {
            sendUpdate({ type: 'heartbeat', timestamp: Date.now() });
        }, 20000);

        sendUpdate({ type: 'started', processId });

        (async () => {
            for (let i = 0; i < videos.length; i++) {
                const video = videos[i];
                const uploaderClean = (video.uploader_id ? video.uploader_id.replace(/^@/, '') : (video.uploader || 'YouTube')).replace(/[\\/:*?"<>|]/g, '_');
                const targetDir = path.join(rootGalleryPath, currentPath, uploaderClean);


                sendUpdate({ type: 'video_start', index: i, title: video.title, processId });

                const ytDlpPath = getYtDlpPath();
                const outputTemplate = path.join(targetDir, '%(title)s.%(ext)s');

                // Only create directory if we are actually about to start downloading
                if (!fs.existsSync(targetDir)) fs.mkdirSync(targetDir, { recursive: true });

                const args = [
                    '--newline',
                    '--progress',
                    '--no-playlist',
                    '--ignore-errors',
                    '--no-check-certificates',
                    '--no-cache-dir',
                    '--no-mtime',
                    '--user-agent', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                    '--referer', 'https://www.youtube.com/',
                    '--extractor-args', 'youtube:player_client=android',
                    '--ffmpeg-location', 'C:\\ffmpeg\\bin',
                    '--merge-output-format', 'mp4',
                    '--retries', '10',
                    '--fragment-retries', '10',
                    '--concurrent-fragments', '3',
                    '-f', 'bestvideo[ext=mp4]+bestaudio[ext=m4a]/best[ext=mp4]/best',
                    '-o', outputTemplate,
                    video.url
                ];

                const proc = spawn(ytDlpPath, args);
                activeYtProcesses.set(processId, proc);

                await new Promise((resolve) => {
                    let lastError = '';

                    proc.stdout.on('data', (data) => {
                        const line = data.toString();
                        const match = line.match(/\[download\]\s+(\d+\.\d+)%/);
                        if (match) {
                            const percent = parseFloat(match[1]);
                            sendUpdate({ type: 'progress', index: i, percent, processId });
                        }
                    });

                    proc.stderr.on('data', (data) => {
                        lastError += data.toString();
                        // Sometimes progress is in stderr
                        const line = data.toString();
                        const match = line.match(/\[download\]\s+(\d+\.\d+)%/);
                        if (match) {
                            const percent = parseFloat(match[1]);
                            sendUpdate({ type: 'progress', index: i, percent, processId });
                        }
                    });

                    proc.on('error', (err) => {
                        lastError = err.message;
                    });

                    proc.on('close', (code) => {
                        if (code === 0) {
                            const uploaderName = video.uploader || video.channel || 'YouTube';
                            let uploaderUrl = video.uploader_url;
                            if (!uploaderUrl && video.uploader_id) {
                                uploaderUrl = `https://www.youtube.com/@${video.uploader_id.replace('@', '')}`;
                            }

                            const infoNote = `${uploaderName}\n${uploaderUrl || ''}\n${video.url}`;

                            // Find the downloaded file to save note in DB
                            try {
                                const files = fs.readdirSync(targetDir);
                                const sortedFiles = files
                                    .map(f => ({ name: f, time: fs.statSync(path.join(targetDir, f)).mtime.getTime() }))
                                    .sort((a, b) => b.time - a.time);

                                if (sortedFiles.length > 0) {
                                    const fileName = sortedFiles[0].name;
                                    const absPath = path.join(targetDir, fileName);
                                    const relPath = path.relative(rootGalleryPath, absPath).replace(/\\/g, '/');

                                    const stmt = db.prepare('INSERT OR REPLACE INTO item_info (path, info) VALUES (?, ?)');
                                    stmt.run(relPath, infoNote || "");
                                }
                            } catch (e) {
                                console.error("Database note save error:", e);
                            }

                            sendUpdate({ type: 'video_success', index: i, processId });
                        } else {
                            const errorMsg = lastError ? lastError.trim().split('\n').pop() : "Process exited with code " + code;
                            sendUpdate({ type: 'video_error', index: i, error: errorMsg, processId });

                            // Cleanup empty folder if it was created and nothing was downloaded
                            try {
                                if (fs.existsSync(targetDir) && fs.readdirSync(targetDir).length === 0) {
                                    fs.rmdirSync(targetDir);
                                }
                            } catch (e) { }
                        }
                        resolve();
                    });
                });

                if (!activeYtProcesses.get(processId)) break; // Was cancelled
            }
            activeYtProcesses.delete(processId);
            clearInterval(heartbeat);
            sendUpdate({ type: 'all_success', processId });
            res.end();
        })();

        req.on('close', () => {
            clearInterval(heartbeat);
            const proc = activeYtProcesses.get(processId);
            if (proc) {
                proc.kill('SIGKILL');
                activeYtProcesses.delete(processId);
            }
        });

    } catch (e) {
        res.write(`data: ${JSON.stringify({ type: 'error', error: e.message })}\n\n`);
        res.end();
    }
});

app.post('/api/yt/cancel', (req, res) => {
    const { processId } = req.body;
    const proc = activeYtProcesses.get(processId);
    if (proc) {
        proc.kill('SIGKILL');
        activeYtProcesses.delete(processId);
        res.json({ success: true });
    } else {
        res.status(404).json({ error: "Process not found" });
    }
});
