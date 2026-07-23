export interface AdminUser {
  discordId: string;
  username: string;
}

export function renderAdminPage(title: string, user: AdminUser, bodyHtml: string, flash?: string): string {
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <meta name="robots" content="noindex, nofollow" />
    <title>${title} — Admin</title>
    <style>
      :root { color-scheme: dark; }
      * { box-sizing: border-box; }
      body {
        margin: 0;
        background: #1e1f22;
        color: #f2f3f5;
        font-family: "gg sans", "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
      }
      header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: 14px 24px;
        background: #2b2d31;
        border-bottom: 1px solid #1e1f22;
      }
      header .brand { font-weight: 700; font-size: 1rem; }
      nav { display: flex; gap: 18px; align-items: center; }
      nav a {
        color: #b5bac1;
        text-decoration: none;
        font-size: 0.9rem;
        font-weight: 500;
      }
      nav a:hover, nav a.active { color: #fff; }
      .user { font-size: 0.85rem; color: #b5bac1; }
      main {
        max-width: 1000px;
        margin: 0 auto;
        padding: 28px 24px 60px;
      }
      h1 { font-size: 1.3rem; margin: 0 0 20px; }
      h2 { font-size: 1.05rem; margin: 32px 0 12px; }
      .flash {
        background: rgba(35, 165, 89, 0.15);
        border: 1px solid rgba(35, 165, 89, 0.4);
        color: #23a559;
        padding: 10px 14px;
        border-radius: 6px;
        font-size: 0.9rem;
        margin-bottom: 20px;
      }
      .stats {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(140px, 1fr));
        gap: 12px;
        margin-bottom: 8px;
      }
      .stat {
        background: #2b2d31;
        border-radius: 8px;
        padding: 16px;
      }
      .stat .value { font-size: 1.6rem; font-weight: 700; }
      .stat .label { font-size: 0.8rem; color: #b5bac1; margin-top: 4px; }
      table {
        width: 100%;
        border-collapse: collapse;
        background: #2b2d31;
        border-radius: 8px;
        overflow: hidden;
        font-size: 0.88rem;
      }
      th, td {
        text-align: left;
        padding: 10px 12px;
        border-bottom: 1px solid #1e1f22;
      }
      th { color: #b5bac1; font-weight: 600; font-size: 0.78rem; text-transform: uppercase; }
      tr:last-child td { border-bottom: none; }
      .empty { color: #b5bac1; font-size: 0.9rem; padding: 16px; text-align: center; }
      .actions { display: flex; gap: 8px; }
      button, .btn {
        border: none;
        border-radius: 6px;
        padding: 6px 12px;
        font-size: 0.82rem;
        font-weight: 600;
        cursor: pointer;
        text-decoration: none;
        display: inline-block;
      }
      .btn-approve { background: #23a559; color: #fff; }
      .btn-deny { background: #f23f42; color: #fff; }
      .btn-primary { background: #5865f2; color: #fff; }
      .btn-secondary { background: #3a3c42; color: #f2f3f5; }
      button:hover, .btn:hover { filter: brightness(1.1); }
      form.inline { display: inline; }
      .card {
        background: #2b2d31;
        border-radius: 8px;
        padding: 20px;
      }
      label {
        display: block;
        font-size: 0.8rem;
        font-weight: 600;
        text-transform: uppercase;
        color: #b5bac1;
        margin: 14px 0 6px;
      }
      label:first-child { margin-top: 0; }
      input[type="text"], input[type="number"], input[type="search"] {
        width: 100%;
        max-width: 400px;
        padding: 8px 12px;
        border-radius: 6px;
        border: 1px solid #1e1f22;
        background: #1e1f22;
        color: #f2f3f5;
        font-size: 0.9rem;
      }
      input:focus { outline: none; border-color: #5865f2; }
      .checkbox-row { display: flex; align-items: center; gap: 8px; margin-top: 14px; }
      .checkbox-row label { margin: 0; text-transform: none; font-size: 0.9rem; font-weight: 400; color: #f2f3f5; }
      .hint { font-size: 0.78rem; color: #80848e; margin-top: 4px; }
      code { background: #1e1f22; padding: 2px 6px; border-radius: 4px; font-size: 0.85em; }
      .badge {
        display: inline-block;
        padding: 2px 8px;
        border-radius: 10px;
        font-size: 0.75rem;
        font-weight: 600;
      }
      .badge-verified { background: rgba(35, 165, 89, 0.15); color: #23a559; }
      .badge-pending_review { background: rgba(245, 166, 35, 0.15); color: #f5a623; }
      .badge-rejected { background: rgba(242, 63, 66, 0.15); color: #f23f42; }
      .badge-unverified { background: rgba(128, 132, 142, 0.15); color: #80848e; }
    </style>
  </head>
  <body>
    <header>
      <div class="brand">Discord Verify — Admin</div>
      <nav>
        <a href="/admin">Dashboard</a>
        <a href="/admin/members">Members</a>
        <a href="/health" target="_blank" rel="noopener">Health</a>
        <span class="user">${user.username}</span>
        <a href="/admin/logout">Log out</a>
      </nav>
    </header>
    <main>
      ${flash ? `<div class="flash">${flash}</div>` : ""}
      ${bodyHtml}
    </main>
  </body>
</html>`;
}
