export type MultimodalLiveResponseType =
    | "TEXT"
    | "AUDIO"
    | "SETUP_COMPLETE"
    | "INTERRUPTED"
    | "TURN_COMPLETE"
    | "TOOL_CALL"
    | "ERROR"
    | "INPUT_TRANSCRIPTION"
    | "OUTPUT_TRANSCRIPTION";

export interface LiveConfig {
    model: string;
    systemInstruction?: { parts: { text: string }[] };
    generationConfig?: {
        responseModalities?: "audio" | "image" | "text"[];
        speechConfig?: {
            voiceConfig?: {
                prebuiltVoiceConfig?: {
                    voiceName: string;
                };
            };
        };
    };
}

export interface MultimodalLiveResponseMessage {
    type: MultimodalLiveResponseType;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    data?: any;
    endOfTurn?: boolean;
}
