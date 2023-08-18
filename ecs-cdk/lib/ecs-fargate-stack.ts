import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as secretsmanager from 'aws-cdk-lib/aws-secretsmanager';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as ecs from 'aws-cdk-lib/aws-ecs';
import { EcsProps } from './infra-stack';
require('dotenv').config()

export class EcsStack extends cdk.Stack {
    constructor(scope: Construct, id: string, props: EcsProps) {
        super(scope, id, props);

        const vpc = props.vpc;

        // 1. Store App ID and Client Secret in AWS Secrets Manager
        const appCredential = new secretsmanager.Secret(this, 'ClientSecret', {
            secretName: 'bwp-saas-oauth-client-secret',
            secretObjectValue: {
              client_id: cdk.SecretValue.unsafePlainText(process.env.CLIENT_ID!),
              client_secret: cdk.SecretValue.unsafePlainText(process.env.CLIENT_SECRET!)
            },
            removalPolicy: cdk.RemovalPolicy.DESTROY
          })
    
        // 2. Create ECS cluster  
        const cluster = new ecs.Cluster(this, 'oauthCluster', { vpc });
        
        // 3. Create Task role 
        const oauthTaskRole = new iam.Role(this, 'oauthTaskRole', {
            assumedBy: new iam.ServicePrincipal('ecs-tasks.amazonaws.com'),
            description: 'ecs task role to access secrets manager and dynamoDB',
        })
        oauthTaskRole.applyRemovalPolicy(cdk.RemovalPolicy.DESTROY)

        // 4. Create Task definition
        const taskDefinition = new ecs.TaskDefinition(this, 'TaskDef', {
            compatibility: ecs.Compatibility.FARGATE,
            memoryMiB: '512',
            cpu: '256',
            taskRole: oauthTaskRole,
            runtimePlatform: {
                operatingSystemFamily: ecs.OperatingSystemFamily.LINUX
            }
        })

        const executionRolePolicy =  new iam.PolicyStatement({
            effect: iam.Effect.ALLOW,
            resources: ['*'],
            actions: [
                      "ecr:GetAuthorizationToken",
                      "ecr:BatchCheckLayerAvailability",
                      "ecr:GetDownloadUrlForLayer",
                      "ecr:BatchGetImage",
                      "logs:CreateLogStream",
                      "logs:PutLogEvents"
                  ]
          });

        taskDefinition.addToExecutionRolePolicy(executionRolePolicy);
        taskDefinition.executionRole?.applyRemovalPolicy(cdk.RemovalPolicy.DESTROY)

        appCredential.grantRead(iam.Role.fromRoleArn(this, 'client-secret-role', oauthTaskRole.roleArn));
        props.tokenStore.grantReadWriteData(iam.Role.fromRoleArn(this, 'tokenstore-role', oauthTaskRole.roleArn));

        var lowercase = props.lb.loadBalancerDnsName.toLowerCase()

        const ecrRepo = props.ecrRepo;
        const importedDnsUrl = cdk.Fn.importValue('installUrl');
        const installUrl = importedDnsUrl.toString()+"/install";

        const container = taskDefinition.addContainer('oauth', {
            image: ecs.EcrImage.fromEcrRepository(ecrRepo, "latest"),
            memoryLimitMiB: 256,
            logging: new ecs.AwsLogDriver({ streamPrefix: 'bwp-oauth', mode: ecs.AwsLogDriverMode.NON_BLOCKING }), 
            environment: 
                {
                    ["APP_INSTALL_URL_C"]: installUrl, // CDK generating ALB has capitals in DNS. Should be lowercased in application code to avoid hash validation error.  
                    ["TOKEN_STORE_TABLE_NAME"]: props.tokenStore.tableName
                },
        })

        container.addPortMappings({
            containerPort: 8080,
            hostPort: 8080,
            protocol: ecs.Protocol.TCP
        })

        // 5. Create ECS service
        const service = new ecs.FargateService(this, 'oauthService', {
            cluster,
            taskDefinition,
            desiredCount: 2
        });
        
        props.targetGroup.addTarget(service);
}}
export interface SecretsProps extends cdk.StackProps {
    appCredential: secretsmanager.ISecret;
}