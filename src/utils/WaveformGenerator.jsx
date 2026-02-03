import React, { useEffect, useRef } from 'react';

export const AudioWaveformCanvas = ({ buffer, startTime, duration, width, height, color }) => {
    const canvasRef = useRef(null);

    useEffect(() => {
        if (!canvasRef.current || !buffer) return;

        const canvas = canvasRef.current;
        const ctx = canvas.getContext('2d');

        // Clear canvas
        ctx.clearRect(0, 0, width, height);

        const channelData = buffer.getChannelData(0); // Use first channel
        const totalSamples = channelData.length;
        const sampleRate = buffer.sampleRate;

        // Calculate start and end indices for the requested chunk
        const startIdx = Math.floor(startTime * sampleRate);
        const endIdx = Math.floor((startTime + duration) * sampleRate);
        const chunkSamples = endIdx - startIdx;

        if (chunkSamples <= 0 || startIdx >= totalSamples) return;

        // Optimization: Step size (how many samples per pixel)
        const step = Math.ceil(chunkSamples / width);
        const amp = height / 2;

        ctx.fillStyle = color || '#00ff00';
        ctx.beginPath();

        for (let i = 0; i < width; i++) {
            let min = 1.0;
            let max = -1.0;

            const currentSampleBase = startIdx + (i * step);

            // Loop through the step block to find peaks (decimation)
            for (let j = 0; j < step; j++) {
                const index = currentSampleBase + j;
                if (index < totalSamples) {
                    const datum = channelData[index];
                    if (datum < min) min = datum;
                    if (datum > max) max = datum;
                }
            }

            // If flat line (silence or error), default to center
            if (min > max) { min = 0; max = 0; }

            // Draw vertical bar from min to max amplitude
            // Scale to canvas height
            // Datum is -1 to 1. 
            // y=amp is center. 
            // 1 -> y=0 (top), -1 -> y=height (bottom)
            // But usually we draw around center:
            // y_min = (1 - min) * amp
            // y_max = (1 - max) * amp
            // Let's use simple center-out drawing

            // Robust drawing:
            // Center is height/2.
            // Height of bar is (max - min) * amp.
            // Start y is (1 + min) * amp
            // Height is Math.max(1, (max-min)*amp)

            const y = (1 + min) * amp;
            const h = Math.max(1, (max - min) * amp);

            ctx.fillRect(i, y, 1, h);
        }

    }, [buffer, startTime, duration, width, height, color]);

    return <canvas ref={canvasRef} width={width} height={height} style={{ width: '100%', height: '100%', display: 'block' }} />;
};

export default AudioWaveformCanvas;
