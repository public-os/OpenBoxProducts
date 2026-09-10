// Verified badge — VIP user ka blue tick (circle + check).
// Review avatar/name ke saath aur navbar avatar par use hota hai.
export default function VipBadge({ size = 14, className = '' }) {
    return (
        <svg
            viewBox='0 0 24 24'
            width={size}
            height={size}
            className={`shrink-0 ${className}`}
            aria-label='VIP user'
            role='img'
        >
            <circle cx='12' cy='12' r='11' fill='#1d9bf0' />
            <path
                d='M7 12.5l3.2 3.2L17 8.8'
                fill='none'
                stroke='white'
                strokeWidth='2.4'
                strokeLinecap='round'
                strokeLinejoin='round'
            />
        </svg>
    );
}
