export class AudioRecorder {
    private stream: MediaStream | null = null;
    private audioContext: AudioContext | null = null;
    private workletNode: AudioWorkletNode | null = null;
    private source: MediaStreamAudioSourceNode | null = null;

    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    onDataAvailable: (base64Data: string) => void = (_data) => { };

    async start() {
        try {
            this.stream = await navigator.mediaDevices.getUserMedia({
                audio: {
                    channelCount: 1,
                    sampleRate: 16000,
                    echoCancellation: true,
                    noiseSuppression: true,
                    autoGainControl: true
                }
            });
            // Try to create context with preferred rate, but browser may override
            this.audioContext = new AudioContext({ sampleRate: 16000 });
            console.log("AudioContext created. Target: 16kHz, Actual:", this.audioContext.sampleRate);

            // Ensure AudioContext is running (required by some browsers)
            if (this.audioContext.state === 'suspended') {
                await this.audioContext.resume();
            }

            // Load the AudioWorklet processor
            try {
                // Ensure proper base path for production/dev consistency
                // Vite injects BASE_URL (e.g. '/familyTree/')
                const baseUrl = import.meta.env.BASE_URL;
                const workletPath = `${baseUrl.endsWith('/') ? baseUrl : baseUrl + '/'}audio-processor.js`;
                await this.audioContext.audioWorklet.addModule(workletPath);
            } catch (e) {
                console.error("Failed to load audio worklet module:", e);
                throw e;
            }

            this.source = this.audioContext.createMediaStreamSource(this.stream);
            this.workletNode = new AudioWorkletNode(this.audioContext, 'audio-processor');

            this.workletNode.port.onmessage = (event) => {
                const inputData = event.data; // Float32Array from processor
                if (inputData && inputData.length > 0) {
                    this.processAudio(inputData);
                }
            };

            this.source.connect(this.workletNode);
            this.workletNode.connect(this.audioContext.destination); // Keep alive
        } catch (e) {
            console.error("Error accessing microphone:", e);
        }
    }

    stop() {
        if (this.stream) {
            this.stream.getTracks().forEach(track => track.stop());
            this.stream = null;
        }
        if (this.workletNode) {
            this.workletNode.disconnect();
            this.workletNode = null;
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
        const targetRate = 16000;

        if (currentRate !== targetRate) {
            // DOWN-SAMPLING (e.g. 48000 -> 16000)
            // Use averaging (simple boxcar filter) to prevent aliasing
            if (currentRate > targetRate) {
                const ratio = currentRate / targetRate;
                const newLength = Math.floor(inputData.length / ratio);
                outputData = new Float32Array(newLength);

                for (let i = 0; i < newLength; i++) {
                    const start = Math.floor(i * ratio);
                    const end = Math.floor((i + 1) * ratio);
                    let sum = 0;
                    let count = 0;
                    for (let j = start; j < end && j < inputData.length; j++) {
                        sum += inputData[j];
                        count++;
                    }
                    outputData[i] = count > 0 ? sum / count : 0;
                }
            } else {
                // UPSAMPLING (Rare case: 8000 -> 16000) - Linear interpolation is fine here
                const ratio = currentRate / targetRate;
                const newLength = Math.round(inputData.length / ratio);
                outputData = new Float32Array(newLength);
                for (let i = 0; i < newLength; i++) {
                    const index = i * ratio;
                    const low = Math.floor(index);
                    const high = Math.ceil(index);
                    const weight = index - low;
                    if (high < inputData.length) {
                        outputData[i] = inputData[low] * (1 - weight) + inputData[high] * weight;
                    } else {
                        outputData[i] = inputData[low];
                    }
                }
            }
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
