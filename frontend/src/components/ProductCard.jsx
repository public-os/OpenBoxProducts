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
        <Link to={`/product/${product.id}`} className="block">
            <div className="bg-white rounded-xl shadow-md hover:shadow-lg hover:scale-[1.02] transition-transform p-4 cursor-pointer">
                {imageSrc && (
                    <img
                        src={imageSrc}
                        alt={product.name}
                        className="w-full h-56 object-cover rounded-lg mb-4 shadow-md"
                    />
                )}

                <h2 className="text-lg font-semibold text-gray-800 truncate">
                    {product.name}
                </h2>
                <div className="flex items-baseline gap-2 flex-wrap">
                    <p className="text-gray-800 font-bold">₹{formatINR(product.price) ?? '—'}</p>
                    {showMrp && (
                        <p className="text-sm text-gray-500 line-through">₹{formatINR(product.mrp)}</p>
                    )}
                </div>
                {discount > 0 && (
                    <p className="text-xs font-semibold text-green-600">{discount}% off</p>
                )}
            </div>
        </Link>
    );
}

export default ProductCard;
