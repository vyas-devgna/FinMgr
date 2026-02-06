// Main App Controller
window.totalWealth = 0;
window.totalAssets = 0; // Excluding liabilities
window.deferredPrompt = null; // Global variable for install prompt

// Capture PWA install prompt immediately
window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    window.deferredPrompt = e;
    console.log('Install Prompt Captured');
    // If UI is ready, show button
    const btn = document.getElementById('btn-install-pwa');
    if(btn) btn.classList.remove('hidden');
});

document.addEventListener('DOMContentLoaded', async () => {
    // 1. Initialize DB
    try {
        await db.init();
        loadData();
    } catch (e) {
        console.error('DB Init Failed', e);
        alert('Storage Initialization Failed. App may not work.');
    }

    // 2. Navigation Logic
    const navLinks = document.querySelectorAll('.nav-links li');
    const views = document.querySelectorAll('.view');
    const pageTitle = document.getElementById('page-title');

    navLinks.forEach(link => {
        link.addEventListener('click', () => {
            navLinks.forEach(l => l.classList.remove('active'));
            link.classList.add('active');
            
            const viewId = link.getAttribute('data-view');
            views.forEach(v => v.classList.remove('active'));
            document.getElementById(`view-${viewId}`).classList.add('active');
            pageTitle.innerText = link.innerText;

            if(viewId === 'portfolio') loadData(); 
            if(viewId === 'ledger') loadData(); // Reload to refresh filters if needed
            if(viewId === 'analysis') runAnalysis();
            if(viewId === 'settings') loadSettings();
        });
    });

    // 3. Modal Logic
    setupModal('btn-add-tx', 'modal-tx');
    setupModal('btn-add-asset', 'modal-asset');
    
    // Custom Goal Modal open to populate checklist
    document.getElementById('btn-add-goal').addEventListener('click', async () => {
        const assets = await db.getAll('assets');
        const container = document.getElementById('goal-assets-selector');
        container.innerHTML = '';
        assets.forEach(a => {
            const div = document.createElement('div');
            div.className = 'checkbox-item';
            div.innerHTML = `
                <input type="checkbox" value="${a.id}" id="g-a-${a.id}">
                <label for="g-a-${a.id}">${a.name} (${a.type})</label>
            `;
            container.appendChild(div);
        });
        openModal('modal-goal');
    });

    // 4. Form Submissions
    
    // Add Asset
    document.getElementById('form-asset').addEventListener('submit', async (e) => {
        e.preventDefault();
        const asset = {
            name: document.getElementById('asset-name').value,
            ticker: document.getElementById('asset-ticker').value.toUpperCase(),
            type: document.getElementById('asset-type').value,
            currentPrice: parseFloat(document.getElementById('asset-current-price').value),
            targetAllocation: parseFloat(document.getElementById('asset-target-alloc').value)
        };
        await db.add('assets', asset);
        closeModals();
        loadData();
    });

    // Add Transaction
    document.getElementById('form-tx').addEventListener('submit', async (e) => {
        e.preventDefault();
        const tx = {
            assetId: parseInt(document.getElementById('tx-asset').value),
            type: document.getElementById('tx-type').value,
            date: document.getElementById('tx-date').value,
            qty: parseFloat(document.getElementById('tx-qty').value),
            price: parseFloat(document.getElementById('tx-price').value),
            fees: parseFloat(document.getElementById('tx-fees').value)
        };
        await db.add('transactions', tx);
        closeModals();
        loadData();
    });

    // Add Goal
    document.getElementById('form-goal').addEventListener('submit', async (e) => {
        e.preventDefault();
        // Get Checked Assets
        const checked = Array.from(document.querySelectorAll('#goal-assets-selector input:checked')).map(cb => parseInt(cb.value));
        
        const goal = {
            name: document.getElementById('goal-name').value,
            targetAmount: parseFloat(document.getElementById('goal-target').value),
            linkedAssets: checked
        };
        await db.add('goals', goal);
        closeModals();
        loadData();
    });

    // Update Price Manual
    document.getElementById('form-price').addEventListener('submit', async (e) => {
        e.preventDefault();
        const id = parseInt(document.getElementById('price-asset-id').value);
        const price = parseFloat(document.getElementById('new-price-input').value);
        
        const assets = await db.getAll('assets');
        const asset = assets.find(a => a.id === id);
        if(asset) {
            asset.currentPrice = price;
            await db.update('assets', asset);
        }
        closeModals();
        loadData();
    });

    // 5. Settings & API
    document.getElementById('btn-save-key').addEventListener('click', () => {
        const key = document.getElementById('api-key').value;
        if(key) {
            localStorage.setItem('av_api_key', key);
            alert('API Key Saved');
        }
    });

    document.getElementById('btn-update-prices').addEventListener('click', async (e) => {
        const key = localStorage.getItem('av_api_key');
        if(!key) {
            alert('Please configure Alpha Vantage API Key in Settings first.');
            return;
        }
        
        const btn = e.target;
        btn.innerText = 'Fetching...';
        btn.disabled = true;

        const assets = await db.getAll('assets');
        const tickers = assets.filter(a => a.ticker && a.ticker.length > 0);
        
        if(tickers.length === 0) {
            alert('No assets have ticker symbols.');
            btn.innerText = 'Fetch Prices';
            btn.disabled = false;
            return;
        }

        let updated = 0;
        // Basic Loop with delay to avoid rate limits (5 per min free tier)
        for (const asset of tickers) {
            try {
                const res = await fetch(`https://www.alphavantage.co/query?function=GLOBAL_QUOTE&symbol=${asset.ticker}&apikey=${key}`);
                const data = await res.json();
                const quote = data['Global Quote'];
                if(quote && quote['05. price']) {
                    asset.currentPrice = parseFloat(quote['05. price']);
                    await db.update('assets', asset);
                    updated++;
                }
                // Delay 12s to stay under 5 req/min (Free tier limitation)
                // If user has paid key, this is slow, but safe default.
                await new Promise(r => setTimeout(r, 12000));
            } catch (err) {
                console.error('Fetch error', err);
            }
        }

        alert(`Updated ${updated} assets.`);
        btn.innerText = 'Fetch Prices';
        btn.disabled = false;
        loadData();
    });

    // Settings Exports
    document.getElementById('btn-export').addEventListener('click', async () => {
        const json = await db.exportData();
        const blob = new Blob([json], {type: 'application/json'});
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `wealthvault_backup_${new Date().toISOString().slice(0,10)}.json`;
        a.click();
    });

    document.getElementById('file-import').addEventListener('change', (e) => {
        const file = e.target.files[0];
        if(!file) return;
        const reader = new FileReader();
        reader.onload = async (evt) => {
            const success = await db.importData(evt.target.result);
            if(success) { alert('Data Restored'); loadData(); }
            else alert('Import Failed');
        };
        reader.readAsText(file);
    });

    document.getElementById('btn-wipe').addEventListener('click', async () => {
        if(confirm('Are you sure? This cannot be undone.')) {
            await db.clear('assets');
            await db.clear('transactions');
            await db.clear('goals');
            loadData();
        }
    });

    // Ledger Filters Events
    ['filter-date-start', 'filter-date-end', 'filter-asset', 'filter-type'].forEach(id => {
        document.getElementById(id).addEventListener('change', loadData);
    });

    // Event Delegation
    document.body.addEventListener('click', async (e) => {
        // Delete Asset
        if(e.target.classList.contains('btn-del-asset')) {
            if(confirm('Delete asset and all its history?')) {
                await db.delete('assets', parseInt(e.target.dataset.id));
                loadData();
            }
        }
        // Delete Tx
        if(e.target.classList.contains('btn-del-tx')) {
            await db.delete('transactions', parseInt(e.target.dataset.id));
            loadData();
        }
        // Price Edit
        if(e.target.closest('.price-cell')) {
            const el = e.target.closest('.price-cell');
            document.getElementById('price-asset-id').value = el.dataset.id;
            document.getElementById('price-asset-name').innerText = el.dataset.name;
            openModal('modal-price');
        }
    });

    // Initial Install Check
    checkInstallStatus();
});

// --- Core Logic ---

async function loadData() {
    const assets = await db.getAll('assets');
    const transactions = await db.getAll('transactions');
    const goals = await db.getAll('goals');

    // Calculate Portfolio State
    const portfolio = Finance.computePortfolio(assets, transactions);
    
    // Separate Assets and Liabilities
    const investmentAssets = portfolio.filter(a => !a.isLiability);
    const liabilities = portfolio.filter(a => a.isLiability);

    window.totalAssets = investmentAssets.reduce((sum, a) => sum + a.currentValue, 0);
    const totalDebt = liabilities.reduce((sum, a) => sum + a.currentValue, 0);
    window.totalWealth = window.totalAssets - totalDebt;

    const totalCost = investmentAssets.reduce((sum, a) => sum + a.totalCost, 0);
    const totalPL = window.totalAssets - totalCost; // P/L usually on investments
    const totalIncome = portfolio.reduce((sum, a) => sum + a.totalIncome, 0);

    // Update Dashboard Widgets
    updateElement('dash-networth', UI.formatCurrency(window.totalWealth));
    updateElement('dash-pl', UI.formatCurrency(totalPL));
    updateElement('dash-pl-pct', UI.formatPct(totalCost > 0 ? (totalPL/totalCost)*100 : 0));
    updateElement('dash-income', UI.formatCurrency(totalIncome));

    // Calculate XIRR (using only non-liability txs roughly)
    // Filter txs for XIRR? 
    // Ideally, we include debt if it's leverage. If it's personal loan, maybe not.
    // For now, include all to reflect true cashflow impact on wealth.
    const xirr = Finance.xirr(transactions, window.totalWealth);
    updateElement('dash-xirr', UI.formatPct(xirr));

    // Update Charts
    const history = Finance.generateWealthHistory(transactions);
    UI.renderLineChart('wealthChart', history);
    UI.renderAllocationChart('allocationChart', portfolio);

    // Health Score
    const score = Finance.calculateHealthScore(portfolio);
    updateElement('health-score-text', Math.round(score));
    const circle = document.getElementById('health-circle');
    circle.style.strokeDasharray = `${score}, 100`;
    circle.style.stroke = score > 70 ? 'var(--success)' : (score > 40 ? 'var(--secondary)' : 'var(--error)');

    // Render Tables
    UI.renderPortfolioTable(portfolio);
    
    // Render Ledger (Filtered)
    const filteredTxs = filterLedger(transactions);
    UI.renderLedger(filteredTxs, assets);
    
    // Render Goals (With Links)
    const goalsWithProgress = Finance.calculateGoalProgress(goals, portfolio, window.totalWealth);
    UI.renderGoals(goalsWithProgress);

    // Populate Selects (Asset Select for Forms & Filters)
    populateAssetSelects(assets);
}

function filterLedger(transactions) {
    const start = document.getElementById('filter-date-start').value;
    const end = document.getElementById('filter-date-end').value;
    const assetId = document.getElementById('filter-asset').value;
    const type = document.getElementById('filter-type').value;

    return transactions.filter(tx => {
        let pass = true;
        if(start && new Date(tx.date) < new Date(start)) pass = false;
        if(end && new Date(tx.date) > new Date(end)) pass = false;
        if(assetId !== 'ALL' && tx.assetId !== parseInt(assetId)) pass = false;
        if(type !== 'ALL' && tx.type !== type) pass = false;
        return pass;
    });
}

function loadSettings() {
    const key = localStorage.getItem('av_api_key');
    if(key) document.getElementById('api-key').value = key;
}

function runAnalysis() {
    const list = document.getElementById('risk-list');
    list.innerHTML = '';
    
    if(window.totalAssets < 1000) {
        list.innerHTML += '<li>Portfolio too small for deep analysis.</li>';
        return;
    }
    
    // Recalculate health for explicit messages
    // (This is duplicated logic from calc but needed for text output)
    list.innerHTML += '<li>Basic Health Check complete. See Score.</li>';
    if(window.totalWealth < 0) list.innerHTML += '<li><span style="color:var(--error)">Warning: Negative Net Worth</span></li>';
}

// --- Helpers ---

function updateElement(id, val) {
    const el = document.getElementById(id);
    if(el) el.innerText = val;
}

function populateAssetSelects(assets) {
    // Transaction Modal Select
    const txSel = document.getElementById('tx-asset');
    txSel.innerHTML = '';
    assets.forEach(a => {
        const opt = document.createElement('option');
        opt.value = a.id;
        opt.innerText = a.name;
        txSel.appendChild(opt);
    });

    // Filter Select
    const filterSel = document.getElementById('filter-asset');
    const currentVal = filterSel.value;
    filterSel.innerHTML = '<option value="ALL">All Assets</option>';
    assets.forEach(a => {
        const opt = document.createElement('option');
        opt.value = a.id;
        opt.innerText = a.name;
        filterSel.appendChild(opt);
    });
    filterSel.value = currentVal;
}

function setupModal(btnId, modalId) {
    const btn = document.getElementById(btnId);
    if(btn) btn.addEventListener('click', () => openModal(modalId));
}

function openModal(id) {
    document.getElementById('modal-overlay').classList.remove('hidden');
    document.getElementById(id).classList.remove('hidden');
}

function closeModals() {
    document.querySelectorAll('.modal').forEach(m => m.classList.add('hidden'));
    document.getElementById('modal-overlay').classList.add('hidden');
    document.querySelectorAll('form').forEach(f => f.reset());
}

document.querySelectorAll('.close-modal').forEach(b => b.addEventListener('click', closeModals));

// Install Gatekeeper
function checkInstallStatus() {
    const isStandalone = window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone;
    
    if (!isStandalone) {
        // We are in browser tab
        const gate = document.getElementById('install-gate');
        gate.classList.remove('hidden');

        // Check if event already fired
        if(window.deferredPrompt) {
             document.getElementById('btn-install-pwa').classList.remove('hidden');
        }

        document.getElementById('btn-install-pwa').addEventListener('click', async () => {
            if (window.deferredPrompt) {
                window.deferredPrompt.prompt();
                const { outcome } = await window.deferredPrompt.userChoice;
                if(outcome === 'accepted') {
                    gate.classList.add('hidden');
                }
                window.deferredPrompt = null;
            }
        });
    }
}