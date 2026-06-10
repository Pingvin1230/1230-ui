export interface ApplicationComponentProps {
  sessionId: string | null;
  config: Record<string, unknown>;
}

export type ApplicationComponent = React.ComponentType<ApplicationComponentProps>;
