#!/usr/bin/env node
import 'source-map-support/register';
import * as cdk from 'aws-cdk-lib';
import { ApiDemoInfraStack } from '../lib/api-demo-infra-stack';
import { AwsSolutionsChecks } from 'cdk-nag'
import { Aspects } from 'aws-cdk-lib';

const app = new cdk.App();
/* Aspects.of(app).add(new AwsSolutionsChecks({verbose: true})) */
new ApiDemoInfraStack(app, 'ApiDemoInfraStack');