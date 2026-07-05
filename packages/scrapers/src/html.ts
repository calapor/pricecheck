/** Strip elements from HTML that consume tokens without aiding extraction. */
export function stripScriptsAndStyles(html: string): string {
  return html
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, "")
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, "")
    .replace(/<!--[\s\S]*?-->/g, "");
}

export interface BotWallResult {
  /** True when the fetched body is an anti-bot denial/challenge, not the real shop page. */
  blocked: boolean;
  /** Best-guess protection vendor, used only to phrase the message (e.g. "Akamai"). */
  vendor?: string;
}

// Signatures for anti-bot "Access Denied" / challenge pages. Matched against the head of the
// body only; a genuine shop page is large and never contains these markers.
const BOT_WALL_SIGNATURES: Array<{ vendor: string; re: RegExp }> = [
  // Akamai edge denial — e.g. tesco.ie: "<title>Access Denied</title> … errors.edgesuite.net".
  { vendor: "Akamai", re: /edgesuite\.net|access denied[\s\S]{0,300}don'?t have permission/i },
  // Cloudflare challenge / block interstitial.
  { vendor: "Cloudflare", re: /attention required!|__cf_chl|cf-chl-|just a moment\.\.\./i },
  // PerimeterX / HUMAN and DataDome interstitials.
  { vendor: "PerimeterX", re: /px-captcha|_pxhd|perimeterx/i },
  { vendor: "DataDome", re: /datadome|geo\.captcha-delivery\.com/i },
];

/**
 * Detect a bot-management denial/challenge page. Cloudflare/Akamai routinely return their
 * "Access Denied" body with HTTP 200, so an escalating fetcher that only escalates on 401/403
 * hands it straight to the generator, which wastes a model call producing a scraper for a
 * ~300-byte error page. Catching it by CONTENT lets the app park the shop with an honest
 * reason instead of failing obscurely downstream.
 */
export function detectBotWall(html: string): BotWallResult {
  const head = html.slice(0, 4000);
  for (const sig of BOT_WALL_SIGNATURES) {
    if (sig.re.test(head)) return { blocked: true, vendor: sig.vendor };
  }
  // Generic catch-all: a tiny body that is only a denial, carrying none of the markup
  // (state blobs, ld+json, data-* hooks) every real shop page has.
  if (
    html.length < 1500 &&
    /access denied|forbidden|blocked|not authori[sz]ed/i.test(head) &&
    !/__PRELOADED_STATE__|__NEXT_DATA__|application\/ld\+json|data-(auto|testid)=/i.test(head)
  ) {
    return { blocked: true, vendor: "bot management" };
  }
  return { blocked: false };
}

/**
 * User-facing explanation for a bot-walled shop. Names the three things a bypass would need —
 * (a) residential proxy, (b) headed browser, (c) persistent session — and that none are free,
 * so the shop is parked as unsupported rather than silently failing.
 */
export function botWallMessage(host: string, vendor = "bot management"): string {
  return (
    `${host} is protected by ${vendor} and serves an "Access Denied" page to automated ` +
    `requests, so its products can't be read. There is no free way around this — it would ` +
    `need (a) a residential proxy (a real home/mobile IP; datacenter IPs are blocklisted), ` +
    `(b) a headed real browser (headless Chrome is fingerprinted and blocked), and ` +
    `(c) a persistent browser session (to hold the anti-bot cookie across requests). ` +
    `This shop has been parked as unsupported.`
  );
}
