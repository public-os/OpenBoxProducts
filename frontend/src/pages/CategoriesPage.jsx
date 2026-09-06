import { useEffect, useState } from "react";
import { Link } from "react-router-dom";

function CategoriesPage() {
    const [categories, setCategories] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);

    const BASEURL = import.meta.env.VITE_DJANGO_BASE_URL;

    useEffect(() => {
        fetch(`${BASEURL}/api/categories/`)
            .then((response) => {
                if (!response.ok) throw new Error("Failed to fetch categories");
                return response.json();
            })
            .then((data) => {
                setCategories(data);
                setLoading(false);
            })
            .catch((err) => {
                setError(err.message);
                setLoading(false);
            });
    }, [BASEURL]);

    if (loading) {
        return <div className="pt-32 text-center">Loading...</div>;
    }

    if (error) {
        return <div className="pt-32 text-center text-red-600">Error: {error}</div>;
    }

    return (
        <div className="min-h-screen bg-gray-400 pb-20">
            <div className="md:pt-20 pt-30 px-4">
                <h1 className="text-xl sm:text-2xl font-bold text-gray-800">Browse Categories</h1>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-4 py-4 px-4">
                {categories.length === 0 ? (
                    <p className="text-center col-span-full text-gray-700">No categories available.</p>
                ) : (
                    categories.map((category) => {
                        const imgUrl = category.image
                            ? category.image.startsWith('http')
                                ? category.image
                                : `${BASEURL}${category.image.startsWith('/') ? '' : '/'}${category.image}`
                            : null;

                        return (
                            <Link
                                key={category.id}
                                to={`/category/${category.slug || category.name}`}
                                className="group bg-white rounded-2xl shadow-sm hover:shadow-md hover:-translate-y-1 transition-all duration-200 p-3 sm:p-4 flex flex-col items-center justify-between border border-gray-100"
                            >
                                <div className="w-full bg-slate-50/80 rounded-xl p-3 flex items-center justify-center h-28 sm:h-32 overflow-hidden">
                                    {imgUrl ? (
                                        <img
                                            src={imgUrl}
                                            alt={category.name}
                                            className="h-full w-full object-contain group-hover:scale-105 transition-transform duration-300"
                                            loading="lazy"
                                        />
                                    ) : (
                                        <div className="text-gray-400 font-bold text-xl">
                                            {category.name.charAt(0)}
                                        </div>
                                    )}
                                </div>
                                <span className="text-sm sm:text-base font-semibold text-gray-800 text-center line-clamp-2 mt-3 px-1 leading-tight group-hover:text-blue-600 transition-colors">
                                    {category.name}
                                </span>
                            </Link>
                        );
                    })
                )}
            </div>
        </div>
    );
}

export default CategoriesPage;
