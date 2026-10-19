import { Ec2RunnerProvider } from '@cloudsnorkel/cdk-github-runners';
import { App } from 'aws-cdk-lib';
import { Template } from 'aws-cdk-lib/assertions';
import { ObeyaCiRunnerStack } from '../src/obeya-ci-runner-stack';

const AMI_ID = 'ami-0123456789abcdef0';

// Synthesized once, with no AWS credentials in the test environment: a passing
// synth proves there is no Vpc.fromLookup or other lookup (test 6).
const app = new App({ context: { obeyaRunnerAmiId: AMI_ID } });
const stack = new ObeyaCiRunnerStack(app, 'ObeyaCiRunner', { env: { region: 'us-east-2' } });
const template = Template.fromStack(stack);
const resources = template.toJSON().Resources as Record<string, any>;

function ofType(type: string): [string, any][] {
  return Object.entries(resources).filter(([, r]) => r.Type === type);
}

test('no NAT gateway, and every subnet assigns a public IPv4', () => {
  template.resourceCountIs('AWS::EC2::NatGateway', 0);
  const subnets = ofType('AWS::EC2::Subnet');
  expect(subnets).toHaveLength(2);
  for (const [, subnet] of subnets) {
    expect(subnet.Properties.MapPublicIpOnLaunch).toBe(true);
  }
});

test('the runner security group has no inbound rules', () => {
  const groups = ofType('AWS::EC2::SecurityGroup');
  expect(groups).toHaveLength(1);
  const [id, group] = groups[0];
  expect(group.Properties.SecurityGroupIngress).toBeUndefined();
  const ingress = ofType('AWS::EC2::SecurityGroupIngress')
    .filter(([, r]) => JSON.stringify(r.Properties.GroupId).includes(id));
  expect(ingress).toEqual([]);
});

test('the launch template uses the context AMI, IMDSv2 and standard CPU credits', () => {
  template.hasResourceProperties('AWS::EC2::LaunchTemplate', {
    LaunchTemplateData: {
      ImageId: AMI_ID,
      MetadataOptions: { HttpTokens: 'required' },
      CreditSpecification: { CpuCredits: 'standard' },
    },
  });
});

test('the runner instance role carries only the construct actions plus read-only CodeArtifact', () => {
  const roles = ofType('AWS::IAM::Role').filter(([, r]) =>
    JSON.stringify(r.Properties.AssumeRolePolicyDocument).includes('ec2.amazonaws.com'));
  expect(roles).toHaveLength(1);
  const [roleId, role] = roles[0];
  expect(role.Properties.ManagedPolicyArns).toBeUndefined();
  expect(role.Properties.Policies).toBeUndefined();

  const statements = ofType('AWS::IAM::Policy')
    .filter(([, p]) => JSON.stringify(p.Properties.Roles).includes(roleId))
    .flatMap(([, p]) => p.Properties.PolicyDocument.Statement);
  for (const s of statements) {
    expect(s.Effect).toBe('Allow');
    expect(s.NotAction).toBeUndefined();
    expect(s.NotResource).toBeUndefined();
  }
  const actions = statements.flatMap((s: any) => [].concat(s.Action)).sort();
  expect(actions).toEqual([
    'codeartifact:GetAuthorizationToken',
    'codeartifact:ReadFromRepository',
    'logs:CreateLogStream',
    'logs:PutLogEvents',
    's3:GetEncryptionConfiguration',
    'ssm:UpdateInstanceInformation',
    'ssmmessages:CreateControlChannel',
    'ssmmessages:CreateDataChannel',
    'ssmmessages:OpenControlChannel',
    'ssmmessages:OpenDataChannel',
    'states:SendTaskFailure',
    'states:SendTaskHeartbeat',
    'states:SendTaskSuccess',
    'sts:GetServiceBearerToken',
  ]);

  const statementFor = (action: string) =>
    statements.find((s: any) => [].concat(s.Action).includes(action as never));
  expect(JSON.stringify(statementFor('codeartifact:GetAuthorizationToken').Resource))
    .toMatch(/:codeartifact:us-east-2:.*:domain\/xpertss"/);
  expect(JSON.stringify(statementFor('codeartifact:ReadFromRepository').Resource))
    .toMatch(/:codeartifact:us-east-2:.*:repository\/xpertss\/central"/);
  expect(statementFor('sts:GetServiceBearerToken').Condition).toEqual({
    StringEquals: { 'sts:AWSServiceName': 'codeartifact.amazonaws.com' },
  });
  const logs = statementFor('logs:PutLogEvents');
  expect(logs.Resource['Fn::GetAtt'][0]).toMatch(/^RockyProviderLogs/);
});

test('no Lambda function is in a VPC', () => {
  const functions = ofType('AWS::Lambda::Function');
  expect(functions.length).toBeGreaterThan(0);
  for (const [, fn] of functions) {
    expect(fn.Properties.VpcConfig).toBeUndefined();
  }
});

test('synth needs no AWS lookups', () => {
  const assembly = app.synth();
  expect(assembly.manifest.missing).toBeUndefined();
});

test('the provider takes jobs labelled obeya-runner only', () => {
  const provider = stack.node.findChild('RockyProvider') as Ec2RunnerProvider;
  expect(provider.labels).toEqual(['obeya-runner']);
  expect(JSON.stringify(resources)).toContain('obeya-runner');
});
