# Setting up the Google Maps Platform API key

For the Fuel Gauge rework (`PRD_Mobull_Fuel_Gauge_Accuracy_Rework.md`).
Roughly 15 minutes. You will need a credit card — billing must be enabled even
to use the free tier.

---

## What you're enabling and why

| API | What Fuel Gauge uses it for |
|---|---|
| **Places API (New)** | Address autocomplete as the owner types, and turning the chosen suggestion into a lat/long |
| **Routes API** | Traffic-aware drive distance and drive time between two addresses |

Do **not** enable the legacy "Places API" (without "New") — the PRD specifies
Autocomplete (New) and Place Details (New), which live under Places API (New).
Geocoding API is not required; place IDs come back from Place Details directly.

---

## Step 1 — Create the Cloud project

1. Go to <https://console.cloud.google.com/projectcreate>
2. Project name: `mobull-maps` (or anything — it's internal)
3. Click **Create**, then make sure that project is selected in the top bar

## Step 2 — Enable billing

Billing must be on even though you expect to pay nothing.

1. Go to <https://console.cloud.google.com/billing>
2. **Link a billing account** to the project, creating one if needed
3. New accounts get a **$300 welcome credit** on top of the recurring monthly
   free tier — that's a one-time bonus, not the thing you'll be running on

The recurring free allowance is what actually matters: 5,000 free calls/month on
each Pro SKU (Place Details Pro, Routes Pro), which covers roughly 2,500
bookings/month.

## Step 3 — Enable the two APIs

1. Go to <https://console.cloud.google.com/apis/library>
2. Search **"Places API (New)"** → open it → **Enable**
3. Search **"Routes API"** → open it → **Enable**

## Step 4 — Create the key

1. Go to <https://console.cloud.google.com/apis/credentials>
2. **Create credentials → API key**
3. Copy the key immediately
4. Click **Edit API key** and rename it `mobull-server-prod`

## Step 5 — Restrict the key

**First: the "Protect your API key" popup that appears right after creation.**

Google shows a dialog with a *"Select restriction type"* dropdown. **Click
"Maybe later."** That dropdown only offers *application* restrictions —
Websites, IP addresses, Android apps, iOS apps — and none of them fit a
Vercel-hosted server key (see the table below for why). The restriction you
actually need is *API restrictions*, which isn't in that dialog.

Nothing is lost by dismissing it: as the dialog itself says, new keys are
already limited to Google Maps Platform services, and restrictions can be added
at any time from the key's own page.

Then open the key from <https://console.cloud.google.com/apis/credentials> and
set the restrictions below.

This is the step people skip, and it's the one that prevents a surprise bill.

**API restrictions — do this, it's the important one.**

Under *API restrictions*, choose **Restrict key** and select exactly two:

- Places API (New)
- Routes API

Now, even if the key leaks, it can't be used against any other Google service.

**Application restrictions — read this before choosing.**

Google recommends IP restrictions for server-side keys. **This will not work
cleanly on your setup**, because api-server deploys to Vercel and Vercel
serverless functions do not have stable outbound IPs. Static egress IPs are a
paid Vercel feature.

Your options, in order of practicality:

| Option | Verdict |
|---|---|
| Leave application restrictions as **None**, rely on API restrictions + quota caps | **Recommended for now.** The key lives only in api-server and is never sent to the browser (PRD §9.1), so exposure is low. |
| Enable Vercel static egress IPs, then set an IP restriction | Best security. Do this if/when you're already paying for that Vercel tier. |
| Restrict by IP for local dev only | Worth doing on a *separate* dev key — see Step 7. |

Do **not** use "Websites" (HTTP referrer) restriction. That's for keys called
from browser JavaScript. Yours is called from the server, and referrer
restriction will simply reject every request.

## Step 6 — Cap the spend

Restrictions stop misuse. Google's quota caps are NOT adjustable on Maps APIs,
so the hard stop has to be your own rate limiter. Set the alerts below as your
early warning.

**Per-API quota caps — NOT AVAILABLE.** Google Maps Platform quotas show
`Adjustable: No` and "Edit quota" is greyed out. They cannot be lowered by
anyone; the "Increase Requests" tab handles increases only. Don't spend time here.

What you *can* set on that page: select the **⋮** menu on `GetPlaceRequest per
day` -> **Create usage alert** -> 80%. Same for the Routes API compute-routes
per-day quota. These notify; they do not stop traffic.

**The actual spend cap must live in api-server** (PRD §9.1) — per-organization
rate limiting on the /api/places/* and /api/routes/* proxy routes. This is the
only hard stop available, so it is Phase 1 work, not later hardening.

**Billing budget alert:**

1. Go to <https://console.cloud.google.com/billing> → **Budgets & alerts**
2. Create a budget of e.g. **$10/month** with alerts at 50% / 90% / 100%

Be aware: a budget alert **emails you, it does not stop spending.** Since Google
won't let you cap the quota, the api-server rate limiter is your only hard stop.

## Step 7 — Make a second key for local development

Don't share one key between your laptop and production — you can't tell whose
traffic is whose, and you can't revoke one without breaking the other.

Repeat Steps 4–5 to create `mobull-server-dev`, with the same two API
restrictions. For this one you *can* add an IP restriction set to your home or
office public IP (`curl ifconfig.me` gives it).

## Step 8 — Wire it into the repo

`.env*` is already covered by `.gitignore` (line 52), so local keys stay out of git.

Add to `.env`:

```
GOOGLE_MAPS_API_KEY=your_dev_key_here
```

api-server reads env vars with bracket notation, so in code:

```ts
const mapsKey = process.env["GOOGLE_MAPS_API_KEY"];
if (!mapsKey) throw new Error("GOOGLE_MAPS_API_KEY is not set");
```

For production, add it in Vercel rather than in a file:

```
vercel env add GOOGLE_MAPS_API_KEY production
```

Paste the **prod** key when prompted. Repeat with `preview` and `development`
targets if you want preview deploys to work, using the dev key for those.

**The key must never reach the browser.** Don't name it with a `VITE_` prefix —
Vite inlines any `VITE_*` variable into the client bundle, which would publish
your key to every visitor. All Google calls go through the api-server proxy
routes defined in PRD §9.1.

## Step 9 — Verify it works

```bash
curl -X POST 'https://places.googleapis.com/v1/places:autocomplete' \
  -H 'Content-Type: application/json' \
  -H "X-Goog-Api-Key: $GOOGLE_MAPS_API_KEY" \
  -d '{"input":"1102 Flatbush","regionCode":"US"}'
```

Expect a JSON body with a `suggestions` array.

If you get `REQUEST_DENIED` or a 403, it's almost always one of:

| Message | Cause |
|---|---|
| "API key not valid" | Key mistyped, or you're using the legacy Places API endpoint |
| "This API project is not authorized to use this API" | Places API (New) not enabled — redo Step 3 |
| "Requests to this API are blocked" | API restrictions don't include Places API (New) — redo Step 5 |
| "The provided API key is expired" / referer errors | You set a Websites restriction on a server key — remove it |

Then check Routes:

```bash
curl -X POST 'https://routes.googleapis.com/directions/v2:computeRoutes' \
  -H 'Content-Type: application/json' \
  -H "X-Goog-Api-Key: $GOOGLE_MAPS_API_KEY" \
  -H 'X-Goog-FieldMask: routes.duration,routes.distanceMeters' \
  -d '{
    "origin":{"address":"1102 Flatbush Ave, Brooklyn, NY"},
    "destination":{"address":"350 5th Ave, New York, NY"},
    "travelMode":"DRIVE",
    "routingPreference":"TRAFFIC_AWARE"
  }'
```

Expect `distanceMeters` and a `duration` like `"1846s"`. That is the first real
distance this feature has ever produced.

---

## Notes for implementation

- **Always send `X-Goog-FieldMask` on Routes calls.** It's required, and it also
  controls cost — asking only for `routes.duration,routes.distanceMeters` keeps
  you on the cheaper SKU tier.
- **Session tokens matter for billing.** Per PRD FR-11, generate one token per
  address-entry session and pass it to every Autocomplete call plus the closing
  Place Details call. Done right, all the typing is free; done wrong, every
  keystroke bills at $2.83/1,000.
- **Watch the SKU dashboard for the first month.** APIs & Services → Metrics,
  grouped by SKU, tells you whether the caching design in PRD §9.2 is actually
  keeping you under the 5,000/month Pro caps.
