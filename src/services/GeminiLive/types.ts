export interface LogEntry {
    type: 'info' | 'user' | 'model' | 'tool-call' | 'tool-response';
    text: string;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    data?: any;
    timestamp: Date;
}

export interface ToolResult {
    success: boolean;
    message: string;
    nodeId?: string;
}

import type {
    GoogleGenAIOptions,
    LiveClientToolResponse,
    LiveServerMessage,
    Part,
} from "@google/genai";

/**
 * the options to initiate the client, ensure apiKey is required
 */
export type LiveClientOptions = GoogleGenAIOptions & { apiKey: string };

/** log types */
export type StreamingLog = {
    date: Date;
    type: string;
    count?: number;
    message:
    | string
    | ClientContentLog
    | Omit<LiveServerMessage, "text" | "data">
    | LiveClientToolResponse;
};

export type ClientContentLog = {
    turns: Part[];
    turnComplete: boolean;
};
