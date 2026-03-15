import { negotiate } from './buyer.js';

const DASHBOARD_URL = 'http://localhost:3000';

let portfolio = { peak: 10000, current: 10000, activeProtocol: null };
let isPaused = false;
let connectedWallet = null;
let market = { 'Aave': 0.04, 'Babylon': 0.045, 'Pendle': 0.05, 'Lombard': 0.048, 'Uniswap': 0.055 };

const PROTOCOL_IDS = {
    'Aave': 'yield-aave', 'Babylon': 'yield-babylon', 'Pendle': 'yield-pendle',
    'Lombard': 'yield-lombard', 'Uniswap': 'yield-uniswap'
};

const REBALANCE_THRESHOLD = 0.005; 
const DRAWDOWN_LIMIT = 0.10;

async function postApi(path, data) {
    try {
        await fetch(`${DASHBOARD_URL}${path}`, {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data)
        });
    } catch(e) {}
}

async function logDecision(action, reasoning) {
    const walletLabel = connectedWallet ? `[Wallet: ${connectedWallet.slice(0,6)}...${connectedWallet.slice(-4)}] ` : '';
    console.log(`\n🤖 [APEX] ${walletLabel}${action}\n   ${reasoning}`);
    await postApi('/log', { 
        action, 
        reasoning, 
        portfolio: { ...portfolio }, 
        market: { ...market },
        walletAddress: connectedWallet 
    });
}

function simulateMarketTick() {
    for (let p in market) {
        market[p] = Math.max(0.01, market[p] + (Math.random() - 0.5) * 0.015); 
    }
    if (portfolio.activeProtocol) {
        const yieldEarned = portfolio.current * (market[portfolio.activeProtocol] / 365 / 24 / 12);
        portfolio.current += yieldEarned + (portfolio.current * (Math.random() - 0.45) * 0.01);
    } else {
        portfolio.current += portfolio.current * (Math.random() - 0.5) * 0.01;
    }
    if (portfolio.current > portfolio.peak) portfolio.peak = portfolio.current;
}

async function startRebalance(newProtocol) {
    const itemId = PROTOCOL_IDS[newProtocol];
    await logDecision('NEGOTIATING', `Initiating X402 negotiation for ${newProtocol} via agent reputation.`);
    
    try {
        // Base price of yield positions is 0.2 USDC (200000)
        const budget = 200000;
        const result = await negotiate({ itemId, budget, mockReputation: 'trusted' });
        
        if (result.result === 'accepted') {
            const savingsUsdc = (budget - result.amountWei) / 1e6;
            
            await postApi('/negotiation', {
                protocol: newProtocol,
                success: true,
                paidUsdc: result.amountUsdc,
                savingsUsdc: savingsUsdc,
                reputationBonus: result.reputationBonus
            });
            
            // Generate a random tx hash
            const txHash = '0x' + Array.from({length:64}, () => Math.floor(Math.random()*16).toString(16)).join('');
            await postApi('/transaction', {
                type: `ENTER_${newProtocol.toUpperCase()}`, protocol: newProtocol, amount: portfolio.current, txHash
            });

            portfolio.activeProtocol = newProtocol;
            await logDecision('REBALANCE_SUCCESS', `Entered ${newProtocol}. Paid ${result.amountUsdc} USDC. Saved ${savingsUsdc.toFixed(2)} USDC via ${result.reputationBonus}% ERC-8004 discount.`);
        } else {
            await postApi('/negotiation', { protocol: newProtocol, success: false, reason: result.reason || 'price too high' });
            await logDecision('NEGOTIATION_FAILED', `Failed to enter ${newProtocol}: ${result.reason || 'price too high'}`);
        }
    } catch (e) {
        await logDecision('ERROR', `Negotiation error: ${e.message}`);
    }
}

async function agentLoop() {
    try {
        if (isPaused) return;

        // Fetch wallet from dashboard state
        const stateRes = await fetch(`${DASHBOARD_URL}/api/state`);
        const state = await stateRes.json();
        if (state.wallet && state.wallet.address) {
            connectedWallet = state.wallet.address;
        }

        simulateMarketTick();

        const drawdown = (portfolio.peak - portfolio.current) / portfolio.peak;
        if (drawdown > DRAWDOWN_LIMIT) {
            isPaused = true;
            await logDecision('ERROR_DRAWDOWN_PAUSE', `Drawdown reached ${(drawdown*100).toFixed(2)}% (>10%). Halting all trading.`);
            return;
        }

        let bestProtocol = null;
        let maxApy = 0;
        for (let prot in market) {
            if (market[prot] > maxApy) {
                maxApy = market[prot];
                bestProtocol = prot;
            }
        }

        if (!portfolio.activeProtocol) {
            await logDecision('ACTION_REQUIRED', `Unallocated. Best yield: ${bestProtocol} at ${(maxApy*100).toFixed(2)}%.`);
            await startRebalance(bestProtocol);
        } else {
            const currentApy = market[portfolio.activeProtocol];
            const diff = maxApy - currentApy;
            
            if (diff > REBALANCE_THRESHOLD && bestProtocol !== portfolio.activeProtocol) {
                await logDecision('REBALANCE_TRIGGERED', `Yield diff ${(diff*100).toFixed(2)}% > 0.5% threshold. Switching ${portfolio.activeProtocol} -> ${bestProtocol}.`);
                await startRebalance(bestProtocol);
            } else {
                await logDecision('HOLDING', `Current protocol ${portfolio.activeProtocol} is optimal or diff ${(diff*100).toFixed(2)}% < 0.5% threshold.`);
            }
        }
    } catch (err) {
        console.error('\n❌ [CRASH]', err);
    }
}

const intervalMs = process.env.FAST_MODE === 'true' || process.argv.includes('--fast') ? 5000 : 300000;
console.log(`🤖 APEX Protocol started. Interval: ${intervalMs}ms`);
logDecision('STARTUP', 'BTCFi Intelligence Engine initialized. Monitoring 5 protocols.');
agentLoop();
setInterval(agentLoop, intervalMs);
