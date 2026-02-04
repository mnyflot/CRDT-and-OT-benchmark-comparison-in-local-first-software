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
    // 1. Load and Flatten A1.json structure
    const fileContent = fs.readFileSync("./datasets/A1.json", 'utf8');
    const rawData = JSON.parse(fileContent);
    const allTransactions = rawData.transactions || [];
    const allEdits: TraceOp[] = [];

    for (const tx of allTransactions) {
        if (tx.patches) {
            allEdits.push(...(tx.patches as TraceOp[]));
        }
    }

    console.log(`Loaded ${allEdits.length} edits. Testing batch size: ${batchSize}`);

    // 2. Setup ShareDB
    const backend = new ShareDB();
    const connection = backend.connect();
    const doc = connection.get('benchmarks', 'list-1');
    await new Promise((res) => doc.create({ items: [] }, res));

    // Slice based on experimental batch size
    const alphaOps = allEdits.slice(0, batchSize);
    const bravoOps = allEdits.slice(batchSize, batchSize * 2);

    // 3. Establish "History" (Alpha's work)
    alphaOps.forEach((op) => {
        const ops = translateToOps(op);
        ops.forEach(o => doc.submitOp(o));
    });

    // 4. Measure the "Merge" (Applying Bravo's concurrent work)
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