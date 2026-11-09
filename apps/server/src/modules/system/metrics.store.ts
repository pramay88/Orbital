import si from "systeminformation";

export interface MetricsSnapshot {
    timestamp: number;

    cpu: {
        usagePercent: number;
    };

    memory: {
        total: number;
        used: number;
        available: number;
        usagePercent: number;
    };

    network: {
        interface: string;
        rxBytesPerSecond: number;
        txBytesPerSecond: number;
    }[];

    disks: {
        mount: string;
        total: number;
        used: number;
        available: number;
        usagePercent: number;
    }[];
}

const MAX_HISTORY = 300;
const COLLECTION_INTERVAL = 2000;

const history: MetricsSnapshot[] = [];

let latest: MetricsSnapshot | null = null;
let timer: ReturnType<typeof setInterval> | undefined;
let collecting = false;

function addSnapshot(snapshot: MetricsSnapshot) {
    latest = snapshot;
    history.push(snapshot);

    if (history.length > MAX_HISTORY) {
        history.shift();
    }
}

async function collectMetrics(): Promise<void> {
    if (collecting) return;

    collecting = true;

    try {
        const [cpu, memory, network, disks] = await Promise.all([
            si.currentLoad(),
            si.mem(),
            si.networkStats(),
            si.fsSize(),
        ]);

        const snapshot: MetricsSnapshot = {
            timestamp: Date.now(),

            cpu: {
                usagePercent: Number(cpu.currentLoad.toFixed(2)),
            },

            memory: {
                total: memory.total,
                used: memory.used,
                available: memory.available,
                usagePercent: Number(
                    ((memory.used / memory.total) * 100).toFixed(2)
                ),
            },

            network: network.map((item) => ({
                interface: item.iface,
                rxBytesPerSecond: item.rx_sec,
                txBytesPerSecond: item.tx_sec,
            })),

            disks: disks
                .filter((disk) => disk.size > 0)
                .map((disk) => ({
                    mount: disk.mount,
                    total: disk.size,
                    used: disk.used,
                    available: disk.size - disk.used,
                    usagePercent: disk.use,
                })),
        };

        addSnapshot(snapshot);
    } catch (error) {
        console.error("[metrics] Collection failed:", error);
    } finally {
        collecting = false;
    }
}

export function startMetricsCollector() {
    if (timer) return;

    console.log("[metrics] Starting background collector");

    void collectMetrics();

    timer = setInterval(() => {
        void collectMetrics();
    }, COLLECTION_INTERVAL);
}

export function stopMetricsCollector() {
    if (timer) {
        clearInterval(timer);
        timer = undefined;
    }
}

export function getLatestMetrics() {
    return latest;
}

export function getMetricsHistory() {
    return [...history];
}
