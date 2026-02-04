import pandas as pd
import matplotlib.pyplot as plt

def generate_plots():
    # 1. Load the data
    try:
        df = pd.read_csv('experimentResults.csv')
    except FileNotFoundError:
        print("Error: experimentResults.csv not found. Run your harnesses first!")
        return

    # 2. Group by algorithm and batch_size to get the mean
    # This averages the 3 runs for each size
    averages = df.groupby(['algorithm', 'batch_size']).mean().reset_index()

    # 3. Create a figure with 3 subplots
    fig, (ax1, ax2, ax3) = plt.subplots(1, 3, figsize=(18, 6))
    fig.suptitle('Performance Comparison: Automerge (CRDT) vs ShareDB (OT)', fontsize=16)

    algorithms = averages['algorithm'].unique()
    colors = {'Automerge': '#1f77b4', 'ShareDB': '#ff7f0e'}

    for algo in algorithms:
        data = averages[averages['algorithm'] == algo]
        
        # Plot 1: Merge Time
        ax1.plot(data['batch_size'], data['duration_ms'], marker='o', label=algo, color=colors[algo])
        ax1.set_title('Merge Duration (Lower is Better)')
        ax1.set_xlabel('Batch Size (Operations)')
        ax1.set_ylabel('Time (ms)')
        ax1.grid(True, linestyle='--', alpha=0.7)

        # Plot 2: Memory Usage
        # Converting bytes to MB for readability
        ax2.plot(data['batch_size'], data['memory_bytes'] / (1024 * 1024), marker='s', label=algo, color=colors[algo])
        ax2.set_title('Memory Overhead (Lower is Better)')
        ax2.set_xlabel('Batch Size (Operations)')
        ax2.set_ylabel('Memory (MB)')
        ax2.grid(True, linestyle='--', alpha=0.7)

        # Plot 3: Payload Size
        # Converting bytes to KB
        ax3.plot(data['batch_size'], data['payload_bytes'] / 1024, marker='^', label=algo, color=colors[algo])
        ax3.set_title('Sync Payload Size (Lower is Better)')
        ax3.set_xlabel('Batch Size (Operations)')
        ax3.set_ylabel('Payload (KB)')
        ax3.grid(True, linestyle='--', alpha=0.7)

    # Add legend to the first plot
    ax1.legend()
    
    plt.tight_layout(rect=[0, 0.03, 1, 0.95])
    plt.savefig('thesisComparisonResults.png', dpi=300)
    print("Graphs generated successfully: thesisComparisonResults.png")
    plt.show()

if __name__ == "__main__":
    generate_plots()