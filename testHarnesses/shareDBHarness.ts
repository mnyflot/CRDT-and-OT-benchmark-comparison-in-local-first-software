import ShareDB from 'sharedb';
import { performance } from 'perf_hooks';
import * as fs from 'fs';
import * as json0 from 'ot-json0';

ShareDB.types.register(json0.type);

type EgWalkerInsert = [number, number, string]; // [index, length, "text"]
type EgWalkerDelete = [number, number];         // [index, length]
type TraceOp = EgWalkerInsert | EgWalkerDelete;

const batchSize = parseInt(process.argv[2] || "500");

async function run() {
    // --- A1.json Loading & Flattening logic ---
    const fileContent = fs.readFileSync("./datasets/A1.json", 'utf8');
    const rawData = JSON.parse(fileContent);

    // A1.json uses 'txns' for transactions
    const allTransactions = rawData.txns || [];
    const allEdits: TraceOp[] = [];

    console.log(`Analyzing A1.json: Found ${allTransactions.length} transactions.`);

    for (const tx of allTransactions) {
        // Each transaction has a 'patches' array
        if (tx.patches && Array.isArray(tx.patches)) {
            allEdits.push(...(tx.patches as TraceOp[]));
        }
    }

    if (allEdits.length === 0) {
        throw new Error("❌ No edits found. Verify that A1.json has 'txns' containing 'patches'.");
    }

    console.log(`✅ Successfully flattened ${allEdits.length} individual edits.`);

    // Setup ShareDB
    const backend = new ShareDB();
    const connection = backend.connect();
    const doc = connection.get('benchmarks', 'list-1');
    await new Promise((res) => doc.create({ items: [] }, res));

    // Slice based on experimental batch size
    const alphaOps = allEdits.slice(0, batchSize);
    const bravoOps = allEdits.slice(batchSize, batchSize * 2);

    // Establish "History" (Alpha's work)
    alphaOps.forEach((op) => {
        const ops = translateToOps(op);
        ops.forEach(o => doc.submitOp(o));
    });

    // Measure the "Merge" (Applying Bravo's concurrent work)
    const memBefore = process.memoryUsage().heapUsed;
    const start = performance.now();

    for (const op of bravoOps) {
        const ops = translateToOps(op);
        // In OT, applying these ops triggers the transformation against Alpha's work
        ops.forEach(o => doc.submitOp(o));
    }

    const duration = performance.now() - start;
    const memAfter = process.memoryUsage().heapUsed;
    
    // Payload for OT: Sum of individual serialized operations sent
    const payloadSize = Buffer.byteLength(JSON.stringify(bravoOps));

    saveResultsToCSV('ShareDB', duration, memAfter - memBefore, payloadSize, batchSize);
    console.log(`Results saved for ShareDB at size ${batchSize}`);
}

/**
 * Translates an A1.json patch into ShareDB json0 operations.
 * Returns an array because a single 'delete length X' becomes X individual ops.
 */
function translateToOps(patch: TraceOp): any[] {
    const [index, length, text] = patch;
    const ops: any[] = [];

    if (text !== undefined) {
        // Insertion
        ops.push({ p: ['items', index], li: text });
    } else {
        // Deletion: Must delete 'length' times at the same index because the list shifts after each deletion.
        for (let i = 0; i < length; i++) {
            ops.push({ p: ['items', index], ld: true });
        }
    }
    return ops;
}

function saveResultsToCSV(algo: string, time: number, mem: number, payload: number, size: number) {
    const fileName = 'experimentResults.csv';
    const header = 'algorithm,batch_size,duration_ms,memory_bytes,payload_bytes\n';
    if (!fs.existsSync(fileName)) fs.writeFileSync(fileName, header);
    fs.appendFileSync(fileName, `${algo},${size},${time},${mem},${payload}\n`);
}

run().catch(console.error);