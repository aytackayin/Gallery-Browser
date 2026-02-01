import { useState, useEffect, useRef, useMemo } from 'react';
import { Folder, X, Play, Pause, ChevronRight, Home, ChevronLeft, Image as ImageIcon, Video as VideoIcon, Search, Trash2, Info, Save, FolderInput, ChevronDown, ChevronUp, Settings, CheckCircle, Scissors, RotateCw, Sun, Contrast, Lock, Unlock, Maximize2, Volume2, Plus, Trash, Droplet, CornerUpLeft, Layers, Crop, Monitor } from 'lucide-react';
import Cropper from "react-cropper";
import "cropperjs/dist/cropper.css";

const ImageEditor = ({ item, t, onSave, onClose }) => {
    const cropperRef = useRef(null);
    const [brightness, setBrightness] = useState(100);
    const [contrast, setContrast] = useState(100);
    const [saturation, setSaturation] = useState(100);
    const [gamma, setGamma] = useState(1.0);
    const [sharpen, setSharpen] = useState(0);
    const [dimensions, setDimensions] = useState({ width: 0, height: 0 });
    const [isLocked, setIsLocked] = useState(false);
    const [aspectRatio, setAspectRatio] = useState(NaN);

    // Stable image URL to prevent Cropper re-initializing on every render
    const imageUrl = useRef(`http://localhost:3001/media/${encodeURIComponent(item.path)}?t=${Date.now()}`).current;

    const onCrop = () => {
        const cropper = cropperRef.current?.cropper;
        if (cropper) {
            const data = cropper.getData(true);
            setDimensions({ width: Math.round(data.width), height: Math.round(data.height) });
        }
    };

    const handleWidthChange = (val) => {
        const width = parseInt(val) || 0;
        let height = dimensions.height;
        if (isLocked) {
            const ratio = dimensions.width / dimensions.height;
            height = Math.round(width / ratio);
        }
        setDimensions({ width, height });
    };

    const handleHeightChange = (val) => {
        const height = parseInt(val) || 0;
        let width = dimensions.width;
        if (isLocked) {
            const ratio = dimensions.width / dimensions.height;
            width = Math.round(height * ratio);
        }
        setDimensions({ width, height });
    };

    const setPresetRatio = (ratio) => {
        const cropper = cropperRef.current?.cropper;
        if (!cropper) return;
        setAspectRatio(ratio);
        cropper.setAspectRatio(ratio);
    };

    const onReady = () => {
        const cropper = cropperRef.current?.cropper;
        if (cropper) {
            // Get original image dimensions
            const imageData = cropper.getImageData();
            setDimensions({
                width: Math.round(imageData.naturalWidth),
                height: Math.round(imageData.naturalHeight)
            });
            // Set crop box to full image initially
            cropper.setData({
                x: 0,
                y: 0,
                width: imageData.naturalWidth,
                height: imageData.naturalHeight
            });
        }
    };

    const applySharpen = (ctx, width, height, amount) => {
        if (amount === 0) return;
        const weights = [0, -1, 0, -1, 5 + (1 - amount / 100) * 4, -1, 0, -1, 0];
        const imageData = ctx.getImageData(0, 0, width, height);
        const pixels = imageData.data;
        const side = 3;
        const halfSide = 1;
        const output = ctx.createImageData(width, height);
        const dst = output.data;

        for (let y = 0; y < height; y++) {
            for (let x = 0; x < width; x++) {
                const dstOff = (y * width + x) * 4;
                let r = 0, g = 0, b = 0;
                for (let cy = 0; cy < side; cy++) {
                    for (let cx = 0; cx < side; cx++) {
                        const scy = y + cy - halfSide;
                        const scx = x + cx - halfSide;
                        if (scy >= 0 && scy < height && scx >= 0 && scx < width) {
                            const srcOff = (scy * width + scx) * 4;
                            const wt = weights[cy * side + cx];
                            r += pixels[srcOff] * wt;
                            g += pixels[srcOff + 1] * wt;
                            b += pixels[srcOff + 2] * wt;
                        }
                    }
                }
                dst[dstOff] = r;
                dst[dstOff + 1] = g;
                dst[dstOff + 2] = b;
                dst[dstOff + 3] = pixels[dstOff + 3];
            }
        }
        ctx.putImageData(output, 0, 0);
    };

    const applyGamma = (ctx, width, height, gammaValue) => {
        if (gammaValue === 1.0) return;
        const imageData = ctx.getImageData(0, 0, width, height);
        const data = imageData.data;
        const gammaCorrection = 1 / gammaValue;
        for (let i = 0; i < data.length; i += 4) {
            data[i] = 255 * Math.pow(data[i] / 255, gammaCorrection);
            data[i + 1] = 255 * Math.pow(data[i + 1] / 255, gammaCorrection);
            data[i + 2] = 255 * Math.pow(data[i + 2] / 255, gammaCorrection);
        }
        ctx.putImageData(imageData, 0, 0);
    };

    const handleSave = () => {
        const cropper = cropperRef.current?.cropper;
        if (!cropper) return;

        // Final Canvas with target resolution
        const canvas = cropper.getCroppedCanvas({
            width: dimensions.width,
            height: dimensions.height,
            imageSmoothingEnabled: true,
            imageSmoothingQuality: 'high'
        });

        const ctx = canvas.getContext('2d');
        const width = canvas.width;
        const height = canvas.height;

        // Apply Native Canvas Filters
        ctx.filter = `brightness(${brightness}%) contrast(${contrast}%) saturate(${saturation}%)`;
        ctx.drawImage(canvas, 0, 0);
        ctx.filter = 'none';

        // Apply Gamma & Sharpen (Manual Pixel Logic handles the rest)
        applyGamma(ctx, width, height, gamma);
        if (sharpen > 0) applySharpen(ctx, width, height, sharpen);

        const dataUrl = canvas.toDataURL('image/jpeg', 0.95);
        onSave(dataUrl);
    };

    const resetFilters = () => {
        setBrightness(100);
        setContrast(100);
        setSaturation(100);
        setGamma(1.0);
        setSharpen(0);
        setAspectRatio(NaN);
        setIsLocked(false);
        const cropper = cropperRef.current?.cropper;
        if (cropper) {
            cropper.reset();
            const imageData = cropper.getImageData();
            setDimensions({
                width: Math.round(imageData.naturalWidth),
                height: Math.round(imageData.naturalHeight)
            });
        }
    };

    return (
        <div className="modal-overlay editor-overlay" style={{ zIndex: 7000 }}>
            <div className="modal editor-modal" onClick={e => e.stopPropagation()}>
                <div className="modal-header">
                    <h3>{t.editImage || 'Edit Image'} - {item.name}</h3>
                    <div style={{ display: 'flex', gap: 10 }}>
                        <button className="btn btn-grey" onClick={resetFilters}>{t.reset || 'Reset'}</button>
                        <button className="btn btn-primary" onClick={handleSave}><Save size={16} style={{ marginRight: 10 }} /> {t.save || 'Save'}</button>
                        <button className="btn btn-grey" onClick={onClose}><X size={20} /></button>
                    </div>
                </div>
                <div className="editor-content">
                    <svg style={{ position: 'absolute', width: 0, height: 0 }}>
                        <filter id="previewFilter">
                            <feComponentTransfer>
                                <feFuncR type="gamma" exponent={1 / gamma} />
                                <feFuncG type="gamma" exponent={1 / gamma} />
                                <feFuncB type="gamma" exponent={1 / gamma} />
                            </feComponentTransfer>
                            {sharpen > 0 && (
                                <feConvolveMatrix
                                    order="3"
                                    preserveAlpha="true"
                                    kernelMatrix={`0 -1 0 -1 ${5 + (sharpen / 20)} -1 0 -1 0`}
                                />
                            )}
                        </filter>
                    </svg>
                    <div className="cropper-container">
                        <Cropper
                            src={imageUrl}
                            style={{
                                height: '48vh',
                                width: '100%',
                                filter: `brightness(${brightness}%) contrast(${contrast}%) saturate(${saturation}%) url(#previewFilter)`
                            }}
                            aspectRatio={aspectRatio}
                            guides={true}
                            ref={cropperRef}
                            viewMode={1}
                            background={false}
                            responsive={true}
                            autoCropArea={1}
                            checkOrientation={false}
                            crossOrigin="anonymous"
                            crop={onCrop}
                            ready={onReady}
                        />
                    </div>
                    <div className="editor-bottom-panel">
                        <div className="editor-controls-grid">
                            <div className="control-column">
                                <div className="control-item">
                                    <label><Sun size={14} /> {t.brightness || 'Brightness'}</label>
                                    <input type="range" min="0" max="200" value={brightness} onChange={(e) => setBrightness(e.target.value)} />
                                    <span className="val">{brightness}%</span>
                                </div>
                                <div className="control-item">
                                    <label><Contrast size={14} /> {t.contrast || 'Contrast'}</label>
                                    <input type="range" min="0" max="200" value={contrast} onChange={(e) => setContrast(e.target.value)} />
                                    <span className="val">{contrast}%</span>
                                </div>
                            </div>
                            <div className="control-column">
                                <div className="control-item">
                                    <label><RotateCw size={14} /> {t.saturation || 'Color Level'}</label>
                                    <input type="range" min="0" max="200" value={saturation} onChange={(e) => setSaturation(e.target.value)} />
                                    <span className="val">{saturation}%</span>
                                </div>
                                <div className="control-item">
                                    <label><Scissors size={14} /> {t.gamma || 'Gamma'}</label>
                                    <input type="range" min="0.1" max="3" step="0.1" value={gamma} onChange={(e) => setGamma(parseFloat(e.target.value))} />
                                    <span className="val">{gamma.toFixed(1)}</span>
                                </div>
                            </div>
                            <div className="control-column">
                                <div className="control-item">
                                    <label><Scissors size={14} /> {t.sharpen || 'Sharpen'}</label>
                                    <input type="range" min="0" max="100" value={sharpen} onChange={(e) => setSharpen(e.target.value)} />
                                    <span className="val">{sharpen}%</span>
                                </div>
                                <div className="control-group-horizontal">
                                    <button className="action-btn" style={{ flex: 1 }} onClick={() => cropperRef.current?.cropper.rotate(90)} title="Rotate 90">
                                        <RotateCw size={16} />
                                    </button>
                                    <button className="action-btn" style={{ flex: 1 }} onClick={() => cropperRef.current?.cropper.scaleX(cropperRef.current?.cropper.getData().scaleX === 1 ? -1 : 1)} title={t.flip || 'Flip'}>
                                        <Maximize2 size={16} style={{ transform: 'rotate(90deg)', marginRight: 10 }} />
                                        <span>{t.flip || 'Flip'}</span>
                                    </button>
                                </div>
                            </div>
                        </div>

                        <div className="editor-resizer-panel">
                            <div className="resize-inputs">
                                <div className="input-group" title={t.width || 'Width'}>
                                    <label>W</label>
                                    <input type="number" value={dimensions.width} onChange={(e) => handleWidthChange(e.target.value)} />
                                </div>
                                <button className={`lock-btn ${isLocked ? 'active' : ''}`} onClick={() => setIsLocked(!isLocked)} title={t.lock || 'Lock'}>
                                    {isLocked ? <Lock size={14} /> : <Unlock size={14} />}
                                </button>
                                <div className="input-group" title={t.height || 'Height'}>
                                    <label>H</label>
                                    <input type="number" value={dimensions.height} onChange={(e) => handleHeightChange(e.target.value)} />
                                </div>
                            </div>
                            <div className="ratio-presets">
                                <button className={isNaN(aspectRatio) ? 'active' : ''} onClick={() => setPresetRatio(NaN)}>{t.free || 'Free'}</button>
                                <button className={aspectRatio === 1 ? 'active' : ''} onClick={() => setPresetRatio(1)}>1:1</button>
                                <button className={aspectRatio === 16 / 9 ? 'active' : ''} onClick={() => setPresetRatio(16 / 9)}>16:9</button>
                                <button className={aspectRatio === 9 / 16 ? 'active' : ''} onClick={() => setPresetRatio(9 / 16)}>9:16</button>
                                <button className={aspectRatio === 4 / 3 ? 'active' : ''} onClick={() => setPresetRatio(4 / 3)}>4:3</button>
                                <button className={aspectRatio === 2 / 3 ? 'active' : ''} onClick={() => setPresetRatio(2 / 3)}>2:3</button>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};

const formatTime = (seconds) => {
    try {
        if (!seconds || !isFinite(seconds) || seconds < 0) return "00:00:00";
        const date = new Date(seconds * 1000);
        return date.toISOString().substr(11, 8);
    } catch (e) {
        return "00:00:00";
    }
};

const VideoEditor = ({ item, t = {}, onSave, onClose, refreshKey: propRefreshKey }) => {
    const videoRef = useRef(null);
    const imageRef = useRef(null);
    const audioPlayers = useRef({}); // New: Background sync players
    const containerRef = useRef(null);
    const [duration, setDuration] = useState(0);
    const [currentTime, setCurrentTime] = useState(0);
    const [isPlaying, setIsPlaying] = useState(false);
    const [isProcessing, setIsProcessing] = useState(false);
    const [canvasSize, setCanvasSize] = useState({ w: 1920, h: 1080 });
    const VIDEO_WIDTH = canvasSize.w;
    const VIDEO_HEIGHT = canvasSize.h;

    // Multi-track state
    // Each clip: { id, path, name, start, duration, offset, type, filters, crop }
    // Mod: Initialize with item.durationSeconds if available to prevent 0-start flicker
    const initialDuration = (item && item.durationSeconds) ? item.durationSeconds : 0;

    const [tracks, setTracks] = useState(() => {
        if (!item) return [{ id: 'v1', type: 'video', clips: [] }, { id: 'a1', type: 'audio', clips: [] }];
        return [
            {
                id: 'v1', type: 'video', clips: [
                    {
                        id: 'clip-0',
                        path: item.path,
                        name: item.name,
                        type: 'video',
                        start: 0,
                        duration: initialDuration,
                        offset: 0,
                        filters: { brightness: 100, contrast: 100, saturation: 100, gamma: 1.0 },
                        crop: { x: 0, y: 0, w: 100, h: 100 },
                        rotate: 0, flipH: false, flipV: false, volume: 100
                    }
                ]
            },
            { id: 'a1', type: 'audio', clips: [] }
        ];
    });

    // Use initialDuration to avoid state conflict
    useEffect(() => {
        if (initialDuration > 0) {
            setDuration(prev => Math.max(prev, initialDuration));
            setTracks(prev => prev.map(t => ({
                ...t,
                clips: t.clips.map(c => (c.id === 'clip-0' && c.duration < initialDuration) ? { ...c, duration: initialDuration } : c)
            })));
        }
    }, [initialDuration]);

    const [selectedClipId, setSelectedClipId] = useState('clip-0');
    const [activeTool, setActiveTool] = useState('select'); // select, split, delete
    const [isDragging, setIsDragging] = useState(null);
    const [videoRect, setVideoRect] = useState({ top: 0, left: 0, width: 0, height: 0 });
    const [showSaveAs, setShowSaveAs] = useState(false);
    const [saveAsName, setSaveAsName] = useState(item?.name?.replace(/\.[^/.]+$/, "") || "Project");
    const [saveAsExt, setSaveAsExt] = useState(item?.name?.split('.').pop() || 'mp4');
    const [pickerTarget, setPickerTarget] = useState(null); // { trackId }
    const [pickerItems, setPickerItems] = useState([]);
    const [pickerPath, setPickerPath] = useState('.');
    const [zoomLevel, setZoomLevel] = useState(25); // pixels per second
    const timelineRef = useRef(null);
    const [dragTrackIndex, setDragTrackIndex] = useState(null);

    const handleDragStart = (idx) => setDragTrackIndex(idx);
    const handleDragOver = (e, targetIdx) => {
        e.preventDefault();
        if (dragTrackIndex === null || dragTrackIndex === targetIdx) return;
        setTracks(prev => {
            const newTracks = [...prev];
            const [movedTrack] = newTracks.splice(dragTrackIndex, 1);
            newTracks.splice(targetIdx, 0, movedTrack);
            return newTracks;
        });
        setDragTrackIndex(targetIdx);
    };
    const handleDrop = () => setDragTrackIndex(null);

    const moveClipToTrack = (clipId, targetTrackId) => {
        setTracks(prev => {
            const sourceTrack = prev.find(t => t.clips.some(c => c.id === clipId));
            if (!sourceTrack || sourceTrack.id === targetTrackId) return prev;
            const clip = sourceTrack.clips.find(c => c.id === clipId);
            return prev.map(t => {
                if (t.id === sourceTrack.id) return { ...t, clips: t.clips.filter(c => c.id !== clipId) };
                if (t.id === targetTrackId) return { ...t, clips: [...t.clips, clip] };
                return t;
            });
        });
    };

    // Use a unique key for the editor to prevent socket/conflict with viewer
    const [localRefreshKey] = useState(Date.now());

    const activeVClip = useMemo(() => {
        const vTracks = [...tracks].filter(t => t.type === 'video').reverse();
        for (const track of vTracks) {
            const clip = track.clips.find(c => {
                const end = c.offset + c.duration;
                // Eğer süre henüz yüklenmişse (0 veya çok küçükse), yükleme aşamasında kabul et
                if (c.duration <= 1) return currentTime >= c.offset && currentTime < c.offset + 2;
                return currentTime >= c.offset && currentTime < end;
            });
            if (clip) return clip;
        }
        // Fallback: Henüz video süresi oturmadıysa ve başlangıçtaysak ilk klibi göster (Boş ekranı önler)
        if (currentTime <= 1 && vTracks.length > 0 && vTracks[0].clips.length > 0) return vTracks[0].clips[0];
        return null;
    }, [tracks, currentTime]);

    const videoUrl = useMemo(() => {
        const path = (activeVClip && activeVClip.type === 'video') ? activeVClip.path : item?.path;
        return `http://localhost:3001/media/${encodeURIComponent(path || '')}?t=${localRefreshKey}`;
    }, [activeVClip?.path, item?.path, localRefreshKey]);

    const contentDuration = useMemo(() => {
        let max = duration || 0;
        tracks.forEach(t => {
            t.clips.forEach(c => {
                const end = (c.offset || 0) + (c.duration || 0);
                if (end > max) max = end;
            });
        });
        return max;
    }, [duration, tracks]);

    const timelineDuration = useMemo(() => {
        // Daima en az 10 dakika (600s) veya mevcut toplam süreden 10 dakika daha fazlasını göster
        // Bu sayede kullanıcı ilerideki boş alanlara tıklayıp yeni klip ekleyebilir (limit sorunu çözülür)
        return Math.max(600, contentDuration + 600);
    }, [contentDuration]);



    const getSelectedClip = () => {
        for (const track of tracks) {
            const clip = track.clips.find(c => c.id === selectedClipId);
            if (clip) return clip;
        }
        return null;
    };

    const updateClip = (clipId, updates) => {
        setTracks(prev => prev.map(track => ({
            ...track,
            clips: track.clips.map(c => c.id === clipId ? { ...c, ...updates } : c)
        })));
    };

    const addTrack = (type) => {
        setTracks(prev => {
            const sameType = prev.filter(t => t.type === type);
            const newId = `${type === 'video' ? 'v' : 'a'}${sameType.length + 1}`;
            return [...prev, { id: newId, type, clips: [] }];
        });
    };

    const removeTrack = (trackId) => {
        if (trackId === 'v1' || trackId === 'a1') return;
        setTracks(prev => prev.filter(t => t.id !== trackId));
    };

    const moveTrack = (index, direction) => {
        setTracks(prev => {
            const newTracks = [...prev];
            const targetIndex = index + direction;
            if (targetIndex < 0 || targetIndex >= newTracks.length) return prev;
            [newTracks[index], newTracks[targetIndex]] = [newTracks[targetIndex], newTracks[index]];
            return newTracks;
        });
    };

    const updateVideoRect = () => {
        const container = containerRef.current;
        if (!container) return;

        // Safety margin for handles (40px each side)
        const margin = 80;
        const cw = Math.max(100, container.clientWidth - margin);
        const ch = Math.max(100, container.clientHeight - margin);

        // Project Canvas Aspect Ratio
        const vr = canvasSize.w / canvasSize.h;
        const cr = cw / ch;

        let rw, rh, rl, rt;
        if (vr > cr) {
            rw = cw; rh = cw / vr;
            rl = (container.clientWidth - rw) / 2;
            rt = (container.clientHeight - rh) / 2;
        } else {
            rh = ch; rw = ch * vr;
            rt = (container.clientHeight - rh) / 2;
            rl = (container.clientWidth - rw) / 2;
        }
        setVideoRect({ left: rl, top: rt, width: rw, height: rh });
    };

    useEffect(() => {
        updateVideoRect();
    }, [selectedClipId, canvasSize]);

    useEffect(() => {
        const timer = setTimeout(updateVideoRect, 100);
        return () => clearTimeout(timer);
    }, [tracks]); // Re-calc when tracks change

    useEffect(() => {
        // Firefox/Zen uyumluluğu için manuel load() kaldırıldı.
    }, [videoUrl]);

    useEffect(() => {
        window.addEventListener('resize', updateVideoRect);
        return () => window.removeEventListener('resize', updateVideoRect);
    }, []);

    // Kararlı Süre Güncelleyici (Daima en uzun süreyi baz alır, Firefox tıkanmasını önler)
    const syncDuration = (newDur) => {
        if (!isFinite(newDur) || newDur <= 0) return;

        setDuration(prev => {
            const current = (typeof prev === 'number') ? prev : 0;
            return Math.max(current, newDur);
        });

        setTracks(prev => prev.map(t => ({
            ...t,
            clips: t.clips.map(c => {
                if (c.id === 'clip-0') {
                    const currentClpDur = c.duration || 0;
                    return newDur > currentClpDur ? { ...c, duration: newDur } : c;
                }
                return c;
            })
        })));
        setTimeout(updateVideoRect, 100);
    };

    // Hibrit Metadata: Sunucudan gerçek süreyi çek
    useEffect(() => {
        if (!item.path) return;
        const fetchDuration = async () => {
            try {
                const res = await fetch(`/api/info?path=${encodeURIComponent(item.path)}`);
                const info = await res.json();
                if (info && info.durationSeconds) {
                    syncDuration(info.durationSeconds);
                }
            } catch (e) {
                console.error("API duration fetch failed:", e);
            }
        };
        fetchDuration();
    }, [item.path, propRefreshKey]);

    const onMetadata = (e) => {
        const video = e.target;
        syncDuration(video.duration);

        // Save source dimensions to clip if missing (required for independent resizing)
        if (activeVClip && (!activeVClip.sourceWidth || activeVClip.sourceWidth !== video.videoWidth)) {
            updateClip(activeVClip.id, { sourceWidth: video.videoWidth, sourceHeight: video.videoHeight });
        }

        // Set canvas to video size initially if it's the first load
        if (canvasSize.w === 1920 && canvasSize.h === 1080 && video.videoWidth && video.videoHeight && !item?.durationSeconds) {
            setCanvasSize({ w: video.videoWidth, h: video.videoHeight });
        }
        setTimeout(updateVideoRect, 100);
    };



    const togglePlay = () => {
        if (isPlaying) {
            setIsPlaying(false);
            if (videoRef.current) videoRef.current.pause();
        } else {
            setIsPlaying(true);
        }
    };

    // Global Playback Timer (Tick)
    useEffect(() => {
        let lastTime = performance.now();
        let frame;

        const tick = () => {
            if (isPlaying) {
                const now = performance.now();
                const delta = (now - lastTime) / 1000;
                lastTime = now;

                setCurrentTime(prev => {
                    const next = prev + delta;
                    if (next >= timelineDuration) {
                        setIsPlaying(false);
                        return timelineDuration;
                    }
                    return next;
                });
            }
            frame = requestAnimationFrame(tick);
        };

        if (isPlaying) {
            lastTime = performance.now();
            frame = requestAnimationFrame(tick);
        }
        return () => cancelAnimationFrame(frame);
    }, [isPlaying, timelineDuration]);

    // Sync Video Playhead to Timeline
    useEffect(() => {
        const video = videoRef.current;
        if (!video) return;

        if (activeVClip) {
            const targetTime = activeVClip.start + (currentTime - activeVClip.offset);
            if (Math.abs(video.currentTime - targetTime) > 0.15) {
                video.currentTime = targetTime;
            }
            if (isPlaying && video.paused) {
                video.play().catch(() => { });
            }
        } else {
            if (!video.paused) video.pause();
        }
    }, [currentTime, activeVClip, isPlaying]);

    // Background Audio Sync Effect
    useEffect(() => {
        const audioClips = tracks.flatMap(tr => tr.clips.filter(c => c.type === 'audio' || tr.id === 'a1'));

        // Ensure players exist
        audioClips.forEach(clip => {
            if (!audioPlayers.current[clip.id]) {
                const player = new Audio(`http://localhost:3001/media/${encodeURIComponent(clip.path)}`);
                player.volume = (clip.volume || 100) / 100;
                audioPlayers.current[clip.id] = player;
            } else {
                audioPlayers.current[clip.id].volume = (clip.volume || 100) / 100;
            }
        });

        // Cleanup
        Object.keys(audioPlayers.current).forEach(id => {
            if (!audioClips.find(c => c.id === id)) {
                audioPlayers.current[id].pause();
                delete audioPlayers.current[id];
            }
        });
    }, [tracks]);

    // Constant Sync Effect
    useEffect(() => {
        const audioClips = tracks.flatMap(tr => tr.clips.filter(c => c.type === 'audio' || tr.id === 'a1'));

        audioClips.forEach(clip => {
            const player = audioPlayers.current[clip.id];
            if (!player) return;

            const relTime = currentTime - clip.offset;
            const isInside = relTime >= 0 && relTime < clip.duration;

            if (isInside) {
                const targetTime = clip.start + relTime;
                if (Math.abs(player.currentTime - targetTime) > 0.15) {
                    player.currentTime = targetTime;
                }
                if (isPlaying && player.paused) {
                    player.play().catch(() => { });
                } else if (!isPlaying && !player.paused) {
                    player.pause();
                }
            } else {
                if (!player.paused) {
                    player.pause();
                    player.currentTime = clip.start;
                }
            }
        });

        // Also cleanup on unmount
        return () => {
            // We don't want to stop everything on every currentTime update
        };
    }, [currentTime, isPlaying, tracks]);

    // Final unmount cleanup
    useEffect(() => {
        const handleKeyDown = (e) => {
            if (e.key === 'Delete' || e.key === 'Backspace') {
                // Don't trigger if typing in an input
                if (e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT' || e.target.tagName === 'TEXTAREA') return;
                handleDelete();
            }
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => {
            window.removeEventListener('keydown', handleKeyDown);
            Object.values(audioPlayers.current).forEach(p => p.pause());
            audioPlayers.current = {};
        };
    }, [selectedClipId]); // Re-bind when selectedClipId changes to have fresh closure if needed, but handleDelete uses state

    const handleTimeUpdate = (e) => {
        // Timeline head drives video currentTime via sync effect
    };

    const handleSplit = () => {
        const clip = getSelectedClip();
        if (!clip) return;

        const splitPoint = currentTime - clip.offset;
        if (splitPoint <= 0 || splitPoint >= clip.duration) return;

        const newClipId = `clip-${Date.now()}`;
        const secondPart = {
            ...clip,
            id: newClipId,
            start: clip.start + splitPoint,
            duration: clip.duration - splitPoint,
            offset: currentTime
        };

        setTracks(prev => prev.map(track => {
            if (track.clips.some(c => c.id === clip.id)) {
                const index = track.clips.findIndex(c => c.id === clip.id);
                const updatedClips = [...track.clips];
                updatedClips[index] = { ...clip, duration: splitPoint };
                updatedClips.splice(index + 1, 0, secondPart);
                return { ...track, clips: updatedClips };
            }
            return track;
        }));
        setSelectedClipId(newClipId);
    };

    const handleDelete = () => {
        if (!selectedClipId) return;
        setTracks(prev => prev.map(track => ({
            ...track,
            clips: track.clips.filter(c => c.id !== selectedClipId)
        })));
        setSelectedClipId(null);
    };

    const setAspectRatio = (ratio) => {
        if (ratio === 'free') {
            // Free modunda özel bir şey yapmaya gerek yok, kullanıcı elle boyutlandırabilir
            setActiveTool('crop');
            return;
        }

        // Standart çözünürlükler (1080p bazlı)
        let newW = 1920;
        let newH = 1080;

        if (ratio === 1) { // 1:1
            newW = 1080;
            newH = 1080;
        } else if (ratio === 16 / 9) {
            newW = 1920;
            newH = 1080;
        } else if (ratio === 9 / 16) {
            newW = 1080;
            newH = 1920;
        } else if (ratio === 4 / 3) {
            newW = 1440;
            newH = 1080;
        } else if (ratio === 21 / 9) {
            newW = 2560;
            newH = 1080;
        }

        setCanvasSize({ w: newW, h: newH });
        setActiveTool('crop'); // Canvas Resize Tool
    };

    const selectedClip = getSelectedClip();

    const packClips = () => {
        setTracks(prev => prev.map(track => {
            let currentOffset = 0;
            const newClips = track.clips
                .sort((a, b) => a.offset - b.offset)
                .map(c => {
                    const updated = { ...c, offset: currentOffset };
                    currentOffset += c.duration;
                    return updated;
                });
            return { ...track, clips: newClips };
        }));
    };

    const fetchPickerItems = async (path) => {
        try {
            const res = await fetch(`/api/scan?path=${encodeURIComponent(path)}`);
            const data = await res.json();
            setPickerItems(data.items || []);
            setPickerPath(data.currentPath || path);
        } catch (e) { }
    };

    const addMediaToTrack = async (mediaItem, trackId) => {
        if (mediaItem.isDirectory || mediaItem.type === 'folder') return;
        const isImage = mediaItem.type?.startsWith('image/') || mediaItem.path.match(/\.(jpg|jpeg|png|webp|bmp)$/i);

        let actualDuration = 10;
        if (isImage) {
            actualDuration = 5;
        } else {
            try {
                const res = await fetch(`/api/info?path=${encodeURIComponent(mediaItem.path)}`);
                const info = await res.json();
                if (info && info.durationSeconds) {
                    actualDuration = info.durationSeconds;
                }
            } catch (e) {
                console.error("Duration fetch failed:", e);
            }
        }

        const newClip = {
            id: `clip-${Date.now()}`,
            path: mediaItem.path,
            name: mediaItem.name,
            type: isImage ? 'image' : (trackId.startsWith('v') ? 'video' : 'audio'),
            start: 0,
            duration: actualDuration,
            offset: currentTime,
            filters: { brightness: 100, contrast: 100, saturation: 100, gamma: 1.0 },
            crop: { x: 0, y: 0, w: 100, h: 100 },
            rotate: 0, flipH: false, flipV: false, volume: 100
        };

        setTracks(prev => prev.map(t => t.id === trackId ? { ...t, clips: [...t.clips, newClip] } : t));
        setPickerTarget(null);
        setSelectedClipId(newClip.id);
    };



    const handleWheel = (e) => {
        if (activeTool !== 'transform' || !selectedClipId || !activeVClip || selectedClipId !== activeVClip.id) return;

        // Canvas alanı üzerinde scale işlemi
        e.preventDefault();
        e.stopPropagation();

        const baseDelta = e.shiftKey ? 0.01 : 0.1;
        const delta = e.deltaY > 0 ? -baseDelta : baseDelta;
        const currentScale = activeVClip.transform?.scale || 1;
        const newScale = Math.max(0.1, Math.min(5, currentScale + delta));

        updateClip(selectedClipId, {
            transform: { ...(activeVClip.transform || { x: 0, y: 0 }), scale: newScale }
        });
    };

    const handleCanvasMouseDown = (e) => {
        if (activeTool !== 'transform' || !selectedClipId || !activeVClip || selectedClipId !== activeVClip.id) return;
        e.stopPropagation(); // Parent drag kilitlenmesin
        setIsDragging({ type: 'canvas-pan', startX: e.clientX, startY: e.clientY, originX: activeVClip.transform?.x || 0, originY: activeVClip.transform?.y || 0 });
    };

    const handleSave = async (options = {}) => {
        setIsProcessing(true);
        const timelineData = {
            tracks: tracks.map(t => ({
                id: t.id,
                type: t.type,
                clips: t.clips
            })),
            canvasSize
        };
        onSave(timelineData, options);
    };

    const handleTimelineClick = (e) => {
        if (!timelineDuration || !videoRef.current) return;
        const rect = e.currentTarget.getBoundingClientRect();
        const offsetX = (e.clientX - rect.left) + e.currentTarget.scrollLeft - 80;
        if (offsetX < 0) return;

        const newTime = Math.max(0, Math.min(timelineDuration, offsetX / zoomLevel));

        videoRef.current.currentTime = newTime;
        setCurrentTime(newTime);
    };

    const handleMouseMove = (e) => {
        if (!isDragging) return;

        if (isDragging.type === 'canvas-resize') {
            const scale = 2; // Sensitivity multiplier
            const dx = (e.clientX - isDragging.startX) * scale;
            const dy = (e.clientY - isDragging.startY) * scale;

            let newW = isDragging.startW;
            let newH = isDragging.startH;

            if (isDragging.pos.includes('e')) newW += dx;
            if (isDragging.pos.includes('w')) newW -= dx;
            if (isDragging.pos.includes('s')) newH += dy;
            if (isDragging.pos.includes('n')) newH -= dy;

            // Min size limit
            newW = Math.max(100, newW);
            newH = Math.max(100, newH);

            setCanvasSize({ w: Math.round(newW), h: Math.round(newH) });
            return;
        }

        if (isDragging.type === 'canvas-pan') {
            if (!videoRect.width || !videoRect.height) return;

            const scaleFactorX = canvasSize.w / videoRect.width;
            const scaleFactorY = canvasSize.h / videoRect.height;

            const dx = (e.clientX - isDragging.startX) * scaleFactorX;
            const dy = (e.clientY - isDragging.startY) * scaleFactorY;

            updateClip(selectedClipId, {
                transform: {
                    ...(activeVClip.transform || { scale: 1 }),
                    x: isDragging.originX + dx,
                    y: isDragging.originY + dy
                }
            });
            return;
        }

        if (isDragging.type === 'clip') {
            const dx = (e.clientX - isDragging.startX) / zoomLevel;
            let newOffset = Math.max(0, isDragging.startOffset + dx);

            // Snapping Logic
            const snapThreshold = 10 / zoomLevel; // 10 pixels snapping
            const draggingClip = tracks.flatMap(t => t.clips).find(c => c.id === isDragging.id);
            if (draggingClip) {
                const clipDuration = draggingClip.duration;
                let bestSnap = null;
                let minDelta = snapThreshold;

                // Potential snap points: tracks clips edges and playhead
                const snapPoints = [0, currentTime];
                tracks.forEach(t => {
                    t.clips.forEach(c => {
                        if (c.id !== isDragging.id) {
                            snapPoints.push(c.offset);
                            snapPoints.push(c.offset + c.duration);
                        }
                    });
                });

                snapPoints.forEach(sp => {
                    // Check clip start snapping to point
                    const deltaStart = Math.abs(newOffset - sp);
                    if (deltaStart < minDelta) {
                        minDelta = deltaStart;
                        bestSnap = sp;
                    }
                    // Check clip end snapping to point
                    const deltaEnd = Math.abs((newOffset + clipDuration) - sp);
                    if (deltaEnd < minDelta) {
                        minDelta = deltaEnd;
                        bestSnap = sp - clipDuration;
                    }
                });

                if (bestSnap !== null) {
                    newOffset = bestSnap;
                }
            }

            updateClip(isDragging.id, { offset: newOffset });
        } else if (isDragging.type === 'resize-edge') {
            const dx = (e.clientX - isDragging.startX) / zoomLevel;
            const clip = getSelectedClip();
            if (!clip) return;

            const snapThreshold = 10 / zoomLevel;
            const snapPoints = [0, currentTime];
            tracks.forEach(t => {
                t.clips.forEach(c => {
                    if (c.id !== clip.id) {
                        snapPoints.push(c.offset);
                        snapPoints.push(c.offset + c.duration);
                    }
                });
            });

            if (isDragging.side === 'right') {
                let newDur = Math.max(0.1, isDragging.startDuration + dx);
                let bestSnap = null;
                let minDelta = snapThreshold;
                const newEnd = clip.offset + newDur;

                snapPoints.forEach(sp => {
                    const delta = Math.abs(newEnd - sp);
                    if (delta < minDelta) {
                        minDelta = delta;
                        bestSnap = sp;
                    }
                });

                if (bestSnap !== null) {
                    newDur = Math.max(0.1, bestSnap - clip.offset);
                }
                updateClip(clip.id, { duration: newDur });
            } else {
                let newOffset = Math.max(0, isDragging.startOffset + dx);
                let bestSnap = null;
                let minDelta = snapThreshold;

                snapPoints.forEach(sp => {
                    const delta = Math.abs(newOffset - sp);
                    if (delta < minDelta) {
                        minDelta = delta;
                        bestSnap = sp;
                    }
                });

                if (bestSnap !== null) {
                    newOffset = bestSnap;
                }

                const actualDx = newOffset - isDragging.startOffset;
                const newDur = Math.max(0.1, isDragging.startDuration - actualDx);
                // If it's a video, we also shift the 'start' point
                const newStart = clip.type === 'audio' || clip.type === 'video' ? Math.max(0, (isDragging.startIn || 0) + actualDx) : 0;
                updateClip(clip.id, { offset: newOffset, duration: newDur, start: newStart });
            }
        } else if (isDragging.type === 'crop') {
            if (!videoRect.width) return;
            const rect = containerRef.current.getBoundingClientRect();
            const mouseX = e.clientX - rect.left - videoRect.left;
            const mouseY = e.clientY - rect.top - videoRect.top;
            const px = (mouseX / videoRect.width) * 100;
            const py = (mouseY / videoRect.height) * 100;

            if (isDragging.mode === 'move') {
                updateClip(selectedClipId, {
                    crop: {
                        ...selectedClip.crop,
                        x: Math.max(0, Math.min(100 - (selectedClip.crop.w || 0), px - (selectedClip.crop.w || 0) / 2)),
                        y: Math.max(0, Math.min(100 - (selectedClip.crop.h || 0), py - (selectedClip.crop.h || 0) / 2))
                    }
                });
            } else if (isDragging.mode === 'resize') {
                const { pos } = isDragging;
                let { x, y, w, h } = selectedClip.crop;
                if (pos.includes('e')) w = Math.max(5, Math.min(100 - x, px - x));
                if (pos.includes('s')) h = Math.max(5, Math.min(100 - y, py - y));
                if (pos.includes('w')) {
                    const newX = Math.max(0, Math.min(x + w - 5, px));
                    w = x + w - newX; x = newX;
                }
                if (pos.includes('n')) {
                    const newY = Math.max(0, Math.min(y + h - 5, py));
                    h = y + h - newY; y = newY;
                }
                updateClip(selectedClipId, { crop: { x, y, w, h } });
            }
        }
    };

    const handleMouseUp = () => setIsDragging(null);

    return (
        <div className="modal-overlay editor-overlay" style={{ zIndex: 7000 }}>
            <div className="modal editor-modal video-editor-modal" style={{ height: '95vh', width: '98vw' }}
                onMouseMove={handleMouseMove} onMouseUp={handleMouseUp} onClick={e => e.stopPropagation()}>

                <div className="modal-header">
                    <div style={{ display: 'flex', alignItems: 'center', gap: 15 }}>
                        <Scissors size={20} color="var(--netflix-red)" />
                        <h3 style={{ margin: 0 }}>{t.editVideo || 'Pro Video Editor'}</h3>
                    </div>
                    <div style={{ display: 'flex', gap: 10 }}>
                        <button className="btn btn-primary" onClick={() => handleSave()} disabled={isProcessing}>
                            {isProcessing ? <div className="spinner-small" /> : <Save size={16} style={{ marginRight: 10 }} />}
                            {t.export || 'Export'}
                        </button>
                        <button className="btn" onClick={() => setShowSaveAs(true)} disabled={isProcessing} style={{ background: '#46d369', color: 'white' }}>
                            <Plus size={16} style={{ marginRight: 10 }} /> {t.saveAs || 'Save As...'}
                        </button>
                        <button className="btn btn-grey" onClick={onClose} disabled={isProcessing}><X size={20} /></button>
                    </div>
                </div>

                <div className="editor-grid" style={{ display: 'grid', gridTemplateColumns: '300px minmax(0, 1fr)', gridTemplateRows: 'minmax(0, 1fr) 250px', gap: 10, flex: 1, overflow: 'hidden', padding: 10, height: 'calc(100% - 60px)' }}>

                    {/* Left: properties */}
                    <div className="editor-sidebar sidebar-group" style={{ overflowY: 'auto' }}>
                        <label style={{ fontSize: '0.9rem', marginBottom: 15, display: 'block' }}>{t.clipProperties || 'CLIP PROPERTIES'}</label>
                        {selectedClip ? (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 15 }}>
                                <div className="control-item">
                                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                                        <label>Brightness</label>
                                        <span style={{ fontSize: '0.75rem', color: 'var(--netflix-red)' }}>{selectedClip.filters?.brightness ?? 100}%</span>
                                    </div>
                                    <input type="range" min="0" max="200" value={selectedClip.filters?.brightness ?? 100}
                                        onChange={e => updateClip(selectedClipId, { filters: { ...selectedClip.filters, brightness: e.target.value } })} />
                                </div>
                                <div className="control-item">
                                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                                        <label>Contrast</label>
                                        <span style={{ fontSize: '0.75rem', color: 'var(--netflix-red)' }}>{selectedClip.filters?.contrast ?? 100}%</span>
                                    </div>
                                    <input type="range" min="0" max="200" value={selectedClip.filters?.contrast ?? 100}
                                        onChange={e => updateClip(selectedClipId, { filters: { ...selectedClip.filters, contrast: e.target.value } })} />
                                </div>
                                <div className="control-item">
                                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                                        <label>Saturation</label>
                                        <span style={{ fontSize: '0.75rem', color: 'var(--netflix-red)' }}>{selectedClip.filters?.saturation ?? 100}%</span>
                                    </div>
                                    <input type="range" min="0" max="200" value={selectedClip.filters?.saturation ?? 100}
                                        onChange={e => updateClip(selectedClipId, { filters: { ...selectedClip.filters, saturation: e.target.value } })} />
                                </div>
                                <div className="control-item">
                                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                                        <label>Volume</label>
                                        <span style={{ fontSize: '0.75rem', color: 'var(--netflix-red)' }}>{selectedClip.volume ?? 100}%</span>
                                    </div>
                                    <input type="range" min="0" max="200" value={selectedClip.volume ?? 100}
                                        onChange={e => {
                                            const vol = e.target.value;
                                            updateClip(selectedClipId, { volume: vol });
                                            if (videoRef.current) videoRef.current.volume = vol / 100;
                                        }} />
                                </div>
                                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 5 }}>
                                    <button className="action-btn" onClick={() => updateClip(selectedClipId, { rotate: ((selectedClip.rotate || 0) + 90) % 360 })}><RotateCw size={14} style={{ marginRight: 10 }} /> {t?.rotate || 'Rotate'}</button>
                                    <button className={`action-btn ${selectedClip.flipH ? 'active' : ''}`} onClick={() => updateClip(selectedClipId, { flipH: !selectedClip.flipH })}><Maximize2 size={14} style={{ transform: 'rotate(90deg)', marginRight: 10 }} /> {t?.flipH || 'Flip H'}</button>
                                </div>
                                <div style={{ marginTop: 10 }}>
                                    <label style={{ fontSize: '0.75rem', color: '#888', marginBottom: 8, display: 'block' }}>{t?.aspectRatio || 'Aspect Ratio'}</label>
                                    <div className="ratio-presets" style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>

                                        <button className="action-btn" style={{ padding: '2px 8px', fontSize: '0.7rem' }} onClick={() => setAspectRatio(1)}>1:1</button>
                                        <button className="action-btn" style={{ padding: '2px 8px', fontSize: '0.7rem' }} onClick={() => setAspectRatio(16 / 9)}>16:9</button>
                                        <button className="action-btn" style={{ padding: '2px 8px', fontSize: '0.7rem' }} onClick={() => setAspectRatio(9 / 16)}>9:16</button>
                                        <button className="action-btn" style={{ padding: '2px 8px', fontSize: '0.7rem' }} onClick={() => setAspectRatio(4 / 3)}>4:3</button>
                                        <button className="action-btn" style={{ padding: '2px 8px', fontSize: '0.7rem' }} onClick={() => setAspectRatio(21 / 9)}>21:9</button>
                                    </div>
                                </div>
                            </div>
                        ) : (
                            <p style={{ color: '#666', fontSize: '0.8rem' }}>{t.selectClipToEdit || 'Select a clip to edit properties'}</p>
                        )}
                    </div>

                    {/* Right: Viewer */}
                    <div className="editor-main-area" style={{ display: 'flex', flexDirection: 'column', background: '#050505', borderRadius: 8, overflow: 'hidden' }}>
                        <div className="video-viewport" ref={containerRef} style={{ position: 'relative', flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}
                            onWheel={handleWheel}
                            onMouseDown={handleCanvasMouseDown}
                        >
                            {(!duration || duration === -1) && (
                                <div style={{ position: 'absolute', zIndex: 10, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10 }}>
                                    {duration === -1 ? (
                                        <span style={{ color: 'var(--netflix-red)', fontSize: '0.8rem' }}>Error loading media. Try again.</span>
                                    ) : (
                                        <>
                                            <div className="spinner-small" style={{ width: 40, height: 40 }} />
                                            <span style={{ color: '#888', fontSize: '0.8rem' }}>{t.loadingMedia || 'Loading media...'}</span>
                                        </>
                                    )}
                                </div>
                            )}
                            {/* Canvas Guide Overlay */}
                            <div
                                style={{
                                    position: 'absolute',
                                    left: videoRect.left,
                                    top: videoRect.top,
                                    width: videoRect.width,
                                    height: videoRect.height,
                                    border: '1px dashed rgba(255, 255, 255, 0.5)',
                                    boxShadow: '0 0 0 9999px rgba(0, 0, 0, 0.5)',
                                    pointerEvents: 'none',
                                    zIndex: 5
                                }}
                            />
                            {/* Canvas Container with Overflow Hidden */}
                            <div style={{
                                position: 'absolute',
                                left: videoRect.left,
                                top: videoRect.top,
                                width: videoRect.width,
                                height: videoRect.height,
                                overflow: 'hidden',
                                zIndex: 1,
                                backgroundColor: '#000',
                                boxShadow: '0 0 20px rgba(0,0,0,0.5)'
                            }}>
                                <video
                                    ref={videoRef}
                                    src={videoUrl}
                                    preload="auto"
                                    autoPlay={false}
                                    muted={true}
                                    playsInline={true}
                                    crossOrigin="anonymous"
                                    onLoadedMetadata={onMetadata}
                                    onDurationChange={onMetadata}
                                    onLoadedData={(e) => {
                                        updateVideoRect();
                                        if (videoRef.current?.duration && duration <= 0) syncDuration(videoRef.current.duration);
                                    }}
                                    onCanPlay={() => {
                                        updateVideoRect();
                                        if (videoRef.current) {
                                            videoRef.current.muted = false;
                                            if (selectedClip) videoRef.current.volume = selectedClip.volume / 100;
                                        }
                                    }}
                                    onTimeUpdate={handleTimeUpdate}
                                    onError={(e) => {
                                        if (videoRef.current?.error?.code === 4) {
                                            console.error("Video Codec Error:", videoRef.current?.error);
                                            setDuration(-1);
                                        }
                                    }}
                                    style={{
                                        position: 'absolute',
                                        left: 0, top: 0,
                                        // Independent Sizing Logic: (Source / Canvas) * 100 -> Keeps Source fixed pixel size regardless of Canvas
                                        width: activeVClip?.sourceWidth ? `${(activeVClip.sourceWidth / canvasSize.w) * 100}%` : '100%',
                                        height: activeVClip?.sourceHeight ? `${(activeVClip.sourceHeight / canvasSize.h) * 100}%` : '100%',
                                        objectFit: 'fill',
                                        display: 'block',
                                        opacity: (activeVClip && activeVClip.type === 'video') || (duration <= 0) ? 1 : 0,
                                        filter: activeVClip?.filters ? `brightness(${activeVClip.filters.brightness ?? 100}%) contrast(${activeVClip.filters.contrast ?? 100}%) saturate(${activeVClip.filters.saturation ?? 100}%)` : 'none',
                                        transform: activeVClip ? `translate(${activeVClip.transform?.x || 0}px, ${activeVClip.transform?.y || 0}px) scale(${activeVClip.transform?.scale || 1}) rotate(${activeVClip.rotate || 0}deg) scaleX(${activeVClip.flipH ? -1 : 1}) scaleY(${activeVClip.flipV ? -1 : 1})` : 'none',
                                        clipPath: activeVClip?.crop ? `inset(${activeVClip.crop.y}% ${100 - (activeVClip.crop.x + activeVClip.crop.w)}% ${100 - (activeVClip.crop.y + activeVClip.crop.h)}% ${activeVClip.crop.x}%)` : 'none'
                                    }}
                                />

                                {activeVClip && activeVClip.type === 'image' && (
                                    <img
                                        ref={imageRef}
                                        src={`http://localhost:3001/media/${encodeURIComponent(activeVClip.path)}`}
                                        alt="Preview"
                                        onLoad={(e) => {
                                            if (!activeVClip.sourceWidth) {
                                                updateClip(activeVClip.id, { sourceWidth: e.target.naturalWidth, sourceHeight: e.target.naturalHeight });
                                            }
                                        }}
                                        style={{
                                            position: 'absolute',
                                            left: 0, top: 0,
                                            width: activeVClip?.sourceWidth ? `${(activeVClip.sourceWidth / canvasSize.w) * 100}%` : '100%',
                                            height: activeVClip?.sourceHeight ? `${(activeVClip.sourceHeight / canvasSize.h) * 100}%` : '100%',
                                            objectFit: 'fill',
                                            filter: activeVClip?.filters ? `brightness(${activeVClip.filters.brightness ?? 100}%) contrast(${activeVClip.filters.contrast ?? 100}%) saturate(${activeVClip.filters.saturation ?? 100}%)` : 'none',
                                            transform: activeVClip ? `translate(${activeVClip.transform?.x || 0}px, ${activeVClip.transform?.y || 0}px) scale(${activeVClip.transform?.scale || 1}) rotate(${activeVClip.rotate || 0}deg) scaleX(${activeVClip.flipH ? -1 : 1}) scaleY(${activeVClip.flipV ? -1 : 1})` : 'none',
                                            clipPath: activeVClip?.crop ? `inset(${activeVClip.crop.y}% ${100 - (activeVClip.crop.x + activeVClip.crop.w)}% ${100 - (activeVClip.crop.y + activeVClip.crop.h)}% ${activeVClip.crop.x}%)` : 'none'
                                        }}
                                    />
                                )}
                            </div>

                            {!activeVClip && (
                                <div style={{ position: 'absolute', inset: 0, background: '#000', zIndex: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                    <span style={{ color: '#333', fontSize: '1rem' }}>{t.noMedia || 'No Media'}</span>
                                </div>
                            )}

                            {activeTool === 'crop' && videoRect.width && (
                                <div
                                    style={{
                                        position: 'absolute',
                                        left: '50%',
                                        top: '50%',
                                        transform: 'translate(-50%, -50%)',
                                        width: videoRect.width,
                                        height: videoRect.height,
                                        border: '2px dashed rgba(255, 255, 255, 0.5)',
                                        pointerEvents: 'none',
                                        zIndex: 20
                                    }}
                                >
                                    <div style={{
                                        position: 'absolute',
                                        top: -30,
                                        left: '50%',
                                        transform: 'translateX(-50%)',
                                        background: 'rgba(0,0,0,0.8)',
                                        color: '#fff',
                                        padding: '4px 8px',
                                        borderRadius: 4,
                                        fontSize: '0.8rem',
                                        whiteSpace: 'nowrap'
                                    }}>
                                        {Math.round(canvasSize.w)} x {Math.round(canvasSize.h)} px
                                    </div>
                                    {['nw', 'ne', 'sw', 'se'].map(pos => (
                                        <div
                                            key={pos}
                                            style={{
                                                position: 'absolute',
                                                width: 12, height: 12,
                                                background: '#fff',
                                                border: '1px solid #000',
                                                ...((pos.includes('n')) ? { top: -6 } : { bottom: -6 }),
                                                ...((pos.includes('w')) ? { left: -6 } : { right: -6 }),
                                                cursor: `${pos}-resize`,
                                                pointerEvents: 'auto'
                                            }}
                                            onMouseDown={(e) => {
                                                e.stopPropagation();
                                                setIsDragging({ type: 'canvas-resize', pos, startX: e.clientX, startY: e.clientY, startW: canvasSize.w, startH: canvasSize.h });
                                            }}
                                        />
                                    ))}
                                </div>
                            )}

                            {/* Viewer Controls */}
                            <div style={{ position: 'absolute', bottom: -5, left: '50%', transform: 'translateX(-50%)', display: 'flex', gap: 15, background: 'rgba(0,0,0,0.5)', padding: '5px 15px', borderRadius: 20 }}>
                                <button className="action-btn" onClick={() => setCurrentTime(prev => Math.max(0, prev - 0.1))}><ChevronLeft size={20} /></button>
                                <button className="action-btn" onClick={togglePlay}>
                                    {isPlaying ? <Pause size={24} fill="white" /> : <Play size={24} fill="white" />}
                                </button>
                                <button className="action-btn" onClick={() => setCurrentTime(prev => Math.min(timelineDuration, prev + 0.1))}><ChevronRight size={20} /></button>
                            </div>
                        </div>
                    </div>

                    {/* Bottom: Timeline */}
                    <div style={{ gridColumn: '1 / -1', background: '#111', borderRadius: 8, display: 'flex', flexDirection: 'column' }}>
                        <div style={{ padding: '5px 10px', display: 'flex', gap: 10, borderBottom: '1px solid #222', alignItems: 'center' }}>
                            <div className="btn-group">
                                <button className={`action-btn ${activeTool === 'select' ? 'active' : ''}`} onClick={() => setActiveTool('select')} title={t.selectionTool || 'Selection Tool'}><Search size={14} /></button>
                                <button className={`action-btn ${activeTool === 'transform' ? 'active' : ''}`} onClick={() => setActiveTool('transform')} title="Move & Scale"><Maximize2 size={14} /></button>
                                <button className={`action-btn ${activeTool === 'crop' ? 'active' : ''}`} onClick={() => setActiveTool('crop')} title={t.projectCanvasResize || 'Project Canvas Resize'}><Monitor size={14} /></button>
                                <button className={`action-btn ${activeTool === 'split' ? 'active' : ''}`} onClick={handleSplit} title={t.splitAtScrubber || 'Split at Scrubber'}><Scissors size={14} /></button>
                                <button className={`action-btn ${activeTool === 'delete' ? 'active' : ''}`} onClick={handleDelete} title={t.deleteSelectedClip || 'Delete Selected Clip'}><Trash size={14} /></button>
                                <button className="action-btn" onClick={packClips} title={t.packClips || 'Pack Clips (Remove Gaps)'}><Droplet size={14} /></button>
                                <div style={{ width: 1, height: 20, background: '#333', margin: '0 5px' }} />
                                <button className="action-btn" onClick={() => addTrack('video')} title={t.addVideoTrack || 'Add Video Track'} style={{ color: '#e50914' }}><Plus size={14} /> {t.videoLayer || 'Video Layer'}</button>
                                <button className="action-btn" onClick={() => addTrack('audio')} title={t.addAudioTrack || 'Add Audio Track'} style={{ color: '#46d369' }}><Plus size={14} /> {t.audioLayer || 'Audio Layer'}</button>
                            </div>
                            <div style={{ flex: 1, textAlign: 'center', fontSize: '0.85rem', color: '#888', fontFamily: 'monospace' }}>
                                {formatTime(currentTime)} / {formatTime(contentDuration)}
                            </div>

                            <div style={{ display: 'flex', alignItems: 'center', gap: 10, background: '#222', padding: '2px 8px', borderRadius: 15 }}>
                                <Search size={14} style={{ opacity: 0.5 }} />
                                <input type="range" min="5" max="200" value={zoomLevel} onChange={e => setZoomLevel(parseInt(e.target.value))} style={{ width: 80, height: 4 }} />
                            </div>
                        </div>

                        <div className="timeline-tracks"
                            onClick={handleTimelineClick}
                            ref={timelineRef}
                            onWheel={(e) => {
                                if (e.shiftKey) return; // Yatay kaydırma için Shift'e izin ver
                                e.preventDefault();
                                const delta = e.deltaY < 0 ? 5 : -5;
                                setZoomLevel(prev => Math.max(5, Math.min(200, prev + delta)));
                            }}
                            style={{ flex: 1, overflowX: 'auto', overflowY: 'auto', position: 'relative', padding: '10px 0', cursor: 'crosshair', minHeight: 180 }}>

                            <div className="timeline-content" style={{ position: 'relative', width: Math.max(2000, (timelineDuration * zoomLevel) + 2000), minHeight: '100%', minWidth: '100%', display: 'flex', flexDirection: 'column' }}>
                                {/* Time Ruler */}
                                <div style={{ height: 25, position: 'sticky', top: 0, left: 0, zIndex: 30, background: '#111', borderBottom: '1px solid #333', display: 'flex' }}>
                                    <div style={{ width: 80, flexShrink: 0, background: '#0a0a0a' }} />
                                    <div style={{ position: 'relative', flex: 1 }}>
                                        {Array.from({ length: Math.ceil(timelineDuration / 5) + 2 }).map((_, i) => (
                                            <div key={i} style={{ position: 'absolute', left: (i * 5) * zoomLevel, borderLeft: '1px solid #444', height: i % 2 === 0 ? 15 : 8, paddingLeft: 3 }}>
                                                {i % 2 === 0 && <span style={{ fontSize: '0.6rem', color: '#666' }}>{formatTime(i * 5)}</span>}
                                            </div>
                                        ))}
                                    </div>
                                </div>
                                {tracks.map((track, idx) => (
                                    <div key={track.id} style={{ display: 'grid', gridTemplateColumns: '80px 1fr', gap: 0, marginBottom: 2, minHeight: 45, borderBottom: '1px solid #1a1a1a' }}>
                                        <div
                                            className={`track-header ${dragTrackIndex === idx ? 'dragging' : ''}`}
                                            draggable
                                            onDragStart={() => handleDragStart(idx)}
                                            onDragOver={(e) => handleDragOver(e, idx)}
                                            onDragEnd={handleDrop}
                                            style={{ color: '#555', fontSize: '0.7rem', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', background: '#0a0a0a', borderRight: '1px solid #222', position: 'sticky', left: 0, zIndex: 20, gap: 4 }}
                                        >
                                            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', pointerEvents: 'none' }}>
                                                <Layers size={14} style={{ opacity: 0.3, marginBottom: 2 }} />
                                                <span style={{ fontWeight: 'bold' }}>{track.id.toUpperCase()}</span>
                                            </div>
                                            <div style={{ display: 'flex', gap: 2 }}>
                                                <button onClick={(e) => { e.stopPropagation(); setPickerTarget({ trackId: track.id }); fetchPickerItems(pickerPath); }} style={{ background: 'none', border: 'none', color: '#444', cursor: 'pointer', padding: 2 }} title={t.addMedia || 'Add Media'}><Plus size={12} /></button>
                                                {track.id !== 'v1' && track.id !== 'a1' && (
                                                    <button onClick={(e) => { e.stopPropagation(); removeTrack(track.id); }} style={{ background: 'none', border: 'none', color: '#444', cursor: 'pointer', padding: 2 }} title={t.deleteTrack || 'Delete Track'}><Trash size={12} /></button>
                                                )}
                                            </div>
                                        </div>
                                        <div
                                            style={{ position: 'relative', background: '#080808' }}
                                            onMouseEnter={() => {
                                                if (isDragging?.type === 'clip') {
                                                    moveClipToTrack(isDragging.id, track.id);
                                                }
                                            }}
                                        >
                                            {track.clips.map(clip => (
                                                <div
                                                    key={clip.id}
                                                    className={`clip-item ${clip.id === selectedClipId ? 'selected' : ''}`}
                                                    onClick={(e) => { e.stopPropagation(); setSelectedClipId(clip.id); }}
                                                    onMouseDown={(e) => {
                                                        e.stopPropagation();
                                                        setSelectedClipId(clip.id);
                                                        setIsDragging({
                                                            type: 'clip',
                                                            id: clip.id,
                                                            startX: e.clientX,
                                                            startOffset: clip.offset
                                                        });
                                                    }}
                                                    style={{
                                                        position: 'absolute',
                                                        left: clip.offset * zoomLevel,
                                                        width: clip.duration * zoomLevel,
                                                        height: '100%',
                                                        background: clip.id === selectedClipId ? 'rgba(229, 9, 20, 0.4)' : (track.type === 'audio' ? 'rgba(0, 113, 235, 0.2)' : 'rgba(229, 9, 20, 0.1)'),
                                                        border: clip.id === selectedClipId ? '1px solid #e50914' : (track.type === 'audio' ? '1px solid #0071eb' : '1px solid #333'),
                                                        borderRadius: 4,
                                                        padding: '4px 8px',
                                                        fontSize: '0.75rem',
                                                        color: '#eee',
                                                        cursor: isDragging?.id === clip.id ? 'grabbing' : 'grab',
                                                        overflow: 'hidden',
                                                        whiteSpace: 'nowrap',
                                                        zIndex: isDragging?.id === clip.id ? 10 : 5,
                                                        pointerEvents: isDragging?.id === clip.id ? 'none' : 'auto',
                                                        userSelect: 'none',
                                                        transition: isDragging ? 'none' : 'left 0.1s, width 0.1s',
                                                        boxSizing: 'border-box'
                                                    }}
                                                >
                                                    {/* Resize Handles */}
                                                    <div
                                                        onMouseDown={(e) => {
                                                            e.stopPropagation();
                                                            setIsDragging({ type: 'resize-edge', side: 'left', startX: e.clientX, startOffset: clip.offset, startDuration: clip.duration, startIn: clip.start });
                                                        }}
                                                        style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: 6, cursor: 'ew-resize', background: 'rgba(255,255,255,0.1)' }}
                                                    />
                                                    <div
                                                        onMouseDown={(e) => {
                                                            e.stopPropagation();
                                                            setIsDragging({ type: 'resize-edge', side: 'right', startX: e.clientX, startDuration: clip.duration });
                                                        }}
                                                        style={{ position: 'absolute', right: 0, top: 0, bottom: 0, width: 6, cursor: 'ew-resize', background: 'rgba(255,255,255,0.1)' }}
                                                    />

                                                    <div style={{ fontWeight: 'bold', marginBottom: 2, pointerEvents: 'none' }}>{clip.name}</div>
                                                    <div style={{ fontSize: '0.65rem', opacity: 0.6, pointerEvents: 'none' }}>{clip.duration.toFixed(1)}s</div>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                ))}

                                {/* Scrubber / Playhead */}
                                <div style={{
                                    position: 'absolute',
                                    top: 0,
                                    bottom: 0,
                                    left: 80 + (currentTime * zoomLevel) - 1,
                                    width: 2,
                                    background: '#e50914',
                                    zIndex: 100,
                                    pointerEvents: 'none'
                                }}>
                                    <div style={{ position: 'absolute', top: 25, left: -5, width: 12, height: 12, background: '#e50914', borderRadius: '0 0 50% 50%' }} />
                                </div>
                            </div>
                        </div>
                    </div>
                </div>

                {/* Save As Modal */}
                {showSaveAs && (
                    <div className="modal-overlay" style={{ zIndex: 8000 }}>
                        <div className="modal" style={{ maxWidth: 400 }}>
                            <div className="modal-header" style={{ marginBottom: 15 }}>
                                <h3 style={{ margin: 0 }}>{t.saveAs || 'Save As...'}</h3>
                                <button onClick={() => setShowSaveAs(false)} style={{ background: 'none', border: 'none', color: '#666', cursor: 'pointer' }}><X size={20} /></button>
                            </div>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 15 }}>
                                <div className="control-item">
                                    <label style={{ display: 'block', marginBottom: 5, fontSize: '0.9rem', color: '#aaa' }}>{t.fileName || 'File Name'}</label>
                                    <input
                                        className="modal-input"
                                        value={saveAsName}
                                        onChange={e => setSaveAsName(e.target.value)}
                                        style={{ width: '100%', boxSizing: 'border-box' }}
                                    />
                                </div>
                                <div className="control-item">
                                    <label style={{ display: 'block', marginBottom: 5, fontSize: '0.9rem', color: '#aaa' }}>{t.format || 'Format'}</label>
                                    <select
                                        className="modal-input"
                                        value={saveAsExt}
                                        onChange={e => setSaveAsExt(e.target.value)}
                                        style={{ width: '100%', boxSizing: 'border-box' }}
                                    >
                                        <option value="mp4">MP4</option>
                                        <option value="mkv">MKV</option>
                                        <option value="mov">MOV</option>
                                        <option value="avi">AVI</option>
                                    </select>
                                </div>
                                <div className="modal-footer" style={{ marginTop: 10, display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
                                    <button className="btn btn-grey" onClick={() => setShowSaveAs(false)}>{t.cancel || 'Cancel'}</button>
                                    <button className="btn btn-primary" onClick={() => {
                                        setShowSaveAs(false);
                                        handleSave({ newName: `${saveAsName}.${saveAsExt}` });
                                    }}>
                                        {t.save || 'Save'}
                                    </button>
                                </div>
                            </div>
                        </div>
                    </div>
                )}
            </div>

            {
                pickerTarget && (
                    <div className="modal-overlay" style={{ zIndex: 8000 }}>
                        <div className="modal" style={{ maxWidth: 500 }}>
                            <div className="modal-header">
                                <h3>{(t.selectMediaFor || 'Select Media for {track}').replace('{track}', pickerTarget.trackId.toUpperCase())}</h3>
                                <button className="btn btn-grey" onClick={() => setPickerTarget(null)}><X size={20} /></button>
                            </div>
                            <div className="modal-body" style={{ maxHeight: 400, overflowY: 'auto', padding: 20 }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 15, color: '#888', fontSize: '0.9rem' }}>
                                    <Folder size={16} /> {pickerPath}
                                </div>
                                <div className="picker-list">
                                    {pickerPath !== '.' && (
                                        <div className="picker-item" onClick={() => fetchPickerItems(pickerPath.split('/').slice(0, -1).join('/') || '.')}>
                                            <div className="thumb-wrapper">
                                                <CornerUpLeft size={30} color="var(--netflix-red)" />
                                            </div>
                                            <div className="item-footer">
                                                <span>{t.back || 'Back'}</span>
                                            </div>
                                        </div>
                                    )}
                                    {pickerItems.map(pi => (
                                        <div key={pi.path} className="picker-item" onClick={() => {
                                            if (pi.isDirectory || pi.type === 'folder') {
                                                fetchPickerItems(pi.path);
                                            } else {
                                                addMediaToTrack(pi, pickerTarget.trackId);
                                            }
                                        }}>
                                            <div className="thumb-wrapper">
                                                {pi.isDirectory || pi.type === 'folder' ? (
                                                    <img src="/svg/folder.svg" alt="Folder" style={{ width: '40%', height: '40%', objectFit: 'contain' }} />
                                                ) : (
                                                    <img
                                                        src={`http://localhost:3001/api/thumb?path=${encodeURIComponent(pi.path)}&t=${localRefreshKey}`}
                                                        loading="lazy"
                                                        alt={pi.name}
                                                        onError={(e) => {
                                                            e.target.onerror = null;
                                                            e.target.style.display = 'none';
                                                            e.target.parentNode.innerHTML = pi.type?.startsWith('image/') ? '<div class="type-icon"><svg viewBox="0 0 24 24" width="30" height="30" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect><circle cx="8.5" cy="8.5" r="1.5"></circle><polyline points="21 15 16 10 5 21"></polyline></svg></div>' : '<div class="type-icon"><svg viewBox="0 0 24 24" width="30" height="30" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round"><polygon points="23 7 16 12 23 17 23 7"></polygon><rect x="1" y="5" width="15" height="14" rx="2" ry="2"></rect></svg></div>';
                                                        }}
                                                    />
                                                )}
                                            </div>
                                            <div className="item-footer" style={(pi.isDirectory || pi.type === 'folder') ? { justifyContent: 'center', textAlign: 'center' } : {}}>
                                                {(!pi.isDirectory && pi.type !== 'folder') && (pi.type?.startsWith('image/') ? <ImageIcon size={12} color="#0071eb" /> : <VideoIcon size={12} color="#46d369" />)}
                                                <span title={pi.name} style={(pi.isDirectory || pi.type === 'folder') ? { textAlign: 'center' } : {}}>{pi.name}</span>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        </div>
                    </div>
                )
            }
        </div >
    );
};



const FolderNode = ({ name, path, level = 0, onSelect, selectedPath, expandedFolders, toggleExpand }) => {
    const isExpanded = expandedFolders[path];
    const [children, setChildren] = useState([]);
    const [loaded, setLoaded] = useState(false);

    useEffect(() => {
        if (isExpanded && !loaded) {
            fetch(`/api/scan?path=${encodeURIComponent(path)}`)
                .then(res => res.json())
                .then(data => {
                    const folders = data.items.filter(i => i.type === 'folder');
                    setChildren(folders);
                    setLoaded(true);
                })
                .catch(() => { });
        }
    }, [isExpanded, path, loaded]);

    return (
        <div style={{ marginLeft: level * 15 }}>
            <div
                className="folder-tree-item"
                style={{
                    display: 'flex',
                    alignItems: 'center',
                    padding: '5px',
                    cursor: 'pointer',
                    background: selectedPath === path ? 'rgba(229, 9, 20, 0.2)' : 'transparent',
                    color: selectedPath === path ? '#fff' : '#aaa'
                }}
                onClick={(e) => { e.stopPropagation(); onSelect(path); }}
            >
                <div onClick={(e) => { e.stopPropagation(); toggleExpand(path); }} style={{ display: 'flex', alignItems: 'center', marginRight: 5 }}>
                    {isExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                </div>
                <Folder size={14} style={{ marginRight: 5, color: '#ff8c00' }} />
                <span style={{ fontSize: '0.9rem' }}>{name}</span>
            </div>
            {isExpanded && (
                <div>
                    {children.map(child => (
                        <FolderNode
                            key={child.path}
                            name={child.name}
                            path={child.path}
                            level={level + 1}
                            onSelect={onSelect}
                            selectedPath={selectedPath}
                            expandedFolders={expandedFolders}
                            toggleExpand={toggleExpand}
                        />
                    ))}
                    {loaded && children.length === 0 && <div style={{ marginLeft: (level + 1) * 15 + 20, fontSize: '0.8rem', color: '#666' }}>{t?.empty || 'Empty'}</div>}
                </div>
            )}
        </div>
    );
};

function App() {
    const [items, setItems] = useState([]);
    const [currentPath, setCurrentPath] = useState('.');
    const [loading, setLoading] = useState(true);
    const [selectedMediaIndex, setSelectedMediaIndex] = useState(-1);
    const [autoPlaySetting, setAutoPlaySetting] = useState(false);
    const [language, setLanguage] = useState('en');
    const [translations, setTranslations] = useState({});
    const [scrolled, setScrolled] = useState(false);
    const [visibleCount, setVisibleCount] = useState(40);

    // Arama, Silme ve Bilgi State'leri
    const [searchQuery, setSearchQuery] = useState('');
    const [isSearching, setIsSearching] = useState(false);
    const [confirmDelete, setConfirmDelete] = useState(null); // Dosya objesi
    // Edit State (Rename + Info)
    const [editModal, setEditModal] = useState(null); // Dosya objesi
    const [editName, setEditName] = useState('');
    const [editInfo, setEditInfo] = useState('');
    const [editMetadata, setEditMetadata] = useState(null);

    // Taşıma State'i
    const [moveModal, setMoveModal] = useState(null); // Taşınacak dosya
    const [targetFolder, setTargetFolder] = useState(null); // Hedef klasör path
    const [expandedFolders, setExpandedFolders] = useState({}); // Klasör ağacı genişletme durumu
    const [rootFolders, setRootFolders] = useState([]);
    const [moveConflict, setMoveConflict] = useState(false); // Çakışma durumu

    // Batch Selection State
    const [selectedPaths, setSelectedPaths] = useState(new Set());
    const [lastSelectedPath, setLastSelectedPath] = useState(null); // Shift+Click için
    const [lastActivePath, setLastActivePath] = useState(null); // Geri dönüldüğünde hatırlanacak item
    const itemRefs = useRef({});


    // Settings State
    const [settingsModal, setSettingsModal] = useState(false);
    const [settingsData, setSettingsData] = useState({ galleryPath: '', browserPath: 'default', autoPlay: false, language: 'en', theme: 'system' });
    const [theme, setTheme] = useState('system');
    const [toast, setToast] = useState(null); // { message: string, type: 'success' | 'error' }
    const [showEditor, setShowEditor] = useState(false);
    const [showVideoEditor, setShowVideoEditor] = useState(false);
    const [editVideoItem, setEditVideoItem] = useState(null); // Standalone edit item
    const [editImageItem, setEditImageItem] = useState(null); // Standalone edit item
    const [refreshKey, setRefreshKey] = useState(Date.now());

    // ... (Existing states remain)

    // Selection Handlers
    const toggleSelection = (path, e) => {
        if (e) e.stopPropagation();

        const newSelection = new Set(selectedPaths);

        if (e && e.shiftKey && lastSelectedPath) {
            const lastIdx = items.findIndex(i => i.path === lastSelectedPath);
            const currIdx = items.findIndex(i => i.path === path);

            if (lastIdx !== -1 && currIdx !== -1) {
                const start = Math.min(lastIdx, currIdx);
                const end = Math.max(lastIdx, currIdx);

                for (let i = start; i <= end; i++) {
                    newSelection.add(items[i].path);
                }
                setSelectedPaths(newSelection);
                return;
            }
        }

        if (newSelection.has(path)) {
            newSelection.delete(path);
        } else {
            newSelection.add(path);
        }
        setSelectedPaths(newSelection);
        setLastSelectedPath(path);
    };

    const handleSelectAll = (e) => {
        if (e.target.checked) {
            const allPaths = new Set(items.map(i => i.path));
            setSelectedPaths(allPaths);
        } else {
            setSelectedPaths(new Set());
        }
    };

    // Zoom ve Pan State'leri
    const [zoomMode, setZoomMode] = useState(false);
    const [zoomScale, setZoomScale] = useState(1);
    const [zoomOrigin, setZoomOrigin] = useState({ x: 50, y: 50 });
    const [isPanning, setIsPanning] = useState(false);
    const [hasMoved, setHasMoved] = useState(false);
    const [dragStart, setDragStart] = useState({ x: 0, y: 0 });

    const videoRef = useRef(null);

    const t = translations || {};

    useEffect(() => {
        fetchItems('.');
        // Root klasörleri ön yükle (Move modal için)
        fetch('/api/scan?path=.').then(res => res.json()).then(data => {
            setRootFolders(data.items ? data.items.filter(i => i.type === 'folder') : []);
        });

        // Settings yükle
        fetch('/api/settings').then(res => res.json()).then(data => {
            setSettingsData(data);
            setTheme(data.theme || 'system');
            setAutoPlaySetting(!!data.autoPlay);
        }).catch(() => { });

        const handleScroll = () => {
            setScrolled(window.scrollY > 50);
            if ((window.innerHeight + window.scrollY) >= document.body.offsetHeight - 500) {
                setVisibleCount(prev => prev + 20);
            }
        };
        window.addEventListener('scroll', handleScroll);
        return () => window.removeEventListener('scroll', handleScroll);
    }, []);

    // Theme effect
    useEffect(() => {
        const applyTheme = (mode) => {
            if (mode === 'light') {
                document.documentElement.setAttribute('data-theme', 'light');
            } else if (mode === 'dark') {
                document.documentElement.setAttribute('data-theme', 'dark');
            } else {
                // System
                const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
                document.documentElement.setAttribute('data-theme', prefersDark ? 'dark' : 'light');
            }
        };
        applyTheme(theme);

        // Listen for system theme changes
        const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
        const handleChange = () => { if (theme === 'system') applyTheme('system'); };
        mediaQuery.addEventListener('change', handleChange);
        return () => mediaQuery.removeEventListener('change', handleChange);
    }, [theme]);

    useEffect(() => {
        const handleKeyDown = (e) => {
            if (selectedMediaIndex === -1 && !confirmDelete && !editModal && !moveModal) return;
            if (e.key === 'PageDown' && !zoomMode) { e.preventDefault(); navigateMedia(1); }
            else if (e.key === 'PageUp' && !zoomMode) { e.preventDefault(); navigateMedia(-1); }
            else if (e.key === 'Escape') {
                if (showEditor) setShowEditor(false);
                else if (moveModal) { setMoveModal(null); setMoveConflict(false); }
                else if (editModal) setEditModal(null);
                else { resetAndClose(); setConfirmDelete(null); }
            }
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [selectedMediaIndex, zoomMode, items, confirmDelete, editModal, moveModal]);

    // Scroll to last active item
    useEffect(() => {
        if (lastActivePath && itemRefs.current[lastActivePath]) {
            itemRefs.current[lastActivePath].scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
    }, [lastActivePath, items]);


    useEffect(() => {
        const anyOverlay = selectedMediaIndex !== -1 || confirmDelete || editModal || moveModal || showEditor || showVideoEditor;
        const modalOverlay = confirmDelete || editModal || moveModal || showEditor || showVideoEditor;

        if (anyOverlay) {
            document.body.style.overflow = 'hidden';
            // Pause the background video ONLY if a modal is open ON TOP of it
            if (modalOverlay && videoRef.current) videoRef.current.pause();
        } else {
            document.body.style.overflow = 'auto';
        }
    }, [selectedMediaIndex, confirmDelete, editModal, moveModal, showEditor, showVideoEditor]);

    const fetchItems = async (path) => {
        setLoading(true);
        setIsSearching(false);
        setVisibleCount(40);
        try {
            const response = await fetch(`/api/scan?path=${encodeURIComponent(path)}`);
            const data = await response.json();
            setItems(data.items || []);

            // Back Navigation Logic
            const newPath = data.currentPath || '.';
            const oldPath = currentPath;

            if (newPath !== oldPath) {
                if (oldPath === '.') {
                    // Going down from root
                    setLastActivePath(null);
                } else {
                    // Try to find which folder we came from
                    const found = (data.items || []).find(i =>
                        i.type === 'folder' && (
                            oldPath === i.path ||
                            oldPath.startsWith(i.path + '/') ||
                            oldPath.startsWith(i.path + '\\')
                        )
                    );
                    setLastActivePath(found ? found.path : null);
                }
            }

            setCurrentPath(data.currentPath || '.');
            setAutoPlaySetting(!!data.autoPlay);
            if (data.language) setLanguage(data.language);
            if (data.translations) setTranslations(data.translations);
        } catch (e) { } finally { setLoading(false); }
    };

    const handleSearch = async (e) => {
        const q = e.target.value;
        setSearchQuery(q);
        if (q.length > 2) {
            setLoading(true);
            setIsSearching(true);
            setVisibleCount(40);
            try {
                const res = await fetch(`/api/search?q=${encodeURIComponent(q)}`);
                const data = await res.json();
                setItems(data.items || []);
            } catch (e) { } finally { setLoading(false); }
        } else if (q.length === 0) {
            fetchItems('.');
        }
    };

    // Batch Operations
    const handleBatchDelete = () => {
        if (selectedPaths.size === 0) return;
        setConfirmDelete({ batch: true, count: selectedPaths.size });
    };

    const executeBatchDelete = async () => {
        try {
            const paths = Array.from(selectedPaths);
            const res = await fetch('/api/batch-delete', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ paths })
            });
            const data = await res.json();

            if (data.success) {
                const deletedSet = new Set(data.deleted);
                const newItems = items.filter(i => !deletedSet.has(i.path));
                setItems(newItems);
                setSelectedPaths(new Set());
                setConfirmDelete(null);

                if (data.failed.length > 0) {
                    alert(`Some items could not be deleted:\n${data.failed.map(f => f.path).join('\n')}`);
                }
            } else {
                alert('Batch delete failed');
            }
        } catch (e) {
            alert('Error deleting items');
        }
    };

    const handleBatchMove = () => {
        if (selectedPaths.size === 0) return;
        setMoveModal({ batch: true, count: selectedPaths.size, name: `${selectedPaths.size} items` });
    };

    const executeBatchMove = async (overwrite = false) => {
        if (!moveModal || !targetFolder) return;
        try {
            const paths = Array.from(selectedPaths);
            const res = await fetch('/api/batch-move', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ sourcePaths: paths, destFolderPath: targetFolder, overwrite })
            });
            const data = await res.json();

            if (data.success) {
                if (data.conflicts.length > 0 && !overwrite) {
                    setMoveConflict(true);
                    return;
                }

                const movedSet = new Set(data.moved);
                const newItems = items.filter(i => !movedSet.has(i.path));
                setItems(newItems);
                setSelectedPaths(new Set());
                setMoveModal(null);
                setTargetFolder(null);
                setMoveConflict(false);

                if (data.failed.length > 0) {
                    alert(`Some items could not be moved:\n${data.failed.map(f => f.path).join('\n')}`);
                }
            } else {
                alert('Batch move failed');
            }
        } catch (e) {
            alert('Error moving items');
        }
    };

    const saveSettings = async () => {
        try {
            const res = await fetch('/api/settings', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(settingsData)
            });
            const data = await res.json();
            if (data.success) {
                setTheme(settingsData.theme);
                setAutoPlaySetting(settingsData.autoPlay);
                setSettingsModal(false);
                setToast(t.restartRequired || 'Restart required for some changes');
                setTimeout(() => setToast(null), 3000);
            }
        } catch (e) {
            setToast('Error saving settings');
            setTimeout(() => setToast(null), 3000);
        }
    };

    const deleteItem = async () => {
        if (!confirmDelete) return;

        if (confirmDelete.batch) {
            await executeBatchDelete();
            return;
        }

        try {
            await fetch(`/api/delete?path=${encodeURIComponent(confirmDelete.path)}`, { method: 'DELETE' });

            const isViewerOpen = selectedMediaIndex !== -1;
            const deletedPath = confirmDelete.path;

            if (isViewerOpen && selectedMedia && selectedMedia.path === deletedPath) {
                const newItems = items.filter(i => i.path !== deletedPath);
                setItems(newItems);

                const newSortedMedia = newItems.filter(i => i.type !== 'folder');

                if (newSortedMedia.length === 0) {
                    resetAndClose();
                } else {
                    if (selectedMediaIndex >= newSortedMedia.length) {
                        setSelectedMediaIndex(newSortedMedia.length - 1);
                    } else {
                        if (videoRef.current) { videoRef.current.pause(); videoRef.current.src = ""; }
                    }
                }
            } else {
                isSearching ? handleSearch({ target: { value: searchQuery } }) : fetchItems(currentPath);
            }
            setConfirmDelete(null);
        } catch (e) { alert(t.deleteError); }
    };

    const handleMoveItem = async (overwrite = false) => {
        if (!moveModal || !targetFolder) return;

        if (moveModal.batch) {
            await executeBatchMove(overwrite);
            return;
        }

        try {
            const res = await fetch('/api/move', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ sourcePath: moveModal.path, destFolderPath: targetFolder, overwrite })
            });
            const data = await res.json();

            if (data.success) {
                const movedPath = moveModal.path;
                if (selectedMediaIndex !== -1 && selectedMedia && selectedMedia.path === movedPath) {
                    const newItems = items.filter(i => i.path !== movedPath);
                    setItems(newItems);
                    const newSortedMedia = newItems.filter(i => i.type !== 'folder');
                    if (newSortedMedia.length === 0) {
                        resetAndClose();
                    } else if (selectedMediaIndex >= newSortedMedia.length) {
                        setSelectedMediaIndex(newSortedMedia.length - 1);
                    } else {
                        if (videoRef.current) { videoRef.current.pause(); videoRef.current.src = ""; }
                    }
                } else {
                    fetchItems(currentPath);
                }
                setMoveModal(null);
                setTargetFolder(null);
                setMoveConflict(false);
            } else if (data.code === 'CONFLICT') {
                setMoveConflict(true);
            } else {
                alert(data.error || 'Move failed');
            }
        } catch (e) {
            alert('Error moving file');
        }
    };

    const openEditModal = async (item) => {
        setEditModal(item);
        setEditName(item.name);
        setEditInfo('');
        setEditMetadata(null);
        try {
            const res = await fetch(`/api/info?path=${encodeURIComponent(item.path)}`);
            const data = await res.json();
            setEditInfo(data.info || '');
            setEditMetadata(data);
        } catch (e) { }
    };

    const handleSaveEdit = async () => {
        if (!editModal || !editName.trim()) return;
        try {
            const res = await fetch('/api/update', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ oldPath: editModal.path, newName: editName.trim(), info: editInfo })
            });
            const data = await res.json();
            if (data.success) {
                const oldPath = editModal.path;
                if (selectedMediaIndex !== -1 && selectedMedia && selectedMedia.path === oldPath) {
                    const updatedItems = items.map(i => {
                        if (i.path === oldPath) return { ...i, name: editName.trim(), path: data.newPath };
                        return i;
                    });
                    setItems(updatedItems);
                } else {
                    fetchItems(currentPath);
                }
                setEditModal(null);
            } else {
                alert(data.error || 'Update failed');
            }
        } catch (e) {
            alert('Error updating file');
        }
    };

    const toggleFolderExpand = (path) => {
        setExpandedFolders(prev => ({ ...prev, [path]: !prev[path] }));
    };

    const handleSaveEditedImage = async (dataUrl) => {
        try {
            const currentItem = editImageItem || selectedMedia;
            if (!currentItem) return;

            const res = await fetch('/api/save-image', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ path: currentItem.path, imageData: dataUrl })
            });
            const data = await res.json();
            if (data.success) {
                setRefreshKey(Date.now());
                setShowEditor(false);
                setEditImageItem(null);
                setToast(t.imageSaved || 'Image saved successfully');
                setTimeout(() => setToast(null), 3000);
            } else {
                alert(data.error || 'Error saving image');
            }
        } catch (e) {
            alert('Error saving image: ' + e.message);
        }
    };

    const handleSaveEditedVideo = async (timeline, options = {}) => {
        try {
            const currentItem = editVideoItem || selectedMedia;
            if (!currentItem) return;

            const res = await fetch('/api/process-video', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    path: currentItem.path,
                    timeline,
                    newPath: options.newName
                })
            });
            const data = await res.json();
            if (data.success) {
                setRefreshKey(Date.now());
                setShowVideoEditor(false);
                setEditVideoItem(null);
                setSelectedMediaIndex(-1); // Safety
                setToast(t.videoSaved || 'Video processed successfully');
                setTimeout(() => {
                    setToast(null);
                    fetchItems(currentPath);
                }, 3000);
            } else {
                alert(data.error || 'Error processing video: ' + data.error);
            }
        } catch (e) {
            alert('Error processing video: ' + e.message);
        }
    };

    const sortedMediaOnly = items.filter(i => i.type !== 'folder');
    const selectedMedia = selectedMediaIndex >= 0 ? sortedMediaOnly[selectedMediaIndex] : null;

    const openMedia = (index) => {
        setSelectedMediaIndex(index);
        if (document.documentElement.requestFullscreen) document.documentElement.requestFullscreen().catch(() => { });
    };

    const resetAndClose = () => {
        if (selectedMedia) setLastActivePath(selectedMedia.path);
        setZoomMode(false);
        setZoomScale(1);
        setHasMoved(false);
        setSelectedMediaIndex(-1);
        if (document.fullscreenElement) document.exitFullscreen();
    };

    const navigateMedia = (direction) => {
        let newIndex = selectedMediaIndex + direction;
        if (newIndex >= 0 && newIndex < sortedMediaOnly.length) {
            if (videoRef.current) { videoRef.current.pause(); videoRef.current.src = ""; }
            setZoomMode(false);
            setZoomScale(1);
            setHasMoved(false);
            setSelectedMediaIndex(newIndex);
        }
    };

    const handleZoomWheel = (e) => {
        e.preventDefault();
        const rect = e.currentTarget.getBoundingClientRect();
        const x = ((e.clientX - rect.left) / rect.width) * 100;
        const y = ((e.clientY - rect.top) / rect.height) * 100;

        setZoomOrigin({ x, y });
        const delta = e.deltaY > 0 ? -0.2 : 0.2;

        setZoomScale(prev => {
            const newScale = Math.max(1, Math.min(prev + delta, 5));
            if (newScale > 1) setZoomMode(true);
            else {
                setZoomMode(false);
                setIsPanning(false);
                setHasMoved(false); // Sürükleme durumunu sıfırla
            }
            return newScale;
        });
    };

    const handleMouseDown = (e) => {
        if (!zoomMode || zoomScale <= 1 || e.button !== 2) return; // Sadece sağ tık ile kaydırma
        setIsPanning(true);
        setHasMoved(false);
        setDragStart({ x: e.clientX, y: e.clientY });
    };

    const handleMouseMove = (e) => {
        if (!isPanning) return;
        const dx = (e.clientX - dragStart.x);
        const dy = (e.clientY - dragStart.y);

        if (!hasMoved && (Math.abs(dx) > 3 || Math.abs(dy) > 3)) {
            setHasMoved(true);
        }

        if (hasMoved) {
            const sensitivity = 0.15 / zoomScale;
            setZoomOrigin(prev => ({
                x: Math.max(0, Math.min(100, prev.x - dx * sensitivity)),
                y: Math.max(0, Math.min(100, prev.y - dy * sensitivity))
            }));
            setDragStart({ x: e.clientX, y: e.clientY });
        }
    };

    const handleMouseUp = (e) => {
        setIsPanning(false);
    };

    const getMediaUrl = (path) => `http://localhost:3001/media/${encodeURIComponent(path)}?t=${refreshKey}`;
    const getThumbUrl = (path) => `http://localhost:3001/api/thumb?path=${encodeURIComponent(path)}&t=${refreshKey}`;

    return (
        <div className="app">
            <nav className={`navbar ${scrolled ? 'scrolled' : ''}`}>
                <div className="navbar-top">
                    <div className="logo" onClick={() => fetchItems('.')}>GALLERY <span>BROWSER</span></div>

                    <div className="search-container" style={{ flex: 1, maxWidth: 500 }}>
                        <Search size={18} className="search-icon" />
                        <input
                            type="text"
                            placeholder={t.searchPlaceholder}
                            value={searchQuery}
                            onChange={handleSearch}
                            className="search-input"
                            style={{ paddingRight: 35 }}
                        />
                        {searchQuery && (
                            <X
                                size={16}
                                className="clear-search-icon"
                                onClick={() => handleSearch({ target: { value: '' } })}
                                style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)', cursor: 'pointer', color: '#888' }}
                            />
                        )}
                    </div>

                    <button
                        className="settings-btn"
                        data-tooltip={t.settings || 'Settings'}
                        onClick={() => setSettingsModal(true)}
                        style={{ background: 'transparent', border: 'none', cursor: 'pointer', padding: 8 }}
                    >
                        <Settings size={20} color="#aaa" />
                    </button>
                </div>

                <div className="breadcrumb">
                    <Home size={16} onClick={() => fetchItems('.')} style={{ cursor: 'pointer', color: 'var(--netflix-red)' }} />
                    {currentPath !== '.' && !isSearching && currentPath.split('/').filter(p => p && p !== '.').map((part, i, arr) => (
                        <span key={i} style={{ display: 'flex', alignItems: 'center' }}>
                            <ChevronRight size={14} />
                            <span style={{ cursor: 'pointer' }} onClick={() => fetchItems(arr.slice(0, i + 1).join('/'))}>{part}</span>
                        </span>
                    ))}
                    {isSearching && <><ChevronRight size={14} /><span>{t.searchResults}</span></>}
                </div>
            </nav>

            <div
                className="rows-container"
                style={{ paddingTop: '120px', minHeight: 'calc(100vh - 120px)' }}
                onClick={(e) => {
                    // Sadece arkaplana (boşluğa) tıklandığında seçimi kaldır
                    if (e.target === e.currentTarget ||
                        e.target.classList.contains('row') ||
                        e.target.classList.contains('media-grid')) {
                        setLastActivePath(null);
                    }
                }}
            >
                <div className="row">
                    <div className="row-header" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 15 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 15 }}>
                            <h2 className="row-title" style={{ margin: 0 }}>
                                {loading ? t.loading : (isSearching ? (t.searchTitle ? t.searchTitle.replace('{q}', searchQuery) : searchQuery) : (currentPath === '.' ? t.library : currentPath.split('/').pop()))}
                            </h2>
                            {!loading && items.length > 0 && (
                                <div className="batch-controls" style={{ display: 'flex', alignItems: 'center', gap: 10, background: 'rgba(255,255,255,0.1)', padding: '5px 10px', borderRadius: 4 }}>
                                    <input
                                        type="checkbox"
                                        checked={items.length > 0 && selectedPaths.size === items.length}
                                        onChange={handleSelectAll}
                                        style={{ width: 16, height: 16, cursor: 'pointer', accentColor: 'var(--netflix-red)' }}
                                    />
                                    <span style={{ fontSize: '0.9rem', color: '#ccc' }}>{t.selectAll || 'Select All'}</span>
                                </div>
                            )}
                        </div>

                        {selectedPaths.size > 0 && (
                            <div className="batch-actions" style={{ display: 'flex', gap: 10 }}>
                                <button className="btn" onClick={handleBatchMove} style={{ padding: '5px 15px', display: 'flex', alignItems: 'center', gap: 5, backgroundColor: '#ff8c00', border: 'none', color: 'white' }}>
                                    <FolderInput size={16} /> {t.move || 'Move'} ({selectedPaths.size})
                                </button>
                                <button className="btn btn-danger" onClick={handleBatchDelete} style={{ padding: '5px 15px', display: 'flex', alignItems: 'center', gap: 5 }}>
                                    <Trash2 size={16} /> {t.delete || 'Delete'} ({selectedPaths.size})
                                </button>
                            </div>
                        )}
                    </div>

                    <div className="media-grid">
                        {items.slice(0, visibleCount).map((item) => {
                            const isFolder = item.type === 'folder';
                            const mediaIdx = !isFolder ? sortedMediaOnly.indexOf(item) : -1;
                            const isSelected = selectedPaths.has(item.path);

                            return (
                                <div
                                    key={item.path}
                                    ref={el => itemRefs.current[item.path] = el}
                                    className={`media-card ${isSelected ? 'selected' : ''} ${isFolder ? 'is-folder' : ''} ${lastActivePath === item.path ? 'highlight-border' : ''}`}
                                    onClick={() => isFolder ? fetchItems(item.path) : openMedia(mediaIdx)}
                                >

                                    <div className="selection-overlay" onClick={e => e.stopPropagation()} style={{
                                        position: 'absolute', top: 10, right: 10, zIndex: 20
                                    }}>
                                        <input
                                            type="checkbox"
                                            checked={isSelected}
                                            onChange={(e) => toggleSelection(item.path, e)}
                                            style={{
                                                width: 18, height: 18, cursor: 'pointer', accentColor: 'var(--netflix-red)',
                                                boxShadow: '0 0 5px rgba(0,0,0,0.5)'
                                            }}
                                        />
                                    </div>

                                    {isFolder ? (
                                        <div className="folder-icon">
                                            <img src="/svg/folder.svg" alt="Folder" style={{ width: '60%', height: '60%', objectFit: 'contain' }} />
                                        </div>
                                    ) : (
                                        <div className="media-wrapper">
                                            <img
                                                src={getThumbUrl(item.path)}
                                                className="media-thumbnail"
                                                loading="lazy"
                                                alt={item.name}
                                                onError={(e) => { e.target.onerror = null; e.target.src = getMediaUrl(item.path); }}
                                            />
                                            {item.type.startsWith('video/') && (
                                                <div className="play-overlay" style={{
                                                    position: 'absolute',
                                                    top: 0,
                                                    left: 0,
                                                    width: '100%',
                                                    height: '100%',
                                                    opacity: 0.8,
                                                    display: 'flex',
                                                    justifyContent: 'center',
                                                    alignItems: 'center',
                                                    background: 'rgba(0,0,0,0.1)', // Hafif bir karartma tüm alanı kaplasın
                                                    zIndex: 5
                                                }}>
                                                    <div style={{
                                                        background: 'rgba(0,0,0,0.4)',
                                                        borderRadius: '50%',
                                                        padding: '10px',
                                                        display: 'flex',
                                                        alignItems: 'center',
                                                        justifyContent: 'center',
                                                        boxShadow: '0 4px 6px rgba(0,0,0,0.3)'
                                                    }}>
                                                        <Play fill="white" size={40} />
                                                    </div>
                                                </div>
                                            )}
                                        </div>
                                    )}

                                    <div className="media-info">
                                        <div className="media-name">{item.name}</div>
                                        <div className="item-actions" onClick={e => e.stopPropagation()}>

                                            <button className="action-btn info-btn" data-tooltip={t.editInfoRename || 'Edit Info & Rename'} onClick={(e) => { e.stopPropagation(); openEditModal(item); }} style={{ color: '#0071eb' }}><Info size={14} /></button>
                                            {(item.type.startsWith('image/') || item.type.startsWith('video/')) && (
                                                <button className="action-btn edit-image-btn" data-tooltip={item.type.startsWith('image/') ? (t.editImage || 'Edit Image') : (t.editVideo || 'Edit Video')} onClick={(e) => {
                                                    e.stopPropagation();
                                                    if (item.type.startsWith('image/')) {
                                                        setEditImageItem(item);
                                                        setShowEditor(true);
                                                    } else {
                                                        setEditVideoItem(item);
                                                        setShowVideoEditor(true);
                                                    }
                                                }} style={{ color: '#46d369' }}>
                                                    <Scissors size={14} />
                                                </button>
                                            )}
                                            <button className="action-btn info-btn" data-tooltip={t.move || 'Move'} onClick={(e) => { e.stopPropagation(); setMoveModal(item); }} style={{ color: '#ff8c00' }}><FolderInput size={14} /></button>
                                            <button className="action-btn delete-btn" data-tooltip={t.delete || 'Delete'} onClick={(e) => { e.stopPropagation(); setConfirmDelete(item); }} style={{ color: '#e50914' }}><Trash2 size={14} /></button>
                                        </div>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </div >
            </div >

            {confirmDelete && (
                <div className="modal-overlay" onClick={() => setConfirmDelete(null)}>
                    <div className="modal confirmation-modal" onClick={e => e.stopPropagation()}>
                        <h3>{t.deleteTitle}</h3>
                        <p>
                            {confirmDelete.batch
                                ? (t.batchDeleteConfirm || 'Are you sure you want to delete {count} items?').replace('{count}', confirmDelete.count)
                                : <><strong>{confirmDelete.name}</strong> {t.deleteConfirm}</>}
                        </p>
                        <div className="modal-footer">
                            <button className="btn btn-danger" onClick={deleteItem}>{t.yesDelete}</button>
                            <button className="btn btn-grey" onClick={() => setConfirmDelete(null)}>{t.cancel}</button>
                        </div>
                    </div>
                </div>
            )
            }

            {
                editModal && (
                    <div className="modal-overlay" onClick={() => setEditModal(null)}>
                        <div className="modal info-modal" onClick={e => e.stopPropagation()}>
                            <div className="modal-header">
                                <h3>{t.editItem || 'Edit Item'}</h3>
                                <button onClick={() => setEditModal(null)}><X size={20} /></button>
                            </div>
                            <div className="modal-body">
                                {editMetadata && (
                                    <div style={{
                                        marginBottom: 15,
                                        fontSize: '0.85rem',
                                        color: '#ddd',
                                        background: 'rgba(255,255,255,0.06)',
                                        padding: '12px',
                                        borderRadius: 8,
                                        display: 'flex',
                                        flexWrap: 'wrap',
                                        gap: '15px 25px',
                                        border: '1px solid rgba(255,255,255,0.1)'
                                    }}>
                                        {editMetadata.resolution && (
                                            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                                <Maximize2 size={15} color="#46d369" />
                                                <span style={{ fontWeight: 500 }}>{editMetadata.resolution}</span>
                                            </div>
                                        )}
                                        {editMetadata.formattedSize && (
                                            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                                <Save size={15} color="#e50914" />
                                                <span style={{ fontWeight: 500 }}>{editMetadata.formattedSize}</span>
                                            </div>
                                        )}
                                        {editMetadata.duration && (
                                            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                                <Play size={15} color="#ff8c00" width={15} fill="#ff8c00" />
                                                <span style={{ fontWeight: 500 }}>{editMetadata.duration}</span>
                                            </div>
                                        )}
                                    </div>
                                )}
                                <label style={{ display: 'block', fontSize: '0.9rem', marginBottom: 5, color: '#aaa' }}>{t.name || 'Name'}</label>
                                <input
                                    type="text"
                                    value={editName}
                                    onChange={(e) => setEditName(e.target.value)}
                                    className="modal-input"
                                    style={{ marginBottom: 20 }}
                                />

                                <label style={{ display: 'block', fontSize: '0.9rem', marginBottom: 5, color: '#aaa' }}>{t.notesDetails || 'Notes / Details'}</label>
                                <textarea
                                    value={editInfo}
                                    onChange={(e) => setEditInfo(e.target.value)}
                                    placeholder={t.writeSomething}
                                    style={{ height: 120 }}
                                />
                            </div>
                            <div className="modal-footer">
                                <button className="btn btn-primary" onClick={handleSaveEdit}><Save size={16} style={{ marginRight: 10 }} /> {t.save || 'Save'}</button>
                            </div>
                        </div>
                    </div>
                )
            }

            {
                moveModal && (
                    <div className="modal-overlay" style={{ zIndex: 6000 }} onClick={() => { setMoveModal(null); setMoveConflict(false); }}>
                        <div className="modal move-modal" onClick={e => e.stopPropagation()} style={{ height: '70vh', display: 'flex', flexDirection: 'column' }}>
                            <div className="modal-header">
                                <h3>{moveModal.batch ? (t.moveItems || 'Move {count} Items').replace('{count}', moveModal.count) : (t.moveItem || 'Move Item')}</h3>
                                <button onClick={() => { setMoveModal(null); setMoveConflict(false); }}><X size={20} /></button>
                            </div>

                            {moveConflict ? (
                                <div className="modal-body" style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', textAlign: 'center' }}>
                                    <FolderInput size={64} color="#e50914" />
                                    <h3 style={{ margin: '20px 0' }}>{t.fileConflict || 'File Conflict!'}</h3>
                                    <p style={{ color: '#aaa', marginBottom: 30 }}>{t.conflictMessage || 'Some files already exist in the destination. Overwrite them?'}</p>
                                    <div style={{ display: 'flex', gap: 10 }}>
                                        <button className="btn btn-danger" onClick={() => handleMoveItem(true)}>{t.yesOverwrite || 'Yes, Overwrite All'}</button>
                                        <button className="btn btn-grey" onClick={() => { setMoveModal(null); setMoveConflict(false); resetAndClose(); }}>{t.cancel || 'Cancel'}</button>
                                    </div>
                                </div>
                            ) : (
                                <>
                                    <p style={{ marginBottom: 10, color: '#aaa' }}>{t.selectDestination || 'Select destination folder for'} <strong>{moveModal.batch ? (t.selectedItems || 'selected items') : moveModal.name}</strong>:</p>
                                    <div className="modal-body" style={{ flex: 1, overflowY: 'auto', border: '1px solid #333', borderRadius: 4, padding: 10 }}>
                                        <div
                                            className="folder-tree-item"
                                            style={{
                                                padding: '5px',
                                                cursor: 'pointer',
                                                background: targetFolder === '.' ? 'rgba(229, 9, 20, 0.2)' : 'transparent',
                                                fontWeight: 'bold'
                                            }}
                                            onClick={() => setTargetFolder('.')}
                                        >
                                            <Folder size={14} style={{ marginRight: 5, color: '#ff8c00' }} />
                                            {t.root || 'Root'}
                                        </div>
                                        {rootFolders.map(folder => (
                                            <FolderNode key={folder.path} name={folder.name} path={folder.path} onSelect={setTargetFolder} selectedPath={targetFolder} expandedFolders={expandedFolders} toggleExpand={toggleFolderExpand} />
                                        ))}
                                    </div>
                                    <div className="modal-footer">
                                        <button className="btn btn-primary" disabled={targetFolder === null} onClick={() => handleMoveItem(false)}>
                                            <FolderInput size={16} /> {t.move || 'Move'}
                                        </button>
                                        <button className="btn btn-grey" onClick={() => setMoveModal(null)}>{t.cancel}</button>
                                    </div>
                                </>
                            )}
                        </div>
                    </div>
                )
            }

            {
                selectedMedia && !showVideoEditor && !showEditor && (
                    <div className="viewer" onClick={() => resetAndClose()} onContextMenu={(e) => { e.preventDefault(); if (zoomMode && !hasMoved) { setZoomMode(false); setZoomScale(1); } }}>
                        <div className="viewer-controls">
                            <div className="viewer-controls-inner">
                                <button className="control-btn" data-tooltip={t.editInfoRename || 'Edit Info & Rename'} onClick={(e) => { e.stopPropagation(); openEditModal(selectedMedia); }} style={{ color: '#0071eb' }}>
                                    <Info size={18} />
                                </button>
                                <button className="control-btn" data-tooltip={t.move || 'Move'} onClick={(e) => { e.stopPropagation(); setMoveModal(selectedMedia); }} style={{ color: '#ff8c00' }}>
                                    <FolderInput size={18} />
                                </button>
                                <button className="control-btn" data-tooltip={t.delete || 'Delete'} onClick={(e) => { e.stopPropagation(); setConfirmDelete(selectedMedia); }} style={{ color: '#e50914' }}>
                                    <Trash2 size={18} />
                                </button>
                                {selectedMedia.type.startsWith('image/') && (
                                    <button className="control-btn" data-tooltip={t.editImage || 'Edit Image'} onClick={(e) => {
                                        e.stopPropagation();
                                        setShowEditor(true);
                                    }} style={{ color: '#46d369' }}>
                                        <Scissors size={18} />
                                    </button>
                                )}
                                <button className="control-btn" data-tooltip={t.close || 'Close'} onClick={() => resetAndClose()}><X size={30} /></button>
                            </div>
                        </div>
                        {!zoomMode && selectedMediaIndex > 0 && <div className="nav-zone prev" onClick={(e) => { e.stopPropagation(); navigateMedia(-1); }}><ChevronLeft size={60} className="nav-arrow" /></div>}
                        <div
                            className="viewer-inner"
                            onWheel={handleZoomWheel}
                            onMouseDown={handleMouseDown}
                            onMouseMove={handleMouseMove}
                            onMouseUp={handleMouseUp}
                            onMouseLeave={handleMouseUp}
                            onClick={(e) => {
                                e.stopPropagation();
                                if (hasMoved) { setHasMoved(false); return; }

                                if (selectedMedia.type.startsWith('video/') && videoRef.current) {
                                    if (zoomMode || e.target === e.currentTarget) {
                                        if (videoRef.current.paused) videoRef.current.play();
                                        else videoRef.current.pause();
                                    }
                                }
                            }}
                            style={{ cursor: zoomMode ? (isPanning ? 'grabbing' : 'grab') : 'default', pointerEvents: 'auto' }}
                        >
                            {selectedMedia.type.startsWith('image/') ? (
                                <img
                                    src={getMediaUrl(selectedMedia.path)}
                                    className="full-media"
                                    style={{ transform: `scale(${zoomScale})`, transformOrigin: `${zoomOrigin.x}% ${zoomOrigin.y}%`, transition: (zoomScale === 1 || isPanning) ? 'none' : 'transform 0.3s' }}
                                    draggable="false"
                                    onClick={(e) => {
                                        e.stopPropagation();
                                    }}
                                />
                            ) : (
                                <video
                                    ref={videoRef}
                                    key={selectedMedia.path}
                                    src={getMediaUrl(selectedMedia.path)}
                                    className={`full-media ${zoomMode ? 'zoomed' : ''}`}
                                    controls={true}
                                    autoPlay={autoPlaySetting}
                                    style={{
                                        display: (showVideoEditor || showEditor) ? 'none' : 'block',
                                        transform: `scale(${zoomScale})`,
                                        transformOrigin: `${zoomOrigin.x}% ${zoomOrigin.y}%`,
                                        transition: (zoomScale === 1 || isPanning) ? 'none' : 'transform 0.3s',
                                        pointerEvents: zoomMode ? 'none' : 'auto'
                                    }}
                                    draggable="false"
                                    onPlay={() => setIsPlaying(true)}
                                    onPause={() => setIsPlaying(false)}
                                    onLoadedMetadata={() => {
                                        if (videoRef.current) videoRef.current.volume = 1;
                                    }}
                                />
                            )}
                        </div>
                        {!zoomMode && selectedMediaIndex < sortedMediaOnly.length - 1 && <div className="nav-zone next" onClick={(e) => { e.stopPropagation(); navigateMedia(1); }}><ChevronRight size={60} className="nav-arrow" /></div>}
                    </div>
                )
            }

            {
                settingsModal && (
                    <div className="modal-overlay" onClick={() => setSettingsModal(false)}>
                        <div className="modal settings-modal" onClick={e => e.stopPropagation()} style={{ maxWidth: 450 }}>
                            <div className="modal-header">
                                <h3>{t.settings || 'Settings'}</h3>
                                <button onClick={() => setSettingsModal(false)}><X size={20} /></button>
                            </div>
                            <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
                                <div>
                                    <label style={{ display: 'block', fontSize: '0.9rem', marginBottom: 5, color: '#aaa' }}>{t.galleryPath || 'Gallery Path'}</label>
                                    <input
                                        type="text"
                                        value={settingsData.galleryPath}
                                        onChange={(e) => setSettingsData({ ...settingsData, galleryPath: e.target.value })}
                                        className="modal-input"
                                    />
                                </div>

                                <div>
                                    <label style={{ display: 'block', fontSize: '0.9rem', marginBottom: 5, color: '#aaa' }}>{t.browserPath || 'Browser Path'}</label>
                                    <input
                                        type="text"
                                        value={settingsData.browserPath}
                                        onChange={(e) => setSettingsData({ ...settingsData, browserPath: e.target.value })}
                                        className="modal-input"
                                        placeholder="default"
                                    />
                                </div>

                                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                                    <input
                                        type="checkbox"
                                        checked={settingsData.autoPlay}
                                        onChange={(e) => setSettingsData({ ...settingsData, autoPlay: e.target.checked })}
                                        id="autoplay-checkbox"
                                    />
                                    <label htmlFor="autoplay-checkbox" style={{ color: '#ccc', cursor: 'pointer' }}>{t.autoPlay || 'Auto Play Videos'}</label>
                                </div>

                                <div>
                                    <label style={{ display: 'block', fontSize: '0.9rem', marginBottom: 5, color: '#aaa' }}>{t.language || 'Language'}</label>
                                    <select
                                        value={settingsData.language}
                                        onChange={(e) => setSettingsData({ ...settingsData, language: e.target.value })}
                                        style={{ width: '100%', padding: '10px', borderRadius: 4, border: '1px solid #333', background: '#1a1a1a', color: '#fff' }}
                                    >
                                        <option value="en">English</option>
                                        <option value="tr">Türkçe</option>
                                    </select>
                                </div>

                                <div>
                                    <label style={{ display: 'block', fontSize: '0.9rem', marginBottom: 5, color: '#aaa' }}>{t.theme || 'Theme'}</label>
                                    <div style={{ display: 'flex', gap: 10 }}>
                                        <button
                                            className={`btn ${settingsData.theme === 'system' ? 'btn-primary' : 'btn-grey'}`}
                                            onClick={() => setSettingsData({ ...settingsData, theme: 'system' })}
                                            style={{ flex: 1 }}
                                        >
                                            {t.themeSystem || 'System'}
                                        </button>
                                        <button
                                            className={`btn ${settingsData.theme === 'dark' ? 'btn-primary' : 'btn-grey'}`}
                                            onClick={() => setSettingsData({ ...settingsData, theme: 'dark' })}
                                            style={{ flex: 1 }}
                                        >
                                            {t.themeDark || 'Dark'}
                                        </button>
                                        <button
                                            className={`btn ${settingsData.theme === 'light' ? 'btn-primary' : 'btn-grey'}`}
                                            onClick={() => setSettingsData({ ...settingsData, theme: 'light' })}
                                            style={{ flex: 1 }}
                                        >
                                            {t.themeLight || 'Light'}
                                        </button>
                                    </div>
                                </div>
                            </div>
                            <div className="modal-footer">
                                <button className="btn btn-primary" onClick={saveSettings}><Save size={16} style={{ marginRight: 10 }} /> {t.save || 'Save'}</button>
                                <button className="btn btn-grey" onClick={() => setSettingsModal(false)}>{t.cancel || 'Cancel'}</button>
                            </div>
                        </div>
                    </div>
                )
            }


            {
                toast && (
                    <div className="toast-notification">
                        <CheckCircle size={20} color="#46d369" />
                        <span>{toast}</span>
                    </div>
                )
            }

            <div className="footer">
                Developed by <a href="https://github.com/aytackayin" target="_blank" rel="noopener noreferrer">Aytac KAYIN</a>
            </div>

            {
                showEditor && (editImageItem || selectedMedia) && (
                    <ImageEditor
                        item={editImageItem || selectedMedia}
                        t={t}
                        onClose={() => { setShowEditor(false); setEditImageItem(null); }}
                        onSave={handleSaveEditedImage}
                    />
                )
            }

            {
                showVideoEditor && (editVideoItem || selectedMedia) && (
                    <VideoEditor
                        key={(editVideoItem || selectedMedia).path}
                        item={editVideoItem || selectedMedia}
                        t={t}
                        refreshKey={refreshKey}
                        onClose={() => {
                            setShowVideoEditor(false);
                            setEditVideoItem(null);
                            setSelectedMediaIndex(-1);
                        }}
                        onSave={handleSaveEditedVideo}
                    />
                )
            }
        </div >
    );
}
export default App;
