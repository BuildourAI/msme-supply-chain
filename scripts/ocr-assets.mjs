/**
 * Put the photograph reader's assets where the app can serve them.
 *
 * tesseract.js fetches its wasm core and its language data from a CDN by
 * default, at the moment somebody uploads a photograph. That is the wrong
 * moment and the wrong place for three reasons: a factory's connection is the
 * thing least worth relying on, a corporate proxy will often refuse it
 * outright, and an owner has not agreed to a request going anywhere when they
 * were told the reading happens on their device.
 *
 * So the files are copied out of node_modules into `public/ocr/` and served
 * from the same origin as the app. They are not committed — thirteen megabytes
 * of wasm has no business in git — which is why this runs on install and again
 * before every build.
 *
 *   node scripts/ocr-assets.mjs
 */
import { copyFileSync, existsSync, mkdirSync, readdirSync, statSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const out = join(root, 'public', 'ocr')
const mod = (...p) => join(root, 'node_modules', ...p)

/*
 * The integer-quantised "best" model rather than "fast". Three megabytes
 * against one, and the difference shows on exactly the input this is for: a
 * printed quotation photographed at an angle under a tube light.
 */
const LANG = ['@tesseract.js-data', 'eng', '4.0.0_best_int', 'eng.traineddata.gz']

function copy(from, name) {
  if (!existsSync(from)) return false
  copyFileSync(from, join(out, name))
  return true
}

mkdirSync(out, { recursive: true })

let copied = 0
let bytes = 0

/*
 * The LSTM cores, in the single-file build tesseract actually asks for.
 *
 * Three variants rather than one because it detects at runtime what this
 * browser can run — plain, SIMD, relaxed SIMD — and a machine only ever fetches
 * the one it picked. Left out: the legacy engine, which nothing here uses, and
 * the split `.js` + `.wasm` pairs, which v7 never requests. Copying everything
 * takes 47 MB; this takes 14, of which a browser downloads one file of about
 * four, once, and then has it cached.
 */
const KEEP = /^tesseract-core(-relaxedsimd|-simd)?-lstm\.wasm\.js$/
const core = mod('tesseract.js-core')
if (existsSync(core)) {
  for (const f of readdirSync(core)) {
    if (!KEEP.test(f)) continue
    if (copy(join(core, f), f)) { copied += 1; bytes += statSync(join(core, f)).size }
  }
}

if (copy(mod('tesseract.js', 'dist', 'worker.min.js'), 'worker.min.js')) copied += 1

if (copy(mod(...LANG), 'eng.traineddata.gz')) {
  copied += 1
  bytes += statSync(mod(...LANG)).size
}

if (copied === 0) {
  // not fatal. The app checks for these at runtime and offers the keyboard
  // instead, so a build without them is a build without photograph reading.
  console.warn('ocr-assets: nothing copied — reading photographs will be offered as unavailable.')
} else {
  console.log(`ocr-assets: ${copied} files, ${(bytes / 1e6).toFixed(1)} MB into public/ocr/`)
}
