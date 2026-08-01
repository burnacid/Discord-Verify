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

export function reviewSubmittedPage(): string {
  return renderPage(
    "Submitted for review",
    `<div class="icon pending">!</div>
     <h1>Thanks — you're in the queue</h1>
     <p>Your information has been submitted for manual review. A moderator will follow up soon.</p>`,
  );
}
