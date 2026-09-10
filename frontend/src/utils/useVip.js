import { useEffect, useState } from 'react';
import { authFetch, getAccessToken } from './auth.js';

// VIP status — Django admin se mark kiye gaye VIP users ko review par blue tick
// aur pin/delete powers milti hain. Profile endpoint se fresh laata hai.
export function useVipStatus(baseUrl) {
    const [isVip, setIsVip] = useState(false);

    useEffect(() => {
        if (!getAccessToken()) {
            setIsVip(false);
            return;
        }
        let cancelled = false;
        authFetch(`${baseUrl}/api/user/profile/`)
            .then((res) => (res.ok ? res.json() : null))
            .then((data) => {
                if (!cancelled && data) setIsVip(!!data.is_vip);
            })
            .catch(() => {});
        return () => {
            cancelled = true;
        };
    }, [baseUrl]);

    return isVip;
}
