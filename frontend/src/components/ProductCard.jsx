import { Link } from 'react-router-dom';
import { formatINR } from '../utils/format.js';

function ProductCard({ product }) {
    const BASE_URL = import.meta.env.VITE_DJANGO_BASE_URL;
    const imageSrc = product.image
        ? product.image.startsWith('http')
            ? product.image
            : `${BASE_URL}${product.image.startsWith('/') ? '' : '/'}${product.image}`
        : '';

    // MRP is only shown when it's actually higher than the selling price
    const price = Number(product.price);
    const mrp = Number(product.mrp);
    const showMrp = Number.isFinite(price) && price > 0 && Number.isFinite(mrp) && mrp > price;
    const discount = showMrp ? Math.round(((mrp - price) / mrp) * 100) : 0;

    return (
        <Link to={`/product/${product.id}`} className="block h-full">
            <div className="group bg-white rounded-xl sm:rounded-2xl shadow-sm hover:shadow-md hover:-translate-y-1 transition-all duration-200 p-2 sm:p-3 border border-gray-100 cursor-pointer flex flex-col justify-between h-full">
                {/* Compact, aspect-proportional thumbnail container for mobile & desktop */}
                <div className="w-full bg-slate-50/80 rounded-lg sm:rounded-xl p-1.5 sm:p-2.5 flex items-center justify-center h-24 sm:h-36 md:h-44 lg:h-48 overflow-hidden mb-1.5 sm:mb-2.5">
                    {imageSrc ? (
                        <img
                            src={imageSrc}
                            alt={product.name}
                            className="h-full w-full object-contain group-hover:scale-105 transition-transform duration-300"
                            loading="lazy"
                        />
                    ) : (
                        <div className="text-gray-400 font-bold text-xs sm:text-base">
                            {product.name?.charAt(0) || 'P'}
                        </div>
                    )}
                </div>

                <div className="flex flex-col flex-1 justify-between">
                    <h2 className="text-[11px] sm:text-sm font-semibold text-gray-800 line-clamp-2 leading-tight mb-1 group-hover:text-blue-600 transition-colors">
                        {product.name}
                    </h2>
                    
                    <div>
                        <div className="flex items-baseline gap-1 sm:gap-1.5 flex-wrap">
                            <p className="text-xs sm:text-base font-bold text-gray-900">₹{formatINR(product.price) ?? '—'}</p>
                            {showMrp && (
                                <p className="text-[10px] sm:text-xs text-gray-400 line-through">₹{formatINR(product.mrp)}</p>
                            )}
                        </div>
                        {discount > 0 && (
                            <p className="text-[10px] sm:text-xs font-semibold text-green-600">{discount}% off</p>
                        )}
                    </div>
                </div>
            </div>
        </Link>
    );
}

export default ProductCard;
