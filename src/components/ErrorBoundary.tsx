import { Component, type ErrorInfo, type ReactNode } from 'react';
import { View } from 'react-native';

import { track } from '@/events/track';
import { reportError } from '@/monitoring/sentry';
import { space } from '@/theme/tokens';

import { AppText } from './AppText';
import { Button } from './ui';

interface Props {
  /** Screen or area name recorded with the error event. */
  screen: string;
  children: ReactNode;
}

interface State {
  error: Error | null;
}

/** Catches render errors, logs an `error` event, and offers a retry instead of a blank app. */
export class ErrorBoundary extends Component<Props, State> {
  override state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  override componentDidCatch(error: Error, info: ErrorInfo) {
    reportError(error, { screen: this.props.screen });
    track('error', {
      screen: this.props.screen,
      message: error.message.slice(0, 300),
      component: (info.componentStack ?? '').trim().split('\n')[0]?.trim().slice(0, 120) ?? null,
    });
  }

  override render() {
    if (!this.state.error) return this.props.children;
    return (
      <View style={{ flex: 1, justifyContent: 'center', padding: space.xl, gap: space.md }}>
        <AppText variant="title" weight="bold">
          Something went wrong
        </AppText>
        <AppText tone="textMuted">{this.state.error.message}</AppText>
        <Button label="Try again" onPress={() => this.setState({ error: null })} />
      </View>
    );
  }
}
