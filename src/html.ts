export function pageShell(title: string, body: string): string {
  return `
    <!DOCTYPE html>
    <html lang="da">
    <head>
      <meta charset="utf-8">
      <meta name="viewport" content="width=device-width, initial-scale=1">
      <title>${title}</title>
      <style>
        *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
        body {
          font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
          background: #f5f5f7;
          color: #1d1d1f;
          min-height: 100vh;
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 1.5rem;
        }
        .card {
          background: #fff;
          border-radius: 16px;
          box-shadow: 0 4px 24px rgba(0,0,0,.08);
          padding: 2.5rem;
          max-width: 420px;
          width: 100%;
          text-align: center;
        }
        .card h1 {
          font-size: 1.5rem;
          margin-bottom: .75rem;
        }
        .card p {
          color: #6e6e73;
          line-height: 1.5;
          margin-bottom: 1rem;
        }
        .card code {
          background: #f0f0f3;
          padding: .15em .45em;
          border-radius: 6px;
          font-size: .9em;
        }
        .badge {
          display: inline-block;
          background: #e8f5e9;
          color: #2e7d32;
          padding: .35em .9em;
          border-radius: 20px;
          font-weight: 600;
          font-size: .85rem;
          margin-bottom: 1rem;
        }
        .btn {
          display: inline-block;
          background: #0071e3;
          color: #fff;
          text-decoration: none;
          padding: .75rem 2rem;
          border-radius: 10px;
          font-size: 1rem;
          font-weight: 500;
          transition: background .15s;
        }
        .btn:hover { background: #0061c4; }
      </style>
    </head>
    <body>
      <div class="card">
        ${body}
      </div>
    </body>
    </html>`;
}

export function destinationPage(
  destinationUrl: string,
  userId?: string,
): string {
  const loggedInBadge = userId
    ? '<span class="badge">Logget ind</span>'
    : '<span class="badge" style="background:#fff3e0;color:#ef6c00">Ikke logget ind</span>';
  const userText = userId
    ? `<p>Du er nu logget ind som <strong>${userId}</strong></p>`
    : "<p>Ingen aktiv seashell-session fundet for denne origin.</p>";
  const clearButton = userId
    ? `<button class="btn" style="background:#d32f2f;margin-top:.5rem" onclick="
        fetch(location.protocol + '//' + location.hostname + ':3001/api/game/auth/clear-session', {credentials:'include'})
          .then(function(){ location.href = location.protocol + '//' + location.hostname + ':3001/api/game/auth/enter?destinationUrl=%2F&appLoggedIn=true'; });
      ">Clear session</button>`
    : "";

  const reauthButton = userId
    ? `<button class="btn" style="background:#ef6c00;margin-top:.5rem" onclick="
        window.location.href = '/auth/login?destinationUrl=' + encodeURIComponent(window.location.pathname);
      ">Trigger re-auth</button>`
    : "";

  return pageShell(
    "VMSpillet",
    `
    ${loggedInBadge}
    <h1>VMSpillet</h1>
    ${userText}
    <p>Side: <code>${destinationUrl}</code></p>
    ${clearButton}
    ${reauthButton}
  `,
  );
}

export function loginPage(destinationUrl: string): string {
  const loginHref = `/nap/vm2026/login?destinationUrl=${encodeURIComponent(destinationUrl)}`;

  return pageShell(
    "Log ind - VMSpillet",
    `
    <h1>Du er ikke logget ind</h1>
    <p>Log ind for at fortsætte til <code>${destinationUrl}</code></p>
    <a class="btn" href="${loginHref}">Log ind</a>
  `,
  );
}
