import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as sqs from 'aws-cdk-lib/aws-sqs';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as lambdaEventsource from 'aws-cdk-lib/aws-lambda-event-sources';
import * as path from 'path';
import { EventProps } from './infra-stack';
require('dotenv').config()

export class EventStack extends cdk.Stack {
    constructor(scope: Construct, id: string, props: EventProps) {
      super(scope, id, props);

    // 1. Create DynamoDB Table to store API query result.
    const demoDataStore = new dynamodb.Table(this, 'DemoDataStore', {
      partitionKey: {
        name: 'id',
        type: dynamodb.AttributeType.STRING
      }
    });
    demoDataStore.applyRemovalPolicy(cdk.RemovalPolicy.DESTROY) 

    // 2. Amazon EventBridge    
    const eventBus = cdk.aws_events.EventBus.fromEventBusArn(this, 'EventBus', process.env.EVENT_BUS_ARN!) 

    const dlq = new sqs.Queue(this, 'EventDeadLetterQueue')
    const queue = new sqs.Queue(this, 'EventQueue', {
      visibilityTimeout: cdk.Duration.seconds(300),
      deadLetterQueue: {
        maxReceiveCount: 10,
        queue: dlq
      }
    });

    // 3. Token Store to call Buy with Prime APIs
    const tokenStore = props.tokenStore; 
    const lambdaFunction = new lambda.Function(this, 'EventLambdaFunction', {
      runtime: lambda.Runtime.PYTHON_3_7,
      code: lambda.Code.fromAsset(path.join(__dirname, `../../codes/event-handler`)),
      handler: 'main.lambda_handler',
      environment: {
        DATA_STORE_TABLE_NAME: demoDataStore.tableName,
        TOKEN_STORE_TABLE_NAME: tokenStore.tableName
      }
    })
    lambdaFunction.addEventSource(new lambdaEventsource.SqsEventSource(queue))
    demoDataStore.grantReadWriteData(lambdaFunction)
    tokenStore.grantReadData(lambdaFunction)

    // 4. Amazon EventBridge rule
    const rule = new cdk.aws_events.Rule(this, 'EventRule', {
      eventBus,
      eventPattern: {
        source: [{prefix: ""}] as any[]
      },
      targets: [new cdk.aws_events_targets.SqsQueue(queue, {
        deadLetterQueue: dlq
      })]
    }) 
  }
}