/**
 * 👀 Live USDC Transfer Watcher — GOAT Testnet3
 * 
 * Polls the GOAT explorer API for new USDC transfers
 * and prints them in real-time to the terminal.
 * 
 * Run: node src/watch-tx.js
 * Run: node src/watch-tx.js <wallet_address>   (filter by address)
 */

import { USDC, CHAIN_ID } from './config.js'

const EXPLORER   = 'https://explorer.testnet3.goat.network'
const USDT       = '0xdce0af57e8f2ce957b3838cd2a2f3f3677965dd3'
const POLL_MS    = 3000

const filterAddr = process.argv[2]?.toLowerCase()

// Track seen txs
const seen = new Set()
let isFirst = true

function fmt(wei, decimals = 6) {
  return (Number(wei) / Math.pow(10, Number(decimals))).toFixed(4)
}

function shortAddr(addr) {
  return addr ? `${addr.slice(0, 8)}...${addr.slice(-6)}` : '?'
}

function explorerLink(hash) {
  return `https://explorer.testnet3.goat.network/tx/${hash}`
}

async function fetchTransfers(tokenAddr) {
  const url = `${EXPLORER}/api/v2/token-transfers?token_address=${tokenAddr}`
  const res = await fetch(url)
  if (!res.ok) return []
  const data = await res.json()
  return data.items || []
}

async function poll() {
  try {
    const [usdcTxs, usdtTxs] = await Promise.all([
      fetchTransfers(USDC),
      fetchTransfers(USDT),
    ])

    const all = [...usdcTxs, ...usdtTxs]
      .filter(t => {
        if (seen.has(t.tx_hash)) return false
        if (filterAddr) {
          const from = t.from?.hash?.toLowerCase()
          const to   = t.to?.hash?.toLowerCase()
          return from === filterAddr || to === filterAddr
        }
        return true
      })
      .sort((a, b) => b.block_number - a.block_number)

    for (const tx of all) {
      seen.add(tx.tx_hash)
      if (isFirst) continue  // skip existing txs on startup

      const symbol   = tx.token?.symbol || '???'
      const amount   = fmt(tx.total?.value, tx.total?.decimals)
      const from     = shortAddr(tx.from?.hash)
      const to       = shortAddr(tx.to?.hash)
      const block    = tx.block_number
      const hash     = tx.tx_hash

      const ts = new Date().toISOString().slice(11, 19)

      console.log(`\n[${ts}] 💸 NEW ${symbol} TRANSFER`)
      console.log(`  Block:  #${block}`)
      console.log(`  From:   ${from}`)
      console.log(`  To:     ${to}`)
      console.log(`  Amount: ${amount} ${symbol}`)
      console.log(`  TX:     ${hash}`)
      console.log(`  🔗     ${explorerLink(hash)}`)
    }

    if (isFirst) {
      console.log(`\n[init] Loaded ${seen.size} existing txs — watching for new ones...\n`)
      isFirst = false
    }
  } catch (err) {
    console.error(`[poll error] ${err.message}`)
  }
}

// Banner
console.log('═'.repeat(55))
console.log('  👀 GOAT Testnet3 — Live USDC/USDT Transfer Watcher')
console.log('═'.repeat(55))
console.log(`  Chain:   ${CHAIN_ID} (GOAT Testnet3)`)
console.log(`  USDC:    ${USDC}`)
console.log(`  USDT:    ${USDT}`)
if (filterAddr) console.log(`  Filter:  ${filterAddr}`)
console.log(`  Refresh: every ${POLL_MS / 1000}s`)
console.log('═'.repeat(55))

// Poll loop
poll()
setInterval(poll, POLL_MS)
