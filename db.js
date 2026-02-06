// IndexedDB Wrapper for WealthVault
const DB_NAME = 'wealthvault_db';
const DB_VERSION = 1;

const db = {
    instance: null,

    init: () => {
        return new Promise((resolve, reject) => {
            const request = indexedDB.open(DB_NAME, DB_VERSION);

            request.onupgradeneeded = (e) => {
                const d = e.target.result;
                // Assets Store: id, name, type, currentPrice, targetAllocation
                if (!d.objectStoreNames.contains('assets')) {
                    d.createObjectStore('assets', { keyPath: 'id', autoIncrement: true });
                }
                // Transactions Store: id, assetId, type, date, qty, price, fees
                if (!d.objectStoreNames.contains('transactions')) {
                    const txStore = d.createObjectStore('transactions', { keyPath: 'id', autoIncrement: true });
                    txStore.createIndex('assetId', 'assetId', { unique: false });
                    txStore.createIndex('date', 'date', { unique: false });
                }
                // Goals Store
                if (!d.objectStoreNames.contains('goals')) {
                    d.createObjectStore('goals', { keyPath: 'id', autoIncrement: true });
                }
                // Snapshots for historical graph
                if (!d.objectStoreNames.contains('snapshots')) {
                    d.createObjectStore('snapshots', { keyPath: 'date' });
                }
            };

            request.onsuccess = (e) => {
                db.instance = e.target.result;
                resolve(db.instance);
            };

            request.onerror = (e) => reject(e);
        });
    },

    // Generic transaction helper
    tx: (storeName, mode) => db.instance.transaction(storeName, mode).objectStore(storeName),

    getAll: (storeName) => {
        return new Promise((resolve, reject) => {
            const req = db.tx(storeName, 'readonly').getAll();
            req.onsuccess = () => resolve(req.result);
            req.onerror = () => reject(req.error);
        });
    },

    add: (storeName, item) => {
        return new Promise((resolve, reject) => {
            const req = db.tx(storeName, 'readwrite').add(item);
            req.onsuccess = () => resolve(req.result); // Returns ID
            req.onerror = () => reject(req.error);
        });
    },

    update: (storeName, item) => {
        return new Promise((resolve, reject) => {
            const req = db.tx(storeName, 'readwrite').put(item);
            req.onsuccess = () => resolve(req.result);
            req.onerror = () => reject(req.error);
        });
    },

    delete: (storeName, id) => {
        return new Promise((resolve, reject) => {
            const req = db.tx(storeName, 'readwrite').delete(id);
            req.onsuccess = () => resolve();
            req.onerror = () => reject(req.error);
        });
    },

    clear: (storeName) => {
         return new Promise((resolve, reject) => {
            const req = db.tx(storeName, 'readwrite').clear();
            req.onsuccess = () => resolve();
            req.onerror = () => reject(req.error);
        });
    },

    // Specialized queries
    getTransactionsByAsset: (assetId) => {
        return new Promise((resolve, reject) => {
            const t = db.instance.transaction('transactions', 'readonly');
            const store = t.objectStore('transactions');
            const index = store.index('assetId');
            const req = index.getAll(parseInt(assetId));
            req.onsuccess = () => resolve(req.result);
            req.onerror = () => reject(req.error);
        });
    },

    // Backup/Restore
    exportData: async () => {
        const assets = await db.getAll('assets');
        const transactions = await db.getAll('transactions');
        const goals = await db.getAll('goals');
        return JSON.stringify({ assets, transactions, goals, date: new Date().toISOString() });
    },

    importData: async (jsonString) => {
        try {
            const data = JSON.parse(jsonString);
            if (!data.assets || !data.transactions) throw new Error("Invalid Backup File");
            
            // Wipe existing
            await db.clear('assets');
            await db.clear('transactions');
            await db.clear('goals');
            await db.clear('snapshots');

            // Restore
            const tx = db.instance.transaction(['assets', 'transactions', 'goals'], 'readwrite');
            data.assets.forEach(i => tx.objectStore('assets').add(i));
            data.transactions.forEach(i => tx.objectStore('transactions').add(i));
            if(data.goals) data.goals.forEach(i => tx.objectStore('goals').add(i));
            
            return new Promise((resolve) => {
                tx.oncomplete = () => resolve(true);
            });
        } catch (e) {
            console.error(e);
            return false;
        }
    }
};