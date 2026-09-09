// Checkout → Razorpay pay → verification → green tick success screen ka e2e test.
// Real Razorpay API ki jagah script khud ek local fake gateway (port 8999) chalati
// hai, aur window.Razorpay popup ka stub seedha success handler fire karta hai —
// signature REAL key secret se compute hota hai, isliye backend ka poora
// verify_payment + order PAID flow asli me chalta hai.
//
// Run karne se pehle:
//   1. backend/.env me test keys daalo:
//        RAZORPAY_KEY_ID=rzp_test_x
//        RAZORPAY_KEY_SECRET=e2e_fake_secret
//   2. Backend aage ke env se start karo (fake gateway par point karke):
//        RAZORPAY_API_BASE="http://127.0.0.1:8999/v1" python manage.py runserver
//   3. Frontend dev server 5174 par:  npm run dev -- --port 5174 --strictPort
//   4. node checkout-e2e.mjs
import { chromium } from 'playwright-core';
import crypto from 'node:crypto';
import http from 'node:http';

const BASE = 'http://localhost:5174';
const API = 'http://127.0.0.1:8000';
const RZP_ORDER = 'order_fakeE2E123';
const RZP_PAYMENT = 'pay_fakeE2E456';
const RZP_SECRET = 'e2e_fake_secret';
const SIG = crypto.createHmac('sha256', RZP_SECRET).update(`${RZP_ORDER}|${RZP_PAYMENT}`).digest('hex');

// Local fake Razorpay gateway — Django ka _rzp_request isi par jaata hai
// (RAZORPAY_API_BASE env se point kiya gaya hai)
const fakeGateway = http.createServer((req, res) => {
  res.writeHead(200, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ id: RZP_ORDER }));
});
await new Promise((resolve) => fakeGateway.listen(8999, '127.0.0.1', resolve));

const results = [];
const ok = (name, cond, extra = '') => {
  results.push({ name, pass: !!cond, extra });
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}${extra ? '  -- ' + extra : ''}`);
};

const browser = await chromium.launch({ channel: 'chrome', headless: true });
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
page.setDefaultTimeout(10000);
const consoleErrors = [];
page.on('console', (m) => { if (m.type() === 'error') consoleErrors.push(m.text()); });
page.on('pageerror', (e) => consoleErrors.push('PAGEERROR: ' + e.message));

// window.Razorpay stub — real checkout.js load hone se pehle hi Razorpay ban
// jata hai, isliye loadRazorpay() turant resolve ho jata hai aur popup ki jagah
// success handler fire hota hai (jaise user ne UPI PIN daal ke pay kiya ho)
await page.addInitScript(({ sig }) => {
  window.Razorpay = class {
    constructor(opts) { this.opts = opts; window.__rzpOptions = opts; }
    on() {}
    open() {
      setTimeout(() => this.opts.handler({
        razorpay_order_id: 'order_fakeE2E123',
        razorpay_payment_id: 'pay_fakeE2E456',
        razorpay_signature: sig,
      }), 100);
    }
  };
}, { sig: SIG });

try {
  // ---------- 1. Signup (fresh user) ----------
  await page.goto(`${BASE}/login`);
  const uniq = String(Date.now()).slice(-6);
  await page.getByText('Create an account').click();
  await page.getByPlaceholder('Full name').fill('Pay Tester');
  await page.getByPlaceholder('Username').fill('payuser' + uniq);
  await page.getByPlaceholder('Mobile number').fill('98765' + uniq);
  await page.getByPlaceholder('Password (min. 8 characters)').fill('PayPass@999');
  await page.getByPlaceholder('Confirm password').fill('PayPass@999');
  await page.getByRole('button', { name: 'Sign Up' }).click();
  await page.waitForURL(`${BASE}/`, { timeout: 10000 });
  const token = await page.evaluate(() => localStorage.getItem('access_token'));
  ok('signup auto-logged-in', !!token && token.startsWith('eyJ'));

  // ---------- 2. In-stock product cart me daalo (API se, no variant) ----------
  const products = await page.evaluate(async (api) => {
    const res = await fetch(`${api}/api/products/`);
    return res.json();
  }, API);
  const product = products.find((p) => Number(p.stock) > 0);
  ok('in-stock product mila', !!product, product ? `#${product.id} ${product.name} (stock ${product.stock})` : '');

  const cartStatus = await page.evaluate(async ({ api, pid }) => {
    const res = await fetch(`${api}/api/cart/add/`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${localStorage.getItem('access_token')}`,
      },
      body: JSON.stringify({ product_id: pid }),
    });
    return res.status;
  }, { api: API, pid: product.id });
  ok('product cart me add hua', cartStatus === 200, `status=${cartStatus}`);

  // ---------- 3. Checkout form bharo ----------
  await page.goto(`${BASE}/checkout`);
  await page.getByPlaceholder('Your Name').waitFor();
  await page.getByPlaceholder('Your Name').fill('Pay Tester');
  await page.getByPlaceholder('Address').fill('42 Test Lane, Mumbai');
  await page.getByPlaceholder('Phone Number').fill('9876500001');
  await page.getByRole('button', { name: 'Proceed to Pay' }).click();

  // ---------- 4. Pay step: order summary ----------
  await page.getByText('Review & Pay').waitFor();
  const payHeading = await page.getByText(/Order OB\d+/).first().isVisible();
  ok('pay step shows order ref', payHeading);
  ok('secure payment note', await page.getByText(/Razorpay ke secure checkout/i).isVisible());

  // ---------- 5. Pay click → gateway order (stubbed) → verify → done ----------
  await page.getByRole('button', { name: /Pay ₹.*Securely/ }).click();
  await page.getByText('Payment Successful!').waitFor({ timeout: 15000 });
  ok('green tick success screen', true);

  ok('amount paid shown', await page.getByText(/₹[\d,]+(\.\d+)?/).first().isVisible());
  ok('payment id shown', await page.getByText('pay_fakeE2E456').isVisible());

  // Order tracking: payment verify hote hi Confirmed step green hona chahiye
  await page.getByText('Order Tracking').waitFor();
  await page.getByText('Confirmed').waitFor();
  ok('tracking shows Confirmed step', true);

  // ---------- 6. Backend state cross-check (order PAID) ----------
  const orderState = await page.evaluate(async (api) => {
    const res = await fetch(`${api}/api/orders/`, {
      headers: { Authorization: `Bearer ${localStorage.getItem('access_token')}` },
    });
    return res.json();
  }, API);
  const lastOrder = orderState[0] || {};
  ok('backend payment_status paid', lastOrder.payment_status === 'paid', JSON.stringify({
    status: lastOrder.status, payment_status: lastOrder.payment_status, ref: lastOrder.order_ref,
  }));
  ok('backend payment_ref = gateway payment id', lastOrder.payment_ref === RZP_PAYMENT);
  ok('paid_at set', !!lastOrder.paid_at);

  // ---------- 7. Account page: order "Confirmed" (paid) dikhna chahiye ----------
  await page.getByRole('button', { name: 'View All Orders' }).click();
  await page.waitForURL(`${BASE}/account`, { timeout: 8000 });
  await page.getByText('Confirmed', { exact: true }).first().waitFor();
  ok('account page shows Confirmed (paid) badge', true);

  // ---------- 8. Resume flow: naya pending order CartPage se "Pay Now" ----------
  // (doosra order create karke, bina pay kiye chhod do)
  await page.evaluate(async ({ api, pid }) => {
    await fetch(`${api}/api/cart/add/`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${localStorage.getItem('access_token')}`,
      },
      body: JSON.stringify({ product_id: pid }),
    });
  }, { api: API, pid: product.id });
  await page.goto(`${BASE}/checkout`);
  await page.getByPlaceholder('Your Name').fill('Pay Tester');
  await page.getByPlaceholder('Address').fill('42 Test Lane, Mumbai');
  await page.getByPlaceholder('Phone Number').fill('9876500001');
  await page.getByRole('button', { name: 'Proceed to Pay' }).click();
  await page.getByText('Review & Pay').waitFor();
  // bina pay kiye cart page par jao — pending order "Pay Now" dikhana chahiye
  await page.getByRole('button', { name: 'Back to Cart' }).click();
  await page.waitForURL(`${BASE}/cart`, { timeout: 8000 });
  await page.getByText('Pending Orders').waitFor();
  await page.getByRole('button', { name: 'Pay Now' }).click();
  await page.getByText('Review & Pay').waitFor();
  ok('resume flow: cart → Pay Now → pay step', true);

  // dismiss simulate: Razorpay popup user ne band kar diya → SDK ondismiss fire karta hai
  await page.evaluate(() => {
    const orig = window.Razorpay;
    window.Razorpay = class extends orig {
      open() { this.opts.modal?.ondismiss?.(); }
    };
  });
  await page.getByRole('button', { name: /Pay ₹.*Securely/ }).click();
  await page.getByText(/Payment cancel ho gaya/i).waitFor();
  ok('dismiss message shown, order pending rehta hai', true);
} catch (e) {
  results.push({ name: 'UNEXPECTED FAILURE', pass: false, extra: e.message.split('\n')[0] });
  console.log('UNEXPECTED FAILURE:', e.message.split('\n')[0]);
  try {
    await page.screenshot({ path: 'checkout-e2e-failure.png' });
    console.log('screenshot saved: checkout-e2e-failure.png');
  } catch {}
} finally {
  const passed = results.filter((r) => r.pass).length;
  console.log(`\n=== ${passed}/${results.length} passed ===`);
  if (consoleErrors.length) console.log('console errors:', JSON.stringify(consoleErrors.slice(0, 6), null, 2));
  await browser.close();
  fakeGateway.close();
  process.exit(results.every((r) => r.pass) ? 0 : 1);
}
