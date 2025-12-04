#!/usr/bin/env node
/**
 * Frontmatter Validation Script
 *
 * Validates that all markdown documentation files have required frontmatter fields.
 * Designed to run in CI to enforce documentation standards.
 *
 * Required fields:
 * - title: string
 * - status: draft | experimental | stable | deprecated
 * - lastUpdated: date string (YYYY-MM-DD)
 * - summary: string (brief description)
 *
 * Recommended fields (warnings):
 * - ai_summary: string (2-3 sentences for AI agents)
 * - audience: array of strings
 * - category: string
 * - owner: string
 *
 * Usage:
 *   node scripts/validate-frontmatter.js           # Validate all docs
 *   node scripts/validate-frontmatter.js --strict  # Fail on warnings too
 *   node scripts/validate-frontmatter.js --fix     # Attempt auto-fixes
 *   node scripts/validate-frontmatter.js --json    # Output JSON report
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
  REQUIRED_FIELDS: ['title', 'status', 'lastUpdated', 'summary'],
  RECOMMENDED_FIELDS: ['ai_summary', 'audience', 'category', 'owner'],
  VALID_STATUS: ['draft', 'experimental', 'stable', 'deprecated'],
  VALID_OWNER: ['backend', 'frontend', 'infra', 'sre', 'docs', 'product', 'security', 'mixed'],
  VALID_CATEGORY: [
    'ai', 'api', 'architecture', 'debugging', 'deployment', 'operations',
    'overview', 'planning', 'reference', 'security', 'testing', 'feature-flags', 'guide'
  ],
  VALID_AUDIENCE: [
    'human', 'agent', 'backend', 'frontend', 'devops', 'admin', 'user',
    'docs', 'sre', 'developers', 'ai-agents', 'ai-agent', 'security-engineers',
    'architects', 'compliance-officers', 'stakeholders', 'project-managers',
    'frontend-developers', 'technical-writers'
  ]
};

// Parse command line arguments
function parseArgs() {
  const args = process.argv.slice(2);
  return {
    strict: args.includes('--strict'),
    fix: args.includes('--fix'),
    json: args.includes('--json'),
    verbose: args.includes('--verbose') || args.includes('-v'),
    help: args.includes('--help') || args.includes('-h')
  };
}

// Show help
function showHelp() {
  console.log(`
Frontmatter Validation Script

Usage: node scripts/validate-frontmatter.js [options]

Options:
  --strict    Fail on warnings (missing recommended fields)
  --fix       Attempt to auto-fix missing fields (experimental)
  --json      Output results as JSON
  --verbose   Show detailed information for each file
  --help      Show this help message

Required fields: ${CONFIG.REQUIRED_FIELDS.join(', ')}
Recommended fields: ${CONFIG.RECOMMENDED_FIELDS.join(', ')}
`);
}

// Recursively scan directory for markdown files
function scanDocsDir(dir, results = []) {
  if (!fs.existsSync(dir)) return results;

  const items = fs.readdirSync(dir);
  for (const item of items) {
    const fullPath = path.join(dir, item);
    const stat = fs.statSync(fullPath);

    if (stat.isDirectory()) {
      if (!item.startsWith('.') && item !== 'node_modules') {
        scanDocsDir(fullPath, results);
      }
    } else if (item.endsWith('.md')) {
      results.push(fullPath);
    }
  }

  return results;
}

// Validate a single file's frontmatter
function validateFile(filePath) {
  const relativePath = path.relative(CONFIG.DOCS_DIR, filePath);
  const result = {
    file: relativePath,
    errors: [],
    warnings: [],
    info: []
  };

  try {
    const content = fs.readFileSync(filePath, 'utf-8');
    const { data } = matter(content);

    // Check required fields
    for (const field of CONFIG.REQUIRED_FIELDS) {
      if (!data[field] && !data[field.replace(/([A-Z])/g, '_$1').toLowerCase()]) {
        // Check snake_case variant too (e.g., lastUpdated vs last_updated)
        const snakeCase = field.replace(/([A-Z])/g, '_$1').toLowerCase();
        if (!data[snakeCase]) {
          result.errors.push(`Missing required field: ${field}`);
        }
      }
    }

    // Validate status enum
    const status = data.status;
    if (status && !CONFIG.VALID_STATUS.includes(status)) {
      result.errors.push(`Invalid status: "${status}". Valid values: ${CONFIG.VALID_STATUS.join(', ')}`);
    }

    // Validate lastUpdated format
    const lastUpdated = data.lastUpdated || data.last_updated;
    if (lastUpdated) {
      const dateStr = lastUpdated instanceof Date
        ? lastUpdated.toISOString().split('T')[0]
        : String(lastUpdated);
      if (!/^\d{4}-\d{2}-\d{2}/.test(dateStr)) {
        result.warnings.push(`lastUpdated should be in YYYY-MM-DD format (got: ${dateStr})`);
      }
    }

    // Check recommended fields
    for (const field of CONFIG.RECOMMENDED_FIELDS) {
      const snakeCase = field.replace(/([A-Z])/g, '_$1').toLowerCase();
      if (!data[field] && !data[snakeCase]) {
        result.warnings.push(`Missing recommended field: ${field}`);
      }
    }

    // Validate ai_summary length
    const aiSummary = data.ai_summary || data.aiSummary;
    if (aiSummary) {
      const sentences = aiSummary.split(/[.!?]+/).filter(s => s.trim().length > 0);
      if (sentences.length < 1) {
        result.warnings.push('ai_summary should have at least 1 sentence');
      } else if (sentences.length > 5) {
        result.warnings.push('ai_summary should be 2-3 sentences (currently has ' + sentences.length + ')');
      }
      result.info.push(`ai_summary: ${sentences.length} sentences`);
    }

    // Validate owner enum
    const owner = data.owner;
    if (owner && !CONFIG.VALID_OWNER.includes(owner)) {
      result.warnings.push(`Non-standard owner: "${owner}". Suggested values: ${CONFIG.VALID_OWNER.join(', ')}`);
    }

    // Validate category enum
    const category = data.category;
    if (category && !CONFIG.VALID_CATEGORY.includes(category)) {
      result.warnings.push(`Non-standard category: "${category}". Suggested values: ${CONFIG.VALID_CATEGORY.join(', ')}`);
    }

    // Validate audience array
    const audience = data.audience;
    if (audience && Array.isArray(audience)) {
      const invalid = audience.filter(a => !CONFIG.VALID_AUDIENCE.includes(a));
      if (invalid.length > 0) {
        result.warnings.push(`Non-standard audience values: ${invalid.join(', ')}`);
      }
    }

  } catch (error) {
    result.errors.push(`Parse error: ${error.message}`);
  }

  return result;
}

// Main execution
function main() {
  const options = parseArgs();

  if (options.help) {
    showHelp();
    process.exit(0);
  }

  const files = scanDocsDir(CONFIG.DOCS_DIR);
  const results = files.map(validateFile);

  // Calculate summary
  const summary = {
    total: results.length,
    valid: results.filter(r => r.errors.length === 0 && r.warnings.length === 0).length,
    withErrors: results.filter(r => r.errors.length > 0).length,
    withWarnings: results.filter(r => r.warnings.length > 0 && r.errors.length === 0).length,
    totalErrors: results.reduce((sum, r) => sum + r.errors.length, 0),
    totalWarnings: results.reduce((sum, r) => sum + r.warnings.length, 0),
    missingAiSummary: results.filter(r =>
      r.warnings.some(w => w.includes('ai_summary'))
    ).length
  };

  // Output results
  if (options.json) {
    console.log(JSON.stringify({ summary, results }, null, 2));
  } else {
    console.log('\n📄 Frontmatter Validation Report');
    console.log('================================\n');

    // Show errors first
    const filesWithErrors = results.filter(r => r.errors.length > 0);
    if (filesWithErrors.length > 0) {
      console.log('❌ Files with errors:\n');
      for (const result of filesWithErrors) {
        console.log(`  ${result.file}`);
        for (const error of result.errors) {
          console.log(`    • ${error}`);
        }
      }
      console.log('');
    }

    // Show warnings
    const filesWithWarnings = results.filter(r => r.warnings.length > 0 && r.errors.length === 0);
    if (filesWithWarnings.length > 0 && (options.verbose || options.strict)) {
      console.log('⚠️  Files with warnings:\n');
      for (const result of filesWithWarnings) {
        console.log(`  ${result.file}`);
        for (const warning of result.warnings) {
          console.log(`    • ${warning}`);
        }
      }
      console.log('');
    }

    // Summary
    console.log('📊 Summary');
    console.log('----------');
    console.log(`  Total files:       ${summary.total}`);
    console.log(`  Valid:             ${summary.valid} ✓`);
    console.log(`  With errors:       ${summary.withErrors} ✗`);
    console.log(`  With warnings:     ${summary.withWarnings} ⚠`);
    console.log(`  Missing ai_summary: ${summary.missingAiSummary}`);
    console.log('');

    // AI coverage
    const aiCoverage = Math.round((1 - summary.missingAiSummary / summary.total) * 100);
    console.log(`📈 AI Summary Coverage: ${aiCoverage}%`);
    if (aiCoverage < 50) {
      console.log('   → Low coverage! Consider adding ai_summary to more docs.');
    } else if (aiCoverage < 80) {
      console.log('   → Good progress! Keep adding ai_summary fields.');
    } else {
      console.log('   → Excellent coverage!');
    }
    console.log('');
  }

  // Exit code
  if (summary.withErrors > 0) {
    if (!options.json) {
      console.log('❌ Validation FAILED - fix errors above');
    }
    process.exit(1);
  } else if (options.strict && summary.withWarnings > 0) {
    if (!options.json) {
      console.log('⚠️  Validation FAILED (strict mode) - fix warnings above');
    }
    process.exit(1);
  } else {
    if (!options.json) {
      console.log('✅ Validation PASSED');
    }
    process.exit(0);
  }
}

if (require.main === module) {
  main();
}

module.exports = { validateFile, scanDocsDir, CONFIG };
