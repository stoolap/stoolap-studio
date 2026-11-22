
import { Component, type ReactNode } from "react";
import { AlertCircle, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import i18n from "@/lib/i18n";

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="h-screen flex items-center justify-center bg-background text-foreground">
          <div className="max-w-md text-center space-y-4 p-8">
            <AlertCircle className="h-12 w-12 text-destructive mx-auto" />
            <h2 className="text-lg font-semibold">{i18n.t("common:errorBoundary.title")}</h2>
            <p className="text-sm text-muted-foreground">
              {this.state.error?.message || i18n.t("common:errorBoundary.unexpected")}
            </p>
            <Button
              onClick={() => {
                this.setState({ hasError: false, error: null });
              }}
              className="gap-2"
            >
              <RefreshCw className="h-4 w-4" />
              {i18n.t("common:errorBoundary.tryAgain")}
            </Button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
