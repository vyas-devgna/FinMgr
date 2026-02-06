const Finance = {
    
    // Calculate Portfolio Summary: Merges Assets + Txs to get current standing
    computePortfolio: (assets, transactions) => {
        const summary = assets.map(asset => {
            const assetTxs = transactions.filter(t => t.assetId === asset.id);
            
            let units = 0;
            let totalCost = 0; // Net invested amount
            let totalIncome = 0;
            let costBasis = 0;

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
                    totalIncome += (qty * price); // In dividend tx, qty might be 1 and price is amount
                }
            });

            const currentPrice = parseFloat(asset.currentPrice || 0);
            const currentValue = units * currentPrice;
            const absoluteReturn = currentValue - totalCost; // Simplified P/L
            const returnPct = totalCost > 0 ? (absoluteReturn / totalCost) * 100 : 0;

            return {
                ...asset,
                units,
                totalCost,
                currentValue,
                totalIncome,
                absoluteReturn,
                returnPct
            };
        });

        return summary;
    },

    // XIRR Calculation using Newton-Raphson method
    xirr: (transactions, currentPortfolioValue) => {
        // Prepare cashflows: Date and Amount. 
        // Buys are negative (outflow), Sells/Dividends are positive (inflow).
        // Current Value is a positive inflow happening TODAY.
        
        const cashflows = [];
        
        transactions.forEach(tx => {
            const date = new Date(tx.date);
            const amt = (parseFloat(tx.qty) * parseFloat(tx.price)) + parseFloat(tx.fees || 0);
            
            if (tx.type === 'BUY') {
                cashflows.push({ date, amount: -amt });
            } else {
                cashflows.push({ date, amount: amt }); // Sell or Dividend
            }
        });

        // Add terminal value
        cashflows.push({ date: new Date(), amount: currentPortfolioValue });

        if (cashflows.length < 2) return 0;

        const xirrValue = Finance.calculateXIRR(cashflows);
        return isNaN(xirrValue) ? 0 : xirrValue * 100;
    },

    calculateXIRR: (cashflows, guess = 0.1) => {
        const maxIter = 100;
        const tol = 1e-6;
        let x0 = guess;

        // Sort by date
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
        return null; // Failed to converge
    },

    // Helper: Generate historical wealth points for chart
    generateWealthHistory: (transactions) => {
        // Group by month
        const timeline = {};
        let cumulativeInvested = 0;

        // Sort txs
        const sorted = [...transactions].sort((a, b) => new Date(a.date) - new Date(b.date));
        
        if(sorted.length === 0) return [];

        // Basic approximation: Accumulate invested capital over time
        // (Real wealth history requires historical prices which we don't have offline easily)
        // We will plot "Invested Capital" vs "Now"
        
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
        const totalValue = portfolio.reduce((sum, a) => sum + a.currentValue, 0);
        if (totalValue === 0) return 0;

        // Penalize for concentration
        const maxAsset = Math.max(...portfolio.map(a => a.currentValue));
        const concentration = maxAsset / totalValue;
        
        if (concentration > 0.5) score -= 20;
        if (concentration > 0.8) score -= 20;

        // Penalize for lack of asset types
        const types = new Set(portfolio.map(a => a.type));
        if (types.size < 3) score -= 15;

        // Reward for cash buffer
        const cash = portfolio.find(a => a.type === 'CASH');
        const cashRatio = cash ? cash.currentValue / totalValue : 0;
        if (cashRatio < 0.05) score -= 10; // Too little cash
        if (cashRatio > 0.40) score -= 10; // Too much cash drag

        return Math.max(0, score);
    }
};