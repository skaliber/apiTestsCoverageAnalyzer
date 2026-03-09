#!/usr/bin/env node
/**
 * docs-check.js
 *
 * Validates documentation correctness before build. Fails with a non-zero
 * exit code if any of the following are true:
 *
 *   - A sidebar entry in docs/.vitepress/config.mts links to a page that has
 *     no corresponding .md file under docs/
 *   - An internal Markdown link (relative or absolute) within any docs page
 *     resolves to a .md file that does not exist
 *   - An image reference within a docs page points to a file that does not
 *     exist under docs/
 *   - docs/public/logo.svg is missing (logo is referenced in VitePress config)
 *
 * Usage:
 *   node scripts/docs-check.js
 *
 * Run as part of the docs:check npm script:
 *   npm run docs:check
 */

'use strict'

const fs = require('fs')
const path = require('path')

// ─── Paths ──────────────────────────────────────────────────────────────────

const ROOT = path.resolve(__dirname, '..')
const DOCS_DIR = path.join(ROOT, 'docs')
const CONFIG_FILE = path.join(DOCS_DIR, '.vitepress', 'config.mts')
const PUBLIC_DIR = path.join(DOCS_DIR, 'public')

// ─── Helpers ─────────────────────────────────────────────────────────────────

/** Recursively collect all .md files under a directory. */
function collectMdFiles(dir) {
  const results = []
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory() && !entry.name.startsWith('.')) {
      results.push(...collectMdFiles(full))
    } else if (entry.isFile() && entry.name.endsWith('.md')) {
      results.push(full)
    }
  }
  return results
}

/**
 * Convert a VitePress route link (e.g. '/guide/getting-started') to the
 * expected .md file path under docs/. Handles cleanUrls: the link without
 * extension maps to either <link>.md or <link>/index.md.
 */
function routeToMdPath(link) {
  // Strip trailing slash
  const stripped = link.replace(/\/$/, '')
  // Absolute VitePress links start with /
  const rel = stripped.startsWith('/') ? stripped.slice(1) : stripped

  const candidates = [
    path.join(DOCS_DIR, rel + '.md'),
    path.join(DOCS_DIR, rel, 'index.md'),
  ]
  return candidates
}

/** Check whether any candidate path exists. */
function anyExists(paths) {
  return paths.some((p) => fs.existsSync(p))
}

/** Report an error and set the failure flag. */
let failed = false
function error(msg) {
  console.error(`  ✗ ${msg}`)
  failed = true
}

// ─── 1. Parse sidebar links from config.mts ─────────────────────────────────

console.log('\n📋 Checking sidebar entries …')

const configSource = fs.readFileSync(CONFIG_FILE, 'utf8')

// Extract all link: '…' values from the config (simple regex is sufficient
// given the known, hand-maintained structure of config.mts).
const linkPattern = /link:\s*'([^']+)'/g
const sidebarLinks = []
let m
while ((m = linkPattern.exec(configSource)) !== null) {
  sidebarLinks.push(m[1])
}

for (const link of sidebarLinks) {
  // Skip external links and anchors
  if (link.startsWith('http') || link.startsWith('#')) continue
  const candidates = routeToMdPath(link)
  if (!anyExists(candidates)) {
    error(`Sidebar link "${link}" → no matching .md file found (tried: ${candidates.map(p => path.relative(ROOT, p)).join(', ')})`)
  }
}

if (!failed) {
  console.log(`  ✓ All ${sidebarLinks.filter(l => !l.startsWith('http') && !l.startsWith('#')).length} sidebar links are valid.`)
}

// ─── 2. Validate internal links in every .md file ────────────────────────────

console.log('\n🔗 Checking internal Markdown links …')

const mdFiles = collectMdFiles(DOCS_DIR)
let internalLinkErrors = 0

/**
 * Strip fenced code blocks (``` ... ```) and inline code spans (` ... `) from
 * Markdown source so that example code inside docs is not scanned for real
 * link targets.
 */
function stripCodeBlocks(source) {
  // Strip fenced code blocks first (multiline)
  let result = source.replace(/```[\s\S]*?```/g, (match) => ' '.repeat(match.length))
  // Strip inline code spans (single backtick, non-greedy)
  result = result.replace(/`[^`\n]+`/g, (match) => ' '.repeat(match.length))
  return result
}

// Matches [text](url) but NOT ![text](url) (image refs handled separately)
const mdLinkPattern = /(?<!!)\[([^\]]*)\]\(([^)]+)\)/g

for (const mdFile of mdFiles) {
  const rawSource = fs.readFileSync(mdFile, 'utf8')
  const source = stripCodeBlocks(rawSource)
  const relFile = path.relative(ROOT, mdFile)
  let lm
  while ((lm = mdLinkPattern.exec(source)) !== null) {
    const href = lm[2].split('#')[0].trim() // strip fragment
    if (!href) continue
    // Skip external links
    if (href.startsWith('http://') || href.startsWith('https://')) continue

    let targetPath
    if (href.startsWith('/')) {
      // Absolute VitePress path (e.g. /guide/installation)
      const rel = href.slice(1)
      // May or may not have .md extension
      const base = rel.replace(/\.md$/, '')
      const candidates = [
        path.join(DOCS_DIR, base + '.md'),
        path.join(DOCS_DIR, base, 'index.md'),
      ]
      if (!anyExists(candidates)) {
        error(`${relFile}: broken absolute link "${href}" → no matching file (tried: ${candidates.map(p => path.relative(ROOT, p)).join(', ')})`)
        internalLinkErrors++
      }
    } else if (href.startsWith('./') || href.startsWith('../')) {
      // Relative path from the current .md file's directory
      const baseDir = path.dirname(mdFile)
      // Normalise: add .md only for non-asset paths (no extension = doc page)
      const hasExt = /\.\w+$/.test(href)
      const resolved = path.resolve(baseDir, href)
      const resolvedMd = hasExt ? resolved : resolved + '.md'
      const resolvedIndex = path.resolve(baseDir, href, 'index.md')
      if (!fs.existsSync(resolved) && !fs.existsSync(resolvedMd) && !fs.existsSync(resolvedIndex)) {
        error(`${relFile}: broken relative link "${href}" → ${path.relative(ROOT, resolved)} not found`)
        internalLinkErrors++
      }
    }
    // Ignore bare fragment links (#section) and external URLs already skipped
  }
}

if (internalLinkErrors === 0) {
  console.log(`  ✓ All internal Markdown links are valid.`)
}

// ─── 3. Validate image references in .md files ───────────────────────────────

console.log('\n🖼  Checking image references …')

// Matches ![alt](path) in Markdown
const imgPattern = /!\[([^\]]*)\]\(([^)]+)\)/g
let imageErrors = 0

for (const mdFile of mdFiles) {
  const rawSource = fs.readFileSync(mdFile, 'utf8')
  const source = stripCodeBlocks(rawSource)
  const relFile = path.relative(ROOT, mdFile)
  let im
  while ((im = imgPattern.exec(source)) !== null) {
    const src = im[2].split('#')[0].trim()
    if (!src) continue
    // Skip external image URLs
    if (src.startsWith('http://') || src.startsWith('https://')) continue

    if (src.startsWith('/')) {
      // Absolute path — resolve against docs/public first, then docs/
      const candidates = [
        path.join(PUBLIC_DIR, src.slice(1)),
        path.join(DOCS_DIR, src.slice(1)),
      ]
      if (!anyExists(candidates)) {
        error(`${relFile}: broken absolute image reference "${src}"`)
        imageErrors++
      }
    } else if (src.startsWith('./') || src.startsWith('../')) {
      const baseDir = path.dirname(mdFile)
      const resolved = path.resolve(baseDir, src)
      if (!fs.existsSync(resolved)) {
        error(`${relFile}: broken relative image reference "${src}" → ${path.relative(ROOT, resolved)} not found`)
        imageErrors++
      }
    }
  }
}

if (imageErrors === 0) {
  console.log(`  ✓ All image references are valid.`)
}

// ─── 4. Verify required public assets ────────────────────────────────────────

console.log('\n📁 Checking required public assets …')

const requiredAssets = [
  path.join(PUBLIC_DIR, 'logo.svg'),
]

for (const asset of requiredAssets) {
  if (!fs.existsSync(asset)) {
    error(`Required asset missing: ${path.relative(ROOT, asset)}`)
  }
}

const missingAssets = requiredAssets.filter((a) => !fs.existsSync(a))
if (missingAssets.length === 0) {
  console.log(`  ✓ All required public assets are present.`)
}

// ─── Summary ─────────────────────────────────────────────────────────────────

console.log()
if (failed) {
  console.error('❌ docs-check failed. Fix the errors above before building.\n')
  process.exit(1)
} else {
  console.log('✅ docs-check passed. All links and assets look good.\n')
}
