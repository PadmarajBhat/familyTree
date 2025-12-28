

export class AudioService {
    private audioContext: AudioContext | null = null;
    private mediaStream: MediaStream | null = null;
    private processor: ScriptProcessorNode | AudioWorkletNode | null = null;
    private onAudioData: (base64Data: string) => void;
    private onError: (error: string) => void;

    constructor(onAudioData: (base64Data: string) => void, onError: (error: string) => void) {
        this.onAudioData = onAudioData;
        this.onError = onError;
    }

    public async start() {
        try {
            this.mediaStream = await navigator.mediaDevices.getUserMedia({
                audio: {
                    channelCount: 1,
                    sampleRate: 16000
                }
            });

            this.audioContext = new AudioContext({ sampleRate: 16000 });
            if (!this.audioContext) {
                this.onError("Failed to create AudioContext");
                return;
            }

            try {
                await this.audioContext.audioWorklet.addModule('audio-processor.js');
            } catch (e) {
                console.error("Failed to load audio-processor.js", e);
            }

            const source = this.audioContext.createMediaStreamSource(this.mediaStream);
            const workletNode = new AudioWorkletNode(this.audioContext, 'audio-processor');

            workletNode.port.onmessage = (event) => {
                const inputData = event.data;
                const pcmData = this.floatTo16BitPCM(inputData);
                const base64Audio = this.arrayBufferToBase64(pcmData);
                this.onAudioData(base64Audio);
            };

            source.connect(workletNode);
            workletNode.connect(this.audioContext.destination);
            this.processor = workletNode as unknown as ScriptProcessorNode;

        } catch (e) {
            console.error("Audio Access Error", e);
            this.onError("Audio Access Error");
        }
    }

    public stop() {
        if (this.processor) {
            this.processor.disconnect();
            this.processor = null;
        }
        if (this.mediaStream) {
            this.mediaStream.getTracks().forEach(track => track.stop());
            this.mediaStream = null;
        }
        if (this.audioContext) {
            this.audioContext.close();
            this.audioContext = null;
        }
    }

    private floatTo16BitPCM(output: Float32Array) {
        const buffer = new ArrayBuffer(output.length * 2);
        const view = new DataView(buffer);
        for (let i = 0; i < output.length; i++) {
            const s = Math.max(-1, Math.min(1, output[i]));
            view.setInt16(i * 2, s < 0 ? s * 0x8000 : s * 0x7FFF, true);
        }
        return buffer;
    }

    private arrayBufferToBase64(buffer: ArrayBuffer) {
        let binary = '';
        const bytes = new Uint8Array(buffer);
        const len = bytes.byteLength;
        for (let i = 0; i < len; i++) {
            binary += String.fromCharCode(bytes[i]);
        }
        return window.btoa(binary);
    }
}
