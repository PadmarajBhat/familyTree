import type { TreeDocument } from '../logic/types';

const BACKEND_URL = import.meta.env.VITE_GEMINI_BACKEND_URL || 'ws://localhost:8888';

export class TreeService {
    static async fetchFullTree(): Promise<TreeDocument | null> {
        return new Promise((resolve, reject) => {
            const socket = new WebSocket(BACKEND_URL);

            const timeout = setTimeout(() => {
                socket.close();
                reject(new Error("Timeout fetching tree from backend"));
            }, 30000);

            socket.onopen = () => {
                // Initial setup message for the proxy
                // We don't need a real bearer token if the backend uses default credentials
                socket.send(jsonStr({
                    service_url: "dummy", // The proxy expects this but we won't use it for GET_TREE
                    bearer_token: "dummy"
                }));

                // Request the tree
                socket.send(jsonStr({ type: "GET_TREE" }));
            };

            socket.onmessage = (event) => {
                try {
                    const data = JSON.parse(event.data);
                    if (data.type === "TREE_DATA") {
                        clearTimeout(timeout);
                        socket.close();
                        resolve(data.data);
                    }
                } catch (e) {
                    console.error("Error parsing tree data", e);
                }
            };

            socket.onerror = (err) => {
                clearTimeout(timeout);
                reject(err);
            };
        });
    }

    static async fetchPreferences(email: string): Promise<any> {
        return new Promise((resolve, reject) => {
            const socket = new WebSocket(BACKEND_URL);

            const timeout = setTimeout(() => {
                socket.close();
                reject(new Error("Timeout fetching preferences"));
            }, 30000);

            socket.onopen = () => {
                socket.send(jsonStr({
                    service_url: "dummy",
                    bearer_token: "dummy"
                }));

                // Wait a brief moment for setup to process (though in this simple protocol it might not be strictly needed)
                setTimeout(() => {
                    socket.send(jsonStr({ type: "GET_PREFS", email }));
                }, 100);
            };

            socket.onmessage = (event) => {
                try {
                    const data = JSON.parse(event.data);
                    if (data.type === "PREFS_DATA") {
                        clearTimeout(timeout);
                        socket.close();
                        resolve(data.data);
                    }
                } catch (e) {
                    console.error("Error parsing prefs data", e);
                }
            };

            socket.onerror = (error) => {
                clearTimeout(timeout);
                console.error("WebSocket error:", error);
                reject(error);
            };
        });
    }

    static async savePreferences(email: string, prefs: any): Promise<void> {
        return new Promise((resolve, reject) => {
            const socket = new WebSocket(BACKEND_URL);

            socket.onopen = () => {
                socket.send(jsonStr({
                    service_url: "dummy",
                    bearer_token: "dummy"
                }));

                setTimeout(() => {
                    socket.send(jsonStr({ type: "SAVE_PREFS", email, prefs }));
                }, 100);
            };

            socket.onmessage = (event) => {
                const data = JSON.parse(event.data);
                if (data.type === "PREFS_SAVED") {
                    socket.close();
                    resolve();
                }
            };

            socket.onerror = (error) => reject(error);
        });
    }

    static async findMyTrees(email: string): Promise<string[]> {
        return new Promise((resolve, reject) => {
            const socket = new WebSocket(BACKEND_URL);

            const timeout = setTimeout(() => {
                socket.close();
                reject(new Error("Timeout searching trees"));
            }, 30000);

            socket.onopen = () => {
                socket.send(jsonStr({
                    service_url: "dummy",
                    bearer_token: "dummy"
                }));

                setTimeout(() => {
                    socket.send(jsonStr({ type: "FIND_MY_TREES", email }));
                }, 100);
            };

            socket.onmessage = (event) => {
                try {
                    const data = JSON.parse(event.data);
                    if (data.type === "MY_TREES_FOUND") {
                        clearTimeout(timeout);
                        socket.close();
                        resolve(data.trees || []);
                    }
                } catch (e) {
                    console.error("Error parsing tree search response", e);
                }
            };

            socket.onerror = (error) => {
                clearTimeout(timeout);
                reject(error);
            };
        });
    }
}

function jsonStr(obj: any) {
    return JSON.stringify(obj);
}
