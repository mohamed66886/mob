import React, { ReactNode } from "react";
import { View, Text, StyleSheet, Pressable } from "react-native";
import { appendReleaseLog } from "../lib/releaseLogger";

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

const BRAND = {
  primary: "#03468F",
  danger: "#EF4444",
  background: "#F8FAFC",
  surface: "#FFFFFF",
  text: "#0F172A",
  textMuted: "#64748B",
};

export class ErrorBoundary extends React.Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error("ErrorBoundary caught:", error, errorInfo);
    appendReleaseLog("error", "ErrorBoundary caught", {
      message: error?.message,
      stack: error?.stack,
      componentStack: errorInfo?.componentStack,
    });
  }

  render() {
    if (this.state.hasError) {
      return (
        <View style={styles.container}>
          <View style={styles.card}>
            <Text style={styles.title}>⚠️ Something went wrong</Text>
            <Text style={styles.error}>{this.state.error?.message}</Text>
            {this.state.error?.stack ? (
              <Text style={styles.stackPreview} numberOfLines={5}>
                {this.state.error.stack}
              </Text>
            ) : null}
            <Pressable
              onPress={() => this.setState({ hasError: false, error: null })}
              style={styles.button}
            >
              <Text style={styles.buttonText}>Try Again</Text>
            </Pressable>
          </View>
        </View>
      );
    }

    return this.props.children;
  }
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: BRAND.background,
  },
  card: {
    backgroundColor: BRAND.surface,
    padding: 24,
    borderRadius: 16,
    marginHorizontal: 20,
    borderLeftWidth: 4,
    borderLeftColor: BRAND.danger,
  },
  title: {
    fontSize: 18,
    fontWeight: "800",
    color: BRAND.text,
    marginBottom: 12,
  },
  error: {
    fontSize: 14,
    color: BRAND.textMuted,
    marginBottom: 16,
    lineHeight: 20,
  },
  stackPreview: {
    fontSize: 12,
    color: BRAND.textMuted,
    marginBottom: 16,
  },
  button: {
    backgroundColor: BRAND.primary,
    paddingVertical: 12,
    borderRadius: 8,
    alignItems: "center",
  },
  buttonText: {
    color: "#FFF",
    fontWeight: "600",
    fontSize: 16,
  },
});
