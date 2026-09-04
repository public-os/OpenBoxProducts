import { Link } from 'react-router-dom';

function ProductCard({ product }) {
    const BASE_URL = import.meta.env.VITE_DJANGO_BASE_URL;
    const imageSrc = product.image
        ? product.image.startsWith('http')
            ? product.image
            : `${BASE_URL}${product.image.startsWith('/') ? '' : '/'}${product.image}`
        : '';

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
                <p className="text-gray-600 font-medium">₹{product.price}</p>
            </div>
        </Link>
    );
}

export default ProductCard;