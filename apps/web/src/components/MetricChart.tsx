import {
    ResponsiveContainer,
    LineChart,
    Line,
    XAxis,
    YAxis,
    Tooltip,
    CartesianGrid,
} from "recharts";

interface MetricPoint {
    timestamp: number;
    value: number;
}

interface Props {
    title: string;
    data: MetricPoint[];
    unit?: string;
}

export default function MetricChart({
    title,
    data,
    unit = "%",
}: Props) {
    const formatted = data.map((point) => ({
        time: new Date(point.timestamp).toLocaleTimeString(),
        value: point.value,
    }));

    return (
        <article className="chart-card">
            <h3>{title}</h3>

            <div style={{ width: "100%", height: 230 }}>
                <ResponsiveContainer>
                    <LineChart data={formatted}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#303747" />

                        <XAxis
                            dataKey="time"
                            tick={{ fill: "#9299aa", fontSize: 10 }}
                        />

                        <YAxis
                            domain={[0, 100]}
                            tick={{ fill: "#9299aa", fontSize: 10 }}
                        />

                        <Tooltip
                            formatter={(value) => [`${value}${unit}`, title]}
                        />

                        <Line
                            type="monotone"
                            dataKey="value"
                            stroke="#818cf8"
                            strokeWidth={2}
                            dot={false}
                            isAnimationActive={false}
                        />
                    </LineChart>
                </ResponsiveContainer>
            </div>
        </article>
    );
}
