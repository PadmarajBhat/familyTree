import type { TreeDocument } from '../logic/types';

const BACKEND_URL = import.meta.env.VITE_GEMINI_BACKEND_URL || 'ws://localhost:8888';

export interface TreeFile {
    id: string;
    name: string;
    description?: string;
    modifiedTime: string;
}

export class TreeService {
    private static async sendRequest<T>(
        message: any,
        successType: string,
        timeoutMs: number = 30000
    ): Promise<T> {
        return new Promise((resolve, reject) => {
            const socket = new WebSocket(BACKEND_URL);

            const timeout = setTimeout(() => {
                socket.close();
                reject(new Error(`Timeout: ${message.type}`));
            }, timeoutMs);

            socket.onopen = () => {
                socket.send(jsonStr({
                    service_url: "dummy",
                    bearer_token: "dummy",
                    user_email: message.user_email || "unknown"
                }));

                setTimeout(() => {
                    socket.send(jsonStr(message));
                }, 100);
            };

            socket.onmessage = (event) => {
                try {
                    const data = JSON.parse(event.data);
                    if (data.type === successType) {
                        clearTimeout(timeout);
                        socket.close();
                        // Return specific fields based on response type if needed, 
                        // but for generic use, we might need to adjust or return the whole data object.
                        // Most handlers return data.data or complex objects.
                        // Let's adapt based on usage or return the relevant part.
                        if (successType === "TREE_DATA" || successType === "PREFS_DATA") resolve(data.data);
                        else if (successType === "MY_TREES_FOUND") resolve(data.trees || []);
                        else if (successType === "TREE_CREATED") resolve({ treeId: data.treeId, name: data.name } as any);
                        else if (successType === "SEARCH_RESULTS") resolve(data.results || []);
                        else if (successType === "HISTORY_LOGS") resolve(data.logs);
                        else resolve(data); // For void/success confirmations
                    } else if (data.type === "ERROR") {
                        clearTimeout(timeout);
                        socket.close();
                        reject(new Error(data.message));
                    }
                } catch (e) {
                    console.error(`Error parsing response for ${message.type}`, e);
                }
            };

            socket.onerror = (err) => {
                clearTimeout(timeout);
                reject(err);
            };
        });
    }

    static async fetchFullTree(treeId: string | undefined, email: string): Promise<TreeDocument | null> {
        return this.sendRequest({ type: "GET_TREE", treeId, user_email: email }, "TREE_DATA");
    }

    static async fetchPreferences(email: string): Promise<any> {
        return this.sendRequest({ type: "GET_PREFS", email, user_email: email }, "PREFS_DATA");
    }

    static async savePreferences(email: string, prefs: any): Promise<void> {
        await this.sendRequest({ type: "SAVE_PREFS", email, prefs, user_email: email }, "PREFS_SAVED");
    }

    static async findMyTrees(email: string): Promise<TreeFile[]> {
        return this.sendRequest({ type: "FIND_MY_TREES", email, user_email: email }, "MY_TREES_FOUND");
    }

    static async createTree(name: string, owner: string): Promise<{ treeId: string; name: string }> {
        return this.sendRequest({ type: "CREATE_TREE", name, owner, user_email: owner }, "TREE_CREATED");
    }

    static async saveNode(node: any, email: string): Promise<void> {
        await this.sendRequest({ type: "SAVE_NODE", node, user_email: email }, "NODE_SAVED");
    }

    static async deleteNode(nodeId: string, email: string): Promise<void> {
        await this.sendRequest({ type: "DELETE_NODE", nodeId, user_email: email }, "NODE_DELETED");
    }

    static async fetchHistory(treeId: string, nodeId?: string): Promise<any[]> {
        return this.sendRequest({
            type: "GET_HISTORY",
            treeId,
            nodeId,
            user_email: "query-only"
        }, "HISTORY_LOGS");
    }

    static async searchTree(query: string, treeId: string): Promise<any[]> {
        return this.sendRequest({
            type: "SEARCH_TREE",
            query,
            treeId,
            user_email: "query-only"
        }, "SEARCH_RESULTS");
    }

    private static listeners: (() => void)[] = [];

    static subscribe(callback: () => void) {
        this.listeners.push(callback);
        return () => {
            this.listeners = this.listeners.filter(l => l !== callback);
        };
    }

    private static notifyListeners() {
        this.listeners.forEach(l => l());
    }

    static async listenForUpdates(email: string) {
        const socket = new WebSocket(BACKEND_URL);

        socket.onopen = () => {
            socket.send(jsonStr({
                service_url: "dummy",
                bearer_token: "dummy",
                user_email: email
            }));
            console.log("TreeService: Listening for updates...");
        };

        socket.onmessage = (event) => {
            try {
                const data = JSON.parse(event.data);
                if (data.type === "TREE_UPDATED") {
                    console.log("TreeService: Received TREE_UPDATED signal");
                    this.notifyListeners();
                }
            } catch (e) {
                console.error("Error parsing update signal", e);
            }
        };

        socket.onclose = () => {
            // Reconnect logic could go here
            console.log("TreeService: Update listener closed");
        };
    }
}

function jsonStr(obj: any) {
    return JSON.stringify(obj);
}


