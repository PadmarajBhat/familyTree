export class AudioRecorder {
    private stream: MediaStream | null = null;
    private audioContext: AudioContext | null = null;
    private processor: ScriptProcessorNode | null = null;
    private source: MediaStreamAudioSourceNode | null = null;

    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    onDataAvailable: (base64Data: string) => void = (_data) => { };

    async start() {
        this.stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        this.audioContext = new AudioContext({ sampleRate: 16000 }); // Gemini prefers 16k or 24k
        this.source = this.audioContext.createMediaStreamSource(this.stream);

        // Use ScriptProcessor for legacy browser support/simplicity in extraction
        // In product, AudioWorklet is better but this is a direct port/simplification
        this.processor = this.audioContext.createScriptProcessor(4096, 1, 1);

        this.processor.onaudioprocess = (e) => {
            const inputData = e.inputBuffer.getChannelData(0);
            this.processAudio(inputData);
        };

        this.source.connect(this.processor);
        this.processor.connect(this.audioContext.destination); // create connection to hear? No, just keep alive.
        // Actually, connecting to destination might cause feedback loop if playing back.
        // Better to connect to a mute destination or just let it run.
        // In many browsers, ScriptProcessor stops if not connected to destination.
        // We will handle echo cancellation via getUserMedia constraints ideally, 
        // but here we just process.
    }

    stop() {
        if (this.stream) {
            this.stream.getTracks().forEach(track => track.stop());
            this.stream = null;
        }
        if (this.processor) {
            this.processor.disconnect();
            this.processor = null;
        }
        if (this.source) {
            this.source.disconnect();
            this.source = null;
        }
        if (this.audioContext) {
            this.audioContext.close();
            this.audioContext = null;
        }
    }

    private processAudio(inputData: Float32Array) {
        // Convert Float32 to Int16 PCM (Little Endian)
        const buffer = new ArrayBuffer(inputData.length * 2);
        const view = new DataView(buffer);

        for (let i = 0; i < inputData.length; i++) {
            let s = Math.max(-1, Math.min(1, inputData[i]));
            // s = s < 0 ? s * 0x8000 : s * 0x7FFF;
            // view.setInt16(i * 2, s, true);
            const int16 = s < 0 ? s * 0x8000 : s * 0x7FFF;
            view.setInt16(i * 2, int16, true);
        }

        // Convert to Base64
        const base64 = this.arrayBufferToBase64(buffer);
        this.onDataAvailable(base64);
    }

    private arrayBufferToBase64(buffer: ArrayBuffer): string {
        let binary = '';
        const bytes = new Uint8Array(buffer);
        const len = bytes.byteLength;
        for (let i = 0; i < len; i++) {
            binary += String.fromCharCode(bytes[i]);
        }
        return window.btoa(binary);
    }
}
