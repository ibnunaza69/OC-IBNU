export function renderAdminPage() {
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>ibnu_whatsapp admin</title>
  <style>
    body { font-family: Inter, system-ui, sans-serif; margin: 0; background: #0b1020; color: #eef2ff; }
    .wrap { max-width: 1000px; margin: 0 auto; padding: 24px; }
    .grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(240px, 1fr)); gap: 16px; }
    .card { background: #121933; border: 1px solid #26304f; border-radius: 16px; padding: 16px; }
    .muted { color: #a5b4fc; }
    .ok { color: #86efac; }
    .bad { color: #fca5a5; }
    code { background: #0f172a; padding: 2px 6px; border-radius: 8px; }
    button { background: #4f46e5; color: white; border: 0; border-radius: 10px; padding: 10px 14px; cursor: pointer; }
    table { width: 100%; border-collapse: collapse; margin-top: 12px; }
    td, th { padding: 10px; border-bottom: 1px solid #26304f; text-align: left; }
    input { width: 100%; box-sizing: border-box; padding: 10px; border-radius: 10px; border: 1px solid #334155; background: #0f172a; color: white; }
    a { color: #c7d2fe; }
    pre { white-space: pre-wrap; word-break: break-word; }
  </style>
</head>
<body>
  <div class="wrap">
    <h1>ibnu_whatsapp admin</h1>
    <p class="muted">Simple admin skeleton for gateway status, accounts, and quick actions.</p>

    <div class="grid">
      <div class="card">
        <h3>Service</h3>
        <div id="service">Loading...</div>
      </div>
      <div class="card">
        <h3>Quick links</h3>
        <p><a href="/admin/overview">/admin/overview</a></p>
        <p><a href="/admin/contracts">/admin/contracts</a></p>
        <p><a href="/accounts">/accounts</a></p>
        <p class="muted">Account ops via API: stop / restart / delete</p>
      </div>
    </div>

    <div class="card" style="margin-top:16px;">
      <h3>Start account</h3>
      <div class="grid">
        <div>
          <label>Account ID</label>
          <input id="accountId" placeholder="acc-2" />
        </div>
        <div>
          <label>Pairing number (optional)</label>
          <input id="pairingNumber" placeholder="6281234567890" />
        </div>
      </div>
      <p style="margin-top:12px;"><button onclick="startAccount()">Start account</button></p>
      <pre id="startResult"></pre>
    </div>

    <div class="card" style="margin-top:16px;">
      <h3>Accounts</h3>
      <table>
        <thead>
          <tr>
            <th>Account</th>
            <th>Connected</th>
            <th>Registered</th>
            <th>Phone</th>
            <th>Platform</th>
            <th>Last connection</th>
          </tr>
        </thead>
        <tbody id="accountsTable">
          <tr><td colspan="6">Loading...</td></tr>
        </tbody>
      </table>
    </div>
  </div>

  <script>
    async function loadOverview() {
      const res = await fetch('/admin/overview');
      const data = await res.json();
      document.getElementById('service').innerHTML =
        '<div><strong>' + data.service.name + '</strong></div>' +
        '<div class="muted">version ' + data.service.version + '</div>' +
        '<div class="muted">uptime ' + Math.round(data.service.uptimeSec) + 's</div>';

      const rows = (data.accounts || []).map(function(acc) {
        return '<tr>' +
          '<td><code>' + acc.accountId + '</code></td>' +
          '<td class="' + (acc.connected ? 'ok' : 'bad') + '">' + acc.connected + '</td>' +
          '<td class="' + (acc.registered ? 'ok' : 'bad') + '">' + acc.registered + '</td>' +
          '<td>' + (acc.phoneNumber || '-') + '</td>' +
          '<td>' + (acc.platform || '-') + '</td>' +
          '<td>' + (acc.lastConnection || '-') + '</td>' +
        '</tr>';
      }).join('');

      document.getElementById('accountsTable').innerHTML = rows || '<tr><td colspan="6">No accounts yet</td></tr>';
    }

    async function startAccount() {
      const accountId = document.getElementById('accountId').value;
      const pairingNumber = document.getElementById('pairingNumber').value;
      const res = await fetch('/accounts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ accountId, pairingNumber })
      });
      const data = await res.json();
      document.getElementById('startResult').textContent = JSON.stringify(data, null, 2);
      await loadOverview();
    }

    loadOverview();
    setInterval(loadOverview, 5000);
  </script>
</body>
</html>`
}
