import ShareDB from 'sharedb';
import { performance } from 'perf_hooks';
import * as fs from 'fs';

const json0 = require('ot-json0');

// Register the JSON OT type (json0) required for list operations
ShareDB.types.register(json0.type);

type EgWalkerInsert = [number, number, string]; // [index, 0, "text"]
type EgWalkerDelete = [number, number];         // [index, count]
type TraceOp = EgWalkerInsert | EgWalkerDelete;

async function runShareDBBenchmark() {
    // 1. Setup in-memory backend (Simulates the coordination point)
    const backend = new ShareDB();
    const connection = backend.connect();
    const doc = connection.get('benchmarks', 'list-1');

    // Initialize the shared list
    await new Promise((resolve) => doc.create({ items: [] }, resolve));

    // 2. Load Dataset
    const rawData = JSON.parse(fs.readFileSync('./datasets/editing-trace.json', 'utf8'));
    const midpoint = Math.floor(rawData.edits.length / 2);
    const alphaOps = rawData.edits.slice(0, midpoint);
    const bravoOps = rawData.edits.slice(midpoint);

    // 3. Simulate Alpha's "Offline" Work
    alphaOps.forEach((traceOp: TraceOp) => {
        const op = translateToShareDB(traceOp);
        doc.submitOp(op); // Applied locally
    });

    // 4. The Core Experiment: The "Merge"
    // We measure the time taken to process Bravo's concurrent operations
    const memoryBefore = process.memoryUsage().heapUsed;
    const startTime = performance.now();

    for (const traceOp of bravoOps) {
        const op = translateToShareDB(traceOp);
        // ShareDB transforms Bravo's ops against Alpha's already applied ops
        doc.submitOp(op);
    }

    const endTime = performance.now();
    const memoryAfter = process.memoryUsage().heapUsed;

    console.log(`ShareDB Merge Duration: ${(endTime - startTime).toFixed(4)} ms`);
    console.log(`Memory Usage: ${((memoryAfter - memoryBefore) / 1024).toFixed(2)} KB`);
}

/**
 * Translates Eg-walker traces to ShareDB JSON0 operations.
 * Trace format: [index, length, "text"] for insert, [index, count] for delete.
 */
function translateToShareDB(traceOp: TraceOp) {
    if (traceOp.length === 3) {
        // List Insert (li): insert 'text' at path ['items', index]
        return { p: ['items', traceOp[0]], li: traceOp[2] }; 
    } else {
        // List Remove (ld): remove item at path ['items', index]
        return { p: ['items', traceOp[0]], ld: true }; 
    }
}

runShareDBBenchmark().catch(console.error);