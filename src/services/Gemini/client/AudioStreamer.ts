export class AudioStreamer {
    private audioContext: AudioContext;
    private startTime: number = 0;

    constructor() {
        this.audioContext = new AudioContext({ sampleRate: 24000 }); // Response might be 24k
    }

    async playAudioChunk(base64Data: string) {
        const audioData = this.base64ToArrayBuffer(base64Data);
        // PCM data needs to be put into an AudioBuffer. 
        // Gemini sends raw PCM (Int16 usually).
        // We need to convert it to float32 for AudioContext.

        const float32Data = this.convertInt16ToFloat32(audioData);

        const audioBuffer = this.audioContext.createBuffer(1, float32Data.length, 24000);
        audioBuffer.getChannelData(0).set(float32Data);

        const source = this.audioContext.createBufferSource();
        source.buffer = audioBuffer;
        source.connect(this.audioContext.destination);

        // Simple queuing logic
        const currentTime = this.audioContext.currentTime;
        if (this.startTime < currentTime) {
            this.startTime = currentTime;
        }

        source.start(this.startTime);
        this.startTime += audioBuffer.duration;
    }

    private base64ToArrayBuffer(base64: string): ArrayBuffer {
        const binaryString = window.atob(base64);
        const len = binaryString.length;
        const bytes = new Uint8Array(len);
        for (let i = 0; i < len; i++) {
            bytes[i] = binaryString.charCodeAt(i);
        }
        return bytes.buffer;
    }

    private convertInt16ToFloat32(buffer: ArrayBuffer): Float32Array {
        const int16View = new Int16Array(buffer);
        const float32View = new Float32Array(int16View.length);
        for (let i = 0; i < int16View.length; i++) {
            float32View[i] = int16View[i] / 32768.0;
        }
        return float32View;
    }
}
