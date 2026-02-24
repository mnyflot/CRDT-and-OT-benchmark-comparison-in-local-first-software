import * as Automerge from "@automerge/automerge";
import { performance } from "perf_hooks";
import * as fs from "fs";

type EgWalkerInsert = [number, number, string];
type EgWalkerDelete = [number, number];
type TraceOp = EgWalkerInsert | EgWalkerDelete;

const batchSize = parseInt(process.argv[2] || "500");
const fileContent = fs.readFileSync("./datasets/A1.json", "utf8");
const rawData = JSON.parse(fileContent);

const allTransactions = rawData.txns || [];
const allEdits: TraceOp[] = [];

console.log(`Analyzing A1.json: Found ${allTransactions.length} transactions.`);

for (const tx of allTransactions) {
    if (tx.patches && Array.isArray(tx.patches)) {
        allEdits.push(...(tx.patches as TraceOp[]));
    }
}

console.log(`✅ Successfully flattened ${allEdits.length} individual edits.`);

// Initial Setup with startContent
let docAlpha = Automerge.init();
docAlpha = Automerge.change(docAlpha, (d: any) => { 
    d.items = []; 
    // Load the initial document state if it exists in the trace
    if (rawData.startContent) {
        d.items.insertAt(0, ...rawData.startContent.split(""));
    }
});
let docBravo = Automerge.clone(docAlpha);

const alphaOps: TraceOp[] = allEdits.slice(0, batchSize);
const bravoOps: TraceOp[] = allEdits.slice(batchSize, batchSize * 2);

// Apply "Offline" Work using Safe Indices
docAlpha = Automerge.change(docAlpha, (d: any) => {
    for (const op of alphaOps) {
        const safeIdx = Math.min(op[0], d.items.length); // Prevent RangeError
        if (op[2] !== undefined) d.items.insertAt(safeIdx, ...op[2].split(""));
        else d.items.deleteAt(safeIdx, Math.min(op[1], d.items.length - safeIdx));
    }
});

docBravo = Automerge.change(docBravo, (d: any) => {
    for (const op of bravoOps) {
        const safeIdx = Math.min(op[0], d.items.length); // Prevent RangeError
        if (op[2] !== undefined) d.items.insertAt(safeIdx, ...op[2].split(""));
        else d.items.deleteAt(safeIdx, Math.min(op[1], d.items.length - safeIdx));
    }
});

// Measure the "Merge"
const memBefore = process.memoryUsage().heapUsed;
const start = performance.now();

const finalDoc = Automerge.merge(docAlpha, docBravo); 

const duration = performance.now() - start;
const memAfter = process.memoryUsage().heapUsed;
const payloadSize = Automerge.save(finalDoc).length; 

saveResultsToCSV('Automerge', duration, memAfter - memBefore, payloadSize, batchSize);

function saveResultsToCSV(algo: string, time: number, mem: number, payload: number, size: number) {
    const fileName = 'experimentResults.csv';
    const header = 'algorithm,batch_size,duration_ms,memory_bytes,payload_bytes\n';
    if (!fs.existsSync(fileName)) fs.writeFileSync(fileName, header);
    fs.appendFileSync(fileName, `${algo},${size},${time},${mem},${payload}\n`);
}