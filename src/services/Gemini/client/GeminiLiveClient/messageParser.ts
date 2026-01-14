import type { MultimodalLiveResponseMessage } from '../types';

export function parseServerMessage(data: any, onMessage: (msg: MultimodalLiveResponseMessage) => void) {
    if (data.setupComplete) {
        onMessage({ type: "SETUP_COMPLETE", data });
        return;
    }

    const toolCall = data.toolCall || data.tool_call;
    const parsedToolCall = !!(toolCall?.functionCalls || toolCall?.function_calls);
    if (parsedToolCall) {
        const calls = toolCall.functionCalls || toolCall.function_calls;
        for (const call of calls) {
            onMessage({
                type: "TOOL_CALL",
                data: call,
                endOfTurn: data.serverContent?.turnComplete || false
            });
        }
    }

    const serverContent = data.serverContent;
    if (!serverContent && !data.toolCall && !data.tool_call) return;

    const endOfTurn = serverContent?.turnComplete || false;

    if (serverContent?.inputTranscription) {
        onMessage({
            type: "INPUT_TRANSCRIPTION",
            data: { text: serverContent.inputTranscription.text, isFinal: true },
            endOfTurn
        });
    }

    if (serverContent?.outputTranscription) {
        onMessage({
            type: "OUTPUT_TRANSCRIPTION",
            data: { text: serverContent.outputTranscription.text, isFinal: true },
            endOfTurn
        });
    }

    const modelTurn = serverContent?.modelTurn;
    if (modelTurn?.parts) {
        for (const part of modelTurn.parts) {
            if (part.inlineData) {
                onMessage({ type: "AUDIO", data: part.inlineData.data, endOfTurn });
                onMessage({ type: "TEXT", data: part.text, endOfTurn });
            } else if (part.functionCall) {
                // If we already parsed a top-level toolCall, ignoring this to prevent duplicates
                if (parsedToolCall) {
                    console.log("ℹ️ Ignoring modelTurn.functionCall because top-level toolCall was present.");
                } else {
                    // It's the only one we have, so use it. It's not necessarily "legacy" if the API chooses to send it here.
                    // console.log("ℹ️ Using functionCall from modelTurn.");
                    onMessage({ type: "TOOL_CALL", data: part.functionCall, endOfTurn });
                }
            }
        }
    }

    if (endOfTurn && !serverContent?.inputTranscription && !serverContent?.outputTranscription && !modelTurn && !toolCall) {
        onMessage({ type: "TURN_COMPLETE", endOfTurn: true });
    }
}
