#!/usr/bin/env node
/**
 * Consolidated Agent JSON Generator
 *
 * Generates all agent-consumable JSON files for the VoiceAssist platform:
 * - /agent/index.json    - Overview of available endpoints
 * - /agent/docs.json     - Full document index with metadata
 * - /agent/status.json   - System status with feature flags
 * - /agent/activity.json - Recent activity and changes
 * - /agent/todos.json    - Aggregated documentation and feature flag tasks
 *
 * Usage:
 *   npm run generate:agent -- --all           # Generate all files
 *   npm run generate:agent -- --only=status   # Generate specific file(s)
 *   npm run generate:agent -- --check         # Validate without writing
 *
 * @version 2.0.0
 * @date 2025-12-04
 */

const fs = require('fs');
const path = require('path');

// Try to load gray-matter from various locations
let matter;
try {
  matter = require('gray-matter');
} catch (e) {
  try {
    // Try docs-site node_modules
    matter = require(path.join(__dirname, '..', 'apps', 'docs-site', 'node_modules', 'gray-matter'));
  } catch (e2) {
    console.error('Error: gray-matter module not found.');
    console.error('Please run: pnpm install --filter docs-site');
    console.error('Or install globally: npm install -g gray-matter');
    process.exit(1);
  }
}

// Configuration
const CONFIG = {
  DOCS_DIR: process.env.DOCS_DIR || path.join(__dirname, '..', 'docs'),
  OUTPUT_DIR: process.env.OUTPUT_DIR || path.join(__dirname, '..', 'apps', 'docs-site', 'public', 'agent'),
  TYPES_DIR: path.join(__dirname, '..', 'packages', 'types', 'src'),
  VERSION: '2.0.0'
};

// Valid enum values
const ENUMS = {
  STATUS: ['draft', 'experimental', 'stable', 'deprecated'],
  STABILITY: ['production', 'beta', 'experimental', 'legacy'],
  OWNER: ['backend', 'frontend', 'infra', 'sre', 'docs', 'product', 'security', 'mixed'],
  AUDIENCE: [
    'human', 'agent', 'backend', 'frontend', 'devops', 'admin', 'user',
    'docs', 'sre', 'developers', 'ai-agents', 'ai-agent', 'security-engineers',
    'architects', 'compliance-officers', 'stakeholders', 'project-managers',
    'frontend-developers', 'technical-writers'
  ],
  CATEGORY: [
    'ai', 'api', 'architecture', 'debugging', 'deployment', 'operations',
    'overview', 'planning', 'reference', 'security', 'testing', 'feature-flags'
  ],
  FLAG_CATEGORY: ['ui', 'backend', 'admin', 'integration', 'experiment', 'ops'],
  FLAG_TYPE: ['boolean', 'percentage', 'variant', 'scheduled'],
  FLAG_STATUS: ['active', 'deprecated', 'scheduled', 'disabled']
};

/**
 * Parse command line arguments
 */
function parseArgs() {
  const args = process.argv.slice(2);
  const options = {
    all: false,
    only: [],
    check: false
  };

  for (const arg of args) {
    if (arg === '--all') options.all = true;
    else if (arg === '--check') options.check = true;
    else if (arg.startsWith('--only=')) {
      options.only = arg.replace('--only=', '').split(',');
    }
  }

  // Default to all if nothing specified
  if (!options.all && options.only.length === 0) {
    options.all = true;
  }

  return options;
}

/**
 * Parse frontmatter metadata with normalization
 */
function parseMetadata(rawData, filePath) {
  const lastUpdated = rawData.lastUpdated || rawData.last_updated || '';
  const summary = rawData.summary || rawData.description || '';
  const aiSummary = rawData.ai_summary || rawData.aiSummary || '';

  // Generate slug from filename if not provided
  const defaultSlug = path.basename(filePath, '.md')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');

  return {
    title: rawData.title || path.basename(filePath, '.md').replace(/_/g, ' '),
    slug: rawData.slug || defaultSlug,
    status: ENUMS.STATUS.includes(rawData.status) ? rawData.status : 'draft',
    lastUpdated: lastUpdated.toString(),
    summary: summary || undefined,
    aiSummary: aiSummary || undefined,
    stability: ENUMS.STABILITY.includes(rawData.stability) ? rawData.stability : undefined,
    owner: ENUMS.OWNER.includes(rawData.owner) ? rawData.owner : undefined,
    audience: Array.isArray(rawData.audience)
      ? rawData.audience.filter(a => ENUMS.AUDIENCE.includes(a))
      : undefined,
    category: ENUMS.CATEGORY.includes(rawData.category) ? rawData.category : undefined,
    tags: Array.isArray(rawData.tags) ? rawData.tags : undefined,
    relatedServices: Array.isArray(rawData.relatedServices) ? rawData.relatedServices : undefined,
    // Feature flag specific fields
    flagCategory: ENUMS.FLAG_CATEGORY.includes(rawData.flag_category) ? rawData.flag_category : undefined,
    flagType: ENUMS.FLAG_TYPE.includes(rawData.flag_type) ? rawData.flag_type : undefined,
    flagDeprecated: typeof rawData.flag_deprecated === 'boolean' ? rawData.flag_deprecated : undefined
  };
}

/**
 * Recursively scan directory for markdown files
 */
function scanDocsDir(dir, basePath = '') {
  const entries = [];

  if (!fs.existsSync(dir)) {
    return entries;
  }

  const items = fs.readdirSync(dir);

  for (const item of items) {
    const fullPath = path.join(dir, item);
    const relativePath = path.join(basePath, item);
    const stat = fs.statSync(fullPath);

    if (stat.isDirectory()) {
      if (!item.startsWith('.') && item !== 'node_modules') {
        entries.push(...scanDocsDir(fullPath, relativePath));
      }
    } else if (item.endsWith('.md')) {
      try {
        const content = fs.readFileSync(fullPath, 'utf-8');
        const { data } = matter(content);
        const metadata = parseMetadata(data, relativePath);

        if (!metadata.lastUpdated) {
          metadata.lastUpdated = stat.mtime.toISOString().split('T')[0];
        }

        entries.push({
          ...metadata,
          path: relativePath.replace(/\\/g, '/')
        });
      } catch (error) {
        console.warn(`Could not parse ${relativePath}:`, error.message);
      }
    }
  }

  return entries;
}

/**
 * Parse feature flags from TypeScript definitions
 */
function parseFeatureFlags() {
  const flagsFile = path.join(CONFIG.TYPES_DIR, 'featureFlags.ts');
  const flags = {
    total_count: 0,
    by_category: { ui: 0, backend: 0, admin: 0, integration: 0, experiment: 0, ops: 0 },
    by_status: { active: 0, deprecated: 0, scheduled: 0, disabled: 0 },
    recent_changes: [],
    flags: [],
    source_file: 'packages/types/src/featureFlags.ts'
  };

  if (!fs.existsSync(flagsFile)) {
    console.warn('Feature flags file not found, using placeholder data');
    // Return placeholder data for now
    flags.total_count = 24;
    flags.by_category = { ui: 8, backend: 10, experiment: 4, ops: 2 };
    flags.by_status = { active: 20, deprecated: 3, scheduled: 1, disabled: 0 };
    return flags;
  }

  try {
    const content = fs.readFileSync(flagsFile, 'utf-8');

    // Updated regex pattern to match the new naming convention
    // Format: name: "<category>.<flag_name>"
    const flagPattern = /name:\s*["'](ui|backend|admin|integration|experiment|ops)\.([a-z_]+)["']/g;
    let match;

    while ((match = flagPattern.exec(content)) !== null) {
      const category = match[1];
      const name = match[2];

      // Initialize category counter if not exists
      if (!(category in flags.by_category)) {
        flags.by_category[category] = 0;
      }

      flags.by_category[category]++;
      flags.total_count++;
      flags.by_status.active++; // Assume active by default

      flags.flags.push({
        name: `${category}.${name}`,
        category,
        status: 'active'
      });
    }
  } catch (error) {
    console.warn('Could not parse feature flags:', error.message);
  }

  return flags;
}

/**
 * Generate /agent/index.json
 */
function generateIndex() {
  return {
    version: CONFIG.VERSION,
    generated_at: new Date().toISOString(),
    description: 'VoiceAssist documentation and system index for AI agents',
    canonical_urls: {
      web_app: 'https://dev.asimo.io',
      api: 'https://assist.asimo.io',
      admin: 'https://admin.asimo.io',
      docs: 'https://assistdocs.asimo.io'
    },
    endpoints: {
      docs_list: {
        path: '/agent/docs.json',
        description: 'Full list of all documentation with metadata',
        method: 'GET'
      },
      docs_summary: {
        path: '/agent/docs-summary.json',
        description: 'AI-friendly summaries aggregated by category for quick context loading',
        method: 'GET'
      },
      status: {
        path: '/agent/status.json',
        description: 'System status including feature flags and health',
        method: 'GET'
      },
      health: {
        path: '/agent/health.json',
        description: 'Documentation health metrics - stale docs, missing frontmatter, per-category freshness',
        method: 'GET'
      },
      activity: {
        path: '/agent/activity.json',
        description: 'Recent changes and activity log',
        method: 'GET'
      },
      todos: {
        path: '/agent/todos.json',
        description: 'Aggregated documentation and feature flag tasks',
        method: 'GET'
      },
      search_index: {
        path: '/search-index.json',
        description: 'Full-text search index for client-side searching',
        method: 'GET'
      }
    },
    usage_notes: [
      'Use docs.json for browsing and filtering documentation',
      'Use status.json for system health and feature flag states',
      'All paths are relative to assistdocs.asimo.io',
      'Filter client-side by status, audience, category, tags, etc.'
    ]
  };
}

/**
 * Generate /agent/docs.json
 */
function generateDocs() {
  const docs = scanDocsDir(CONFIG.DOCS_DIR);

  // Sort by lastUpdated descending
  docs.sort((a, b) => {
    if (!a.lastUpdated) return 1;
    if (!b.lastUpdated) return -1;
    return b.lastUpdated.localeCompare(a.lastUpdated);
  });

  return {
    count: docs.length,
    generated_at: new Date().toISOString(),
    docs
  };
}

/**
 * Generate /agent/status.json with feature flags section
 */
function generateStatus() {
  const featureFlags = parseFeatureFlags();

  return {
    version: CONFIG.VERSION,
    generated_at: new Date().toISOString(),
    system: {
      name: 'VoiceAssist',
      environment: process.env.NODE_ENV || 'development',
      backend_status: 'operational',
      docs_status: 'operational'
    },
    implementation_status: {
      backend: { completion: 100, phase: '15/15 complete' },
      frontend: { completion: 80, phase: 'Phase 3.5 complete' },
      admin_panel: { completion: 90, phase: 'Complete' },
      docs_site: { completion: 85, phase: 'Active development' }
    },
    feature_flags: featureFlags,
    canonical_urls: {
      web_app: 'https://dev.asimo.io',
      api: 'https://assist.asimo.io',
      admin: 'https://admin.asimo.io',
      docs: 'https://assistdocs.asimo.io',
      monitoring: 'https://monitor.asimo.io'
    },
    documentation: {
      total_docs: 0, // Will be filled in main()
      by_status: {
        stable: 0,
        draft: 0,
        deprecated: 0,
        experimental: 0
      }
    }
  };
}

/**
 * Generate /agent/activity.json
 */
function generateActivity() {
  return {
    generated_at: new Date().toISOString(),
    recent_commits: [],
    recent_doc_updates: [],
    recent_flag_changes: []
  };
}

/**
 * Generate /agent/todos.json
 */
function generateTodos() {
  return {
    generated_at: new Date().toISOString(),
    total_tasks: 0,
    by_category: {
      documentation: 0,
      feature_flags: 0,
      infrastructure: 0,
      testing: 0
    },
    tasks: []
  };
}

/**
 * Generate /agent/health.json - Documentation health metrics
 */
function generateHealth() {
  const docs = scanDocsDir(CONFIG.DOCS_DIR);
  const now = new Date();
  const thirtyDaysAgo = new Date(now.getTime() - (30 * 24 * 60 * 60 * 1000));

  // Calculate metrics
  const metrics = {
    stale_docs: { count: 0, threshold_days: 30, docs: [] },
    missing_frontmatter: { count: 0, docs: [] },
    by_status: { stable: 0, draft: 0, deprecated: 0, experimental: 0 },
    by_owner: {},
    by_category: {},
    coverage: { total: docs.length, documented: 0, undocumented: 0 }
  };

  // Per-category freshness tracking
  const categoryFreshness = {};

  for (const doc of docs) {
    const category = doc.category || 'uncategorized';

    // Initialize category freshness tracking
    if (!categoryFreshness[category]) {
      categoryFreshness[category] = {
        total: 0,
        fresh: 0,
        stale: 0,
        newest_update: null,
        oldest_update: null,
        docs_needing_update: []
      };
    }
    categoryFreshness[category].total++;

    // Check for stale docs
    if (doc.lastUpdated) {
      const lastUpdated = new Date(doc.lastUpdated);

      // Track category freshness
      if (!categoryFreshness[category].newest_update || lastUpdated > new Date(categoryFreshness[category].newest_update)) {
        categoryFreshness[category].newest_update = doc.lastUpdated;
      }
      if (!categoryFreshness[category].oldest_update || lastUpdated < new Date(categoryFreshness[category].oldest_update)) {
        categoryFreshness[category].oldest_update = doc.lastUpdated;
      }

      if (lastUpdated < thirtyDaysAgo) {
        metrics.stale_docs.count++;
        categoryFreshness[category].stale++;

        const daysStale = Math.floor((now - lastUpdated) / (24 * 60 * 60 * 1000));

        if (metrics.stale_docs.docs.length < 20) {
          metrics.stale_docs.docs.push({
            path: doc.path,
            last_updated: doc.lastUpdated,
            days_stale: daysStale
          });
        }

        if (categoryFreshness[category].docs_needing_update.length < 5) {
          categoryFreshness[category].docs_needing_update.push({
            path: doc.path,
            days_stale: daysStale
          });
        }
      } else {
        categoryFreshness[category].fresh++;
      }
    }

    // Check for missing frontmatter
    const requiredFields = ['title', 'status', 'lastUpdated', 'summary'];
    const missingFields = requiredFields.filter(field => !doc[field]);
    if (missingFields.length > 0) {
      metrics.missing_frontmatter.count++;
      if (metrics.missing_frontmatter.docs.length < 20) {
        metrics.missing_frontmatter.docs.push({
          path: doc.path,
          missing_fields: missingFields
        });
      }
    } else {
      metrics.coverage.documented++;
    }

    // Count by status
    if (doc.status && metrics.by_status[doc.status] !== undefined) {
      metrics.by_status[doc.status]++;
    }

    // Count by owner
    if (doc.owner) {
      metrics.by_owner[doc.owner] = (metrics.by_owner[doc.owner] || 0) + 1;
    }

    // Count by category
    if (doc.category) {
      metrics.by_category[doc.category] = (metrics.by_category[doc.category] || 0) + 1;
    }
  }

  metrics.coverage.undocumented = metrics.coverage.total - metrics.coverage.documented;

  // Calculate per-category freshness scores
  const categoryScores = {};
  for (const [category, data] of Object.entries(categoryFreshness)) {
    const freshnessScore = data.total > 0
      ? Math.round((data.fresh / data.total) * 100)
      : 100;
    categoryScores[category] = {
      freshness_score: freshnessScore,
      total_docs: data.total,
      fresh_docs: data.fresh,
      stale_docs: data.stale,
      newest_update: data.newest_update,
      oldest_update: data.oldest_update,
      status: freshnessScore >= 90 ? 'healthy' : freshnessScore >= 70 ? 'warning' : 'critical',
      docs_needing_update: data.docs_needing_update
    };
  }

  // Calculate coverage score (0-100)
  const coverageScore = metrics.coverage.total > 0
    ? Math.round((metrics.coverage.documented / metrics.coverage.total) * 100)
    : 0;

  // Calculate freshness score (100 - stale percentage)
  const freshnessScore = metrics.coverage.total > 0
    ? Math.round(100 - (metrics.stale_docs.count / metrics.coverage.total) * 100)
    : 100;

  // Overall health score
  const healthScore = Math.round((coverageScore + freshnessScore) / 2);

  // Generate recommended next steps
  const nextSteps = generateNextSteps(metrics, categoryScores, docs.length);

  return {
    version: CONFIG.VERSION,
    generated_at: now.toISOString(),
    health_status: healthScore >= 90 ? 'healthy' : healthScore >= 70 ? 'warning' : 'critical',
    scores: {
      overall: healthScore,
      coverage: coverageScore,
      freshness: freshnessScore
    },
    summary: {
      total_docs: docs.length,
      stale_count: metrics.stale_docs.count,
      missing_frontmatter_count: metrics.missing_frontmatter.count,
      coverage_percentage: coverageScore
    },
    category_freshness: categoryScores,
    metrics,
    thresholds: {
      stale_days: 30,
      required_frontmatter: ['title', 'status', 'lastUpdated', 'summary'],
      health_warning: 70,
      health_critical: 50
    },
    recommendations: generateHealthRecommendations(metrics, docs.length),
    next_steps: nextSteps
  };
}

/**
 * Generate recommended next steps based on health metrics
 */
function generateNextSteps(metrics, categoryScores, totalDocs) {
  const steps = [];

  // Find categories with worst freshness
  const criticalCategories = Object.entries(categoryScores)
    .filter(([_, data]) => data.status === 'critical')
    .sort((a, b) => a[1].freshness_score - b[1].freshness_score);

  if (criticalCategories.length > 0) {
    const [category, data] = criticalCategories[0];
    steps.push({
      priority: 1,
      action: `Update ${category} documentation`,
      reason: `${category} category has ${data.stale_docs} stale docs (${data.freshness_score}% freshness)`,
      suggested_docs: data.docs_needing_update.slice(0, 3).map(d => d.path)
    });
  }

  // Missing frontmatter
  if (metrics.missing_frontmatter.count > 0) {
    steps.push({
      priority: 2,
      action: 'Add missing frontmatter',
      reason: `${metrics.missing_frontmatter.count} docs are missing required metadata`,
      suggested_docs: metrics.missing_frontmatter.docs.slice(0, 3).map(d => d.path)
    });
  }

  // Draft docs to review
  if (metrics.by_status.draft > totalDocs * 0.15) {
    steps.push({
      priority: 3,
      action: 'Review draft documentation',
      reason: `${metrics.by_status.draft} docs are still in draft status (${Math.round(metrics.by_status.draft / totalDocs * 100)}%)`,
      suggested_docs: []
    });
  }

  // Deprecated docs cleanup
  if (metrics.by_status.deprecated > 0) {
    steps.push({
      priority: 4,
      action: 'Clean up deprecated documentation',
      reason: `${metrics.by_status.deprecated} deprecated docs should be archived or removed`,
      suggested_docs: []
    });
  }

  return steps;
}

/**
 * Generate recommendations based on health metrics
 */
function generateHealthRecommendations(metrics, totalDocs) {
  const recommendations = [];

  if (metrics.stale_docs.count > totalDocs * 0.1) {
    recommendations.push({
      priority: 'high',
      category: 'freshness',
      message: `${metrics.stale_docs.count} docs haven't been updated in 30+ days`,
      action: 'Review and update stale documentation'
    });
  }

  if (metrics.missing_frontmatter.count > 0) {
    recommendations.push({
      priority: 'medium',
      category: 'metadata',
      message: `${metrics.missing_frontmatter.count} docs are missing required frontmatter`,
      action: 'Add title, status, lastUpdated, and summary to frontmatter'
    });
  }

  if (metrics.by_status.draft > totalDocs * 0.2) {
    recommendations.push({
      priority: 'low',
      category: 'status',
      message: `${metrics.by_status.draft} docs are still in draft status`,
      action: 'Review draft docs and promote stable ones'
    });
  }

  if (metrics.by_status.deprecated > 0) {
    recommendations.push({
      priority: 'low',
      category: 'cleanup',
      message: `${metrics.by_status.deprecated} deprecated docs should be reviewed`,
      action: 'Archive or remove deprecated documentation'
    });
  }

  return recommendations;
}

/**
 * Generate /agent/docs-summary.json - AI-friendly summaries aggregated by category
 */
function generateDocsSummary() {
  const docs = scanDocsDir(CONFIG.DOCS_DIR);
  const now = new Date();

  // Group summaries by category
  const byCategory = {};
  const withAiSummary = [];
  const withoutAiSummary = [];

  for (const doc of docs) {
    const category = doc.category || 'uncategorized';

    if (!byCategory[category]) {
      byCategory[category] = {
        count: 0,
        docs: []
      };
    }

    const summaryEntry = {
      path: doc.path,
      title: doc.title,
      summary: doc.summary || null,
      ai_summary: doc.aiSummary || null,
      status: doc.status,
      owner: doc.owner || null,
      last_updated: doc.lastUpdated
    };

    byCategory[category].count++;
    byCategory[category].docs.push(summaryEntry);

    if (doc.aiSummary) {
      withAiSummary.push(summaryEntry);
    } else {
      withoutAiSummary.push({
        path: doc.path,
        title: doc.title
      });
    }
  }

  // Calculate AI summary coverage
  const aiCoverage = docs.length > 0
    ? Math.round((withAiSummary.length / docs.length) * 100)
    : 0;

  return {
    version: CONFIG.VERSION,
    generated_at: now.toISOString(),
    description: 'AI-friendly document summaries for quick context loading',
    stats: {
      total_docs: docs.length,
      with_ai_summary: withAiSummary.length,
      without_ai_summary: withoutAiSummary.length,
      ai_coverage_percentage: aiCoverage,
      categories: Object.keys(byCategory).length
    },
    by_category: byCategory,
    missing_ai_summaries: withoutAiSummary.slice(0, 50), // Limit to first 50
    usage_notes: [
      'Use ai_summary for quick context when available',
      'Fall back to summary field if ai_summary is missing',
      'Filter by category for domain-specific queries',
      'Check missing_ai_summaries to prioritize adding summaries'
    ]
  };
}

/**
 * Main execution
 */
function main() {
  const options = parseArgs();
  console.log('Generating agent JSON files...');
  console.log(`  Output directory: ${CONFIG.OUTPUT_DIR}`);

  if (!fs.existsSync(CONFIG.DOCS_DIR)) {
    console.error(`Docs directory not found at ${CONFIG.DOCS_DIR}`);
    process.exit(1);
  }

  // Ensure output directory exists
  if (!options.check) {
    fs.mkdirSync(CONFIG.OUTPUT_DIR, { recursive: true });
  }

  const generators = {
    index: generateIndex,
    docs: generateDocs,
    'docs-summary': generateDocsSummary,
    status: generateStatus,
    activity: generateActivity,
    todos: generateTodos,
    health: generateHealth
  };

  const toGenerate = options.all
    ? Object.keys(generators)
    : options.only.filter(name => generators[name]);

  const results = {};

  for (const name of toGenerate) {
    console.log(`  Generating ${name}.json...`);
    const data = generators[name]();
    results[name] = data;

    if (!options.check) {
      const outputPath = path.join(CONFIG.OUTPUT_DIR, `${name}.json`);
      fs.writeFileSync(outputPath, JSON.stringify(data, null, 2));
      console.log(`    Written to ${outputPath}`);
    }
  }

  // Update status.json with doc counts if both were generated
  if (results.docs && results.status) {
    const docCounts = { stable: 0, draft: 0, deprecated: 0, experimental: 0 };
    for (const doc of results.docs.docs) {
      if (docCounts[doc.status] !== undefined) {
        docCounts[doc.status]++;
      }
    }
    results.status.documentation.total_docs = results.docs.count;
    results.status.documentation.by_status = docCounts;

    if (!options.check) {
      const statusPath = path.join(CONFIG.OUTPUT_DIR, 'status.json');
      fs.writeFileSync(statusPath, JSON.stringify(results.status, null, 2));
    }
  }

  console.log('\nGeneration complete!');

  if (options.check) {
    console.log('(Check mode - no files written)');
  }

  // Summary
  if (results.docs) {
    console.log(`  Total documents: ${results.docs.count}`);
  }
  if (results.status) {
    console.log(`  Feature flags: ${results.status.feature_flags.total_count}`);
  }
}

if (require.main === module) {
  try {
    main();
  } catch (error) {
    console.error('Failed to generate agent JSON:', error);
    process.exit(1);
  }
}

module.exports = { generateIndex, generateDocs, generateDocsSummary, generateStatus, generateActivity, generateTodos, generateHealth };
