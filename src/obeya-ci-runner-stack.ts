import { Ec2RunnerProvider, GitHubRunners } from '@cloudsnorkel/cdk-github-runners';
import {
  Size,
  Stack,
  StackProps,
  Tags,
  aws_ec2 as ec2,
  aws_iam as iam,
  aws_logs as logs,
} from 'aws-cdk-lib';
import { Construct } from 'constructs';
import { RockyRunnerAmi } from './constructs/rocky-runner-ami';

/** Ephemeral EC2 runners for Obeya's `Rocky integration tests` job. */
export class ObeyaCiRunnerStack extends Stack {
  constructor(scope: Construct, id: string, props: StackProps = {}) {
    super(scope, id, props);

    const amiId = this.node.tryGetContext('obeyaRunnerAmiId');
    if (!amiId) {
      throw new Error('context obeyaRunnerAmiId is not set (cdk.json)');
    }

    // Public subnets only: no NAT gateway. A new VPC avoids `fromLookup`, so
    // synth stays credential-free. Two AZs give the provider a capacity fallback.
    const vpc = new ec2.Vpc(this, 'Vpc', {
      maxAzs: 2,
      natGateways: 0,
      subnetConfiguration: [{ name: 'Public', subnetType: ec2.SubnetType.PUBLIC, cidrMask: 24 }],
      restrictDefaultSecurityGroup: true,
    });

    // Outbound only; debug through SSM.
    const securityGroup = new ec2.SecurityGroup(this, 'RunnerSecurityGroup', {
      vpc,
      allowAllOutbound: true,
    });

    const provider = new Ec2RunnerProvider(this, 'RockyProvider', {
      labels: ['obeya-runner'],
      instanceType: ec2.InstanceType.of(ec2.InstanceClass.T3, ec2.InstanceSize.MEDIUM),
      storageSize: Size.gibibytes(30),
      spot: false,
      vpc,
      subnetSelection: { subnetType: ec2.SubnetType.PUBLIC },
      securityGroups: [securityGroup],
      imageBuilder: new RockyRunnerAmi(this, 'RockyRunnerAmi', { amiId }),
      logRetention: logs.RetentionDays.ONE_MONTH,
    });

    // The only grants added to the instance role: read-only CodeArtifact for
    // the AMI's Maven proxy token (spec 01 §6.1). The repo is public, so job
    // code is untrusted - never widen this.
    const role = provider.grantPrincipal;
    role.addToPrincipalPolicy(new iam.PolicyStatement({
      actions: ['codeartifact:GetAuthorizationToken'],
      resources: [this.formatArn({ service: 'codeartifact', resource: 'domain', resourceName: 'xpertss' })],
    }));
    role.addToPrincipalPolicy(new iam.PolicyStatement({
      actions: ['codeartifact:ReadFromRepository'],
      resources: [this.formatArn({ service: 'codeartifact', resource: 'repository', resourceName: 'xpertss/central' })],
    }));
    role.addToPrincipalPolicy(new iam.PolicyStatement({
      actions: ['sts:GetServiceBearerToken'],
      resources: ['*'],
      conditions: { StringEquals: { 'sts:AWSServiceName': 'codeartifact.amazonaws.com' } },
    }));

    // No `vpc`: without a NAT gateway, Lambdas in the VPC lose internet access.
    new GitHubRunners(this, 'GitHubRunners', {
      providers: [provider],
    });

    Tags.of(this).add('Project', 'obeya');
    Tags.of(this).add('Component', 'ci-runner');
  }
}
