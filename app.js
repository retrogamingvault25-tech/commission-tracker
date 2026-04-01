import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js';
import { getFirestore, collection, doc, setDoc, deleteDoc, onSnapshot, writeBatch } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js';

// ── Firebase Config ───────────────────────────────────────────
const firebaseConfig = {
  apiKey: "AIzaSyDwAU-nz8RZMU2RRduq422-FAqasQxvT14",
  authDomain: "bowling-tracker-eadd5.firebaseapp.com",
  projectId: "bowling-tracker-eadd5",
  storageBucket: "bowling-tracker-eadd5.firebasestorage.app",
  messagingSenderId: "864443842846",
  appId: "1:864443842846:web:0ec954da0a4db447d6c90f"
};

const PASSWORD = 'oceanatm25';

// ── State ─────────────────────────────────────────────────────
const state = {
  loggedIn: sessionStorage.getItem('commission_auth') === 'true',
  view: 'dashboard',
  sales: [],
  loaded: false,
  modal: null,
  editSale: null,
  search: '',
  filterStatus: 'all',
  filterYear: 'all',
  filterFrom: '',
  filterTo: '',
  sortField: 'date',
  sortDir: 'desc',
};

let db;

function initFirebase() {
  const fbApp = initializeApp(firebaseConfig);
  db = getFirestore(fbApp);
  onSnapshot(collection(db, 'oatm_sales'), snap => {
    state.sales = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    state.loaded = true;
    render();
  });
}

// ── Storage ───────────────────────────────────────────────────
async function addSale(data) {
  const id = 'sale_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7);
  const computed = computeSale(data);
  await setDoc(doc(db, 'oatm_sales', id), { id, ...computed, createdAt: new Date().toISOString() });
}

async function updateSale(id, data) {
  const computed = computeSale(data);
  const existing = state.sales.find(s => s.id === id) || {};
  await setDoc(doc(db, 'oatm_sales', id), { ...existing, ...computed });
}

async function deleteSale(id) {
  await deleteDoc(doc(db, 'oatm_sales', id));
}

async function importSales(salesArray) {
  const BATCH_SIZE = 400;
  for (let i = 0; i < salesArray.length; i += BATCH_SIZE) {
    const batch = writeBatch(db);
    salesArray.slice(i, i + BATCH_SIZE).forEach(sale => {
      batch.set(doc(db, 'oatm_sales', sale.id), sale);
    });
    await batch.commit();
  }
}

// ── Compute ───────────────────────────────────────────────────
function computeSale(data) {
  const saleAmount    = parseFloat(data.saleAmount)    || 0;
  const ourCost       = parseFloat(data.ourCost)       || 0;
  const paypalFees    = parseFloat(data.paypalFees)    || 0;
  const shippingFees  = parseFloat(data.shippingFees)  || 0;
  const ebayFees      = parseFloat(data.ebayFees)      || 0;
  const commissionRate = parseFloat(data.commissionRate) || 25;
  const netProfit  = saleAmount - ourCost - paypalFees - shippingFees - ebayFees;
  const commission = netProfit * (commissionRate / 100);
  return { ...data, saleAmount, ourCost, paypalFees, shippingFees, ebayFees, commissionRate, netProfit, commission };
}

// ── Stats ─────────────────────────────────────────────────────
function getStats() {
  const totalEarned  = state.sales.reduce((s, x) => s + (x.commission || 0), 0);
  const totalPaid    = state.sales.filter(x => x.status === 'paid').reduce((s, x) => s + (x.commission || 0), 0);
  const totalPending = state.sales.filter(x => x.status !== 'paid').reduce((s, x) => s + (x.commission || 0), 0);
  const totalVolume  = state.sales.reduce((s, x) => s + (x.saleAmount || 0), 0);
  const now = new Date();
  const thisMonth = state.sales
    .filter(x => { const d = new Date(x.date); return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth(); })
    .reduce((s, x) => s + (x.commission || 0), 0);
  return { totalEarned, totalPaid, totalPending, totalVolume, thisMonth };
}

function getMonthlyBreakdown(year) {
  const months = Array.from({ length: 12 }, (_, i) => ({ month: i, earned: 0, paid: 0, volume: 0, count: 0 }));
  state.sales.forEach(sale => {
    const d = new Date(sale.date);
    if (d.getFullYear() !== year) return;
    const m = d.getMonth();
    months[m].earned += sale.commission   || 0;
    months[m].volume += sale.saleAmount   || 0;
    if (sale.status === 'paid') months[m].paid += sale.commission || 0;
    months[m].count++;
  });
  return months;
}

// ── Format ────────────────────────────────────────────────────
function fmt(n) {
  if (isNaN(n) || n == null) return '$0.00';
  const abs = Math.abs(n);
  const str = '$' + abs.toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return n < 0 ? '-' + str : str;
}

function fmtDate(d) {
  if (!d) return '—';
  try { return new Date(d + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }); }
  catch { return d; }
}

function fmtMonth(i) {
  return ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'][i];
}

function today() { return new Date().toISOString().split('T')[0]; }

function esc(s) {
  return String(s || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

function statusBadge(status) {
  const map = { paid: ['Paid','badge-paid'], requested: ['Requested','badge-requested'], unpaid: ['Unpaid','badge-unpaid'] };
  const [label, cls] = map[status] || ['Unpaid','badge-unpaid'];
  return `<span class="badge ${cls}">${label}</span>`;
}

// ── CSV Parser ────────────────────────────────────────────────
function parseCSV(text) {
  const results = [];
  const lines = text.split('\n');

  for (let li = 0; li < lines.length; li++) {
    const line = lines[li];
    if (!line.trim()) continue;

    // Parse quoted CSV
    const fields = [];
    let inQuote = false, cur = '';
    for (let i = 0; i < line.length; i++) {
      if (line[i] === '"' && !inQuote) { inQuote = true; continue; }
      if (line[i] === '"' && inQuote)  { inQuote = false; continue; }
      if (line[i] === ',' && !inQuote) { fields.push(cur.trim()); cur = ''; continue; }
      cur += line[i];
    }
    fields.push(cur.trim());

    const rawDate = fields[0]?.trim();
    if (!rawDate || rawDate === 'Date' || !/\d/.test(rawDate)) continue;
    if (!fields[3]?.trim()) continue;

    // Parse date formats: 2/7/2024, 2.7.24, 2.29.24, 12/11
    let dateISO = null;
    try {
      const d = rawDate.replace(/\./g, '/');
      const parts = d.split('/');
      if (parts.length >= 2) {
        let m = parts[0], day = parts[1], yr = parts[2] || String(new Date().getFullYear());
        if (yr.length === 2) yr = '20' + yr;
        if (yr.length < 4) yr = String(new Date().getFullYear());
        dateISO = `${yr}-${m.padStart(2,'0')}-${day.padStart(2,'0')}`;
        if (isNaN(new Date(dateISO).getTime())) dateISO = null;
      }
    } catch { dateISO = null; }
    if (!dateISO) continue;

    const parseMoney = s => {
      if (!s) return 0;
      s = s.trim();
      if (!s || s.toLowerCase() === 'n/a' || s.toLowerCase() === 'cash' || s.toLowerCase().startsWith('included')) return 0;
      // Handle "$40 for wire fees" type strings
      const n = parseFloat(s.replace(/[$,\s]/g, ''));
      return isNaN(n) ? 0 : Math.abs(n);
    };

    const saleAmount   = parseMoney(fields[3]);
    if (saleAmount <= 0) continue;

    const ourCost      = parseMoney(fields[4]);
    const paypalFees   = parseMoney(fields[5]);
    const shippingFees = parseMoney(fields[6]);
    const ebayFees     = parseMoney(fields[7]);
    const netProfit    = saleAmount - ourCost - paypalFees - shippingFees - ebayFees;

    // Detect commission rate from CSV commission value
    const csvComm = parseMoney(fields[9]);
    let commissionRate = 25;
    if (csvComm > 0 && Math.abs(netProfit) > 1) {
      const r = (csvComm / Math.abs(netProfit)) * 100;
      if (r >= 4 && r < 7)   commissionRate = 5;
      else if (r >= 8 && r < 13) commissionRate = 10;
      else commissionRate = 25;
    }
    const commission = netProfit * (commissionRate / 100);

    // Payment status
    const parseAnyDate = s => {
      if (!s || !s.trim() || s.trim().toLowerCase() === 'n/a') return null;
      try {
        const d = new Date(s.trim());
        return isNaN(d.getTime()) ? null : d.toISOString().split('T')[0];
      } catch { return null; }
    };
    const dateRequested = parseAnyDate(fields[10]);
    const datePaid      = parseAnyDate(fields[11]);
    const status = datePaid ? 'paid' : dateRequested ? 'requested' : 'unpaid';

    results.push({
      id: `import_${dateISO}_${li}`,
      date: dateISO,
      customer: (fields[1] || '').trim(),
      item: (fields[2] || '').trim(),
      saleAmount, ourCost, paypalFees, shippingFees, ebayFees,
      netProfit, commissionRate, commission,
      status, dateRequested, datePaid,
      notes: '',
      createdAt: new Date().toISOString(),
    });
  }
  return results;
}

// ── Render ────────────────────────────────────────────────────
function render() {
  const root = document.getElementById('root');
  if (!state.loggedIn) { root.innerHTML = renderLogin(); bindLogin(); return; }
  if (!state.loaded)   { root.innerHTML = '<div class="loading"><div class="spinner"></div><p>Loading…</p></div>'; return; }
  root.innerHTML = renderHeader() + `<main class="main">${state.view === 'dashboard' ? renderDashboard() : renderSales()}</main>` + (state.modal ? renderModal() : '');
  bindApp();
}

function renderLogin() {
  return `
    <div class="login-screen">
      <div class="login-card">
        <div class="login-logo">
          <svg viewBox="0 0 24 24" width="40" height="40" fill="none" stroke="currentColor" stroke-width="1.5">
            <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5"/>
          </svg>
        </div>
        <h1>Ocean ATM</h1>
        <p class="login-sub">Commission Tracker</p>
        <input type="password" id="pw-input" class="input" placeholder="Enter password" autocomplete="current-password">
        <div id="pw-error" class="error-msg hidden">Incorrect password. Try again.</div>
        <button class="btn btn-primary btn-block" id="login-btn">Sign In</button>
      </div>
    </div>`;
}

function renderHeader() {
  return `
    <header class="header">
      <div class="header-inner">
        <div class="brand">
          <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5"/>
          </svg>
          <span>Ocean ATM Commissions</span>
        </div>
        <nav class="header-nav">
          <button class="nav-btn${state.view==='dashboard'?' active':''}" data-nav="dashboard">Dashboard</button>
          <button class="nav-btn${state.view==='sales'?' active':''}" data-nav="sales">All Sales</button>
        </nav>
        <div class="header-actions">
          <button class="btn btn-primary btn-sm" id="add-sale-btn">+ Add Sale</button>
          <button class="btn btn-ghost btn-sm" id="logout-btn">Logout</button>
        </div>
      </div>
    </header>`;
}

function renderDashboard() {
  const stats   = getStats();
  const years   = [...new Set(state.sales.map(s => new Date(s.date).getFullYear()))].sort((a,b)=>b-a);
  const curYear = new Date().getFullYear();
  const monthly = getMonthlyBreakdown(curYear);
  const maxM    = Math.max(...monthly.map(m => m.earned), 1);
  const maxVol  = Math.max(...monthly.map(m => m.volume), 1);

  const unpaid = state.sales
    .filter(s => s.status !== 'paid')
    .sort((a,b) => new Date(b.date) - new Date(a.date))
    .slice(0, 15);

  return `
    <div class="dashboard">
      <div class="page-title">
        <h2>Dashboard</h2>
        <span class="page-sub">${state.sales.length} total sales recorded</span>
      </div>

      <div class="stats-grid stats-grid--5">
        <div class="stat-card stat-card--blue">
          <div class="stat-icon">📦</div>
          <div class="stat-body">
            <div class="stat-label">Total Sales Volume</div>
            <div class="stat-value">${fmt(stats.totalVolume)}</div>
            <div class="stat-sub">${state.sales.length} sales</div>
          </div>
        </div>
        <div class="stat-card stat-card--purple">
          <div class="stat-icon">💰</div>
          <div class="stat-body">
            <div class="stat-label">Commission Earned</div>
            <div class="stat-value">${fmt(stats.totalEarned)}</div>
            <div class="stat-sub">All-time</div>
          </div>
        </div>
        <div class="stat-card stat-card--green">
          <div class="stat-icon">✅</div>
          <div class="stat-body">
            <div class="stat-label">Commission Paid</div>
            <div class="stat-value">${fmt(stats.totalPaid)}</div>
            <div class="stat-sub">${state.sales.filter(s=>s.status==='paid').length} payments</div>
          </div>
        </div>
        <div class="stat-card stat-card--yellow">
          <div class="stat-icon">⏳</div>
          <div class="stat-body">
            <div class="stat-label">Commission Pending</div>
            <div class="stat-value">${fmt(stats.totalPending)}</div>
            <div class="stat-sub">${state.sales.filter(s=>s.status!=='paid').length} outstanding</div>
          </div>
        </div>
        <div class="stat-card stat-card--blue">
          <div class="stat-icon">📅</div>
          <div class="stat-body">
            <div class="stat-label">This Month</div>
            <div class="stat-value">${fmt(stats.thisMonth)}</div>
            <div class="stat-sub">Commission earned</div>
          </div>
        </div>
      </div>

      <div class="card mt-24">
        <div class="card-header">
          <h3>${curYear} Monthly Commission</h3>
          <span class="card-sub">Total: ${fmt(monthly.reduce((s,m)=>s+m.earned,0))}</span>
        </div>
        <div class="monthly-chart">
          ${monthly.map((m,i) => `
            <div class="month-col">
              <div class="month-bar-wrap">
                ${m.earned > 0
                  ? `<div class="month-bar" style="height:${Math.max(4,Math.round((m.earned/maxM)*120))}px" title="${fmt(m.earned)}"></div>`
                  : '<div class="month-bar-empty"></div>'}
              </div>
              <div class="month-label">${fmtMonth(i)}</div>
              <div class="month-val">${m.earned > 0 ? fmt(m.earned) : '—'}</div>
            </div>`).join('')}
        </div>
      </div>

      <div class="card mt-24">
        <div class="card-header">
          <h3>${curYear} Monthly Sales Volume</h3>
          <span class="card-sub">Total: ${fmt(monthly.reduce((s,m)=>s+m.volume,0))}</span>
        </div>
        <div class="monthly-chart">
          ${monthly.map((m,i) => `
            <div class="month-col">
              <div class="month-bar-wrap">
                ${m.volume > 0
                  ? `<div class="month-bar month-bar--vol" style="height:${Math.max(4,Math.round((m.volume/maxVol)*120))}px" title="${fmt(m.volume)}"></div>`
                  : '<div class="month-bar-empty"></div>'}
              </div>
              <div class="month-label">${fmtMonth(i)}</div>
              <div class="month-val">${m.volume > 0 ? fmt(m.volume) : '—'}</div>
            </div>`).join('')}
        </div>
      </div>

      ${unpaid.length > 0 ? `
      <div class="card mt-24">
        <div class="card-header">
          <h3>Pending Commissions</h3>
          <span class="card-sub">${fmt(stats.totalPending)} owed</span>
        </div>
        <div class="table-wrap">
          <table class="table">
            <thead><tr>
              <th>Date</th><th>Customer</th><th>Item</th>
              <th style="text-align:right">Commission</th>
              <th>Status</th><th></th>
            </tr></thead>
            <tbody>
              ${unpaid.map(s => `
                <tr>
                  <td class="date-cell">${fmtDate(s.date)}</td>
                  <td class="customer-cell">${esc(s.customer)}</td>
                  <td class="item-cell">${esc(s.item)}</td>
                  <td class="money commission-cell">${fmt(s.commission)}</td>
                  <td>${statusBadge(s.status)}</td>
                  <td class="action-cell">
                    ${s.status==='unpaid'    ? `<button class="btn btn-xs btn-outline" data-request="${s.id}">Request</button>` : ''}
                    ${s.status==='requested' ? `<button class="btn btn-xs btn-green"   data-mark-paid="${s.id}">Mark Paid</button>` : ''}
                    ${s.status==='requested' ? `<button class="btn btn-xs btn-danger"  data-unrequest="${s.id}">Undo</button>` : ''}
                  </td>
                </tr>`).join('')}
            </tbody>
          </table>
        </div>
      </div>` : `
      <div class="card mt-24 all-paid">
        <div class="all-paid-icon">🎉</div>
        <p>All commissions are paid up!</p>
      </div>`}

      ${years.length > 0 ? `
      <div class="card mt-24">
        <div class="card-header"><h3>Year by Year</h3></div>
        <div class="table-wrap">
          <table class="table">
            <thead><tr>
              <th>Year</th><th>Sales</th><th>Volume</th>
              <th style="text-align:right">Earned</th>
              <th style="text-align:right">Paid</th>
              <th style="text-align:right">Pending</th>
            </tr></thead>
            <tbody>
              ${years.map(yr => {
                const ys   = state.sales.filter(s => new Date(s.date).getFullYear() === yr);
                const vol  = ys.reduce((s,x)=>s+x.saleAmount,0);
                const comm = ys.reduce((s,x)=>s+x.commission,0);
                const paid = ys.filter(s=>s.status==='paid').reduce((s,x)=>s+x.commission,0);
                return `<tr>
                  <td><strong>${yr}</strong></td>
                  <td>${ys.length}</td>
                  <td>${fmt(vol)}</td>
                  <td class="money">${fmt(comm)}</td>
                  <td class="money positive">${fmt(paid)}</td>
                  <td class="money${comm-paid>0?' pending':''}">${fmt(comm-paid)}</td>
                </tr>`;
              }).join('')}
            </tbody>
          </table>
        </div>
      </div>` : ''}

      ${state.sales.length === 0 ? `
      <div class="card mt-24 import-card">
        <div class="import-icon">📁</div>
        <h3>Import Historical Data</h3>
        <p>Upload your Google Sheet CSV to instantly import all your existing sales.</p>
        <button class="btn btn-primary" id="import-csv-btn">Import from CSV</button>
      </div>` : ''}
    </div>`;
}

function renderSales() {
  let sales = [...state.sales];
  if (state.search) {
    const q = state.search.toLowerCase();
    sales = sales.filter(s => s.customer?.toLowerCase().includes(q) || s.item?.toLowerCase().includes(q));
  }
  if (state.filterStatus !== 'all') sales = sales.filter(s => s.status === state.filterStatus);
  if (state.filterYear   !== 'all') sales = sales.filter(s => new Date(s.date).getFullYear() === parseInt(state.filterYear));
  if (state.filterFrom) sales = sales.filter(s => s.date >= state.filterFrom);
  if (state.filterTo)   sales = sales.filter(s => s.date <= state.filterTo);

  sales.sort((a,b) => {
    let av = a[state.sortField], bv = b[state.sortField];
    if (state.sortField === 'date') { av = new Date(av); bv = new Date(bv); }
    if (av < bv) return state.sortDir === 'asc' ? -1 : 1;
    if (av > bv) return state.sortDir === 'asc' ?  1 : -1;
    return 0;
  });

  const years = [...new Set(state.sales.map(s => new Date(s.date).getFullYear()))].sort((a,b)=>b-a);
  const filteredComm = sales.reduce((s,x)=>s+x.commission,0);

  const th = (field, label) => {
    const active = state.sortField === field;
    const arrow  = active ? (state.sortDir === 'asc' ? ' ↑' : ' ↓') : '';
    return `<th class="sortable${active?' active':''}" data-sort="${field}">${label}${arrow}</th>`;
  };

  return `
    <div class="sales-view">
      <div class="page-title">
        <h2>All Sales</h2>
        <span class="page-sub">${sales.length} result${sales.length!==1?'s':''} · ${fmt(filteredComm)} commission</span>
      </div>

      <div class="filters">
        <input type="text" class="input search-input" id="search-input" placeholder="Search customer or item…" value="${esc(state.search)}">
        <select class="select" id="status-filter">
          <option value="all"       ${state.filterStatus==='all'?'selected':''}>All Statuses</option>
          <option value="unpaid"    ${state.filterStatus==='unpaid'?'selected':''}>Unpaid</option>
          <option value="requested" ${state.filterStatus==='requested'?'selected':''}>Requested</option>
          <option value="paid"      ${state.filterStatus==='paid'?'selected':''}>Paid</option>
        </select>
        <select class="select" id="year-filter">
          <option value="all" ${state.filterYear==='all'?'selected':''}>All Years</option>
          ${years.map(y=>`<option value="${y}" ${state.filterYear===String(y)?'selected':''}>${y}</option>`).join('')}
        </select>
        <input type="date" class="input date-filter" id="from-date" value="${state.filterFrom}" title="From date">
        <input type="date" class="input date-filter" id="to-date"   value="${state.filterTo}"   title="To date">
        ${state.filterFrom || state.filterTo ? `<button class="btn btn-ghost btn-sm" id="clear-dates">✕ Clear</button>` : ''}
        <button class="btn btn-ghost btn-sm" id="import-csv-btn">📁 Import CSV</button>
      </div>

      ${sales.length === 0
        ? `<div class="empty-state"><div class="empty-icon">🔍</div><p>No sales match your filters.</p></div>`
        : `<div class="table-wrap">
            <table class="table table-sales">
              <thead><tr>
                ${th('date','Date')}
                ${th('customer','Customer')}
                <th>Item</th>
                ${th('saleAmount','Sale Amt')}
                ${th('netProfit','Net Profit')}
                ${th('commission','Commission')}
                <th>Status</th>
                <th>Actions</th>
              </tr></thead>
              <tbody>
                ${sales.map(s => `
                  <tr class="sale-row" data-status="${s.status}">
                    <td class="date-cell">${fmtDate(s.date)}</td>
                    <td class="customer-cell">${esc(s.customer)}</td>
                    <td class="item-cell">${esc(s.item)}</td>
                    <td class="money">${fmt(s.saleAmount)}</td>
                    <td class="money">${fmt(s.netProfit)}</td>
                    <td class="money commission-cell">${fmt(s.commission)}</td>
                    <td>${statusBadge(s.status)}</td>
                    <td class="action-cell">
                      ${s.status==='unpaid'    ? `<button class="btn btn-xs btn-outline" data-request="${s.id}">Request</button>` : ''}
                      ${s.status==='requested' ? `<button class="btn btn-xs btn-green"   data-mark-paid="${s.id}">Mark Paid</button>` : ''}
                      <button class="btn btn-xs btn-ghost"  data-edit="${s.id}">Edit</button>
                      <button class="btn btn-xs btn-danger" data-delete="${s.id}">Del</button>
                    </td>
                  </tr>`).join('')}
              </tbody>
            </table>
          </div>`}
    </div>`;
}

function renderModal() {
  const s    = state.editSale;
  const rate = s?.commissionRate ?? 25;
  return `
    <div class="modal-overlay" id="modal-overlay">
      <div class="modal modal-lg">
        <div class="modal-header">
          <h3>${s ? 'Edit Sale' : 'Add New Sale'}</h3>
          <button class="modal-close" id="modal-close">✕</button>
        </div>
        <div class="modal-body">
          <div class="form-row">
            <div class="form-group">
              <label>Date *</label>
              <input type="date" id="f-date" class="input" value="${s?.date || today()}">
            </div>
            <div class="form-group">
              <label>Commission Rate %</label>
              <input type="number" id="f-rate" class="input" value="${rate}" min="0" max="100" step="0.5">
            </div>
          </div>
          <div class="form-group">
            <label>Customer / Location *</label>
            <input type="text" id="f-customer" class="input" placeholder="e.g. Dollar ATM Club" value="${esc(s?.customer||'')}">
          </div>
          <div class="form-group">
            <label>Item(s) Sold *</label>
            <input type="text" id="f-item" class="input" placeholder="e.g. 3 8000r keypads" value="${esc(s?.item||'')}">
          </div>
          <div class="form-row-4">
            <div class="form-group">
              <label>Sale Amount *</label>
              <input type="number" id="f-sale"     class="input" placeholder="0.00" value="${s?.saleAmount||''}"   step="0.01" min="0">
            </div>
            <div class="form-group">
              <label>Our Cost</label>
              <input type="number" id="f-cost"     class="input" placeholder="0.00" value="${s?.ourCost||''}"      step="0.01" min="0">
            </div>
            <div class="form-group">
              <label>PayPal Fees</label>
              <input type="number" id="f-paypal"   class="input" placeholder="0.00" value="${s?.paypalFees||''}"   step="0.01" min="0">
            </div>
            <div class="form-group">
              <label>Shipping Fees</label>
              <input type="number" id="f-shipping" class="input" placeholder="0.00" value="${s?.shippingFees||''}" step="0.01" min="0">
            </div>
          </div>
          <div class="form-row">
            <div class="form-group">
              <label>eBay Fees</label>
              <input type="number" id="f-ebay"  class="input" placeholder="0.00" value="${s?.ebayFees||''}" step="0.01" min="0">
            </div>
            <div class="form-group">
              <label>Notes</label>
              <input type="text"   id="f-notes" class="input" placeholder="Optional" value="${esc(s?.notes||'')}">
            </div>
          </div>
          <div class="calc-preview" id="calc-preview">
            <div class="calc-row"><span>Net Profit</span><span id="prev-net">—</span></div>
            <div class="calc-row calc-row--total"><span id="prev-label">Your Commission (${rate}%)</span><span id="prev-comm">—</span></div>
          </div>
        </div>
        <div class="modal-footer">
          <button class="btn btn-ghost"   id="modal-cancel">Cancel</button>
          <button class="btn btn-primary" id="save-sale-btn">${s ? 'Save Changes' : 'Add Sale'}</button>
        </div>
      </div>
    </div>`;
}

// ── Events ────────────────────────────────────────────────────
function bindLogin() {
  const input = document.getElementById('pw-input');
  const err   = document.getElementById('pw-error');
  const attempt = () => {
    if (input.value === PASSWORD) {
      sessionStorage.setItem('commission_auth', 'true');
      state.loggedIn = true;
      initFirebase();
      render();
    } else {
      err.classList.remove('hidden');
      input.value = '';
      input.focus();
    }
  };
  document.getElementById('login-btn').addEventListener('click', attempt);
  input.addEventListener('keydown', e => { if (e.key === 'Enter') attempt(); });
}

function bindApp() {
  // Nav
  document.querySelectorAll('[data-nav]').forEach(btn =>
    btn.addEventListener('click', () => { state.view = btn.dataset.nav; render(); })
  );

  // Logout
  document.getElementById('logout-btn')?.addEventListener('click', () => {
    sessionStorage.removeItem('commission_auth');
    state.loggedIn = false;
    render();
  });

  // Add sale
  document.getElementById('add-sale-btn')?.addEventListener('click', () => {
    state.editSale = null;
    state.modal = 'sale';
    render();
  });

  // Edit
  document.querySelectorAll('[data-edit]').forEach(btn =>
    btn.addEventListener('click', () => {
      state.editSale = state.sales.find(s => s.id === btn.dataset.edit) || null;
      state.modal = 'sale';
      render();
    })
  );

  // Delete
  document.querySelectorAll('[data-delete]').forEach(btn =>
    btn.addEventListener('click', async () => {
      if (!confirm('Delete this sale?')) return;
      await deleteSale(btn.dataset.delete);
    })
  );

  // Request commission
  document.querySelectorAll('[data-request]').forEach(btn =>
    btn.addEventListener('click', async () => {
      const sale = state.sales.find(s => s.id === btn.dataset.request);
      if (sale) await updateSale(sale.id, { ...sale, status: 'requested', dateRequested: today() });
    })
  );

  // Undo request
  document.querySelectorAll('[data-unrequest]').forEach(btn =>
    btn.addEventListener('click', async () => {
      const sale = state.sales.find(s => s.id === btn.dataset.unrequest);
      if (sale) await updateSale(sale.id, { ...sale, status: 'unpaid', dateRequested: null });
    })
  );

  // Mark paid
  document.querySelectorAll('[data-mark-paid]').forEach(btn =>
    btn.addEventListener('click', async () => {
      const sale = state.sales.find(s => s.id === btn.dataset.markPaid);
      if (sale) await updateSale(sale.id, { ...sale, status: 'paid', datePaid: today() });
    })
  );

  // Modal close
  document.getElementById('modal-close')?.addEventListener('click', closeModal);
  document.getElementById('modal-cancel')?.addEventListener('click', closeModal);
  document.getElementById('modal-overlay')?.addEventListener('click', e => { if (e.target === e.currentTarget) closeModal(); });

  // Live preview
  ['f-sale','f-cost','f-paypal','f-shipping','f-ebay','f-rate'].forEach(id =>
    document.getElementById(id)?.addEventListener('input', updatePreview)
  );
  updatePreview();

  // Save sale
  document.getElementById('save-sale-btn')?.addEventListener('click', async () => {
    const data = getFormData();
    if (!data) return;
    if (state.editSale) await updateSale(state.editSale.id, { ...state.editSale, ...data });
    else                await addSale(data);
    closeModal();
  });

  // Filters
  document.getElementById('search-input')?.addEventListener('input', e => { state.search = e.target.value; render(); });
  document.getElementById('status-filter')?.addEventListener('change', e => { state.filterStatus = e.target.value; render(); });
  document.getElementById('year-filter')?.addEventListener('change',   e => { state.filterYear   = e.target.value; render(); });
  document.getElementById('from-date')?.addEventListener('change', e => { state.filterFrom = e.target.value; render(); });
  document.getElementById('to-date')?.addEventListener('change',   e => { state.filterTo   = e.target.value; render(); });
  document.getElementById('clear-dates')?.addEventListener('click', () => { state.filterFrom = ''; state.filterTo = ''; render(); });

  // Sort
  document.querySelectorAll('[data-sort]').forEach(th =>
    th.addEventListener('click', () => {
      const f = th.dataset.sort;
      if (state.sortField === f) state.sortDir = state.sortDir === 'asc' ? 'desc' : 'asc';
      else { state.sortField = f; state.sortDir = 'desc'; }
      render();
    })
  );

  // CSV import
  document.getElementById('import-csv-btn')?.addEventListener('click', () => {
    document.getElementById('csv-file-input').click();
  });
  document.getElementById('csv-file-input')?.addEventListener('change', async e => {
    const file = e.target.files[0];
    if (!file) return;
    const text    = await file.text();
    const parsed  = parseCSV(text);
    if (parsed.length === 0) { alert('No valid data found in the CSV.'); return; }
    if (!confirm(`Found ${parsed.length} sales records. Import them all?`)) return;
    await importSales(parsed);
    alert(`✅ Successfully imported ${parsed.length} sales!`);
    e.target.value = '';
  });
}

function getFormData() {
  const date     = document.getElementById('f-date')?.value;
  const customer = document.getElementById('f-customer')?.value.trim();
  const item     = document.getElementById('f-item')?.value.trim();
  const sale     = document.getElementById('f-sale')?.value;
  if (!date || !customer || !item || !sale) { alert('Please fill in Date, Customer, Item, and Sale Amount.'); return null; }
  return {
    date, customer, item,
    saleAmount:    parseFloat(sale) || 0,
    ourCost:       parseFloat(document.getElementById('f-cost')?.value)     || 0,
    paypalFees:    parseFloat(document.getElementById('f-paypal')?.value)   || 0,
    shippingFees:  parseFloat(document.getElementById('f-shipping')?.value) || 0,
    ebayFees:      parseFloat(document.getElementById('f-ebay')?.value)     || 0,
    commissionRate:parseFloat(document.getElementById('f-rate')?.value)     || 25,
    notes:         document.getElementById('f-notes')?.value.trim() || '',
    status:        state.editSale?.status || 'unpaid',
    dateRequested: state.editSale?.dateRequested || null,
    datePaid:      state.editSale?.datePaid || null,
  };
}

function updatePreview() {
  const sale     = parseFloat(document.getElementById('f-sale')?.value)     || 0;
  const cost     = parseFloat(document.getElementById('f-cost')?.value)     || 0;
  const paypal   = parseFloat(document.getElementById('f-paypal')?.value)   || 0;
  const shipping = parseFloat(document.getElementById('f-shipping')?.value) || 0;
  const ebay     = parseFloat(document.getElementById('f-ebay')?.value)     || 0;
  const rate     = parseFloat(document.getElementById('f-rate')?.value)     || 25;
  const net  = sale - cost - paypal - shipping - ebay;
  const comm = net * (rate / 100);
  const netEl   = document.getElementById('prev-net');
  const commEl  = document.getElementById('prev-comm');
  const labelEl = document.getElementById('prev-label');
  if (netEl)   netEl.textContent   = fmt(net);
  if (commEl)  commEl.textContent  = fmt(comm);
  if (labelEl) labelEl.textContent = `Your Commission (${rate}%)`;
}

function closeModal() {
  state.modal    = null;
  state.editSale = null;
  render();
}

// ── Init ──────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  if (state.loggedIn) initFirebase();
  render();
});
