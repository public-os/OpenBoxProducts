import { useEffect, useState } from "react";
import { useParams, useSearchParams, useLocation, Link } from "react-router-dom";
import ProductCard from "../components/ProductCard.jsx";
import Footer from "../components/Footer.jsx";

// Compare identifiers ignoring case, spaces and symbols so navbar tab links
// ('home-&-kitchen'), backend slugs ('home-kitchen') and names all match.
const normalize = (s) => (s || "").toLowerCase().replace(/[^a-z0-9]/g, "");

// Breakpoint ke hisaab se initial products ka count — grid columns se match karta hai
// (Tailwind breakpoints: md=768, lg=1024, xl=1280)
const getCountForWidth = (w) => {
    if (w >= 1280) return 6;  // xl → 6 columns → 1 full row
    if (w >= 1024) return 5;  // lg → 5 columns → 1 full row
    if (w >= 768) return 8;   // md → 4 columns → 2 full rows
    return 6;                 // mobile → 3 columns → 2 full rows
};

function ProductList() {
    const [products, setProducts] = useState([]);
    const [categories, setCategories] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [showAll, setShowAll] = useState(false);
    // Initial count current screen width se — resize par update hota rahega
    const [initialCount, setInitialCount] = useState(() =>
        typeof window !== 'undefined' ? getCountForWidth(window.innerWidth) : 6
    );
    const [searchParams] = useSearchParams();
    const { slug } = useParams();
    const location = useLocation();
    // '/' renders HomeNav (header + mobile category tabs, taller).
    // '/category/:slug' and '/search' render Navbar only (header, no tabs, shorter).
    const isHome = location.pathname === '/';

    const query = (searchParams.get("q") || "").trim();
    const BASEURL = import.meta.env.VITE_DJANGO_BASE_URL;

    // Route change hone par Show More reset
    useEffect(() => {
        setShowAll(false);
    }, [location.pathname, location.search]);

    // Screen resize par initial count update (3→4→5→6 columns ke liye)
    useEffect(() => {
        const onResize = () => setInitialCount(getCountForWidth(window.innerWidth));
        window.addEventListener('resize', onResize);
        return () => window.removeEventListener('resize', onResize);
    }, []);

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

    // ===== Show More logic =====
    // Home pe (jab tak showAll false hai) sirf utne products jitne full rows banate hain
    const visibleProducts = isHome && !showAll ? filtered.slice(0, initialCount) : filtered;
    const hasMore = isHome && !showAll && filtered.length > initialCount;

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
        // md:pb-10 → desktop pe footer ke neeche gray strip dikhegi (wrapper ka bg-gray-400)
        <div
            className={`min-h-[100dvh] bg-gray-400 text-gray-800 md:pt-15 md:pb-10 flex flex-col ${
                isHome ? 'pt-40' : 'pt-28'
            }`}
        >
            {/* flex-1: saara content ye div me — footer ko bottom tak dhakelta hai */}
            <div className='flex-1'>
                {/* ===== Category tiles — first section on home, both mobile and desktop ===== */}
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

                {/* ===== Products — shown on both mobile and desktop home; heading text differs by breakpoint ===== */}
                <section>
                    {isHome && (
                        <div className="px-4 pt-2">
                            <h1 className="md:hidden text-xl sm:text-2xl font-bold">
                                Products for you
                            </h1>
                            <h1 className="hidden md:block text-xl sm:text-2xl font-bold">
                                All Products
                            </h1>
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

                    <div className="pb-6 grid grid-cols-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4 sm:gap-6 py-8 md:py-10 px-4">
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
                            visibleProducts.map((product) => (
                                <ProductCard key={product.id} product={product} />
                            ))
                        )}
                    </div>

                    {/* ===== Show More button — sirf home pe, jab aur products bache hon ===== */}
                    {hasMore && (
                        <div className="text-center pb-8 -mt-2">
                            <button
                                onClick={() => setShowAll(true)}
                                className="text-blue-600 font-semibold text-lg hover:text-blue-700 hover:underline transition cursor-pointer"
                            >
                                Show More
                            </button>
                            <p className="text-xs text-gray-700 mt-1">
                                Showing {visibleProducts.length} of {filtered.length} products
                            </p>
                        </div>
                    )}

                    {/* ===== Show Less — sab products dikhne ke baad, wapas collapse ===== */}
                    {isHome && showAll && filtered.length > initialCount && (
                        <div className="text-center pb-8 -mt-2">
                            <button
                                onClick={() => {
                                    setShowAll(false);
                                    window.scrollTo({ top: 0, behavior: 'smooth' });
                                }}
                                className="text-blue-600 font-semibold text-lg hover:text-blue-700 hover:underline transition cursor-pointer"
                            >
                                Show Less
                            </button>
                        </div>
                    )}
                </section>
            </div>

            {/* ===== Footer — desktop pe iske neeche gray strip, mobile pe flush bottom ===== */}
            <Footer />
        </div>
    )
}

export default ProductList;