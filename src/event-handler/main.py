import boto3
import json
import uuid
import os
import requests
import time
from boto3.dynamodb.conditions import Key

client = boto3.client('dynamodb')

def lambda_handler(event, context):
    print(event)
    message = event['Records'][0]['body']
    json_message = json.loads(message)
    print(json_message)
    i_id = json_message['detail']['contextKeys']['installationId']
    print(i_id)
    print("=====================")
    response = query_api(i_id)
    print(response)
    write_item(json_message, response)
       

def refresh_token(installation_id, rf_token):
    url = "https://api.ais.prod.vinewood.dubai.aws.dev/token"
    payload='grant_type=refresh_token&client_id={}&client_secret={}&refresh_token={}'.format(os.environ['CLIENT_ID'], os.environ['CLIENT_SECRET'], rf_token)
    headers = {
        'Content-Type': 'application/x-www-form-urlencoded'
    }

    response = requests.request("POST", url, headers=headers, data=payload)
    print("Refresh request is completed")
    print(response.json()) # Don't remove it!!!
    json_response = response.json()
    ddb_response = client.put_item(TableName=os.environ['TOKEN_STORE_TABLE_NAME'], Item={ 'installation_id':{'S': installation_id}, 'token': {'S': json_response['access_token']},  'updated_at': {'N': str(time.time())}, 'refresh_token': {'S': json_response['refresh_token']}})
    print("Dynamodb item created")
    print(ddb_response)
    return json_response['access_token']


def query_api(installation_id):
    url = "https://api.buywithprime.amazon.com/graphql"
    payload="{\"query\":\"query BuyWithPrimeStore {\\n  buyWithPrimeStore {\\n    siteId\\n    widgetId\\n  }\\n}\",\"variables\":{}}"
    headers = {
        'Authorization': 'bearer {}'.format(get_token(installation_id)),
        'X-Omni-InstallationId': installation_id,
        'Content-Type': 'application/json'
    }

    response = requests.request("POST", url, headers=headers, data=payload)
    print("Query request is completed")
    print(response.json())
    return response.json()

def write_item(event, query_response):
    client.put_item(TableName=os.environ['DATA_STORE_TABLE_NAME'], Item={'id':{'S': str(uuid.uuid4())}, 'updated_at': {'S': str(event['time'])}, 'site_id': {'S': query_response['data']['buyWithPrimeStore']['siteId']}, 'event_type': {'S': event['detail']['eventType']}})

def get_token(installation_id):
    table = boto3.resource('dynamodb').Table(os.environ['TOKEN_STORE_TABLE_NAME'])
    response = table.query(KeyConditionExpression=Key('installation_id').eq(installation_id),
                           Limit=1, ScanIndexForward=False,  ConsistentRead=True)
    lastEvaluatedKey =response['LastEvaluatedKey']
    items = response['Items']
    
    while (lastEvaluatedKey != None and len(items) == 0):
        response = table.query(KeyConditionExpression=Key('installation_id').eq(installation_id),
                           Limit=1, ScanIndexForward=False,  ConsistentRead=True, ExclusiveStartKey=lastEvaluatedKey)
        lastEvaluatedKey = response['LastEvaluatedKey']
        items = response['Items']
    
    exists = len(items) > 0
    
    if exists:
        data = items[0]
        delta = time.time() - int(data['updated_at'])
        print(delta)
        if delta > 885:
            print("Token is expired, requesting new one")
            return refresh_token(installation_id, data['refresh_token'])
        else:
            print("Returning the token")
            return data['token']
    else:
        print("Token doesn't exist")



