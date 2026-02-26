/**
 * 📊 Haggler Order Monitor
 * 
 * Watches the x402 Core API for order status updates.
 * Designed to run during a hackathon demo — shows payments landing live.
 * 
 * Run: node src/watch-orders.js <merchant_id>
 */

import 'dotenv/config'
import { GoatX402Client } from 'goatx402-sdk-server'
import { ADMIN_URL, seller } from './config.js'

const merchantId = process.argv[2] || seller.merchantId || 'hackathon_test'

const x402 = new GoatX402Client({
  baseUrl:   ADMIN_URL,
  apiKey:    seller.apiKey,
  apiSecret: seller.apiSecret,
})

const POLL_MS = 4000
const seen = new Map()  // orderId → last known status

function explorerLink(hash) {
  return hash ? `https://explorer.testnet3.goat.network/tx/${hash}` : ''
}

const STATUS_ICON = {
  CHECKOUT_VERIFIED:  '⏳',
  PAYMENT_CONFIRMED:  '✅',
  INVOICED:           '🧾',
  EXPIRED:            '💨',
  CANCELLED:          '❌',
  FAILED:             '🔴',
}

async function fetchOrders() {
  // Use admin API to list recent orders for the merchant
  const url = `${ADMIN_URL}/admin/orders?merchant_id=${merchantId}&limit=20`
  const res = await fetch(url, {
    headers: { 'Authorization': `Bearer ${process.env.ADMIN_TOKEN || 'ef6tnECBW6d0'}` }
  })
  if (!res.ok) return null
  return res.json()
}

async function poll() {
  const data = await fetchOrders().catch(() => null)
  if (!data?.orders) return

  for (const order of data.orders) {
    const prev = seen.get(order.order_id)

    if (!prev) {
      // New order
      seen.set(order.order_id, order.status)
      const icon = STATUS_ICON[order.status] || '❓'
      const ts = new Date().toISOString().slice(11, 19)
      console.log(`\n[${ts}] ${icon} NEW ORDER: ${order.order_id.slice(0, 8)}...`)
      console.log(`  Status:  ${order.status}`)
      console.log(`  Amount:  ${Number(order.amount_wei) / 1e6} USDC`)
      console.log(`  From:    ${order.from_address?.slice(0, 12)}...`)
      console.log(`  Chain:   ${order.chain_id}`)
      continue
    }

    if (prev !== order.status) {
      // Status changed!
      seen.set(order.order_id, order.status)
      const icon = STATUS_ICON[order.status] || '❓'
      const ts = new Date().toISOString().slice(11, 19)
      console.log(`\n[${ts}] ${icon} STATUS UPDATE: ${order.order_id.slice(0, 8)}...`)
      console.log(`  ${prev} → ${order.status}`)
      console.log(`  Amount:  ${Number(order.amount_wei) / 1e6} USDC`)
      if (order.tx_hash) {
        console.log(`  TX:      ${order.tx_hash}`)
        console.log(`  🔗      ${explorerLink(order.tx_hash)}`)
      }
    }
  }
}

console.log('═'.repeat(55))
console.log('  📊 Haggler Order Monitor — Live Payment Feed')
console.log('═'.repeat(55))
console.log(`  Merchant: ${merchantId}`)
console.log(`  API:      ${ADMIN_URL}`)
console.log(`  Refresh:  every ${POLL_MS / 1000}s`)
console.log('═'.repeat(55))
console.log()

// Initial load
const init = await fetchOrders()
if (init?.orders) {
  init.orders.forEach(o => seen.set(o.order_id, o.status))
  console.log(`[init] Tracking ${seen.size} existing orders — watching for changes...\n`)
} else {
  console.log(`[init] Could not reach order API — check ADMIN_TOKEN\n`)
}

setInterval(poll, POLL_MS)
