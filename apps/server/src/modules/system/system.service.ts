import si from "systeminformation";

export async function getSystemOverview() {
    const [
        cpuLoad,
        cpu,
        memory,
        disks,
        os,
        time,
        interfaces,
    ] = await Promise.all([
        si.currentLoad(),
        si.cpu(),
        si.mem(),
        si.fsSize(),
        si.osInfo(),
        si.time(),
        si.networkInterfaces(),
    ]);

    const normalizedDisks = disks
        .filter((disk) => disk.size > 0)
        .sort((a, b) => {
            // Prefer the primary volume on common platforms.
            const aPrimary = ["C:", "/"].includes(a.mount);
            const bPrimary = ["C:", "/"].includes(b.mount);

            return Number(bPrimary) - Number(aPrimary);
        })
        .map((disk) => ({
            filesystem: disk.fs,
            mount: disk.mount,
            type: disk.type,
            total: disk.size,
            used: disk.used,
            available: disk.size - disk.used,
            usagePercent: disk.use,
        }));

    const normalizedInterfaces = interfaces.map((network) => ({
        name: network.iface,
        type: network.type,
        ipv4: network.ip4,
        ipv6: network.ip6,
        state: network.operstate,
        speedMbps: network.speed,
        internal: network.internal,
    }));

    return {
        timestamp: new Date().toISOString(),

        cpu: {
            manufacturer: cpu.manufacturer,
            brand: cpu.brand,
            physicalCores: cpu.physicalCores,
            logicalCores: cpu.cores,
            speedGHz: cpu.speed,
            usagePercent: Number(cpuLoad.currentLoad.toFixed(2)),
        },

        memory: {
            total: memory.total,
            used: memory.used,
            available: memory.available,
            usagePercent: Number(
                ((memory.used / memory.total) * 100).toFixed(2)
            ),
        },

        disks: normalizedDisks,

        operatingSystem: {
            platform: os.platform,
            distribution: os.distro,
            release: os.release,
            architecture: os.arch,
            hostname: os.hostname,
        },

        uptime: {
            systemSeconds: time.uptime,
            processSeconds: process.uptime(),
        },

        network: normalizedInterfaces,
    };
}
