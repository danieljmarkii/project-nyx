#!/usr/bin/env node
// Regenerate the static vet-report brand QR matrix embedded in
// supabase/functions/generate-report/render.ts (GETCULPRIT_QR).
//
// The report links vets to getculprit.app so they can learn about Culprit (the
// distribution wedge). That URL is the SAME on every report, so we encode the QR
// once here and paste the module matrix into render.ts as a constant — the Edge
// Function then needs no runtime QR dependency.
//
// Usage:  node scripts/gen-report-qr.mjs [url]
//   (requires `npm i -D qrcode`, or run in a scratch dir with qrcode installed)
//
// Paste the printed JSON array into GETCULPRIT_QR. If the URL changes (e.g. to
// getculprit.app/vets), update DEFAULT_URL and re-run.

import QR from 'qrcode'

const DEFAULT_URL = 'https://getculprit.app'
const url = process.argv[2] ?? DEFAULT_URL

// Level "Q" (~25% recovery) — robust to print smudging when a vet scans off paper.
const q = QR.create(url, { errorCorrectionLevel: 'Q' })
const size = q.modules.size
const data = q.modules.data
const rows = []
for (let y = 0; y < size; y++) {
  let r = ''
  for (let x = 0; x < size; x++) r += data[y * size + x] ? '1' : '0'
  rows.push(r)
}

console.log(`// Source: ${JSON.stringify(url)}, errorCorrectionLevel "Q", ${size}×${size} modules.`)
console.log('const GETCULPRIT_QR: readonly string[] = [')
for (const r of rows) console.log(`  '${r}',`)
console.log(']')
