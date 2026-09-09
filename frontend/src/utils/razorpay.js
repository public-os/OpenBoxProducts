// Razorpay Checkout script ko ek hi baar load karta hai (promise cached hai).
// Script load hone par window.Razorpay available ho jata hai.
let loadPromise = null;

export function loadRazorpay() {
  if (typeof window === "undefined") return Promise.resolve(false);
  if (window.Razorpay) return Promise.resolve(true);

  if (!loadPromise) {
    loadPromise = new Promise((resolve) => {
      const script = document.createElement("script");
      script.src = "https://checkout.razorpay.com/v1/checkout.js";
      script.onload = () => resolve(true);
      script.onerror = () => {
        // agli koshish ke liye cache clear — network wapas aaye toh reload ho sake
        loadPromise = null;
        resolve(false);
      };
      document.body.appendChild(script);
    });
  }
  return loadPromise;
}
