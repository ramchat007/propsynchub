1. Landing Page vs. Resort Domain Homepage

Question: When I open http://localhost:3000/, I see the PropSyncHub landing page. When I move to the resort domain, how do I set the landing page to that specific resort's homepage?

How It Works:

Your application uses an edge-level multi-tenant routing engine in middleware.ts:

Platform Apex Domains (localhost:3000, propsynchub.com): middleware.ts detects that the host is localhost or propsynchub.com (isApex: true). It serves app/(public)/page.tsx, which is the B2B SaaS platform landing page.
Resort Domains (raigadtropical.com or raigad-tropical.propsynchub.com): When a request arrives from a custom domain or subdomain, middleware.ts extracts the tenant identifier and rewrites / to /[tenantId] (app/(public)/[tenantId]/page.tsx).
Next.js fetches the resort's branding, photos, amenities, and room inventory from Supabase where custom_domain = 'raigadtropical.com' or subdomain = 'raigad-tropical'.
Guests visiting https://raigadtropical.com will only see the Raigad Tropical luxury showcase. They will never see PropSyncHub.
How to Configure It:
In your Supabase tenants table, set custom_domain to raigadtropical.com.
In your domain registrar (GoDaddy, Cloudflare, etc.), add a DNS CNAME record pointing raigadtropical.com to your deployment host (e.g. Vercel).
To test on localhost right now: Visit http://localhost:3000/raigad-tropical or http://raigad-tropical.localhost:3000.

2. WhatsApp OTP: In .env.local (or production environment variables), add:
env
META_WHATSAPP_TOKEN=your_meta_system_user_token
META_WHATSAPP_PHONE_NUMBER_ID=your_whatsapp_phone_number_id
(Until these are set, the built-in sandbox simulator will handle verification smoothly for local development).