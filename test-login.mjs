#!/usr/bin/env node
/**
 * Integration test for frontend login flow
 * Tests that the login page can successfully authenticate with the backend
 */

import fetch from 'node-fetch';

const API_BASE = 'http://localhost:8000/api';
const TEST_USER = {
  email: 'test-frontend@example.com',
  password: 'TestPassword123'
};

async function testLogin() {
  console.log('Testing login flow...\n');

  try {
    // Step 1: Login
    console.log('1. Attempting login...');
    const loginResponse = await fetch(`${API_BASE}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(TEST_USER)
    });

    if (!loginResponse.ok) {
      throw new Error(`Login failed: ${loginResponse.status} ${loginResponse.statusText}`);
    }

    const tokens = await loginResponse.json();
    console.log('✓ Login successful');
    console.log(`  Access token: ${tokens.access_token.substring(0, 30)}...`);
    console.log(`  Expires in: ${tokens.expires_in}s\n`);

    // Step 2: Get current user
    console.log('2. Fetching current user...');
    const userResponse = await fetch(`${API_BASE}/users/me`, {
      headers: {
        'Authorization': `Bearer ${tokens.access_token}`
      }
    });

    if (!userResponse.ok) {
      throw new Error(`Get user failed: ${userResponse.status} ${userResponse.statusText}`);
    }

    const user = await userResponse.json();
    console.log('✓ User profile fetched');
    console.log(`  Email: ${user.email}`);
    console.log(`  ID: ${user.id}\n`);

    console.log('✅ All tests passed!');
    console.log('\nFrontend integration ready:');
    console.log('  - Login endpoint: working');
    console.log('  - Token authentication: working');
    console.log('  - User profile API: working');

    process.exit(0);
  } catch (error) {
    console.error('❌ Test failed:', error.message);
    process.exit(1);
  }
}

testLogin();
