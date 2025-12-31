/**
 * Copyright 2024 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { GenAILiveClient } from "../services/GeminiLive/lib/genai-live-client";
import type { LiveClientOptions } from "../services/GeminiLive/types";
import { AudioStreamer } from "../services/GeminiLive/lib/audio-streamer";
import { audioContext } from "../services/GeminiLive/lib/utils";
import VolMeterWorket from "../services/GeminiLive/lib/worklets/vol-meter";
import type { LiveConnectConfig } from "@google/genai";

export type UseLiveAPIResults = {
    client: GenAILiveClient;
    setConfig: (config: LiveConnectConfig) => void;
    config: LiveConnectConfig;
    model: string;
    setModel: (model: string) => void;
    connected: boolean;
    connect: (config?: LiveConnectConfig) => Promise<void>;
    disconnect: () => Promise<void>;
    volume: number;
};

export function useLiveAPI(options: LiveClientOptions): UseLiveAPIResults {
    const client = useMemo(() => new GenAILiveClient(options), [options]);
    const audioStreamerRef = useRef<AudioStreamer | null>(null);

    const [model, setModel] = useState<string>("models/gemini-2.0-flash-exp");
    const [config, setConfig] = useState<LiveConnectConfig>({});
    const [connected, setConnected] = useState(false);
    const [volume, setVolume] = useState(0);

    // register audio for streaming server -> speakers
    useEffect(() => {
        if (!audioStreamerRef.current) {
            audioContext({ id: "audio-out" }).then((audioCtx: AudioContext) => {
                audioStreamerRef.current = new AudioStreamer(audioCtx);
                audioStreamerRef.current
                    .addWorklet<any>("vumeter-out", VolMeterWorket, (ev: any) => {
                        setVolume(ev.data.volume);
                    })
                    .then(() => {
                        // Successfully added worklet
                    });
            });
        }
    }, [audioStreamerRef]);

    useEffect(() => {
        const onOpen = () => {
            setConnected(true);
        };

        const onClose = () => {
            setConnected(false);
        };

        const onError = (error: ErrorEvent) => {
            console.error("error", error);
        };

        const stopAudioStreamer = () => audioStreamerRef.current?.stop();

        const onAudio = (data: ArrayBuffer) =>
            audioStreamerRef.current?.addPCM16(new Uint8Array(data));

        client
            .on("error", onError)
            .on("open", onOpen)
            .on("close", onClose)
            .on("interrupted", stopAudioStreamer)
            .on("audio", onAudio);

        return () => {
            client
                .off("error", onError)
                .off("open", onOpen)
                .off("close", onClose)
                .off("interrupted", stopAudioStreamer)
                .off("audio", onAudio)
                .disconnect();
        };
    }, [client]);

    const connect = useCallback(async (newConfig?: LiveConnectConfig) => {
        console.log("useLiveAPI: connect called", newConfig ? "with new config" : "using existing config");
        const configToUse = newConfig || config;
        if (!configToUse) {
            throw new Error("config has not been set");
        }
        if (newConfig) {
            setConfig(newConfig);
        }
        client.disconnect();
        await client.connect(model, configToUse);
    }, [client, config, model]);

    const disconnect = useCallback(async () => {
        client.disconnect();
        setConnected(false);
    }, [setConnected, client]);

    return {
        client,
        config,
        setConfig,
        model,
        setModel,
        connected,
        connect,
        disconnect,
        volume,
    };
}
