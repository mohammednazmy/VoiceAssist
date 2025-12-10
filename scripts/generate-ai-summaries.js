#!/usr/bin/env node
/**
 * AI Summary Generator Script
 *
 * Generates draft ai_summary fields for markdown documents that are missing them.
 * Extracts the first meaningful paragraph from each document as a starting point.
 *
 * Usage:
 *   node scripts/generate-ai-summaries.js                    # List docs needing summaries
 *   node scripts/generate-ai-summaries.js --generate         # Generate drafts (dry-run)
 *   node scripts/generate-ai-summaries.js --generate --apply # Apply drafts to files
 *   node scripts/generate-ai-summaries.js --priority         # Show priority categories
 *   node scripts/generate-ai-summaries.js --category api     # Filter by category
 *
 * @version 1.0.0
 * @date 2025-12-04
 */

const fs = require('fs');
const path = require('path');

// Try to load gray-matter
let matter;
try {
  matter = require('gray-matter');
} catch (e) {
  try {
    matter = require(path.join(__dirname, '..', 'apps', 'docs-site', 'node_modules', 'gray-matter'));
  } catch (e2) {
    console.error('Error: gray-matter module not found.');
    console.error('Please run: pnpm install --filter docs-site');
    process.exit(1);
  }
}

// Configuration
const CONFIG = {
  DOCS_DIR: process.env.DOCS_DIR || path.join(__dirname, '..', 'docs'),
  // Priority categories for ai_summary (higher priority first)
  PRIORITY_CATEGORIES: [
    'api',           // API documentation is critical for AI agents
    'architecture',  // Understanding system design
    'reference',     // Quick reference materials
    'operations',    // Operational runbooks
    'feature-flags', // Feature flag configuration
    'security',      // Security guidelines
    'debugging',     // Troubleshooting guides
    'planning',      // Planning documents
    'admin',         // Admin panel docs
    'testing',       // Testing guides
    'deployment',    // Deployment procedures
    'integration',   // Integration guides
    'voice',         // Voice mode documentation
  ],
  // Max characters for ai_summary
  MAX_SUMMARY_LENGTH: 300,
};

// Parse command line arguments
const args = process.argv.slice(2);
const flags = {
  generate: args.includes('--generate'),
  apply: args.includes('--apply'),
  priority: args.includes('--priority'),
  json: args.includes('--json'),
  verbose: args.includes('--verbose'),
};

// Filter by category if specified
const categoryIndex = args.indexOf('--category');
const filterCategory = categoryIndex !== -1 ? args[categoryIndex + 1] : null;

/**
 * Find all markdown files recursively
 */
function findMarkdownFiles(dir, files = []) {
  const items = fs.readdirSync(dir);

  for (const item of items) {
    const fullPath = path.join(dir, item);
    const stat = fs.statSync(fullPath);

    if (stat.isDirectory()) {
      // Skip node_modules, .git, archive, etc.
      if (!['node_modules', '.git', 'archive', 'deprecated'].includes(item)) {
        findMarkdownFiles(fullPath, files);
      }
    } else if (item.endsWith('.md') && !item.startsWith('_')) {
      files.push(fullPath);
    }
  }

  return files;
}

/**
 * Extract a draft summary from document content
 */
function extractDraftSummary(content, title) {
  // Remove frontmatter
  const contentWithoutFrontmatter = content.replace(/^---[\s\S]*?---\n*/m, '');

  // Remove the title if it's at the beginning
  const lines = contentWithoutFrontmatter.split('\n').filter(line => {
    const trimmed = line.trim();
    // Skip empty lines, headings, and code blocks at the start
    return trimmed.length > 0 && !trimmed.startsWith('#') && !trimmed.startsWith('```');
  });

  // Get first meaningful paragraph(s)
  let paragraphs = [];
  let currentParagraph = '';

  for (const line of lines) {
    const trimmed = line.trim();

    // Skip table rows, list items that are just links
    if (trimmed.startsWith('|') || trimmed.match(/^[-*]\s*\[.*\]\(.*\)$/)) {
      continue;
    }

    if (trimmed === '') {
      if (currentParagraph) {
        paragraphs.push(currentParagraph.trim());
        currentParagraph = '';
        if (paragraphs.join(' ').length >= CONFIG.MAX_SUMMARY_LENGTH) break;
      }
    } else {
      currentParagraph += ' ' + trimmed;
    }
  }

  if (currentParagraph) {
    paragraphs.push(currentParagraph.trim());
  }

  // Join paragraphs and clean up
  let summary = paragraphs.slice(0, 2).join(' ')
    .replace(/\*\*/g, '')           // Remove bold
    .replace(/\*/g, '')             // Remove italics
    .replace(/`([^`]+)`/g, '$1')    // Remove inline code
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1') // Remove links but keep text
    .replace(/\s+/g, ' ')           // Normalize whitespace
    .trim();

  // Truncate if too long
  if (summary.length > CONFIG.MAX_SUMMARY_LENGTH) {
    summary = summary.substring(0, CONFIG.MAX_SUMMARY_LENGTH - 3).trim() + '...';
  }

  return summary || `Documentation for ${title}.`;
}

/**
 * Analyze a document
 */
function analyzeDocument(filePath) {
  const content = fs.readFileSync(filePath, 'utf-8');
  const relativePath = path.relative(CONFIG.DOCS_DIR, filePath);

  let data = {};
  let contentBody = content;

  try {
    const parsed = matter(content);
    data = parsed.data;
    contentBody = parsed.content;
  } catch (e) {
    // No frontmatter or parse error
  }

  return {
    path: relativePath,
    fullPath: filePath,
    title: data.title || path.basename(filePath, '.md').replace(/_/g, ' '),
    status: data.status || 'unknown',
    category: data.category || inferCategory(relativePath),
    owner: data.owner || 'unknown',
    audience: data.audience || [],
    ai_summary: data.ai_summary || null,
    hasAiSummary: !!data.ai_summary,
    draftSummary: data.ai_summary || extractDraftSummary(content, data.title || relativePath),
    frontmatter: data,
  };
}

/**
 * Infer category from file path
 */
function inferCategory(relativePath) {
  const parts = relativePath.toLowerCase().split(path.sep);

  if (parts.includes('api') || parts.includes('api-reference')) return 'api';
  if (parts.includes('architecture')) return 'architecture';
  if (parts.includes('operations') || parts.includes('runbooks')) return 'operations';
  if (parts.includes('debugging')) return 'debugging';
  if (parts.includes('admin')) return 'admin';
  if (parts.includes('security')) return 'security';
  if (parts.includes('planning')) return 'planning';
  if (parts.includes('testing')) return 'testing';
  if (parts.includes('deployment')) return 'deployment';
  if (parts.includes('voice')) return 'voice';
  if (parts.includes('feature-flags')) return 'feature-flags';
  if (parts.includes('integration')) return 'integration';

  return 'reference';
}

/**
 * Apply ai_summary to a file
 */
function applyAiSummary(doc) {
  const content = fs.readFileSync(doc.fullPath, 'utf-8');

  try {
    const parsed = matter(content);

    // Add ai_summary
    parsed.data.ai_summary = doc.draftSummary;

    // Also add audience: ["ai-agents"] if not present
    if (!parsed.data.audience) {
      parsed.data.audience = ['developers', 'ai-agents'];
    } else if (!parsed.data.audience.includes('ai-agents')) {
      parsed.data.audience.push('ai-agents');
    }

    // Rebuild the file
    const newContent = matter.stringify(parsed.content, parsed.data);
    fs.writeFileSync(doc.fullPath, newContent);

    return true;
  } catch (e) {
    console.error(`  Error applying to ${doc.path}: ${e.message}`);
    return false;
  }
}

/**
 * Main function
 */
function main() {
  console.log('AI Summary Generator\n');

  // Find all docs
  const files = findMarkdownFiles(CONFIG.DOCS_DIR);
  const docs = files.map(analyzeDocument);

  // Filter to those missing ai_summary
  let docsNeedingSummary = docs.filter(d => !d.hasAiSummary);

  // Filter by category if specified
  if (filterCategory) {
    docsNeedingSummary = docsNeedingSummary.filter(d => d.category === filterCategory);
  }

  // Sort by priority category
  docsNeedingSummary.sort((a, b) => {
    const aIndex = CONFIG.PRIORITY_CATEGORIES.indexOf(a.category);
    const bIndex = CONFIG.PRIORITY_CATEGORIES.indexOf(b.category);
    const aPriority = aIndex === -1 ? 999 : aIndex;
    const bPriority = bIndex === -1 ? 999 : bIndex;
    return aPriority - bPriority;
  });

  // Stats
  const stats = {
    total: docs.length,
    withSummary: docs.filter(d => d.hasAiSummary).length,
    needingSummary: docsNeedingSummary.length,
    targetCoverage: Math.ceil(docs.length * 0.5),
    toAdd: Math.ceil(docs.length * 0.5) - docs.filter(d => d.hasAiSummary).length,
  };

  if (flags.priority) {
    // Show priority breakdown
    console.log('Priority Categories for AI Summary Addition:\n');

    const byCategory = {};
    docsNeedingSummary.forEach(d => {
      if (!byCategory[d.category]) byCategory[d.category] = [];
      byCategory[d.category].push(d);
    });

    CONFIG.PRIORITY_CATEGORIES.forEach((cat, idx) => {
      const count = byCategory[cat]?.length || 0;
      if (count > 0) {
        console.log(`${idx + 1}. ${cat}: ${count} docs`);
      }
    });

    // Any uncategorized
    const otherCats = Object.keys(byCategory).filter(c => !CONFIG.PRIORITY_CATEGORIES.includes(c));
    otherCats.forEach(cat => {
      console.log(`   ${cat}: ${byCategory[cat].length} docs`);
    });

    console.log(`\nTo reach 50% coverage (${stats.targetCoverage} docs), need to add ${stats.toAdd} more ai_summaries.`);
    return;
  }

  if (flags.json) {
    // Output JSON
    const output = {
      stats,
      byCategory: {},
      docs: docsNeedingSummary.map(d => ({
        path: d.path,
        title: d.title,
        category: d.category,
        draftSummary: d.draftSummary,
      })),
    };

    docsNeedingSummary.forEach(d => {
      if (!output.byCategory[d.category]) output.byCategory[d.category] = 0;
      output.byCategory[d.category]++;
    });

    console.log(JSON.stringify(output, null, 2));
    return;
  }

  // Print summary
  console.log(`Current Status:`);
  console.log(`  Total docs: ${stats.total}`);
  console.log(`  With ai_summary: ${stats.withSummary} (${Math.round(stats.withSummary / stats.total * 100)}%)`);
  console.log(`  Target (50%): ${stats.targetCoverage}`);
  console.log(`  Need to add: ${stats.toAdd}\n`);

  if (flags.generate) {
    console.log(`Generated Draft Summaries (${docsNeedingSummary.length} docs):\n`);

    let applied = 0;
    let errors = 0;

    for (const doc of docsNeedingSummary.slice(0, flags.apply ? undefined : 10)) {
      console.log(`[${doc.category}] ${doc.path}`);
      console.log(`  Draft: ${doc.draftSummary}`);

      if (flags.apply) {
        if (applyAiSummary(doc)) {
          console.log(`  ✓ Applied`);
          applied++;
        } else {
          console.log(`  ✗ Error`);
          errors++;
        }
      }
      console.log('');
    }

    if (!flags.apply) {
      console.log(`Showing first 10 of ${docsNeedingSummary.length}. Use --apply to write changes.`);
    } else {
      console.log(`\nApplied: ${applied}, Errors: ${errors}`);
    }
  } else {
    // List by category
    console.log('Docs needing ai_summary by category:\n');

    const byCategory = {};
    docsNeedingSummary.forEach(d => {
      if (!byCategory[d.category]) byCategory[d.category] = [];
      byCategory[d.category].push(d);
    });

    Object.entries(byCategory).forEach(([cat, catDocs]) => {
      console.log(`${cat} (${catDocs.length}):`);
      catDocs.slice(0, 3).forEach(d => {
        console.log(`  - ${d.path}`);
      });
      if (catDocs.length > 3) {
        console.log(`  ... and ${catDocs.length - 3} more`);
      }
      console.log('');
    });

    console.log('Use --generate to create draft summaries.');
    console.log('Use --priority to see priority breakdown.');
  }
}

main();
