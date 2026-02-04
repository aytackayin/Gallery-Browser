// Initial Media Dimensions Loader
useEffect(() => {
    const loadInitialDimensions = async () => {
        if (!item || !item.path) return;

        // Eğer dosya bir proje veya klasörse atla
        // (type kontrolü yapılabilir ama şimdilik path üzerinden gidiyoruz)

        let w = item.width;
        let h = item.height;
        let duration = 0;

        if (!w || !h) {
            try {
                const res = await fetch(`/api/info?path=${encodeURIComponent(item.path)}`);
                const data = await res.json();
                if (data) {
                    if (data.width) w = data.width;
                    if (data.height) h = data.height;
                    if (data.durationSeconds) duration = data.durationSeconds;
                }
            } catch (e) {
                console.error("Failed to load initial dimensions", e);
            }
        }

        if (w && h) {
            // Canvas boyutunu videonun boyutuna eşitle
            setCanvasSize({ w, h });

            // Klibin metadatasını güncelle
            setTracks(prev => prev.map(track => ({
                ...track,
                clips: track.clips.map(c => {
                    if (c.id === 'clip-0') {
                        return {
                            ...c,
                            sourceWidth: w,
                            sourceHeight: h,
                            sourceDuration: duration || c.sourceDuration || c.duration,
                            duration: (duration && c.duration < 0.2) ? duration : c.duration, // Eğer dummy duration varsa güncelle
                            transform: {
                                ...c.transform,
                                x: 0,
                                y: 0, // Canvas ile aynı boyutta olduğu için ortala (0,0)
                                scale: 1
                            }
                        };
                    }
                    return c;
                })
            })));
        }
    };

    loadInitialDimensions();
}, [item?.path]);
