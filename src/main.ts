import { App, AppProps } from 'aws-cdk-lib';
import { ObeyaCiRunnerStack } from './obeya-ci-runner-stack';

/**
 * One stack in us-east-2 (the account is SCP-locked to it). No account: it
 * comes from the deploy credentials (the AWS_ACCOUNT_ID secret), and leaving
 * it unresolved keeps synth free of AWS lookups.
 */
export function createApp(props?: AppProps): App {
  const app = new App(props);
  new ObeyaCiRunnerStack(app, 'ObeyaCiRunner', {
    env: { region: 'us-east-2' },
  });
  return app;
}

if (require.main === module) {
  createApp().synth();
}
