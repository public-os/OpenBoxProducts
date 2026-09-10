// Reviews ka display order — pinned pehle, phir most-liked, phir naye.
// Backend (product_reviews) bhi yahi order deta hai; pin/unpin ke baad client-side re-sort.
export const sortReviews = (list) =>
    [...list].sort(
        (a, b) =>
            (Number(b.is_pinned) || 0) - (Number(a.is_pinned) || 0) ||
            (Number(b.likes) || 0) - (Number(a.likes) || 0) ||
            new Date(b.created_at) - new Date(a.created_at)
    );
