import { formatDateTime } from "../utils/format.js";

const STEPS = [
    { key: "placed", label: "Order Placed", desc: "Aapka order receive ho gaya hai" },
    { key: "confirmed", label: "Confirmed", desc: "Payment verify ho gaya" },
    { key: "shipped", label: "Shipped", desc: "Order delivery ke liye nikal gaya hai" },
    { key: "delivered", label: "Delivered", desc: "Order deliver ho gaya hai" },
];

const STATUS_INDEX = { pending: 0, paid: 1, shipped: 2, delivered: 3 };

// ETA: order date + 5 din (display-only estimate).
const ETA_DAYS = 5;

// Vertical tracking stepper — order object backend ke _order_response shape me hona chahiye:
// { status, payment_status, created_at, paid_at, updated_at }
function OrderTracking({ order }) {
    if (!order) return null;

    if (order.status === "cancelled") {
        return (
            <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
                <p className="font-semibold">❌ Ye order cancel ho gaya hai</p>
                {order.updated_at && (
                    <p className="mt-0.5 text-xs">Last update: {formatDateTime(order.updated_at)}</p>
                )}
            </div>
        );
    }

    const currentIndex = STATUS_INDEX[order.status] ?? 0;

    const times = {
        placed: order.created_at,
        confirmed: order.paid_at,
    };

    const eta = order.created_at
        ? new Date(new Date(order.created_at).getTime() + ETA_DAYS * 24 * 60 * 60 * 1000)
        : null;

    return (
        <ol>
            {STEPS.map((step, i) => {
                const reached = i <= currentIndex;
                const isLast = i === STEPS.length - 1;
                const time = times[step.key];

                let note = null;
                let noteClass = "text-gray-500";
                if (reached && time) {
                    note = formatDateTime(time);
                } else if (step.key === "confirmed" && order.payment_status === "verifying") {
                    // UTR submit ho gaya, admin verification pending — status abhi 'pending' hi rehta hai
                    note = "Payment verify ho rahi hai…";
                } else if (step.key === "confirmed" && order.payment_status === "failed") {
                    note = "Payment fail ho gayi — dobara try karo";
                    noteClass = "text-red-600 font-semibold";
                } else if (!reached && eta) {
                    note = `Expected by ${formatDateTime(eta)}`;
                }

                return (
                    <li key={step.key} className="relative flex gap-3 pb-5 last:pb-0">
                        {!isLast && (
                            <span
                                className={`absolute left-[11px] top-6 bottom-0 w-0.5 ${
                                    i < currentIndex ? "bg-green-500" : "bg-gray-200"
                                }`}
                            />
                        )}
                        <span
                            className={`relative z-10 flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-bold ${
                                reached ? "bg-green-600 text-white" : "bg-gray-200 text-gray-500"
                            }`}
                        >
                            {reached ? "✓" : i + 1}
                        </span>
                        <div className="min-w-0 pt-0.5">
                            <p className={`text-sm font-semibold ${reached ? "text-gray-900" : "text-gray-400"}`}>
                                {step.label}
                            </p>
                            <p className={`text-xs ${reached ? "text-gray-600" : "text-gray-400"}`}>{step.desc}</p>
                            {note && <p className={`mt-0.5 text-xs ${noteClass}`}>{note}</p>}
                        </div>
                    </li>
                );
            })}
        </ol>
    );
}

export default OrderTracking;
