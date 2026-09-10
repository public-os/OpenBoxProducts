// Blinkit-style star row — fractional rating support (4.5 par aadha star, screenshot jaisa).
// Gray base row ke upar amber row ko (rating/5 * 100)% width par clip karke fill dikhta hai.
const STAR_PATH =
    'M12 2l2.9 6.26 6.86.6-5.2 4.51 1.56 6.72L12 16.5l-6.12 3.59 1.56-6.72-5.2-4.51 6.86-.6L12 2z';

function RatingStars({ rating, size = 14, className = '' }) {
    const safeRating = Math.max(0, Math.min(5, Number(rating) || 0));
    const fillPct = (safeRating / 5) * 100;

    const row = (filled) => (
        <span className='flex w-max gap-px'>
            {[0, 1, 2, 3, 4].map((i) => (
                <svg
                    key={i}
                    width={size}
                    height={size}
                    viewBox="0 0 24 24"
                    className="shrink-0"
                    fill={filled ? '#f59e0b' : '#d1d5db'}
                >
                    <path d={STAR_PATH} />
                </svg>
            ))}
        </span>
    );

    return (
        <span
            className={`relative inline-flex ${className}`}
            role='img'
            aria-label={`Rated ${safeRating} out of 5 stars`}
        >
            {row(false)}
            <span
                className='absolute left-0 top-0 h-full overflow-hidden'
                style={{ width: `${fillPct}%` }}
            >
                {row(true)}
            </span>
        </span>
    );
}

export default RatingStars;
