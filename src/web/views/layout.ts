export function renderPage(title: string, bodyHtml: string): string {
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${title}</title>
    <style>
      :root { color-scheme: dark; }
      * { box-sizing: border-box; }
      body {
        margin: 0;
        min-height: 100vh;
        display: flex;
        align-items: center;
        justify-content: center;
        background: #1e1f22;
        color: #f2f3f5;
        font-family: "gg sans", "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
        padding: 24px;
      }
      .card {
        max-width: 420px;
        width: 100%;
        background: #2b2d31;
        border-radius: 12px;
        padding: 32px;
        text-align: center;
        box-shadow: 0 8px 24px rgba(0, 0, 0, 0.35);
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
      .icon.success { background: rgba(35, 165, 89, 0.15); color: #23a559; }
      .icon.error { background: rgba(242, 63, 66, 0.15); color: #f23f42; }
      .icon.pending { background: rgba(88, 101, 242, 0.15); color: #5865f2; }
      h1 { font-size: 1.2rem; font-weight: 600; margin: 0 0 8px; }
      p { font-size: 0.95rem; color: #b5bac1; margin: 0 0 4px; line-height: 1.5; }
      form { text-align: left; margin-top: 20px; }
      label {
        display: block;
        font-size: 0.8rem;
        font-weight: 600;
        text-transform: uppercase;
        color: #b5bac1;
        margin: 16px 0 6px;
      }
      input[type="text"], input[type="email"] {
        width: 100%;
        padding: 10px 12px;
        border-radius: 6px;
        border: 1px solid #1e1f22;
        background: #1e1f22;
        color: #f2f3f5;
        font-size: 0.95rem;
      }
      input[type="text"]:focus, input[type="email"]:focus {
        outline: none;
        border-color: #5865f2;
      }
      button, a.button {
        display: inline-block;
        width: 100%;
        margin-top: 24px;
        padding: 12px 20px;
        border: none;
        border-radius: 6px;
        background: #5865f2;
        color: #fff;
        font-weight: 600;
        font-size: 0.95rem;
        cursor: pointer;
        text-align: center;
        text-decoration: none;
      }
      button:hover, a.button:hover { background: #4752c4; }
      .field-error {
        color: #f23f42;
        font-size: 0.85rem;
        margin-top: 4px;
      }
    </style>
  </head>
  <body>
    <div class="card">${bodyHtml}</div>
  </body>
</html>`;
}
