import * as Automerge from "@automerge/automerge";
import { performance } from "perf_hooks";
import * as fs from "fs";

type EgWalkerInsert = [number, number, string];
type EgWalkerDelete = [number, number];
type TraceOp = EgWalkerInsert | EgWalkerDelete;

const batchSize = parseInt(process.argv[2] || "500");
const rawData = JSON.parse(fs.readFileSync("./datasets/A1.json", "utf8"));

// 1. Initial Setup
let docAlpha = Automerge.init();
docAlpha = Automerge.change(docAlpha, (d: any) => { d.items = []; });
let docBravo = Automerge.clone(docAlpha);

const alphaOps: TraceOp[] = rawData.edits.slice(0, batchSize);
const bravoOps: TraceOp[] = rawData.edits.slice(batchSize, batchSize * 2);

// 2. Apply "Offline" Work
docAlpha = Automerge.change(docAlpha, (d: any) => {
    for (const op of alphaOps) {
        if (op.length === 3) d.items.insertAt(op[0], ...op[2].split(""));
        else d.items.deleteAt(op[0], op[1]);
    }
});

docBravo = Automerge.change(docBravo, (d: any) => {
    for (const op of bravoOps) {
        if (op.length === 3) d.items.insertAt(op[0], ...op[2].split(""));
        else d.items.deleteAt(op[0], op[1]);
    }
});

// 3. Measure the "Merge"
const memBefore = process.memoryUsage().heapUsed;
const start = performance.now();

// Automerge handles the convergence of two independent states
const finalDoc = Automerge.merge(docAlpha, docBravo); 

const duration = performance.now() - start;
const memAfter = process.memoryUsage().heapUsed;

// Payload for CRDT is the binary representation of the merged state
const payloadSize = Automerge.save(finalDoc).length; 

saveResultsToCSV('Automerge', duration, memAfter - memBefore, payloadSize, batchSize);

function saveResultsToCSV(algo: string, time: number, mem: number, payload: number, size: number) {
    const fileName = 'experimentResults.csv';
    const header = 'algorithm,batch_size,duration_ms,memory_bytes,payload_bytes\n';
    if (!fs.existsSync(fileName)) fs.writeFileSync(fileName, header);
    fs.appendFileSync(fileName, `${algo},${size},${time},${mem},${payload}\n`);
}