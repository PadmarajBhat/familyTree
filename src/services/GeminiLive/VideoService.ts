export class VideoService {
    private videoStream: MediaStream | null = null;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    private videoInterval: any | null = null;
    private onFrame: (base64Data: string) => void;
    private onError: (error: string) => void;

    constructor(onFrame: (base64Data: string) => void, onError: (error: string) => void) {
        this.onFrame = onFrame;
        this.onError = onError;
    }

    public async start() {
        try {
            this.videoStream = await navigator.mediaDevices.getUserMedia({
                video: {
                    width: { ideal: 640 },
                    height: { ideal: 480 },
                    frameRate: { ideal: 5 }
                }
            });

            const track = this.videoStream.getVideoTracks()[0];
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const imageCapture = new (window as any).ImageCapture(track);

            this.videoInterval = setInterval(async () => {
                try {
                    const blob = await imageCapture.takePhoto();
                    const base64 = await this.blobToBase64(blob);
                    this.onFrame(base64);
                } catch (e) {
                    console.error("Frame capture error", e);
                }
            }, 1000); // 1 FPS
        } catch (e) {
            console.error("Video Access Error", e);
            this.onError("Video Access Error");
        }
    }

    public stop() {
        if (this.videoInterval) {
            clearInterval(this.videoInterval);
            this.videoInterval = null;
        }
        if (this.videoStream) {
            this.videoStream.getTracks().forEach(track => track.stop());
            this.videoStream = null;
        }
    }

    private blobToBase64(blob: Blob): Promise<string> {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onloadend = () => {
                const result = reader.result as string;
                // remove data:image/jpeg;base64,
                const base64 = result.split(',')[1];
                resolve(base64);
            };
            reader.onerror = reject;
            reader.readAsDataURL(blob);
        });
    }
}
