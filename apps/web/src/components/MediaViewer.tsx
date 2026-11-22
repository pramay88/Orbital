
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

    // Fetch media metadata
    useEffect(() => {
        const controller = new AbortController();

        setLoading(true);
        setError("");
        setMetadata(null);

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
                                : result?.error ?? "Unable to load media"
                    );
                }

                setMetadata(result.data as MediaMetadata);
            })
            .catch((caught: unknown) => {
                if (caught instanceof DOMException && caught.name === "AbortError") {
                    return;
                }

                setError(
                    caught instanceof Error
                        ? caught.message
                        : "Unable to load media"
                );
            })
            .finally(() => {
                if (!controller.signal.aborted) {
                    setLoading(false);
                }
            });

        return () => controller.abort();
    }, [mediaId]);

    // Initialize Video.js
    useEffect(() => {
        if (
            kind !== "watch" ||
            !metadata ||
            metadata.kind !== "video" ||
            !videoRef.current
        ) {
            return;
        }

        const player = videojs(videoRef.current, {
            controls: true,
            responsive: true,
            fluid: true,
            preload: "metadata",
            playbackRates: [0.5, 1, 1.25, 1.5, 2],
            sources: [
                {
                    src: metadata.streamUrl,
                    type: metadata.mimeType,
                },
            ],
        });

        playerRef.current = player;

        // Video.js player container
        const playerElement = player.el() as HTMLElement;

        playerElement.setAttribute("tabindex", "0");
        playerElement.setAttribute(
            "aria-label",
            `Video player: ${metadata.name}`
        );

        // Keyboard shortcuts
        const handleKeyDown = (event: KeyboardEvent) => {
            const target = event.target;

            // Don't interfere with inputs or player controls
            if (
                target instanceof HTMLElement &&
                (
                    target.isContentEditable ||
                    target.closest(
                        "input, textarea, select, button, [role='slider'], .vjs-menu"
                    )
                )
            ) {
                return;
            }

            const currentTime = player.currentTime() ?? 0;
            const duration = player.duration();

            const validDuration =
                typeof duration === "number" && Number.isFinite(duration)
                    ? duration
                    : undefined;

            const seek = (offset: number) => {
                const next = Math.max(0, currentTime + offset);

                player.currentTime(
                    validDuration !== undefined
                        ? Math.min(validDuration, next)
                        : next
                );
            };

            switch (event.key) {
                case " ":
                case "k":
                case "K":
                    event.preventDefault();

                    if (player.paused()) {
                        void player.play();
                    } else {
                        player.pause();
                    }
                    break;

                case "ArrowLeft":
                case "j":
                case "J":
                    event.preventDefault();
                    seek(-10);
                    break;

                case "ArrowRight":
                case "l":
                case "L":
                    event.preventDefault();
                    seek(10);
                    break;

                case "ArrowUp": {
                    event.preventDefault();

                    const volume = player.volume() ?? 0;

                    player.volume(Math.min(1, volume + 0.05));
                    break;
                }

                case "ArrowDown": {
                    event.preventDefault();

                    const volume = player.volume() ?? 0;

                    player.volume(Math.max(0, volume - 0.05));
                    break;
                }

                case "m":
                case "M":
                    event.preventDefault();
                    player.muted(!player.muted());
                    break;

                case "f":
                case "F":
                    event.preventDefault();

                    if (player.isFullscreen()) {
                        player.exitFullscreen();
                    } else {
                        void player.requestFullscreen();
                    }
                    break;

                default:
                    if (
                        /^[0-9]$/.test(event.key) &&
                        validDuration !== undefined &&
                        validDuration > 0
                    ) {
                        event.preventDefault();

                        player.currentTime(
                            validDuration * (Number(event.key) / 10)
                        );
                    }
            }
        };

        // Focus player when clicking its video surface
        const handlePointerDown = (event: PointerEvent) => {
            const target = event.target;

            if (
                target instanceof Element &&
                target.closest(
                    ".vjs-control-bar, .vjs-modal-dialog"
                )
            ) {
                return;
            }

            playerElement.focus({ preventScroll: true });
        };

        playerElement.addEventListener("keydown", handleKeyDown);
        playerElement.addEventListener("pointerdown", handlePointerDown);

        return () => {
            playerElement.removeEventListener("keydown", handleKeyDown);
            playerElement.removeEventListener("pointerdown", handlePointerDown);

            if (playerRef.current === player) {
                playerRef.current = null;
            }

            player.dispose();
        };
    }, [kind, metadata]);

    const back = () => {
        window.location.assign("/");
    };

    const formatBytes = (bytes: number) => {
        if (!Number.isFinite(bytes) || bytes < 0) return "--";

        const units = ["B", "KB", "MB", "GB"];
        const index = Math.min(
            Math.floor(Math.log(bytes) / Math.log(1024)),
            units.length - 1
        );

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
                <button type="button" onClick={back}>
                    Back to files
                </button>

                {metadata && (
                    <div>
                        <strong>{metadata.name}</strong>
                        <span>
                            {formatBytes(metadata.size)} · {metadata.mimeType}
                        </span>
                    </div>
                )}

                {metadata && (
                    <button type="button" onClick={download}>
                        Download
                    </button>
                )}
            </header>

            {loading ? (
                <div className="media-viewer-state">
                    Loading preview...
                </div>
            ) : error ? (
                <div className="media-viewer-state" role="alert">
                    <strong>{error}</strong>

                    {metadata && (
                        <button type="button" onClick={download}>
                            Download instead
                        </button>
                    )}

                    <button type="button" onClick={back}>
                        Return to files
                    </button>
                </div>
            ) : metadata ? (
                kind === "watch" ? (
                    videoSupported ? (
                        <div className="media-video-stage">
                            <div data-vjs-player>
                                <video
                                    ref={videoRef}
                                    className="video-js vjs-orbital"
                                />
                            </div>
                        </div>
                    ) : (
                        <div className="media-viewer-state">
                            <strong>
                                This video container or codec is not supported by this browser.
                            </strong>

                            <button type="button" onClick={download}>
                                Download instead
                            </button>
                        </div>
                    )
                ) : kind === "photos" ? (
                    <div className="media-photo-stage">
                        <img
                            src={metadata.streamUrl}
                            alt={metadata.name}
                        />
                    </div>
                ) : kind === "audio" ? (
                    <div className="media-audio-stage">
                        <div className="media-audio-cover">
                            ORBITAL
                        </div>

                        <strong>{metadata.name}</strong>

                        <audio
                            src={metadata.streamUrl}
                            controls
                            autoPlay
                        />
                    </div>
                ) : (
                    <div className="media-viewer-state">
                        <strong>Preview unavailable</strong>

                        <button type="button" onClick={download}>
                            Download file
                        </button>
                    </div>
                )
            ) : null}
        </main>
    );
}
