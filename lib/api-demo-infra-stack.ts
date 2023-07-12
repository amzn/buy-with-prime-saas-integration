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

    // 1. Databases

    const tokenStore = new dynamodb.Table(this, 'ApiDemoInfraTokenStore', {
      partitionKey: {
        name: 'installation_id',
        type: dynamodb.AttributeType.STRING
      },
      sortKey: {
        name: 'updated_at',
        type: dynamodb.AttributeType.NUMBER
      }
    })

    const demoDataStore = new dynamodb.Table(this, 'ApiDemoInfraDataStore', {
      partitionKey: {
        name: 'id',
        type: dynamodb.AttributeType.STRING
      }
    }
    )


    // 2. OAuth 2.0 Handler
    const vpc = ec2.Vpc.fromLookup(this, 'DefaultVPC', {isDefault: true});
    const lb = new elb.ApplicationLoadBalancer(this, 'OauthHandlerLoadBalancer', {
      internetFacing: true,
      vpc
    })

    const ud = ec2.UserData.forLinux()
    ud.addCommands('sudo yum install git -y', 
                    'sudo yum install -y https://s3.amazonaws.com/ec2-downloads-windows/SSMAgent/latest/linux_amd64/amazon-ssm-agent.rpm',
                    'sudo systemctl start amazon-ssm-agent',
                    'git clone https://github.com/amzn/buy-with-prime-oauth-handler-ec2.git', 
                    `echo "export CLIENT_ID=${process.env.CLIENT_ID}" >> ~/.bash_profile`,
                    `echo "export CLIENT_SECRET=${process.env.CLIENT_SECRET}" >> ~/.bash_profile`,
                    `echo "export APP_INSTALL_URL=http://${lb.loadBalancerDnsName}/install" >> ~/.bash_profile`,
                    `source ~/.bash_profile`,
                    'sh buy-with-prime-oauth-handler-ec2/init.sh')
                    
    const handlerInstance = new ec2.Instance(this, 'OauthHandlerInstance', {
      vpc,
      instanceType: ec2.InstanceType.of(ec2.InstanceClass.T3, ec2.InstanceSize.LARGE),
      machineImage: new ec2.AmazonLinuxImage(),
      userData: ud
    })
    handlerInstance.role.addManagedPolicy(ManagedPolicy.fromAwsManagedPolicyName('AmazonSSMManagedInstanceCore'))
    tokenStore.grantReadWriteData(handlerInstance)

    const tg = new elb.ApplicationTargetGroup(this, 'OauthHandlerTargetGroup', {
      targetType: elb.TargetType.INSTANCE,
      vpc,
      port: 3000,
      protocol:  elb.ApplicationProtocol.HTTP,
      healthCheck: {
        path: '/hc'
      },
      targets: [new InstanceTarget(handlerInstance)] 

    })
    handlerInstance.connections.allowFrom(lb, ec2.Port.tcp(3000))
    
    const listener = lb.addListener('OauthHandlerListener', {port: 80})
    listener.addTargetGroups('OauthHandlerTargetGroup', { targetGroups: [tg] })

    new cdk.CfnOutput(this, 'OAuthHandlerInstanceId', {value: handlerInstance.instanceId})
    new cdk.CfnOutput(this, 'OAuthHandlerLoadbalancerDnsName', {value: lb.loadBalancerDnsName})


    // 3. Event bus, rules and dead letter queue
/*     const eventBus = cdk.aws_events.EventBus.fromEventBusArn(this, 'EventBus', process.env.EVENT_BUS_ARN!) */

    const dlq = new sqs.Queue(this, 'ApiDemoInfraDeadLetterQueue')
    const queue = new sqs.Queue(this, 'ApiDemoInfraQueue', {
      visibilityTimeout: cdk.Duration.seconds(300),
      deadLetterQueue: {
        maxReceiveCount: 10,
        queue: dlq
      }
    });

    const lambdaFunction = new lambda.Function(this, 'ApiDemoInfraLambdaFunction', {
      runtime: lambda.Runtime.PYTHON_3_7,
      code: lambda.Code.fromAsset(path.join(__dirname, `../src/event-handler`)),
      handler: 'main.lambda_handler',
      environment: {
        'CLIENT_ID': process.env.CLIENT_ID!,
        'CLIENT_SECRET': process.env.CLIENT_SECRET!,
        'TOKEN_STORE_TABLE_NAME': tokenStore.tableName,
        'DATA_STORE_TABLE_NAME': demoDataStore.tableName
      }
    })
    lambdaFunction.addEventSource(new lambdaEventsource.SqsEventSource(queue))
    tokenStore.grantReadWriteData(lambdaFunction)
    demoDataStore.grantReadWriteData(lambdaFunction)


/*     const rule = new cdk.aws_events.Rule(this, 'ApiDemoInfraRule', {
      eventBus,
      eventPattern: {
        source: [{prefix: ""}] as any[]
      },
      targets: [new cdk.aws_events_targets.SqsQueue(queue, {
        deadLetterQueue: dlq
      })]
    }) */

  }


}
