import type { MultimodalLiveResponseMessage } from '../types';

export function parseServerMessage(data: any, onMessage: (msg: MultimodalLiveResponseMessage) => void) {
    if (data.setupComplete) {
        onMessage({ type: "SETUP_COMPLETE", data });
        return;
    }

    const toolCall = data.toolCall || data.tool_call;
    if (toolCall?.functionCalls || toolCall?.function_calls) {
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
            } else if (part.text) {
                onMessage({ type: "TEXT", data: part.text, endOfTurn });
            } else if (part.functionCall) {
                onMessage({ type: "TOOL_CALL", data: part.functionCall, endOfTurn });
            }
        }
    }

    if (endOfTurn && !serverContent?.inputTranscription && !serverContent?.outputTranscription && !modelTurn && !toolCall) {
        onMessage({ type: "TURN_COMPLETE", endOfTurn: true });
    }
}
