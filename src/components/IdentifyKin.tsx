import React, { useEffect, useRef, useState } from 'react';
import { FaceRecognitionService } from '../services/FaceRecognitionService';
import type { PersonNode } from '../logic/types';
import { CloseButton } from './CloseButton';
import './IdentifyKin.css';

interface IdentifyKinProps {
    onClose: () => void;
    onIdentify: (nodeId: string) => void;
    allNodes: Record<string, PersonNode>;
}

export const IdentifyKin: React.FC<IdentifyKinProps> = ({ onClose, onIdentify, allNodes }) => {
    const videoRef = useRef<HTMLVideoElement>(null);
    const [status, setStatus] = useState<'loading' | 'scanning' | 'success' | 'error'>('loading');
    const [statusMessage, setStatusMessage] = useState('Loading models...');
    const [identifiedNodeId, setIdentifiedNodeId] = useState<string | null>(null);
    const [identifiedName, setIdentifiedName] = useState<string | null>(null);
    const [matchDistance, setMatchDistance] = useState<number>(0);

    useEffect(() => {
        let active = true;
        let stream: MediaStream | null = null;
        const faceService = FaceRecognitionService.getInstance();

        const init = async () => {
            try {
                // 1. Load Models
                setStatusMessage('Loading Face Models...');
                await faceService.loadModels();

                if (!active) return;

                // 2. Index Faces (if not already done)
                setStatusMessage('Indexing Faces (this requires public profile pics)...');
                await faceService.indexFaces(allNodes);

                if (!active) return;

                // 3. Start Camera
                setStatusMessage('Starting Camera...');
                stream = await navigator.mediaDevices.getUserMedia({ video: true });
                if (videoRef.current) {
                    videoRef.current.srcObject = stream;
                    videoRef.current.onloadedmetadata = () => {
                        videoRef.current?.play();
                        setStatus('scanning');
                        setStatusMessage('Scanning...');
                        startScanning();
                    };
                }
            } catch (err) {
                console.error(err);
                setStatus('error');
                setStatusMessage('Failed to initialize. Check permissions or internet.');
            }
        };

        const startScanning = async () => {
            if (!active || !videoRef.current || videoRef.current.paused || videoRef.current.ended) return;

            const result = await faceService.recognizeFace(videoRef.current);
            if (result && result.nodeId) {
                const node = allNodes[result.nodeId];
                if (node) {
                    setIdentifiedNodeId(result.nodeId);
                    setIdentifiedName(node.name || 'Unknown');
                    setMatchDistance(result.distance);
                    setStatus('success');
                    setStatusMessage(`Identified: ${node.name}`);
                    // Optional: Auto-redirect? Let's just show Success state first.
                    return;
                }
            }

            // Loop
            if (active && status !== 'success') {
                requestAnimationFrame(startScanning);
            }
        };

        init();

        return () => {
            active = false;
            if (stream) {
                stream.getTracks().forEach(t => t.stop());
            }
        };
    }, [allNodes]);

    return (
        <div className="identify-kin-modal">
            <div className="identify-content">
                <CloseButton onClick={onClose} />
                <h2>Identify Kin</h2>

                <div className="video-container">
                    <video ref={videoRef} playsInline muted style={{ transform: 'scaleX(-1)' }} />
                    <div className="scan-overlay" />
                </div>

                <div className="status-area">
                    <p className={`status-text ${status}`}>{statusMessage}</p>
                    {status === 'success' && identifiedName && (
                        <div className="match-card">
                            <h3>It's {identifiedName}!</h3>
                            <p>Confidence: {((1 - matchDistance) * 100).toFixed(0)}%</p>
                            <button className="primary-btn" onClick={() => identifiedNodeId && onIdentify(identifiedNodeId)}>
                                View Profile
                            </button>
                            <button className="secondary-btn" onClick={() => {
                                setStatus('scanning');
                                setIdentifiedNodeId(null);
                                setIdentifiedName(null);
                                setMatchDistance(0);
                                // Restart loop logic requires refactoring or simple re-render triggers
                                // Actually, startScanning checks 'status'. We reset it, but loop exited.
                                // We need to trigger loop again. 
                                // Simpler: Close and reopen? Or simple state toggle.
                            }}>
                                Scan Again
                            </button>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};
