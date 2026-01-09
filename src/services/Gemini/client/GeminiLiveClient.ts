import type { MultimodalLiveResponseMessage } from './types';

export class GeminiLiveClient {
    public onOpen: () => void = () => { };
    public onClose: (event: CloseEvent) => void = () => { };
    public onMessage: (message: MultimodalLiveResponseMessage) => void = () => { };
    public onError: (error: Event) => void = () => { };

    private ws: WebSocket | null = null;
    private url: string;
    private project: string;
    private model: string;
    private connected: boolean = false;
    private systemInstruction: string;
    private voiceName: string;

    constructor(url: string, project: string, model: string, systemInstruction: string, voiceName: string = "Puck") {
        this.url = url;
        this.project = project;
        this.model = model;
        this.systemInstruction = systemInstruction;
        this.voiceName = voiceName;
    }

    connect() {
        if (this.connected) return;

        console.log("Connecting to Gemini Live Backend:", this.url);
        this.ws = new WebSocket(this.url);

        this.ws.onopen = () => {
            console.log("WebSocket Connected");
            this.connected = true;
            this.sendSetupMessage(); // Send setup immediately on connect
            this.onOpen();
        };

        this.ws.onclose = (event) => {
            console.log("WebSocket Closed", event);
            this.connected = false;
            this.onClose(event);
        };

        this.ws.onerror = (event) => {
            console.error("WebSocket Error", event);
            this.onError(event);
        };

        this.ws.onmessage = (event) => {
            try {
                const data = JSON.parse(event.data);
                this.handleServerMessage(data);
            } catch (e) {
                console.error("Failed to parse message", e);
            }
        };
    }

    disconnect() {
        if (this.ws) {
            this.ws.close();
            this.ws = null;
            this.connected = false;
        }
    }

    sendAudioChunk(base64Audio: string) {
        if (!this.connected || !this.ws) return;

        const message = {
            realtime_input: {
                media_chunks: [
                    {
                        mime_type: "audio/pcm",
                        data: base64Audio
                    }
                ]
            }
        };
        this.ws.send(JSON.stringify(message));
    }

    sendTextMessage(text: string) {
        if (!this.connected || !this.ws) return;

        const message = {
            client_content: {
                turns: [
                    {
                        role: "user",
                        parts: [{ text: text }]
                    }
                ],
                turn_complete: true
            }
        };
        this.ws.send(JSON.stringify(message));
    }

    private sendSetupMessage() {
        if (!this.ws) return;

        // 1. Send Service URL/Setup
        // The backend expects a specific first message to set up the proxy or just standard setup
        // Looking at server.py: Expects { bearer_token, service_url } usually if it's the specific proxy from demo.
        // Wait, the server.py I copied IS the proxy from demo.
        // It expects:
        // { bearer_token: optional (server gen), service_url: string }

        const serviceUrl = `wss://us-central1-aiplatform.googleapis.com/ws/google.cloud.aiplatform.v1beta1.LlmBidiService/BidiGenerateContent`;

        const setupMsg = {
            service_url: serviceUrl
            // bearer_token: we let server generate it
        };
        this.ws.send(JSON.stringify(setupMsg));

        // 2. Send Session Setup (Model Config)
        const modelUri = `projects/${this.project}/locations/us-central1/publishers/google/models/${this.model}`;

        const sessionSetup = {
            setup: {
                model: modelUri,
                generation_config: {
                    response_modalities: ["AUDIO"],
                    speech_config: {
                        voice_config: {
                            prebuilt_voice_config: {
                                voice_name: this.voiceName
                            }
                        }
                    }
                },
                system_instruction: {
                    parts: [{ text: this.systemInstruction }]
                },
                tools: [
                    {
                        function_declarations: [
                            {
                                name: "get_person_details",
                                description: "Fetch detailed information about a person (DOB, Location, Education, Hobbies, etc.) using their NodeID.",
                                parameters: {
                                    type: "OBJECT",
                                    properties: {
                                        node_id: { type: "STRING", description: "The unique ID of the person." }
                                    },
                                    required: ["node_id"]
                                }
                            },
                            {
                                name: "add_person",
                                description: "Add a new family member to the tree. You can also provide initial details like phone, email, or DOB.",
                                parameters: {
                                    type: "OBJECT",
                                    properties: {
                                        name: { type: "STRING", description: "Full name of the person." },
                                        gender: { type: "STRING", enum: ["male", "female", "other"], description: "Gender of the person." },
                                        relation: { type: "STRING", description: "Relation (e.g., father, wife, son, daughter)." },
                                        anchor_node_id: { type: "STRING", description: "The ID of the existing family member this person is related to." },
                                        phone: { type: "STRING", description: "Phone number (optional)." },
                                        email: { type: "STRING", description: "Email address (optional)." },
                                        dob: { type: "STRING", description: "Date of birth in YYYY-MM-DD format (optional)." }
                                    },
                                    required: ["name", "gender", "relation", "anchor_node_id"]
                                }
                            },
                            {
                                name: "update_person",
                                description: "Update or correct information for an existing family member. Use this to set DOB, DOD, Gender, Contact Info, Hobbies, Education, Occupation, and Location.",
                                parameters: {
                                    type: "OBJECT",
                                    properties: {
                                        node_id: { type: "STRING", description: "The unique ID of the person to update." },
                                        updates: {
                                            type: "OBJECT",
                                            description: "Fields to update.",
                                            properties: {
                                                name: { type: "STRING" },
                                                gender: { type: "STRING", enum: ["male", "female", "other"] },
                                                phone: { type: "STRING" },
                                                email: { type: "STRING" },
                                                dob: { type: "STRING", description: "Date of birth (YYYY-MM-DD)" },
                                                dod: { type: "STRING", description: "Date of death (YYYY-MM-DD)" },
                                                hobbies: { type: "ARRAY", items: { type: "STRING" } },
                                                education: {
                                                    type: "ARRAY",
                                                    items: {
                                                        type: "OBJECT",
                                                        properties: {
                                                            degree: { type: "STRING" },
                                                            major: { type: "STRING" }
                                                        }
                                                    }
                                                },
                                                occupation: {
                                                    type: "OBJECT",
                                                    properties: {
                                                        role: { type: "STRING" },
                                                        organization: { type: "STRING" }
                                                    }
                                                },
                                                notes: { type: "STRING" },
                                                address: {
                                                    type: "OBJECT",
                                                    properties: {
                                                        freeform: { type: "STRING" }
                                                    }
                                                },
                                                location: {
                                                    type: "OBJECT",
                                                    properties: {
                                                        zipcode: { type: "STRING" },
                                                        district: { type: "STRING" },
                                                        state: { type: "STRING" },
                                                        country: { type: "STRING" }
                                                    }
                                                }
                                            }
                                        }
                                    },
                                    required: ["node_id", "updates"]
                                }
                            },
                            {
                                name: "search_family_tree",
                                description: "Search for a person in the family tree by name if they are not in the current context.",
                                parameters: {
                                    type: "OBJECT",
                                    properties: {
                                        query: { type: "STRING", description: "The name or part of the name to search for." }
                                    },
                                    required: ["query"]
                                }
                            }
                        ]
                    }
                ],
                input_audio_transcription: {},
                output_audio_transcription: {}
            }
        };
        this.ws.send(JSON.stringify(sessionSetup));
    }

    private handleServerMessage(data: any) {
        // console.log("RAW MSG:", JSON.stringify(data)); 

        let type: any = "UNKNOWN";
        let payload: any = null;

        if (data.setupComplete) {
            console.log("Setup Complete Data:", data);
            type = "SETUP_COMPLETE";
        } else if (data.serverContent?.turnComplete) {
            type = "TURN_COMPLETE";
        } else if (data.serverContent?.modelTurn?.parts?.[0]?.inlineData) {
            type = "AUDIO";
            payload = data.serverContent.modelTurn.parts[0].inlineData.data;
        } else if (data.serverContent?.modelTurn?.parts?.[0]?.text) {
            console.log("Received Text:", data.serverContent.modelTurn.parts[0].text);
            type = "TEXT";
            payload = data.serverContent.modelTurn.parts[0].text;
        } else if (data.serverContent?.inputTranscription) {
            console.log("Received Input Transcription:", data.serverContent.inputTranscription);
            type = "INPUT_TRANSCRIPTION";
            payload = {
                text: data.serverContent.inputTranscription.text,
                isFinal: true
            };
        } else if (data.serverContent?.outputTranscription) {
            console.log("Received Output Transcription:", data.serverContent.outputTranscription);
            type = "OUTPUT_TRANSCRIPTION";
            payload = {
                text: data.serverContent.outputTranscription.text,
                isFinal: true
            };
        } else {
            // console.log("Unknown Message Structure:", Object.keys(data));
        }

        if (type !== "UNKNOWN") {
            const msg: MultimodalLiveResponseMessage = {
                type,
                data: payload,
                endOfTurn: data.serverContent?.turnComplete
            };
            this.onMessage(msg);
        }
    }
}
