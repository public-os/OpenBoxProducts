// Format a price for Indian rupee display: no trailing zeros, Indian digit grouping (₹1,299.50).
// Returns a fallback when the value isn't a usable number.
export const formatINR = (value) => {
    const n = Number(value);
    if (!Number.isFinite(n)) return null;
    return n.toLocaleString('en-IN', { maximumFractionDigits: 2 });
};
