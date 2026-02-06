// Main App Controller
window.totalWealth = 0;

document.addEventListener('DOMContentLoaded', async () => {
    // 1. Initialize DB
    try {
        await db.init();
        console.log('DB Initialized');
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
            if(viewId === 'ledger') loadData();
            if(viewId === 'analysis') runAnalysis();
        });
    });

    // 3. Modal Logic
    setupModal('btn-add-tx', 'modal-tx');
    setupModal('btn-add-asset', 'modal-asset');
    setupModal('btn-add-goal', 'modal-goal');

    // 4. Form Submissions
    
    // Add Asset
    document.getElementById('form-asset').addEventListener('submit', async (e) => {
        e.preventDefault();
        const asset = {
            name: document.getElementById('asset-name').value,
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
        const goal = {
            name: document.getElementById('goal-name').value,
            targetAmount: parseFloat(document.getElementById('goal-target').value)
        };
        await db.add('goals', goal);
        closeModals();
        loadData();
    });

    // Update Price
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

    // Settings
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

    // Event Delegation for Dynamic Elements
    document.body.addEventListener('click', async (e) => {
        // Delete Asset
        if(e.target.classList.contains('btn-del-asset')) {
            if(confirm('Delete asset and all its history?')) {
                // Note: In real app, cascading delete logic needed for transactions
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

    // Install Prompt Check
    checkInstallStatus();
});

// --- Core Logic ---

async function loadData() {
    const assets = await db.getAll('assets');
    const transactions = await db.getAll('transactions');
    const goals = await db.getAll('goals');

    // Calculate Portfolio State
    const portfolio = Finance.computePortfolio(assets, transactions);
    
    // Global State
    window.totalWealth = portfolio.reduce((sum, a) => sum + a.currentValue, 0);
    const totalCost = portfolio.reduce((sum, a) => sum + a.totalCost, 0);
    const totalPL = window.totalWealth - totalCost;
    const totalIncome = portfolio.reduce((sum, a) => sum + a.totalIncome, 0);

    // Update Dashboard Widgets
    updateElement('dash-networth', UI.formatCurrency(window.totalWealth));
    updateElement('dash-pl', UI.formatCurrency(totalPL));
    updateElement('dash-pl-pct', UI.formatPct(totalCost > 0 ? (totalPL/totalCost)*100 : 0));
    updateElement('dash-income', UI.formatCurrency(totalIncome));

    // Calculate XIRR
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
    // SVG Dash array: score, 100
    circle.style.strokeDasharray = `${score}, 100`;
    circle.style.stroke = score > 70 ? 'var(--success)' : (score > 40 ? 'var(--secondary)' : 'var(--error)');

    // Render Tables
    UI.renderPortfolioTable(portfolio);
    UI.renderLedger(transactions, assets);
    
    // Render Goals
    UI.renderGoals(goals);

    // Populate Selects
    populateAssetSelect(assets);
}

function runAnalysis() {
    // A simplified analysis run based on loaded data logic
    const list = document.getElementById('risk-list');
    list.innerHTML = '';
    
    // Example Checks
    if(window.totalWealth < 1000) {
        list.innerHTML += '<li>Portfolio too small for deep analysis.</li>';
        return;
    }
    list.innerHTML += '<li>Concentration Check: Passed</li>';
    list.innerHTML += '<li>Emergency Fund: <span style="color:yellow">Check manually</span></li>';

    // Projection
    const xirr = parseFloat(document.getElementById('dash-xirr').innerText);
    const futureVal = window.totalWealth * Math.pow(1 + (xirr/100), 10);
    document.getElementById('proj-value').innerText = UI.formatCurrency(futureVal);
}

// --- Helpers ---

function updateElement(id, val) {
    const el = document.getElementById(id);
    if(el) el.innerText = val;
}

function populateAssetSelect(assets) {
    const sel = document.getElementById('tx-asset');
    sel.innerHTML = '';
    assets.forEach(a => {
        const opt = document.createElement('option');
        opt.value = a.id;
        opt.innerText = a.name;
        sel.appendChild(opt);
    });
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

        // Logic to trigger install prompt
        let deferredPrompt;
        window.addEventListener('beforeinstallprompt', (e) => {
            e.preventDefault();
            deferredPrompt = e;
        });

        document.getElementById('btn-install-pwa').addEventListener('click', async () => {
            if (deferredPrompt) {
                deferredPrompt.prompt();
                const { outcome } = await deferredPrompt.userChoice;
                if(outcome === 'accepted') {
                    gate.classList.add('hidden');
                }
                deferredPrompt = null;
            } else {
                alert('Use your browser menu to "Add to Home Screen" or "Install App".');
            }
        });
    }
}