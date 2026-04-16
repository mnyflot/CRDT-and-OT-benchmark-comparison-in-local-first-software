import { type as json0 } from 'ot-json0';
import { performance } from 'perf_hooks';
import * as fs from 'fs';

// ── Types ──────────────────────────────────────────────────────────────────────
type EgWalkerInsert = [number, number, string];
type EgWalkerDelete = [number, number];
type TraceOp = EgWalkerInsert | EgWalkerDelete;

type Json0Op = { p: (string | number)[]; li?: string; ld?: string }[];
type Doc = { items: string[] };

// ── Args & Dataset ─────────────────────────────────────────────────────────────
const batchSize = parseInt(process.argv[2] || '500');
const datasetName = process.argv[3] || 'A1';

console.log(`Loading dataset: ${datasetName} | Batch size: ${batchSize}`);

const fileContent = fs.readFileSync(`./datasets/${datasetName}.json`, 'utf8');
const rawData = JSON.parse(fileContent);

const allTransactions = rawData.txns || [];
const allEdits: TraceOp[] = [];

for (const tx of allTransactions) {
    if (tx.patches && Array.isArray(tx.patches)) {
        for (const patch of tx.patches) allEdits.push(patch as TraceOp);
    } else if (tx.ops && Array.isArray(tx.ops)) {
        for (const op of tx.ops) allEdits.push(op as TraceOp);
    }
}

console.log(`✅ Flattened ${allEdits.length} individual edits.`);

if (allEdits.length < batchSize * 2) {
    console.warn(`⚠️  Dataset only has ${allEdits.length} edits but batchSize * 2 = ${batchSize * 2}. Bravo will have fewer ops than Alpha.`);
}

// ── Helpers ────────────────────────────────────────────────────────────────────

/**
 * Translates one trace operation into a json0 op array,
 * reading current doc state to populate `ld` values for deletes.
 * Returns null if the op is a no-op (e.g. delete past end of doc).
 */
function buildJson0Op(doc: Doc, patch: TraceOp): Json0Op | null {
    const [index, length, text] = patch as [number, number, string | undefined];
    const currentLen = doc.items.length;
    const safeIdx = Math.min(index, currentLen);

    if (text !== undefined) {
        // Insert each character as a separate li component.
        // json0 inserts are positional — each char shifts subsequent indices.
        const ops: Json0Op = [];
        for (let i = 0; i < text.length; i++) {
            ops.push({ p: ['items', safeIdx + i], li: text[i] });
        }
        return ops.length > 0 ? ops : null;
    } else {
        // Delete: json0 requires the actual value in `ld`.
        // Deletes collapse the array, so each subsequent delete is at the same index.
        const safeLen = Math.min(length, currentLen - safeIdx);
        if (safeLen <= 0) return null;

        // Each component deletes at the same index because the array collapses on each
        // delete. doc.items[safeIdx + i] is the original value, which lands at safeIdx
        // after i previous deletions — so the indices in the json0 op are correct.
        const ops: Json0Op = [];
        for (let i = 0; i < safeLen; i++) {
            ops.push({ p: ['items', safeIdx], ld: doc.items[safeIdx + i] });
        }
        return ops;
    }
}

/**
 * Applies a sequence of trace ops to a doc, collecting the json0 ops
 * that represent each change. Returns the composed single json0 op
 * covering all changes (or null if no-ops).
 */
function buildAndApplyOps(doc: Doc, patches: TraceOp[]): { composed: Json0Op | null; finalDoc: Doc } {
    let composed: Json0Op | null = null;
    let currentDoc = doc;

    for (const patch of patches) {
        const op = buildJson0Op(currentDoc, patch);
        if (!op) continue;

        // Accumulate into a single composed op
        composed = composed ? (json0.compose(composed, op) as Json0Op) : op;

        // Advance our local state
        currentDoc = json0.apply(JSON.parse(JSON.stringify(currentDoc)), op) as Doc;
    }

    return { composed, finalDoc: currentDoc };
}

// ── Setup: Shared Baseline ─────────────────────────────────────────────────────

const initialDoc: Doc = {
    items: rawData.startContent ? rawData.startContent.split('') : [],
};

const alphaEdits = allEdits.slice(0, batchSize);
const bravoEdits = allEdits.slice(batchSize, batchSize * 2);

// ── Offline Work (not measured) ────────────────────────────────────────────────
// Both peers start from the same baseline and diverge independently.

const alphaBase: Doc = JSON.parse(JSON.stringify(initialDoc));
const bravoBase: Doc = JSON.parse(JSON.stringify(initialDoc));

console.log('Applying alpha ops...');
const { composed: alphaComposed, finalDoc: alphaDoc } = buildAndApplyOps(alphaBase, alphaEdits);

console.log('Applying bravo ops...');
const { composed: bravoComposed } = buildAndApplyOps(bravoBase, bravoEdits);

if (!alphaComposed && !bravoComposed) {
    console.warn('No ops to merge — check your dataset / batch size.');
    process.exit(0);
}

// ── Measure: OT Merge ──────────────────────────────────────────────────────────
// This mirrors what Yjs does with Y.applyUpdate and Automerge.merge:
//   transform bravo's ops over alpha's ops, then apply to alpha's state.
//
// If one side has no ops, the merge is trivially applying the other side.

if (global.gc) global.gc();
const memBefore = process.memoryUsage().heapUsed;
const start = performance.now();

let mergedDoc: Doc;

if (!alphaComposed) {
    // Alpha did nothing — bravo's ops apply directly
    mergedDoc = json0.apply(JSON.parse(JSON.stringify(initialDoc)), bravoComposed!) as Doc;
} else if (!bravoComposed) {
    // Bravo did nothing — alpha's state is the merged state
    mergedDoc = alphaDoc;
} else {
    // Core OT step: transform bravo's op assuming alpha's op has already been applied,
    // then apply the transformed op to alpha's final state.
    const transformedBravo = json0.transform(bravoComposed, alphaComposed, 'left') as Json0Op;
    mergedDoc = json0.apply(JSON.parse(JSON.stringify(alphaDoc)), transformedBravo) as Doc;
}

const duration = performance.now() - start;
const memPeak = process.memoryUsage().heapUsed;

if (global.gc) global.gc();
const memAtRest = process.memoryUsage().heapUsed;

// Payload: the wire size of bravo's composed op (what would be transmitted to alpha).
// This is analogous to Y.encodeStateAsUpdate / Automerge.save in the other benchmarks.
const payloadSize = Buffer.byteLength(JSON.stringify(bravoComposed));

console.log(`✅ Merged doc length: ${mergedDoc.items.length} chars`);
console.log(`   Duration:   ${duration.toFixed(3)} ms`);
console.log(`   Peak mem:   ${((memPeak - memBefore) / 1024).toFixed(1)} KB`);
console.log(`   Rest mem:   ${((memAtRest - memBefore) / 1024).toFixed(1)} KB`);
console.log(`   Payload:    ${(payloadSize / 1024).toFixed(1)} KB`);

saveResultsToCSV('OT-json0', datasetName, duration, memPeak - memBefore, memAtRest - memBefore, payloadSize, batchSize);

// ── CSV Output ─────────────────────────────────────────────────────────────────
function saveResultsToCSV(
    algo: string,
    dataset: string,
    time: number,
    peakMem: number,
    restMem: number,
    payload: number,
    size: number,
) {
    const fileName = 'experimentResults.csv';
    const header = 'algorithm,dataset,batch_size,duration_ms,peak_memory_bytes,at_rest_memory_bytes,payload_bytes\n';
    if (!fs.existsSync(fileName)) fs.writeFileSync(fileName, header);
    fs.appendFileSync(fileName, `${algo},${dataset},${size},${time},${peakMem},${restMem},${payload}\n`);
}