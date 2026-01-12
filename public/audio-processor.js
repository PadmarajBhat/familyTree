class AudioProcessor extends AudioWorkletProcessor {
    constructor() {
        super();
        this.bufferSize = 2048;
        this.buffer = new Float32Array(this.bufferSize);
        this.bufferIndex = 0;
    }

    process(inputs, outputs, parameters) {
        const input = inputs[0];
        if (!input || !input[0]) return true;

        const inputData = input[0];

        // Fill buffer
        for (let i = 0; i < inputData.length; i++) {
            this.buffer[this.bufferIndex++] = inputData[i];
            if (this.bufferIndex >= this.bufferSize) {
                this.flush();
            }
        }

        return true;
    }

    flush() {
        // We send the buffer to the main thread for processing (resampling/encoding)
        // Or we could do simple checking here.
        // Ideally we want to match the 4096 chunk size the original code used.
        this.port.postMessage(this.buffer.slice(0, this.bufferIndex));
        this.bufferIndex = 0;
    }
}

registerProcessor('audio-processor', AudioProcessor);
