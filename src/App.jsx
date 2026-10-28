import { useEffect, useMemo, useState } from 'react';
import { Link, NavLink, Navigate, Route, Routes, useLocation, useNavigate, useParams } from 'react-router-dom';
import { ArrowRight, Bell, Clock3, DollarSign, Gavel, LogOut, PlusCircle, Search, ShieldCheck, ShoppingBag, UserCircle2, BadgeCheck, Eye, Sparkles } from 'lucide-react';

const API_BASE = '/api';

const categories = ['Textbooks', 'Electronics', 'Transport', 'Furniture', 'Lifestyle', 'Stationery'];

const getStoredToken = () => localStorage.getItem('campusbid-token');
const saveToken = (token) => {
  localStorage.setItem('campusbid-token', token);
};
const removeToken = () => localStorage.removeItem('campusbid-token');

const formatCurrency = (value) => `₹${Number(value || 0).toLocaleString('en-IN')}`;

const fetchJson = async (path, options = {}, token) => {
  const response = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(options.headers || {}),
    },
  });

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(payload.message || 'Request failed.');
  }

  return payload;
};

function App() {
  const [token, setToken] = useState(getStoredToken());
  const [user, setUser] = useState(null);
  const [notifications, setNotifications] = useState([]);

  useEffect(() => {
    if (!token) {
      setUser(null);
      return;
    }

    fetchJson('/auth/me', {}, token)
      .then((payload) => setUser(payload.user))
      .catch(() => {
        removeToken();
        setToken(null);
      });
  }, [token]);

  useEffect(() => {
    if (!token) return;
    fetchJson('/notifications', {}, token)
      .then((payload) => setNotifications(payload.notifications || []))
      .catch(() => setNotifications([]));
  }, [token]);

  const handleAuthSuccess = (authData) => {
    saveToken(authData.token);
    setToken(authData.token);
    setUser(authData.user);
  };

  const handleLogout = () => {
    removeToken();
    setToken(null);
    setUser(null);
  };

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      <Header user={user} notificationCount={notifications.length} onLogout={handleLogout} />
      <main className="mx-auto max-w-7xl px-4 pb-16 pt-8 sm:px-6 lg:px-8">
        <Routes>
          <Route path="/" element={<HomePage user={user} />} />
          <Route path="/login" element={token ? <Navigate to="/marketplace" replace /> : <AuthPage mode="login" onAuthSuccess={handleAuthSuccess} />} />
          <Route path="/register" element={token ? <Navigate to="/marketplace" replace /> : <AuthPage mode="register" onAuthSuccess={handleAuthSuccess} />} />
          <Route path="/marketplace" element={<MarketplacePage token={token} />} />
          <Route path="/listings/:id" element={<AuctionDetailPage token={token} />} />
          <Route path="/sell" element={token ? <CreateListingPage token={token} /> : <Navigate to="/login" replace />} />
          <Route path="/dashboard" element={token ? <DashboardPage token={token} /> : <Navigate to="/login" replace />} />
          <Route path="/seller" element={token ? <SellerManagementPage token={token} /> : <Navigate to="/login" replace />} />
          <Route path="/saved-searches" element={token ? <SavedSearchesPage token={token} /> : <Navigate to="/login" replace />} />
          <Route path="/notifications" element={token ? <NotificationsPage token={token} /> : <Navigate to="/login" replace />} />
        </Routes>
      </main>
    </div>
  );
}

function Header({ user, notificationCount, onLogout }) {
  const location = useLocation();
  const navLinkClass = ({ isActive }) =>
    `rounded-full px-3 py-2 text-sm font-medium transition ${
      isActive ? 'bg-brand-900 text-white shadow-soft' : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
    }`;

  return (
    <header className="sticky top-0 z-30 border-b border-slate-200 bg-white/90 backdrop-blur">
      <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-4 sm:px-6 lg:px-8">
        <Link to="/" className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-brand-900 text-lg font-bold text-white">C</div>
          <div>
            <div className="text-xl font-bold tracking-tight text-brand-900">CampusBid</div>
            <div className="text-[11px] uppercase tracking-[0.22em] text-slate-400">Student marketplace</div>
          </div>
        </Link>

        <nav className="hidden items-center gap-2 md:flex">
          <NavLink to="/" className={navLinkClass}>Home</NavLink>
          <NavLink to="/marketplace" className={navLinkClass}>Marketplace</NavLink>
          <NavLink to="/dashboard" className={navLinkClass}>Dashboard</NavLink>
          <NavLink to="/seller" className={navLinkClass}>Seller</NavLink>
          {user ? (
            <NavLink to="/saved-searches" className={navLinkClass}>Saved searches</NavLink>
          ) : null}
          {user ? (
            <NavLink to="/notifications" className={navLinkClass}>
              <span className="inline-flex items-center gap-2">
                Alerts
                {notificationCount > 0 ? <span className="rounded-full bg-red-500 px-2 py-0.5 text-[10px] text-white">{notificationCount}</span> : null}
              </span>
            </NavLink>
          ) : null}
        </nav>

        <div className="flex items-center gap-3">
          {user ? (
            <>
              <Link to="/sell" className="hidden items-center gap-2 rounded-full bg-brand-900 px-4 py-2 font-medium text-white shadow-soft sm:inline-flex">
                <PlusCircle size={16} /> Sell item
              </Link>
              <Link to="/notifications" className="relative inline-flex h-10 w-10 items-center justify-center rounded-full border border-slate-200 bg-slate-50 text-slate-700">
                <Bell size={18} />
                {notificationCount > 0 ? <span className="absolute -right-1 -top-1 rounded-full bg-red-500 px-1.5 py-0.5 text-[9px] text-white">{notificationCount}</span> : null}
              </Link>
              <button onClick={onLogout} className="inline-flex items-center gap-2 rounded-full border border-slate-200 px-3 py-2 text-sm text-slate-700">
                <LogOut size={15} /> Logout
              </button>
            </>
          ) : (
            <>
              <Link to="/login" className="rounded-full border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700">Log in</Link>
              <Link to="/register" className="rounded-full bg-brand-900 px-4 py-2 text-sm font-medium text-white shadow-soft">Sign up</Link>
            </>
          )}
        </div>
      </div>
    </header>
  );
}

function HomePage({ user }) {
  const [featured, setFeatured] = useState([]);

  useEffect(() => {
    fetchJson('/listings?sort=price-high&limit=3')
      .then((payload) => setFeatured(payload.listings || []))
      .catch(() => setFeatured([]));
  }, []);

  return (
    <div className="space-y-12">
      <section className="grid gap-8 rounded-[30px] bg-gradient-to-br from-brand-900 via-indigo-900 to-brand-700 p-8 text-white shadow-soft lg:grid-cols-[1.3fr_0.7fr] lg:p-12">
        <div>
          <p className="mb-4 inline-flex rounded-full bg-white/10 px-3 py-1 text-xs font-medium uppercase tracking-[0.22em] text-blue-100">Fair campus trading</p>
          <h1 className="max-w-xl text-4xl font-black tracking-tight sm:text-5xl">Buy and sell used items with transparent campus auctions.</h1>
          <p className="mt-5 max-w-xl text-lg text-blue-100">From bikes to books and electronics, CampusBid helps students trade with trust, speed, and clear pricing.</p>

          <div className="mt-8 flex flex-wrap gap-4">
            <Link to="/marketplace" className="inline-flex items-center gap-2 rounded-full bg-white px-5 py-3 font-semibold text-brand-900">
              Browse listings <ArrowRight size={18} />
            </Link>
            <Link to={user ? '/sell' : '/register'} className="inline-flex items-center gap-2 rounded-full border border-white/30 px-5 py-3 font-semibold text-white">
              Start selling
            </Link>
          </div>

          <div className="mt-8 flex flex-wrap gap-6 text-sm text-blue-100">
            <div><span className="block text-3xl font-black text-white">2.4k+</span> student listings</div>
            <div><span className="block text-3xl font-black text-white">1.1k+</span> successful handovers</div>
            <div><span className="block text-3xl font-black text-white">₹92L</span> in student trade value</div>
          </div>
        </div>

        <div className="rounded-[26px] bg-white/10 p-5 backdrop-blur-sm">
          <div className="mb-4 flex items-center justify-between text-sm text-blue-100">
            <span className="inline-flex items-center gap-2"><Sparkles size={16} /> Featured now</span>
            <span>Live</span>
          </div>
          <div className="space-y-4">
            {featured.slice(0, 3).map((listing) => (
              <div key={listing.id} className="rounded-2xl bg-white/10 p-4">
                <div className="mb-2 flex items-center justify-between">
                  <span className="text-xs uppercase tracking-[0.18em] text-blue-100">{listing.category}</span>
                  <span className="rounded-full bg-emerald-500/20 px-2 py-0.5 text-xs text-emerald-100">{listing.status}</span>
                </div>
                <div className="text-lg font-semibold">{listing.title}</div>
                <div className="mt-2 flex items-center justify-between text-sm text-blue-100">
                  <span>Current bid</span>
                  <span className="text-base font-bold text-white">{formatCurrency(listing.currentBid || listing.startingPrice)}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="space-y-6">
        <div className="flex items-center justify-between">
          <h2 className="text-3xl font-bold tracking-tight text-slate-900">Popular categories</h2>
        </div>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
          {categories.map((category) => (
            <Link key={category} to="/marketplace" className="rounded-2xl border border-slate-200 bg-white p-5 text-center shadow-sm transition hover:-translate-y-0.5 hover:shadow-soft">
              <div className="mb-3 inline-flex h-12 w-12 items-center justify-center rounded-full bg-brand-50 text-brand-700">
                <ShoppingBag size={18} />
              </div>
              <div className="font-semibold text-slate-900">{category}</div>
            </Link>
          ))}
        </div>
      </section>

      <section className="space-y-6">
        <div className="flex items-center justify-between">
          <h2 className="text-3xl font-bold tracking-tight text-slate-900">Recently listed</h2>
          <Link to="/marketplace" className="text-sm font-semibold text-brand-700">View all</Link>
        </div>
        <ListGrid type="home" />
      </section>
    </div>
  );
}

function MarketplacePage({ token }) {
  const [listings, setListings] = useState([]);
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState('all');
  const [condition, setCondition] = useState('all');
  const [sort, setSort] = useState('newest');

  const loadListings = async () => {
    const params = new URLSearchParams({
      q: query,
      category,
      condition,
      sort,
    });

    const payload = await fetchJson(`/listings?${params.toString()}`);
    setListings(payload.listings || []);
  };

  useEffect(() => {
    loadListings().catch(() => setListings([]));
  }, [query, category, condition, sort]);

  return (
    <div className="space-y-6">
      <div className="rounded-[30px] border border-slate-200 bg-white p-6 shadow-soft">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.2em] text-brand-700">Marketplace</p>
            <h1 className="mt-2 text-3xl font-bold tracking-tight text-slate-900">Find campus deals worth bidding on</h1>
          </div>
          <div className="flex w-full max-w-md items-center gap-3 rounded-full border border-slate-200 bg-slate-50 px-4 py-3">
            <Search size={18} className="text-slate-400" />
            <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search title, keyword or category" className="w-full bg-transparent text-sm outline-none" />
          </div>
        </div>
        <div className="mt-6 grid gap-3 md:grid-cols-4">
          <select value={category} onChange={(event) => setCategory(event.target.value)} className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-3 text-sm outline-none">
            <option value="all">All categories</option>
            {categories.map((item) => <option key={item} value={item}>{item}</option>)}
          </select>
          <select value={condition} onChange={(event) => setCondition(event.target.value)} className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-3 text-sm outline-none">
            <option value="all">Any condition</option>
            <option value="Excellent">Excellent</option>
            <option value="Good">Good</option>
            <option value="Fair">Fair</option>
          </select>
          <select value={sort} onChange={(event) => setSort(event.target.value)} className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-3 text-sm outline-none">
            <option value="newest">Newest</option>
            <option value="price-low">Price: Low to High</option>
            <option value="price-high">Price: High to Low</option>
            <option value="closing-soon">Closing soon</option>
          </select>
          <div className="rounded-xl bg-brand-900 px-4 py-3 text-center text-sm font-medium text-white">{listings.length} live listings</div>
        </div>
      </div>

      <ListGrid listings={listings} />
    </div>
  );
}

function AuctionDetailPage({ token }) {
  const { id } = useParams();
  const navigate = useNavigate();
  const [listing, setListing] = useState(null);
  const [amount, setAmount] = useState('');
  const [error, setError] = useState('');

  const loadListing = async () => {
    const payload = await fetchJson(`/listings/${id}`);
    setListing(payload.listing || null);
    const currentBid = Number(payload.listing?.currentBid || payload.listing?.startingPrice || 0);
    setAmount(String(currentBid + (payload.listing?.minimumIncrement || 0)));
  };

  useEffect(() => {
    loadListing().catch(() => setListing(null));
  }, [id]);

  if (!listing) {
    return <div className="rounded-3xl border border-slate-200 bg-white p-8 text-center text-slate-600">Loading listing...</div>;
  }

  const currentBid = Number(listing.currentBid || listing.startingPrice || 0);
  const minBid = currentBid === 0 ? listing.startingPrice : currentBid + listing.minimumIncrement;

  const submitBid = async (event) => {
    event.preventDefault();
    if (!token) {
      navigate('/login');
      return;
    }

    try {
      setError('');
      await fetchJson(`/listings/${id}/bid`, {
        method: 'POST',
        body: JSON.stringify({ amount: Number(amount) }),
      }, token);
      await loadListing();
    } catch (apiError) {
      setError(apiError.message);
    }
  };

  return (
    <div className="space-y-8">
      <div className="grid gap-8 lg:grid-cols-[1.1fr_0.9fr]">
        <div className="rounded-[30px] border border-slate-200 bg-white p-5 shadow-soft">
          <div className="mb-5 flex items-center justify-between">
            <span className="rounded-full bg-brand-50 px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] text-brand-700">{listing.category}</span>
            <span className="rounded-full bg-emerald-100 px-3 py-1 text-xs font-semibold text-emerald-700">{listing.status}</span>
          </div>

          <div className="overflow-hidden rounded-2xl bg-gradient-to-br from-slate-200 to-slate-100 p-12 text-center text-3xl font-black text-slate-500">Image preview</div>
          <h1 className="mt-6 text-3xl font-bold tracking-tight text-slate-900">{listing.title}</h1>
          <p className="mt-3 text-slate-600">{listing.description}</p>

          <div className="mt-6 grid gap-4 sm:grid-cols-3">
            <InfoCard label="Condition" value={listing.condition} icon={<ShieldCheck size={18} />} />
            <InfoCard label="Starts at" value={formatCurrency(listing.startingPrice)} icon={<DollarSign size={18} />} />
            <InfoCard label="Closing" value={new Date(listing.closingAt).toLocaleString()} icon={<Clock3 size={18} />} />
          </div>
        </div>

        <div className="rounded-[30px] border border-slate-200 bg-white p-6 shadow-soft">
          <div className="flex items-center justify-between border-b border-slate-200 pb-4">
            <div>
              <p className="text-sm uppercase tracking-[0.18em] text-slate-400">Current leading bid</p>
              <div className="mt-1 text-4xl font-black text-brand-900">{formatCurrency(currentBid)}</div>
            </div>
            <div className="inline-flex items-center gap-2 rounded-full bg-brand-50 px-3 py-1 text-brand-700">
              <Gavel size={15} /> Live
            </div>
          </div>

          <div className="mt-6 space-y-3 text-sm text-slate-600">
            <div className="flex items-center justify-between"><span>Minimum next bid</span><strong className="text-slate-900">{formatCurrency(minBid)}</strong></div>
            <div className="flex items-center justify-between"><span>Seller</span><strong className="text-slate-900">{listing.seller?.name}</strong></div>
            <div className="flex items-center justify-between"><span>Fairness</span><strong className="text-slate-900">Auction rules enforced</strong></div>
          </div>

          <form onSubmit={submitBid} className="mt-6 space-y-4">
            <label className="block text-sm font-medium text-slate-700">Your bid amount</label>
            <input type="number" min={minBid} value={amount} onChange={(event) => setAmount(event.target.value)} className="w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 outline-none ring-0" />
            {error ? <div className="rounded-xl bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div> : null}
            <button type="submit" className="w-full rounded-xl bg-brand-900 px-4 py-3 font-semibold text-white">Place bid</button>
          </form>

          <div className="mt-6 rounded-2xl bg-slate-50 p-4">
            <div className="mb-3 font-semibold text-slate-900">Bid history</div>
            <div className="space-y-3">
              {(listing.bidHistory || []).length ? listing.bidHistory.map((bid) => (
                <div key={bid.id} className="flex items-center justify-between rounded-xl bg-white px-3 py-2 text-sm">
                  <span>{bid.bidder?.name || 'Bidder'}</span>
                  <span className="font-semibold text-slate-900">{formatCurrency(bid.amount)}</span>
                </div>
              )) : <div className="text-sm text-slate-500">No bids yet. Be the first to put a fair price.</div>}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function CreateListingPage({ token }) {
  const navigate = useNavigate();
  const [form, setForm] = useState({
    title: '',
    category: 'Textbooks',
    description: '',
    condition: 'Good',
    startingPrice: '',
    minimumIncrement: '250',
    closingAt: '',
  });
  const [error, setError] = useState('');

  const handleSubmit = async (event) => {
    event.preventDefault();
    try {
      setError('');
      const payload = await fetchJson('/listings', {
        method: 'POST',
        body: JSON.stringify({
          ...form,
          startingPrice: Number(form.startingPrice),
          minimumIncrement: Number(form.minimumIncrement),
        }),
      }, token);
      navigate(`/listings/${payload.listing.id}`);
    } catch (apiError) {
      setError(apiError.message);
    }
  };

  const updateField = (field) => (event) => setForm((current) => ({ ...current, [field]: event.target.value }));

  return (
    <div className="mx-auto max-w-3xl rounded-[30px] border border-slate-200 bg-white p-8 shadow-soft">
      <h1 className="text-3xl font-bold tracking-tight text-slate-900">Create a listing</h1>
      <p className="mt-2 text-slate-600">Set a fair starting price and close the sale with trusted campus bidding rules.</p>

      <form onSubmit={handleSubmit} className="mt-8 space-y-5">
        <div className="grid gap-5 md:grid-cols-2">
          <Field label="Title" value={form.title} onChange={updateField('title')} placeholder="Used bicycle, textbook bundle..." />
          <Field label="Category" value={form.category} onChange={updateField('category')} as="select">
            {categories.map((category) => <option key={category} value={category}>{category}</option>)}
          </Field>
        </div>

        <Field label="Description" value={form.description} onChange={updateField('description')} as="textarea" placeholder="Describe condition, usage history, and any included items." />

        <div className="grid gap-5 md:grid-cols-3">
          <Field label="Condition" value={form.condition} onChange={updateField('condition')} as="select">
            <option value="Excellent">Excellent</option>
            <option value="Good">Good</option>
            <option value="Fair">Fair</option>
          </Field>
          <Field label="Starting price" type="number" value={form.startingPrice} onChange={updateField('startingPrice')} />
          <Field label="Bid increment" type="number" value={form.minimumIncrement} onChange={updateField('minimumIncrement')} />
        </div>

        <Field label="Closing date and time" type="datetime-local" value={form.closingAt} onChange={updateField('closingAt')} />
        {error ? <div className="rounded-xl bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div> : null}

        <button type="submit" className="w-full rounded-xl bg-brand-900 px-4 py-3 font-semibold text-white">Publish listing</button>
      </form>
    </div>
  );
}

function DashboardPage({ token }) {
  const [overview, setOverview] = useState({ activeListings: [], myBids: [], pendingSales: [], soldItems: [] });

  useEffect(() => {
    fetchJson('/seller/overview', {}, token)
      .then((payload) => setOverview({
        activeListings: payload.activeListings || [],
        myBids: payload.myBids || [],
        pendingSales: payload.pendingSales || [],
        soldItems: payload.soldItems || [],
      }))
      .catch(() => setOverview({ activeListings: [], myBids: [], pendingSales: [], soldItems: [] }));
  }, [token]);

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold tracking-tight text-slate-900">Student dashboard</h1>
        <Link to="/sell" className="rounded-full bg-brand-900 px-4 py-2 text-sm font-semibold text-white">New listing</Link>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <StatCard label="Active listings" value={overview.activeListings.length} />
        <StatCard label="Pending sales" value={overview.pendingSales.length} />
        <StatCard label="Completed sales" value={overview.soldItems.length} />
      </div>

      <div className="grid gap-6 xl:grid-cols-2">
        <Panel title="My active listings">
          {overview.activeListings.length ? overview.activeListings.map((item) => (
            <div key={item.id} className="rounded-2xl border border-slate-200 p-4">
              <div className="flex items-center justify-between">
                <div className="font-semibold text-slate-900">{item.title}</div>
                <span className="text-sm text-brand-700">{item.status}</span>
              </div>
              <div className="mt-2 text-sm text-slate-500">{formatCurrency(item.currentBid || item.startingPrice)} current bid</div>
            </div>
          )) : <EmptyState text="No listings yet." />}
        </Panel>

        <Panel title="Seller decisions">
          {overview.pendingSales.length ? overview.pendingSales.map((sale) => (
            <div key={sale.id} className="rounded-2xl border border-slate-200 p-4">
              <div className="font-semibold text-slate-900">Sale pending</div>
              <div className="mt-1 text-sm text-slate-500">Price: {formatCurrency(sale.price)}</div>
            </div>
          )) : <EmptyState text="No pending approvals." />}
        </Panel>
      </div>
    </div>
  );
}

function SellerManagementPage({ token }) {
  const [listings, setListings] = useState([]);

  useEffect(() => {
    fetchJson('/seller/listings', {}, token)
      .then((payload) => setListings(payload.listings || []))
      .catch(() => setListings([]));
  }, [token]);

  return (
    <div className="space-y-6">
      <h1 className="text-3xl font-bold tracking-tight text-slate-900">Seller management</h1>
      <div className="space-y-4">
        {listings.length ? listings.map((listing) => (
          <div key={listing.id} className="rounded-[24px] border border-slate-200 bg-white p-5 shadow-soft">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <div className="text-xl font-semibold text-slate-900">{listing.title}</div>
                <div className="mt-1 text-sm text-slate-500">{listing.category} · {listing.status}</div>
              </div>
              <div className="flex gap-2">
                <button className="rounded-full border border-slate-200 px-3 py-2 text-sm font-medium text-slate-700">Edit</button>
                <button className="rounded-full bg-red-100 px-3 py-2 text-sm font-medium text-red-700">Cancel</button>
              </div>
            </div>
            <div className="mt-4 flex gap-8 text-sm text-slate-600">
              <span>Current bid: <strong className="text-slate-900">{formatCurrency(listing.currentBid || listing.startingPrice)}</strong></span>
              <span>Closing: <strong className="text-slate-900">{new Date(listing.closingAt).toLocaleString()}</strong></span>
            </div>
          </div>
        )) : <EmptyState text="You have not created any listings yet." />}
      </div>
    </div>
  );
}

function NotificationsPage({ token }) {
  const [notifications, setNotifications] = useState([]);
  const [permission, setPermission] = useState(() => (typeof window !== 'undefined' && 'Notification' in window ? Notification.permission : 'unsupported'));

  const refreshNotifications = async () => {
    try {
      const payload = await fetchJson('/notifications', {}, token);
      setNotifications(payload.notifications || []);
    } catch {
      setNotifications([]);
    }
  };

  useEffect(() => {
    refreshNotifications();
  }, [token]);

  const markAllRead = async () => {
    try {
      await fetchJson('/notifications/read-all', { method: 'PATCH' }, token);
      await refreshNotifications();
    } catch {
      // noop
    }
  };

  const enableBrowserNotifications = async () => {
    if (typeof window === 'undefined' || !('Notification' in window)) {
      return;
    }

    const next = await Notification.requestPermission();
    setPermission(next);
    if (next === 'granted') {
      new Notification('CampusBid alerts enabled', { body: 'You will now receive browser alerts for important activity.' });
    }
  };

  const markOneRead = async (notificationId) => {
    try {
      await fetchJson(`/notifications/${notificationId}/read`, { method: 'PATCH' }, token);
      await refreshNotifications();
    } catch {
      // noop
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 rounded-[30px] border border-slate-200 bg-white p-6 shadow-soft md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-slate-900">Notification center</h1>
          <p className="mt-1 text-sm text-slate-500">Stay up to date without missing out on bids, approvals, and matching listings.</p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          {typeof window !== 'undefined' && 'Notification' in window && permission !== 'denied' ? (
            <button onClick={enableBrowserNotifications} className="rounded-full bg-brand-900 px-4 py-2 text-sm font-medium text-white">
              {permission === 'granted' ? 'Browser alerts on' : 'Enable browser alerts'}
            </button>
          ) : null}
          <button onClick={markAllRead} className="rounded-full border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700">Mark all read</button>
        </div>
      </div>

      <div className="space-y-3">
        {notifications.length ? notifications.map((notification) => (
          <div key={notification.id} className={`rounded-[24px] border p-4 shadow-soft ${notification.read ? 'border-slate-200 bg-white' : 'border-brand-200 bg-brand-50'}`}>
            <div className="flex items-start justify-between gap-4">
              <div>
                <div className="font-semibold text-slate-900">{notification.type}</div>
                <div className="text-xs text-slate-400">{new Date(notification.createdAt).toLocaleString()}</div>
              </div>
              {!notification.read ? (
                <button onClick={() => markOneRead(notification.id)} className="rounded-full border border-slate-200 px-3 py-1 text-xs font-medium text-slate-700">Mark read</button>
              ) : null}
            </div>
            <p className="mt-2 text-sm text-slate-600">{notification.message}</p>
          </div>
        )) : <EmptyState text="No notifications yet." />}
      </div>
    </div>
  );
}

function SavedSearchesPage({ token }) {
  const [savedSearches, setSavedSearches] = useState([]);
  const [form, setForm] = useState({
    name: '',
    query: '',
    category: 'all',
    condition: 'all',
    minPrice: '',
    maxPrice: '',
    closingSoon: false,
  });
  const [error, setError] = useState('');

  const refreshSavedSearches = async () => {
    try {
      const payload = await fetchJson('/saved-searches', {}, token);
      setSavedSearches(payload.savedSearches || []);
    } catch {
      setSavedSearches([]);
    }
  };

  useEffect(() => {
    refreshSavedSearches();
  }, [token]);

  const submitSearch = async (event) => {
    event.preventDefault();
    setError('');

    try {
      const payload = {
        name: form.name || 'Saved search',
        query: form.query || '',
        category: form.category === 'all' ? null : form.category,
        condition: form.condition === 'all' ? null : form.condition,
        minPrice: form.minPrice === '' ? null : Number(form.minPrice),
        maxPrice: form.maxPrice === '' ? null : Number(form.maxPrice),
        closingSoon: form.closingSoon,
      };

      await fetchJson('/saved-searches', {
        method: 'POST',
        body: JSON.stringify(payload),
      }, token);

      setForm({
        name: '',
        query: '',
        category: 'all',
        condition: 'all',
        minPrice: '',
        maxPrice: '',
        closingSoon: false,
      });
      await refreshSavedSearches();
    } catch (apiError) {
      setError(apiError.message);
    }
  };

  const deleteSearch = async (id) => {
    try {
      await fetchJson(`/saved-searches/${id}`, { method: 'DELETE' }, token);
      await refreshSavedSearches();
    } catch {
      // noop
    }
  };

  return (
    <div className="space-y-6">
      <div className="rounded-[30px] border border-slate-200 bg-white p-6 shadow-soft">
        <h1 className="text-3xl font-bold tracking-tight text-slate-900">Saved searches</h1>
        <p className="mt-2 text-sm text-slate-500">Create alerts for the listings you care about most.</p>
      </div>

      <div className="grid gap-6 lg:grid-cols-[0.9fr_1.1fr]">
        <div className="rounded-[30px] border border-slate-200 bg-white p-6 shadow-soft">
          <h2 className="text-xl font-bold text-slate-900">Save a new search</h2>
          <form onSubmit={submitSearch} className="mt-5 space-y-4">
            <input value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} placeholder="Search name" className="w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm outline-none" />
            <input value={form.query} onChange={(event) => setForm({ ...form, query: event.target.value })} placeholder="Keyword, item name, or topic" className="w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm outline-none" />
            <div className="grid gap-4 sm:grid-cols-2">
              <select value={form.category} onChange={(event) => setForm({ ...form, category: event.target.value })} className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-3 text-sm outline-none">
                <option value="all">Any category</option>
                {categories.map((category) => <option key={category} value={category}>{category}</option>)}
              </select>
              <select value={form.condition} onChange={(event) => setForm({ ...form, condition: event.target.value })} className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-3 text-sm outline-none">
                <option value="all">Any condition</option>
                <option value="Excellent">Excellent</option>
                <option value="Good">Good</option>
                <option value="Fair">Fair</option>
              </select>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <input type="number" min="0" value={form.minPrice} onChange={(event) => setForm({ ...form, minPrice: event.target.value })} placeholder="Min price" className="w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm outline-none" />
              <input type="number" min="0" value={form.maxPrice} onChange={(event) => setForm({ ...form, maxPrice: event.target.value })} placeholder="Max price" className="w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm outline-none" />
            </div>
            <label className="flex items-center gap-3 text-sm text-slate-700">
              <input type="checkbox" checked={form.closingSoon} onChange={(event) => setForm({ ...form, closingSoon: event.target.checked })} />
              Notify me for items closing soon
            </label>
            {error ? <div className="rounded-xl bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div> : null}
            <button type="submit" className="w-full rounded-xl bg-brand-900 px-4 py-3 font-semibold text-white">Save search</button>
          </form>
        </div>

        <div className="rounded-[30px] border border-slate-200 bg-white p-6 shadow-soft">
          <h2 className="text-xl font-bold text-slate-900">Your saved searches</h2>
          <div className="mt-5 space-y-3">
            {savedSearches.length ? savedSearches.map((savedSearch) => (
              <div key={savedSearch.id} className="rounded-[24px] border border-slate-200 bg-slate-50 p-4">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <div className="font-semibold text-slate-900">{savedSearch.name}</div>
                    <div className="mt-1 text-sm text-slate-500">{savedSearch.filters?.query || 'Any item'} · {savedSearch.filters?.category || 'Any category'} · {savedSearch.filters?.condition || 'Any condition'}</div>
                  </div>
                  <button onClick={() => deleteSearch(savedSearch.id)} className="rounded-full border border-slate-200 px-3 py-1 text-xs font-medium text-slate-700">Delete</button>
                </div>
                <div className="mt-3 text-xs text-slate-500">
                  {savedSearch.filters?.minPrice ? `Min: ₹${savedSearch.filters.minPrice} ` : ''}
                  {savedSearch.filters?.maxPrice ? `Max: ₹${savedSearch.filters.maxPrice}` : ''}
                  {savedSearch.filters?.closingSoon ? ' · Closing soon' : ''}
                </div>
              </div>
            )) : <EmptyState text="No saved searches yet." />}
          </div>
        </div>
      </div>
    </div>
  );
}

function AuthPage({ mode, onAuthSuccess }) {
  const navigate = useNavigate();
  const [form, setForm] = useState({ name: '', email: '', password: '' });
  const [error, setError] = useState('');

  const handleSubmit = async (event) => {
    event.preventDefault();
    setError('');

    try {
      const endpoint = mode === 'register' ? '/auth/register' : '/auth/login';
      const payload = await fetchJson(endpoint, {
        method: 'POST',
        body: JSON.stringify(form),
      });

      onAuthSuccess(payload);
      navigate('/marketplace');
    } catch (apiError) {
      setError(apiError.message);
    }
  };

  return (
    <div className="mx-auto max-w-lg rounded-[30px] border border-slate-200 bg-white p-8 shadow-soft">
      <div className="mb-6 text-center">
        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-brand-900 text-xl font-bold text-white">C</div>
        <h1 className="mt-4 text-3xl font-bold text-slate-900">{mode === 'register' ? 'Create your account' : 'Welcome back'}</h1>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        {mode === 'register' ? (
          <Field label="Full name" value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} placeholder="Aarav Mehta" />
        ) : null}
        <Field label="Email" type="email" value={form.email} onChange={(event) => setForm({ ...form, email: event.target.value })} placeholder="name@college.edu" />
        <Field label="Password" type="password" value={form.password} onChange={(event) => setForm({ ...form, password: event.target.value })} placeholder="••••••••" />
        {error ? <div className="rounded-xl bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div> : null}
        <button type="submit" className="w-full rounded-xl bg-brand-900 px-4 py-3 font-semibold text-white">{mode === 'register' ? 'Create account' : 'Log in'}</button>
      </form>
      <p className="mt-4 text-center text-sm text-slate-600">
        {mode === 'register' ? 'Already registered?' : 'New here?'}
        <Link to={mode === 'register' ? '/login' : '/register'} className="ml-2 font-semibold text-brand-700">{mode === 'register' ? 'Log in' : 'Create account'}</Link>
      </p>
    </div>
  );
}

function ListGrid({ listings, type = 'general' }) {
  const items = listings || [];
  if (!items.length) { return <div className="rounded-3xl border border-dashed border-slate-200 bg-white p-8 text-center text-slate-500">No listings match your filters right now.</div>; }

  return (
    <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-3">
      {items.map((listing) => (
        <Link key={listing.id} to={`/listings/${listing.id}`} className="group overflow-hidden rounded-[28px] border border-slate-200 bg-white p-3 shadow-sm transition hover:-translate-y-1 hover:shadow-soft">
          <div className="mb-4 flex h-48 items-center justify-center rounded-[20px] bg-gradient-to-br from-slate-200 to-slate-100 text-2xl font-black text-slate-500">{listing.category}</div>
          <div className="flex items-start justify-between gap-4">
            <div>
              <div className="text-xs uppercase tracking-[0.18em] text-slate-400">{listing.category}</div>
              <h3 className="mt-2 text-xl font-bold text-slate-900">{listing.title}</h3>
            </div>
            <div className="rounded-full bg-emerald-100 px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-emerald-700">{listing.status}</div>
          </div>
          <div className="mt-4 flex items-center justify-between text-sm text-slate-500">
            <span>Condition: {listing.condition}</span>
            <span className="font-semibold text-brand-700">{formatCurrency(listing.currentBid || listing.startingPrice)}</span>
          </div>
          <div className="mt-4 flex items-center justify-between text-xs text-slate-400">
            <span className="inline-flex items-center gap-1"><Clock3 size={12} /> {new Date(listing.closingAt).toLocaleString()}</span>
            <span>Bid: {listing.bidHistory?.length || 0}</span>
          </div>
        </Link>
      ))}
    </div>
  );
}

function InfoCard({ label, value, icon }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
      <div className="mb-2 inline-flex h-8 w-8 items-center justify-center rounded-full bg-brand-50 text-brand-700">{icon}</div>
      <div className="text-xs uppercase tracking-[0.16em] text-slate-400">{label}</div>
      <div className="mt-1 text-base font-semibold text-slate-900">{value}</div>
    </div>
  );
}

function Panel({ title, children }) {
  return (
    <div className="rounded-[28px] border border-slate-200 bg-white p-5 shadow-soft">
      <h2 className="text-xl font-bold text-slate-900">{title}</h2>
      <div className="mt-4 space-y-3">{children}</div>
    </div>
  );
}

function StatCard({ label, value }) {
  return (
    <div className="rounded-[24px] border border-slate-200 bg-white p-5 shadow-soft">
      <p className="text-sm uppercase tracking-[0.18em] text-slate-400">{label}</p>
      <div className="mt-3 text-3xl font-black text-brand-900">{value}</div>
    </div>
  );
}

function EmptyState({ text }) {
  return <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 p-4 text-sm text-slate-500">{text}</div>;
}

function Field({ label, value, onChange, placeholder, type = 'text', as = 'input', children }) {
  const common = {
    value,
    onChange,
    placeholder,
    type,
    className: 'w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-900 outline-none placeholder:text-slate-400',
  };

  return (
    <label className="block text-sm font-medium text-slate-700">
      <span className="mb-2 block">{label}</span>
      {as === 'textarea' ? (
        <textarea {...common} rows={4} />
      ) : as === 'select' ? (
        <select {...common}>{children}</select>
      ) : (
        <input {...common} />
      )}
    </label>
  );
}

export default App;
