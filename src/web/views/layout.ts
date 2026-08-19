export function renderPage(title: string, bodyHtml: string, extraHead = "", cardClass = ""): string {
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${title}</title>
    <link rel="stylesheet" href="/assets/theme.css" />
    ${extraHead}
    <style>
      body {
        min-height: 100vh;
        display: flex;
        align-items: center;
        justify-content: center;
        padding: 24px;
      }
      .card {
        max-width: 420px;
        width: 100%;
        border-radius: 12px;
        padding: 32px;
        text-align: center;
        box-shadow: 0 8px 24px rgba(0, 0, 0, 0.35);
      }
      .card.wide {
        max-width: 720px;
        text-align: left;
      }
      .card.wide h1 {
        text-align: center;
      }
      .card.wide h2 {
        font-size: 1rem;
        margin: 28px 0 8px;
      }
      .card.wide p, .card.wide li {
        text-align: left;
      }
      .card.wide ul {
        margin: 0 0 4px;
        padding-left: 20px;
      }
      .card.wide li {
        margin-bottom: 10px;
      }
      @media (max-width: 480px) {
        .card {
          padding: 20px;
        }
      }
      .icon {
        width: 56px;
        height: 56px;
        margin: 0 auto 20px;
        border-radius: 50%;
        display: flex;
        align-items: center;
        justify-content: center;
        font-size: 28px;
      }
      .icon.success { background: rgba(35, 165, 89, 0.15); color: var(--success); }
      .icon.error { background: rgba(242, 63, 66, 0.15); color: var(--danger); }
      .icon.pending { background: rgba(88, 101, 242, 0.15); color: var(--accent); }
      h1 { font-size: 1.2rem; font-weight: 600; margin: 0 0 8px; }
      p { font-size: 0.95rem; color: var(--text-muted); margin: 0 0 4px; line-height: 1.5; }
      form { text-align: left; margin-top: 20px; }
      label {
        display: block;
        font-size: 0.8rem;
        font-weight: 600;
        text-transform: uppercase;
        color: var(--text-muted);
        margin: 16px 0 6px;
      }
      input[type="text"], input[type="email"] {
        width: 100%;
        max-width: none;
        padding: 10px 12px;
        border-radius: 6px;
        border: 1px solid var(--border);
        background: var(--bg);
        color: var(--text);
        font-size: 0.95rem;
      }
      input[type="text"]:focus, input[type="email"]:focus {
        outline: none;
        border-color: var(--accent);
      }
      button, a.button {
        display: inline-block;
        width: 100%;
        margin-top: 24px;
        padding: 12px 20px;
        border: none;
        border-radius: 6px;
        background: var(--accent);
        color: #fff;
        font-weight: 600;
        font-size: 0.95rem;
        cursor: pointer;
        text-align: center;
        text-decoration: none;
      }
      button:hover, a.button:hover { background: var(--accent-hover); }
      .field-error {
        color: var(--danger);
        font-size: 0.85rem;
        margin-top: 4px;
      }
      footer {
        margin-top: 20px;
        text-align: center;
        font-size: 0.8rem;
      }
      footer a {
        color: var(--text-muted);
        text-decoration: none;
      }
      footer a:hover {
        text-decoration: underline;
      }
    </style>
  </head>
  <body>
    <div>
      <div class="card${cardClass ? ` ${cardClass}` : ""}">${bodyHtml}</div>
      <footer><a href="/privacy">Privacy Policy</a></footer>
    </div>
  </body>
</html>`;
}
