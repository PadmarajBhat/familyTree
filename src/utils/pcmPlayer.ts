
export class PCMPlayer {
    private audioCtx: AudioContext;
    private sampleRate: number;
    private nextStartTime: number = 0;

    constructor(sampleRate: number = 24000) {
        this.sampleRate = sampleRate;
        this.audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
    }

    public async play(base64Data: string) {
        if (this.audioCtx.state === 'suspended') {
            await this.audioCtx.resume();
        }

        const binaryString = window.atob(base64Data);
        const len = binaryString.length;
        const bytes = new Uint8Array(len);
        for (let i = 0; i < len; i++) {
            bytes[i] = binaryString.charCodeAt(i);
        }

        // Convert 16-bit PCM little-endian to Float32
        const int16 = new Int16Array(bytes.buffer);
        const float32 = new Float32Array(int16.length);
        for (let i = 0; i < int16.length; i++) {
            float32[i] = int16[i] / 32768.0;
        }

        const buffer = this.audioCtx.createBuffer(1, float32.length, this.sampleRate);
        buffer.copyToChannel(float32, 0, 0);

        const source = this.audioCtx.createBufferSource();
        source.buffer = buffer;
        source.connect(this.audioCtx.destination);

        const currentTime = this.audioCtx.currentTime;
        if (this.nextStartTime < currentTime) {
            this.nextStartTime = currentTime;
        }

        source.start(this.nextStartTime);
        this.nextStartTime += buffer.duration;
    }

    public stop() {
        if (this.audioCtx) {
            this.audioCtx.close();
        }
    }
}
