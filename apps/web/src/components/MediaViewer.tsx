import { useEffect, useRef, useState } from "react";
import videojs from "video.js";
import type Player from "video.js/dist/types/player";
import "video.js/dist/video-js.css";
import "./MediaViewer.css";

interface MediaMetadata {
    id: string;
    name: string;
    kind: "video" | "audio" | "image" | "pdf" | "text" | "unsupported";
    mimeType: string;
    size: number;
    modifiedAt: string;
    streamUrl: string;
}

export default function MediaViewer({
    kind,
    mediaId,
}: {
    kind: "watch" | "photos" | "audio";
    mediaId: string;
}) {
    const videoRef = useRef<HTMLVideoElement>(null);
    const playerRef = useRef<Player | null>(null);
    const [metadata, setMetadata] = useState<MediaMetadata | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState("");

    useEffect(() => {
        const controller = new AbortController();
        void fetch(`/api/media/${encodeURIComponent(mediaId)}`, {
            signal: controller.signal,
        })
            .then(async (response) => {
                const result = await response.json().catch(() => null);
                if (!response.ok) {
                    throw new Error(
                        response.status === 404
                            ? "Media not found"
                            : response.status === 401
                                ? "Unauthorized"
                                : result?.error ?? "Unable to load media",
                    );
                }
                setMetadata(result.data as MediaMetadata);
            })
            .catch((caught: unknown) => {
                if (caught instanceof DOMException && caught.name === "AbortError") return;
                setError(caught instanceof Error ? caught.message : "Unable to load media");
            })
            .finally(() => setLoading(false));

        return () => controller.abort();
    }, [kind, mediaId]);

    useEffect(() => {
        if (
            kind !== "watch" ||
            !metadata ||
            metadata.kind !== "video" ||
            !videoRef.current ||
            playerRef.current
        ) return;

        const video = document.createElement("video");
        const codecs =
            metadata.mimeType === "video/mp4"
                ? 'video/mp4; codecs="avc1.42E01E, mp4a.40.2"'
                : metadata.mimeType;
        const support = video.canPlayType(codecs);
        if (!support) return;

        playerRef.current = videojs(videoRef.current, {
            controls: true,
            responsive: true,
            fluid: true,
            preload: "metadata",
            playbackRates: [0.5, 1, 1.25, 1.5, 2],
            sources: [{
                src: metadata.streamUrl,
                type: metadata.mimeType,
            }],
        });

        return () => {
            if (playerRef.current) {
                playerRef.current.dispose();
                playerRef.current = null;
            }
        };
    }, [kind, metadata]);

    const back = () => window.location.assign("/");
    const formatBytes = (bytes: number) => {
        if (!Number.isFinite(bytes) || bytes < 0) return "--";
        const units = ["B", "KB", "MB", "GB"];
        const index = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
        return `${(bytes / 1024 ** index).toFixed(1)} ${units[index]}`;
    };

    const videoSupported =
        kind === "watch" && metadata?.kind === "video"
            ? (() => {
                const video = document.createElement("video");
                const codec =
                    metadata.mimeType === "video/mp4"
                        ? 'video/mp4; codecs="avc1.42E01E, mp4a.40.2"'
                        : metadata.mimeType;
                return Boolean(video.canPlayType(codec));
            })()
            : true;

    const download = () => {
        if (!metadata) return;
        const anchor = document.createElement("a");
        anchor.href = `${metadata.streamUrl}?download=1`;
        anchor.download = metadata.name;
        document.body.appendChild(anchor);
        anchor.click();
        anchor.remove();
    };

    return (
        <main className="media-viewer-shell">
            <header className="media-viewer-header">
                <button type="button" onClick={back}>Back to files</button>
                {metadata && (
                    <div>
                        <strong>{metadata.name}</strong>
                        <span>{formatBytes(metadata.size)} · {metadata.mimeType}</span>
                    </div>
                )}
                {metadata && (
                    <button type="button" onClick={download}>Download</button>
                )}
            </header>

            {loading ? (
                <div className="media-viewer-state">Loading preview...</div>
            ) : error ? (
                <div className="media-viewer-state" role="alert">
                    <strong>{error}</strong>
                    {metadata && <button type="button" onClick={download}>Download instead</button>}
                    <button type="button" onClick={back}>Return to files</button>
                </div>
            ) : metadata ? (
                kind === "watch" ? (
                    videoSupported ? (
                        <div className="media-video-stage">
                            <div data-vjs-player>
                                <video ref={videoRef} className="video-js vjs-orbital" />
                            </div>
                        </div>
                    ) : (
                        <div className="media-viewer-state">
                            <strong>This video container or codec is not supported by this browser.</strong>
                            <button type="button" onClick={download}>Download instead</button>
                        </div>
                    )
                ) : kind === "photos" ? (
                    <div className="media-photo-stage">
                        <img src={metadata.streamUrl} alt={metadata.name} />
                    </div>
                ) : kind === "audio" ? (
                    <div className="media-audio-stage">
                        <div className="media-audio-cover">ORBITAL</div>
                        <strong>{metadata.name}</strong>
                        <audio src={metadata.streamUrl} controls autoPlay />
                    </div>
                ) : (
                    <div className="media-viewer-state">
                        <strong>Preview unavailable</strong>
                        <button type="button" onClick={download}>Download file</button>
                    </div>
                )
            ) : null}
        </main>
    );
}
