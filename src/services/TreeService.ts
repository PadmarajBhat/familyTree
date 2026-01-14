import type { TreeDocument } from '../logic/types';

const BACKEND_URL = import.meta.env.VITE_GEMINI_BACKEND_URL || 'ws://localhost:8888';

export interface TreeFile {
    id: string;
    name: string;
    description?: string;
    modifiedTime: string;
}

export class TreeService {
    static async fetchFullTree(treeId: string | undefined, email: string): Promise<TreeDocument | null> {
        return new Promise((resolve, reject) => {
            const socket = new WebSocket(BACKEND_URL);

            const timeout = setTimeout(() => {
                socket.close();
                reject(new Error("Timeout fetching tree from backend"));
            }, 30000);

            socket.onopen = () => {
                socket.send(jsonStr({
                    service_url: "dummy",
                    bearer_token: "dummy",
                    user_email: email
                }));

                // Request the tree
                socket.send(jsonStr({ type: "GET_TREE", treeId, user_email: email }));
            };

            socket.onmessage = (event) => {
                try {
                    const data = JSON.parse(event.data);
                    if (data.type === "TREE_DATA") {
                        clearTimeout(timeout);
                        socket.close();
                        resolve(data.data);
                    } else if (data.type === "ERROR") {
                        clearTimeout(timeout);
                        socket.close();
                        reject(new Error(data.message));
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
                    bearer_token: "dummy",
                    user_email: email
                }));

                setTimeout(() => {
                    socket.send(jsonStr({ type: "GET_PREFS", email, user_email: email }));
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
                    bearer_token: "dummy",
                    user_email: email
                }));

                setTimeout(() => {
                    socket.send(jsonStr({ type: "SAVE_PREFS", email, prefs, user_email: email }));
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

    static async findMyTrees(email: string): Promise<TreeFile[]> {
        return new Promise((resolve, reject) => {
            const socket = new WebSocket(BACKEND_URL);

            const timeout = setTimeout(() => {
                socket.close();
                reject(new Error("Timeout searching trees"));
            }, 30000);

            socket.onopen = () => {
                socket.send(jsonStr({
                    service_url: "dummy",
                    bearer_token: "dummy",
                    user_email: email
                }));

                setTimeout(() => {
                    socket.send(jsonStr({ type: "FIND_MY_TREES", email, user_email: email }));
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

    static async createTree(name: string, owner: string): Promise<{ treeId: string; name: string }> {
        return new Promise((resolve, reject) => {
            const socket = new WebSocket(BACKEND_URL);

            socket.onopen = () => {
                socket.send(jsonStr({
                    service_url: "dummy",
                    bearer_token: "dummy",
                    user_email: owner
                }));

                setTimeout(() => {
                    socket.send(jsonStr({ type: "CREATE_TREE", name, owner, user_email: owner }));
                }, 100);
            };

            socket.onmessage = (event) => {
                const data = JSON.parse(event.data);
                if (data.type === "TREE_CREATED") {
                    socket.close();
                    resolve({ treeId: data.treeId, name: data.name });
                } else if (data.type === "ERROR") {
                    socket.close();
                    reject(new Error(data.message));
                }
            };

            socket.onerror = (error) => reject(error);
        });
    }

    static async saveNode(node: any, email: string): Promise<void> {
        return new Promise((resolve, reject) => {
            const socket = new WebSocket(BACKEND_URL);

            socket.onopen = () => {
                socket.send(jsonStr({
                    service_url: "dummy",
                    bearer_token: "dummy",
                    user_email: email
                }));

                setTimeout(() => {
                    socket.send(jsonStr({ type: "SAVE_NODE", node, user_email: email }));
                }, 100);
            };

            socket.onmessage = (event) => {
                const data = JSON.parse(event.data);
                if (data.type === "NODE_SAVED") {
                    socket.close();
                    resolve();
                } else if (data.type === "ERROR") {
                    socket.close();
                    reject(new Error(data.message));
                }
            };

            socket.onerror = (error) => reject(error);
        });
    }

    static async deleteNode(nodeId: string, email: string): Promise<void> {
        return new Promise((resolve, reject) => {
            const socket = new WebSocket(BACKEND_URL);

            socket.onopen = () => {
                socket.send(jsonStr({
                    service_url: "dummy",
                    bearer_token: "dummy",
                    user_email: email
                }));

                setTimeout(() => {
                    socket.send(jsonStr({ type: "DELETE_NODE", nodeId, user_email: email }));
                }, 100);
            };

            socket.onmessage = (event) => {
                const data = JSON.parse(event.data);
                if (data.type === "NODE_DELETED") {
                    socket.close();
                    resolve();
                } else if (data.type === "ERROR") {
                    socket.close();
                    reject(new Error(data.message));
                }
            };

            socket.onerror = (error) => reject(error);
        });
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
    static async fetchHistory(treeId: string, nodeId?: string): Promise<any[]> {
        return new Promise((resolve, reject) => {
            const socket = new WebSocket(BACKEND_URL);

            const timeout = setTimeout(() => {
                socket.close();
                reject(new Error("Timeout fetching history"));
            }, 30000);

            socket.onopen = () => {
                socket.send(jsonStr({
                    service_url: "dummy",
                    bearer_token: "dummy",
                    user_email: "query-only" // Or pass current user email if available
                }));

                setTimeout(() => {
                    socket.send(jsonStr({
                        type: "GET_HISTORY",
                        treeId,
                        nodeId,
                        user_email: "query-only"
                    }));
                }, 100);
            };

            socket.onmessage = (event) => {
                try {
                    const data = JSON.parse(event.data);
                    if (data.type === "HISTORY_LOGS") {
                        clearTimeout(timeout);
                        socket.close();
                        resolve(data.logs);
                    } else if (data.type === "ERROR") {
                        clearTimeout(timeout);
                        socket.close();
                        reject(new Error(data.message));
                    }
                } catch (e) {
                    // ignore
                }
            };

            socket.onerror = (err) => {
                clearTimeout(timeout);
                reject(err);
            };
        });
    }
}

function jsonStr(obj: any) {
    return JSON.stringify(obj);
}
