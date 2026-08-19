import { renderPage } from "./layout.js";

export function errorPage(title: string, message: string): string {
  return renderPage(
    title,
    `<div class="icon error">&times;</div>
     <h1>${title}</h1>
     <p>${message}</p>`,
  );
}

export function linkPreviewPage(): string {
  return renderPage(
    "Discord Verification",
    `<div class="icon pending">&#128274;</div>
     <h1>Discord Verification</h1>
     <p>Open this link in Discord or your browser to verify your account.</p>`,
    `<meta property="og:title" content="Discord Verification" />
     <meta property="og:description" content="Open this link to verify your account." />
     <meta name="robots" content="noindex, nofollow" />`,
  );
}

// Shown when the server can't see the visitor's real IP (private/loopback —
// local dev, or a reverse proxy that isn't forwarding it) and
// GEO_ALLOW_CLIENT_IP_FALLBACK is on. The script below asks the visitor's
// own browser for its public IP and hands it back so the normal GeoIP/VPN
// check can run against it. See POST /verify/:token/local-ip.
export function detectingIpPage(token: string): string {
  return renderPage(
    "Discord Verification",
    `<div class="icon pending">&#8635;</div>
     <h1>One moment...</h1>
     <p>Detecting your connection. This page will continue automatically.</p>`,
    `<script>
      (function () {
        var token = ${JSON.stringify(token)};
        function proceed(ip) {
          fetch("/verify/" + encodeURIComponent(token) + "/local-ip", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ ip: ip }),
          }).finally(function () {
            location.reload();
          });
        }
        var timeout = setTimeout(function () { proceed(null); }, 5000);
        fetch("https://api.ipify.org?format=json")
          .then(function (res) { return res.json(); })
          .then(function (data) {
            clearTimeout(timeout);
            proceed(data && data.ip ? data.ip : null);
          })
          .catch(function () {
            clearTimeout(timeout);
            proceed(null);
          });
      })();
    </script>`,
  );
}

export function notFoundPage(): string {
  return renderPage(
    "Page not found",
    `<div class="icon pending">?</div>
     <h1>Page not found</h1>
     <p>There's nothing here. If you were trying to join or verify, use the link you were given.</p>
     <a class="button" href="/join">Go to join page</a>`,
  );
}

export function successPage(): string {
  return renderPage(
    "You're verified",
    `<div class="icon success">&#10003;</div>
     <h1>You're verified!</h1>
     <p>You can now post in the server. See you there.</p>`,
  );
}

export interface ReviewFormErrors {
  name?: string;
  email?: string;
  captcha?: string;
}

export function reviewFormPage(reasonMessage: string, turnstileSiteKey: string, errors: ReviewFormErrors = {}): string {
  return renderPage(
    "Manual verification needed",
    `<div class="icon pending">!</div>
     <h1>Manual verification needed</h1>
     <p>${reasonMessage} Please share a name and email so a moderator can review your request.</p>
     <form method="post">
       <label for="name">Name</label>
       <input type="text" id="name" name="name" required maxlength="100" />
       ${errors.name ? `<div class="field-error">${errors.name}</div>` : ""}
       <label for="email">Email</label>
       <input type="email" id="email" name="email" required maxlength="200" />
       ${errors.email ? `<div class="field-error">${errors.email}</div>` : ""}
       <div class="cf-turnstile" data-sitekey="${turnstileSiteKey}" style="margin-top:16px;"></div>
       ${errors.captcha ? `<div class="field-error">${errors.captcha}</div>` : ""}
       <button type="submit">Submit for review</button>
     </form>`,
    `<script src="https://challenges.cloudflare.com/turnstile/v0/api.js" async defer></script>`,
  );
}

// Plain obfuscated text, not a mailto: link — keeps the address out of the
// served HTML entirely so scrapers can't harvest it. Visitors copy/retype it.
function obfuscatedEmail(): string {
  return `webmaster [at] gameforce [dot] nl`;
}

export function privacyPage(): string {
  return renderPage(
    "Privacy Policy",
    `<h1>Privacy Policy</h1>
       <p><strong>Last updated:</strong> 2026-08-19</p>
       <p>This page explains what data GameForce ("we", "us") collects when you use this Discord
       verification service, why we collect it, and what rights you have. This service is provided
       to Discord servers operated or moderated by GameForce, and processing is subject to the EU
       General Data Protection Regulation (GDPR).</p>

       <h2>Who we are</h2>
       <p>Data controller: GameForce. Contact for privacy questions or requests:
       ${obfuscatedEmail()}.</p>

       <h2>What we collect</h2>
       <ul>
         <li><strong>Discord account ID and server membership</strong> — to know who you are and
         which server(s) you're a member of, and to assign or remove the Verified role.</li>
         <li><strong>IP address and information derived from it</strong> (country, and whether the
         connection looks like a VPN/proxy) — collected when you open a join or verification link, to
         decide whether you can be verified automatically or need manual review. We do not send your
         IP address to any third party for this check: country and VPN detection run against
         self-hosted, open-source data (GeoLite2 and X4BNet's VPN network lists).</li>
         <li><strong>Name and email address</strong> — only if you're routed to manual review (e.g.
         because a VPN was detected or your country isn't on the auto-verify list) and you choose to
         submit the review form. This is used solely so a moderator can review your request.</li>
         <li><strong>Join-link source</strong> (the <code>?ref=</code> value on a join link, e.g.
         "twitter") — recorded to see which channels drive people to join, alongside the server ID
         and timestamp. This is not tied to your Discord identity.</li>
       </ul>

       <h2>Third parties involved</h2>
       <ul>
         <li><strong>Cloudflare Turnstile</strong> — a CAPTCHA shown at certain steps to block
         automated abuse. Solving it sends your IP address and a challenge token to Cloudflare. See
         <a href="https://www.cloudflare.com/privacypolicy/" target="_blank" rel="noopener">Cloudflare's privacy policy</a>.</li>
         <li><strong>api.ipify.org</strong> — only used if the server can't see your real IP (e.g. a
         local network or proxy quirk); if so, your browser looks up your own public IP directly from
         this service and reports it back to us.</li>
         <li><strong>Discord</strong> — role assignment, direct messages about verification, and (for
         server staff) admin panel login all happen through Discord's own platform and are also
         subject to <a href="https://discord.com/privacy" target="_blank" rel="noopener">Discord's privacy policy</a>.</li>
       </ul>

       <h2>How long we keep it</h2>
       <p>We don't currently apply a fixed automatic deletion period — verification, GeoIP check
       results, and (where applicable) review-queue name/email are kept for as long as your
       membership record exists, so re-joins and support requests can be handled correctly. You can
       ask us to delete this data at any time (see "Your rights" below).</p>

       <h2>Your rights (GDPR)</h2>
       <p>You have the right to access, correct, or request erasure of your personal data, to
       restrict or object to certain processing, and to data portability. You also have the right to
       lodge a complaint with your national data protection authority — in the Netherlands, the
       <a href="https://www.autoriteitpersoonsgegevens.nl/" target="_blank" rel="noopener">Autoriteit
       Persoonsgegevens</a>. To exercise any of these rights, email
       ${obfuscatedEmail()}.</p>

       <h2>Security</h2>
       <p>Data is transmitted over encrypted connections (HTTPS) and access to it is restricted to
       server moderators/administrators who need it to run verification and review join requests.</p>

       <h2>Changes to this policy</h2>
       <p>If this policy changes materially, the "Last updated" date above will change accordingly.</p>`,
    "",
    "wide",
  );
}

export function reviewSubmittedPage(): string {
  return renderPage(
    "Submitted for review",
    `<div class="icon pending">!</div>
     <h1>Thanks — you're in the queue</h1>
     <p>Your information has been submitted for manual review. A moderator will follow up soon.</p>`,
  );
}
