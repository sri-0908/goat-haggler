import express from 'express';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const app = express();
app.use(express.json());
app.use(express.static(join(__dirname, '../public')));

const PORT = process.env.PORT || 3000;
let logs = [];
let state = {
    portfolioValue: 11441.89,
    activeProtocol: 'Uniswap',
    currentAPY: '15.24',
    drawdown: '0.00',
    peak: 11441.89,
    reputationScore: 95,
    feeDiscount: 25,
    marketYields: [
        { name: 'Uniswap', apy: 0.1524, best: true },
        { name: 'Lombard', apy: 0.1186, best: false },
        { name: 'Pendle', apy: 0.1084, best: false },
        { name: 'Babylon', apy: 0.0892, best: false },
        { name: 'Aave', apy: 0.0650, best: false }
    ],
    negotiations: [],
    transactions: [],
    wallet: { address: null, balance: '0.00', network: 'GOAT Network Testnet3', status: 'Disconnected', txCount: 0 }
};

app.post('/log', (req, res) => {
    const logEntry = {
        timestamp: new Date().toISOString(),
        ...req.body
    };
    logs.unshift(logEntry);
    if (logs.length > 100) logs.pop();
    
    // Update state based on log from yield-agent
    if (req.body.portfolio) {
        state.portfolioValue = req.body.portfolio.current;
        state.peak = req.body.portfolio.peak;
        state.activeProtocol = req.body.portfolio.activeProtocol || state.activeProtocol;
        const dd = ((state.peak - state.portfolioValue) / state.peak) * 100;
        state.drawdown = Math.max(0, dd).toFixed(2);
    }
    if (req.body.market) {
        const entries = Object.entries(req.body.market).sort((a,b) => b[1]-a[1]);
        state.marketYields = entries.map(([name, apy], i) => ({
            name, apy, best: i === 0
        }));
        if (state.activeProtocol && req.body.market[state.activeProtocol]) {
            state.currentAPY = (req.body.market[state.activeProtocol] * 100).toFixed(2);
        }
    }
    
    console.log(`[Dashboard Log] ${req.body.action}`);
    res.status(200).json({ success: true });
});

app.post('/negotiation', (req, res) => {
    state.negotiations.unshift({
        timestamp: new Date().toISOString(),
        ...req.body
    });
    console.log(`[Dashboard Neg] ${req.body.protocol} - Savings: ${req.body.savingsUsdc || 0} USDC`);
    res.status(200).json({ success: true });
});

app.post('/transaction', (req, res) => {
    state.transactions.unshift({
        timestamp: new Date().toISOString(),
        ...req.body
    });
    console.log(`[Dashboard Tx] ${req.body.txHash}`);
    res.status(200).json({ success: true });
});

app.post('/api/wallet', (req, res) => {
    state.wallet = { ...state.wallet, ...req.body };
    console.log(`[Dashboard Wallet] ${state.wallet.address} - ${state.wallet.status}`);
    res.status(200).json({ success: true });
});

app.get('/api/logs', (req, res) => {
    if (logs.length === 0) {
        return res.json([
            { timestamp: new Date().toISOString(), action: 'STARTUP', reasoning: 'APEX agent initialized. Scanning 5 BTCFi protocols...' },
            { timestamp: new Date().toISOString(), action: 'VERIFIED', reasoning: 'ERC-8004 reputation verified. Score: 95/100. Preferred partner status active.' },
            { timestamp: new Date().toISOString(), action: 'HOLDING', reasoning: 'Best yield detected: Uniswap at 15.24% APY. HOLDING current position.' }
        ]);
    }
    res.json(logs);
});
app.get('/api/state', (req, res) => res.json(state));

app.listen(PORT, '0.0.0.0', () => {
    console.log(`\n📊 APEX Protocol Dashboard running on http://0.0.0.0:${PORT}`);
});
