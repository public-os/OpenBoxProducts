import RatingStars from './RatingStars.jsx';
import ProfileAvatar from './ProfileAvatar.jsx';
import VipBadge from './VipBadge.jsx';
import { formatDate } from '../utils/format.js';

const PIN_PATH =
    'M16 9V4h1c.55 0 1-.45 1-1s-.45-1-1-1H7c-.55 0-1 .45-1 1s.45 1 1 1h1v5c0 1.66-1.34 3-3 3v2h5.97v7l1 1 1-1v-7H19v-2c-1.66 0-3-1.34-3-3z';

// Ek review ka row — reviewer ki actual profile photo (+VIP tick), naam, date, stars,
// comment, right side me like (Instagram heart) aur VIP moderation buttons (pin, delete).
function ReviewItem({ review, onLike, onPin, onDelete, canModerate = false }) {
    const liked = !!review.liked_by_me;
    const likes = Number(review.likes) || 0;
    const pinned = !!review.is_pinned;

    return (
        <div className={`flex gap-3 rounded-lg ${pinned ? 'bg-blue-50/80 -mx-2 px-2 py-2' : ''}`}>
            <ProfileAvatar
                src={review.user_avatar}
                alt={`${review.user_name} profile photo`}
                className='w-9 h-9 self-start'
                vip={review.user_is_vip}
                fallbackLabel={review.user_name || 'U'}
            />
            <div className='min-w-0 flex-1'>
                <div className='flex items-center gap-1.5 flex-wrap'>
                    <span className='text-sm font-semibold text-gray-800'>{review.user_name}</span>
                    {review.user_is_vip && <VipBadge size={13} />}
                    {pinned && (
                        <span className='text-[10px] font-bold text-blue-700 bg-blue-100 rounded-full px-2 py-0.5 leading-none'>
                            📌 Pinned
                        </span>
                    )}
                    <span className='text-xs text-gray-400'>{formatDate(review.created_at)}</span>
                </div>
                <RatingStars rating={review.rating} size={12} className='my-1' />
                {review.comment && (
                    <p className='text-sm text-gray-600 break-words'>{review.comment}</p>
                )}
            </div>

            {/* Right column — VIP moderation (pin/delete) upar, like niche */}
            <div className='flex flex-col items-center gap-1.5 shrink-0'>
                {canModerate && (
                    <div className='flex items-center gap-1'>
                        <button
                            type='button'
                            onClick={() => onPin?.(review)}
                            title={pinned ? 'Unpin review' : 'Pin to top'}
                            aria-label={pinned ? 'Unpin review' : 'Pin review'}
                            className='p-1 cursor-pointer rounded-full hover:bg-gray-100 transition-colors'
                        >
                            <svg
                                viewBox='0 0 24 24'
                                className='w-4 h-4 transition-transform hover:scale-110'
                                fill={pinned ? '#2563eb' : '#9ca3af'}
                            >
                                <path d={PIN_PATH} />
                            </svg>
                        </button>
                        <button
                            type='button'
                            onClick={() => onDelete?.(review)}
                            title='Delete review'
                            aria-label='Delete review'
                            className='p-1 cursor-pointer rounded-full hover:bg-red-50 transition-colors group'
                        >
                            <svg
                                viewBox='0 0 24 24'
                                className='w-4 h-4 transition-transform hover:scale-110 stroke-gray-400 group-hover:stroke-red-500'
                                fill='none'
                                strokeWidth='2'
                                strokeLinecap='round'
                                strokeLinejoin='round'
                            >
                                <path d='M3 6h18M8 6V4a2 2 0 012-2h4a2 2 0 012 2v2m3 0v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6h14z' />
                            </svg>
                        </button>
                    </div>
                )}

                <button
                    type='button'
                    onClick={() => onLike?.(review)}
                    className='flex flex-col items-center gap-0.5 px-1 cursor-pointer group'
                    aria-label={liked ? 'Unlike review' : 'Like review'}
                    aria-pressed={liked}
                >
                    <svg
                        viewBox='0 0 24 24'
                        className={`w-5 h-5 transition-transform duration-150 ${liked ? 'scale-110' : 'group-hover:scale-105'}`}
                        fill={liked ? '#ef4444' : 'none'}
                        stroke={liked ? '#ef4444' : '#9ca3af'}
                        strokeWidth='2'
                    >
                        <path d='M20.84 4.61a5.5 5.5 0 00-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 10-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 000-7.78z' />
                    </svg>
                    {likes > 0 && (
                        <span className={`text-[11px] font-semibold leading-none ${liked ? 'text-red-500' : 'text-gray-500'}`}>
                            {likes}
                        </span>
                    )}
                </button>
            </div>
        </div>
    );
}

export default ReviewItem;
