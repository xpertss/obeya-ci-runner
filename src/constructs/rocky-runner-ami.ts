import {
  Architecture,
  IRunnerImageBuilder,
  Os,
  RunnerAmi,
  RunnerImage,
  RunnerVersion,
} from '@cloudsnorkel/cdk-github-runners';
import { aws_ec2 as ec2 } from 'aws-cdk-lib';
import { Construct } from 'constructs';

export interface RockyRunnerAmiProps {
  /** The hand-built Rocky runner AMI (spec 01). */
  readonly amiId: string;
}

/**
 * Brings an existing AMI to the EC2 provider; it builds nothing. The construct
 * has no Rocky `Os`, and the provider only reads the fields returned below.
 */
export class RockyRunnerAmi extends Construct implements IRunnerImageBuilder {
  private readonly amiId: string;
  private ami?: RunnerAmi;

  constructor(scope: Construct, id: string, props: RockyRunnerAmiProps) {
    super(scope, id);
    this.amiId = props.amiId;
  }

  bindDockerImage(): RunnerImage {
    throw new Error('RockyRunnerAmi only supports AMIs');
  }

  bindAmi(): RunnerAmi {
    this.ami ??= {
      // No instance type, subnet, security group or user data: the state
      // machine supplies those at RunInstances.
      launchTemplate: new ec2.LaunchTemplate(this, 'LaunchTemplate', {
        machineImage: ec2.MachineImage.genericLinux({ 'us-east-2': this.amiId }),
        requireImdsv2: true,
        cpuCredits: ec2.CpuCredits.STANDARD,
      }),
      architecture: Architecture.X86_64,
      // Not the real OS (Rocky 10). Any non-Windows value selects the Linux user data.
      os: Os.LINUX_AMAZON_2023,
      // Required but deprecated; the user data reads the AMI's /home/runner/RUNNER_VERSION.
      runnerVersion: RunnerVersion.latest(),
      cacheKey: this.amiId,
    };
    return this.ami;
  }
}
