#!/bin/zsh

# batch sizes (operations per peer)
# This simulates increasing levels of disconnected work
BATCH_SIZES=(100 500 1000 2500 5000)

# output file
RESULTS_FILE="experimentResults.csv"

# Remove existing results
if [ -f "$RESULTS_FILE" ]; then
    rm "$RESULTS_FILE"
fi

echo "Starting Master Benchmark Runner..."

for SIZE in "${BATCH_SIZES[@]}"
do
    echo "------------------------------------------------"
    echo "Testing Batch Size: $SIZE operations per peer"
    echo "------------------------------------------------"
    
    # Run each algorithm 3 times to get an average
    for i in {1..3}
    do
        echo "Run $i: Automerge..."
        npx tsx testharnesses/automergeHarness.ts "$SIZE"
        
        echo "Run $i: ShareDB..."
        npx tsx testHarnesses/sharedbHarness.ts "$SIZE"
    done
done

echo "All experiments complete. Data saved to $RESULTS_FILE"