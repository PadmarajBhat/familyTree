# Gemini Live Modality & Connection History

This file tracks the attempts and changes made to the Gemini Live API connection configuration, specifically regarding `responseModalities` and schema types.

## Change Log

### 2026-01-02 22:00 (Latest)
- **Status**: Working
- **Changes**:
    - Converted `responseModalities` from `["AUDIO", "TEXT"]` to `["audio", "text"]`.
    - Converted all schema `type` declarations in tools (e.g., `OBJECT`, `STRING`, `INTEGER`) to lowercase (`object`, `string`, `integer`).
    - Fixed broken syntax in `useGeminiLive.ts` tool declarations.
- **Outcome**: Connection successful, `1007: Request contains an invalid argument` error resolved.

### Previous Attempts (Summary)
- Attempted `["AUDIO", "TEXT"]` -> Resulted in `1007` error.
- Attempted `["AUDIO"]` only -> Worked previously but lacked text feedback.
- Attempted `["TEXT"]` only -> Worked for text but no voice output.
- Refactored code (simplified hooks) which occasionally led to syntax errors in tool definitions.

---

## Audio Streaming & Worklets (Investigation)

### Current State
- **User Input (Microphone)**: 
    - Uses `AudioRecorder` with `AudioProcessingWorklet` (assigned to `AudioRecordingWorklet`).
    - **Capability**: It successfully collects "streaming bytes" in 2048-sample chunks (Int16Array) and converts them to Base64 for the API.
    - **Status**: Functional and properly wired in `useGeminiLive.ts`.
- **Model Output (Speakers)**:
    - Uses `AudioStreamer` which consumes raw `ArrayBuffer` from the `onAudio` event.
    - **Current Worklets**: Only `vol-meter` (vumeter-out) is attached to the output stream to provide real-time volume levels.
    - **Capability**: The `AudioStreamer` structure supports additional worklets. If we need to "capture" or "collect" the bytes being played back (the model's partial audio output), we can attach another `AudioProcessingWorklet` to the `audio-out` context.

### Findings
The "new" worklet system (using `AudioWorkletNode` and `audioworklet-registry.ts`) is more robust than older script-based processors. It allows multiple handlers to be attached to the same worklet and supports bidirectional communication via `MessagePort`. 

*Note: If "partial output" refers to the model's text responses, these are collected in the `onContent` handler in `useGeminiLive.ts` and appended to the logs.*

---
*Note: The Gemini Live API is sensitive to string casing in the JSON configuration. Always use lowercase for types and modalities.*

