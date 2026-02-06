const UI = {
    formatCurrency: (num) => {
        return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(num);
    },

    formatPct: (num) => {
        return num.toFixed(2) + '%';
    },

    renderPortfolioTable: (portfolio) => {
        const tbody = document.querySelector('#portfolio-table tbody');
        tbody.innerHTML = '';

        portfolio.forEach(asset => {
            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td>
                    <div style="font-weight:bold">${asset.name}</div>
                    <div class="small-text text-muted">${asset.type}</div>
                </td>
                <td class="clickable price-cell" data-id="${asset.id}" data-name="${asset.name}">${parseFloat(asset.currentPrice).toFixed(2)} ✎</td>
                <td>${asset.units.toFixed(4)}</td>
                <td>${(asset.totalCost / (asset.units || 1)).toFixed(2)}</td>
                <td>${UI.formatCurrency(asset.currentValue)}</td>
                <td style="color: ${asset.absoluteReturn >= 0 ? 'var(--success)' : 'var(--error)'}">
                    ${UI.formatCurrency(asset.absoluteReturn)}<br>
                    <small>${UI.formatPct(asset.returnPct)}</small>
                </td>
                <td>${UI.formatPct((asset.currentValue / (window.totalWealth || 1)) * 100)}</td>
                <td>
                    <button class="btn-text btn-del-asset" data-id="${asset.id}">×</button>
                </td>
            `;
            tbody.appendChild(tr);
        });
    },

    renderLedger: (transactions, assets) => {
        const tbody = document.querySelector('#ledger-table tbody');
        tbody.innerHTML = '';
        const sorted = [...transactions].sort((a,b) => new Date(b.date) - new Date(a.date));

        sorted.forEach(tx => {
            const asset = assets.find(a => a.id === tx.assetId);
            const tr = document.createElement('tr');
            const total = (tx.qty * tx.price).toFixed(2);
            tr.innerHTML = `
                <td>${tx.date}</td>
                <td><span class="badge ${tx.type}">${tx.type}</span></td>
                <td>${asset ? asset.name : 'Unknown'}</td>
                <td>${tx.qty}</td>
                <td>${tx.price}</td>
                <td>${total}</td>
                <td><button class="btn-text btn-del-tx" data-id="${tx.id}">×</button></td>
            `;
            tbody.appendChild(tr);
        });
    },

    renderLineChart: (canvasId, data, label) => {
        const canvas = document.getElementById(canvasId);
        const ctx = canvas.getContext('2d');
        const width = canvas.width = canvas.parentElement.clientWidth;
        const height = canvas.height = 250;
        
        ctx.clearRect(0, 0, width, height);
        
        if(data.length < 2) {
            ctx.fillStyle = '#666';
            ctx.fillText('Not enough data', width/2 - 40, height/2);
            return;
        }

        const padding = 40;
        const chartW = width - padding * 2;
        const chartH = height - padding * 2;

        const maxVal = Math.max(...data.map(d => d.value)) * 1.1;
        const minVal = Math.min(...data.map(d => d.value)) * 0.9;

        // Scale functions
        const getX = (i) => padding + (i / (data.length - 1)) * chartW;
        const getY = (val) => height - padding - ((val - minVal) / (maxVal - minVal)) * chartH;

        // Draw Line
        ctx.beginPath();
        ctx.strokeStyle = '#bb86fc';
        ctx.lineWidth = 2;
        
        data.forEach((p, i) => {
            if(i === 0) ctx.moveTo(getX(i), getY(p.value));
            else ctx.lineTo(getX(i), getY(p.value));
        });
        ctx.stroke();

        // Fill Area
        ctx.lineTo(getX(data.length-1), height - padding);
        ctx.lineTo(getX(0), height - padding);
        ctx.fillStyle = 'rgba(187, 134, 252, 0.1)';
        ctx.fill();
    },

    renderAllocationChart: (canvasId, portfolio) => {
        const canvas = document.getElementById(canvasId);
        const ctx = canvas.getContext('2d');
        const width = canvas.width = 250;
        const height = canvas.height = 250;
        
        const center = width / 2;
        const radius = width / 2 - 10;
        
        let startAngle = 0;
        const total = portfolio.reduce((sum, a) => sum + a.currentValue, 0);
        
        const colors = ['#03dac6', '#bb86fc', '#cf6679', '#ffb74d', '#4fc3f7', '#aed581'];
        const legend = document.getElementById('allocation-legend');
        legend.innerHTML = '';

        // Group by Type
        const byType = {};
        portfolio.forEach(a => {
            byType[a.type] = (byType[a.type] || 0) + a.currentValue;
        });

        Object.keys(byType).forEach((type, index) => {
            const val = byType[type];
            const sliceAngle = (val / total) * 2 * Math.PI;
            const color = colors[index % colors.length];

            ctx.beginPath();
            ctx.moveTo(center, center);
            ctx.arc(center, center, radius, startAngle, startAngle + sliceAngle);
            ctx.fillStyle = color;
            ctx.fill();

            startAngle += sliceAngle;

            // Legend
            legend.innerHTML += `<div style="display:flex;align-items:center;margin:4px 0">
                <span style="width:12px;height:12px;background:${color};margin-right:8px;border-radius:2px"></span>
                <span>${type} (${UI.formatPct((val/total)*100)})</span>
            </div>`;
        });
    },

    renderGoals: (goals) => {
        const container = document.getElementById('goals-container');
        container.innerHTML = '';
        
        goals.forEach(goal => {
            // Simple projection: Assume total wealth contributes to goal (Simplified)
            // Ideally, specific assets are linked to goals.
            // Here we just visualize the Goal Card.
            const progress = Math.min(100, (window.totalWealth / goal.targetAmount) * 100);
            
            const el = document.createElement('div');
            el.className = 'card';
            el.innerHTML = `
                <h3>${goal.name}</h3>
                <p class="text-muted">Target: ${UI.formatCurrency(goal.targetAmount)}</p>
                <div style="background:#333;height:8px;border-radius:4px;margin-top:10px;overflow:hidden">
                    <div style="width:${progress}%;background:var(--secondary);height:100%"></div>
                </div>
                <div style="display:flex;justify-content:space-between;margin-top:5px">
                    <small>${progress.toFixed(1)}% Reached</small>
                    <small>${UI.formatCurrency(goal.targetAmount - window.totalWealth)} Left</small>
                </div>
            `;
            container.appendChild(el);
        });
    }
};