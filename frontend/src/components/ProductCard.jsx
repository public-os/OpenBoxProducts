function ProductCard({ product }) {
    const BASE_URL = import.meta.env.VITE_DJANGO_BASE_URL;

    return (
        <div className="bg-white rounded-lg shadow-md hover:shadow-lg hover:scale-[1.02] transition-transform duration-100 p-4 cursor-pointer">

            <img
                src={product.image}
                alt={product.name}
                className="w-full h-64 object-cover mb-4 rounded-lg shadow"
            />

            <h2 className="text-xl font-bold mb-2">
                {product.name}
            </h2>

            <p className="text-gray-600 font-semibold">
                {Number(product.price).toFixed(2)}
            </p>

        </div>
    );
}

export default ProductCard;