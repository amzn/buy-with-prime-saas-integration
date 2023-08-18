#!/usr/bin/env node
import 'source-map-support/register';
import * as cdk from 'aws-cdk-lib';
import { InfraStack } from '../lib/infra-stack';
import { EcsStack } from '../lib/ecs-fargate-stack';
import { EventStack } from '../lib/event-stack';


const app = new cdk.App();

const infraStack = new InfraStack(app, 'InfraStack',  {
  env: {
    account: process.env.CDK_DEPLOY_ACCOUNT || process.env.CDK_DEFAULT_ACCOUNT, 
    region: process.env.CDK_DEPLOY_REGION || process.env.CDK_DEFAULT_REGION 
  }
});

new EcsStack(app, 'EcsStack', {
  env: {
    account: process.env.CDK_DEPLOY_ACCOUNT || process.env.CDK_DEFAULT_ACCOUNT, 
    region: process.env.CDK_DEPLOY_REGION || process.env.CDK_DEFAULT_REGION 
  },
  vpc: infraStack.vpc,
  lb: infraStack.lb,
  ecrRepo: infraStack.ecrRepo,
  targetGroup: infraStack.targetGroup,
  tokenStore: infraStack.tokenStore,
});

new EventStack(app, 'EventStack', {
  tokenStore: infraStack.tokenStore, 
  env: {
    account: process.env.CDK_DEPLOY_ACCOUNT || process.env.CDK_DEFAULT_ACCOUNT, 
    region: process.env.CDK_DEPLOY_REGION || process.env.CDK_DEFAULT_REGION 
  }
})