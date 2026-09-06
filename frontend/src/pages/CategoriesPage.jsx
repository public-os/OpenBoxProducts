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
        <div className="min-h-screen bg-gray-400">
            <div className="pt-28 px-4">
                <h1 className="text-xl sm:text-2xl font-bold text-gray-800">Browse Categories</h1>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4 py-6 px-4">
                {categories.length === 0 ? (
                    <p className="text-center col-span-full text-gray-700">No categories available.</p>
                ) : (
                    categories.map((category) => (
                        <Link
                            key={category.id}
                            to={`/category/${category.slug || category.name}`}
                            className="bg-white rounded-xl shadow-md hover:shadow-lg hover:scale-[1.02] transition-transform p-6 text-center"
                        >
                            <span className="text-base sm:text-lg font-semibold text-gray-800">
                                {category.name}
                            </span>
                        </Link>
                    ))
                )}
            </div>
        </div>
    );
}

export default CategoriesPage;
