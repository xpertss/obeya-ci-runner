import { Stack, Token } from 'aws-cdk-lib';
import { createApp } from '../src/main';

test('main.ts targets us-east-2 and leaves the account to the deploy credentials', () => {
  delete process.env.CDK_DEFAULT_ACCOUNT;
  delete process.env.CDK_DEFAULT_REGION;
  const app = createApp({ context: { obeyaRunnerAmiId: 'ami-0123456789abcdef0' } });
  const stack = Stack.of(app.node.findChild('ObeyaCiRunner'));
  expect(stack.region).toBe('us-east-2');
  expect(Token.isUnresolved(stack.account)).toBe(true);
});
