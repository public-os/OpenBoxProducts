// src/components/Footer.jsx

const linkColumns = [
    {
        title: 'ABOUT',
        links: ['Contact Us', 'About Us', 'Careers', 'Flipkart Stories', 'Press', 'Corporate Information'],
    },
    {
        title: 'GROUP COMPANIES',
        links: ['Myntra', 'Cleartrip', 'Shopsy'],
    },
    {
        title: 'HELP',
        links: ['Payments', 'Shipping', 'Cancellations & Returns', 'FAQ'],
    },
    {
        title: 'CONSUMER POLICY',
        links: [
            'Cancellation & Returns',
            'Terms Of Use',
            'Security',
            'Privacy',
            'Sitemap',
            'Grievance Redressal',
            'EPR Compliance',
            'FSSAI Food Safety',
            'Connect App',
        ],
    },
];

const addressLines = [
    'Flipkart Internet Private Limited,',
    'Buildings Alyssa, Begonia &',
    'Clove Embassy Tech Village,',
    'Outer Ring Road, Devarabeesanahalli Village,',
    'Bengaluru, 560103,',
    'Karnataka, India',
];

const socialIcons = [
    {
        name: 'Facebook',
        href: 'https://facebook.com',
        path: 'M13.397 20.997v-8.196h2.765l.411-3.209h-3.176V7.548c0-.926.258-1.56 1.587-1.56h1.684V3.127A22.336 22.336 0 0 0 14.201 3c-2.444 0-4.122 1.492-4.122 4.231v2.355H7.332v3.209h2.753v8.202h3.312z',
    },
    {
        name: 'X (Twitter)',
        href: 'https://x.com',
        path: 'M18.901 1.153h3.68l-8.04 9.19L24 22.846h-7.406l-5.8-7.584-6.638 7.584H.474l8.6-9.83L0 1.154h7.594l5.243 6.932ZM17.61 20.644h2.039L6.486 3.24H4.298Z',
    },
    {
        name: 'YouTube',
        href: 'https://www.youtube.com/@oboxshop',
        path: 'M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z',
    },
    {
        name: 'Instagram',
        href: 'https://www.instagram.com/oboxshop/',
        path: 'M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zm0-2.163c-3.259 0-3.667.014-4.947.072-4.358.2-6.78 2.618-6.98 6.98-.059 1.281-.073 1.689-.073 4.948 0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98 1.281.058 1.689.072 4.948.072 3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98-1.281-.059-1.69-.073-4.949-.073zm0 5.838a6.162 6.162 0 1 0 0 12.324 6.162 6.162 0 0 0 0-12.324zm0 10.162a4 4 0 1 1 0-8 4 4 0 0 1 0 8zm6.406-11.845a1.44 1.44 0 1 0 0 2.881 1.44 1.44 0 0 0 0-2.881z',
    },
];

function Footer() {
    return (
        <footer className='bg-[#212121] text-gray-200'>
            <div className='max-w-7xl mx-auto px-6 py-10'>
                <div className='grid grid-cols-2 gap-x-6 gap-y-10 md:grid-cols-4 lg:grid-cols-6'>
                    {/* 4 link columns */}
                    {linkColumns.map((col) => (
                        <div key={col.title}>
                            <h3 className='text-xs font-semibold tracking-wider text-[#878787] mb-4'>
                                {col.title}
                            </h3>
                            <ul className='space-y-2.5'>
                                {col.links.map((link) => (
                                    <li key={link}>
                                        <a
                                            href='#'
                                            onClick={(e) => e.preventDefault()} // TODO: real routes lagao
                                            className='text-sm text-gray-100 hover:underline'
                                        >
                                            {link}
                                        </a>
                                    </li>
                                ))}
                            </ul>
                        </div>
                    ))}

                    {/* Mail Us + Social */}
                    <div className='col-span-2 md:col-span-2 lg:col-span-1 lg:border-l lg:border-gray-500 lg:pl-8'>
                        <h3 className='text-xs font-semibold tracking-wider text-[#878787] mb-4'>Mail Us:</h3>
                        <address className='not-italic text-sm leading-6'>
                            {addressLines.map((line) => (
                                <span key={line} className='block'>{line}</span>
                            ))}
                        </address>

                        <h3 className='text-xs font-semibold tracking-wider text-[#878787] mt-6 mb-3'>Social</h3>
                        <div className='flex items-center gap-3'>
                            {socialIcons.map((s) => (
                                <a
                                    key={s.name}
                                    href={s.href}
                                    target='_blank'
                                    rel='noreferrer'
                                    aria-label={s.name}
                                    className='w-9 h-9 rounded-full border border-gray-500 flex items-center justify-center hover:bg-white/10 transition'
                                >
                                    <svg viewBox='0 0 24 24' fill='currentColor' className='w-4 h-4'>
                                        <path d={s.path} />
                                    </svg>
                                </a>
                            ))}
                        </div>
                    </div>

                    {/* Registered Office */}
                    <div className='col-span-2 md:col-span-2 lg:col-span-1'>
                        <h3 className='text-xs font-semibold tracking-wider text-[#878787] mb-4'>
                            Registered Office Address:
                        </h3>
                        <address className='not-italic text-sm leading-6'>
                            {addressLines.map((line) => (
                                <span key={line} className='block'>{line}</span>
                            ))}
                        </address>
                        <p className='text-sm mt-2'>
                            CIN: <span className='text-blue-400'>U51109KA2012PTC066107</span>
                        </p>
                        <p className='text-sm'>
                            Telephone:{' '}
                            <a href='tel:04445614700' className='text-blue-400 hover:underline'>044-45614700</a>
                            {' / '}
                            <a href='tel:04445714708' className='text-blue-400 hover:underline'>044-45714708</a>
                        </p>
                    </div>
                </div>
            </div>
        </footer>
    );
}

export default Footer;