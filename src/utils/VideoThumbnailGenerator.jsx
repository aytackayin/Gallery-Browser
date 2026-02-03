import React, { useEffect, useRef, useState } from 'react';

/**
 * Client-Side Video Thumbnail Generator (Enhanced Precision)
 * Generates thumbnails from video files using HTML5 Video + Canvas API
 * with improved seeking accuracy and frame capture timing
 */
export const VideoThumbnailCanvas = ({ videoPath, startTime, width, height, onLoad }) => {
    const canvasRef = useRef(null);
    const videoRef = useRef(null);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState(false);
    const seekAttempts = useRef(0);
    const targetTimeRef = useRef(startTime);

    useEffect(() => {
        if (!videoPath || !canvasRef.current) return;

        const canvas = canvasRef.current;
        const ctx = canvas.getContext('2d');
        const video = document.createElement('video');
        videoRef.current = video;

        video.crossOrigin = 'anonymous';
        video.preload = 'auto'; // Changed from 'metadata' to 'auto' for better frame accuracy
        video.muted = true;
        video.playsInline = true;

        let hasDrawn = false;
        seekAttempts.current = 0;
        targetTimeRef.current = startTime;

        const drawFrame = () => {
            if (hasDrawn) return;

            // Verify we're at the correct time (within 0.1s tolerance)
            const timeDiff = Math.abs(video.currentTime - targetTimeRef.current);
            if (timeDiff > 0.15 && seekAttempts.current < 3) {
                // Not accurate enough, try seeking again
                seekAttempts.current++;
                video.currentTime = targetTimeRef.current;
                return;
            }

            hasDrawn = true;

            try {
                // Clear canvas with black background
                ctx.fillStyle = '#000';
                ctx.fillRect(0, 0, width, height);

                // Draw video frame
                ctx.drawImage(video, 0, 0, width, height);

                setIsLoading(false);
                if (onLoad) onLoad();
            } catch (err) {
                setError(true);
                setIsLoading(false);
            }
        };

        const handleSeeked = () => {
            // Wait a bit for the frame to be fully decoded
            requestAnimationFrame(() => {
                requestAnimationFrame(() => {
                    drawFrame();
                });
            });
        };

        const handleLoadedData = () => {
            // Video data is loaded, now we can seek accurately
            const seekTime = Math.min(Math.max(0, startTime || 0), video.duration - 0.1);
            targetTimeRef.current = seekTime;
            video.currentTime = seekTime;
        };

        const handleCanPlay = () => {
            // Ensure we're ready to capture frames
            if (!hasDrawn && video.readyState >= 2) {
                const seekTime = Math.min(Math.max(0, startTime || 0), video.duration - 0.1);
                targetTimeRef.current = seekTime;
                video.currentTime = seekTime;
            }
        };

        const handleError = (e) => {
            setError(true);
            setIsLoading(false);
        };

        video.addEventListener('loadeddata', handleLoadedData);
        video.addEventListener('canplay', handleCanPlay);
        video.addEventListener('seeked', handleSeeked);
        video.addEventListener('error', handleError);

        // Start loading
        video.src = `http://localhost:3001/media/${encodeURIComponent(videoPath)}`;
        video.load(); // Explicitly trigger load

        return () => {
            video.removeEventListener('loadeddata', handleLoadedData);
            video.removeEventListener('canplay', handleCanPlay);
            video.removeEventListener('seeked', handleSeeked);
            video.removeEventListener('error', handleError);
            video.pause();
            video.src = '';
            videoRef.current = null;
        };
    }, [videoPath, startTime, width, height, onLoad]);

    return (
        <div style={{ position: 'relative', width: '100%', height: '100%', backgroundColor: '#000' }}>
            <canvas
                ref={canvasRef}
                width={width}
                height={height}
                style={{
                    width: '100%',
                    height: '100%',
                    display: error ? 'none' : 'block',
                    objectFit: 'cover'
                }}
            />
            {isLoading && !error && (
                <div style={{
                    position: 'absolute',
                    inset: 0,
                    background: 'linear-gradient(90deg, rgba(229,9,20,0.1) 0%, rgba(229,9,20,0.3) 50%, rgba(229,9,20,0.1) 100%)',
                    backgroundSize: '200% 100%',
                    animation: 'shimmer 1.5s infinite',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center'
                }}>
                    <span style={{ fontSize: '0.6rem', color: 'rgba(229,9,20,0.6)' }}>▶</span>
                </div>
            )}
            {error && (
                <div style={{
                    position: 'absolute',
                    inset: 0,
                    background: 'rgba(229,9,20,0.1)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center'
                }}>
                    <span style={{ fontSize: '0.6rem', color: 'rgba(229,9,20,0.6)' }}>✕</span>
                </div>
            )}
        </div>
    );
};

export default VideoThumbnailCanvas;
