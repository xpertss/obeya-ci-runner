import { CdkInfraProject } from '@xpertss/projen-types';
const project = new CdkInfraProject({
  name: 'obeya-ci-runner',
  // Exact pins (03 non-negotiable 8): aws-cdk-lib at the projen-types default
  // cdkVersion, and the construct at the version baked into the AMI's
  // ConstructVersion tag (01 §1).
  cdkVersionPinning: true,
  deps: ['@cloudsnorkel/cdk-github-runners@0.17.1'],
  // The hand-built Rocky runner AMI (01 §10). Rotating it is a one-line PR.
  context: { obeyaRunnerAmiId: 'ami-04cf732b8ff2dfaab' },
});
project.synth();
