import type {
    LiveServerContent,
    LiveServerToolCall,
    LiveServerToolCallCancellation
} from "@google/genai";
import type { StreamingLog } from "../../types";

/**
 * Event types that can be emitted by the MultimodalLiveClient.
 * Each event corresponds to a specific message from GenAI or client state change.
 */
export interface LiveClientEventTypes {
    // Emitted when audio data is received
    audio: (data: ArrayBuffer) => void;
    // Emitted when the connection closes
    close: (event: CloseEvent) => void;
    // Emitted when content is received from the server
    content: (data: LiveServerContent) => void;
    // Emitted when an error occurs
    error: (error: ErrorEvent) => void;
    // Emitted when the server interrupts the current generation
    interrupted: () => void;
    // Emitted for logging events
    log: (log: StreamingLog) => void;
    // Emitted when the connection opens
    open: () => void;
    // Emitted when the initial setup is complete
    setupcomplete: () => void;
    // Emitted when a tool call is received
    toolcall: (toolCall: LiveServerToolCall) => void;
    // Emitted when a tool call is cancelled
    toolcallcancellation: (
        toolcallCancellation: LiveServerToolCallCancellation
    ) => void;
    // Emitted when the current turn is complete
    turncomplete: () => void;
}

export interface LiveGenerationConfig {
    responseModalities: "audio"[];
    speechConfig?: {
        voiceConfig: {
            prebuiltVoiceConfig: {
                voiceName: string;
            };
        };
    };
    inputAudioTranscription?: {
        model?: string;
    };
    outputAudioTranscription?: {
        model?: string;
    };
}
