#!/usr/bin/env python3
"""
Analyze Locust test results and generate summary report.

Usage:
    python analyze_results.py ../results/locust/load_test_stats.csv
    python analyze_results.py ../results/locust/load_test_stats.csv --format json
    python analyze_results.py ../results/locust/load_test_stats.csv --threshold 5
"""

import sys
import argparse
import pandas as pd
from pathlib import Path
import json
from datetime import datetime


def analyze_results(csv_file: str, failure_threshold: float = 5.0):
    """
    Analyze Locust test results.

    Args:
        csv_file: Path to Locust stats CSV file
        failure_threshold: Maximum acceptable failure rate (%)

    Returns:
        Dictionary with analysis results
    """
    # Read CSV
    df = pd.read_csv(csv_file)

    # Calculate overall statistics
    total_requests = df['Request Count'].sum()
    total_failures = df['Failure Count'].sum()
    failure_rate = (total_failures / total_requests * 100) if total_requests > 0 else 0

    # Calculate percentiles
    avg_response_time = df['Average Response Time'].mean()
    median_response_time = df['Median Response Time'].median()
    p95_response_time = df['95%'].mean()
    p99_response_time = df['99%'].mean()

    # Requests per second
    total_rps = df['Requests/s'].sum()

    # Find slowest endpoints
    slowest = df.nlargest(5, 'Average Response Time')[['Name', 'Average Response Time', 'Request Count']]

    # Find highest failure rate endpoints
    df['Failure Rate'] = (df['Failure Count'] / df['Request Count'] * 100).fillna(0)
    most_failures = df.nlargest(5, 'Failure Rate')[['Name', 'Failure Rate', 'Failure Count']]

    # Build analysis result
    analysis = {
        'timestamp': datetime.now().isoformat(),
        'summary': {
            'total_requests': int(total_requests),
            'total_failures': int(total_failures),
            'failure_rate': round(failure_rate, 2),
            'avg_response_time': round(avg_response_time, 2),
            'median_response_time': round(median_response_time, 2),
            'p95_response_time': round(p95_response_time, 2),
            'p99_response_time': round(p99_response_time, 2),
            'requests_per_second': round(total_rps, 2)
        },
        'slowest_endpoints': slowest.to_dict('records'),
        'highest_failure_endpoints': most_failures.to_dict('records'),
        'passed': failure_rate <= failure_threshold
    }

    return analysis


def print_text_report(analysis: dict):
    """Print analysis in text format."""
    print("\n" + "=" * 80)
    print("LOCUST TEST RESULTS ANALYSIS")
    print("=" * 80)
    print(f"Timestamp: {analysis['timestamp']}")
    print()

    # Summary
    summary = analysis['summary']
    print("SUMMARY")
    print("-" * 80)
    print(f"Total Requests:        {summary['total_requests']:,}")
    print(f"Total Failures:        {summary['total_failures']:,}")
    print(f"Failure Rate:          {summary['failure_rate']}%")
    print(f"Requests/Second:       {summary['requests_per_second']:.2f}")
    print()
    print(f"Avg Response Time:     {summary['avg_response_time']:.2f} ms")
    print(f"Median Response Time:  {summary['median_response_time']:.2f} ms")
    print(f"95th Percentile:       {summary['p95_response_time']:.2f} ms")
    print(f"99th Percentile:       {summary['p99_response_time']:.2f} ms")
    print()

    # Slowest endpoints
    print("SLOWEST ENDPOINTS")
    print("-" * 80)
    for endpoint in analysis['slowest_endpoints']:
        print(f"{endpoint['Name']:.<60} {endpoint['Average Response Time']:.2f} ms "
              f"({endpoint['Request Count']} requests)")
    print()

    # Highest failure endpoints
    print("HIGHEST FAILURE RATE ENDPOINTS")
    print("-" * 80)
    for endpoint in analysis['highest_failure_endpoints']:
        print(f"{endpoint['Name']:.<60} {endpoint['Failure Rate']:.2f}% "
              f"({int(endpoint['Failure Count'])} failures)")
    print()

    # Result
    print("RESULT")
    print("-" * 80)
    if analysis['passed']:
        print("✓ PASSED - Failure rate within acceptable threshold")
    else:
        print("✗ FAILED - Failure rate exceeds threshold")
    print("=" * 80)
    print()


def print_json_report(analysis: dict):
    """Print analysis in JSON format."""
    print(json.dumps(analysis, indent=2))


def main():
    parser = argparse.ArgumentParser(
        description='Analyze Locust test results',
        formatter_class=argparse.RawDescriptionHelpFormatter
    )
    parser.add_argument(
        'csv_file',
        help='Path to Locust stats CSV file'
    )
    parser.add_argument(
        '--format',
        choices=['text', 'json'],
        default='text',
        help='Output format (default: text)'
    )
    parser.add_argument(
        '--threshold',
        type=float,
        default=5.0,
        help='Maximum acceptable failure rate percentage (default: 5.0)'
    )

    args = parser.parse_args()

    # Check if file exists
    csv_path = Path(args.csv_file)
    if not csv_path.exists():
        print(f"Error: File not found: {args.csv_file}", file=sys.stderr)
        sys.exit(1)

    # Analyze results
    try:
        analysis = analyze_results(args.csv_file, args.threshold)

        # Print report
        if args.format == 'json':
            print_json_report(analysis)
        else:
            print_text_report(analysis)

        # Exit with appropriate code
        sys.exit(0 if analysis['passed'] else 1)

    except Exception as e:
        print(f"Error analyzing results: {e}", file=sys.stderr)
        import traceback
        traceback.print_exc()
        sys.exit(2)


if __name__ == '__main__':
    main()
