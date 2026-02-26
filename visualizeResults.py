import pandas as pd
import matplotlib.pyplot as plt
import os

def generate_plots():
    try:
        df = pd.read_csv('experimentResults.csv')
    except FileNotFoundError:
        print("Error: experimentResults.csv not found.")
        return

    # Group by dataset AND algorithm AND batch_size to get the means
    averages = df.groupby(['dataset', 'algorithm', 'batch_size']).mean().reset_index()

    datasets = averages['dataset'].unique()
    algorithms = averages['algorithm'].unique()
    colors = {'Automerge': '#1f77b4', 'ShareDB': '#ff7f0e'}

    # Generate a separate figure for each dataset
    for ds in datasets:
        ds_data = averages[averages['dataset'] == ds]
        
        fig, (ax1, ax2, ax3) = plt.subplots(1, 3, figsize=(18, 6))
        fig.suptitle(f'Performance Comparison ({ds} Dataset): Automerge vs ShareDB', fontsize=16)

        for algo in algorithms:
            algo_data = ds_data[ds_data['algorithm'] == algo]
            
            # Plot 1: Time
            ax1.plot(algo_data['batch_size'], algo_data['duration_ms'], marker='o', label=algo, color=colors.get(algo, '#000'))
            ax1.set_title('Merge Duration')
            ax1.set_xlabel('Batch Size')
            ax1.set_ylabel('Time (ms)')
            ax1.grid(True, linestyle='--', alpha=0.7)

            # Plot 2: Memory
            ax2.plot(algo_data['batch_size'], algo_data['memory_bytes'] / (1024 * 1024), marker='s', label=algo, color=colors.get(algo, '#000'))
            ax2.set_title('Memory Overhead')
            ax2.set_xlabel('Batch Size')
            ax2.set_ylabel('Memory (MB)')
            ax2.grid(True, linestyle='--', alpha=0.7)

            # Plot 3: Payload
            ax3.plot(algo_data['batch_size'], algo_data['payload_bytes'] / 1024, marker='^', label=algo, color=colors.get(algo, '#000'))
            ax3.set_title('Sync Payload Size')
            ax3.set_xlabel('Batch Size')
            ax3.set_ylabel('Payload (KB)')
            ax3.grid(True, linestyle='--', alpha=0.7)

        ax1.legend()
        plt.tight_layout(rect=[0, 0.03, 1, 0.95])
        
        # Save each graph dynamically based on the dataset name
        filename = f'thesis_results_{ds}.png'
        plt.savefig(filename, dpi=300)
        print(f"📈 Graph generated successfully: {filename}")
        plt.close(fig)

if __name__ == "__main__":
    generate_plots()