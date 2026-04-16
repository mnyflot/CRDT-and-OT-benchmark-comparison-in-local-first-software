import pandas as pd
import matplotlib.pyplot as plt

def generate_plots():
    try:
        df = pd.read_csv('experimentResults.csv')
    except FileNotFoundError:
        print("Error: experimentResults.csv not found.")
        return

    averages = df.groupby(['dataset', 'algorithm', 'batch_size']).median().reset_index()
    datasets = averages['dataset'].unique()
    algorithms = averages['algorithm'].unique()

    colors = {'Automerge': '#1f77b4', 'ShareDB': '#ff7f0e', 'Yjs': '#2ca02c', 'OT-json0': '#d62728'}

    for ds in datasets:
        ds_data = averages[averages['dataset'] == ds]
        
        # Create a 2x2 grid
        fig, ((ax1, ax2), (ax3, ax4)) = plt.subplots(2, 2, figsize=(14, 10))
        fig.suptitle(f'Performance Comparison ({ds} Dataset): CRDTs vs OT', fontsize=16)

        for algo in algorithms:
            algo_data = ds_data[ds_data['algorithm'] == algo]
            
            # Plot 1: Time
            ax1.plot(algo_data['batch_size'], algo_data['duration_ms'], marker='o', label=algo, color=colors.get(algo, '#000'))
            ax1.set_title('Merge Duration')
            ax1.set_xlabel('Batch Size')
            ax1.set_ylabel('Time (ms)')
            ax1.grid(True, linestyle='--', alpha=0.7)

            # Plot 2: Peak Memory (Heap Churn)
            ax2.plot(algo_data['batch_size'], algo_data['peak_memory_bytes'] / (1024 * 1024), marker='s', label=algo, color=colors.get(algo, '#000'))
            ax2.set_title('Peak Memory Overhead (In-Flight)')
            ax2.set_xlabel('Batch Size')
            ax2.set_ylabel('Memory (MB)')
            ax2.grid(True, linestyle='--', alpha=0.7)

            # Plot 3: At-Rest Memory (Post-GC)
            ax3.plot(algo_data['batch_size'], algo_data['at_rest_memory_bytes'] / (1024 * 1024), marker='D', label=algo, color=colors.get(algo, '#000'))
            ax3.set_title('At-Rest Memory (Post-GC)')
            ax3.set_xlabel('Batch Size')
            ax3.set_ylabel('Memory (MB)')
            ax3.grid(True, linestyle='--', alpha=0.7)

            # Plot 4: Payload
            ax4.plot(algo_data['batch_size'], algo_data['payload_bytes'] / 1024, marker='^', label=algo, color=colors.get(algo, '#000'))
            ax4.set_title('Sync Payload Size')
            ax4.set_xlabel('Batch Size')
            ax4.set_ylabel('Payload (KB)')
            ax4.grid(True, linestyle='--', alpha=0.7)

        ax1.legend()
        plt.tight_layout(rect=[0, 0.03, 1, 0.95])
        
        filename = f'thesis_results_{ds}.png'
        plt.savefig(filename, dpi=300)
        print(f"📈 Graph generated: {filename}")
        plt.close(fig)

if __name__ == "__main__":
    generate_plots()