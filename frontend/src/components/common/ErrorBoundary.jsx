import React from "react";
import Button from "./Button";
import { AlertTriangleIcon } from "./Icons";

class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, message: "" };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, message: error?.message || "Something went wrong." };
  }

  componentDidCatch(error, info) {
    if (this.props.onError) this.props.onError(error, info);
  }

  handleRetry = () => {
    this.setState({ hasError: false, message: "" });
  };

  render() {
    if (this.state.hasError) {
      return (
        <div className="flex min-h-[60vh] items-center justify-center p-6">
          <div className="card flex w-full max-w-md flex-col items-center gap-3 p-10 text-center">
            <AlertTriangleIcon size={28} className="text-slate-300" />
            <p className="text-sm font-semibold text-slate-700">
              {this.props.message || "Unable to load this page."}
            </p>
            <p className="text-xs text-slate-400">{this.state.message}</p>
            <Button variant="secondary" size="sm" onClick={this.handleRetry}>
              Retry
            </Button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

export default ErrorBoundary;