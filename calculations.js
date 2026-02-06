const Finance = {
    
    // Calculate Portfolio Summary: Merges Assets + Txs to get current standing
    computePortfolio: (assets, transactions) => {
        const summary = assets.map(asset => {
            const assetTxs = transactions.filter(t => t.assetId === asset.id);
            
            let units = 0;
            let totalCost = 0; // Net invested amount
            let totalIncome = 0;

            // Sort by date asc
            assetTxs.sort((a, b) => new Date(a.date) - new Date(b.date));

            assetTxs.forEach(tx => {
                const qty = parseFloat(tx.qty);
                const price = parseFloat(tx.price);
                const fees = parseFloat(tx.fees || 0);
                const total = (qty * price) + fees;

                if (tx.type === 'BUY') {
                    units += qty;
                    totalCost += total;
                } else if (tx.type === 'SELL') {
                    // FIFO/Avg Cost simplified: Reduce cost proportionally
                    const avgCostPerUnit = units > 0 ? totalCost / units : 0;
                    totalCost -= (avgCostPerUnit * qty); 
                    units -= qty;
                } else if (tx.type === 'DIVIDEND') {
                    totalIncome += (qty * price); 
                }
            });

            const currentPrice = parseFloat(asset.currentPrice || 0);
            const currentValue = units * currentPrice;
            const absoluteReturn = currentValue - totalCost; 
            const returnPct = totalCost > 0 ? (absoluteReturn / totalCost) * 100 : 0;
            
            // Check if liability
            const isLiability = asset.type === 'DEBT';

            return {
                ...asset,
                units,
                totalCost,
                currentValue: isLiability ? currentValue : currentValue, // Value stored as positive, handled in net worth
                isLiability,
                totalIncome,
                absoluteReturn,
                returnPct
            };
        });

        return summary;
    },

    // XIRR Calculation
    xirr: (transactions, currentPortfolioValue) => {
        // Exclude Debt transactions from XIRR ideally, or treat borrowing as inflow?
        // Simplified: We treat standard buys as outflow, sells/income as inflow.
        
        const cashflows = [];
        
        transactions.forEach(tx => {
            const date = new Date(tx.date);
            const amt = (parseFloat(tx.qty) * parseFloat(tx.price)) + parseFloat(tx.fees || 0);
            
            // Note: If we added loan tracking, a loan "BUY" is actually getting cash (inflow).
            // But currently the system treats BUY as spending money to get an asset.
            // For DEBT assets, users likely log a BUY to represent taking on the debt (which doesn't fit the 'spending' model well).
            // For this version, XIRR applies primarily to investment assets.
            
            if (tx.type === 'BUY') {
                cashflows.push({ date, amount: -amt });
            } else {
                cashflows.push({ date, amount: amt }); 
            }
        });

        cashflows.push({ date: new Date(), amount: currentPortfolioValue });

        if (cashflows.length < 2) return 0;

        const xirrValue = Finance.calculateXIRR(cashflows);
        return isNaN(xirrValue) ? 0 : xirrValue * 100;
    },

    calculateXIRR: (cashflows, guess = 0.1) => {
        const maxIter = 100;
        const tol = 1e-6;
        let x0 = guess;

        cashflows.sort((a, b) => a.date - b.date);
        const startDate = cashflows[0].date;

        for (let i = 0; i < maxIter; i++) {
            let fValue = 0;
            let fDerivative = 0;

            for (const cf of cashflows) {
                const years = (cf.date - startDate) / (1000 * 60 * 60 * 24 * 365);
                const exp = Math.pow(1 + x0, years);
                fValue += cf.amount / exp;
                fDerivative -= (years * cf.amount) / (exp * (1 + x0));
            }

            const x1 = x0 - fValue / fDerivative;
            if (Math.abs(x1 - x0) < tol) return x1;
            x0 = x1;
        }
        return null; 
    },

    generateWealthHistory: (transactions) => {
        const timeline = {};
        let cumulativeInvested = 0;
        const sorted = [...transactions].sort((a, b) => new Date(a.date) - new Date(b.date));
        
        if(sorted.length === 0) return [];

        sorted.forEach(tx => {
            const date = tx.date.substring(0, 7); // YYYY-MM
            const amt = (parseFloat(tx.qty) * parseFloat(tx.price));
            
            if(tx.type === 'BUY') cumulativeInvested += amt;
            if(tx.type === 'SELL') cumulativeInvested -= amt;

            timeline[date] = cumulativeInvested;
        });

        return Object.keys(timeline).map(d => ({ date: d, value: timeline[d] }));
    },

    calculateHealthScore: (portfolio) => {
        let score = 100;
        
        const assets = portfolio.filter(a => !a.isLiability);
        const liabilities = portfolio.filter(a => a.isLiability);

        const totalAssets = assets.reduce((sum, a) => sum + a.currentValue, 0);
        const totalDebt = liabilities.reduce((sum, a) => sum + a.currentValue, 0);
        const netWorth = totalAssets - totalDebt;

        if (totalAssets === 0) return 0;

        // 1. Concentration Risk
        const maxAsset = Math.max(...assets.map(a => a.currentValue));
        const concentration = maxAsset / totalAssets;
        if (concentration > 0.5) score -= 20;
        if (concentration > 0.8) score -= 20;

        // 2. Diversification (Asset Types)
        const types = new Set(assets.map(a => a.type));
        if (types.size < 3) score -= 15;

        // 3. Cash Drag / Emergency Fund
        const cash = assets.find(a => a.type === 'CASH');
        const cashRatio = cash ? cash.currentValue / totalAssets : 0;
        if (cashRatio < 0.05) score -= 10; 
        if (cashRatio > 0.40) score -= 10; 

        // 4. Debt Ratio (New)
        const debtRatio = totalAssets > 0 ? totalDebt / totalAssets : 0;
        if (debtRatio > 0.5) score -= 20;
        if (debtRatio > 0.8) score -= 20;

        // 5. Crypto/High Volatility Exposure (New)
        const crypto = assets.filter(a => a.type === 'CRYPTO').reduce((s,a) => s + a.currentValue, 0);
        if (totalAssets > 0 && (crypto / totalAssets) > 0.25) score -= 5;

        return Math.max(0, score);
    },

    calculateGoalProgress: (goals, portfolio, totalWealth) => {
        return goals.map(goal => {
            let currentAmount = 0;
            
            // If goal has specific linked assets, sum them up
            if (goal.linkedAssets && goal.linkedAssets.length > 0) {
                goal.linkedAssets.forEach(assetId => {
                    const asset = portfolio.find(p => p.id === assetId);
                    if (asset) currentAmount += asset.currentValue;
                });
            } else {
                // Default to total wealth if no links
                currentAmount = totalWealth;
            }
            
            return {
                ...goal,
                currentAmount,
                progress: Math.min(100, (currentAmount / goal.targetAmount) * 100)
            };
        });
    }
};