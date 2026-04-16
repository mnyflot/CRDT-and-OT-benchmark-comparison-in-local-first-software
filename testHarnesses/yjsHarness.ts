import * as Y from 'yjs';
import { performance } from 'perf_hooks';
import * as fs from 'fs';

type EgWalkerInsert = [number, number, string];
type EgWalkerDelete = [number, number];
type TraceOp = EgWalkerInsert | EgWalkerDelete;

const batchSize = parseInt(process.argv[2] || "500");
const datasetName = process.argv[3] || "A1";

const fileContent = fs.readFileSync(`./datasets/${datasetName}.json`, 'utf8');
const rawData = JSON.parse(fileContent);

const allTransactions = rawData.txns || [];
const allEdits: TraceOp[] = [];

for (const tx of allTransactions) {
    if (tx.patches && Array.isArray(tx.patches)) {
        for (const patch of tx.patches) {
            allEdits.push(patch as TraceOp);
        }
    } else if (tx.ops && Array.isArray(tx.ops)) {
        for (const op of tx.ops) {
            allEdits.push(op as TraceOp);
        }
    }
}

if (allEdits.length < batchSize * 2) {
    console.warn(`⚠️  Dataset only has ${allEdits.length} edits but batchSize * 2 = ${batchSize * 2}. Bravo will have fewer ops than Alpha.`);
}

// Initial Setup with startContent
const docAlpha = new Y.Doc();
const textAlpha = docAlpha.getText('items');

if (rawData.startContent) {
    textAlpha.insert(0, rawData.startContent);
}

// Clone to Bravo to establish shared history
const stateVectorAlpha = Y.encodeStateAsUpdate(docAlpha);
const docBravo = new Y.Doc();
Y.applyUpdate(docBravo, stateVectorAlpha);
const textBravo = docBravo.getText('items');

const alphaOps = allEdits.slice(0, batchSize);
const bravoOps = allEdits.slice(batchSize, batchSize * 2);

// Apply "Offline" Work
// wrap changes in a transact block to group them locally
let clampedOps = 0;
docAlpha.transact(() => {
    for (const op of alphaOps) {
        const [idx, len, txt] = op;
        const safeIdx = Math.min(idx, textAlpha.length);
        if (safeIdx !== idx) clampedOps++;
        if (txt !== undefined) {
            textAlpha.insert(safeIdx, txt);
        } else {
            const safeLen = Math.min(len, textAlpha.length - safeIdx);
            if (safeLen > 0) textAlpha.delete(safeIdx, safeLen);
        }
    }
});

docBravo.transact(() => {
    for (const op of bravoOps) {
        const [idx, len, txt] = op;
        const safeIdx = Math.min(idx, textBravo.length);
        if (safeIdx !== idx) clampedOps++;
        if (txt !== undefined) {
            textBravo.insert(safeIdx, txt);
        } else {
            const safeLen = Math.min(len, textBravo.length - safeIdx);
            if (safeLen > 0) textBravo.delete(safeIdx, safeLen);
        }
    }
});

if (clampedOps > 0) console.warn(`⚠️  ${clampedOps} ops had out-of-bounds indices and were clamped.`);

// Encode only what Bravo has that Alpha doesn't — this is what would actually be transmitted.
const bravoUpdate = Y.encodeStateAsUpdate(docBravo, Y.encodeStateVector(docAlpha));

// Measure the "Merge"
if (global.gc) global.gc();
const memBefore = process.memoryUsage().heapUsed;
const start = performance.now();

// Apply Bravo's updates to Alpha
Y.applyUpdate(docAlpha, bravoUpdate);

const duration = performance.now() - start;
const memPeak = process.memoryUsage().heapUsed;

if (global.gc) global.gc();
const memAtRest = process.memoryUsage().heapUsed;

// Payload: the incremental update Bravo transmitted to Alpha (already computed above).
const payloadSize = bravoUpdate.byteLength;

saveResultsToCSV('Yjs', datasetName, duration, memPeak - memBefore, memAtRest - memBefore, payloadSize, batchSize);

function saveResultsToCSV(algo: string, dataset: string, time: number, peakMem: number, restMem: number, payload: number, size: number) {
    const fileName = 'experimentResults.csv';
    const header = 'algorithm,dataset,batch_size,duration_ms,peak_memory_bytes,at_rest_memory_bytes,payload_bytes\n';
    if (!fs.existsSync(fileName)) fs.writeFileSync(fileName, header);
    fs.appendFileSync(fileName, `${algo},${dataset},${size},${time},${peakMem},${restMem},${payload}\n`);
}