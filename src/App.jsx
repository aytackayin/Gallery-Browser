import { AudioWaveformCanvas } from './utils/WaveformGenerator';
import { VideoThumbnailCanvas, clearVideoThumbnailCache } from './utils/VideoThumbnailGenerator';
import { useState, useEffect, useLayoutEffect, useRef, useMemo, useCallback } from 'react';
import { Folder, X, Play, Pause, ChevronRight, Home, ChevronLeft, Image as ImageIcon, Video as VideoIcon, Search, Trash2, Info, Save, FolderInput, ChevronDown, ChevronUp, Settings, CheckCircle, Scissors, RotateCw, Sun, Contrast, Lock, Unlock, Maximize2, Volume2, Plus, Trash, Droplet, CornerUpLeft, Layers, Crop, Monitor, Camera, FolderPlus, FileText, Tag, SkipBack, SkipForward, ChevronsLeft, ChevronsRight, Undo, Redo, History } from 'lucide-react';
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
                        <button className="btn btn-primary" onClick={handleSave}><Save size={16} style={{ marginRight: 5 }} /> {t.save || 'Save'}</button>
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
                                    <button className="action-btn" style={{ flex: 1 }} onClick={() => cropperRef.current?.cropper.rotate(90)} data-tooltip={t.rotate || 'Rotate 90'}>
                                        <RotateCw size={16} />
                                    </button>
                                    <button className="action-btn" style={{ flex: 1 }} onClick={() => cropperRef.current?.cropper.scaleX(cropperRef.current?.cropper.getData().scaleX === 1 ? -1 : 1)} data-tooltip={t.flip || 'Flip'}>
                                        <Maximize2 size={16} style={{ transform: 'rotate(90deg)', marginRight: 10 }} />
                                        <span>{t.flip || 'Flip'}</span>
                                    </button>
                                </div>
                            </div>
                        </div>

                        <div className="editor-resizer-panel">
                            <div className="resize-inputs">
                                <div className="input-group" data-tooltip={t.width || 'Width'}>
                                    <label>W</label>
                                    <input type="number" value={dimensions.width} onChange={(e) => handleWidthChange(e.target.value)} />
                                </div>
                                <button className={`lock-btn ${isLocked ? 'active' : ''}`} onClick={() => setIsLocked(!isLocked)} data-tooltip={t.lock || 'Lock'}>
                                    {isLocked ? <Lock size={14} /> : <Unlock size={14} />}
                                </button>
                                <div className="input-group" data-tooltip={t.height || 'Height'}>
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

const VideoEditor = ({ item, t = {}, onSave, onClose, refreshKey: propRefreshKey, onShowToast }) => {
    const videoRef = useRef(null);
    const imageRef = useRef(null);
    const audioPlayers = useRef({}); // New: Background sync players
    const containerRef = useRef(null);
    const [duration, setDuration] = useState(0);
    const [currentTime, setCurrentTime] = useState(0);
    const [isPlaying, setIsPlaying] = useState(false);
    const [isProcessing, setIsProcessing] = useState(false);
    const [canvasSize, setCanvasSize] = useState({ w: 1920, h: 1080 });
    const [originalSize, setOriginalSize] = useState(null);
    const [audioBuffers, setAudioBuffers] = useState({});
    const audioContextRef = useRef(null);
    const zoomTimeoutRef = useRef(null);
    const pushHistoryRef = useRef(null);
    const canvasSizeOnFocusRef = useRef(null);



    // Load Audio Buffers for Client Side Waveforms
    const loadAudioBuffer = async (path) => {
        // Skip if already loaded or loading
        if (audioBuffers[path]) return audioBuffers[path];

        try {
            // Create AudioContext lazily
            if (!audioContextRef.current) {
                audioContextRef.current = new (window.AudioContext || window.webkitAudioContext)();
            }

            // Fetch audio file
            const response = await fetch(`/api/file?path=${encodeURIComponent(path)}`);
            if (!response.ok) throw new Error('Failed to fetch audio file');

            const arrayBuffer = await response.arrayBuffer();
            const audioBuffer = await audioContextRef.current.decodeAudioData(arrayBuffer);

            // Update state with the new buffer
            setAudioBuffers(prev => ({ ...prev, [path]: audioBuffer }));
            return audioBuffer;
        } catch (error) {
            // Silent fail - waveform will show loading state
            return null;
        }
    };

    const [showHelp, setShowHelp] = useState(false);
    const VIDEO_WIDTH = canvasSize.w;
    const VIDEO_HEIGHT = canvasSize.h;

    const [timelineScroll, setTimelineScroll] = useState(0);

    // Multi-track state
    // Mod: Initialize with item.durationSeconds if available to prevent 0-start flicker
    const initialDuration = (item && isFinite(item.durationSeconds)) ? parseFloat(item.durationSeconds) : 0;

    const [tracks, setTracks] = useState(() => {
        if (!item) return [{ id: 'v1', type: 'video', clips: [] }, { id: 'a1', type: 'audio', clips: [] }];
        const isAudio = item.type.startsWith('audio/');

        const initialClip = {
            id: 'clip-0',
            path: item.path,
            name: item.name,
            type: isAudio ? 'audio' : 'video',
            start: 0,
            duration: initialDuration > 0 ? initialDuration : 0.1,
            sourceDuration: initialDuration > 0 ? initialDuration : 0.1,
            offset: 0,
            filters: {
                brightness: 100, contrast: 100, saturation: 100, exposure: 100,
                temperature: 0, tint: 0, vibrance: 0, hue: 0, clarity: 0, gamma: 1.0,
                colorBalance: {
                    shadows: { r: 0, g: 0, b: 0 },
                    midtones: { r: 0, g: 0, b: 0 },
                    highlights: { r: 0, g: 0, b: 0 }
                },
                curves: 'none'
            },
            crop: { x: 0, y: 0, w: 100, h: 100 },
            rotate: 0, flipH: false, flipV: false, volume: 100
        };

        return [
            { id: 'v1', type: 'video', clips: isAudio ? [] : [initialClip] },
            { id: 'a1', type: 'audio', clips: isAudio ? [initialClip] : [] }
        ];
    });

    const [history, setHistory] = useState({ stack: [], index: -1 });
    const [showHistory, setShowHistory] = useState(false);
    const [historyPos, setHistoryPos] = useState({ x: window.innerWidth - 250, y: 60 });
    const [isDraggingHistory, setIsDraggingHistory] = useState(false);

    const pushHistory = useCallback((name, customTracks = null, customCanvas = null) => {
        const tracksToSave = customTracks || tracks;
        const canvasToSave = customCanvas || canvasSize;
        setHistory(prev => {
            const newStack = (prev.index < prev.stack.length - 1)
                ? prev.stack.slice(0, prev.index + 1)
                : [...prev.stack];

            newStack.push({
                tracks: JSON.parse(JSON.stringify(tracksToSave)),
                canvasSize: JSON.parse(JSON.stringify(canvasToSave)),
                name: t[name] || name,
                timestamp: new Date().toLocaleTimeString().split(' ')[0]
            });

            if (newStack.length > 50) newStack.shift();
            return { stack: newStack, index: newStack.length - 1 };
        });
    }, [tracks, canvasSize, t]);

    // Keep pushHistoryRef updated
    useEffect(() => {
        pushHistoryRef.current = pushHistory;
    }, [pushHistory]);


    const undo = useCallback(() => {
        if (history.index > 0) {
            const prevIdx = history.index - 1;
            const targetState = history.stack[prevIdx];
            setTracks(JSON.parse(JSON.stringify(targetState.tracks)));
            if (targetState.canvasSize) setCanvasSize(JSON.parse(JSON.stringify(targetState.canvasSize)));
            setHistory(prev => ({ ...prev, index: prevIdx }));
        }
    }, [history.index, history.stack]);

    const redo = useCallback(() => {
        if (history.index < history.stack.length - 1) {
            const nextIdx = history.index + 1;
            const targetState = history.stack[nextIdx];
            setTracks(JSON.parse(JSON.stringify(targetState.tracks)));
            if (targetState.canvasSize) setCanvasSize(JSON.parse(JSON.stringify(targetState.canvasSize)));
            setHistory(prev => ({ ...prev, index: nextIdx }));
        }
    }, [history.index, history.stack]);

    const jumpToHistory = (idx) => {
        if (idx >= 0 && idx < history.stack.length) {
            const targetState = history.stack[idx];
            setTracks(JSON.parse(JSON.stringify(targetState.tracks)));
            if (targetState.canvasSize) setCanvasSize(JSON.parse(JSON.stringify(targetState.canvasSize)));
            setHistory(prev => ({ ...prev, index: idx }));
        }
    };

    // Initialize history when editor opens
    useEffect(() => {
        if (history.stack.length === 0) {
            setHistory({
                stack: [{
                    tracks: JSON.parse(JSON.stringify(tracks)),
                    canvasSize: JSON.parse(JSON.stringify(canvasSize)),
                    name: t.initialState || 'Initial State',
                    timestamp: new Date().toLocaleTimeString().split(' ')[0]
                }],
                index: 0
            });
        }
        return () => {
            // Clear history when editor closes (component unmounts)
            setHistory({ stack: [], index: -1 });
        };
    }, []);

    // Keyboard Shortcuts for Undo/Redo
    useEffect(() => {
        const handleKeys = (e) => {
            if (e.ctrlKey && !e.shiftKey && e.key.toLowerCase() === 'z') {
                e.preventDefault();
                undo();
            } else if (e.ctrlKey && e.shiftKey && e.key.toLowerCase() === 'z') {
                e.preventDefault();
                redo();
            }
        };
        window.addEventListener('keydown', handleKeys);
        return () => window.removeEventListener('keydown', handleKeys);
    }, [undo, redo]);

    // Use initialDuration to avoid state conflict
    useEffect(() => {
        if (initialDuration > 0) {
            setDuration(prev => Math.max(prev, initialDuration));
            setTracks(prev => {
                const newTracks = prev.map(t => ({
                    ...t,
                    clips: t.clips.map(c => (c.id === 'clip-0' && (c.duration <= 0.1 || c.duration < initialDuration)) ? { ...c, duration: initialDuration, sourceDuration: initialDuration } : c)
                }));

                // Sync history initial state with corrected tracks
                setTimeout(() => {
                    setHistory(h => {
                        if (h.stack.length === 1 && h.index === 0) {
                            return {
                                ...h,
                                stack: [{
                                    ...h.stack[0],
                                    tracks: JSON.parse(JSON.stringify(newTracks))
                                }]
                            };
                        }
                        return h;
                    });
                }, 0);

                return newTracks;
            });
        }
    }, [initialDuration]);

    // Load audio buffer for initial audio file
    useEffect(() => {
        const loadInitialAudioBuffer = async () => {
            if (!item || !item.path) return;
            if (!item.type?.startsWith('audio/')) return;
            if (audioBuffers[item.path]) return;

            try {
                if (!audioContextRef.current) {
                    audioContextRef.current = new (window.AudioContext || window.webkitAudioContext)();
                }

                const response = await fetch(`/api/file?path=${encodeURIComponent(item.path)}`);
                if (!response.ok) return;

                const arrayBuffer = await response.arrayBuffer();
                const audioBuffer = await audioContextRef.current.decodeAudioData(arrayBuffer);

                setAudioBuffers(prev => ({ ...prev, [item.path]: audioBuffer }));
            } catch (error) {
                // Silent fail
            }
        };

        loadInitialAudioBuffer();
    }, [item]);

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
    const [timelineHeight, setTimelineHeight] = useState(250); // pixels
    const [processingProgress, setProcessingProgress] = useState(0);
    const [processingId, setProcessingId] = useState(null);
    const [showOverwriteConfirm, setShowOverwriteConfirm] = useState(false);
    const [pendingSaveOptions, setPendingSaveOptions] = useState(null);
    const timelineRef = useRef(null);
    const [dragTrackIndex, setDragTrackIndex] = useState(null);
    const [snapLines, setSnapLines] = useState([]);
    const lastZoomPoint = useRef({ time: null, x: null });

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

            const targetTrack = prev.find(t => t.id === targetTrackId);
            if (!targetTrack) return prev;

            const clip = sourceTrack.clips.find(c => c.id === clipId);

            // RESTRICTION: Video/Image can only be in video tracks, Audio only in audio tracks
            const isAudioClip = clip.type === 'audio';
            const isVideoMedia = clip.type === 'video' || clip.type === 'image';

            if (targetTrack.type === 'audio' && isVideoMedia) return prev;
            if (targetTrack.type === 'video' && isAudioClip) return prev;

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

    const colorMatrix = useMemo(() => {
        if (!activeVClip?.filters) return "1 0 0 0 0 0 1 0 0 0 0 0 1 0 0 0 0 0 1 0";
        const f = activeVClip.filters;
        const temp = (f.temperature || 0) / 400; // -0.25 to 0.25
        const tint = (f.tint || 0) / 400;
        const exposure = (f.exposure || 100) / 100;

        const cb = f.colorBalance || { shadows: { r: 0, g: 0, b: 0 }, midtones: { r: 0, g: 0, b: 0 }, highlights: { r: 0, g: 0, b: 0 } };
        const r_off = ((cb.shadows?.r || 0) + (cb.midtones?.r || 0) + (cb.highlights?.r || 0)) / 200;
        const g_off = ((cb.shadows?.g || 0) + (cb.midtones?.g || 0) + (cb.highlights?.g || 0)) / 200;
        const b_off = ((cb.shadows?.b || 0) + (cb.midtones?.b || 0) + (cb.highlights?.b || 0)) / 200;

        // Simple Matrix Construction for Preview
        let r_m = 1 + temp - tint / 2 + r_off;
        let g_m = 1 + tint + g_off;
        let b_m = 1 - temp - tint / 2 + b_off;

        return `${r_m * exposure} 0 0 0 0 0 ${g_m * exposure} 0 0 0 0 0 ${b_m * exposure} 0 0 0 0 0 1 0`;
    }, [activeVClip?.filters]);

    const contentDuration = useMemo(() => {
        let max = 0;
        tracks.forEach(t => {
            t.clips.forEach(c => {
                const end = (parseFloat(c.offset) || 0) + (parseFloat(c.duration) || 0);
                if (isFinite(end) && end > max) max = end;
            });
        });
        return Math.max(max, 0.1);
    }, [tracks]);

    const timelineDuration = useMemo(() => {
        const base = isFinite(contentDuration) ? contentDuration : 0;
        return Math.max(600, base + 600);
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

    const historyUpdateClip = (name, clipId, updates) => {
        const updatedTracks = tracks.map(track => ({
            ...track,
            clips: track.clips.map(c => c.id === clipId ? { ...c, ...updates } : c)
        }));
        setTracks(updatedTracks);
        pushHistory(name, updatedTracks);
    };

    const filteredPickerItems = useMemo(() => {
        if (!pickerTarget) return [];
        const targetTrack = tracks.find(t => t.id === pickerTarget.trackId);
        if (!targetTrack) return pickerItems;

        return pickerItems.filter(item => {
            if (item.isDirectory || item.type === 'folder') return true;

            const isAudioFile = item.type?.startsWith('audio/') || item.path.match(/\.(mp3|wav|ogg|m4a|flac|aac)$/i);
            const isVideoFile = item.type?.startsWith('video/') || item.path.match(/\.(mp4|mkv|mov|avi|wmv|flv|webm)$/i);
            const isImageFile = item.type?.startsWith('image/') || item.path.match(/\.(jpg|jpeg|png|webp|bmp)$/i);

            if (targetTrack.type === 'audio') {
                return isAudioFile;
            } else {
                return isVideoFile || isImageFile;
            }
        });
    }, [pickerItems, pickerTarget, tracks]);

    const addTrack = (type) => {
        const sameType = tracks.filter(t => t.type === type);
        const newId = `${type === 'video' ? 'v' : 'a'}${sameType.length + 1}`;
        const firstIdx = tracks.findIndex(t => t.type === type);
        const newTrack = { id: newId, type, clips: [] };

        let newTracksArr;
        if (firstIdx === -1) {
            newTracksArr = type === 'video' ? [newTrack, ...tracks] : [...tracks, newTrack];
        } else {
            newTracksArr = [...tracks];
            newTracksArr.splice(firstIdx, 0, newTrack);
        }
        setTracks(newTracksArr);
        pushHistory('actionAddTrack', newTracksArr);
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
    }, [selectedClipId, canvasSize, activeVClip?.id]);

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

    // Global Dragging Listeners to prevent "stuck" dragging
    useEffect(() => {
        if (!isDragging) return;

        const globalMouseMove = (e) => handleMouseMove(e);
        const globalMouseUp = (e) => handleMouseUp(e);

        window.addEventListener('mousemove', globalMouseMove);
        window.addEventListener('mouseup', globalMouseUp);

        return () => {
            window.removeEventListener('mousemove', globalMouseMove);
            window.removeEventListener('mouseup', globalMouseUp);
        };
    }, [isDragging]);

    // Kararlı Süre Güncelleyici (Daima en uzun süreyi baz alır, Firefox tıkanmasını önler)
    const syncDuration = (newDur) => {
        if (!isFinite(newDur) || newDur <= 0) return;

        setDuration(prev => {
            const current = (typeof prev === 'number') ? prev : 0;
            return Math.max(current, newDur);
        });

        setTimeout(updateVideoRect, 100);
    };

    // Hibrit Metadata: Sunucudan gerçek süreyi çek
    useEffect(() => {
        if (!item.path) return;
        const fetchDuration = async () => {
            try {
                const res = await fetch(`/api/info?path=${encodeURIComponent(item.path)}`);
                const info = await res.json();
                if (info) {
                    if (info.width && info.height) {
                        setOriginalSize({ w: info.width, h: info.height });
                    }
                    if (info.durationSeconds) {
                        syncDuration(info.durationSeconds);
                        // Also update initial clip duration if it's missing
                        setTracks(prev => prev.map(t => ({
                            ...t,
                            clips: t.clips.map(c => (c.id === 'clip-0' && (c.duration <= 0.1)) ? { ...c, duration: info.durationSeconds, sourceDuration: info.durationSeconds } : c)
                        })));
                    }
                }
            } catch (e) {
                console.error("API duration fetch failed:", e);
            }
        };
        fetchDuration();
    }, [item.path, propRefreshKey]);

    // Zoom sonrası scroll konumunu sabitlemek için useLayoutEffect (Render'dan hemen sonra, DOM boyutu güncellenmişken çalışır)
    useLayoutEffect(() => {
        if (lastZoomPoint.current.time !== null && timelineRef.current) {
            const { time, x } = lastZoomPoint.current;
            const newScrollLeft = (time * zoomLevel) - x + 80;
            timelineRef.current.scrollLeft = newScrollLeft;
        }
    }, [zoomLevel]);

    // Düşük seviyeli Wheel listener (Browser Zoom'unu her şartta engellemek için)
    useEffect(() => {
        const timeline = timelineRef.current;
        if (!timeline) return;

        const handleManualWheel = (e) => {
            // Sadece shift basılıyken tarayıcıya (yatay kaydırma için) izin ver
            if (e.shiftKey) return;

            e.preventDefault(); // Browser zoom'unu engelle

            // Mouse konumunu yakala
            const rect = timeline.getBoundingClientRect();
            const mouseX = e.clientX - rect.left;
            const scrollLeft = timeline.scrollLeft;
            const mouseXInContent = scrollLeft + mouseX - 80;
            const timeAtMouse = mouseXInContent / zoomLevel;

            if (e.ctrlKey) {
                // Ctrl + Scroll: Hassas Zoom (%)
                const zoomFactor = e.deltaY < 0 ? 1.05 : 0.95;
                const newZoomLevel = Math.max(1, Math.min(1000, zoomLevel * zoomFactor));

                lastZoomPoint.current = { time: timeAtMouse, x: mouseX };
                setZoomLevel(newZoomLevel);
            } else if (e.altKey) {
                // Alt + Scroll: Dikey Kaydırma (Katmanlar)
                timeline.scrollTop += e.deltaY;
            } else {
                // Normal Scroll: Hızlı Zoom (%)
                const zoomFactor = e.deltaY < 0 ? 1.2 : 0.8;
                const newZoomLevel = Math.max(1, Math.min(1000, zoomLevel * zoomFactor));

                lastZoomPoint.current = { time: timeAtMouse, x: mouseX };
                setZoomLevel(newZoomLevel);
            }
        };

        timeline.addEventListener('wheel', handleManualWheel, { passive: false });
        return () => timeline.removeEventListener('wheel', handleManualWheel);
    }, [zoomLevel]);

    // Video Viewport Wheel handler for Scale/Zoom
    useEffect(() => {
        const viewport = containerRef.current;
        if (!viewport || activeTool !== 'transform' || !activeVClip) return;

        const handleViewportWheel = (e) => {
            e.preventDefault();
            e.stopPropagation();

            const baseDelta = e.ctrlKey ? 0.01 : 0.1;
            const delta = e.deltaY > 0 ? -baseDelta : baseDelta;
            const currentScale = activeVClip?.transform?.scale || 1;
            const newScale = Math.max(0.1, Math.min(10, currentScale + delta));

            updateClip(selectedClipId, {
                transform: { ...(activeVClip?.transform || { x: 0, y: 0 }), scale: newScale }
            });

            // Debounced history push
            if (zoomTimeoutRef.current) clearTimeout(zoomTimeoutRef.current);
            zoomTimeoutRef.current = setTimeout(() => {
                if (pushHistoryRef.current) {
                    pushHistoryRef.current('actionTransform');
                }
            }, 1000);
        };

        viewport.addEventListener('wheel', handleViewportWheel, { passive: false });
        return () => viewport.removeEventListener('wheel', handleViewportWheel);
    }, [activeTool, selectedClipId, activeVClip, canvasSize]);

    const onMetadata = (e) => {
        const video = e.target;
        syncDuration(video.duration);

        // Save source dimensions and duration to clip if missing
        if (activeVClip && activeVClip.type === 'video') {
            const updates = {};
            if (!activeVClip.sourceWidth) updates.sourceWidth = video.videoWidth;
            if (!activeVClip.sourceHeight) updates.sourceHeight = video.videoHeight;

            // If sourceDuration is missing, initialize it to the full source duration
            if (!activeVClip.sourceDuration || activeVClip.sourceDuration <= 0) {
                const vidDur = isFinite(video.duration) && video.duration > 0 ? video.duration : 0.1;
                updates.sourceDuration = activeVClip.duration || vidDur;
            }
            // If duration itself is missing (clip-0 with 0s), set them both
            if (!activeVClip.duration || activeVClip.duration <= 0.1) {
                const vidDur = isFinite(video.duration) && video.duration > 0 ? video.duration : 0.1;
                updates.duration = vidDur;
                updates.sourceDuration = vidDur;
            }
            if (Object.keys(updates).length > 0) {
                // Update track but ALSO update the HISTORY initial state if we are at the start
                setTracks(prev => {
                    const newTracks = prev.map(track => ({
                        ...track,
                        clips: track.clips.map(c => c.id === activeVClip.id ? { ...c, ...updates } : c)
                    }));

                    // IMPORTANT: If this is the initial load, we MUST update the first history item
                    setTimeout(() => {
                        setHistory(h => {
                            if (h.stack.length > 0 && h.index === 0) {
                                // We are at the initial state, update it with the loaded metadata
                                const newStack = [...h.stack];
                                newStack[0] = {
                                    ...newStack[0],
                                    tracks: JSON.parse(JSON.stringify(newTracks)),
                                    // Also update canvas size if we changed it below
                                    canvasSize: (activeVClip.id === 'clip-0' && canvasSize.w === 1920 && canvasSize.h === 1080 && video.videoWidth && video.videoHeight && !item?.durationSeconds)
                                        ? { w: video.videoWidth, h: video.videoHeight }
                                        : newStack[0].canvasSize
                                };
                                return { ...h, stack: newStack };
                            }
                            return h;
                        });
                    }, 0);

                    return newTracks;
                });
            }
        }

        if (video.videoWidth && video.videoHeight) {
            setOriginalSize({ w: video.videoWidth, h: video.videoHeight });
        }

        // Set canvas to video size initially if it's the first load
        if (canvasSize.w === 1920 && canvasSize.h === 1080 && video.videoWidth && video.videoHeight && !item?.durationSeconds) {
            setCanvasSize({ w: video.videoWidth, h: video.videoHeight });
        }
        updateVideoRect();
        setTimeout(updateVideoRect, 100);
    };



    const togglePlay = () => {
        if (isPlaying) {
            setIsPlaying(false);
            if (videoRef.current) videoRef.current.pause();
        } else {
            const selectedClip = getSelectedClip();
            if (selectedClip) {
                // If selected clip is finished or playhead is far away, restart from clip start
                const clipEnd = selectedClip.offset + selectedClip.duration;
                if (currentTime >= clipEnd - 0.05 || currentTime < selectedClip.offset) {
                    setCurrentTime(selectedClip.offset);
                }
            } else {
                // No selection: restart if at the end of all content
                if (currentTime >= contentDuration - 0.05) {
                    setCurrentTime(0);
                }
            }
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
                    const selectedClip = getSelectedClip();

                    if (selectedClip) {
                        const clipEnd = selectedClip.offset + selectedClip.duration;
                        if (next >= clipEnd) {
                            setIsPlaying(false);
                            return clipEnd;
                        }
                    } else {
                        if (next >= contentDuration) {
                            setIsPlaying(false);
                            return contentDuration;
                        }
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

    // Sync Video Playhead to Timeline - Main Preview Video (Optimized)
    useEffect(() => {
        const video = videoRef.current;
        if (!video) return;

        if (activeVClip && activeVClip.type === 'video') {
            const clipDur = activeVClip.duration || 1;
            const speed = (activeVClip.sourceDuration || clipDur) / clipDur;
            const targetTime = activeVClip.start + (currentTime - activeVClip.offset) * speed;
            const timeDiff = Math.abs(video.currentTime - targetTime);

            // Only seek if:
            // 1. Not currently playing (to avoid interruptions during playback)
            // 2. OR time difference is very large (> 0.3s, indicating a jump/seek)
            const shouldSeek = !isPlaying && timeDiff > 0.05;
            const largeJump = timeDiff > 0.3;

            if (isFinite(targetTime) && (shouldSeek || largeJump)) {
                video.currentTime = targetTime;
            }

            if (isPlaying || (isDragging?.type === 'playhead')) {
                if (video.paused) video.play().catch(() => { });
            } else {
                if (!video.paused) video.pause();
            }
            const videoSpeed = (activeVClip.sourceDuration || clipDur) / clipDur;
            if (Math.abs(video.playbackRate - videoSpeed) > 0.05) {
                video.playbackRate = Math.max(0.1, Math.min(16, videoSpeed));
            }

            // Sync video volume based on current active clip
            const clipVolume = (typeof activeVClip.volume === 'number') ? activeVClip.volume : 100;
            const safeVolume = Math.max(0, Math.min(1, clipVolume / 100)); // Clamp between 0-1 for HTML5
            if (video.volume !== safeVolume) {
                video.volume = safeVolume;
            }
        } else {
            if (!video.paused) video.pause();
            video.volume = 0; // Mute if no video clip is active
        }
    }, [currentTime, activeVClip, isPlaying, isDragging]);

    // Auto-scroll Timeline to Keep Playhead Visible
    useEffect(() => {
        const timeline = timelineRef.current;
        if (!timeline) return;

        // Calculate playhead position in pixels (relative to timeline content)
        const playheadPos = currentTime * zoomLevel;

        // Get current scroll position and viewport width
        const scrollLeft = timeline.scrollLeft;
        const viewportWidth = timeline.clientWidth;

        // Define margins (how close to edge before scrolling)
        const leftMargin = 150; // Start scrolling when playhead is 150px from left edge
        const rightMargin = 150; // Start scrolling when playhead is 150px from right edge

        // Calculate visible range (accounting for the 80px track header)
        const visibleStart = scrollLeft;
        const visibleEnd = scrollLeft + viewportWidth - 80; // Subtract track header width

        // Check if playhead is outside visible area or too close to edges
        let newScrollLeft = scrollLeft;

        if (playheadPos < visibleStart + leftMargin) {
            // Playhead is too close to or past the left edge
            newScrollLeft = Math.max(0, playheadPos - leftMargin);
        } else if (playheadPos > visibleEnd - rightMargin) {
            // Playhead is too close to or past the right edge
            newScrollLeft = playheadPos - viewportWidth + rightMargin + 80;
        }

        // Only scroll if needed
        if (newScrollLeft !== scrollLeft) {
            // Use instant scroll for immediate response (smooth was too slow)
            timeline.scrollLeft = newScrollLeft;
        }
    }, [currentTime, zoomLevel]);

    // Background Audio Sync Effect
    useEffect(() => {
        const audioClips = tracks.flatMap(tr => tr.clips.filter(c => c.type === 'audio' || tr.id === 'a1'));

        // Ensure players exist
        audioClips.forEach(clip => {
            const clipVolume = (typeof clip.volume === 'number') ? clip.volume : 100;
            const safeVolume = Math.max(0, Math.min(1, clipVolume / 100)); // Clamp between 0-1 for HTML5
            if (!audioPlayers.current[clip.id]) {
                const player = new Audio(`http://localhost:3001/media/${encodeURIComponent(clip.path)}`);
                player.preload = 'auto'; // Preload audio for smoother playback
                player.volume = safeVolume;
                audioPlayers.current[clip.id] = player;
            } else {
                audioPlayers.current[clip.id].volume = safeVolume;
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

    // Constant Sync Effect - Optimized for smooth audio playback
    useEffect(() => {
        const audioClips = tracks.flatMap(tr => tr.clips.filter(c => c.type === 'audio' || tr.id === 'a1'));

        audioClips.forEach(clip => {
            const player = audioPlayers.current[clip.id];
            if (!player) return;

            const relTime = currentTime - (clip.offset || 0);
            const clipDur = clip.duration || 0.1;
            const isInside = relTime >= 0 && relTime < clipDur;

            if (isInside) {
                const targetTime = (clip.start || 0) + relTime;
                const timeDiff = Math.abs(player.currentTime - targetTime);

                // Only seek if:
                // 1. Not currently playing (to avoid interruptions during playback)
                // 2. OR time difference is very large (> 0.3s, indicating a jump/seek)
                const shouldSeek = !isPlaying && timeDiff > 0.05;
                const largeJump = timeDiff > 0.3;

                if (isFinite(targetTime) && (shouldSeek || largeJump)) {
                    player.currentTime = targetTime;
                }

                if (isPlaying || (isDragging?.type === 'playhead')) {
                    if (player.paused) player.play().catch(() => { });
                } else {
                    if (!player.paused) player.pause();
                }
            } else {
                if (!player.paused) {
                    player.pause();
                    player.currentTime = clip.start || 0;
                }
            }
        });

        // Also cleanup on unmount
        return () => {
            // We don't want to stop everything on every currentTime update
        };
    }, [currentTime, isPlaying, tracks, isDragging]);

    // Use a Ref to keep latest values for shortcuts without frequent rebinding
    const stateRef = useRef({ currentTime, tracks, selectedClipId, contentDuration, timelineDuration });
    useEffect(() => {
        stateRef.current = { currentTime, tracks, selectedClipId, contentDuration, timelineDuration };
    });

    // Final unmount cleanup
    useEffect(() => {
        const handleKeyDown = (e) => {
            if (e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT' || e.target.tagName === 'TEXTAREA') return;

            // Get LATEST values from Ref to avoid stale closure
            const { tracks: latestTracks, selectedClipId: latestId, contentDuration: latestDur, timelineDuration: latestTimelineDur } = stateRef.current;

            const getLatestSelectedClip = () => {
                for (const track of latestTracks) {
                    const clip = track.clips.find(c => c.id === latestId);
                    if (clip) return clip;
                }
                return null;
            };

            if (e.key === 'Delete' || e.key === 'Backspace') {
                handleDelete();
            } else if (e.key.toLowerCase() === 's') {
                handleSplit();
            } else if (e.key.toLowerCase() === 'p') {
                // Sadece seçili klibin olduğu katmanı toparla
                const sel = getLatestSelectedClip();
                if (sel) {
                    const track = latestTracks.find(t => t.clips.some(c => c.id === sel.id));
                    if (track) packClips(track.id);
                }
            } else if (e.key === 'Home') {
                const clip = getLatestSelectedClip();
                setCurrentTime(clip ? clip.offset : 0);
            } else if (e.key === 'End') {
                const clip = getLatestSelectedClip();
                setCurrentTime(clip ? (clip.offset + clip.duration) : latestDur);
            } else if (e.key === 'ArrowRight') {
                e.preventDefault();
                const step = e.ctrlKey ? 0.05 : 1;
                setCurrentTime(prev => Math.min(latestTimelineDur, prev + step));
            } else if (e.key === 'ArrowLeft') {
                e.preventDefault();
                const step = e.ctrlKey ? 0.05 : 1;
                setCurrentTime(prev => Math.max(0, prev - step));
            } else if (e.key === ' ') {
                e.preventDefault();
                togglePlay();
            } else if (e.key === 'Escape') {
                setSelectedClipId(null);
            }
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => {
            window.removeEventListener('keydown', handleKeyDown);
            Object.values(audioPlayers.current).forEach(p => p.pause());
            audioPlayers.current = {};

            // Clean up temporary timeline cache on exit (kills FFmpeg processes and deletes files)
            fetch('http://localhost:3001/api/clear-timeline-cache', { method: 'POST', keepalive: true }).catch(() => { });

            // Clean up video thumbnail cache (releases video elements and revokes blob URLs)
            clearVideoThumbnailCache();
        };
    }, []); // Only bind once

    const handleTimeUpdate = (e) => {
        // Timeline head drives video currentTime via sync effect
    };

    const handleSplit = () => {
        const { currentTime: cur, tracks: trks, selectedClipId: selId } = stateRef.current;
        const clip = trks.flatMap(t => t.clips).find(c => c.id === selId);
        if (!clip) return;

        const splitPoint = cur - clip.offset;
        if (splitPoint <= 0 || splitPoint >= clip.duration) return;

        const currentStretchFactor = clip.duration / (clip.sourceDuration || clip.duration);
        const firstPartSourceDuration = splitPoint / currentStretchFactor;
        const secondPartSourceDuration = (clip.duration - splitPoint) / currentStretchFactor;

        const newClipId = `clip-${Date.now()}`;
        const secondPart = {
            ...clip,
            id: newClipId,
            start: clip.start + firstPartSourceDuration,
            duration: clip.duration - splitPoint,
            sourceDuration: secondPartSourceDuration,
            offset: cur
        };

        const updatedTracks = trks.map(track => {
            if (track.clips.some(c => c.id === clip.id)) {
                const index = track.clips.findIndex(c => c.id === clip.id);
                const updatedClips = [...track.clips];
                updatedClips[index] = { ...clip, duration: splitPoint, sourceDuration: firstPartSourceDuration };
                updatedClips.splice(index + 1, 0, secondPart);
                return { ...track, clips: updatedClips };
            }
            return track;
        });

        setTracks(updatedTracks);
        setSelectedClipId(newClipId);
        pushHistory('actionSplit', updatedTracks);
    };

    const handleDelete = () => {
        const { selectedClipId: selId, tracks: trks } = stateRef.current;
        if (!selId) return;
        const updatedTracks = trks.map(track => ({
            ...track,
            clips: track.clips.filter(c => c.id !== selId)
        }));
        setTracks(updatedTracks);
        setSelectedClipId(null);
        pushHistory('actionDelete', updatedTracks);
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

        const newSize = { w: newW, h: newH };
        setCanvasSize(newSize);
        pushHistory('actionTransform', null, newSize);
        setActiveTool('crop'); // Canvas Resize Tool
    };

    const selectedClip = getSelectedClip();

    const packClips = (targetTrackId = null) => {
        const updatedTracks = tracks.map(track => {
            if (targetTrackId && track.id !== targetTrackId) return track;
            let currentOffset = 0;
            const newClips = [...track.clips]
                .sort((a, b) => a.offset - b.offset)
                .map(c => {
                    const updated = { ...c, offset: currentOffset };
                    currentOffset += c.duration;
                    return updated;
                });
            return { ...track, clips: newClips };
        });
        setTracks(updatedTracks);
        pushHistory('actionPack', updatedTracks);
    };

    const fetchPickerItems = async (path) => {
        try {
            const res = await fetch(`/api/scan?path=${encodeURIComponent(path)}&audio=true`);
            const data = await res.json();
            setPickerItems(data.items || []);
            setPickerPath(data.currentPath || path);
        } catch (e) { }
    };

    const addMediaToTrack = async (mediaItem, trackId) => {
        if (mediaItem.isDirectory || mediaItem.type === 'folder') return;
        const isImage = mediaItem.type?.startsWith('image/') || mediaItem.path.match(/\.(jpg|jpeg|png|webp|bmp)$/i);

        let actualDuration = 10;
        let sWidth = 0;
        let sHeight = 0;

        try {
            const res = await fetch(`/api/info?path=${encodeURIComponent(mediaItem.path)}`);
            const info = await res.json();
            if (info) {
                if (info.durationSeconds && !isImage) actualDuration = info.durationSeconds;
                else if (isImage) actualDuration = 5; // Resimler için varsayılan 5sn

                if (info.width) sWidth = info.width;
                if (info.height) sHeight = info.height;
            }
        } catch (e) {
            console.error("Info fetch failed:", e);
            if (isImage) actualDuration = 5;
        }

        const newClip = {
            id: `clip-${Date.now()}`,
            path: mediaItem.path,
            name: mediaItem.name,
            type: isImage ? 'image' : (trackId.startsWith('v') ? 'video' : 'audio'),
            start: 0,
            duration: actualDuration,
            sourceDuration: actualDuration, // Initialize source duration
            offset: currentTime,
            sourceWidth: sWidth,
            sourceHeight: sHeight,
            transform: {
                x: (sWidth && sWidth > 0) ? (canvasSize.w - sWidth) / 2 : 0,
                y: (sHeight && sHeight > 0) ? (canvasSize.h - sHeight) / 2 : 0,
                scale: 1
            },
            filters: { brightness: 100, contrast: 100, saturation: 100, gamma: 1.0 },
            crop: { x: 0, y: 0, w: 100, h: 100 },
            rotate: 0, flipH: false, flipV: false, volume: 100
        };

        setTracks(prev => prev.map(t => t.id === trackId ? { ...t, clips: [...t.clips, newClip] } : t));
        setPickerTarget(null);
        setSelectedClipId(newClip.id);

        // Load audio buffer for waveform if this is an audio clip
        const isAudio = mediaItem.type?.startsWith('audio/') || mediaItem.path.match(/\.(mp3|wav|ogg|m4a|aac|flac)$/i);
        if (isAudio) {
            loadAudioBuffer(mediaItem.path);
        }

        // Push History
        const updatedTracks = tracks.map(t => t.id === trackId ? { ...t, clips: [...t.clips, newClip] } : t);
        pushHistory('actionAddMedia', updatedTracks);
    };



    const handleWheel = (e) => {
        if (activeTool !== 'transform' || !selectedClipId || !activeVClip || selectedClipId !== activeVClip.id) return;

        // Canvas alanı üzerinde scale işlemi
        e.preventDefault();
        e.stopPropagation();

        const baseDelta = e.ctrlKey ? 0.01 : 0.1;
        const delta = e.deltaY > 0 ? -baseDelta : baseDelta;
        const currentScale = activeVClip.transform?.scale || 1;
        const newScale = Math.max(0.1, Math.min(10, currentScale + delta));

        updateClip(selectedClipId, {
            transform: { ...(activeVClip.transform || { x: 0, y: 0 }), scale: newScale }
        });

        if (zoomTimeoutRef.current) clearTimeout(zoomTimeoutRef.current);
        zoomTimeoutRef.current = setTimeout(() => {
            if (pushHistoryRef.current) {
                // Call pushHistory without arguments -> it uses its OWN closure tracks (fresh from when function was created)
                // Since pushHistory depends on [tracks], it is recreated whenever tracks change.
                // pushHistoryRef.current always holds the latest version with the latest tracks closure.
                pushHistoryRef.current('actionTransform');
            }
        }, 1000);
    };

    const handleCanvasMouseDown = (e) => {
        // Sol tık (0) ile taşıma başlasın
        if (e.button === 0) {
            if (!selectedClipId || !activeVClip) return;
            e.stopPropagation();
            setIsDragging({
                type: 'canvas-pan',
                startX: e.clientX,
                startY: e.clientY,
                originX: activeVClip.transform?.x || 0,
                originY: activeVClip.transform?.y || 0
            });
        }
    };

    const handleCancelProcessing = async () => {
        if (!processingId) {
            console.warn("No processId available for cancellation");
            return;
        }
        try {
            // First, abort the fetch stream
            if (window.activeVideoStream) {
                window.activeVideoStream.abort();
                window.activeVideoStream = null;
            }

            // Then tell the server to kill FFmpeg
            const res = await fetch('/api/cancel-video', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ processId: processingId })
            });
            const data = await res.json();
            if (data.success) {
                setIsProcessing(false);
                setProcessingProgress(0);
                setProcessingId(null);
                if (onShowToast) onShowToast(t.processCancelled || 'İşlem iptal edildi');
            }
        } catch (e) {
            console.error("Cancel error:", e);
            // Force reset even if cancel request fails
            setIsProcessing(false);
            setProcessingProgress(0);
            setProcessingId(null);
        }
    };

    const handleSave = async (options = {}) => {
        setIsProcessing(true);
        setProcessingProgress(0);

        const timelineData = {
            tracks: tracks.map(t => ({
                id: t.id,
                type: t.type,
                clips: t.clips.map(clip => ({
                    ...clip,
                    sourceDuration: clip.sourceDuration || clip.duration
                }))
            })),
            canvasSize
        };

        try {
            const currentItem = item;
            if (!currentItem) return;

            const abortController = new AbortController();
            window.activeVideoStream = abortController;

            const response = await fetch('/api/process-video', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    path: currentItem.path,
                    timeline: timelineData,
                    newPath: options.newName,
                    overwrite: options.overwrite || false
                }),
                signal: abortController.signal
            });

            // Handle file conflict (409)
            if (response.status === 409) {
                const data = await response.json();
                if (data.code === 'FILE_EXISTS') {
                    setIsProcessing(false);
                    setProcessingProgress(0);
                    window.activeVideoStream = null;

                    // Store options and show confirmation
                    setPendingSaveOptions(options);
                    setShowOverwriteConfirm(true);
                    return;
                }
            }

            if (!response.ok) throw new Error("Network response was not ok");

            const reader = response.body.getReader();
            const decoder = new TextDecoder();
            let buffer = '';

            while (true) {
                const { value, done } = await reader.read();
                if (done) break;

                buffer += decoder.decode(value, { stream: true });
                const lines = buffer.split('\n\n');
                buffer = lines.pop(); // Keep the last partial line in buffer

                for (const line of lines) {
                    if (line.startsWith('data: ')) {
                        try {
                            const data = JSON.parse(line.substring(6));
                            if (data.type === 'started') {
                                setProcessingId(data.processId);
                            } else if (data.type === 'progress') {
                                setProcessingProgress(data.percent);
                                if (data.processId) setProcessingId(data.processId);
                            } else if (data.type === 'success') {
                                setProcessingProgress(100);
                                setIsProcessing(false);
                                setProcessingId(null);
                                window.activeVideoStream = null;
                                onSave(timelineData, { ...options, ...data });
                            } else if (data.type === 'error') {
                                setIsProcessing(false);
                                setProcessingProgress(0);
                                setProcessingId(null);
                                window.activeVideoStream = null;
                                throw new Error(data.error);
                            }
                        } catch (e) {
                            console.error("Stream parse error:", e);
                        }
                    }
                }
            }
        } catch (e) {
            if (e.name === 'AbortError') {
                console.log("Stream aborted by user");
            } else {
                setIsProcessing(false);
                setProcessingProgress(0);
                setProcessingId(null);
                if (onShowToast) onShowToast(e.message);
                else alert('Error processing video: ' + e.message);
            }
            window.activeVideoStream = null;
        }
    };

    const [screenshotSuccess, setScreenshotSuccess] = useState(false);
    const handleScreenshot = async () => {
        if (!activeVClip) return;
        const sourceRef = activeVClip.type === 'image' ? imageRef.current : videoRef.current;
        if (!sourceRef) return;

        try {
            const canvas = document.createElement('canvas');
            const ctx = canvas.getContext('2d');

            // Orijinal kaynak boyutları
            const sw = activeVClip.sourceWidth || (sourceRef.videoWidth || sourceRef.naturalWidth);
            const sh = activeVClip.sourceHeight || (sourceRef.videoHeight || sourceRef.naturalHeight);

            // Crop alanını hesapla
            const crop = activeVClip.crop || { x: 0, y: 0, w: 100, h: 100 };
            const cropX = (crop.x / 100) * sw;
            const cropY = (crop.y / 100) * sh;
            const cropW = (crop.w / 100) * sw;
            const cropH = (crop.h / 100) * sh;

            // Döndürme sonrası boyutları belirle
            let targetW = cropW;
            let targetH = cropH;
            if (activeVClip.rotate % 180 !== 0) {
                targetW = cropH;
                targetH = cropW;
            }

            canvas.width = targetW;
            canvas.height = targetH;

            // Filtreleri uygula
            const f = activeVClip.filters || {};
            ctx.filter = `brightness(${f.brightness ?? 100}%) contrast(${f.contrast ?? 100}%) saturate(${f.saturation ?? 100}%)`;

            // Transform işlemleri (Merkeze taşı -> Döndür -> Flip -> Geri taşı)
            ctx.translate(targetW / 2, targetH / 2);
            ctx.rotate((activeVClip.rotate * Math.PI) / 180);
            ctx.scale(activeVClip.flipH ? -1 : 1, activeVClip.flipV ? -1 : 1);

            // Çizim (Merkeze göre ortalayarak çiz)
            // cropW/cropH ebatlarında çiziyoruz, ama (0,0) noktası merkez olduğu için -w/2, -h/2
            ctx.drawImage(sourceRef, cropX, cropY, cropW, cropH, -cropW / 2, -cropH / 2, cropW, cropH);

            const dataUrl = canvas.toDataURL('image/jpeg', 0.95);

            // Ana ögenin bulunduğu klasörü bul
            let folderPath = ".";
            if (item && item.path) {
                // Windows (\) veya Unix (/) ayırıcılarına göre son parçayı at
                const lastSlash = Math.max(item.path.lastIndexOf('/'), item.path.lastIndexOf('\\'));
                if (lastSlash !== -1) folderPath = item.path.substring(0, lastSlash);
            }

            await fetch('/api/save-screenshot', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ folderPath, imageData: dataUrl })
            });

            // Bildirim
            setScreenshotSuccess(true);
            setTimeout(() => setScreenshotSuccess(false), 2000);
            if (onShowToast) onShowToast(t.screenshotSaved || 'Screenshot saved!');

        } catch (e) {
            console.error(e);
            alert("Screenshot error: " + e.message);
        }
    };

    const handleTimelineClick = (e) => {
        if (!timelineDuration || !videoRef.current || !timelineRef.current) return;
        if (e.button !== 0) return; // Sadece sol tık

        // KESİN SCROLLBAR KONTROLÜ: 
        // Eğer tıklanan yer '.timeline-content' (içerik) içinde değilse, 
        // bu kesinlikle scrollbar veya dış boşluktur.
        if (!e.target.closest('.timeline-content')) {
            return;
        }

        // Eğer bir butona, klibe veya layer başlığına tıklandıysa zaman çizgisini oynatma
        if (e.target.closest('.track-header') || e.target.closest('.clip-item') || e.target.closest('button')) {
            return;
        }

        e.preventDefault();
        const timeline = timelineRef.current;
        const rect = timeline.getBoundingClientRect();
        const offsetX = (e.clientX - rect.left) + timeline.scrollLeft - 80;
        if (offsetX < -10) return;

        const newTime = Math.max(0, Math.min(timelineDuration, offsetX / zoomLevel));
        setCurrentTime(newTime);
        if (videoRef.current) videoRef.current.currentTime = newTime;

        setIsDragging({ type: 'playhead' });
    };

    const handleMouseMove = (e) => {
        if (isDraggingHistory) {
            setHistoryPos(prev => ({
                x: prev.x + e.movementX,
                y: prev.y + e.movementY
            }));
            return;
        }
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
            if (!videoRect.width || !videoRect.height || !activeVClip) return;

            const scaleFactorX = canvasSize.w / videoRect.width;
            const scaleFactorY = canvasSize.h / videoRect.height;

            let dx = (e.clientX - isDragging.startX) * scaleFactorX;
            let dy = (e.clientY - isDragging.startY) * scaleFactorY;

            // Ctrl modifier for precision panning
            if (e.ctrlKey) {
                dx *= 0.1;
                dy *= 0.1;
            }

            let newX = isDragging.originX + dx;
            let newY = isDragging.originY + dy;

            // ===== CANVAS SNAP POINTS =====
            // Canvas kenarları ve merkezi (canvas boyutuna göre)
            const canvasSnapX = {
                left: 0,
                center: canvasSize.w / 2,
                right: canvasSize.w
            };
            const canvasSnapY = {
                top: 0,
                center: canvasSize.h / 2,
                bottom: canvasSize.h
            };

            // ===== CLIP DIMENSIONS =====
            // Aktif clip'in gerçek boyutları (sourceWidth/Height * scale)
            const sourceW = (activeVClip.sourceWidth || canvasSize.w);
            const sourceH = (activeVClip.sourceHeight || canvasSize.h);
            const clipScale = activeVClip.transform?.scale || 1;
            const clipW = sourceW * clipScale;
            const clipH = sourceH * clipScale;

            // Clip kenarları ve merkezi (mevcut pozisyona göre)
            // Transform-origin: center olduğu için translate(newX, newY) merkezi (newX + sourceW/2) konumuna taşır
            const clipCenterX = newX + sourceW / 2;
            const clipCenterY = newY + sourceH / 2;

            const clipLeft = clipCenterX - clipW / 2;
            const clipRight = clipCenterX + clipW / 2;
            const clipTop = clipCenterY - clipH / 2;
            const clipBottom = clipCenterY + clipH / 2;

            const newSnapLines = [];
            const snapThreshold = 20; // Snap eşiği (canvas piksel)

            // ===== X AXIS SNAPPING =====
            // Clip sol kenarı -> Canvas sol kenarı
            if (Math.abs(clipLeft - canvasSnapX.left) < snapThreshold) {
                newX = canvasSnapX.left + (clipW - sourceW) / 2;
                newSnapLines.push({ type: 'vertical', pos: 0 });
            }
            // Clip merkezi -> Canvas merkezi
            else if (Math.abs(clipCenterX - canvasSnapX.center) < snapThreshold) {
                newX = canvasSnapX.center - sourceW / 2;
                newSnapLines.push({ type: 'vertical', pos: 50 });
            }
            // Clip sağ kenarı -> Canvas sağ kenarı
            else if (Math.abs(clipRight - canvasSnapX.right) < snapThreshold) {
                newX = (canvasSnapX.right - sourceW) - (clipW - sourceW) / 2;
                newSnapLines.push({ type: 'vertical', pos: 100 });
            }

            // ===== Y AXIS SNAPPING =====
            // Clip üst kenarı -> Canvas üst kenarı
            if (Math.abs(clipTop - canvasSnapY.top) < snapThreshold) {
                newY = canvasSnapY.top + (clipH - sourceH) / 2;
                newSnapLines.push({ type: 'horizontal', pos: 0 });
            }
            // Clip merkezi -> Canvas merkezi
            else if (Math.abs(clipCenterY - canvasSnapY.center) < snapThreshold) {
                newY = canvasSnapY.center - sourceH / 2;
                newSnapLines.push({ type: 'horizontal', pos: 50 });
            }
            // Clip alt kenarı -> Canvas alt kenarı
            else if (Math.abs(clipBottom - canvasSnapY.bottom) < snapThreshold) {
                newY = (canvasSnapY.bottom - sourceH) - (clipH - sourceH) / 2;
                newSnapLines.push({ type: 'horizontal', pos: 100 });
            }

            setSnapLines(newSnapLines);

            updateClip(selectedClipId, {
                transform: {
                    ...(activeVClip.transform || { scale: 1 }),
                    x: newX,
                    y: newY
                }
            });
            return;
        }

        if (isDragging.type === 'clip') {
            const dx = (e.clientX - isDragging.startX) / zoomLevel;
            let newOffset = Math.max(0, isDragging.startOffset + dx);

            // Snapping Logic for timeline clips
            const snapThreshold = 10 / zoomLevel;
            const draggingClip = tracks.flatMap(t => t.clips).find(c => c.id === isDragging.id);
            if (draggingClip) {
                const clipDuration = draggingClip.duration;
                let bestSnap = null;
                let minDelta = snapThreshold;

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
                    const deltaStart = Math.abs(newOffset - sp);
                    if (deltaStart < minDelta) {
                        minDelta = deltaStart;
                        bestSnap = sp;
                    }
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

                // Important: get the absolute latest clip data from tracks to avoid stale state in long drags
                const latestClip = tracks.flatMap(t => t.clips).find(c => c.id === clip.id);
                const currentSourceDur = latestClip ? (latestClip.sourceDuration || latestClip.duration) : isDragging.startDuration;

                if (e.altKey) {
                    // Strecthing mode (ALT): change visual duration, keep source duration
                    updateClip(clip.id, { duration: newDur, sourceDuration: currentSourceDur });
                } else if (isDragging.type === 'resize-edge') {
                    // Trimming mode (Normal): change visual duration AND source duration proportionally (maintain current speed)
                    const currentStretchFactor = isDragging.startDuration / currentSourceDur;
                    const newSourceDur = Math.max(0.1, newDur / currentStretchFactor);
                    updateClip(clip.id, { duration: newDur, sourceDuration: newSourceDur });
                }
            } else { // Left edge resize
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
                const currentSourceDur = clip.sourceDuration || isDragging.startDuration;

                if (e.altKey) {
                    // Time stretching: change offset and duration, but source duration remains constant
                    updateClip(clip.id, { offset: newOffset, duration: newDur, sourceDuration: currentSourceDur });
                } else {
                    // Trimming: change offset, duration, and source start
                    const currentStretchFactor = isDragging.startDuration / currentSourceDur;
                    const consumedInSource = actualDx / currentStretchFactor; // How much source content is "trimmed" from the start
                    const newStart = Math.max(0, (isDragging.startIn || 0) + consumedInSource);
                    const newSourceDur = Math.max(0.1, currentSourceDur - consumedInSource);
                    updateClip(clip.id, { offset: newOffset, duration: newDur, start: newStart, sourceDuration: newSourceDur });
                }
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
        } else if (isDragging.type === 'playhead') {
            if (!timelineRef.current) return;
            const rect = timelineRef.current.getBoundingClientRect();
            let offsetX = (e.clientX - rect.left) + timelineRef.current.scrollLeft - 80;
            let newTime = Math.max(0, Math.min(timelineDuration, offsetX / zoomLevel));

            // Snapping for playhead
            const snapThreshold = 10 / zoomLevel;
            let bestSnap = null;
            let minDelta = snapThreshold;

            const snapPoints = [0];
            tracks.forEach(t => {
                t.clips.forEach(c => {
                    snapPoints.push(c.offset);
                    snapPoints.push(c.offset + c.duration);
                });
            });

            snapPoints.forEach(sp => {
                const delta = Math.abs(newTime - sp);
                if (delta < minDelta) {
                    minDelta = delta;
                    bestSnap = sp;
                }
            });

            if (bestSnap !== null) {
                newTime = bestSnap;
            }

            setCurrentTime(newTime);
            if (videoRef.current) {
                videoRef.current.currentTime = newTime;
            }
        } else if (isDragging.type === 'timeline-vertical-resize') {
            const editorHeight = window.innerHeight * 0.95; // 95vh approximation
            const padding = 120; // Header + margins
            const availableHeight = editorHeight - padding;
            const mouseFromBottom = window.innerHeight - e.clientY;
            // Limit timeline height between 100px and 70% of available space
            const newHeight = Math.max(100, Math.min(availableHeight * 0.7, mouseFromBottom - (window.innerHeight * 0.05)));
            setTimelineHeight(newHeight);
            setTimeout(updateVideoRect, 10);
        }
    };

    const handleMouseUp = (e) => {
        if (isDraggingHistory) {
            setIsDraggingHistory(false);
            return;
        }

        // Daha güvenli mantık: Sadece bizim başlattığımız bir sürükleme işlemi varsa müdahale et.
        // Diğer tüm durumlarda (buton tıklamaları, sliderlar, inputlar) tarayıcıyı rahat bırak.
        if (e && isDragging) {
            e.preventDefault();

            // Calculate drag distance
            const dx = Math.abs(e.clientX - (isDragging.startX || 0));
            const dy = Math.abs(e.clientY - (isDragging.startY || 0));
            const hasMoved = dx > 3 || dy > 3;

            // Record history for discrete drag operations ONLY if actual movement occurred
            let actionName = null;
            if (hasMoved) {
                if (isDragging.type === 'timeline-clip-move') actionName = 'actionMove';
                else if (isDragging.type === 'timeline-clip-resize') actionName = 'actionResize';
                else if (isDragging.type === 'canvas-pan') actionName = 'actionTransform';
                else if (isDragging.type === 'canvas-resize') actionName = 'actionCanvasResize';
                else if (isDragging.type === 'crop') actionName = 'actionCrop';
            }

            if (actionName) {
                pushHistory(actionName);
            }
        }
        setIsDragging(null);
        setSnapLines([]);
    };

    return (
        <div className="modal-overlay editor-overlay" style={{ zIndex: 7000 }}>
            <svg width="0" height="0" style={{ position: 'absolute' }}>
                <filter id="preview-color-correction">
                    <feColorMatrix type="matrix" values={colorMatrix} />
                    {activeVClip?.filters?.clarity > 0 && (
                        <feConvolveMatrix
                            order="3"
                            kernelMatrix={`0 -${activeVClip.filters.clarity / 100} 0 -${activeVClip.filters.clarity / 100} ${1 + (activeVClip.filters.clarity / 25)} -${activeVClip.filters.clarity / 100} 0 -${activeVClip.filters.clarity / 100} 0`}
                            preserveAlpha="true"
                        />
                    )}
                </filter>
            </svg>
            <div className="modal editor-modal video-editor-modal"
                onMouseMove={handleMouseMove} onMouseUp={handleMouseUp} onClick={e => e.stopPropagation()}>

                <div className="modal-header" style={{ marginBottom: '10px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        <Scissors size={18} color="var(--netflix-red)" />
                        <h4 style={{ margin: 0, color: 'var(--text-primary)' }}>{t.editVideo || 'Pro Video Editor'}</h4>
                    </div>
                    <div style={{ display: 'flex', gap: 10 }}>
                        <button className="btn btn-grey" style={{ background: 'var(--bg-card)', color: history.index > 0 ? 'var(--text-primary)' : '#555', border: '1px solid var(--border-color)', opacity: history.index > 0 ? 1 : 0.5 }} onClick={undo} disabled={history.index <= 0} data-tooltip={t.undo || 'Undo'} data-tooltip-pos="bottom" data-tooltip-align="end">
                            <Undo size={18} />
                        </button>
                        <button className="btn btn-grey" style={{ background: 'var(--bg-card)', color: history.index < history.stack.length - 1 ? 'var(--text-primary)' : '#555', border: '1px solid var(--border-color)', opacity: history.index < history.stack.length - 1 ? 1 : 0.5 }} onClick={redo} disabled={history.index >= history.stack.length - 1} data-tooltip={t.redo || 'Redo'} data-tooltip-pos="bottom" data-tooltip-align="end">
                            <Redo size={18} />
                        </button>
                        <button className={`btn btn-grey ${showHistory ? 'active' : ''}`} style={{ background: showHistory ? 'var(--netflix-red)' : 'var(--bg-card)', color: 'var(--text-primary)', border: '1px solid var(--border-color)' }} onClick={() => setShowHistory(!showHistory)} data-tooltip={t.history || 'History'} data-tooltip-pos="bottom" data-tooltip-align="end">
                            <History size={18} />
                        </button>
                        <button className="btn btn-grey" style={{ background: 'var(--bg-card)', color: 'var(--text-primary)', border: '1px solid var(--border-color)' }} onClick={() => setShowHelp(true)} data-tooltip={t.help || 'Help'} data-tooltip-pos="bottom" data-tooltip-align="end">
                            <Info size={18} />
                        </button>
                        <button className="btn btn-primary" onClick={() => handleSave()} disabled={isProcessing} data-tooltip={t.export || 'Save'} data-tooltip-pos="bottom" data-tooltip-align="end">
                            {isProcessing ? <div className="spinner-small" /> : <Save size={16} style={{ marginRight: 5 }} />}
                            {t.export || 'Export'}
                        </button>
                        <button className="btn" onClick={() => setShowSaveAs(true)} disabled={isProcessing} style={{ background: '#46d369', color: 'white', border: 'none' }} data-tooltip={t.saveAs || 'Save As...'} data-tooltip-pos="bottom" data-tooltip-align="end">
                            <Plus size={16} style={{ marginRight: 5 }} /> {t.saveAs || 'Save As...'}
                        </button>
                        <button className="btn btn-grey" style={{ background: 'var(--bg-card)', color: 'var(--text-primary)', border: '1px solid var(--border-color)' }} onClick={onClose} disabled={isProcessing} data-tooltip={t.close || 'Close'} data-tooltip-pos="bottom" data-tooltip-align="end"><X size={20} /></button>
                    </div>
                </div>

                {showHistory && (
                    <div
                        style={{
                            position: 'absolute',
                            top: historyPos.y,
                            left: historyPos.x,
                            width: 220,
                            background: 'var(--bg-card)',
                            border: '1px solid var(--border-color)',
                            borderRadius: 8,
                            zIndex: 9000,
                            display: 'flex',
                            flexDirection: 'column',
                            boxShadow: '0 10px 30px rgba(0,0,0,0.5)',
                            userSelect: 'none'
                        }}
                    >
                        <div
                            style={{
                                padding: '8px 12px',
                                background: 'var(--bg-secondary)',
                                borderBottom: '1px solid var(--border-color)',
                                cursor: 'grab',
                                display: 'flex',
                                justifyContent: 'space-between',
                                alignItems: 'center',
                                borderTopLeftRadius: 8,
                                borderTopRightRadius: 8
                            }}
                            onMouseDown={(e) => {
                                e.stopPropagation();
                                setIsDraggingHistory(true);
                            }}
                        >
                            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                <History size={14} color="var(--netflix-red)" />
                                <span style={{ fontSize: '0.7rem', fontWeight: 'bold', letterSpacing: '0.5px' }}>{t.historyPanel || 'HISTORY'}</span>
                            </div>
                            <X size={14} style={{ cursor: 'pointer', opacity: 0.6 }} onClick={() => setShowHistory(false)} />
                        </div>
                        <div style={{ maxHeight: 300, overflowY: 'auto', padding: '4px 0' }}>
                            {history.stack.map((item, idx) => (
                                <div
                                    key={idx}
                                    onClick={() => jumpToHistory(idx)}
                                    style={{
                                        padding: '7px 12px',
                                        fontSize: '0.65rem',
                                        cursor: 'pointer',
                                        background: idx === history.index ? 'rgba(229, 9, 20, 0.2)' : 'transparent',
                                        color: idx === history.index ? 'var(--netflix-red)' : (idx > history.index ? '#666' : 'var(--text-primary)'),
                                        borderLeft: idx === history.index ? '2px solid var(--netflix-red)' : '2px solid transparent',
                                        display: 'flex',
                                        justifyContent: 'space-between',
                                        alignItems: 'center',
                                        transition: 'all 0.2s'
                                    }}
                                >
                                    <span style={{ fontWeight: idx === history.index ? 'bold' : 'normal' }}>{item.name}</span>
                                    <span style={{ opacity: 0.4, fontSize: '0.6rem' }}>{item.timestamp}</span>
                                </div>
                            ))}
                        </div>
                    </div>
                )}

                <div className="editor-grid" style={{
                    display: 'grid',
                    gridTemplateColumns: 'minmax(280px, 300px) minmax(0, 1fr)',
                    gridTemplateRows: `minmax(0, 1fr) 6px ${timelineHeight}px`,
                    columnGap: 10,
                    rowGap: 0,
                    flex: 1,
                    overflow: 'hidden',
                    padding: '0 10px 10px 10px'
                }}>

                    {/* Left: properties */}
                    <div className="editor-sidebar sidebar-group" style={{ overflowY: 'auto', padding: '10px 8px', height: '100%', boxSizing: 'border-box' }}>
                        <label style={{ fontSize: '0.65rem', fontWeight: 'bold', letterSpacing: '1px', marginBottom: 8, display: 'block', color: 'var(--text-primary)', textAlign: 'center' }}>{t.clipProperties || 'CLIP PROPERTIES'}</label>
                        {selectedClip ? (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                                <div className="control-item" style={{ gap: 2 }}>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                        <label style={{ fontSize: '0.65rem', opacity: 0.8, color: 'var(--text-primary)' }}>{t.brightness || 'Brightness'}</label>
                                        <input type="number" value={selectedClip.filters?.brightness ?? 100}
                                            onChange={e => updateClip(selectedClipId, { filters: { ...selectedClip.filters, brightness: parseInt(e.target.value) || 0 } })}
                                            style={{ width: 45, background: 'var(--bg-primary)', border: '1px solid var(--border-color)', color: 'var(--netflix-red)', fontSize: '0.65rem', padding: '1px 3px', borderRadius: 3, textAlign: 'center' }} />
                                    </div>
                                    <input type="range" min="0" max="200" value={selectedClip.filters?.brightness ?? 100} style={{ height: 3 }}
                                        onMouseUp={() => pushHistory('actionFilter')}
                                        onChange={e => updateClip(selectedClipId, { filters: { ...selectedClip.filters, brightness: parseInt(e.target.value) } })} />
                                </div>
                                <div className="control-item" style={{ gap: 2 }}>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                        <label style={{ fontSize: '0.65rem', opacity: 0.8, color: 'var(--text-primary)' }}>{t.contrast || 'Contrast'}</label>
                                        <input type="number" value={selectedClip.filters?.contrast ?? 100}
                                            onBlur={() => pushHistory('actionFilter')}
                                            onChange={e => updateClip(selectedClipId, { filters: { ...selectedClip.filters, contrast: parseInt(e.target.value) || 0 } })}
                                            style={{ width: 45, background: 'var(--bg-primary)', border: '1px solid var(--border-color)', color: 'var(--netflix-red)', fontSize: '0.65rem', padding: '1px 3px', borderRadius: 3, textAlign: 'center' }} />
                                    </div>
                                    <input type="range" min="0" max="200" value={selectedClip.filters?.contrast ?? 100} style={{ height: 3 }}
                                        onMouseUp={() => pushHistory('actionFilter')}
                                        onChange={e => updateClip(selectedClipId, { filters: { ...selectedClip.filters, contrast: parseInt(e.target.value) } })} />
                                </div>
                                <div className="control-item" style={{ gap: 2 }}>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                        <label style={{ fontSize: '0.65rem', opacity: 0.8, color: 'var(--text-primary)' }}>{t.saturation || 'Saturation'}</label>
                                        <input type="number" value={selectedClip.filters?.saturation ?? 100}
                                            onBlur={() => pushHistory('actionFilter')}
                                            onChange={e => updateClip(selectedClipId, { filters: { ...selectedClip.filters, saturation: parseInt(e.target.value) || 0 } })}
                                            style={{ width: 45, background: 'var(--bg-primary)', border: '1px solid var(--border-color)', color: 'var(--netflix-red)', fontSize: '0.65rem', padding: '1px 3px', borderRadius: 3, textAlign: 'center' }} />
                                    </div>
                                    <input type="range" min="0" max="200" value={selectedClip.filters?.saturation ?? 100} style={{ height: 3 }}
                                        onMouseUp={() => pushHistory('actionFilter')}
                                        onChange={e => updateClip(selectedClipId, { filters: { ...selectedClip.filters, saturation: parseInt(e.target.value) } })} />
                                </div>
                                <div className="control-item" style={{ gap: 2 }}>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                        <label style={{ fontSize: '0.65rem', opacity: 0.8, color: 'var(--text-primary)' }}>{t.exposure || 'Exposure'}</label>
                                        <input type="number" value={selectedClip.filters?.exposure ?? 100}
                                            onBlur={() => pushHistory('actionFilter')}
                                            onChange={e => updateClip(selectedClipId, { filters: { ...selectedClip.filters, exposure: parseInt(e.target.value) || 0 } })}
                                            style={{ width: 45, background: 'var(--bg-primary)', border: '1px solid var(--border-color)', color: 'var(--netflix-red)', fontSize: '0.65rem', padding: '1px 3px', borderRadius: 3, textAlign: 'center' }} />
                                    </div>
                                    <input type="range" min="0" max="200" value={selectedClip.filters?.exposure ?? 100} style={{ height: 3 }}
                                        onMouseUp={() => pushHistory('actionFilter')}
                                        onChange={e => updateClip(selectedClipId, { filters: { ...selectedClip.filters, exposure: parseInt(e.target.value) } })} />
                                </div>
                                <div className="control-item" style={{ gap: 2 }}>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                        <label style={{ fontSize: '0.65rem', opacity: 0.8, color: 'var(--text-primary)' }}>{t.temperature || 'Temperature'}</label>
                                        <input type="number" value={selectedClip.filters?.temperature ?? 0}
                                            onBlur={() => pushHistory('actionFilter')}
                                            onChange={e => updateClip(selectedClipId, { filters: { ...selectedClip.filters, temperature: parseInt(e.target.value) || 0 } })}
                                            style={{ width: 45, background: 'var(--bg-primary)', border: '1px solid var(--border-color)', color: 'var(--netflix-red)', fontSize: '0.65rem', padding: '1px 3px', borderRadius: 3, textAlign: 'center' }} />
                                    </div>
                                    <input type="range" min="-100" max="100" value={selectedClip.filters?.temperature ?? 0} style={{ height: 3 }}
                                        onMouseUp={() => pushHistory('actionFilter')}
                                        onChange={e => updateClip(selectedClipId, { filters: { ...selectedClip.filters, temperature: parseInt(e.target.value) } })} />
                                </div>
                                <div className="control-item" style={{ gap: 2 }}>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                        <label style={{ fontSize: '0.65rem', opacity: 0.8, color: 'var(--text-primary)' }}>{t.tint || 'Tint'}</label>
                                        <input type="number" value={selectedClip.filters?.tint ?? 0}
                                            onBlur={() => pushHistory('actionFilter')}
                                            onChange={e => updateClip(selectedClipId, { filters: { ...selectedClip.filters, tint: parseInt(e.target.value) || 0 } })}
                                            style={{ width: 45, background: 'var(--bg-primary)', border: '1px solid var(--border-color)', color: 'var(--netflix-red)', fontSize: '0.65rem', padding: '1px 3px', borderRadius: 3, textAlign: 'center' }} />
                                    </div>
                                    <input type="range" min="-100" max="100" value={selectedClip.filters?.tint ?? 0} style={{ height: 3 }}
                                        onMouseUp={() => pushHistory('actionFilter')}
                                        onChange={e => updateClip(selectedClipId, { filters: { ...selectedClip.filters, tint: parseInt(e.target.value) } })} />
                                </div>
                                <div className="control-item" style={{ gap: 2 }}>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                        <label style={{ fontSize: '0.65rem', opacity: 0.8, color: 'var(--text-primary)' }}>{t.vibrance || 'Vibrance'}</label>
                                        <input type="number" value={selectedClip.filters?.vibrance ?? 0}
                                            onBlur={() => pushHistory('actionFilter')}
                                            onChange={e => updateClip(selectedClipId, { filters: { ...selectedClip.filters, vibrance: parseInt(e.target.value) || 0 } })}
                                            style={{ width: 45, background: 'var(--bg-primary)', border: '1px solid var(--border-color)', color: 'var(--netflix-red)', fontSize: '0.65rem', padding: '1px 3px', borderRadius: 3, textAlign: 'center' }} />
                                    </div>
                                    <input type="range" min="-100" max="100" value={selectedClip.filters?.vibrance ?? 0} style={{ height: 3 }}
                                        onMouseUp={() => pushHistory('actionFilter')}
                                        onChange={e => updateClip(selectedClipId, { filters: { ...selectedClip.filters, vibrance: parseInt(e.target.value) } })} />
                                </div>
                                <div className="control-item" style={{ gap: 2 }}>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                        <label style={{ fontSize: '0.65rem', opacity: 0.8, color: 'var(--text-primary)' }}>{t.clarity || 'Clarity'}</label>
                                        <input type="number" value={selectedClip.filters?.clarity ?? 0}
                                            onBlur={() => pushHistory('actionFilter')}
                                            onChange={e => updateClip(selectedClipId, { filters: { ...selectedClip.filters, clarity: parseInt(e.target.value) || 0 } })}
                                            style={{ width: 45, background: 'var(--bg-primary)', border: '1px solid var(--border-color)', color: 'var(--netflix-red)', fontSize: '0.65rem', padding: '1px 3px', borderRadius: 3, textAlign: 'center' }} />
                                    </div>
                                    <input type="range" min="0" max="100" value={selectedClip.filters?.clarity ?? 0} style={{ height: 3 }}
                                        onMouseUp={() => pushHistory('actionFilter')}
                                        onChange={e => updateClip(selectedClipId, { filters: { ...selectedClip.filters, clarity: parseInt(e.target.value) } })} />
                                </div>
                                <div className="control-item" style={{ gap: 2 }}>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                        <label style={{ fontSize: '0.65rem', opacity: 0.8, color: 'var(--text-primary)' }}>{t.hue || 'Hue'}</label>
                                        <input type="number" value={selectedClip.filters?.hue ?? 0}
                                            onBlur={() => pushHistory('actionFilter')}
                                            onChange={e => updateClip(selectedClipId, { filters: { ...selectedClip.filters, hue: parseInt(e.target.value) || 0 } })}
                                            style={{ width: 45, background: 'var(--bg-primary)', border: '1px solid var(--border-color)', color: 'var(--netflix-red)', fontSize: '0.65rem', padding: '1px 3px', borderRadius: 3, textAlign: 'center' }} />
                                    </div>
                                    <input type="range" min="-180" max="180" value={selectedClip.filters?.hue ?? 0} style={{ height: 3 }}
                                        onMouseUp={() => pushHistory('actionFilter')}
                                        onChange={e => updateClip(selectedClipId, { filters: { ...selectedClip.filters, hue: parseInt(e.target.value) } })} />
                                </div>

                                <div style={{ marginTop: 5, padding: 5, background: 'var(--bg-primary)', borderRadius: 4, border: '1px solid var(--border-color)' }}>
                                    <label style={{ fontSize: '0.6rem', fontWeight: 'bold', display: 'block', marginBottom: 5, color: 'var(--text-secondary)' }}>COLOR BALANCE (RGB)</label>

                                    {['highlights', 'midtones', 'shadows'].map(type => (
                                        <div key={type} style={{ marginBottom: 8 }}>
                                            <div style={{ fontSize: '0.55rem', opacity: 0.7, marginBottom: 2, textTransform: 'uppercase' }}>{t[type] || type}</div>
                                            <div style={{ display: 'flex', gap: 5 }}>
                                                {['r', 'g', 'b'].map(color => (
                                                    <div key={color} style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 2 }}>
                                                        <input
                                                            type="range" min="-100" max="100"
                                                            value={selectedClip.filters?.colorBalance?.[type]?.[color] ?? 0}
                                                            style={{ height: 2, accentColor: color === 'r' ? '#f00' : (color === 'g' ? '#0f0' : '#00f') }}
                                                            onMouseUp={() => pushHistory('actionFilter')}
                                                            onChange={e => {
                                                                const newVal = parseInt(e.target.value);
                                                                const newCB = { ...selectedClip.filters.colorBalance };
                                                                newCB[type] = { ...newCB[type], [color]: newVal };
                                                                updateClip(selectedClipId, { filters: { ...selectedClip.filters, colorBalance: newCB } });
                                                            }}
                                                        />
                                                    </div>
                                                ))}
                                            </div>
                                        </div>
                                    ))}
                                </div>
                                <div className="control-item" style={{ gap: 2 }}>
                                    <label style={{ fontSize: '0.65rem', opacity: 0.8 }}>CURVES PRESET</label>
                                    <select
                                        value={selectedClip.filters?.curves ?? 'none'}
                                        onChange={e => historyUpdateClip('actionFilter', selectedClipId, { filters: { ...selectedClip.filters, curves: e.target.value } })}
                                        style={{ width: '100%', background: 'var(--bg-primary)', border: '1px solid var(--border-color)', color: 'var(--text-primary)', fontSize: '0.7rem', padding: '3px', borderRadius: 3 }}
                                    >
                                        <option value="none">None</option>
                                        <option value="color_negative">Color Negative</option>
                                        <option value="cross_process">Cross Process</option>
                                        <option value="darker">Darker</option>
                                        <option value="lighter">Lighter</option>
                                        <option value="increase_contrast">Increase Contrast</option>
                                        <option value="linear_contrast">Linear Contrast</option>
                                        <option value="medium_contrast">Medium Contrast</option>
                                        <option value="strong_contrast">Strong Contrast</option>
                                        <option value="vintage">Vintage</option>
                                    </select>
                                </div>

                                <div className="control-item" style={{ gap: 2 }}>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                        <label style={{ fontSize: '0.65rem', opacity: 0.8, color: 'var(--text-primary)' }}>{t.volume || 'Volume'}</label>
                                        <input type="number" value={selectedClip.volume ?? 100}
                                            onBlur={() => pushHistory('actionVolume')}
                                            onChange={e => {
                                                const vol = parseInt(e.target.value) || 0;
                                                updateClip(selectedClipId, { volume: vol });
                                                if (videoRef.current) videoRef.current.volume = Math.max(0, Math.min(1, vol / 100));
                                            }}
                                            style={{ width: 45, background: 'var(--bg-primary)', border: '1px solid var(--border-color)', color: 'var(--netflix-red)', fontSize: '0.65rem', padding: '1px 3px', borderRadius: 3, textAlign: 'center' }} />
                                    </div>
                                    <input type="range" min="0" max="200" value={selectedClip.volume ?? 100} style={{ height: 3 }}
                                        onMouseUp={() => pushHistory('actionVolume')}
                                        onChange={e => {
                                            const vol = parseInt(e.target.value);
                                            updateClip(selectedClipId, { volume: vol });
                                            if (videoRef.current) videoRef.current.volume = Math.max(0, Math.min(1, vol / 100));
                                        }} />
                                </div>
                                <div className="control-item" style={{ gap: 2 }}>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                        <label style={{ fontSize: '0.65rem', opacity: 0.8, color: 'var(--text-primary)' }}>{t.scale || 'Scale'}</label>
                                        <input type="number" step="0.01" value={isFinite(selectedClip.transform?.scale) ? parseFloat(selectedClip.transform.scale).toFixed(2) : "1.00"}
                                            onBlur={() => pushHistory('actionTransform')}
                                            onChange={e => updateClip(selectedClipId, { transform: { ...(selectedClip.transform || { x: 0, y: 0 }), scale: parseFloat(e.target.value) || 1 } })}
                                            style={{ width: 45, background: 'var(--bg-primary)', border: '1px solid var(--border-color)', color: 'var(--netflix-red)', fontSize: '0.65rem', padding: '1px 3px', borderRadius: 3, textAlign: 'center' }} />
                                    </div>
                                    <input type="range" min="0.1" max="10" step="0.01" value={isFinite(selectedClip.transform?.scale) ? selectedClip.transform.scale : 1} style={{ height: 3 }}
                                        onMouseUp={() => pushHistory('actionTransform')}
                                        onChange={e => updateClip(selectedClipId, { transform: { ...(selectedClip.transform || { x: 0, y: 0 }), scale: parseFloat(e.target.value) || 1 } })} />
                                </div>
                                <div className="control-item" style={{ gap: 2 }}>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                        <label style={{ fontSize: '0.65rem', opacity: 0.8, color: 'var(--text-primary)' }}>{t.playbackSpeed || 'Speed'}</label>
                                        <input type="number" step="0.01"
                                            onBlur={() => pushHistory('actionSpeed')}
                                            value={(selectedClip.duration > 0 && isFinite(selectedClip.sourceDuration / selectedClip.duration)) ? (selectedClip.sourceDuration / selectedClip.duration).toFixed(2) : "1.00"}
                                            onChange={e => {
                                                const newSpeed = Math.max(0.1, parseFloat(e.target.value) || 1);
                                                const sourceDur = selectedClip.sourceDuration || selectedClip.duration || 1;
                                                const newTimelineDur = sourceDur / newSpeed;
                                                updateClip(selectedClipId, { duration: isFinite(newTimelineDur) ? newTimelineDur : 1, sourceDuration: sourceDur });
                                            }}
                                            style={{ width: 45, background: 'var(--bg-primary)', border: '1px solid var(--border-color)', color: '#ffc107', fontSize: '0.65rem', padding: '1px 3px', borderRadius: 3, textAlign: 'center' }} />
                                    </div>
                                    <input type="range" min="0.1" max="5" step="0.01"
                                        value={(selectedClip.duration > 0 && isFinite(selectedClip.sourceDuration / selectedClip.duration)) ? (selectedClip.sourceDuration / selectedClip.duration) : 1}
                                        style={{ height: 3 }}
                                        onMouseUp={() => pushHistory('actionSpeed')}
                                        onChange={e => {
                                            const newSpeed = Math.max(0.1, parseFloat(e.target.value) || 1);
                                            const sourceDur = selectedClip.sourceDuration || selectedClip.duration || 1;
                                            const newTimelineDur = sourceDur / newSpeed;
                                            updateClip(selectedClipId, { duration: isFinite(newTimelineDur) ? newTimelineDur : 1, sourceDuration: sourceDur });
                                        }} />
                                </div>
                                <button className="action-btn" style={{ width: '100%', background: 'var(--bg-secondary)', border: '1px solid var(--border-color)', color: 'var(--text-primary)', justifyContent: 'center', fontSize: '0.8rem', padding: '6px' }} onClick={() => historyUpdateClip('actionResetFilters', selectedClipId, { filters: { brightness: 100, contrast: 100, saturation: 100, exposure: 100, temperature: 0, tint: 0, vibrance: 0, hue: 0, clarity: 0, gamma: 1.0, colorBalance: { shadows: { r: 0, g: 0, b: 0 }, midtones: { r: 0, g: 0, b: 0 }, highlights: { r: 0, g: 0, b: 0 } }, curves: 'none' }, volume: 100 })}>
                                    <RotateCw size={14} style={{ marginRight: 8 }} /> {t.resetFilters || 'Reset Filters'}
                                </button>

                                <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 5 }}>
                                    <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap', justifyContent: 'flex-start' }}>
                                        <button className="action-btn" style={{ width: 34, height: 34, background: 'var(--bg-secondary)', border: '1px solid var(--border-color)', color: 'var(--text-primary)' }} onClick={() => historyUpdateClip('actionTransform', selectedClipId, { rotate: ((selectedClip.rotate || 0) + 90) % 360 })} data-tooltip={t?.rotate || 'Rotate'}>
                                            <RotateCw size={16} />
                                        </button>
                                        <button className={`action-btn ${selectedClip.flipH ? 'active' : ''}`} style={{ width: 34, height: 34, background: selectedClip.flipH ? 'var(--netflix-red)' : 'var(--bg-secondary)', border: '1px solid var(--border-color)', color: 'var(--text-primary)' }} onClick={() => historyUpdateClip('actionTransform', selectedClipId, { flipH: !selectedClip.flipH })} data-tooltip={t?.flipH || 'Flip H'}>
                                            <Maximize2 size={16} style={{ transform: 'rotate(90deg)' }} />
                                        </button>
                                        <button className={`action-btn ${selectedClip.flipV ? 'active' : ''}`} style={{ width: 34, height: 34, background: selectedClip.flipV ? 'var(--netflix-red)' : 'var(--bg-secondary)', border: '1px solid var(--border-color)', color: 'var(--text-primary)' }} onClick={() => historyUpdateClip('actionTransform', selectedClipId, { flipV: !selectedClip.flipV })} data-tooltip={t?.flipV || 'Flip V'}>
                                            <Maximize2 size={16} />
                                        </button>
                                        <button className="action-btn" style={{ width: 34, height: 34, background: 'var(--bg-secondary)', border: '1px solid var(--border-color)', color: 'var(--text-primary)' }} onClick={() => historyUpdateClip('actionResetTransform', selectedClipId, { rotate: 0, flipH: false, flipV: false, transform: { ...(selectedClip.transform || { x: 0, y: 0 }), scale: 1 } })} data-tooltip={t.resetTransform || 'Reset Transform'}>
                                            <CornerUpLeft size={16} />
                                        </button>
                                    </div>
                                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 5 }}>
                                        <button className="action-btn" style={{ background: 'var(--netflix-red)', color: 'white', border: 'none' }} onClick={() => {
                                            const sw = selectedClip.sourceWidth || canvasSize.w;
                                            const sh = selectedClip.sourceHeight || canvasSize.h;
                                            historyUpdateClip('actionTransform', selectedClipId, { transform: { ...(selectedClip.transform || { x: 0, y: 0 }), x: (canvasSize.w - sw) / 2, y: (canvasSize.h - sh) / 2 } });
                                        }} data-tooltip={t.center || 'Center'}>
                                            <Monitor size={16} style={{ marginRight: 8 }} /> {t.center || 'Center'}
                                        </button>
                                        <button className="action-btn" style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border-color)', color: 'var(--text-primary)' }} onClick={() => historyUpdateClip('actionResetPosition', selectedClipId, { transform: { ...(selectedClip.transform || { x: 0, y: 0 }), x: 0, y: 0 } })} data-tooltip={t.resetPosition || 'Reset Position'}>
                                            <Maximize2 size={16} style={{ marginRight: 8 }} /> {t.resetPosition || 'Reset'}
                                        </button>
                                    </div>
                                </div>
                                <div style={{ marginTop: 10 }}>
                                    <label style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginBottom: 8, display: 'block' }}>{t?.aspectRatio || 'Aspect Ratio'}</label>
                                    <div className="ratio-presets" style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                                        <button className="action-btn" style={{ padding: '2px 8px', fontSize: '0.7rem', background: 'var(--bg-secondary)', border: '1px solid var(--border-color)', color: 'var(--text-primary)' }} onClick={() => setAspectRatio(1)}>1:1</button>
                                        <button className="action-btn" style={{ padding: '2px 8px', fontSize: '0.7rem', background: 'var(--bg-secondary)', border: '1px solid var(--border-color)', color: 'var(--text-primary)' }} onClick={() => setAspectRatio(16 / 9)}>16:9</button>
                                        <button className="action-btn" style={{ padding: '2px 8px', fontSize: '0.7rem', background: 'var(--bg-secondary)', border: '1px solid var(--border-color)', color: 'var(--text-primary)' }} onClick={() => setAspectRatio(9 / 16)}>9:16</button>
                                        <button className="action-btn" style={{ padding: '2px 8px', fontSize: '0.7rem', background: 'var(--bg-secondary)', border: '1px solid var(--border-color)', color: 'var(--text-primary)' }} onClick={() => setAspectRatio(4 / 3)}>4:3</button>
                                        <button className="action-btn" style={{ padding: '2px 8px', fontSize: '0.7rem', background: 'var(--bg-secondary)', border: '1px solid var(--border-color)', color: 'var(--text-primary)' }} onClick={() => setAspectRatio(21 / 9)}>21:9</button>
                                    </div>
                                </div>
                            </div>
                        ) : (
                            <p style={{ color: '#666', fontSize: '0.8rem' }}>{t.selectClipToEdit || 'Select a clip to edit properties'}</p>
                        )}
                    </div>

                    {/* Right: Viewer */}
                    <div className="editor-main-area" style={{ display: 'flex', flexDirection: 'column', background: 'var(--bg-primary)', borderLeft: '1px solid var(--border-color)', borderRadius: 8, overflow: 'hidden', height: '100%' }}>
                        <div className="video-viewport video-viewport-container" ref={containerRef}
                            onMouseDown={handleCanvasMouseDown}
                            onContextMenu={(e) => e.preventDefault()}
                        >
                            {(!duration || duration === -1) && (
                                <div style={{ position: 'absolute', zIndex: 10, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10 }}>
                                    {duration === -1 ? (
                                        <span style={{ color: 'var(--netflix-red)', fontSize: '0.8rem' }}>{t.errorLoadingMedia || 'Error loading media. Try again.'}</span>
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
                                {(() => {
                                    // Viewport Scale Calculation for correct translate rendering
                                    const viewScaleX = videoRect.width && canvasSize.w ? (videoRect.width / canvasSize.w) : 1;
                                    const viewScaleY = videoRect.height && canvasSize.h ? (videoRect.height / canvasSize.h) : 1;

                                    return (
                                        <>
                                            <video
                                                ref={videoRef}
                                                key={`vid-${activeVClip?.id || 'none'}`}
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
                                                    width: activeVClip?.sourceWidth ? `${(activeVClip.sourceWidth / canvasSize.w) * 100}%` : '100%',
                                                    height: activeVClip?.sourceHeight ? `${(activeVClip.sourceHeight / canvasSize.h) * 100}%` : '100%',
                                                    objectFit: 'fill',
                                                    display: 'block',
                                                    opacity: (activeVClip && activeVClip.type === 'video') || (duration <= 0) ? 1 : 0,
                                                    filter: activeVClip?.filters ? `url(#preview-color-correction) brightness(${activeVClip.filters.brightness ?? 100}%) contrast(${activeVClip.filters.contrast ?? 100}%) saturate(${(activeVClip.filters.saturation ?? 100) + (activeVClip.filters.vibrance ?? 0)}%) hue-rotate(${activeVClip.filters.hue ?? 0}deg)` : 'none',
                                                    transform: activeVClip ? `translate(${(activeVClip.transform?.x || 0) * viewScaleX}px, ${(activeVClip.transform?.y || 0) * viewScaleY}px) scale(${activeVClip.transform?.scale || 1}) rotate(${activeVClip.rotate || 0}deg) scaleX(${activeVClip.flipH ? -1 : 1}) scaleY(${activeVClip.flipV ? -1 : 1})` : 'none',
                                                    clipPath: activeVClip?.crop ? `inset(${activeVClip.crop.y}% ${100 - (activeVClip.crop.x + activeVClip.crop.w)}% ${100 - (activeVClip.crop.y + activeVClip.crop.h)}% ${activeVClip.crop.x}%)` : 'none'
                                                }}
                                            />

                                            {activeVClip && activeVClip.type === 'image' && (
                                                <img
                                                    draggable={false}
                                                    ref={imageRef}
                                                    key={`img-${activeVClip.id}`}
                                                    src={`http://localhost:3001/media/${encodeURIComponent(activeVClip.path)}`}
                                                    alt="Preview"
                                                    onLoad={(e) => {
                                                        const nw = e.target.naturalWidth;
                                                        const nh = e.target.naturalHeight;

                                                        // Sadece boyut bilgisi HİÇ YOKSA (yeni eklenen klip) güncelle ve ortala.
                                                        // Varsa dokunma, kullanıcının ayarını bozma.
                                                        if (!activeVClip.sourceWidth || activeVClip.sourceWidth === 0) {
                                                            const oldW = canvasSize.w; // Varsayılan olarak canvas boyutundaydı
                                                            const oldH = canvasSize.h;
                                                            const dx = (oldW - nw) / 2;
                                                            const dy = (oldH - nh) / 2;

                                                            updateClip(activeVClip.id, {
                                                                sourceWidth: nw,
                                                                sourceHeight: nh,
                                                                transform: {
                                                                    ...(activeVClip.transform || { scale: 1 }),
                                                                    x: dx,
                                                                    y: dy
                                                                }
                                                            });
                                                        } else if (Math.abs(activeVClip.sourceWidth - nw) > 2) {
                                                            // Boyut değişmiş ama pozisyonu bozmadan sadece metadatayı güncelle (nadir durum)
                                                            updateClip(activeVClip.id, { sourceWidth: nw, sourceHeight: nh });
                                                        }
                                                        updateVideoRect();
                                                        setTimeout(updateVideoRect, 50);
                                                    }}
                                                    style={{
                                                        position: 'absolute',
                                                        left: 0, top: 0,
                                                        width: activeVClip?.sourceWidth ? `${(activeVClip.sourceWidth / canvasSize.w) * 100}%` : 'auto',
                                                        height: activeVClip?.sourceHeight ? `${(activeVClip.sourceHeight / canvasSize.h) * 100}%` : 'auto',
                                                        objectFit: 'fill',
                                                        opacity: activeVClip?.sourceWidth ? 1 : 0,
                                                        filter: activeVClip?.filters ? `url(#preview-color-correction) brightness(${activeVClip.filters.brightness ?? 100}%) contrast(${activeVClip.filters.contrast ?? 100}%) saturate(${(activeVClip.filters.saturation ?? 100) + (activeVClip.filters.vibrance ?? 0)}%) hue-rotate(${activeVClip.filters.hue ?? 0}deg)` : 'none',
                                                        transform: activeVClip ? `translate(${(activeVClip.transform?.x || 0) * viewScaleX}px, ${(activeVClip.transform?.y || 0) * viewScaleY}px) scale(${activeVClip.transform?.scale || 1}) rotate(${activeVClip.rotate || 0}deg) scaleX(${activeVClip.flipH ? -1 : 1}) scaleY(${activeVClip.flipV ? -1 : 1})` : 'none',
                                                        transformOrigin: '50% 50%',
                                                        clipPath: activeVClip?.crop ? `inset(${activeVClip.crop.y}% ${100 - (activeVClip.crop.x + activeVClip.crop.w)}% ${100 - (activeVClip.crop.y + activeVClip.crop.h)}% ${activeVClip.crop.x}%)` : 'none'
                                                    }}
                                                />
                                            )}
                                        </>
                                    );
                                })()}

                                {/* Snap Lines Overlay - Red dotted lines */}
                                {snapLines.map((line, i) => (
                                    <div key={i} style={{
                                        position: 'absolute',
                                        zIndex: 100,
                                        pointerEvents: 'none',
                                        ...(line.type === 'vertical' ? {
                                            top: 0, bottom: 0,
                                            left: `${line.pos}%`,
                                            width: 0,
                                            borderLeft: '2px dotted #e50914',
                                            transform: 'translateX(-50%)'
                                        } : {
                                            left: 0, right: 0,
                                            top: `${line.pos}%`,
                                            height: 0,
                                            borderTop: '2px dotted #e50914',
                                            transform: 'translateY(-50%)'
                                        })
                                    }} />
                                ))}
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
                                        top: -35,
                                        left: '50%',
                                        transform: 'translateX(-50%)',
                                        background: 'rgba(0,0,0,0.9)',
                                        color: '#fff',
                                        padding: '4px 8px',
                                        borderRadius: 6,
                                        fontSize: '0.8rem',
                                        whiteSpace: 'nowrap',
                                        display: 'flex',
                                        alignItems: 'center',
                                        gap: 5,
                                        pointerEvents: 'auto',
                                        border: '1px solid rgba(255,255,255,0.1)',
                                        boxShadow: '0 4px 10px rgba(0,0,0,0.5)'
                                    }}>
                                        <input
                                            type="number"
                                            min={1}
                                            value={Math.round(canvasSize.w)}
                                            onChange={e => setCanvasSize(prev => ({ ...prev, w: Math.max(1, parseInt(e.target.value) || 0) }))}
                                            onFocus={() => { canvasSizeOnFocusRef.current = { ...canvasSize }; }}
                                            onBlur={() => {
                                                if (canvasSizeOnFocusRef.current && (canvasSizeOnFocusRef.current.w !== canvasSize.w || canvasSizeOnFocusRef.current.h !== canvasSize.h)) {
                                                    pushHistory('actionTransform');
                                                }
                                                canvasSizeOnFocusRef.current = null;
                                            }}
                                            style={{ width: 55, background: 'rgba(255,255,255,0.05)', border: '1px solid #444', color: '#fff', fontSize: '0.75rem', padding: '1px 4px', borderRadius: 3, textAlign: 'center', outline: 'none' }}
                                        />
                                        <span style={{ color: '#888' }}>x</span>
                                        <input
                                            type="number"
                                            min={1}
                                            value={Math.round(canvasSize.h)}
                                            onChange={e => setCanvasSize(prev => ({ ...prev, h: Math.max(1, parseInt(e.target.value) || 0) }))}
                                            onFocus={() => { canvasSizeOnFocusRef.current = { ...canvasSize }; }}
                                            onBlur={() => {
                                                if (canvasSizeOnFocusRef.current && (canvasSizeOnFocusRef.current.w !== canvasSize.w || canvasSizeOnFocusRef.current.h !== canvasSize.h)) {
                                                    pushHistory('actionTransform');
                                                }
                                                canvasSizeOnFocusRef.current = null;
                                            }}
                                            style={{ width: 55, background: 'rgba(255,255,255,0.05)', border: '1px solid #444', color: '#fff', fontSize: '0.75rem', padding: '1px 4px', borderRadius: 3, textAlign: 'center', outline: 'none' }}
                                        />
                                        <span style={{ color: '#aaa', marginLeft: 2 }}>px</span>
                                        <div style={{ width: 1, height: 16, background: 'rgba(255,255,255,0.2)', margin: '0 5px' }} />
                                        <button
                                            className="action-btn"
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                if (originalSize) {
                                                    const newSize = { w: originalSize.w, h: originalSize.h };
                                                    setCanvasSize(newSize);
                                                    pushHistory('actionCanvasResize', null, newSize);
                                                }
                                            }}
                                            style={{ padding: '2px 6px', height: 'auto', border: 'none', background: 'transparent' }}
                                            data-tooltip={t.resetCanvasSize || 'Reset'}
                                            data-tooltip-pos="top"
                                        >
                                            <CornerUpLeft size={14} color="#e50914" />
                                        </button>
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
                            <div style={{ position: 'absolute', bottom: -5, left: '50%', transform: 'translateX(-50%)', display: 'flex', gap: 12, background: 'rgba(0,0,0,0.7)', padding: '6px 18px', borderRadius: 25, alignItems: 'center', backdropFilter: 'blur(5px)', border: '1px solid rgba(255,255,255,0.1)', zIndex: 50 }}>
                                {/* En Başa / Klip Başına */}
                                <button className="action-btn" data-tooltip={t.goToStart || "Go to Start"} data-tooltip-pos="top" style={{ background: 'transparent', border: 'none', color: 'white', display: 'flex', alignItems: 'center', padding: 4 }}
                                    onClick={() => {
                                        const clip = getSelectedClip();
                                        setCurrentTime(clip ? clip.offset : 0);
                                    }}>
                                    <SkipBack size={18} />
                                </button>

                                {/* Geri Sar (1s) */}
                                <button className="action-btn" data-tooltip="-1s" data-tooltip-pos="top" style={{ background: 'transparent', border: 'none', color: 'rgba(255,255,255,0.7)', display: 'flex', alignItems: 'center', padding: 4 }}
                                    onClick={() => setCurrentTime(prev => Math.max(0, prev - 1))}>
                                    <ChevronsLeft size={18} />
                                </button>

                                {/* Hassas Geri (0.05s) */}
                                <button className="action-btn" data-tooltip="-0.05s" data-tooltip-pos="top" style={{ background: 'transparent', border: 'none', color: 'rgba(255,255,255,0.9)', display: 'flex', alignItems: 'center', padding: 4 }}
                                    onClick={() => setCurrentTime(prev => Math.max(0, prev - 0.05))}>
                                    <ChevronLeft size={18} />
                                </button>

                                {/* Play / Pause (Merkez) */}
                                <button className="action-btn" data-tooltip={isPlaying ? (t.pause || "Pause") : (t.play || "Play")} data-tooltip-pos="top" style={{ background: 'white', border: 'none', color: 'black', width: 30, height: 30, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'transform 0.1s', flexShrink: 0 }}
                                    onClick={togglePlay}>
                                    {isPlaying ? <Pause size={16} fill="black" /> : <Play size={16} fill="black" style={{ marginLeft: 1.5 }} />}
                                </button>

                                {/* Hassas İleri (0.05s) */}
                                <button className="action-btn" data-tooltip="+0.05s" data-tooltip-pos="top" style={{ background: 'transparent', border: 'none', color: 'rgba(255,255,255,0.9)', display: 'flex', alignItems: 'center', padding: 4 }}
                                    onClick={() => setCurrentTime(prev => Math.min(timelineDuration, prev + 0.05))}>
                                    <ChevronRight size={18} />
                                </button>

                                {/* İleri Sar (1s) */}
                                <button className="action-btn" data-tooltip="+1s" data-tooltip-pos="top" style={{ background: 'transparent', border: 'none', color: 'rgba(255,255,255,0.7)', display: 'flex', alignItems: 'center', padding: 4 }}
                                    onClick={() => setCurrentTime(prev => Math.min(timelineDuration, prev + 1))}>
                                    <ChevronsRight size={18} />
                                </button>

                                {/* En Sona / Klip Sonuna */}
                                <button className="action-btn" data-tooltip={t.goToEnd || "Go to End"} data-tooltip-pos="top" style={{ background: 'transparent', border: 'none', color: 'white', display: 'flex', alignItems: 'center', padding: 4 }}
                                    onClick={() => {
                                        const clip = getSelectedClip();
                                        setCurrentTime(clip ? (clip.offset + clip.duration) : contentDuration);
                                    }}>
                                    <SkipForward size={18} />
                                </button>
                            </div>
                        </div>
                    </div>

                    {/* Resizable Divider */}
                    <div
                        onMouseDown={(e) => {
                            e.preventDefault();
                            setIsDragging({ type: 'timeline-vertical-resize', startY: e.clientY, startHeight: timelineHeight });
                        }}
                        style={{
                            gridColumn: '1 / -1',
                            height: 6,
                            cursor: 'ns-resize',
                            background: 'transparent',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            zIndex: 1000,
                            position: 'relative'
                        }}
                    >
                        <div style={{ width: 40, height: 2, background: 'var(--border-color)', borderRadius: 1 }} />
                    </div>

                    {/* Bottom: Timeline */}
                    <div style={{ gridColumn: '1 / -1', background: 'var(--bg-secondary)', borderRadius: 8, display: 'flex', flexDirection: 'column', overflow: 'visible', border: '1px solid var(--border-color)', height: '100%' }}>
                        <div className="video-editor-toolbar" style={{ overflow: 'visible' }}>
                            <div className="btn-group" style={{ overflow: 'visible' }}>
                                <button className={`action-btn ${activeTool === 'select' ? 'active' : ''}`} onClick={() => setActiveTool('select')} data-tooltip={t.selectionTool || 'Selection Tool'}><Search size={14} /></button>
                                <button className={`action-btn ${activeTool === 'transform' ? 'active' : ''}`} onClick={() => setActiveTool('transform')} data-tooltip={t.moveAndScale || 'Move & Scale'}><Maximize2 size={14} /></button>
                                <button className={`action-btn ${activeTool === 'crop' ? 'active' : ''}`} onClick={() => setActiveTool('crop')} data-tooltip={t.projectCanvasResize || 'Project Canvas Resize'}><Monitor size={14} /></button>
                                <button className={`action-btn ${activeTool === 'split' ? 'active' : ''}`} onClick={handleSplit} data-tooltip={t.splitAtScrubber || 'Split at Scrubber'}><Scissors size={14} /></button>
                                <button className={`action-btn ${activeTool === 'delete' ? 'active' : ''}`} onClick={handleDelete} data-tooltip={t.deleteSelectedClip || 'Delete Selected Clip'}><Trash size={14} /></button>
                                <button className="action-btn" onClick={packClips} data-tooltip={t.packClips || 'Pack Clips (Remove Gaps)'}><Droplet size={14} /></button>
                            </div>
                            <div className="toolbar-separator" />
                            <button className="action-btn" onClick={handleScreenshot} data-tooltip={t.takeScreenshot || 'Take Screenshot'} style={{ color: screenshotSuccess ? '#46d369' : 'var(--text-primary)', border: 'none', background: 'transparent' }}>
                                <Camera size={14} />
                            </button>
                            <div className="toolbar-separator" />
                            <div className="btn-group" style={{ overflow: 'visible' }}>
                                <button className="action-btn" onClick={() => addTrack('video')} data-tooltip={t.addVideoTrack || 'Add Video Track'} data-tooltip-pos="bottom" style={{ color: '#e50914' }}><Plus size={14} /> <span style={{ fontSize: '0.7rem' }}>{t.videoLayer || 'Video Layer'}</span></button>
                                <button className="action-btn" onClick={() => addTrack('audio')} data-tooltip={t.addAudioTrack || 'Add Audio Track'} data-tooltip-pos="bottom" style={{ color: '#46d369' }}><Plus size={14} /> <span style={{ fontSize: '0.7rem' }}>{t.audioLayer || 'Audio Layer'}</span></button>
                            </div>
                            <div style={{ flex: 1, textAlign: 'center', fontSize: '0.85rem', color: 'var(--text-secondary)', fontFamily: 'monospace' }}>
                                {formatTime(currentTime)} / {formatTime(contentDuration)}
                            </div>

                            <div style={{ display: 'flex', alignItems: 'center', gap: 10, background: 'var(--bg-primary)', padding: '2px 10px', borderRadius: 15, border: '1px solid var(--border-color)' }}>
                                <Search size={14} style={{ opacity: 0.5 }} />
                                <input type="range" min="5" max="200" value={zoomLevel} onChange={e => setZoomLevel(parseInt(e.target.value))} style={{ width: 80, height: 4 }} />
                            </div>
                        </div>

                        <div className="timeline-tracks"
                            onMouseDown={handleTimelineClick}
                            ref={timelineRef}
                            onScroll={(e) => {
                                setTimelineScroll(e.target.scrollLeft);
                            }}
                            style={{ flex: 1, overflowX: 'auto', overflowY: 'auto', position: 'relative', background: 'var(--bg-primary)', cursor: 'crosshair' }}>

                            <div className="timeline-content" style={{
                                position: 'relative',
                                width: Math.max(2000, (timelineDuration * zoomLevel) + 2000),
                                minHeight: '100%',
                                minWidth: '100%',
                                display: 'flex',
                                flexDirection: 'column',
                                background: 'var(--bg-primary)'
                            }}>
                                {/* Time Ruler */}
                                <div
                                    onMouseDown={handleTimelineClick}
                                    style={{
                                        height: 28,
                                        position: 'sticky',
                                        top: 0,
                                        left: 0,
                                        zIndex: 1000,
                                        background: 'var(--bg-secondary)',
                                        borderBottom: '2px solid var(--border-color)',
                                        display: 'flex',
                                        cursor: 'pointer'
                                    }}>
                                    <div style={{ width: 80, flexShrink: 0, background: 'var(--bg-card)', borderRight: '2px solid var(--border-color)', position: 'sticky', left: 0, zIndex: 1001 }} />
                                    <div style={{ position: 'relative', flex: 1, height: '100%', background: 'var(--bg-secondary)' }}>
                                        {Array.from({ length: Math.max(1, Math.ceil((isFinite(timelineDuration) ? timelineDuration : 600) / 5) + 2) }).map((_, i) => (
                                            <div key={i} style={{ position: 'absolute', left: (i * 5) * (isFinite(zoomLevel) ? zoomLevel : 25), borderLeft: '1px solid #444', height: i % 2 === 0 ? 15 : 8, paddingLeft: 3 }}>
                                                {i % 2 === 0 && <span style={{ fontSize: '0.6rem', color: '#888' }}>{formatTime(i * 5)}</span>}
                                            </div>
                                        ))}
                                    </div>
                                </div>
                                {/* Sol Sütun Koruma Katmanı (Yükseklik dinamik: tracks.length * 45) */}
                                <div style={{ position: 'sticky', left: 0, width: 80, height: 0, zIndex: 925, pointerEvents: 'none', overflow: 'visible' }}>
                                    <div style={{ width: 80, height: tracks.length * 35, background: 'var(--bg-secondary)', borderRight: '2px solid var(--border-color)' }} />
                                </div>
                                {tracks.map((track, idx) => (
                                    <div key={track.id} className={`timeline-track-row track-type-${track.type}`} style={{ display: 'grid', gridTemplateColumns: '80px 1fr', gap: 0, marginBottom: 0, minHeight: 45, borderBottom: '1px solid var(--border-color)', background: 'var(--bg-primary)', position: 'relative' }}>
                                        <div
                                            className={`track-header ${dragTrackIndex === idx ? 'dragging' : ''}`}
                                            draggable
                                            onDragStart={() => handleDragStart(idx)}
                                            onDragOver={(e) => handleDragOver(e, idx)}
                                            onDragEnd={handleDrop}
                                            onMouseDown={(e) => e.stopPropagation()} // Timeline click'i engeller
                                            style={{ color: 'var(--text-primary)', fontSize: '0.7rem', display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: 'var(--bg-card)', borderRight: '2px solid var(--border-color)', borderBottom: '1px solid var(--border-color)', position: 'sticky', left: 0, zIndex: 950, padding: '0 5px', cursor: 'grab', height: '100%', boxSizing: 'border-box' }}
                                        >
                                            <div style={{ display: 'flex', alignItems: 'center', gap: 4, pointerEvents: 'none' }}>
                                                {track.type === 'video' ? <VideoIcon size={12} color="#e50914" /> : <Volume2 size={12} color="#46d369" />}
                                                <span style={{ fontWeight: 'bold' }}>{track.id.toUpperCase()}</span>
                                            </div>
                                            <div style={{ display: 'flex', gap: 0 }}>
                                                <button onClick={(e) => { e.stopPropagation(); setPickerTarget({ trackId: track.id }); fetchPickerItems(pickerPath); }} style={{ background: 'none', border: 'none', color: '#46d369', cursor: 'pointer', padding: 2 }} data-tooltip={t.addMedia || 'Add Media'} data-tooltip-pos="right"><Plus size={14} /></button>
                                                {track.id !== 'v1' && track.id !== 'a1' && (
                                                    <button onClick={(e) => { e.stopPropagation(); removeTrack(track.id); }} style={{ background: 'none', border: 'none', color: '#e50914', cursor: 'pointer', padding: 2 }} data-tooltip={t.deleteTrack || 'Delete Track'} data-tooltip-pos="right"><Trash size={14} /></button>
                                                )}
                                            </div>
                                        </div>
                                        <div
                                            style={{ position: 'relative', background: 'var(--bg-primary)' }}
                                            onMouseEnter={() => {
                                                if (isDragging?.type === 'clip') {
                                                    moveClipToTrack(isDragging.id, track.id);
                                                }
                                            }}
                                        >
                                            {track.clips.map(clip => {
                                                const isAudio = track.type === 'audio';
                                                const isVideo = track.type === 'video';

                                                // PROFESSIONAL TEMPORAL CHUNKING - Reduced to 1s for better precision
                                                const SECONDS_PER_CHUNK = 1;
                                                const numChunks = Math.max(1, Math.ceil(clip.duration / SECONDS_PER_CHUNK));

                                                const thumbHeight = 68; // Increased from 45 for better quality
                                                const thumbWidth = 120; // Increased from 80 for better quality

                                                return (
                                                    <div
                                                        key={clip.id}
                                                        className={`clip-item ${clip.id === selectedClipId ? 'selected' : ''}`}
                                                        onClick={(e) => { e.stopPropagation(); setSelectedClipId(clip.id); }}
                                                        onMouseDown={(e) => {
                                                            e.stopPropagation();
                                                            setSelectedClipId(clip.id);

                                                            // Update Playhead position on clip click
                                                            if (timelineRef.current) {
                                                                const rect = timelineRef.current.getBoundingClientRect();
                                                                const clickX = (e.clientX - rect.left) + timelineRef.current.scrollLeft - 80;
                                                                const newTime = Math.max(0, clickX / zoomLevel);
                                                                setCurrentTime(newTime);
                                                                if (videoRef.current) videoRef.current.currentTime = newTime;
                                                            }

                                                            setIsDragging({
                                                                type: 'clip',
                                                                id: clip.id,
                                                                startX: e.clientX,
                                                                startOffset: clip.offset
                                                            });
                                                        }}
                                                        style={{
                                                            position: 'absolute',
                                                            left: (clip.offset || 0) * zoomLevel,
                                                            width: Math.max(1, (isFinite(clip.duration) ? clip.duration : 0.1) * zoomLevel),
                                                            height: '100%',
                                                            cursor: isDragging?.id === clip.id ? 'grabbing' : 'grab',
                                                            zIndex: isDragging?.id === clip.id ? 150 : 100,
                                                            pointerEvents: isDragging?.id === clip.id ? 'none' : 'auto',
                                                            userSelect: 'none',
                                                            transition: isDragging ? 'none' : 'left 0.1s, width 0.1s',
                                                            boxSizing: 'border-box',
                                                            overflow: 'hidden'
                                                        }}
                                                    >
                                                        {/* Visual Content */}
                                                        {isVideo && clip.type === 'video' && (
                                                            <div className="clip-thumbnails" style={{ display: 'flex', width: '100%', height: '100%', position: 'absolute', top: 0, left: 0 }}>
                                                                {Array.from({ length: numChunks }).map((_, i) => {
                                                                    const chunkStart = clip.start + (i * SECONDS_PER_CHUNK);
                                                                    const chunkDuration = Math.min(SECONDS_PER_CHUNK, clip.duration - (i * SECONDS_PER_CHUNK));

                                                                    const clipLeft = (clip.offset || 0) * zoomLevel;
                                                                    const chunkLeft = clipLeft + (i * SECONDS_PER_CHUNK * zoomLevel);
                                                                    const chunkWidth = chunkDuration * zoomLevel;

                                                                    // Simple Visibility Check
                                                                    const viewportWidth = timelineRef.current?.clientWidth || 2000;
                                                                    const isVisible = (chunkLeft + chunkWidth > timelineScroll - 500) &&
                                                                        (chunkLeft < timelineScroll + viewportWidth + 500);

                                                                    if (!isVisible) return <div key={i} style={{ flex: `0 0 ${chunkWidth}px`, width: chunkWidth, height: '100%' }} />;

                                                                    // Client-side thumbnail generation
                                                                    return (
                                                                        <div
                                                                            key={i}
                                                                            style={{
                                                                                flex: `0 0 ${chunkWidth}px`,
                                                                                width: chunkWidth,
                                                                                height: '100%',
                                                                                overflow: 'hidden'
                                                                            }}
                                                                        >
                                                                            <VideoThumbnailCanvas
                                                                                videoPath={clip.path}
                                                                                startTime={chunkStart}
                                                                                width={thumbWidth}
                                                                                height={thumbHeight}
                                                                            />
                                                                        </div>
                                                                    );
                                                                })}
                                                            </div>
                                                        )}

                                                        {isAudio && (
                                                            <div className="clip-waveform" style={{ display: 'flex', width: '100%', height: '100%', position: 'absolute', top: 0, left: 0 }}>
                                                                {!audioBuffers[clip.path] ? (
                                                                    // Loading state - show shimmer effect
                                                                    Array.from({ length: numChunks }).map((_, i) => {
                                                                        const chunkStart = clip.start + (i * SECONDS_PER_CHUNK);
                                                                        const chunkDuration = Math.min(SECONDS_PER_CHUNK, clip.duration - (i * SECONDS_PER_CHUNK));
                                                                        const chunkWidth = chunkDuration * zoomLevel;
                                                                        return (
                                                                            <div
                                                                                key={i}
                                                                                style={{
                                                                                    flex: `0 0 ${chunkWidth}px`,
                                                                                    width: chunkWidth,
                                                                                    height: '100%',
                                                                                    background: 'linear-gradient(90deg, rgba(70,211,105,0.1) 0%, rgba(70,211,105,0.3) 50%, rgba(70,211,105,0.1) 100%)',
                                                                                    backgroundSize: '200% 100%',
                                                                                    animation: 'shimmer 1.5s infinite',
                                                                                    display: 'flex',
                                                                                    alignItems: 'center',
                                                                                    justifyContent: 'center'
                                                                                }}
                                                                            >
                                                                                <span style={{ fontSize: '0.6rem', color: 'rgba(70,211,105,0.6)', opacity: 0.8 }}>
                                                                                    {i === 0 ? '♪' : ''}
                                                                                </span>
                                                                            </div>
                                                                        );
                                                                    })
                                                                ) : (
                                                                    Array.from({ length: numChunks }).map((_, i) => {
                                                                        const chunkStart = clip.start + (i * SECONDS_PER_CHUNK);
                                                                        const chunkDuration = Math.min(SECONDS_PER_CHUNK, clip.duration - (i * SECONDS_PER_CHUNK));
                                                                        const clipLeft = (clip.offset || 0) * zoomLevel;
                                                                        const chunkLeft = clipLeft + (i * SECONDS_PER_CHUNK * zoomLevel);
                                                                        const chunkWidth = chunkDuration * zoomLevel;

                                                                        // Visibility check
                                                                        const viewportWidth = timelineRef.current?.clientWidth || 2000;
                                                                        const isVisible = (chunkLeft + chunkWidth > timelineScroll - 500) &&
                                                                            (chunkLeft < timelineScroll + viewportWidth + 500);

                                                                        if (!isVisible) return <div key={i} style={{ flex: `0 0 ${chunkWidth}px`, width: chunkWidth, height: '100%' }} />;

                                                                        return (
                                                                            <div key={i} style={{ flex: `0 0 ${chunkWidth}px`, width: chunkWidth, height: '100%' }}>
                                                                                <AudioWaveformCanvas
                                                                                    buffer={audioBuffers[clip.path]}
                                                                                    startTime={chunkStart} // Determine offset in original file
                                                                                    duration={chunkDuration}
                                                                                    width={Math.ceil(chunkWidth)}
                                                                                    height={45}
                                                                                    color="#00ff00"
                                                                                />
                                                                            </div>
                                                                        );
                                                                    }))}
                                                            </div>
                                                        )}

                                                        <div className="clip-header">
                                                            <span>{clip.name}</span>
                                                        </div>

                                                        <div className="clip-info-tag">
                                                            {clip.duration.toFixed(1)}s
                                                            {(clip.sourceDuration && Math.abs(clip.sourceDuration - clip.duration) > 0.05) && (
                                                                <span style={{ color: '#ffc107', marginLeft: 5 }}>
                                                                    {(clip.sourceDuration / clip.duration).toFixed(2)}x
                                                                </span>
                                                            )}
                                                        </div>

                                                        {/* Resize Handles */}
                                                        <div
                                                            onMouseDown={(e) => {
                                                                e.stopPropagation();
                                                                setIsDragging({ type: 'resize-edge', side: 'left', startX: e.clientX, startOffset: clip.offset, startDuration: clip.duration, startIn: clip.start });
                                                            }}
                                                            style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: 8, cursor: 'ew-resize', zIndex: 20 }}
                                                        />
                                                        <div
                                                            onMouseDown={(e) => {
                                                                e.stopPropagation();
                                                                setIsDragging({ type: 'resize-edge', side: 'right', startX: e.clientX, startDuration: clip.duration });
                                                            }}
                                                            style={{ position: 'absolute', right: 0, top: 0, bottom: 0, width: 8, cursor: 'ew-resize', zIndex: 20 }}
                                                        />
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    </div>
                                ))}

                                <div
                                    onMouseDown={(e) => { e.preventDefault(); e.stopPropagation(); setIsDragging({ type: 'playhead' }); }}
                                    style={{
                                        position: 'absolute',
                                        top: 28, // Ruler (28px) hemen bitiminden başlasın
                                        bottom: 0,
                                        left: 80 + (currentTime * zoomLevel) - 1,
                                        width: 12,
                                        marginLeft: -5,
                                        zIndex: 900, // Header (950) ve Ruler (1000) altında kalmalı
                                        cursor: 'ew-resize',
                                        pointerEvents: 'auto'
                                    }}>
                                    <div style={{ position: 'absolute', top: 0, bottom: 0, left: 5, width: 2, background: '#e50914' }} />
                                    <div style={{ position: 'absolute', top: 0, left: 0, width: 12, height: 12, background: '#e50914', borderRadius: '0 0 50% 50%' }} />
                                </div>
                            </div>
                        </div>
                    </div>
                </div>

                {/* Help Modal */}
                {showHelp && (
                    <div className="modal-overlay" style={{ zIndex: 9000 }} onClick={() => setShowHelp(false)}>
                        <div className="modal" style={{ maxWidth: 500, background: '#1a1a1a', border: '1px solid #333' }} onClick={e => e.stopPropagation()}>
                            <div className="modal-header" style={{ borderBottom: '1px solid #333', paddingBottom: 10, marginBottom: 15 }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                                    <Info size={20} color="var(--netflix-red)" />
                                    <h3 style={{ margin: 0 }}>{t.shortcutsTitle || 'Keyboard & Mouse Shortcuts'}</h3>
                                </div>
                                <button onClick={() => setShowHelp(false)} style={{ background: 'none', border: 'none', color: '#fff', cursor: 'pointer' }}><X size={20} /></button>
                            </div>
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>
                                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                                    <h4 style={{ margin: '0 0 5px 0', color: 'var(--netflix-red)', fontSize: '0.85rem', textTransform: 'uppercase', letterSpacing: '1px' }}>{t.helpTitleShortcuts || 'Shortcuts'}</h4>
                                    {[
                                        'scUndo', 'scRedo',
                                        'scMove', 'scPrecisionMove', 'scZoom', 'scPrecisionZoom',
                                        'scHorizontalScroll', 'scVerticalScroll', 'scSplit', 'scDelete',
                                        'scPack', 'scPlayPause', 'scEscape', 'scHome', 'scEnd',
                                        'scStepForward', 'scStepBackward', 'scPreciseForward', 'scPreciseBackward'
                                    ].map(key => (
                                        <div key={key} className="shortcut-item" style={{ fontSize: '0.85rem', color: '#eee', display: 'flex', alignItems: 'flex-start', gap: 8 }}>
                                            <div style={{ minWidth: 15, color: 'var(--netflix-red)' }}>•</div>
                                            <div dangerouslySetInnerHTML={{ __html: (t[key] || key).replace(/:\s*/, ': <span style="color:#aaa">') + '</span>' }} />
                                        </div>
                                    ))}
                                </div>
                                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                                    <h4 style={{ margin: '0 0 5px 0', color: 'var(--netflix-red)', fontSize: '0.85rem', textTransform: 'uppercase', letterSpacing: '1px' }}>{t.helpTitleFunctions || 'Functions'}</h4>
                                    {[
                                        'helpRotate', 'helpFlipH', 'helpFlipV', 'helpResetTransform',
                                        'helpCenter', 'helpResetPosition', 'helpAspectRatio', 'helpScreenshot'
                                    ].map(key => (
                                        <div key={key} className="shortcut-item" style={{ fontSize: '0.85rem', color: '#eee', display: 'flex', alignItems: 'flex-start', gap: 8 }}>
                                            <div style={{ minWidth: 15, color: 'var(--netflix-red)' }}>•</div>
                                            <div dangerouslySetInnerHTML={{ __html: (t[key] || key).replace(/:\s*/, ': <span style="color:#aaa">') + '</span>' }} />
                                        </div>
                                    ))}
                                </div>
                            </div>
                        </div>
                    </div>
                )}

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
                                        autoFocus
                                        value={saveAsName}
                                        onChange={e => setSaveAsName(e.target.value)}
                                        onFocus={e => e.target.select()}
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
                                        <option value="mp3">MP3</option>
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

                {/* Overwrite Confirmation Modal */}
                {showOverwriteConfirm && (
                    <div className="modal-overlay" style={{ zIndex: 8500 }}>
                        <div className="modal" style={{ maxWidth: 450 }}>
                            <div className="modal-header" style={{ marginBottom: 15 }}>
                                <h3 style={{ margin: 0, color: 'var(--netflix-red)' }}>{t.fileExistsTitle || 'File Already Exists'}</h3>
                            </div>
                            <div className="modal-content" style={{ padding: '20px 0' }}>
                                <p style={{ fontSize: '1rem', lineHeight: 1.6, color: '#ddd' }}>
                                    {(t.fileExistsMessage || "The file '{fileName}' already exists. Do you want to overwrite it?")
                                        .replace('{fileName}', pendingSaveOptions?.newName || item?.name)}
                                </p>
                            </div>
                            <div className="modal-footer" style={{ marginTop: 20, display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
                                <button className="btn btn-grey" onClick={() => {
                                    setShowOverwriteConfirm(false);
                                    setPendingSaveOptions(null);
                                    setShowSaveAs(true); // Go back to Save As
                                }}>
                                    {t.noGoBack || 'No, Go Back'}
                                </button>
                                <button className="btn btn-primary" onClick={() => {
                                    setShowOverwriteConfirm(false);
                                    handleSave({ ...pendingSaveOptions, overwrite: true });
                                    setPendingSaveOptions(null);
                                }}>
                                    {t.yesOverwriteFile || 'Yes, Overwrite'}
                                </button>
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
                                    {filteredPickerItems.map(pi => (
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
                                                            e.target.parentNode.innerHTML = pi.type?.startsWith('image/') ? '<div class="type-icon"><svg viewBox="0 0 24 24" width="30" height="30" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect><circle cx="8.5" cy="8.5" r="1.5"></circle><polyline points="21 15 16 10 5 21"></polyline></svg></div>' : (pi.type?.startsWith('audio/') ? '<div class="type-icon"><svg viewBox="0 0 24 24" width="30" height="30" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round"><path d="M9 18V5l12-2v13"></path><circle cx="6" cy="18" r="3"></circle><circle cx="18" cy="16" r="3"></circle></svg></div>' : '<div class="type-icon"><svg viewBox="0 0 24 24" width="30" height="30" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round"><polygon points="23 7 16 12 23 17 23 7"></polygon><rect x="1" y="5" width="15" height="14" rx="2" ry="2"></rect></svg></div>');
                                                        }}
                                                    />
                                                )}
                                            </div>
                                            <div className="item-footer" style={(pi.isDirectory || pi.type === 'folder') ? { justifyContent: 'center', textAlign: 'center' } : {}}>
                                                {(!pi.isDirectory && pi.type !== 'folder') && (pi.type?.startsWith('image/') ? <ImageIcon size={12} color="#0071eb" /> : (pi.type?.startsWith('audio/') ? <Volume2 size={12} color="#46d369" /> : <VideoIcon size={12} color="#46d369" />))}
                                                <span data-tooltip={pi.name} style={(pi.isDirectory || pi.type === 'folder') ? { textAlign: 'center' } : {}}>{pi.name}</span>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        </div>
                    </div>
                )
            }

            {/* Processing Overlay */}
            {
                isProcessing && (
                    <div className="processing-overlay">
                        <div className="processing-card">
                            <div className="processing-spinner"></div>
                            <div className="processing-title">{(t.saving || 'Kaydediliyor...')}</div>
                            <div className="progress-container">
                                <div className="progress-bar" style={{ width: `${processingProgress}%` }}></div>
                            </div>
                            <div className="progress-percent">%{Math.round(processingProgress)}</div>
                            <button className="btn btn-grey" onClick={(e) => { e.stopPropagation(); handleCancelProcessing(); }} style={{ marginTop: 10, padding: '8px 24px' }}>
                                {t.cancel || 'İptal Et'}
                            </button>
                        </div>
                    </div>
                )
            }
        </div >
    );
};



const FolderNode = ({ name, path, hasSubfolders, level = 0, onSelect, selectedPath, expandedFolders, toggleExpand, t }) => {
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
                <div onClick={(e) => { e.stopPropagation(); if (hasSubfolders) toggleExpand(path); }} style={{ display: 'flex', alignItems: 'center', marginRight: 5, visibility: hasSubfolders ? 'visible' : 'hidden', width: 14 }}>
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
                            hasSubfolders={child.hasSubfolders}
                            level={level + 1}
                            onSelect={onSelect}
                            selectedPath={selectedPath}
                            expandedFolders={expandedFolders}
                            toggleExpand={toggleExpand}
                            t={t}
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
    const [playbackRate, setPlaybackRate] = useState(1);
    const [autoPlaySlides, setAutoPlaySlides] = useState(false);
    const [slideDuration, setSlideDuration] = useState(5);
    const [videoLoop, setVideoLoop] = useState(false);
    const [slideLoop, setSlideLoop] = useState(false);
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
    const [editModalError, setEditModalError] = useState('');

    // Taşıma State'i
    const [moveModal, setMoveModal] = useState(null); // Taşınacak dosya
    const [targetFolder, setTargetFolder] = useState(null); // Hedef klasör path
    const [expandedFolders, setExpandedFolders] = useState({}); // Klasör ağacı genişletme durumu
    const [rootFolders, setRootFolders] = useState([]);
    const [moveConflict, setMoveConflict] = useState(false); // Çakışma durumu

    const [newFolderModal, setNewFolderModal] = useState(false);
    const [newFolderName, setNewFolderName] = useState('');
    const [newFolderError, setNewFolderError] = useState('');

    // Batch Selection State
    const [selectedPaths, setSelectedPaths] = useState(new Set());
    const [lastSelectedPath, setLastSelectedPath] = useState(null); // Shift+Click için
    const [lastActivePath, setLastActivePath] = useState(null); // Geri dönüldüğünde hatırlanacak item
    const itemRefs = useRef({});


    // Settings State
    const [settingsModal, setSettingsModal] = useState(false);
    const [settingsData, setSettingsData] = useState({
        galleryPath: '',
        browserPath: 'default',
        autoPlay: false,
        language: 'en',
        theme: 'system',
        autoPlaySlides: false,
        slideDuration: 5,
        videoLoop: false,
        slideLoop: false
    });
    const [theme, setTheme] = useState('system');
    const [toast, setToast] = useState(null); // { message: string, type: 'success' | 'error' }
    const [showEditor, setShowEditor] = useState(false);
    const [showVideoEditor, setShowVideoEditor] = useState(false);
    const [editVideoItem, setEditVideoItem] = useState(null); // Standalone edit item
    const [editImageItem, setEditImageItem] = useState(null); // Standalone edit item
    const [refreshKey, setRefreshKey] = useState(Date.now());

    // YouTube Download State
    const [ytModal, setYtModal] = useState(false);
    const [ytUrl, setYtUrl] = useState('');
    const [ytInfo, setYtInfo] = useState(null); // { type, title, uploader, entries: [] }
    const [ytLoading, setYtLoading] = useState(false);
    const [ytSelectedUrls, setYtSelectedUrls] = useState(new Set());
    const [ytDownloads, setYtDownloads] = useState([]); // Array of { id, title, percent, status }
    const [ytMinimized, setYtMinimized] = useState(true);
    const [ytAsAudio, setYtAsAudio] = useState(false);

    // YouTube Fetch Info Handler
    const handleYtFetchInfo = async () => {
        if (!ytUrl) return;
        setYtLoading(true);
        setYtInfo(null);
        try {
            const res = await fetch(`/api/yt/info?url=${encodeURIComponent(ytUrl)}`);
            const data = await res.json();
            if (data.error) {
                alert(t.errorYouTube || data.error);
            } else {
                setYtInfo(data);
                if (data.type === 'video') {
                    setYtSelectedUrls(new Set([data.url]));
                } else if (data.entries) {
                    // Filter out deleted videos
                    const validEntries = data.entries.filter(e =>
                        e.title && !e.title.toLowerCase().includes('[deleted video]')
                    );

                    // Update data entries to only include valid ones
                    data.entries = validEntries;
                    setYtInfo(data);

                    // Auto-select non-private videos
                    const initialSelected = validEntries
                        .filter(e => e.title && !e.title.toLowerCase().includes('[private video]'))
                        .map(e => e.url);

                    setYtSelectedUrls(new Set(initialSelected));
                }
            }
        } catch (e) {
            alert(t.errorYouTube || "Error");
        } finally {
            setYtLoading(false);
        }
    };

    // YouTube Download Handler
    const handleYtDownload = () => {
        if (!ytInfo || ytSelectedUrls.size === 0) return;

        const selectedVideos = ytInfo.type === 'video'
            ? [ytInfo]
            : ytInfo.entries.filter(e => ytSelectedUrls.has(e.url));

        const queryParams = new URLSearchParams({
            videos: JSON.stringify(selectedVideos),
            currentPath: currentPath,
            asAudio: ytAsAudio
        });

        const eventSource = new EventSource(`/api/yt/download-stream?${queryParams.toString()}`);

        eventSource.onmessage = (event) => {
            const data = JSON.parse(event.data);

            if (data.type === 'started') {
                const initialJobs = selectedVideos.map((v, idx) => ({
                    id: `${data.processId}_${idx}`,
                    title: v.title,
                    percent: 0,
                    status: 'waiting',
                    processId: data.processId
                }));
                setYtDownloads(prev => [...prev, ...initialJobs]);
                setYtModal(false);
                setYtUrl('');
                setYtInfo(null);
                setYtAsAudio(false);
            } else if (data.type === 'video_start') {
                setYtDownloads(prev => prev.map(job =>
                    job.id === `${data.processId}_${data.index}`
                        ? { ...job, status: 'downloading' }
                        : job
                ));
            } else if (data.type === 'progress') {
                setYtDownloads(prev => prev.map(job =>
                    job.id === `${data.processId}_${data.index}`
                        ? { ...job, percent: data.percent, status: 'downloading' }
                        : job
                ));
            } else if (data.type === 'video_success') {
                setYtDownloads(prev => prev.map(job =>
                    job.id === `${data.processId}_${data.index}`
                        ? { ...job, percent: 100, status: 'completed' }
                        : job
                ));
                fetchItems(currentPath); // Refresh to see the folder/video
            } else if (data.type === 'video_error') {
                setYtDownloads(prev => prev.map(job =>
                    job.id === `${data.processId}_${data.index}`
                        ? { ...job, status: 'error', errorMsg: data.error }
                        : job
                ));
            } else if (data.type === 'all_success' || data.type === 'error') {
                eventSource.close();
                if (data.type === 'all_success') {
                    // Only clear if no errors occurred
                    setYtDownloads(prev => {
                        const hasError = prev.some(j => j.processId === data.processId && j.status === 'error');
                        if (!hasError) {
                            setTimeout(() => {
                                setYtDownloads(current => current.filter(j => j.processId !== data.processId));
                            }, 5000);
                        }
                        return prev;
                    });
                }
            }
        };

        eventSource.onerror = () => {
            eventSource.close();
        };
    };

    const cancelYtDownload = async (processId) => {
        try {
            await fetch('/api/yt/cancel', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ processId })
            });
            setYtDownloads(prev => prev.filter(job => job.processId !== processId));
        } catch (e) { }
    };

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

    // Zoom ve Pan State (Atomic state to prevent drift)
    const [zoom, setZoom] = useState({ s: 1, x: 0, y: 0 });
    const [zoomMode, setZoomMode] = useState(false);
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
            setAutoPlaySlides(!!data.autoPlaySlides);
            setSlideDuration(data.slideDuration || 5);
            setVideoLoop(!!data.videoLoop);
            setSlideLoop(!!data.slideLoop);
        }).catch(() => { });

        const handleScroll = () => {
            setScrolled(window.scrollY > 50);
            if ((window.innerHeight + window.scrollY) >= document.body.offsetHeight - 500) {
                setVisibleCount(prev => prev + 20);
            }
        };

        // Global block for browser zoom (Ctrl+Wheel) across the whole app
        const handleGlobalWheel = (e) => {
            if (e.ctrlKey) {
                e.preventDefault();
            }
        };

        window.addEventListener('scroll', handleScroll);
        window.addEventListener('wheel', handleGlobalWheel, { passive: false });
        return () => {
            window.removeEventListener('scroll', handleScroll);
            window.removeEventListener('wheel', handleGlobalWheel);
        };
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
                if (showEditor) {
                    const item = editImageItem || selectedMedia;
                    if (item) setLastActivePath(item.path);
                    setShowEditor(false);
                    setEditImageItem(null);
                }
                else if (showVideoEditor) {
                    const item = editVideoItem || selectedMedia;
                    if (item) setLastActivePath(item.path);
                    setShowVideoEditor(false);
                    setEditVideoItem(null);
                    setSelectedMediaIndex(-1);
                }
                else if (moveModal) closeMoveModal();
                else if (editModal) closeEditModal();
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
            setAutoPlaySlides(!!data.autoPlaySlides);
            setSlideDuration(data.slideDuration || 5);
            setVideoLoop(!!data.videoLoop);
            setSlideLoop(!!data.slideLoop);
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
                const deletedSet = new Set(data.deleted || paths); // Fallback to all paths if data.deleted is missing
                const newItems = items.filter(i => !deletedSet.has(i.path));
                setItems(newItems);
                setSelectedPaths(new Set());
                setConfirmDelete(null);

                // Refresh list from server to ensure sync
                fetchItems(currentPath);

                if (data.failed && data.failed.length > 0) {
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

    const executeBatchMove = async (overwrite = false, autoRename = false) => {
        if (!moveModal || !targetFolder) return;
        try {
            const paths = Array.from(selectedPaths);
            const res = await fetch('/api/batch-move', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ sourcePaths: paths, destFolderPath: targetFolder, overwrite, autoRename })
            });
            const data = await res.json();

            if (data.success) {
                if (data.conflicts && data.conflicts.length > 0 && !overwrite && !autoRename) {
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
                setAutoPlaySlides(settingsData.autoPlaySlides);
                setSlideDuration(settingsData.slideDuration);
                setVideoLoop(settingsData.videoLoop);
                setSlideLoop(settingsData.slideLoop);
                setSettingsModal(false);
                setToast(t.restartRequired || 'Restart required for some changes');
                setTimeout(() => setToast(null), 3000);
            }
        } catch (e) {
            setToast('Error saving settings');
            setTimeout(() => setToast(null), 3000);
        }
    };

    const [isCleaning, setIsCleaning] = useState(false);
    const handleCleanup = async () => {
        setIsCleaning(true);
        try {
            const res = await fetch('/api/admin/cleanup-thumbs', { method: 'POST' });
            const data = await res.json();
            if (data.success) {
                setToast((t.cleanupSuccess || 'Cleanup complete! Removed {n} items.').replace('{n}', data.deletedCount));
                setTimeout(() => {
                    setToast(null);
                    fetchItems(currentPath);
                }, 4000);
            }
        } catch (e) {
            setToast('Cleanup failed');
            setTimeout(() => setToast(null), 3000);
        } finally {
            setIsCleaning(false);
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

    const closeEditModal = () => {
        if (editModal) setLastActivePath(editModal.path);
        setEditModal(null);
        setEditModalError('');
    };

    const closeMoveModal = () => {
        if (moveModal) setLastActivePath(moveModal.path);
        setMoveModal(null);
        setMoveConflict(false);
    };

    const handleMoveItem = async (overwrite = false, autoRename = false) => {
        if (!moveModal || !targetFolder) return;

        if (moveModal.batch) {
            await executeBatchMove(overwrite, autoRename);
            return;
        }

        try {
            const res = await fetch('/api/move', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ sourcePath: moveModal.path, destFolderPath: targetFolder, overwrite, autoRename })
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
                if (data.newPath) {
                    setLastActivePath(data.newPath);
                } else {
                    setLastActivePath(movedPath);
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

        // Hiding extension in UI but keeping it for backend
        if (item.type !== 'folder') {
            const lastDot = item.name.lastIndexOf('.');
            if (lastDot !== -1) {
                setEditName(item.name.substring(0, lastDot));
            } else {
                setEditName(item.name);
            }
        } else {
            setEditName(item.name);
        }
        setEditModalError('');
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
        setEditModalError('');

        // Re-append extension if it's a file
        let finalName = editName.trim();
        if (editModal.type !== 'folder') {
            const lastDot = editModal.name.lastIndexOf('.');
            if (lastDot !== -1) {
                const ext = editModal.name.substring(lastDot);
                if (!finalName.endsWith(ext)) {
                    finalName += ext;
                }
            }
        }

        try {
            const res = await fetch('/api/update', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ oldPath: editModal.path, newName: finalName, info: editInfo })
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
                setLastActivePath(data.newPath || oldPath);
                setEditModal(null);
                setEditModalError('');
            } else {
                setEditModalError(data.error || 'Update failed');
            }
        } catch (e) {
            setEditModalError('Error updating file');
        }
    };

    const toggleFolderExpand = (path) => {
        setExpandedFolders(prev => ({ ...prev, [path]: !prev[path] }));
    };

    const handleCreateFolder = async () => {
        if (!newFolderName.trim()) return;
        setNewFolderError('');
        try {
            const res = await fetch('/api/create-folder', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ parentPath: currentPath, folderName: newFolderName.trim() })
            });
            const data = await res.json();
            if (data.success) {
                setNewFolderModal(false);
                setNewFolderName('');
                setNewFolderError('');
                fetchItems(currentPath);
                setToast(t.folderCreated || 'Folder created');
                setTimeout(() => setToast(null), 3000);
            } else {
                setNewFolderError(data.error || 'Failed to create folder');
            }
        } catch (e) {
            setNewFolderError('Error creating folder');
        }
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
                setLastActivePath(currentItem.path);
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
        // This callback is called AFTER VideoEditor's handleSave completes successfully
        // We don't need to call the API again - just update the UI
        try {
            const currentItem = editVideoItem || selectedMedia;
            if (!currentItem) return;

            // Video processing is already done by VideoEditor's handleSave
            // Just update UI and refresh gallery
            setRefreshKey(Date.now());
            setLastActivePath(currentItem.path);
            setShowVideoEditor(false);
            setEditVideoItem(null);
            setSelectedMediaIndex(-1);
            setToast(t.videoSaved || 'Video processed successfully');
            setTimeout(() => {
                setToast(null);
                fetchItems(currentPath);
            }, 3000);
        } catch (e) {
            console.error('Error in handleSaveEditedVideo:', e);
        }
    };

    const handleViewerScreenshot = async (e) => {
        e.stopPropagation();
        if (!selectedMedia || !selectedMedia.type.startsWith('video/') || !videoRef.current) return;

        try {
            const video = videoRef.current;
            const canvas = document.createElement('canvas');
            canvas.width = video.videoWidth;
            canvas.height = video.videoHeight;

            const ctx = canvas.getContext('2d');
            ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

            const dataUrl = canvas.toDataURL('image/jpeg', 0.95);

            let folderPath = ".";
            if (selectedMedia.path) {
                const lastSlash = Math.max(selectedMedia.path.lastIndexOf('/'), selectedMedia.path.lastIndexOf('\\'));
                if (lastSlash !== -1) folderPath = selectedMedia.path.substring(0, lastSlash);
            }

            const res = await fetch('/api/save-screenshot', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ folderPath, imageData: dataUrl })
            });

            const data = await res.json();
            if (data.success) {
                setToast(t.screenshotSaved || 'Screenshot saved!');
                setTimeout(() => {
                    setToast(null);
                    fetchItems(currentPath);
                }, 3000);
            } else {
                alert(data.error);
            }
        } catch (err) {
            console.error(err);
            alert("Screenshot error");
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
        setZoom({ s: 1, x: 0, y: 0 });
        setHasMoved(false);
        setSelectedMediaIndex(-1);
        if (document.fullscreenElement) document.exitFullscreen();
    };

    const navigateMedia = (direction) => {
        let newIndex = selectedMediaIndex + direction;

        if (slideLoop) {
            if (newIndex >= sortedMediaOnly.length) newIndex = 0;
            if (newIndex < 0) newIndex = sortedMediaOnly.length - 1;
        }

        if (newIndex >= 0 && newIndex < sortedMediaOnly.length) {
            if (videoRef.current) { videoRef.current.pause(); videoRef.current.src = ""; }
            setZoomMode(false);
            setZoom({ s: 1, x: 0, y: 0 });
            setHasMoved(false);
            setSelectedMediaIndex(newIndex);
        }
    };

    // Effect to sync playbackRate when video changes or rate changes
    useEffect(() => {
        if (videoRef.current && selectedMedia?.type.startsWith('video/')) {
            videoRef.current.playbackRate = playbackRate;
        }
    }, [playbackRate, selectedMediaIndex]);

    // Auto Play Slides Logic for Images
    useEffect(() => {
        let timer;
        const selectedMedia = selectedMediaIndex !== -1 ? sortedMediaOnly[selectedMediaIndex] : null;

        if (autoPlaySlides && selectedMedia && selectedMedia.type.startsWith('image/') && !showEditor && !showVideoEditor) {
            timer = setTimeout(() => {
                navigateMedia(1);
            }, slideDuration * 1000);
        }

        return () => clearTimeout(timer);
    }, [selectedMediaIndex, autoPlaySlides, slideDuration, showEditor, showVideoEditor, slideLoop]);

    const handleZoomWheel = (e) => {
        e.preventDefault();
        const rect = e.currentTarget.getBoundingClientRect();

        // Mouse coordinate relative to the viewport center (0,0 is center)
        const mx = e.clientX - rect.left - rect.width / 2;
        const my = e.clientY - rect.top - rect.height / 2;

        const zoomStep = 1.25;
        const factor = e.deltaY > 0 ? (1 / zoomStep) : zoomStep;

        setZoom(prev => {
            let nextS = prev.s * factor;

            // Snap limits
            if (nextS <= 1.05) {
                setZoomMode(false);
                return { s: 1, x: 0, y: 0 };
            }
            if (nextS > 40) nextS = 40; // Max 40x zoom

            // NEW OFFSET = MX - (MX - OLD_OFFSET) * (NEXT_S / PREV_S)
            // This is the golden formula for zoom-to-cursor with transform-origin: center
            const nextX = mx - (mx - prev.x) * (nextS / prev.s);
            const nextY = my - (my - prev.y) * (nextS / prev.s);

            setZoomMode(true);
            return { s: nextS, x: nextX, y: nextY };
        });
    };

    const handleMouseDown = (e) => {
        if (zoom.s <= 1 || e.button !== 2) return; // Right click to pan
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
            setZoom(prev => ({
                ...prev,
                x: prev.x + dx,
                y: prev.y + dy
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

                    <div className="navbar-actions" style={{ display: 'flex', alignItems: 'center', gap: 5, marginLeft: 'auto' }}>
                        <button
                            className="settings-btn"
                            data-tooltip={t.youtubeDownload || 'YouTube Download'}
                            data-tooltip-pos="bottom"
                            data-tooltip-align="end"
                            onClick={() => { setYtAsAudio(false); setYtModal(true); }}
                            style={{ background: 'transparent', border: 'none', cursor: 'pointer', padding: 8, display: 'flex', alignItems: 'center' }}
                        >
                            <VideoIcon size={20} color="#aaa" />
                        </button>

                        <button
                            className="settings-btn"
                            data-tooltip={t.settings || 'Settings'}
                            data-tooltip-pos="bottom"
                            data-tooltip-align="end"
                            onClick={() => setSettingsModal(true)}
                            style={{ background: 'transparent', border: 'none', cursor: 'pointer', padding: 8, display: 'flex', alignItems: 'center' }}
                        >
                            <Settings size={20} color="#aaa" />
                        </button>
                    </div>
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

                        {selectedPaths.size > 0 ? (
                            <div className="batch-actions" style={{ display: 'flex', gap: 10 }}>
                                <button className="btn" onClick={handleBatchMove} style={{ padding: '5px 15px', display: 'flex', alignItems: 'center', gap: 5, backgroundColor: '#ff8c00', border: 'none', color: 'white' }}>
                                    <FolderInput size={16} /> {t.move || 'Move'} ({selectedPaths.size})
                                </button>
                                <button className="btn btn-danger" onClick={handleBatchDelete} style={{ padding: '5px 15px', display: 'flex', alignItems: 'center', gap: 5 }}>
                                    <Trash2 size={16} /> {t.delete || 'Delete'} ({selectedPaths.size})
                                </button>
                            </div>
                        ) : (
                            <button className="btn btn-primary" onClick={() => setNewFolderModal(true)} style={{ padding: '5px 15px', display: 'flex', alignItems: 'center', gap: 5 }}>
                                <FolderPlus size={16} /> {t.newFolder || 'New Folder'}
                            </button>
                        )}
                    </div>

                    <div className="media-grid">
                        {!isSearching && currentPath !== '.' && (
                            <div
                                className="media-card is-folder back-card"
                                onClick={() => fetchItems(currentPath.split('/').slice(0, -1).join('/') || '.')}
                                style={{ cursor: 'pointer' }}
                            >
                                <div className="folder-icon" style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100%' }}>
                                    <CornerUpLeft size={48} color="var(--netflix-red)" />
                                </div>
                                <div className="item-footer" style={{ justifyContent: 'center' }}>
                                    <span style={{ fontWeight: 'bold' }}>{t.back || 'Back'}</span>
                                </div>
                            </div>
                        )}
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
                                            {item.type.startsWith('audio/') ? (
                                                <div style={{ width: '100%', height: '100%', display: 'flex', justifyContent: 'center', alignItems: 'center', background: '#1a1a1a' }}>
                                                    <Volume2 size={48} color="#444" />
                                                </div>
                                            ) : (
                                                <img
                                                    src={getThumbUrl(item.path)}
                                                    className="media-thumbnail"
                                                    loading="lazy"
                                                    alt={item.name}
                                                    onError={(e) => { e.target.onerror = null; e.target.src = getMediaUrl(item.path); }}
                                                />
                                            )}
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
                                            {(item.type.startsWith('image/') || item.type.startsWith('video/') || item.type.startsWith('audio/')) && (
                                                <button className="action-btn edit-image-btn" data-tooltip={item.type.startsWith('image/') ? (t.editImage || 'Edit Image') : (item.type.startsWith('audio/') ? (t.editAudio || 'Edit Audio') : (t.editVideo || 'Edit Video'))} onClick={(e) => {
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
                    <div className="modal-overlay" onClick={closeEditModal}>
                        <div className="modal info-modal" onClick={e => e.stopPropagation()}>
                            <div className="modal-header">
                                <h3>{t.editItem || 'Edit Item'}</h3>
                                <button onClick={closeEditModal}><X size={20} /></button>
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
                                        {editModal.name.includes('.') && (
                                            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                                <FileText size={15} color="#0071eb" />
                                                <span style={{ fontWeight: 500 }}>{editModal.name.split('.').pop().toUpperCase()}</span>
                                            </div>
                                        )}
                                        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                            <Tag size={15} color="#aaa" />
                                            <span style={{ fontWeight: 500, fontSize: '0.75rem' }}>{editModal.type}</span>
                                        </div>
                                    </div>
                                )}
                                <label style={{ display: 'block', fontSize: '0.9rem', marginBottom: 5, color: '#aaa' }}>{t.name || 'Name'}</label>
                                <input
                                    type="text"
                                    value={editName}
                                    onChange={(e) => { setEditName(e.target.value); setEditModalError(''); }}
                                    className={`modal-input ${editModalError ? 'input-error' : ''}`}
                                    style={{ marginBottom: editModalError ? 10 : 20 }}
                                />
                                {editModalError && (
                                    <div style={{ color: '#e50914', fontSize: '0.85rem', marginBottom: 20, marginTop: -5, display: 'flex', alignItems: 'center', gap: 5 }}>
                                        <X size={14} /> {editModalError}
                                    </div>
                                )}

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
                    <div className="modal-overlay" style={{ zIndex: 6000 }} onClick={closeMoveModal}>
                        <div className="modal move-modal" onClick={e => e.stopPropagation()} style={{ height: '70vh', display: 'flex', flexDirection: 'column' }}>
                            <div className="modal-header">
                                <h3>{moveModal.batch ? (t.moveItems || 'Move {count} Items').replace('{count}', moveModal.count) : (t.moveItem || 'Move Item')}</h3>
                                <button onClick={() => { setMoveModal(null); setMoveConflict(false); }}><X size={20} /></button>
                            </div>

                            {moveConflict ? (
                                <div className="modal-body" style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', textAlign: 'center' }}>
                                    <FolderInput size={64} color="#e50914" />
                                    <h3 style={{ margin: '20px 0' }}>{t.fileConflict || 'File Conflict!'}</h3>
                                    <p style={{ color: '#aaa', marginBottom: 30 }}>{t.conflictMessage || 'Some files already exist in the destination. What do you want to do?'}</p>
                                    <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', justifyContent: 'center' }}>
                                        <button className="btn btn-primary" onClick={() => handleMoveItem(false, true)}>{t.keepBoth || 'Keep Both (Auto Rename)'}</button>
                                        <button className="btn btn-danger" onClick={() => handleMoveItem(true, false)}>{t.yesOverwrite || 'Yes, Overwrite All'}</button>
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
                                            <FolderNode key={folder.path} name={folder.name} path={folder.path} hasSubfolders={folder.hasSubfolders} onSelect={setTargetFolder} selectedPath={targetFolder} expandedFolders={expandedFolders} toggleExpand={toggleFolderExpand} t={t} />
                                        ))}
                                    </div>
                                    <div className="modal-footer">
                                        <button className="btn btn-primary" disabled={targetFolder === null} onClick={() => handleMoveItem(false)}>
                                            <FolderInput size={16} /> {t.move || 'Move'}
                                        </button>
                                        <button className="btn btn-grey" onClick={closeMoveModal}>{t.cancel}</button>
                                    </div>
                                </>
                            )}
                        </div>
                    </div>
                )
            }

            {
                selectedMedia && !showVideoEditor && !showEditor && (
                    <div className="viewer" onClick={() => resetAndClose()} onContextMenu={(e) => { e.preventDefault(); if (zoomMode && !hasMoved) { setZoomMode(false); setZoom({ s: 1, x: 0, y: 0 }); } }}>
                        <div className="viewer-controls">
                            <div className="viewer-controls-inner">
                                <button className="control-btn" data-tooltip={t.editInfoRename || 'Edit Info & Rename'} data-tooltip-pos="bottom" onClick={(e) => { e.stopPropagation(); openEditModal(selectedMedia); }} style={{ color: '#0071eb' }}>
                                    <Info size={18} />
                                </button>
                                {selectedMedia.type.startsWith('video/') && (
                                    <button className="control-btn" data-tooltip={t.takeScreenshot || 'Take Screenshot'} data-tooltip-pos="bottom" onClick={handleViewerScreenshot} style={{ color: '#fff' }}>
                                        <Camera size={18} />
                                    </button>
                                )}
                                <button className="control-btn" data-tooltip={t.move || 'Move'} data-tooltip-pos="bottom" onClick={(e) => { e.stopPropagation(); setMoveModal(selectedMedia); }} style={{ color: '#ff8c00' }}>
                                    <FolderInput size={18} />
                                </button>
                                <button className="control-btn" data-tooltip={t.delete || 'Delete'} data-tooltip-pos="bottom" onClick={(e) => { e.stopPropagation(); setConfirmDelete(selectedMedia); }} style={{ color: '#e50914' }}>
                                    <Trash2 size={18} />
                                </button>
                                {selectedMedia.type.startsWith('image/') && (
                                    <button className="control-btn" data-tooltip={t.editImage || 'Edit Image'} data-tooltip-pos="bottom" onClick={(e) => {
                                        e.stopPropagation();
                                        setShowEditor(true);
                                    }} style={{ color: '#46d369' }}>
                                        <Scissors size={18} />
                                    </button>
                                )}
                                {selectedMedia.type.startsWith('video/') && (
                                    <button className="control-btn" data-tooltip={t.editVideo || 'Video Editor'} data-tooltip-pos="bottom" onClick={(e) => {
                                        e.stopPropagation();
                                        if (videoRef.current) videoRef.current.pause();
                                        setShowVideoEditor(true);
                                    }} style={{ color: '#46d369' }}>
                                        <Scissors size={18} />
                                    </button>
                                )}
                                <button className="control-btn" data-tooltip={t.close || 'Close'} data-tooltip-pos="bottom" onClick={() => resetAndClose()}><X size={30} /></button>
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
                                    style={{
                                        transform: `translate(${zoom.x}px, ${zoom.y}px) scale(${zoom.s})`,
                                        transformOrigin: 'center',
                                        transition: 'none',
                                        width: '100vw',
                                        height: '100vh',
                                        position: 'absolute',
                                        objectFit: 'contain'
                                    }}
                                    draggable="false"
                                    onClick={(e) => {
                                        e.stopPropagation();
                                    }}
                                />
                            ) : selectedMedia.type.startsWith('audio/') ? (
                                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 30 }}>
                                    <div style={{ width: 200, height: 200, borderRadius: '50%', background: 'rgba(255,255,255,0.05)', display: 'flex', justifyContent: 'center', alignItems: 'center', border: '2px solid rgba(255,255,255,0.1)' }}>
                                        <Volume2 size={80} color="var(--netflix-red)" />
                                    </div>
                                    <h2 style={{ color: '#fff', fontSize: '1.2rem', textAlign: 'center', maxWidth: '80%' }}>{selectedMedia.name}</h2>
                                    <audio
                                        autoPlay={autoPlaySetting}
                                        controls
                                        src={getMediaUrl(selectedMedia.path)}
                                        style={{ width: 400 }}
                                        onEnded={() => autoPlaySlides && navigateMedia(1)}
                                    />
                                </div>
                            ) : (
                                <>
                                    <video
                                        crossOrigin="anonymous"
                                        ref={videoRef}
                                        key={selectedMedia.path}
                                        src={getMediaUrl(selectedMedia.path)}
                                        className={`full-media ${zoomMode ? 'zoomed' : ''}`}
                                        controls={true}
                                        controlsList="nofullscreen nodownload noremoteplayback"
                                        disablePictureInPicture={true}
                                        autoPlay={autoPlaySetting}
                                        style={{
                                            display: (showVideoEditor || showEditor) ? 'none' : 'block',
                                            transform: `translate(${zoom.x}px, ${zoom.y}px) scale(${zoom.s})`,
                                            transformOrigin: 'center',
                                            transition: 'none',
                                            width: '100vw',
                                            height: '100vh',
                                            position: 'absolute',
                                            objectFit: 'contain',
                                            pointerEvents: zoomMode ? 'none' : 'auto'
                                        }}
                                        draggable="false"
                                        onPlay={() => setIsPlaying(true)}
                                        onPause={() => setIsPlaying(false)}
                                        onLoadedMetadata={() => {
                                            if (videoRef.current) {
                                                videoRef.current.volume = 1;
                                                videoRef.current.playbackRate = playbackRate;
                                            }
                                        }}
                                        onEnded={() => {
                                            if (videoLoop) {
                                                videoRef.current.currentTime = 0;
                                                videoRef.current.play();
                                            } else if (autoPlaySlides) {
                                                navigateMedia(1);
                                            }
                                        }}
                                    />
                                    {selectedMedia.type.startsWith('video/') && !zoomMode && (
                                        <div className="speed-control-overlay" onClick={e => e.stopPropagation()}>
                                            <div className="speed-control-wrapper">
                                                <button className="speed-btn-integrated">
                                                    {playbackRate}x
                                                </button>
                                                <div className="speed-menu-integrated">
                                                    {[0.5, 0.75, 1, 1.25, 1.5, 2].map(rate => (
                                                        <div
                                                            key={rate}
                                                            className={`speed-option-integrated ${playbackRate === rate ? 'active' : ''}`}
                                                            onClick={() => setPlaybackRate(rate)}
                                                        >
                                                            {rate}x
                                                        </div>
                                                    ))}
                                                </div>
                                            </div>
                                        </div>
                                    )}
                                </>
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

                                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 15 }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                                        <input
                                            type="checkbox"
                                            checked={settingsData.autoPlay}
                                            onChange={(e) => setSettingsData({ ...settingsData, autoPlay: e.target.checked })}
                                            id="autoplay-checkbox"
                                        />
                                        <label htmlFor="autoplay-checkbox" style={{ fontSize: '0.9rem', cursor: 'pointer' }}>{t.autoPlayVideos || 'Auto Play Videos'}</label>
                                    </div>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                                        <input
                                            type="checkbox"
                                            checked={settingsData.videoLoop}
                                            onChange={(e) => setSettingsData({ ...settingsData, videoLoop: e.target.checked })}
                                            id="videoloop-checkbox"
                                        />
                                        <label htmlFor="videoloop-checkbox" style={{ fontSize: '0.9rem', cursor: 'pointer' }}>{t.loopVideos || 'Loop Videos'}</label>
                                    </div>
                                </div>

                                <div style={{ background: 'rgba(255,255,255,0.03)', padding: 15, borderRadius: 10, border: '1px solid #333', display: 'flex', flexDirection: 'column', gap: 15 }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                                        <input
                                            type="checkbox"
                                            checked={settingsData.autoPlaySlides}
                                            onChange={(e) => setSettingsData({ ...settingsData, autoPlaySlides: e.target.checked })}
                                            id="autoplayslides-checkbox"
                                        />
                                        <label htmlFor="autoplayslides-checkbox" style={{ fontSize: '0.9rem', cursor: 'pointer', fontWeight: 'bold', color: 'var(--netflix-red)' }}>{t.autoPlaySlides || 'Auto Play Slides (Next Media)'}</label>
                                    </div>

                                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, paddingLeft: 25 }}>
                                        <input
                                            type="checkbox"
                                            checked={settingsData.slideLoop}
                                            onChange={(e) => setSettingsData({ ...settingsData, slideLoop: e.target.checked })}
                                            id="slideloop-checkbox"
                                        />
                                        <label htmlFor="slideloop-checkbox" style={{ fontSize: '0.9rem', cursor: 'pointer', color: '#ccc' }}>{t.loopSlideshow || 'Loop Slideshow'}</label>
                                    </div>

                                    <div style={{ paddingLeft: 25 }}>
                                        <label style={{ display: 'block', fontSize: '0.8rem', marginBottom: 5, color: '#888' }}>{t.imageSlideDuration || 'Image Slide Duration (seconds)'}</label>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                                            <input
                                                type="range"
                                                min="1"
                                                max="60"
                                                value={settingsData.slideDuration}
                                                onChange={(e) => setSettingsData({ ...settingsData, slideDuration: parseInt(e.target.value) })}
                                                style={{ flex: 1 }}
                                            />
                                            <span style={{ minWidth: 25, fontSize: '0.9rem', color: '#fff' }}>{settingsData.slideDuration}s</span>
                                        </div>
                                    </div>
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

                                <div className="settings-section" style={{ marginTop: 10, paddingTop: 15, borderTop: '1px solid rgba(255,255,255,0.1)' }}>
                                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: 'rgba(0,0,0,0.2)', padding: '12px 15px', borderRadius: 8 }}>
                                        <div style={{ flex: 1 }}>
                                            <div style={{ fontSize: '0.9rem', color: '#eee', fontWeight: 'bold', marginBottom: 2 }}>{t.cleanupThumbs || 'Cleanup Orphans'}</div>
                                            <div style={{ fontSize: '0.75rem', color: '#777', lineHeight: '1.2' }}>{t.cleanupDesc || 'Removes thumbnails and records of manually deleted files.'}</div>
                                        </div>
                                        <button
                                            className={`btn ${isCleaning ? 'btn-grey' : 'btn-primary'}`}
                                            onClick={handleCleanup}
                                            disabled={isCleaning}
                                            style={{ minWidth: 100, height: 36, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, fontSize: '0.85rem' }}
                                        >
                                            {isCleaning ? <RotateCw size={14} className="spin" /> : <Trash size={14} />}
                                            {isCleaning ? (t.cleaning || '...') : (t.start || 'Start')}
                                        </button>
                                    </div>
                                </div>
                            </div>
                            <div className="modal-footer">
                                <button className="btn btn-primary" onClick={saveSettings}><Save size={16} style={{ marginRight: 5 }} /> {t.save || 'Save'}</button>
                                <button className="btn btn-grey" onClick={() => setSettingsModal(false)}>{t.cancel || 'Cancel'}</button>
                            </div>
                        </div>
                    </div>
                )
            }


            {newFolderModal && (
                <div className="modal-overlay" onClick={() => { setNewFolderModal(false); setNewFolderError(''); }}>
                    <div className="modal info-modal" onClick={e => e.stopPropagation()}>
                        <div className="modal-header">
                            <h3>{t.newFolder || 'Yeni Klasör Oluştur'}</h3>
                            <button onClick={() => { setNewFolderModal(false); setNewFolderError(''); }}><X size={20} /></button>
                        </div>
                        <div className="modal-body">
                            <label style={{ display: 'block', fontSize: '0.9rem', marginBottom: 5, color: '#aaa' }}>{t.folderName || 'Klasör İsmi'}</label>
                            <input
                                type="text"
                                value={newFolderName}
                                onChange={(e) => { setNewFolderName(e.target.value); setNewFolderError(''); }}
                                className={`modal-input ${newFolderError ? 'input-error' : ''}`}
                                autoFocus
                                onKeyDown={e => e.key === 'Enter' && handleCreateFolder()}
                            />
                            {newFolderError && (
                                <div style={{ color: '#e50914', fontSize: '0.85rem', marginTop: 8, display: 'flex', alignItems: 'center', gap: 5 }}>
                                    <X size={14} /> {newFolderError}
                                </div>
                            )}
                        </div>
                        <div className="modal-footer">
                            <button className="btn btn-primary" onClick={handleCreateFolder}>{t.create || 'Oluştur'}</button>
                            <button className="btn btn-grey" onClick={() => { setNewFolderModal(false); setNewFolderError(''); }}>{t.cancel || 'İptal'}</button>
                        </div>
                    </div>
                </div>
            )}

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
                        onClose={() => {
                            const item = editImageItem || selectedMedia;
                            if (item) setLastActivePath(item.path);
                            setShowEditor(false);
                            setEditImageItem(null);
                        }}
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
                            const item = editVideoItem || selectedMedia;
                            if (item) setLastActivePath(item.path);
                            setShowVideoEditor(false);
                            setEditVideoItem(null);
                            setSelectedMediaIndex(-1);
                        }}
                        onSave={handleSaveEditedVideo}
                        onShowToast={(msg) => {
                            setToast(msg);
                            setTimeout(() => setToast(null), 3000);
                        }}
                    />
                )
            }
            {
                ytModal && (
                    <div className="modal-overlay" onClick={() => { setYtModal(false); setYtInfo(null); setYtAsAudio(false); }}>
                        <div className="modal yt-modal" onClick={e => e.stopPropagation()} style={{ maxWidth: 500 }}>
                            <div className="modal-header">
                                <h3>{t.youtubeDownload || 'YouTube Download'}</h3>
                                <button onClick={() => { setYtModal(false); setYtInfo(null); setYtAsAudio(false); }}><X size={20} /></button>
                            </div>
                            <div className="modal-body">
                                <label style={{ display: 'block', fontSize: '0.9rem', marginBottom: 5, color: '#aaa' }}>{t.enterYoutubeUrl || 'Enter YouTube URL'}</label>
                                <div style={{ display: 'flex', gap: 10, marginBottom: 20 }}>
                                    <input
                                        type="text"
                                        value={ytUrl}
                                        onChange={(e) => setYtUrl(e.target.value)}
                                        className="modal-input"
                                        placeholder={t.youtubePlaceholder || "https://www.youtube.com/watch?v=..."}
                                    />
                                    <button className="btn btn-primary" onClick={handleYtFetchInfo} disabled={ytLoading}>
                                        {ytLoading ? <RotateCw size={16} className="spin" /> : <Search size={16} />}
                                    </button>
                                </div>

                                {ytInfo && (
                                    <div className="yt-info-preview" style={{ background: 'rgba(255,255,255,0.05)', padding: 15, borderRadius: 8 }}>
                                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                                            <div style={{ flex: 1, marginRight: 10 }}>
                                                <h4 style={{ margin: '0 0 5px 0' }}>{ytInfo.title}</h4>
                                                <p style={{ fontSize: '0.8rem', color: '#888', marginBottom: 15 }}>{ytInfo.uploader}</p>
                                            </div>
                                            {ytInfo.type === 'playlist' && (
                                                <label style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 2, cursor: 'pointer' }}>
                                                    <span style={{ fontSize: '0.75rem', color: '#aaa' }}>{t.selectAll || 'Select All'}</span>
                                                    <input
                                                        type="checkbox"
                                                        checked={ytInfo.entries.length > 0 && ytInfo.entries.filter(ent => ent.title && !ent.title.toLowerCase().includes('[private video]')).every(e => ytSelectedUrls.has(e.url))}
                                                        onChange={(e) => {
                                                            if (e.target.checked) {
                                                                const nonPrivate = ytInfo.entries
                                                                    .filter(ent => ent.title && !ent.title.toLowerCase().includes('[private video]'))
                                                                    .map(ent => ent.url);
                                                                setYtSelectedUrls(new Set(nonPrivate));
                                                            } else {
                                                                setYtSelectedUrls(new Set());
                                                            }
                                                        }}
                                                    />
                                                </label>
                                            )}
                                        </div>

                                        {ytInfo.type === 'playlist' && (
                                            <div className="yt-playlist-entries" style={{ maxHeight: 200, overflowY: 'auto', border: '1px solid #333', borderRadius: 4, padding: 5 }}>
                                                {ytInfo.entries.map((entry, idx) => (
                                                    <div key={idx} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '5px 0', borderBottom: '1px solid #222' }}>
                                                        <input
                                                            type="checkbox"
                                                            checked={ytSelectedUrls.has(entry.url)}
                                                            onChange={(e) => {
                                                                const newSet = new Set(ytSelectedUrls);
                                                                if (e.target.checked) newSet.add(entry.url);
                                                                else newSet.delete(entry.url);
                                                                setYtSelectedUrls(newSet);
                                                            }}
                                                        />
                                                        <span style={{ fontSize: '0.85rem', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{entry.title}</span>
                                                    </div>
                                                ))}
                                            </div>
                                        )}

                                        <div style={{ marginTop: 15, display: 'flex', alignItems: 'center', gap: 10, background: 'rgba(255,255,255,0.03)', padding: '8px 12px', borderRadius: 6, border: '1px solid rgba(255,255,255,0.05)' }}>
                                            <input
                                                type="checkbox"
                                                id="yt-as-audio"
                                                checked={ytAsAudio}
                                                onChange={(e) => setYtAsAudio(e.target.checked)}
                                                style={{ width: 16, height: 16, accentColor: 'var(--netflix-red)' }}
                                            />
                                            <label htmlFor="yt-as-audio" style={{ fontSize: '0.85rem', cursor: 'pointer', color: '#ccc' }}>
                                                {t.downloadAsMp3 || 'Download as MP3'}
                                            </label>
                                        </div>

                                        <button
                                            className="btn btn-primary"
                                            style={{ width: '100%', marginTop: 15 }}
                                            onClick={handleYtDownload}
                                            disabled={ytSelectedUrls.size === 0}
                                        >
                                            <Play size={16} style={{ marginRight: 10 }} /> {t.downloadSelected || 'Download Selected'} ({ytSelectedUrls.size})
                                        </button>
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>
                )
            }

            {ytDownloads.length > 0 && (
                <div
                    className={`yt-progress-container ${ytMinimized ? 'minimized' : 'maximized'}`}
                    onMouseEnter={() => setYtMinimized(false)}
                    onMouseLeave={() => setYtMinimized(true)}
                >
                    {!ytMinimized && (
                        <div className="yt-progress-list" style={{ maxHeight: 300, overflowY: 'auto', padding: 10 }}>
                            {ytDownloads.map((job) => (
                                <div key={job.id} className="yt-progress-item" style={{ marginBottom: 12, paddingBottom: 8, borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                                    <div className="yt-job-info" style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 5 }}>
                                        <span className="yt-job-title" style={{ fontSize: '0.75rem', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: '70%', color: '#eee' }}>{job.title}</span>
                                        <span className={`yt-job-status ${job.status}`} style={{ fontSize: '10px', padding: '1px 5px', borderRadius: 3, background: job.status === 'completed' ? '#46d369' : (job.status === 'error' ? '#e50914' : '#ff8c00'), color: '#fff' }}>
                                            {t[job.status] || job.status}
                                        </span>
                                    </div>
                                    <div className="yt-progress-bar-bg" style={{ height: 4, background: 'rgba(255,255,255,0.1)', borderRadius: 2, overflow: 'hidden' }}>
                                        <div className={`yt-progress-bar-fill ${job.status}`} style={{ width: `${job.percent}%`, height: '100%', background: job.status === 'completed' ? '#46d369' : (job.status === 'error' ? '#e50914' : 'var(--netflix-red)'), transition: 'width 0.3s' }}></div>
                                    </div>
                                    {job.status === 'error' && job.errorMsg && (
                                        <div style={{ color: '#e50914', fontSize: '9px', marginTop: 4, fontStyle: 'italic' }}>
                                            {job.errorMsg}
                                        </div>
                                    )}
                                    <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 4 }}>
                                        <span style={{ fontSize: '10px', color: '#666' }}>{Math.round(job.percent)}%</span>
                                        <div style={{ display: 'flex', gap: 5 }}>
                                            {job.status !== 'completed' && job.status !== 'error' && (
                                                <button className="cancel-mini-btn" title={t.cancel || "Cancel"} onClick={() => cancelYtDownload(job.processId)} style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: '#888', display: 'flex', padding: 2 }}>
                                                    <X size={12} />
                                                </button>
                                            )}
                                            {(job.status === 'completed' || job.status === 'error') && (
                                                <button
                                                    onClick={(e) => {
                                                        e.stopPropagation();
                                                        setYtDownloads(prev => prev.filter(j => j.id !== job.id));
                                                    }}
                                                    style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: '#666', fontSize: '10px' }}
                                                >
                                                    {t.clear || 'Clear'}
                                                </button>
                                            )}
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}

                    <div className="yt-progress-header">
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                            <RotateCw size={16} className={ytDownloads.some(d => d.status === 'downloading') ? 'spin' : ''} />
                            <span style={{ fontSize: '0.8rem' }}>{t.activeDownloads || 'Active Downloads'} ({ytDownloads.filter(d => d.status !== 'completed').length})</span>
                        </div>
                        <button className="minimize-btn" onClick={(e) => { e.stopPropagation(); setYtMinimized(!ytMinimized); }} style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: '#fff', padding: 4 }}>
                            {ytMinimized ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                        </button>
                    </div>

                    {ytMinimized && ytDownloads.some(d => d.status === 'downloading') && (
                        <div className="yt-mini-progress" style={{ height: 2, background: 'rgba(255,255,255,0.1)' }}>
                            <div className="yt-mini-fill" style={{ width: `${ytDownloads.reduce((acc, curr) => acc + curr.percent, 0) / ytDownloads.length}%`, height: '100%', background: 'var(--netflix-red)' }}></div>
                        </div>
                    )}
                </div>
            )}
        </div >
    );
}

export default App;
