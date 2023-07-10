import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as sqs from 'aws-cdk-lib/aws-sqs';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as elb from 'aws-cdk-lib/aws-elasticloadbalancingv2';
import * as lambdaEventsource from 'aws-cdk-lib/aws-lambda-event-sources';
import * as ssm from 'aws-cdk-lib/aws-ssm'

import * as path from 'path';
import { InstanceTarget } from 'aws-cdk-lib/aws-elasticloadbalancingv2-targets';
import { ManagedPolicy } from 'aws-cdk-lib/aws-iam';
require('dotenv').config()

export class ApiDemoInfraStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);


    // 2. OAuth 2.0 Handler
    const vpc = ec2.Vpc.fromLookup(this, 'DefaultVPC', { isDefault: true });
    const lb = new elb.ApplicationLoadBalancer(this, 'OauthHandlerLoadBalancer', {
      internetFacing: true,
      vpc
    })

    new cdk.CfnOutput(this, 'OAuthHandlerLoadbalancerDnsName', {value: lb.loadBalancerDnsName})



  }


}
