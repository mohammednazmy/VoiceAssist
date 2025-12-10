/**
 * ChatErrorBoundary Component
 * Error boundary for chat streaming failures
 */

import { Component, ErrorInfo, ReactNode } from "react";

interface Props {
  children: ReactNode;
  onError?: (error: Error, errorInfo: ErrorInfo) => void;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ChatErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = {
      hasError: false,
      error: null,
    };
  }

  static getDerivedStateFromError(error: Error): State {
    return {
      hasError: true,
      error,
    };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error("[ChatErrorBoundary] Caught error:", error, errorInfo);
    this.props.onError?.(error, errorInfo);
  }

  handleReset = () => {
    this.setState({
      hasError: false,
      error: null,
    });
  };

  render() {
    if (this.state.hasError) {
      return (
        <div className="flex items-center justify-center h-full bg-neutral-50">
          <div className="max-w-md p-6 bg-white rounded-lg shadow-md border border-red-200">
            <div className="flex items-center space-x-3 mb-4">
              <div className="flex items-center justify-center w-12 h-12 rounded-full bg-red-100">
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  fill="none"
                  viewBox="0 0 24 24"
                  strokeWidth={1.5}
                  stroke="currentColor"
                  className="w-6 h-6 text-red-600"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z"
                  />
                </svg>
              </div>
              <h3 className="text-lg font-semibold text-neutral-900">
                Chat Error
              </h3>
            </div>

            <p className="text-sm text-neutral-700 mb-4">
              Something went wrong with the chat. Please try refreshing the page
              or contact support if the problem persists.
            </p>

            {this.state.error && (
              <details className="mb-4">
                <summary className="text-sm text-neutral-600 cursor-pointer hover:text-neutral-800">
                  Error details
                </summary>
                <pre className="mt-2 p-3 bg-neutral-100 rounded text-xs text-neutral-800 overflow-auto max-h-32">
                  {this.state.error.toString()}
                </pre>
              </details>
            )}

            <div className="flex space-x-3">
              <button
                type="button"
                onClick={this.handleReset}
                className="flex-1 px-4 py-2 bg-primary-500 text-white rounded-md hover:bg-primary-600 transition-colors"
              >
                Try Again
              </button>
              <button
                type="button"
                onClick={() => window.location.reload()}
                className="flex-1 px-4 py-2 bg-neutral-200 text-neutral-700 rounded-md hover:bg-neutral-300 transition-colors"
              >
                Refresh Page
              </button>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
