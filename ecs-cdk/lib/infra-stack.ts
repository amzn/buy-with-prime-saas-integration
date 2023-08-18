import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as elb from 'aws-cdk-lib/aws-elasticloadbalancingv2';
import * as ecr from 'aws-cdk-lib/aws-ecr';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
require('dotenv').config()

export class InfraStack extends cdk.Stack {
  public readonly vpc: ec2.Vpc;
  public readonly lb: elb.ApplicationLoadBalancer;
  public readonly ecrRepo: ecr.Repository;
  public readonly tokenStore: dynamodb.Table;
  public readonly targetGroup: elb.ApplicationTargetGroup;

  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    // 1. VPC
    const vpc = new ec2.Vpc(this, 'BuywithPrime-SaaS-workshop', {
      ipAddresses: ec2.IpAddresses.cidr('10.0.0.0/16'),
      maxAzs: 2
    });
    this.vpc = vpc; 

    // 2. OAuth handler ALB
    const lb = new elb.ApplicationLoadBalancer(this, 'OauthHandlerLoadBalancer', {
      internetFacing: true,
      vpc
    });

    this.lb = lb;

    this.targetGroup = new elb.ApplicationTargetGroup(this, 'TargetGroup', {
      vpc: vpc,
      port: 8080 
    });

    lb.addListener('Listener', {
      port: 80,
      defaultTargetGroups: [this.targetGroup],
      protocol: cdk.aws_elasticloadbalancingv2.ApplicationProtocol.HTTP // did not work.
    })

    // 3. Create Amazon ECR repository for oauth handler containers. 
    const ecrRepo = new ecr.Repository(this, 'oauthECR', {
      repositoryName: 'bwp-saas-integration', 
      removalPolicy: cdk.RemovalPolicy.DESTROY,
      autoDeleteImages: true 
    });
    this.ecrRepo = ecrRepo;  
    new cdk.CfnOutput(this, 'OAuthRepository', { value: ecrRepo.repositoryUri }) 
    
    // 4. DynamoDB for OAuth token store.
    const tokenStore = new dynamodb.Table(this, 'BuywithPrimeTokenStore', {
      partitionKey: {
        name: 'installation_id',
        type: dynamodb.AttributeType.STRING
      },
      sortKey: {
        name: 'updated_at',
        type: dynamodb.AttributeType.NUMBER
      }
    });
    this.tokenStore = tokenStore;
    tokenStore.applyRemovalPolicy(cdk.RemovalPolicy.DESTROY)

    this.exportValue(this.lb.loadBalancerDnsName)
    
    new cdk.CfnOutput(this, 'tokenStoreName', { value: tokenStore.tableName })
    new cdk.CfnOutput(this, 'loadbalancerDnsUrl', { 
      value: lb.loadBalancerDnsName,
      exportName: "installUrl" })
  }
} 
export interface EcsProps extends cdk.StackProps {
  vpc: cdk.aws_ec2.IVpc;
  lb: cdk.aws_elasticloadbalancingv2.IApplicationLoadBalancer;
  ecrRepo: cdk.aws_ecr.IRepository;
  targetGroup: cdk.aws_elasticloadbalancingv2.IApplicationTargetGroup;
  tokenStore: cdk.aws_dynamodb.ITable;
}

export interface EventProps extends cdk.StackProps {
  tokenStore: cdk.aws_dynamodb.ITable;
}