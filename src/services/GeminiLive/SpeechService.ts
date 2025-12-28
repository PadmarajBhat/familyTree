import type { LogEntry } from './types';

export class SpeechService {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    private recognition: any | null = null;
    private onTranscript: (text: string, isFinal: boolean) => void;
    private onLog: (entry: LogEntry) => void;
    private shouldRestart: boolean = false;

    constructor(onTranscript: (text: string, isFinal: boolean) => void, onLog: (entry: LogEntry) => void) {
        this.onTranscript = onTranscript;
        this.onLog = onLog;
    }

    public start() {
        if ('webkitSpeechRecognition' in window || 'SpeechRecognition' in window) {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
            this.recognition = new SpeechRecognition();
            this.recognition.continuous = true;
            this.recognition.interimResults = true;

            this.recognition.onstart = () => {
                console.log("Speech Recognition Started");
                this.shouldRestart = true;
            };

            this.recognition.onerror = (event: any) => {
                console.error("Speech Recognition Error", event.error);
                if (event.error === 'not-allowed') {
                    this.onLog({ type: 'info', text: 'Microphone access denied for transcription.', timestamp: new Date() });
                    this.shouldRestart = false;
                }

                // Prevent infinite loop on network errors
                if (event.error === 'network') {
                    console.warn("Network error in speech recognition. Stopping auto-restart.");
                    this.shouldRestart = false;
                    this.onLog({ type: 'info', text: 'Speech recognition stopped due to network error.', timestamp: new Date() });
                }
            };

            this.recognition.onend = () => {
                console.log("Speech Recognition Ended");
                // Auto-restart if we rely on it
                if (this.shouldRestart) {
                    console.log("Restarting Speech Recognition...");
                    try {
                        this.recognition.start();
                    } catch (e) {
                        // Ignore
                    }
                }
            };

            this.recognition.onresult = (event: any) => {
                let finalTranscript = '';
                let interimTranscript = '';

                for (let i = event.resultIndex; i < event.results.length; ++i) {
                    if (event.results[i].isFinal) {
                        finalTranscript += event.results[i][0].transcript;
                    } else {
                        interimTranscript += event.results[i][0].transcript;
                    }
                }

                if (finalTranscript) {
                    this.onTranscript(finalTranscript, true);
                } else if (interimTranscript) {
                    this.onTranscript(interimTranscript, false);
                }
            };

            try {
                this.recognition.start();
            } catch (e) {
                console.error("Failed to start recognition", e);
            }
        } else {
            console.warn("Speech Recognition API not supported in this browser.");
            this.onLog({ type: 'info', text: 'Browser does not support Speech Recognition.', timestamp: new Date() });
        }
    }

    public stop() {
        this.shouldRestart = false;
        if (this.recognition) {
            // disable handler to avoid restart loop during manual stop
            this.recognition.onend = null;
            try {
                this.recognition.stop();
            } catch (e) {/* ignore */ }
            this.recognition = null;
        }
    }
}
