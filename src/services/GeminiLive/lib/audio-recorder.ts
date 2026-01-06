/**
 * Copyright 2024 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

import { audioContext } from "./utils";
import AudioRecordingWorklet from "./worklets/audio-processing";
import VolMeterWorket from "./worklets/vol-meter";

import { createWorketFromSrc } from "./audioworklet-registry";
import EventEmitter from "eventemitter3";

function arrayBufferToBase64(buffer: ArrayBuffer) {
    var binary = "";
    var bytes = new Uint8Array(buffer);
    var len = bytes.byteLength;
    for (var i = 0; i < len; i++) {
        binary += String.fromCharCode(bytes[i]);
    }
    return window.btoa(binary);
}

function downsampleBuffer(buffer: ArrayBuffer, inputRate: number, outputRate: number = 16000): ArrayBuffer {
    if (outputRate >= inputRate) return buffer;

    const ratio = inputRate / outputRate;
    const inputData = new Int16Array(buffer);
    const outputLength = Math.ceil(inputData.length / ratio);
    const outputData = new Int16Array(outputLength);

    for (let i = 0; i < outputLength; i++) {
        const offset = i * ratio;
        const index = Math.floor(offset);
        const nextIndex = Math.min(index + 1, inputData.length - 1);
        const weight = offset - index;

        outputData[i] = inputData[index] * (1 - weight) + inputData[nextIndex] * weight;
    }
    return outputData.buffer;
}

export class AudioRecorder extends EventEmitter {
    stream: MediaStream | undefined;
    audioContext: AudioContext | undefined;
    source: MediaStreamAudioSourceNode | undefined;
    recording: boolean = false;
    recordingWorklet: AudioWorkletNode | undefined;
    vuWorklet: AudioWorkletNode | undefined;

    private starting: Promise<void> | null = null;
    public sampleRate: number;

    constructor(sampleRate = 16000) {
        super();
        this.sampleRate = sampleRate;
    }

    async start() {
        if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
            throw new Error("Could not request user media");
        }

        this.starting = new Promise(async (resolve) => {
            this.stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            this.audioContext = await audioContext({ sampleRate: this.sampleRate });
            this.source = this.audioContext.createMediaStreamSource(this.stream);

            const workletName = "audio-recorder-worklet";
            const src = createWorketFromSrc(workletName, AudioRecordingWorklet);

            await this.audioContext.audioWorklet.addModule(src);
            this.recordingWorklet = new AudioWorkletNode(
                this.audioContext,
                workletName,
            );

            this.recordingWorklet.port.onmessage = async (ev: MessageEvent) => {
                // worklet processes recording floats and messages converted buffer
                let arrayBuffer = ev.data.data.int16arrayBuffer;

                if (arrayBuffer && this.audioContext) {
                    // DOWNSAMPLE if needed (e.g. 48k -> 16k)
                    arrayBuffer = downsampleBuffer(arrayBuffer, this.audioContext.sampleRate, this.sampleRate);

                    // DEBUG: Check Audio Energy (RMS)
                    const pcmData = new Int16Array(arrayBuffer);
                    let sum = 0;
                    for (let i = 0; i < pcmData.length; i++) {
                        sum += pcmData[i] * pcmData[i];
                    }
                    const rms = Math.sqrt(sum / pcmData.length);
                    // Only log if meaningful signal
                    if (rms > 100) {
                        console.log(`[AudioRecorder] RMS: ${Math.round(rms)} | SampleRate: ${this.audioContext.sampleRate}->${this.sampleRate}`);
                    }

                    const arrayBufferString = arrayBufferToBase64(arrayBuffer);
                    this.emit("data", arrayBufferString);
                }
            };
            this.source.connect(this.recordingWorklet);

            // vu meter worklet
            const vuWorkletName = "vu-meter";
            await this.audioContext.audioWorklet.addModule(
                createWorketFromSrc(vuWorkletName, VolMeterWorket),
            );
            this.vuWorklet = new AudioWorkletNode(this.audioContext, vuWorkletName);
            this.vuWorklet.port.onmessage = (ev: MessageEvent) => {
                this.emit("volume", ev.data.volume);
            };

            this.source.connect(this.vuWorklet);
            this.recording = true;
            resolve();
            this.starting = null;
        });
    }

    stop() {
        // its plausible that stop would be called before start completes
        // such as if the websocket immediately hangs up
        const handleStop = () => {
            this.source?.disconnect();
            this.stream?.getTracks().forEach((track) => track.stop());
            this.stream = undefined;
            this.recordingWorklet = undefined;
            this.vuWorklet = undefined;
        };
        if (this.starting) {
            this.starting.then(handleStop);
            return;
        }
        handleStop();
    }
}
