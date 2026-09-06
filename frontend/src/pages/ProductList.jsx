import { useEffect, useState } from "react";
import { useParams, useSearchParams, useLocation, Link } from "react-router-dom";
import ProductCard from "../components/ProductCard.jsx";

// Compare identifiers ignoring case, spaces and symbols so navbar tab links
// ('home-&-kitchen'), backend slugs ('home-kitchen') and names all match.
const normalize = (s) => (s || "").toLowerCase().replace(/[^a-z0-9]/g, "");

function ProductList() {
    const [products, setProducts] = useState([]);
    const [categories, setCategories] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [searchParams] = useSearchParams();
    const { slug } = useParams();
    const location = useLocation();
    // '/' renders HomeNav (header + mobile category tabs, taller).
    // '/category/:slug' and '/search' render Navbar only (header, no tabs, shorter).
    const isHome = location.pathname === '/';

    const query = (searchParams.get("q") || "").trim();
    const BASEURL = import.meta.env.VITE_DJANGO_BASE_URL;

    useEffect(() => {
        fetch(`${BASEURL}/api/products/`)
            .then((response) => {
                if (!response.ok) {
                    throw new Error("Failed to fetch products");
                }
                return response.json();
            })
            .then((data) => {
                setProducts(data);
                setLoading(false);
            })
            .catch((error) => {
                setError(error.message);
                setLoading(false);
            });
    }, [BASEURL]);

    // Home page tiles need the real categories from the backend.
    useEffect(() => {
        if (!isHome) return;
        let cancelled = false;
        fetch(`${BASEURL}/api/categories/`)
            .then((response) => {
                if (!response.ok) throw new Error("Failed to fetch categories");
                return response.json();
            })
            .then((data) => {
                if (!cancelled) setCategories(data);
            })
            .catch(() => {
                // Categories are decorative on home — still show products if this fails.
            });
        return () => { cancelled = true; };
    }, [isHome, BASEURL]);

    const filtered = products.filter((product) => {
        if (slug) {
            const cat = product.category || {};
            if (normalize(cat.slug) !== normalize(slug) && normalize(cat.name) !== normalize(slug)) {
                return false;
            }
        }
        if (query) {
            const q = query.toLowerCase();
            const haystack = `${product.name} ${product.description || ""}`.toLowerCase();
            if (!haystack.includes(q)) return false;
        }
        return true;
    });

    const heading = query
        ? `Results for “${query}”`
        : slug
            ? (filtered[0]?.category?.name || slug)
            : null;

    if (loading) {
        return <div>Loading...</div>;
    }

    if (error) {
        return <div>Error: {error}</div>;
    }

    return (
        <div className={`min-h-screen bg-gray-400 text-gray-800 md:pt-15 ${isHome ? 'pt-40' : 'pt-28'}`}>

            {/* ===== Category tiles — the only section on desktop home; first section on mobile home ===== */}
            {isHome && (
                <section className="px-4 md:pt-5">
                    <h1 className="text-xl sm:text-2xl font-bold">Shop by Category</h1>
                    <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 lg:grid-cols-8 gap-3 sm:gap-4 py-6">
                        {categories.length === 0 ? (
                            <p className="text-center col-span-full text-gray-700">No categories available.</p>
                        ) : (
                            categories.map((category) => (
                                <Link
                                    key={category.id}
                                    to={`/category/${category.slug || category.name}`}
                                    className="bg-white rounded-xl shadow-md hover:shadow-lg hover:scale-[1.02] transition-transform p-5 sm:p-6 text-center flex items-center justify-center"
                                >
                                    <span className="text-sm sm:text-base font-semibold text-gray-800">
                                        {category.name}
                                    </span>
                                </Link>
                            ))
                        )}
                    </div>
                </section>
            )}

            {/* ===== Products — hidden on desktop home (desktop home is categories only, like Blinkit mobile) ===== */}
            <section className={isHome ? 'md:hidden' : undefined}>
                {isHome && (
                    <div className="px-4 pt-2">
                        <h1 className="text-xl sm:text-2xl font-bold">Products for you</h1>
                    </div>
                )}

                {(heading || slug || query) && (
                    <div className="pt-4 md:pt-24 px-4">
                        <h1 className="text-xl sm:text-2xl font-bold capitalize">{heading || "Products"}</h1>
                        <p className="text-sm text-gray-700 mt-1">
                            {filtered.length} product{filtered.length === 1 ? "" : "s"} found
                        </p>
                    </div>
                )}
                <div className="grid grid-cols-2 sm:grid-cols-2 md:grid-cols-2 lg:grid-cols-6 gap-6 py-8 sm:py-18 md:py-10 px-4">
                    {filtered.length === 0 ? (
                        <div className="text-center col-span-full">
                            <p className="mb-4">No products available{query ? ` for “${query}”` : ""}.</p>
                            {(query || slug) && (
                                <Link
                                    to="/"
                                    className="inline-block bg-blue-600 text-white px-5 py-2 rounded-lg hover:bg-blue-700 transition"
                                >
                                    View all products
                                </Link>
                            )}
                        </div>
                    ) : (
                        filtered.map((product) => (
                            <ProductCard key={product.id} product={product} />
                        ))
                    )}
                </div>
            </section>
        </div>
    )
}

export default ProductList;
