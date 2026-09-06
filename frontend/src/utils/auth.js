// src/utils/auth.js
const BASEURL = import.meta.env.VITE_DJANGO_BASE_URL;

// Fired whenever the auth state changes so the rest of the app (e.g. CartContext)
// can react without a page reload.
export const AUTH_EVENT = 'auth-changed';

const notifyAuthChanged = () => {
  try {
    window.dispatchEvent(new Event(AUTH_EVENT));
  } catch {
    // window not available (e.g. during HMR teardown) — ignore
  }
};

export const getUsername = () => localStorage.getItem('username') || null;

export const saveTokens = (tokens, username, phone) => {
  if (tokens.access) localStorage.setItem('access_token', tokens.access);
  if (tokens.refresh) localStorage.setItem('refresh_token', tokens.refresh);
  if (username) localStorage.setItem('username', username);
  if (phone) localStorage.setItem('user_phone', phone);
  notifyAuthChanged();
};

export const clearTokens = () => {
  localStorage.removeItem('access_token');
  localStorage.removeItem('refresh_token');
  localStorage.removeItem('username');
  localStorage.removeItem('user_phone');
  notifyAuthChanged();
};

export const getAccessToken = () => localStorage.getItem('access_token');
export const getRefreshToken = () => localStorage.getItem('refresh_token');

// Naya access token lene ke liye refresh token use karo
const refreshAccessToken = async () => {
  const refresh = getRefreshToken();
  if (!refresh) return null;

  try {
    const response = await fetch(`${BASEURL}/api/token/refresh/`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refresh }),
    });

    if (!response.ok) {
      clearTokens();
      return null;
    }

    const data = await response.json();
    localStorage.setItem('access_token', data.access);
    return data.access;
  } catch {
    clearTokens();
    return null;
  }
};

export const authFetch = async (url, options = {}) => {
  let token = getAccessToken();
  const headers = options.headers ? { ...options.headers } : {};
  headers['Content-Type'] = headers['Content-Type'] || 'application/json';
  if (token) headers['Authorization'] = `Bearer ${token}`;

  let response = await fetch(url, { ...options, headers });

  // Access token expire ho gaya to ek baar refresh try karo
  if (response.status === 401 && getRefreshToken()) {
    const newToken = await refreshAccessToken();
    if (newToken) {
      headers['Authorization'] = `Bearer ${newToken}`;
      response = await fetch(url, { ...options, headers });
    }
  }

  return response;
};
