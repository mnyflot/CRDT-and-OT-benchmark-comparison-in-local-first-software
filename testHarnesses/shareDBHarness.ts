import ShareDB from 'sharedb';
import { performance } from 'perf_hooks';
import * as fs from 'fs';
import * as json0 from 'ot-json0';

ShareDB.types.register(json0.type);

type EgWalkerInsert = [number, number, string];
type EgWalkerDelete = [number, number];
type TraceOp = EgWalkerInsert | EgWalkerDelete;

const batchSize = parseInt(process.argv[2] || "500");
const datasetName = process.argv[3]

console.log(`Loading dataset: ${datasetName} | Batch size: ${batchSize}`);

const fileContent = fs.readFileSync(`./datasets/${datasetName}.json`, 'utf8');
const rawData = JSON.parse(fileContent);

const allTransactions = rawData.txns || [];
const allEdits: TraceOp[] = [];

console.log(`Analyzing ${datasetName}: Found ${allTransactions.length} transactions.`);

for (const tx of allTransactions) {
    if (tx.patches && Array.isArray(tx.patches)) {
        for (const patch of tx.patches) {
            allEdits.push(patch as TraceOp);
        }
    } else if (tx.ops && Array.isArray(tx.ops)) {
        // Fallback for differently formatted traces
        for (const op of tx.ops) {
            allEdits.push(op as TraceOp);
        }
    }
}

console.log(`✅ Successfully flattened ${allEdits.length} individual edits.`);

async function run() {
    const backend = new ShareDB();
    const connection = backend.connect();
    const doc = connection.get('benchmarks', 'list-1');
    
    // Initialize with startContent if it exists
    const initialItems = rawData.startContent ? rawData.startContent.split("") : [];
    await new Promise((res) => doc.create({ items: initialItems }, res));

    const alphaOps = allEdits.slice(0, batchSize);
    const bravoOps = allEdits.slice(batchSize, batchSize * 2);

    // Establish History (Alpha's work)
    alphaOps.forEach((op) => {
        const ops = translateToOps(doc, op);
        ops.forEach(o => doc.submitOp(o));
    });

    // Measure Merge (Bravo's concurrent work)
    if (global.gc) global.gc();
    const memBefore = process.memoryUsage().heapUsed;
    const start = performance.now();

    for (const op of bravoOps) {
        const ops = translateToOps(doc, op);
        ops.forEach(o => doc.submitOp(o));
    }

    const duration = performance.now() - start;
    const memPeak = process.memoryUsage().heapUsed;

    if (global.gc) global.gc();
    const memAtRest = process.memoryUsage().heapUsed;

    const payloadSize = Buffer.byteLength(JSON.stringify(bravoOps));

    saveResultsToCSV('ShareDB', datasetName, duration, memPeak - memBefore, memAtRest - memBefore, payloadSize, batchSize);
}

function translateToOps(doc: any, patch: TraceOp): any[] {
    const [index, length, text] = patch;
    const ops: any[] = [];
    const currentLen = doc.data.items.length;
    
    // Safe Index Fallback
    const safeIdx = Math.min(index, currentLen);

    if (text !== undefined) {
        ops.push({ p: ['items', safeIdx], li: text });
    } else {
        // Ensure we don't try to delete more items than exist after safeIdx
        const safeLength = Math.min(length, currentLen - safeIdx);
        for (let i = 0; i < safeLength; i++) {
            ops.push({ p: ['items', safeIdx], ld: true });
        }
    }
    return ops;
}

function saveResultsToCSV(algo: string, dataset: string, time: number, peakMem: number, restMem: number, payload: number, size: number) {
    const fileName = 'experimentResults.csv';
    const header = 'algorithm,dataset,batch_size,duration_ms,peak_memory_bytes,at_rest_memory_bytes,payload_bytes\n';
    if (!fs.existsSync(fileName)) fs.writeFileSync(fileName, header);
    fs.appendFileSync(fileName, `${algo},${dataset},${size},${time},${peakMem},${restMem},${payload}\n`);
}

run().catch(console.error);