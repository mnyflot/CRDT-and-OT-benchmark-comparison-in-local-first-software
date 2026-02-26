#!/bin/zsh

# Define the datasets to test
DATASETS=("A1" "A2" "C1" "C2" "S1" "S2" "S3")

# Batch sizes (operations per peer)
# This simulates increasing levels of disconnected work
BATCH_SIZES=(100 500 1000 2500 5000)

RESULTS_FILE="experimentResults.csv"

# Remove existing results
if [ -f "$RESULTS_FILE" ]; then
    rm "$RESULTS_FILE"
fi

echo "Starting Multi-Dataset Benchmark Runner..."

for DATASET in "${DATASETS[@]}"
do
    echo "================================================"
    echo "TESTING DATASET: $DATASET"
    echo "================================================"

    for SIZE in "${BATCH_SIZES[@]}"
    do
        echo "Batch Size: $SIZE ops per peer"
        
        for i in {1..3}
        do
            # Notice we now pass $SIZE and $DATASET
            npx tsx testHarnesses/automergeHarness.ts "$SIZE" "$DATASET"
            npx tsx testHarnesses/sharedbHarness.ts "$SIZE" "$DATASET"
        done
    done
done

echo "✅ All experiments complete. Data saved to $RESULTS_FILE"