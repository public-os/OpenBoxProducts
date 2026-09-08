// Direct UPI payment helpers.
// Payment seedha merchant ke UPI ID (bank account) me aata hai - no middleman.
// Apni UPI ID frontend/.env me set karo: VITE_UPI_ID aur VITE_UPI_NAME

export const UPI_ID = import.meta.env.VITE_UPI_ID || "yourname@upi";
export const UPI_NAME = import.meta.env.VITE_UPI_NAME || "My Store";

export const isMobileDevice = () =>
  /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent);

const enc = (v) => encodeURIComponent(String(v ?? ""));

/**
 * UPI deep link banata hai. Phone pe Blinkit jaise direct app open hoga:
 *   app="gpay"    -> Google Pay
 *   app="phonepe" -> PhonePe
 *   app="paytm"   -> Paytm
 *   app="upi"     -> koi bhi UPI app (chooser) / QR code ke liye
 */
export function buildUpiLink({ amount, note, txnRef, app = "upi" }) {
  const schemes = {
    gpay: "tez://upi/pay",
    phonepe: "phonepe://pay",
    paytm: "paytmmp://pay",
    upi: "upi://pay",
  };
  const scheme = schemes[app] || schemes.upi;
  const query = [
    `pa=${enc(UPI_ID)}`,
    `pn=${enc(UPI_NAME)}`,
    `am=${enc(Number(amount).toFixed(2))}`,
    "cu=INR",
    `tn=${enc(note)}`,
    `tr=${enc(txnRef)}`,
  ].join("&");
  return `${scheme}?${query}`;
}
