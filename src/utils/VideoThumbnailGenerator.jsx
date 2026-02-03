import React, { useEffect, useRef, useState } from 'react';

/**
 * Client-Side Video Thumbnail Generator
 * Generates thumbnails from video files using HTML5 Video + Canvas API
 */
export const VideoThumbnailCanvas = ({ videoPath, startTime, width, height, onLoad }) => {
    const canvasRef = useRef(null);
    const videoRef = useRef(null);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState(false);

    useEffect(() => {
        if (!videoPath || !canvasRef.current) return;

        const canvas = canvasRef.current;
        const ctx = canvas.getContext('2d');
        const video = document.createElement('video');
        videoRef.current = video;

        video.crossOrigin = 'anonymous';
        video.preload = 'metadata';
        video.muted = true;

        let hasDrawn = false;

        const drawFrame = () => {
            if (hasDrawn) return;
            hasDrawn = true;

            try {
                // Clear canvas
                ctx.clearRect(0, 0, width, height);

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
            drawFrame();
        };

        const handleLoadedMetadata = () => {
            // Ensure startTime is within video duration
            const seekTime = Math.min(Math.max(0, startTime || 0), video.duration - 0.1);
            video.currentTime = seekTime;
        };

        const handleError = () => {
            setError(true);
            setIsLoading(false);
        };

        video.addEventListener('loadedmetadata', handleLoadedMetadata);
        video.addEventListener('seeked', handleSeeked);
        video.addEventListener('error', handleError);

        // Start loading
        video.src = `http://localhost:3001/media/${encodeURIComponent(videoPath)}`;

        return () => {
            video.removeEventListener('loadedmetadata', handleLoadedMetadata);
            video.removeEventListener('seeked', handleSeeked);
            video.removeEventListener('error', handleError);
            video.src = '';
            videoRef.current = null;
        };
    }, [videoPath, startTime, width, height, onLoad]);

    return (
        <div style={{ position: 'relative', width: '100%', height: '100%' }}>
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
