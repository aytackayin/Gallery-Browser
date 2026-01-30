import { useState, useEffect, useRef } from 'react';
import { Folder, X, Play, ChevronRight, Home, ChevronLeft, Image as ImageIcon, Video as VideoIcon, Search, Trash2, Info, Save } from 'lucide-react';

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
    const [infoModal, setInfoModal] = useState(null); // Dosya objesi
    const [infoText, setInfoText] = useState('');

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
        const handleScroll = () => {
            setScrolled(window.scrollY > 50);
            if ((window.innerHeight + window.scrollY) >= document.body.offsetHeight - 500) {
                setVisibleCount(prev => prev + 20);
            }
        };
        window.addEventListener('scroll', handleScroll);
        return () => window.removeEventListener('scroll', handleScroll);
    }, []);

    useEffect(() => {
        const handleKeyDown = (e) => {
            if (selectedMediaIndex === -1 && !confirmDelete && !infoModal) return;
            if (e.key === 'PageDown' && !zoomMode) { e.preventDefault(); navigateMedia(1); }
            else if (e.key === 'PageUp' && !zoomMode) { e.preventDefault(); navigateMedia(-1); }
            else if (e.key === 'Escape') { resetAndClose(); setConfirmDelete(null); setInfoModal(null); }
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [selectedMediaIndex, zoomMode, items, confirmDelete, infoModal]);

    useEffect(() => {
        if (selectedMediaIndex !== -1 || confirmDelete || infoModal) {
            document.body.style.overflow = 'hidden';
        } else {
            document.body.style.overflow = 'auto';
        }
    }, [selectedMediaIndex, confirmDelete, infoModal]);

    const fetchItems = async (path) => {
        setLoading(true);
        setIsSearching(false);
        setVisibleCount(40);
        try {
            const response = await fetch(`/api/scan?path=${encodeURIComponent(path)}`);
            const data = await response.json();
            setItems(data.items || []);
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

    const deleteItem = async () => {
        if (!confirmDelete) return;
        try {
            await fetch(`/api/delete?path=${encodeURIComponent(confirmDelete.path)}`, { method: 'DELETE' });
            setConfirmDelete(null);
            isSearching ? handleSearch({ target: { value: searchQuery } }) : fetchItems(currentPath);
        } catch (e) { alert(t.deleteError); }
    };

    const openInfo = async (item) => {
        setInfoModal(item);
        try {
            const res = await fetch(`/api/info?path=${encodeURIComponent(item.path)}`);
            const data = await res.json();
            setInfoText(data.info || '');
        } catch (e) { }
    };

    const saveInfo = async () => {
        try {
            await fetch('/api/info', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ path: infoModal.path, info: infoText })
            });
            setInfoModal(null);
        } catch (e) { alert(t.saveError); }
    };

    const sortedMediaOnly = items.filter(i => i.type !== 'folder');
    const selectedMedia = selectedMediaIndex >= 0 ? sortedMediaOnly[selectedMediaIndex] : null;

    const openMedia = (index) => {
        setSelectedMediaIndex(index);
        if (document.documentElement.requestFullscreen) document.documentElement.requestFullscreen().catch(() => { });
    };

    const resetAndClose = () => {
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

    const handleMouseUp = () => {
        setIsPanning(false);
    };

    const getMediaUrl = (path) => `http://localhost:3001/media/${encodeURIComponent(path)}`;
    const getThumbUrl = (path) => `http://localhost:3001/api/thumb?path=${encodeURIComponent(path)}`;

    return (
        <div className="app">
            <nav className={`navbar ${scrolled ? 'scrolled' : ''}`}>
                <div className="logo" onClick={() => fetchItems('.')}>GALLERY <span>BROWSER</span></div>

                <div className="search-container">
                    <Search size={18} className="search-icon" />
                    <input
                        type="text"
                        placeholder={t.searchPlaceholder}
                        value={searchQuery}
                        onChange={handleSearch}
                        className="search-input"
                    />
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

            <div className="rows-container" style={{ paddingTop: '100px' }}>
                <div className="row">
                    <h2 className="row-title">
                        {loading ? t.loading : (isSearching ? (t.searchTitle ? t.searchTitle.replace('{q}', searchQuery) : searchQuery) : (currentPath === '.' ? t.library : currentPath.split('/').pop()))}
                    </h2>
                    <div className="media-grid">
                        {items.slice(0, visibleCount).map((item) => {
                            const isFolder = item.type === 'folder';
                            const mediaIdx = !isFolder ? sortedMediaOnly.indexOf(item) : -1;
                            return (
                                <div key={item.path} className="media-card" onClick={() => isFolder ? fetchItems(item.path) : openMedia(mediaIdx)}>
                                    {isFolder ? (
                                        <div className="folder-icon"><Folder size={48} color="#ff8c00" /></div>
                                    ) : (
                                        <div className="media-wrapper">
                                            <img
                                                src={getThumbUrl(item.path)}
                                                className="media-thumbnail"
                                                loading="lazy"
                                                alt={item.name}
                                                onError={(e) => { e.target.onerror = null; e.target.src = getMediaUrl(item.path); }}
                                            />
                                            <div className="play-overlay"><Play fill="white" size={30} /></div>
                                        </div>
                                    )}

                                    <div className="media-info">
                                        <div className="media-name">{item.name}</div>
                                        <div className="item-actions">
                                            {item.type.startsWith('video/') ? <VideoIcon size={14} color="#e50914" /> : item.type.startsWith('image/') ? <ImageIcon size={14} color="#0071eb" /> : <Folder size={14} color="#ff8c00" />}
                                            <button className="action-btn info-btn" onClick={(e) => { e.stopPropagation(); openInfo(item); }}><Info size={14} /></button>
                                            <button className="action-btn delete-btn" onClick={(e) => { e.stopPropagation(); setConfirmDelete(item); }}><Trash2 size={14} /></button>
                                        </div>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </div>
            </div>

            {/* SİLME ONAY MODAL */}
            {confirmDelete && (
                <div className="modal-overlay" onClick={() => setConfirmDelete(null)}>
                    <div className="modal confirmation-modal" onClick={e => e.stopPropagation()}>
                        <h3>{t.deleteTitle}</h3>
                        <p><strong>{confirmDelete.name}</strong> {t.deleteConfirm}</p>
                        <div className="modal-footer">
                            <button className="btn btn-danger" onClick={deleteItem}>{t.yesDelete}</button>
                            <button className="btn btn-grey" onClick={() => setConfirmDelete(null)}>{t.cancel}</button>
                        </div>
                    </div>
                </div>
            )}

            {/* BİLGİ / NOT MODAL */}
            {infoModal && (
                <div className="modal-overlay" onClick={() => setInfoModal(null)}>
                    <div className="modal info-modal" onClick={e => e.stopPropagation()}>
                        <div className="modal-header">
                            <h3>{t.detailsTitle}</h3>
                            <button onClick={() => setInfoModal(null)}><X size={20} /></button>
                        </div>
                        <div className="modal-body">
                            <p className="item-path-text">{infoModal.path}</p>
                            <textarea
                                value={infoText}
                                onChange={(e) => setInfoText(e.target.value)}
                                placeholder={t.writeSomething}
                            />
                        </div>
                        <div className="modal-footer">
                            <button className="btn btn-primary" onClick={saveInfo}><Save size={16} /> {t.save}</button>
                        </div>
                    </div>
                </div>
            )}

            {/* MEDYA VIEWER (Aynı kalıyor) */}
            {selectedMedia && (
                <div className="viewer" onClick={() => resetAndClose()} onContextMenu={(e) => { e.preventDefault(); if (zoomMode && !hasMoved) { setZoomMode(false); setZoomScale(1); } }}>
                    <div className="viewer-controls">
                        <button className="control-btn" onClick={() => resetAndClose()}><X size={40} /></button>
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
                                    e.stopPropagation(); // Resme tıklayınca galeri kapanmasın
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
                                    transform: `scale(${zoomScale})`,
                                    transformOrigin: `${zoomOrigin.x}% ${zoomOrigin.y}%`,
                                    transition: (zoomScale === 1 || isPanning) ? 'none' : 'transform 0.3s',
                                    pointerEvents: zoomMode ? 'none' : 'auto'
                                }}
                                draggable="false"
                            />
                        )}
                    </div>
                    {!zoomMode && selectedMediaIndex < sortedMediaOnly.length - 1 && <div className="nav-zone next" onClick={(e) => { e.stopPropagation(); navigateMedia(1); }}><ChevronRight size={60} className="nav-arrow" /></div>}
                </div>
            )}
        </div>
    );
}

export default App;
