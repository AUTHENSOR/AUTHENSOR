/**
 * Authensor Node.js Quickstart
 *
 * This example demonstrates how to use the Authensor SDK to:
 * 1. Connect to the control plane
 * 2. Evaluate actions against policies
 * 3. Execute actions with policy enforcement
 * 4. View receipts
 *
 * Run: pnpm start
 */

import { Authensor, AuthensorDeniedError } from '@authensor/sdk';

const CONTROL_PLANE_URL = process.env.CONTROL_PLANE_URL || 'http://localhost:3000';
const API_KEY = process.env.AUTHENSOR_API_KEY;

async function main() {
  console.log('🚀 Authensor Node.js Quickstart\n');
  console.log(`Control Plane: ${CONTROL_PLANE_URL}`);
  console.log(`API Key: ${API_KEY ? '***' + API_KEY.slice(-8) : '(none - localhost mode)'}\n`);

  const viewBase = CONTROL_PLANE_URL.replace(/\/$/, '');

  // Initialize the SDK
  const authensor = new Authensor({
    controlPlaneUrl: CONTROL_PLANE_URL,
    apiKey: API_KEY,
    principalId: 'quickstart-agent',
    principalType: 'agent',
    principalName: 'Quickstart Example Agent',
    environment: 'development',
  });

  try {
    // Example 1: Check if an action is allowed (without executing)
    console.log('📋 Example 1: Evaluate an action\n');
    const { allowed, decision, receiptId } = await authensor.evaluate(
      'http.request',
      'https://api.example.com/data'
    );
    console.log(`  Allowed: ${allowed}`);
    console.log(`  Decision: ${decision.outcome}`);
    console.log(`  Receipt ID: ${receiptId}`);
    console.log(`  Receipt Link: ${viewBase}/receipts/${receiptId}/view`);
    console.log();

    // Example 2: Execute an action with policy enforcement
    console.log('🔧 Example 2: Execute a protected action\n');
    const result = await authensor.execute(
      'http.request',
      'https://httpbin.org/get',
      async () => {
        // This is your actual action - only runs if allowed
        const response = await fetch('https://httpbin.org/get');
        return response.json();
      },
      {
        operation: 'read',
        parameters: { method: 'GET' },
      }
    );
    console.log(`  Receipt ID: ${result.receiptId}`);
    console.log(`  Decision: ${result.decision.outcome}`);
    console.log(`  Result keys: ${Object.keys(result.result as object).join(', ')}`);
    console.log(`  Receipt Link: ${viewBase}/receipts/${result.receiptId}/view`);
    console.log();

    // Example 3: Handle a denied action
    console.log('🚫 Example 3: Handle denied actions\n');
    console.log('  (This would fail with restrictive policies)');
    console.log('  In development mode, the default policy allows all actions.\n');

    // Example 4: List recent receipts
    console.log('📜 Example 4: List receipts\n');
    const receipts = await authensor.listReceipts({ limit: 5 });
    console.log(`  Found ${(receipts as any).receipts?.length || 0} receipts`);
    console.log();

    console.log('✅ Quickstart complete!');
    console.log(`\nView your receipts at: ${CONTROL_PLANE_URL}/receipts/view?limit=20`);
    if (process.argv.includes('--tail')) {
      console.log(`Receipt tail: ${CONTROL_PLANE_URL}/receipts/view?limit=20`);
    }

  } catch (error) {
    if (error instanceof AuthensorDeniedError) {
      console.error('❌ Action denied:', error.decision.reason);
    } else {
      console.error('❌ Error:', error);
    }
    process.exit(1);
  }
}

main();
