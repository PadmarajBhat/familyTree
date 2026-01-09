export class AudioRecorder {
    private stream: MediaStream | null = null;
    private audioContext: AudioContext | null = null;
    private processor: ScriptProcessorNode | null = null;
    private source: MediaStreamAudioSourceNode | null = null;

    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    onDataAvailable: (base64Data: string) => void = (_data) => { };

    async start() {
        this.stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        this.audioContext = new AudioContext({ sampleRate: 16000 });
        console.log("AudioContext created. Target: 16kHz, Actual:", this.audioContext.sampleRate);

        // Ensure AudioContext is running (required by some browsers)
        if (this.audioContext.state === 'suspended') {
            await this.audioContext.resume();
        }

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
        let outputData = inputData;
        const currentRate = this.audioContext?.sampleRate || 16000;

        // Simple linear resampling if not 16k
        if (currentRate !== 16000) {
            const ratio = currentRate / 16000;
            const newLength = Math.round(inputData.length / ratio);
            const result = new Float32Array(newLength);
            for (let i = 0; i < newLength; i++) {
                const index = i * ratio;
                const low = Math.floor(index);
                const high = Math.ceil(index);
                const weight = index - low;
                if (high < inputData.length) {
                    result[i] = inputData[low] * (1 - weight) + inputData[high] * weight;
                } else {
                    result[i] = inputData[low];
                }
            }
            outputData = result;
        }

        const buffer = new ArrayBuffer(outputData.length * 2);
        const view = new DataView(buffer);

        for (let i = 0; i < outputData.length; i++) {
            // Apply 1.5x gain to help with [BACKGROUND] noise issues if signal is too low
            let s = Math.max(-1, Math.min(1, outputData[i] * 1.5));
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
