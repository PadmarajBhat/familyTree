export interface LogEntry {
    type: 'info' | 'user' | 'model' | 'tool-call' | 'tool-response';
    text: string;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    data?: any;
    timestamp: Date;
}
