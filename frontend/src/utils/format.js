// Format a price for Indian rupee display: no trailing zeros, Indian digit grouping (₹1,299.50).
// Returns a fallback when the value isn't a usable number.
export const formatINR = (value) => {
    const n = Number(value);
    if (!Number.isFinite(n)) return null;
    return n.toLocaleString('en-IN', { maximumFractionDigits: 2 });
};

// "8 Sep 2026, 4:30 pm" — order dates / tracking timestamps. Null when value isn't a date.
export const formatDateTime = (value) => {
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) return null;
    return d.toLocaleString('en-IN', {
        day: 'numeric', month: 'short', year: 'numeric',
        hour: 'numeric', minute: '2-digit', hour12: true,
    });
};
