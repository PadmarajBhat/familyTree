import React from 'react';

interface MediaSectionProps {
    // Image Props
    imagePreview: string | null;
    onImageChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
    imageInputRef: React.RefObject<HTMLInputElement | null>;
    cameraInputRef: React.RefObject<HTMLInputElement | null>;

    // Video Props
    isRecording: boolean;
    videoPreview: string | null;
    recordingTime: number;
    videoRef: React.RefObject<HTMLVideoElement | null>;
    playbackRef: React.RefObject<HTMLVideoElement | null>;
    onStartRecording: () => void;
    onStopRecording: () => void;
    onRetakeRecording: () => void; // Usually just startRecording again
    onClearVideo: () => void;
    onCaptureFrame: () => void;
}

export const MediaSection: React.FC<MediaSectionProps> = ({
    imagePreview,
    onImageChange,
    imageInputRef,
    cameraInputRef,
    isRecording,
    videoPreview,
    recordingTime,
    videoRef,
    playbackRef,
    onStartRecording,
    onStopRecording,
    onRetakeRecording,
    onClearVideo,
    onCaptureFrame
}) => {
    return (
        <>
            <div className="form-group image-upload" style={{ display: 'flex', flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: '20px', marginBottom: '20px' }}>
                <button type="button" onClick={() => cameraInputRef.current?.click()} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', border: 'none', background: 'none', cursor: 'pointer', padding: '10px' }}>
                    <div style={{ background: '#e3f2fd', width: '50px', height: '50px', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: '5px', boxShadow: '0 2px 5px rgba(0,0,0,0.1)' }}>
                        <span style={{ fontSize: '24px' }}>📷</span>
                    </div>
                    <span style={{ fontSize: '12px', color: '#666', fontWeight: '500' }}>Camera</span>
                </button>

                <div
                    className="image-preview"
                    style={{
                        width: '120px',
                        height: '120px',
                        borderRadius: '50%',
                        border: '4px solid #fff',
                        boxShadow: '0 4px 10px rgba(0,0,0,0.1)',
                        backgroundImage: imagePreview ? `url(${imagePreview})` : 'none',
                        backgroundSize: 'cover',
                        backgroundPosition: 'center',
                        backgroundColor: '#f0f2f5',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        flexShrink: 0,
                        margin: '0'
                    }}
                >
                    {!imagePreview && <span style={{ fontSize: '12px', color: '#999', textAlign: 'center' }}>No Photo</span>}
                </div>

                <button type="button" onClick={() => imageInputRef.current?.click()} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', border: 'none', background: 'none', cursor: 'pointer', padding: '10px' }}>
                    <div style={{ background: '#e3f2fd', width: '50px', height: '50px', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: '5px', boxShadow: '0 2px 5px rgba(0,0,0,0.1)' }}>
                        <span style={{ fontSize: '24px' }}>🖼️</span>
                    </div>
                    <span style={{ fontSize: '12px', color: '#666', fontWeight: '500' }}>Gallery</span>
                </button>

                <input
                    type="file"
                    accept="image/*"
                    ref={imageInputRef}
                    onChange={onImageChange}
                    style={{ display: 'none' }}
                />
                <input
                    type="file"
                    accept="image/*"
                    capture="environment"
                    ref={cameraInputRef}
                    onChange={onImageChange}
                    style={{ display: 'none' }}
                />
            </div>

            {/* Video Recording Section */}
            <div className="form-group video-section" style={{ textAlign: 'center', marginBottom: '20px' }}>
                {!isRecording && !videoPreview && (
                    <button type="button" onClick={onStartRecording} className="secondary-btn" style={{ background: '#fce4ec', color: '#c2185b', border: '1px solid #f8bbd0' }}>
                        🎥 Record 15s Video Profile
                    </button>
                )}

                {isRecording && (
                    <div className="recording-container" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                        <video ref={videoRef} autoPlay muted playsInline style={{ width: '100%', maxWidth: '300px', borderRadius: '8px', border: '2px solid #e91e63' }} />
                        <div style={{ marginTop: '10px', display: 'flex', gap: '10px', alignItems: 'center' }}>
                            <span style={{ color: '#e91e63', fontWeight: 'bold' }}>🔴 Recording: {recordingTime}s / 15s</span>
                            <button type="button" onClick={onStopRecording} className="primary-btn" style={{ background: '#e91e63' }}>Stop</button>
                        </div>
                    </div>
                )}

                {!isRecording && videoPreview && (
                    <div className="preview-container" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                        <video ref={playbackRef} src={videoPreview} controls style={{ width: '100%', maxWidth: '300px', borderRadius: '8px', marginBottom: '10px' }} />
                        <div style={{ display: 'flex', gap: '10px' }}>
                            <button type="button" onClick={onRetakeRecording} className="secondary-btn">Retake</button>
                            <button type="button" onClick={onClearVideo} className="secondary-btn">Clear</button>
                            <button type="button" onClick={onCaptureFrame} className="primary-btn" title="Extract smiling photo">📸 Use Frame as Photo</button>
                        </div>
                    </div>
                )}
            </div>
        </>
    );
};
