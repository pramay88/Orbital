import { lazy, Suspense } from "react";

const MediaViewer = lazy(() => import("./MediaViewer"));

export default function MediaRoute({
    kind,
    mediaId,
}: {
    kind: "watch" | "photos" | "audio";
    mediaId: string;
}) {
    return (
        <Suspense
            fallback={
                <main className="media-viewer-shell">
                    <div className="media-viewer-state">Loading preview...</div>
                </main>
            }
        >
            <MediaViewer kind={kind} mediaId={mediaId} />
        </Suspense>
    );
}
