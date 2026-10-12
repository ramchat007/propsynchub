# PropSyncHub — Domain Mapping & DNS Setup Guide

This guide explains how domain routing works in PropSyncHub, what you need right now for testing on Netlify, and the exact steps to connect your real production domains later.

---

## 1. Current Setup: Testing with Netlify Dummy Domain

Right now, you are using the Netlify free testing domain:
`https://propsynchub.netlify.app`

### You Do NOT Need Any Custom DNS Setup Right Now!
All features work directly on this testing domain out-of-the-box using clean path-based routing:

| Portal | URL on Netlify | Description |
| :--- | :--- | :--- |
| **SaaS Platform Landing Page** | `https://propsynchub.netlify.app/` | Platform introduction & demo |
| **SuperAdmin Master Console** | `https://propsynchub.netlify.app/admin-master` | Manage all resorts, subscriptions, database |
| **Resort Operations Dashboard** | `https://propsynchub.netlify.app/dashboard` | Front desk, bookings, inventory, restaurant, housekeeping |
| **Resort Public Guest Website** | `https://propsynchub.netlify.app/r/raigad-tropical` | Public showcase for Raigad Tropical |
| **Direct Guest Booking Engine** | `https://propsynchub.netlify.app/r/raigad-tropical/book` | Live room search, booking, advance deposit |
| **Guest Self-Service Portal** | `https://propsynchub.netlify.app/r/raigad-tropical/portal/[bookingId]` | Digital check-in, room service, invoices |
| **Launch New Resort Wizard** | `https://propsynchub.netlify.app/onboarding` | 60-second wizard to create a new property |

> **Note on `/r/[slug]`**: Whenever you create a resort with slug `my-resort`, it is immediately accessible at `https://propsynchub.netlify.app/r/my-resort` without configuring any DNS.

---

## 2. Later: Connecting Your Real Main Platform Domain

When you purchase your primary platform domain (for example, `propsynchub.com` or `propsynchub.in`) and want your main site to go live:

### Step 1: Add Your Domain in Netlify
1. Log in to **[Netlify Dashboard](https://app.netlify.com/)**.
2. Go to your site **`propsynchub`** &rarr; **Site configuration** &rarr; **Domain management**.
3. Click **Add a domain** (or **Add domain alias**).
4. Enter your root domain (e.g. `propsynchub.com`) and click **Verify** &rarr; **Add domain**.

### Step 2: Configure DNS Records at Your Domain Registrar
Log in to wherever you bought the domain (GoDaddy, Namecheap, Cloudflare, BigRock, Hostinger, etc.) and open the **DNS Management / DNS Zone Editor**:

| Record Type | Host / Name | Target / Value / Points to | TTL | Purpose |
| :--- | :--- | :--- | :--- | :--- |
| **A** | `@` *(or blank)* | `75.2.60.5` | Auto / 3600 | Points apex domain to Netlify load balancer |
| **CNAME** | `www` | `propsynchub.netlify.app` | Auto / 3600 | Points `www.propsynchub.com` to Netlify |

### Step 3: SSL Certificate
- Netlify will automatically detect the DNS records and provision a free **Let's Encrypt SSL certificate** (HTTPS) within a few minutes.

### Step 4: Update Environment Variables in Netlify
In Netlify &rarr; **Site configuration** &rarr; **Environment variables**, update:
- `NEXT_PUBLIC_APP_URL` = `https://propsynchub.com`
- `NEXT_PUBLIC_ROOT_DOMAIN` = `propsynchub.com`

Then trigger a new deploy (or git push) so the changes take effect.

---

## 3. Resort Subdomains: How They Work (Optional)

If you want every resort to have its own subdomain on your main platform (e.g. `raigad-tropical.propsynchub.com`):

### How the Code Handles It:
The middleware in `middleware.ts` automatically inspects incoming web requests:
- If a guest visits `raigad-tropical.propsynchub.com`, the middleware extracts `raigad-tropical`.
- It fetches the resort details from Supabase and immediately displays that resort's homepage.

### What DNS Record is Needed:
In your domain registrar DNS settings (for `propsynchub.com`):

| Record Type | Host / Name | Target / Value | Purpose |
| :--- | :--- | :--- | :--- |
| **CNAME** | `*` *(wildcard)* | `propsynchub.netlify.app` | Directs all subdomains to your Netlify app |

*Note: Wildcard SSL on Netlify requires using Netlify DNS or a Netlify Pro plan. During testing and MVP, the `/r/[slug]` path route is 100% free, requires zero extra DNS setup, and works on all plans.*

---

## 4. White-Label Custom Domains for Individual Resorts (Optional)

If a resort owner has their own custom domain (e.g. `raigadtropical.in` or `www.raigadtropical.in`):

### Step 1: Assign in Platform Admin Console
1. Open the Platform Master Console at `/admin-master`.
2. Find the resort in the table and click **🌐 Domain**.
3. Type their custom domain: `raigadtropical.in`.
4. Set status to **Active** and save.

### Step 2: Resort Owner Configures DNS at Their Registrar
The resort owner adds these records in their domain registrar:

| Record Type | Host / Name | Target / Value | Purpose |
| :--- | :--- | :--- | :--- |
| **A** | `@` | `75.2.60.5` | Points root domain to Netlify |
| **CNAME** | `www` | `propsynchub.netlify.app` | Points `www` subdomain to Netlify |

### Step 3: Add Domain to Netlify
In your Netlify Dashboard &rarr; **Domain management**, add `raigadtropical.in` and `www.raigadtropical.in` as **Domain aliases**.

### Result:
- Guests visiting `https://raigadtropical.in` will see **only** Raigad Tropical's branding, rooms, and booking engine with zero mention of the parent SaaS name.
- Staff visiting `https://raigadtropical.in/app` will access the resort's management desk.

---

## 5. Summary: What You Need To Do Today

| Task | Action Required |
| :--- | :--- |
| **Current Testing on `propsynchub.netlify.app`** | **Nothing to configure!** Use `/r/[resort-slug]` directly. |
| **Moving to a Real Domain** | Refer back to **Section 2** when you purchase your domain. |
| **Resort Custom Domains** | Refer back to **Section 4** whenever a client requests a branded domain. |
