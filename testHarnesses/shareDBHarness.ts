import ShareDB from 'sharedb';
import { performance } from 'perf_hooks';
import * as fs from 'fs';
import * as json0 from 'ot-json0';

// Register the JSON OT type (json0) required for list operations
ShareDB.types.register(json0.type);

type EgWalkerInsert = [number, number, string]; // [index, 0, "text"]
type EgWalkerDelete = [number, number];         // [index, count]
type TraceOp = EgWalkerInsert | EgWalkerDelete;

const batchSize = parseInt(process.argv[2] || "500");
const rawData = JSON.parse(fs.readFileSync("./datasets/A1.json", 'utf8'));

async function run() {
    const backend = new ShareDB();
    const connection = backend.connect();
    const doc = connection.get('benchmarks', 'list-1');
    await new Promise((res) => doc.create({ items: [] }, res));

    // Slice based on experimental batch size
    const alphaOps: TraceOp[] = rawData.edits.slice(0, batchSize);
    const bravoOps: TraceOp[] = rawData.edits.slice(batchSize, batchSize * 2);

    // 1. Establish "History" (Alpha's work)
    alphaOps.forEach((op: TraceOp) => doc.submitOp(translateToShareDB(op)));

    // 2. Measure the "Merge" (Applying Bravo's concurrent work)
    const memBefore = process.memoryUsage().heapUsed;
    const start = performance.now();

    for (const op of bravoOps) {
        doc.submitOp(translateToShareDB(op));
    }

    const duration = performance.now() - start;
    const memAfter = process.memoryUsage().heapUsed;
    
    // Payload for OT is the sum of serialized concurrent operations
    const payloadSize = Buffer.byteLength(JSON.stringify(bravoOps));

    saveResultsToCSV('ShareDB', duration, memAfter - memBefore, payloadSize, batchSize);
}

function translateToShareDB(traceOp: TraceOp) {
    if (traceOp.length === 3) {
        return { p: ['items', traceOp[0]], li: traceOp[2] }; 
    } else {
        return { p: ['items', traceOp[0]], ld: true }; 
    }
}

function saveResultsToCSV(algo: string, time: number, mem: number, payload: number, size: number) {
    const fileName = 'experimentResults.csv';
    const header = 'algorithm,batch_size,duration_ms,memory_bytes,payload_bytes\n';
    if (!fs.existsSync(fileName)) fs.writeFileSync(fileName, header);
    fs.appendFileSync(fileName, `${algo},${size},${time},${mem},${payload}\n`);
}

run().catch(console.error);