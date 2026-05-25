import pandas as pd
import matplotlib.pyplot as plt
import numpy as np

COLORS = {
    'Automerge': '#1f77b4',
    'ShareDB':   '#ff7f0e',
    'Yjs':       '#2ca02c',
    'OT-json0':  '#d62728',
}


def plot_dataset(averages, ds, output_prefix, log_duration):
    ds_data = averages[averages['dataset'] == ds]
    algorithms = ds_data['algorithm'].unique()

    fig, ((ax1, ax2), (ax3, ax4)) = plt.subplots(2, 2, figsize=(14, 10))
    fig.suptitle(f'Performance Comparison ({ds} Dataset): CRDTs vs OT', fontsize=16)

    for algo in algorithms:
        algo_data = ds_data[ds_data['algorithm'] == algo].sort_values('batch_size')
        color = COLORS.get(algo, '#000')

        # Plot 1: Merge duration. Replace zeros with NaN when using log scale,
        # since log(0) is undefined and matplotlib will simply skip NaN points.
        duration_values = algo_data['duration_ms'].astype(float)
        if log_duration:
            duration_values = duration_values.replace(0, np.nan)
        ax1.plot(algo_data['batch_size'], duration_values,
                 marker='o', label=algo, color=color)

        # Plot 2: Peak memory
        ax2.plot(algo_data['batch_size'], algo_data['peak_memory_bytes'] / (1024 * 1024),
                 marker='s', label=algo, color=color)

        # Plot 3: At-rest memory
        ax3.plot(algo_data['batch_size'], algo_data['at_rest_memory_bytes'] / (1024 * 1024),
                 marker='D', label=algo, color=color)

        # Plot 4: Payload
        ax4.plot(algo_data['batch_size'], algo_data['payload_bytes'] / 1024,
                 marker='^', label=algo, color=color)

    # Axis labels, titles, scales, grids
    ax1.set_title('Merge Duration')
    ax1.set_xlabel('Batch Size')
    ax1.set_ylabel('Time (ms, log scale)' if log_duration else 'Time (ms)')
    if log_duration:
        ax1.set_yscale('log')
    ax1.grid(True, linestyle='--', alpha=0.7,
             which='both' if log_duration else 'major')

    ax2.set_title('Peak Memory Overhead (In-Flight)')
    ax2.set_xlabel('Batch Size')
    ax2.set_ylabel('Memory (MB)')
    ax2.grid(True, linestyle='--', alpha=0.7)

    ax3.set_title('At-Rest Memory (Post-GC)')
    ax3.set_xlabel('Batch Size')
    ax3.set_ylabel('Memory (MB)')
    ax3.grid(True, linestyle='--', alpha=0.7)

    ax4.set_title('Sync Payload Size')
    ax4.set_xlabel('Batch Size')
    ax4.set_ylabel('Payload (KB)')
    ax4.grid(True, linestyle='--', alpha=0.7)

    ax1.legend()
    plt.tight_layout(rect=[0, 0.03, 1, 0.95])

    filename = f'{output_prefix}_{ds}.png'
    plt.savefig(filename, dpi=300)
    print(f"📈 Graph generated: {filename}")
    plt.close(fig)


def generate_plots():
    try:
        df = pd.read_csv('experimentResults.csv')
    except FileNotFoundError:
        print("Error: experimentResults.csv not found.")
        return

    averages = df.groupby(['dataset', 'algorithm', 'batch_size']).median().reset_index()
    datasets = averages['dataset'].unique()

    # Main thesis figures: all four algorithms, log scale on merge duration
    for ds in datasets:
        plot_dataset(averages, ds, 'thesis_results', log_duration=True)

    # Appendix detail figures: ot-json0 filtered out, linear scales throughout
    averages_no_otjson = averages[averages['algorithm'] != 'OT-json0']
    for ds in datasets:
        plot_dataset(averages_no_otjson, ds, 'appendix_detail', log_duration=False)


if __name__ == "__main__":
    generate_plots()