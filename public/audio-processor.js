class AudioProcessor extends AudioWorkletProcessor {
    constructor() {
        super();
        this.bufferSize = 4096;
        this._buffer = new Float32Array(this.bufferSize);
        this._bytesWritten = 0;
    }

    process(inputs, outputs, parameters) {
        const input = inputs[0];
        if (!input || input.length === 0) return true;

        const channelData = input[0];

        // Append to buffer
        for (let i = 0; i < channelData.length; i++) {
            this._buffer[this._bytesWritten++] = channelData[i];

            // If buffer is full, flush it
            if (this._bytesWritten >= this.bufferSize) {
                this.port.postMessage(this._buffer.slice());
                this._bytesWritten = 0;
            }
        }

        return true;
    }
}

registerProcessor('audio-processor', AudioProcessor);
