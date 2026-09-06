import { chromium } from 'playwright';

const BASE = 'http://localhost:5174';
const results = [];
const ok = (name, cond, extra = '') => {
  results.push({ name, pass: !!cond, extra });
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}${extra ? '  -- ' + extra : ''}`);
};

const browser = await chromium.launch({ channel: 'chrome', headless: true });
const page = await browser.newPage();
page.setDefaultTimeout(8000);
const consoleErrors = [];
page.on('console', (m) => { if (m.type() === 'error') consoleErrors.push(m.text()); });
page.on('pageerror', (e) => consoleErrors.push('PAGEERROR: ' + e.message));

try {
  // ---------- 1. Login page renders ----------
  await page.goto(`${BASE}/login`);
  await page.waitForLoadState('domcontentloaded');
  await page.getByPlaceholder('Username').waitFor();
  ok('login form renders', await page.getByPlaceholder('Username').isVisible() && await page.getByPlaceholder('Password', { exact: true }).isVisible());
  ok('google button visible', await page.getByText('Continue with Google').isVisible());
  ok('forgot password link', await page.getByText('Forgot password?').isVisible());
  ok('signup link', await page.getByText('Create an account').isVisible());

  // Google button (unconfigured) shows guidance on click
  await page.getByText('Continue with Google').click();
  ok('google unconfigured message', await page.getByText(/Google sign-in is not configured/i).isVisible());

  // ---------- 2. Wrong credentials ----------
  await page.getByPlaceholder('Username').fill('testuser1');
  await page.getByPlaceholder('Password', { exact: true }).fill('wrongpass');
  await page.getByRole('button', { name: 'Login', exact: true }).click();
  await page.getByText(/Incorrect username|Password is incorrect/i).waitFor();
  ok('wrong credentials error shown', true);

  // ---------- 3. Signup flow (name, username, password, mobile) ----------
  const uniq = String(Date.now()).slice(-6);
  await page.getByText('Create an account').click();
  await page.getByPlaceholder('Full name').fill('E2E Tester');
  await page.getByPlaceholder('Username').fill('e2euser' + uniq);
  await page.getByPlaceholder('Mobile number').fill('0000' + uniq);
  await page.getByPlaceholder('Password (min. 8 characters)').fill('E2ePass@999');
  await page.getByPlaceholder('Confirm password').fill('E2ePass@999');
  await page.getByRole('button', { name: 'Sign Up' }).click();
  await page.waitForURL(`${BASE}/`, { timeout: 10000 });
  const token = await page.evaluate(() => localStorage.getItem('access_token'));
  ok('signup auto-logged-in', !!token && token.startsWith('eyJ'), 'token=' + String(token).slice(0, 15));

  // ---------- 4. Account page + logout ----------
  await page.goto(`${BASE}/account`);
  await page.getByText('Account Details').waitFor();
  await page.getByText('E2E Tester').first().waitFor();
  ok('account page shows profile', true);
  await page.getByRole('button', { name: 'Logout' }).click();
  await page.waitForURL(`${BASE}/login`, { timeout: 8000 });
  const cleared = await page.evaluate(() => localStorage.getItem('access_token'));
  ok('logout clears token + redirects', cleared === null);

  // ---------- 5. Login as the new user ----------
  await page.getByPlaceholder('Username').fill('e2euser');
  await page.getByPlaceholder('Password', { exact: true }).fill('E2ePass@999');
  await page.getByRole('button', { name: 'Login', exact: true }).click();
  await page.waitForURL(`${BASE}/`, { timeout: 10000 });
  ok('login with new user works', true);

  // ---------- 6. Forgot password flow ----------
  await page.evaluate(() => localStorage.clear());
  await page.goto(`${BASE}/login`);
  await page.getByPlaceholder('Username').fill('testuser1'); // prefill check comes later
  await page.getByText('Forgot password?').click();
  await page.getByPlaceholder('Username or mobile number').fill('testuser1');
  await page.getByRole('button', { name: 'Send OTP' }).click();
  const hint = page.getByText(/dev\] Your OTP:/);
  await hint.waitFor();
  const otp = (await hint.textContent()).match(/(\d{6})/)?.[1];
  ok('OTP step shows dev OTP', /^\d{6}$/.test(otp || ''), 'otp=' + otp);
  for (let i = 0; i < 6; i++) {
    await page.getByLabel(`OTP digit ${i + 1}`).fill(otp[i]);
  }
  await page.getByPlaceholder('New password').waitFor();
  ok('auto-advanced to reset step', true);
  await page.getByPlaceholder('New password').fill('ResetPass@777');
  await page.getByPlaceholder('Confirm new password').fill('ResetPass@777');
  await page.getByRole('button', { name: 'Reset Password' }).click();
  await page.getByText(/Password reset successfully/i).waitFor();
  ok('reset success message shown', true);
  ok('username prefilled after reset', (await page.getByPlaceholder('Username').inputValue()) === 'testuser1');

  await page.getByPlaceholder('Password', { exact: true }).fill('ResetPass@777');
  await page.getByRole('button', { name: 'Login', exact: true }).click();
  await page.waitForURL(`${BASE}/`, { timeout: 10000 });
  ok('login with reset password works', true);

  // ---------- 7. Search + categories routes ----------
  await page.goto(`${BASE}/search?q=zzznothing`);
  await page.getByText(/No products available/).waitFor();
  ok('search route renders empty state', true);
  await page.goto(`${BASE}/categories`);
  await page.getByText('Browse Categories').waitFor();
  ok('categories route renders', true);
} catch (e) {
  results.push({ name: 'UNEXPECTED FAILURE', pass: false, extra: e.message.split('\n')[0] });
  console.log('UNEXPECTED FAILURE:', e.message.split('\n')[0]);
  try {
    await page.screenshot({ path: 'e2e-failure.png' });
    console.log('screenshot saved: e2e-failure.png');
  } catch {}
} finally {
  const passed = results.filter((r) => r.pass).length;
  console.log(`\n=== ${passed}/${results.length} passed ===`);
  if (consoleErrors.length) console.log('console errors:', JSON.stringify(consoleErrors.slice(0, 6), null, 2));
  await browser.close();
  process.exit(results.every((r) => r.pass) ? 0 : 1);
}
