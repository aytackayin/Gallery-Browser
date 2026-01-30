import { useState, useEffect, useRef } from 'react';
import { Folder, X, Play, ChevronRight, Home, ChevronLeft, Image as ImageIcon, Video as VideoIcon, Search, Trash2, Info, Save, FolderInput, ChevronDown, Settings } from 'lucide-react';

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

    // Taşıma State'i
    const [moveModal, setMoveModal] = useState(null); // Taşınacak dosya
    const [targetFolder, setTargetFolder] = useState(null); // Hedef klasör path
    const [expandedFolders, setExpandedFolders] = useState({}); // Klasör ağacı genişletme durumu
    const [rootFolders, setRootFolders] = useState([]);
    const [moveConflict, setMoveConflict] = useState(false); // Çakışma durumu

    // Batch Selection State
    const [selectedPaths, setSelectedPaths] = useState(new Set());
    const [lastSelectedPath, setLastSelectedPath] = useState(null); // Shift+Click için

    // Settings State
    const [settingsModal, setSettingsModal] = useState(false);
    const [settingsData, setSettingsData] = useState({ galleryPath: '', autoPlay: false, language: 'en', theme: 'system' });
    const [theme, setTheme] = useState('system');

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
                if (moveModal) { setMoveModal(null); setMoveConflict(false); }
                else if (editModal) setEditModal(null);
                else { resetAndClose(); setConfirmDelete(null); }
            }
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [selectedMediaIndex, zoomMode, items, confirmDelete, editModal, moveModal]);

    useEffect(() => {
        if (selectedMediaIndex !== -1 || confirmDelete || editModal || moveModal) {
            document.body.style.overflow = 'hidden';
        } else {
            document.body.style.overflow = 'auto';
        }
    }, [selectedMediaIndex, confirmDelete, editModal, moveModal]);

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
                setSettingsModal(false);
                alert(t.restartRequired || 'Restart required for some changes');
            }
        } catch (e) {
            alert('Error saving settings');
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
        try {
            const res = await fetch(`/api/info?path=${encodeURIComponent(item.path)}`);
            const data = await res.json();
            setEditInfo(data.info || '');
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

    const handleMouseUp = (e) => {
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

                <button
                    className="settings-btn"
                    data-tooltip={t.settings || 'Settings'}
                    onClick={() => setSettingsModal(true)}
                    style={{ background: 'transparent', border: 'none', cursor: 'pointer', padding: 8 }}
                >
                    <Settings size={20} color="#aaa" />
                </button>
            </nav>

            <div className="rows-container" style={{ paddingTop: '100px' }}>
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
                                <div key={item.path} className={`media-card ${isSelected ? 'selected' : ''} ${isFolder ? 'is-folder' : ''}`} onClick={() => isFolder ? fetchItems(item.path) : openMedia(mediaIdx)}>

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
                                            <button className="action-btn info-btn" data-tooltip={t.editInfoRename || 'Edit Info & Rename'} onClick={(e) => { e.stopPropagation(); openEditModal(item); }} style={{ color: '#0071eb' }}><Info size={14} /></button>
                                            <button className="action-btn info-btn" data-tooltip={t.move || 'Move'} onClick={(e) => { e.stopPropagation(); setMoveModal(item); }} style={{ color: '#ff8c00' }}><FolderInput size={14} /></button>
                                            <button className="action-btn delete-btn" data-tooltip={t.delete || 'Delete'} onClick={(e) => { e.stopPropagation(); setConfirmDelete(item); }} style={{ color: '#e50914' }}><Trash2 size={14} /></button>
                                        </div>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </div>
            </div>

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
            )}

            {editModal && (
                <div className="modal-overlay" onClick={() => setEditModal(null)}>
                    <div className="modal info-modal" onClick={e => e.stopPropagation()}>
                        <div className="modal-header">
                            <h3>{t.editItem || 'Edit Item'}</h3>
                            <button onClick={() => setEditModal(null)}><X size={20} /></button>
                        </div>
                        <div className="modal-body">
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
                            <button className="btn btn-primary" onClick={handleSaveEdit}><Save size={16} /> {t.save || 'Save'}</button>
                        </div>
                    </div>
                </div>
            )}

            {moveModal && (
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
            )}

            {selectedMedia && (
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

            {settingsModal && (
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
                            <button className="btn btn-primary" onClick={saveSettings}><Save size={16} /> {t.save || 'Save'}</button>
                            <button className="btn btn-grey" onClick={() => setSettingsModal(false)}>{t.cancel || 'Cancel'}</button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
export default App;
