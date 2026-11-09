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
