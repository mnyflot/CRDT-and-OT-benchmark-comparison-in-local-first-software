import * as Automerge from "@automerge/automerge";
import { performance } from "perf_hooks";
import * as fs from "fs";

// --- 1. Dataset Translator ---
// This class converts Eg-walker traces into Automerge operations.
class TraceRunner {
    static run(doc: any, trace: any[]): any {
        return Automerge.change(doc, (d: any) => {
            for (const op of trace) {
                // Eg-walker traces typically use: [index, length, "text"] or [index, deleteCount]
                if (op.length === 3) {
                    // Insertion: index, 0 (don't delete), text
                    d.items.insertAt(op[0], ...op[2].split(""));
                } else if (op.length === 2) {
                    // Deletion: index, count
                    d.items.deleteAt(op[0], op[1]);
                }
            }
        });
    }
}

async function benchmark() {
    console.log("Starting Automerge High-Latency Merge Benchmark...");

    // --- 2. Load Dataset ---
    // Assuming the Eg-walker JSON trace is saved locally
    const rawData = JSON.parse(fs.readFileSync("./datasets/editing-trace.json", "utf8"));
    const { alphaOps, bravoOps } = splitOpsForConcurrency(rawData.edits);

    // --- 3. Initial Setup ---
    // Start from a common ancestor to allow merging
    let docAlpha = Automerge.init();
    docAlpha = Automerge.change(docAlpha, (d: any) => { d.items = []; });
    let docBravo = Automerge.clone(docAlpha); // Cloned docs share history

    // --- 4. Disconnected Operation ---
    // Peer Alpha and Peer Bravo work independently
    docAlpha = TraceRunner.run(docAlpha, alphaOps);
    docBravo = TraceRunner.run(docBravo, bravoOps);

    // --- 5. The Core Experiment: The Remote Merge ---
    // We measure the time and memory cost of merging hours of offline work
    const memoryBefore = process.memoryUsage().heapUsed;
    
    // Get binary changes from Bravo to send to Alpha
    const changesFromBravo = Automerge.getChanges(docAlpha, docBravo); 
    
    const startMerge = performance.now();
    // In Automerge 2.0+, merge() is often a wrapper for applyChanges
    const finalDoc = Automerge.merge(docAlpha, docBravo); 
    const endMerge = performance.now();

    const memoryAfter = process.memoryUsage().heapUsed;

    // --- 6. Results & Metadata Analysis ---
    console.log(`--- Results ---`);
    console.log(`Merge Duration: ${(endMerge - startMerge).toFixed(4)} ms`);
    console.log(`Memory Overhead: ${((memoryAfter - memoryBefore) / 1024 / 1024).toFixed(2)} MB`);
    
    // Measuring the 'at rest' file size of the metadata
    const binarySize = Automerge.save(finalDoc).length;
    console.log(`Binary Storage Size: ${(binarySize / 1024).toFixed(2)} KB`);
}

function splitOpsForConcurrency(edits: any[]) {
    // Logic to split the trace into two concurrent streams
    const midpoint = Math.floor(edits.length / 2);
    return {
        alphaOps: edits.slice(0, midpoint),
        bravoOps: edits.slice(midpoint)
    };
}

benchmark().catch(console.error);