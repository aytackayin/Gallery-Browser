import React, { useEffect, useRef, useState } from 'react';

// Global cache for video elements (one per video file)
const videoCache = new Map();
// Global cache for generated thumbnail blob URLs
const resultCache = new Map();
// Shared operation queues to prevent concurrent seek conflicts
const operationQueues = new Map();

/**
 * Get or create a shared video element and its queue
 */
const getSharedVideo = (videoPath) => {
    if (!videoCache.has(videoPath)) {
        const video = document.createElement('video');
        video.crossOrigin = 'anonymous';
        video.preload = 'metadata'; // Faster initial load
        video.muted = true;
        video.playsInline = true;
        video.src = `http://localhost:3001/media/${encodeURIComponent(videoPath)}`;

        videoCache.set(videoPath, {
            element: video,
            ready: false,
            duration: 0,
            waitingCallbacks: []
        });

        // Initialize a serial queue for this video element
        operationQueues.set(videoPath, Promise.resolve());

        video.addEventListener('loadedmetadata', () => {
            const cache = videoCache.get(videoPath);
            if (cache) {
                cache.ready = true;
                cache.duration = video.duration;
                cache.waitingCallbacks.forEach(cb => cb());
                cache.waitingCallbacks = [];
            }
        });

        video.addEventListener('error', () => {
            console.error(`Video load error for: ${videoPath}`);
        });
    }
    return {
        data: videoCache.get(videoPath),
        queue: operationQueues.get(videoPath),
        updateQueue: (newQueue) => operationQueues.set(videoPath, newQueue)
    };
};

/**
 * Client-Side Video Thumbnail Generator (Highly Optimized)
 * Features:
 * - Intersection Observer (Lazy loading)
 * - Result Caching (Blob URLs)
 * - Shared Video Elements (Memory efficient)
 * - Serialized Seek/Draw Operations (No seek conflicts)
 */
export const VideoThumbnailCanvas = ({ videoPath, startTime, width, height, onLoad }) => {
    const canvasRef = useRef(null);
    const [thumbnailUrl, setThumbnailUrl] = useState(null);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState(false);
    const [isVisible, setIsVisible] = useState(false);
    const mountedRef = useRef(true);

    const cacheKey = `${videoPath}-${Math.round(startTime * 10) / 10}-${width}-${height}`;

    useEffect(() => {
        mountedRef.current = true;
        return () => { mountedRef.current = false; };
    }, []);

    // 1. Visibility Check (Lazy Loading)
    useEffect(() => {
        if (!canvasRef.current || isVisible) return;

        const observer = new IntersectionObserver(([entry]) => {
            if (entry.isIntersecting) {
                setIsVisible(true);
                observer.disconnect();
            }
        }, { rootMargin: '300px' });

        observer.observe(canvasRef.current);
        return () => observer.disconnect();
    }, [isVisible]);

    // 2. Thumbnail Generation / Cache Retrieval
    useEffect(() => {
        if (!isVisible || !videoPath || !canvasRef.current) return;

        // Check result cache first
        if (resultCache.has(cacheKey)) {
            setThumbnailUrl(resultCache.get(cacheKey));
            setIsLoading(false);
            if (onLoad) onLoad();
            return;
        }

        const { data: videoData, queue, updateQueue } = getSharedVideo(videoPath);
        const video = videoData.element;

        // Queue the operation to prevent seek collisions
        const operation = queue.then(async () => {
            if (!mountedRef.current) return;

            try {
                // Wait for metadata
                if (!videoData.ready) {
                    await new Promise(resolve => {
                        videoData.waitingCallbacks.push(resolve);
                    });
                }

                if (!mountedRef.current) return;

                // Seek and Draw
                const seekTime = Math.min(Math.max(0, startTime || 0), videoData.duration - 0.1);
                video.currentTime = seekTime;

                await new Promise((resolve, reject) => {
                    const timeout = setTimeout(() => reject(new Error('Seek timeout')), 3000);
                    const onSeeked = () => {
                        clearTimeout(timeout);
                        video.removeEventListener('seeked', onSeeked);
                        // Brief wait for frame decode
                        requestAnimationFrame(() => requestAnimationFrame(resolve));
                    };
                    video.addEventListener('seeked', onSeeked);
                });

                if (!mountedRef.current) return;

                // Draw to a temporary offscreen canvas to generate a blob
                const offscreen = document.createElement('canvas');
                offscreen.width = width;
                offscreen.height = height;
                const octx = offscreen.getContext('2d', { alpha: false });
                octx.drawImage(video, 0, 0, width, height);

                // Convert to Blob URL for caching
                const blob = await new Promise(resolve => offscreen.toBlob(resolve, 'image/jpeg', 0.7));
                const url = URL.createObjectURL(blob);

                if (mountedRef.current) {
                    resultCache.set(cacheKey, url);
                    setThumbnailUrl(url);
                    setIsLoading(false);
                    if (onLoad) onLoad();
                }
            } catch (err) {
                console.error("Thumbnail capture failed:", err);
                if (mountedRef.current) {
                    setError(true);
                    setIsLoading(false);
                }
            }
        });

        updateQueue(operation);
    }, [isVisible, videoPath, startTime, width, height, cacheKey, onLoad]);

    return (
        <div
            ref={canvasRef}
            style={{
                position: 'relative',
                width: '100%',
                height: '100%',
                backgroundColor: '#111',
                overflow: 'hidden'
            }}
        >
            {thumbnailUrl ? (
                <img
                    src={thumbnailUrl}
                    alt="thumb"
                    style={{
                        width: '100%',
                        height: '100%',
                        objectFit: 'cover',
                        display: 'block'
                    }}
                />
            ) : null}

            {isLoading && !error && (
                <div style={{
                    position: 'absolute',
                    inset: 0,
                    background: 'linear-gradient(90deg, #1a1a1a 0%, #2a2a2a 50%, #1a1a1a 100%)',
                    backgroundSize: '200% 100%',
                    animation: 'shimmer 1.5s infinite',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center'
                }}>
                    <div style={{ width: 12, height: 12, borderRadius: '50%', border: '2px solid #333', borderTopColor: '#e50914', animation: 'spin 1s linear infinite' }} />
                </div>
            )}

            {error && (
                <div style={{
                    position: 'absolute',
                    inset: 0,
                    background: '#200',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center'
                }}>
                    <span style={{ fontSize: '0.6rem', color: '#600' }}>✕</span>
                </div>
            )}

            <style>{`
                @keyframes shimmer {
                    0% { background-position: -200% 0; }
                    100% { background-position: 200% 0; }
                }
                @keyframes spin {
                    to { transform: rotate(360deg); }
                }
            `}</style>
        </div>
    );
};

// Cleanup function to clear cache when needed
export const clearVideoThumbnailCache = () => {
    // Revoke all Blob URLs to free memory
    resultCache.forEach(url => URL.revokeObjectURL(url));
    resultCache.clear();

    // Reset video elements
    videoCache.forEach(({ element }) => {
        element.pause();
        element.src = '';
        element.load(); // Force release
    });
    videoCache.clear();
    operationQueues.clear();
};

export default VideoThumbnailCanvas;
