# Multi-Domain Storefront Implementation Guide
**Host Customer Storefronts on `tskstore.net` & Manage Everything on `tsk05.net` (Same VPS)**

---

## Executive Summary & Architecture

This guide provides the complete blueprint and step-by-step instructions to host customer-facing storefronts on a dedicated, clean domain (e.g. `https://tskstore.net/loveagostore`) while allowing users to manage products, pricing, orders, and commissions on the main platform (`https://tsk05.net`), all hosted on the **same VPS**.

### Recommended Architecture: Unified Multi-Domain Single-App

```text
                                 [ VPS (Ubuntu 22/24 LTS) ]
                                              │
                      ┌───────────────────────┴───────────────────────┐
                      │                 Nginx Proxy                   │
                      │             Ports 80 / 443 (SSL)              │
                      └───────┬───────────────────────────────┬───────┘
                              │ Host: tsk05.net               │ Host: tskstore.net
                              ▼                               ▼
                      ┌───────────────────────────────────────────────┐
                      │        Single Next.js App (Port 3000)         │
                      │                  (PM2 Node)                   │
                      │                                               │
                      │  Next.js Middleware Domain Router:            │
                      │  • tskstore.net/loveagostore                  │
                      │    ──(rewrite)──> /store/loveagostore         │
                      │  • tsk05.net/dashboard                        │
                      │    ──(normal)───> /dashboard                  │
                      └───────────────────────┬───────────────────────┘
                                              │
                                              ▼
                                 PostgreSQL Database (Local)
                              • Users & Storefront settings
                              • StorefrontOrders & Transactions
                              • Commission Wallets
```

### Key Architectural Benefits:
1. **Zero Database Sync Complexity**: Since both domains connect to the same PostgreSQL database, orders placed on `tskstore.net` immediately update the seller's commission wallet visible on `tsk05.net`.
2. **Minimal VPS Resource Footprint**: Running one optimized Next.js app in PM2 cluster mode uses 50% less RAM than launching separate apps.
3. **Clean URLs for Customers**: Buyers visit `https://tskstore.net/loveagostore` directly (no ugly `/store/` prefix required in the browser).
4. **Isolated Security**: Requests to `/admin` or `/dashboard` arriving on `tskstore.net` are automatically redirected to `https://tsk05.net/login`.

---

## Step 1: DNS Configuration (How & Why Both Domains Share Your VPS IP)

### "I already have `tsk05.net` @ and www pointed to my VPS IP, so what should I do with `tskstore.net`?"

**You do the exact same thing for `tskstore.net`!**

> **How this works**:
> A VPS has a single public IP address. Both `tsk05.net` and `tskstore.net` can point to that **same IP**. When a user's browser makes a request, it sends an HTTP header called `Host` (e.g., `Host: tskstore.net` or `Host: tsk05.net`).
> - Nginx listens on that single IP on ports 80/443.
> - When Nginx sees `Host: tsk05.net`, it serves the main portal.
> - When Nginx sees `Host: tskstore.net`, it serves the customer storefronts and the inquisitive homepage.

### In your DNS manager for `tskstore.net` (Namecheap, Cloudflare, GoDaddy, etc.):
Add these DNS **A records** pointing to the **exact same VPS IP**:

| Type | Host / Name | Value / Destination | TTL | Description |
| :--- | :--- | :--- | :--- | :--- |
| **A** | `@` | `<YOUR_VPS_IP>` | Auto / 1 min | Points root `tskstore.net` to your VPS |
| **A** | `www` | `<YOUR_VPS_IP>` | Auto / 1 min | Points `www.tskstore.net` to your VPS |

*(Do NOT touch or delete your existing records for `tsk05.net` — both domains will happily live on the same VPS).*


---

## Step 2: Nginx Reverse Proxy Configuration on VPS

Create a dedicated Nginx configuration for `tskstore.net`. This keeps configuration clean and modular alongside `/etc/nginx/sites-available/tsk05.net`.

### 1. Create `/etc/nginx/sites-available/tskstore.net`
Run on your VPS:
```bash
sudo cat << 'EOF' > /etc/nginx/sites-available/tskstore.net
server {
    listen 80;
    listen [::]:80;
    server_name tskstore.net www.tskstore.net;

    client_max_body_size 50M;

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;

        # WebSocket support
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';

        # Standard multi-tenant proxy headers
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_set_header X-Forwarded-Host $host;

        proxy_cache_bypass $http_upgrade;
        proxy_read_timeout 120s;
        proxy_connect_timeout 60s;
    }

    # Static file caching
    location /_next/static/ {
        alias /var/www/tskconnect/.next/static/;
        expires 365d;
        access_log off;
    }
}
EOF
```

### 2. Enable Site & Reload Nginx
```bash
sudo ln -sf /etc/nginx/sites-available/tskstore.net /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl reload nginx
```

---

## Step 3: SSL Certificate via Certbot (HTTPS)

Issue a free Let's Encrypt SSL certificate for `tskstore.net`:
```bash
sudo certbot --nginx -d tskstore.net -d www.tskstore.net --non-interactive --agree-tos -m admin@tsk05.net --redirect
```

---

## Step 4: Environment Variables (`.env`)

Add domain configuration variables to `/var/www/tskconnect/.env` (and local `.env`):

```bash
# Main Management Domain
MAIN_DOMAIN="tsk05.net"
NEXT_PUBLIC_MAIN_DOMAIN="tsk05.net"

# Dedicated Storefront Domain
STOREFRONT_DOMAIN="tskstore.net"
NEXT_PUBLIC_STOREFRONT_DOMAIN="tskstore.net"
```

---

## Step 5: Next.js Multi-Domain Middleware Router

Update `src/middleware.ts` to handle host-based routing.

### What the Middleware Does:
1. **Detects Domain**: Checks if incoming request is for `tskstore.net` or `tsk05.net`.
2. **Clean URL Rewrite**: When a visitor enters `https://tskstore.net/loveagostore`, Next.js internally rewrites it to `/store/loveagostore` so the existing App Router code (`src/app/store/[slug]/...`) handles it without changing the URL in the browser!
3. **Sub-Route Support**:
   - `tskstore.net/loveagostore/mtn` -> `/store/loveagostore/mtn`
   - `tskstore.net/loveagostore/track` -> `/store/loveagostore/track`
   - `tskstore.net/loveagostore/order/TSK-xxx` -> `/store/loveagostore/order/TSK-xxx`
4. **Security Isolation**: If someone visits `tskstore.net/admin` or `tskstore.net/dashboard`, they are redirected to `https://tsk05.net/login`.
5. **API & Static Passthrough**: `/api/...` and static files pass through transparently.

### Full Code for `src/middleware.ts`:

```typescript
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { jwtVerify } from "jose";

const SESSION_COOKIE = "tskconnect_session";
const secretString = process.env.AUTH_SECRET || "dev-insecure-secret-change-me-replace-in-prod";
const secret = new TextEncoder().encode(secretString);

const ADMIN_ONLY_PREFIXES = [
  "/admin/users",
  "/admin/settings",
  "/admin/api",
  "/admin/audit-logs",
  "/admin/pricing",
  "/admin/packages",
];

const STOREFRONT_DOMAIN = (process.env.STOREFRONT_DOMAIN || "tskstore.net").toLowerCase();
const MAIN_DOMAIN = (process.env.MAIN_DOMAIN || "tsk05.net").toLowerCase();

export async function middleware(request: NextRequest) {
  const { pathname, search } = request.nextUrl;
  const rawHost = request.headers.get("x-forwarded-host") || request.headers.get("host") || "";
  const host = rawHost.split(":")[0].toLowerCase();
  const isStorefrontDomain = host === STOREFRONT_DOMAIN || host === `www.${STOREFRONT_DOMAIN}`;

  // ---------------------------------------------------------------------------
  // 1. STOREFRONT DOMAIN ROUTING (tskstore.net)
  // ---------------------------------------------------------------------------
  if (isStorefrontDomain) {
    // Prevent access to management dashboard & admin panel on the storefront domain
    if (pathname.startsWith("/admin") || pathname.startsWith("/dashboard")) {
      return NextResponse.redirect(`https://${MAIN_DOMAIN}/login`);
    }

    // Allow API endpoints, internal assets, and favicon to execute directly
    if (
      pathname.startsWith("/api") ||
      pathname.startsWith("/_next") ||
      pathname.includes(".")
    ) {
      return NextResponse.next();
    }

    // Normalize legacy /store/[slug] URLs to clean root URLs
    if (pathname.startsWith("/store/")) {
      const cleanPath = pathname.replace(/^\/store/, "");
      const cleanUrl = request.nextUrl.clone();
      cleanUrl.pathname = cleanPath;
      return NextResponse.redirect(cleanUrl);
    }

    // Handle Storefront root (e.g. https://tskstore.net/)
    // Rewrites to /store which renders the dedicated "Inquisitive Visitor" homepage
    if (pathname === "/" || pathname === "") {
      const url = request.nextUrl.clone();
      url.pathname = "/store";
      return NextResponse.rewrite(url);
    }

    // Rewrite clean storefront paths:
    // /:slug -> /store/:slug
    // /:slug/mtn -> /store/:slug/mtn
    // /:slug/track -> /store/:slug/track
    // /:slug/order/:ref -> /store/:slug/order/:ref
    const url = request.nextUrl.clone();
    url.pathname = `/store${pathname}`;
    return NextResponse.rewrite(url);
  }

  // ---------------------------------------------------------------------------
  // 2. MAIN PLATFORM ROUTING (tsk05.net)
  // ---------------------------------------------------------------------------
  const token = request.cookies.get(SESSION_COOKIE)?.value;
  let payload: { role?: unknown; tv?: unknown } | null = null;
  if (token) {
    try {
      const { payload: verified } = await jwtVerify(token, secret, {
        issuer: "tskconnect",
      });
      payload = verified as { role?: unknown; tv?: unknown };
    } catch {
      payload = null;
    }
  }

  const role = typeof payload?.role === "string" ? payload.role : null;
  const isAuthPage = pathname === "/login" || pathname === "/register";

  if (isAuthPage && role) {
    const url = request.nextUrl.clone();
    url.pathname = "/dashboard";
    url.search = "";
    return NextResponse.redirect(url);
  }

  if (!pathname.startsWith("/admin") && !pathname.startsWith("/api/admin")) {
    if (isAuthPage) return NextResponse.next();
  }

  // Protect admin pages
  if (pathname.startsWith("/admin")) {
    if (!role) {
      const url = request.nextUrl.clone();
      url.pathname = "/login";
      url.search = `?next=${encodeURIComponent(pathname + search)}`;
      return NextResponse.redirect(url);
    }
    if (role !== "ADMIN" && role !== "MANAGER") {
      const url = request.nextUrl.clone();
      url.pathname = "/dashboard";
      url.search = "";
      return NextResponse.redirect(url);
    }
    if (
      role !== "ADMIN" &&
      ADMIN_ONLY_PREFIXES.some((p) => pathname.startsWith(p))
    ) {
      const url = request.nextUrl.clone();
      url.pathname = "/admin";
      url.search = "";
      return NextResponse.redirect(url);
    }
  }

  // Friendly /@slug redirects to the dedicated storefront domain
  if (pathname.startsWith("/@")) {
    const slug = pathname.slice(2).replace(/\/+$/, "");
    if (/^[a-z0-9-]{3,32}$/.test(slug)) {
      return NextResponse.redirect(`https://${STOREFRONT_DOMAIN}/${slug}`);
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    /*
     * Match all request paths except for:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     * - public files with extensions
     */
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
```

---

## Step 5.1: The "Inquisitive Visitor" Homepage (`src/app/store/page.tsx`)

When someone visits the naked root `https://tskstore.net/` without specifying a store slug, they shouldn't hit an error or get booted to an admin login. Instead, they meet an engaging, witty **"Inquisitive Visitor"** landing page that explains what `tskstore.net` is, lets them quickly enter a store name, track an existing order, or register on `tsk05.net` to launch their own store.

### Create `src/app/store/page.tsx`:

```tsx
"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Compass,
  ArrowRight,
  Store,
  Search,
  Sparkles,
  ShieldCheck,
  Zap,
  TrendingUp,
  ExternalLink,
} from "lucide-react";

export default function StorefrontIndexPage() {
  const router = useRouter();
  const [slugInput, setSlugInput] = useState("");
  const mainDomain = process.env.NEXT_PUBLIC_MAIN_DOMAIN || "tsk05.net";

  function handleGoToStore(e: React.FormEvent) {
    e.preventDefault();
    const clean = slugInput.trim().toLowerCase().replace(/^@/, "");
    if (clean) {
      router.push(`/${clean}`);
    }
  }

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col justify-between selection:bg-violet-500 selection:text-white">
      {/* Background ambient glow */}
      <div className="fixed inset-0 pointer-events-none overflow-hidden">
        <div className="absolute -top-40 left-1/2 -translate-x-1/2 w-[700px] h-[500px] bg-gradient-to-tr from-violet-600/20 via-fuchsia-600/15 to-transparent blur-3xl opacity-70" />
      </div>

      {/* Top navigation */}
      <header className="relative z-10 border-b border-white/10 px-6 py-4">
        <div className="max-w-6xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-violet-600 text-white font-bold shadow-lg shadow-violet-600/30">
              <Store className="h-5 w-5" />
            </span>
            <span className="font-bold tracking-tight text-lg text-white">
              tskstore<span className="text-violet-400">.net</span>
            </span>
          </div>
          <a
            href={`https://${mainDomain}/login`}
            className="text-xs font-semibold text-slate-400 hover:text-white transition flex items-center gap-1.5"
          >
            Store Owner Portal
            <ExternalLink className="h-3 w-3" />
          </a>
        </div>
      </header>

      {/* Hero section */}
      <main className="relative z-10 max-w-4xl mx-auto px-6 py-16 text-center space-y-10 my-auto">
        {/* Playful Inquisitive Badge */}
        <div className="inline-flex items-center gap-2 rounded-full border border-violet-500/30 bg-violet-500/10 px-4 py-1.5 text-xs font-medium text-violet-300">
          <Compass className="h-3.5 w-3.5 animate-spin text-violet-400" />
          Well, look who's inquisitive! 👀
        </div>

        <div className="space-y-4">
          <h1 className="text-4xl sm:text-6xl font-extrabold tracking-tight text-white leading-tight">
            Looking for something specific, <br />
            <span className="bg-gradient-to-r from-violet-400 via-fuchsia-300 to-pink-400 bg-clip-text text-transparent">
              or just exploring?
            </span>
          </h1>
          <p className="text-slate-400 text-base sm:text-lg max-w-2xl mx-auto">
            You’ve landed on the engine behind Ghana’s independent telecom reseller storefronts.
            Every store on <span className="text-violet-300 font-semibold">tskstore.net</span> is
            independently owned and powered by verified local entrepreneurs.
          </p>
        </div>

        {/* Quick Store Lookup Form */}
        <div className="max-w-xl mx-auto">
          <form
            onSubmit={handleGoToStore}
            className="flex flex-col sm:flex-row items-stretch gap-2 bg-slate-900/90 border border-white/10 rounded-2xl p-2 shadow-2xl backdrop-blur-md focus-within:border-violet-500/60 transition"
          >
            <div className="flex items-center flex-1 px-3 text-slate-400 text-sm">
              <span className="font-semibold text-slate-500 select-none mr-1">
                tskstore.net/
              </span>
              <input
                type="text"
                value={slugInput}
                onChange={(e) => setSlugInput(e.target.value)}
                placeholder="enter-store-slug"
                className="w-full bg-transparent text-white placeholder:text-slate-600 focus:outline-none text-sm font-medium"
                required
              />
            </div>
            <button
              type="submit"
              className="inline-flex items-center justify-center gap-2 rounded-xl bg-violet-600 hover:bg-violet-500 active:scale-[0.98] transition px-6 py-3 font-semibold text-sm text-white shadow-lg shadow-violet-600/30"
            >
              Visit Store
              <ArrowRight className="h-4 w-4" />
            </button>
          </form>
          <p className="text-xs text-slate-500 mt-2">
            Have a store link from someone? Type their name above to shop their packages.
          </p>
        </div>

        {/* Action Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-left pt-6 max-w-3xl mx-auto">
          {/* Card 1: Track existing order */}
          <div className="rounded-2xl border border-white/10 bg-slate-900/60 p-6 space-y-3 hover:border-violet-500/40 transition">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-sky-500/10 text-sky-400">
              <Search className="h-5 w-5" />
            </div>
            <h3 className="text-base font-bold text-white">Already placed an order?</h3>
            <p className="text-sm text-slate-400">
              Tracking your bundle delivery status or looking for a payment receipt? If you know the store name, jump straight to their tracking page.
            </p>
            <div className="pt-2">
              <span className="text-xs text-slate-500 font-mono">
                Hint: tskstore.net/[store-name]/track
              </span>
            </div>
          </div>

          {/* Card 2: Create your own store CTA */}
          <div className="rounded-2xl border border-violet-500/20 bg-gradient-to-br from-violet-950/40 via-slate-900/60 to-slate-900/60 p-6 space-y-3 hover:border-violet-500/50 transition">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-violet-500/20 text-violet-300">
              <Sparkles className="h-5 w-5" />
            </div>
            <h3 className="text-base font-bold text-white">Want your own reseller storefront?</h3>
            <p className="text-sm text-slate-400">
              Sell MTN, Telecel, and AirtelTigo data bundles at your own retail prices and earn instant commissions into your mobile money wallet.
            </p>
            <div className="pt-2">
              <a
                href={`https://${mainDomain}/register`}
                className="inline-flex items-center gap-1.5 text-xs font-bold text-violet-400 hover:text-violet-300 underline underline-offset-4"
              >
                Launch your store on {mainDomain}
                <ArrowRight className="h-3 w-3" />
              </a>
            </div>
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="relative z-10 border-t border-white/10 py-6 text-center text-xs text-slate-600">
        <div className="max-w-6xl mx-auto px-6 flex flex-col sm:flex-row items-center justify-between gap-3">
          <p>© {new Date().getFullYear()} tskstore.net. Platform infrastructure by Tskconnect.</p>
          <div className="flex items-center gap-4">
            <span className="inline-flex items-center gap-1 text-emerald-400">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />
              Storefront Gateway Live
            </span>
            <a href={`https://${mainDomain}`} className="hover:text-slate-400 transition">
              {mainDomain}
            </a>
          </div>
        </div>
      </footer>
    </div>
  );
}
```

---

## Step 6: Storefront Links Helper (`brands.ts`)

In `src/components/store/brands.ts`, update `networkHref` to support clean paths:

```typescript
export function networkHref(storeSlug: string, network: NetworkProvider): string {
  // If running on custom storefront domain, generate relative clean path: /:slug/:network
  return `/${storeSlug}/${NETWORK_BRANDS[network].slug}`;
}

export function storeHref(storeSlug: string, subpath: string = ""): string {
  const cleanSub = subpath ? (subpath.startsWith("/") ? subpath : `/${subpath}`) : "";
  return `/${storeSlug}${cleanSub}`;
}
```

And in `src/components/store/store-chrome.tsx`:
Replace `/store/${slug}` links with `/${slug}` or `storeHref(slug)`. When loaded under `tskstore.net`, navigation between home, networks, track, and order receipt stays under `tskstore.net/loveagostore/...`.

---

## Step 7: User Dashboard URL Displays & Share Buttons

On `tsk05.net`, when store owners view their Storefront dashboard, their store link and share buttons will present their dedicated URL (`https://tskstore.net/loveagostore`).

### In `src/app/dashboard/storefront/page.tsx`:
```tsx
const storefrontDomain = process.env.NEXT_PUBLIC_STOREFRONT_DOMAIN || "tskstore.net";
const storeUrl = `https://${storefrontDomain}/${storefront.slug}`;

// In the JSX:
<p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
  Public address:{" "}
  <a
    href={storeUrl}
    target="_blank"
    rel="noopener noreferrer"
    className="inline-flex items-center gap-1 font-semibold text-violet-600 hover:underline dark:text-violet-400"
  >
    {storefrontDomain}/{storefront.slug}
    <ExternalLink className="h-3 w-3" />
  </a>
</p>
<div className="mt-3">
  <CopyShareButtons url={storeUrl} storeName={storefront.name} />
</div>
```

---

## Step 8: Checkout, Webhook, and Commission Settlement

### How Checkout Operates Across Domains:
1. **Customer Places Order**:
   - Customer is on `https://tskstore.net/loveagostore/mtn`.
   - Buyer fills recipient phone number and clicks "Pay with Mobile Money".
   - Browser calls `POST /api/store/loveagostore/checkout`.
   - Because of Nginx proxying, this POST request hits the Next.js API on the same VPS.
2. **Paystack Initialization**:
   - `getRequestOrigin(request)` resolves to `https://tskstore.net`.
   - Paystack transaction is initialized with:
     `callbackUrl: https://tskstore.net/api/store/paystack/callback`
   - Customer is redirected to Paystack.
3. **Paystack Payment Verification**:
   - Customer pays via MoMo.
   - Paystack redirects buyer back to:
     `https://tskstore.net/api/store/paystack/callback?reference=TSK-...`
   - The route settles the order atomically:
     - `StorefrontOrder.status` -> `COMPLETED`
     - Underlying data bundle order dispatched via provider API.
     - `StorefrontWallet.balance` is incremented by the seller's commission.
   - Buyer is redirected to their clean receipt page:
     `https://tskstore.net/loveagostore/order/TSK-...`
4. **Owner Checks Commission on `tsk05.net`**:
   - The store owner logs in at `https://tsk05.net/dashboard/storefront/wallet`.
   - The commission is immediately visible in their balance.
   - The owner can withdraw to their main wallet or request a direct MoMo payout.

---

## Step 9: Testing & Verification Checklist

### 1. Verification with `curl`
Test domain routing on the VPS before going public:
```bash
# Test storefront routing
curl -I -H "Host: tskstore.net" http://127.0.0.1:3000/loveagostore
# Expected: HTTP 200 (serves store page)

# Test security redirect
curl -I -H "Host: tskstore.net" http://127.0.0.1:3000/admin
# Expected: HTTP 307/308 Redirect to https://tsk05.net/login

# Test main platform
curl -I -H "Host: tsk05.net" http://127.0.0.1:3000/dashboard
# Expected: Normal app response
```

### 2. Live Browser Testing
1. Visit `https://tskstore.net/loveagostore` in an incognito window:
   - Store banner, products, and prices load correctly.
2. Select MTN / Telecel and place a test bundle order.
3. Complete test payment on Paystack.
4. Verify redirection to `https://tskstore.net/loveagostore/order/TSK-...`.
5. Open `https://tsk05.net/dashboard/storefront/wallet` in another window:
   - Commission is reflected immediately in available balance.
   - Order is listed in Storefront Orders table.
