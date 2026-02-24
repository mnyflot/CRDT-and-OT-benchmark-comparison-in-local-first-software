### PREREQUISITES

Before running the benchmarks, ensure you have the following installed:

* Node.js (v18.x or higher)

* npm (comes with Node.js)

* Python 3.x (with pandas and matplotlib)


### INSTALLATION

Clone the repository and navigate to the project root.

Install Node.js dependencies:

```
npm install
```

Install Python dependencies:

```
pip install pandas matplotlib
```

### Project Structure
* /testHarnesses: Contains the TypeScript benchmarking scripts.

    * automergeHarness.ts: CRDT implementation.

    * shareDBHarness.ts: OT implementation.

* /datasets: Place the A1.json editing trace here.

run-experiments.sh: Master shell script to orchestrate the tests.

visualize_results.py: Data analysis and graph generation.

### Running the Benchmark
 
 1. Execute the Tests
 The shell script will automatically run both algorithms across various batch sizes ($N=100$ to $5000$) three times each to ensure statistical accuracy.
 
```
# Give the script execution permission
chmod +x run-experiments.sh


# Run the master suite
./run-experiments.sh
```

2. Generate the Visualizations
Once the experiments are complete, a file named experimentResults.csv will be created. Use the Python script to generate the comparison graphs:

```
python3 visualize_results.py
```

### Measurement Metrics
The benchmark records the following data points for each merge event:

Duration (ms): The wall-clock time required to reconcile concurrent changes.

Memory (Bytes): The heap memory delta during the merge operation.

Payload Size (Bytes): 

* OT: The size of the operation log sent over the network.

* CRDT: The size of the binary state/changeset required for synchronization.