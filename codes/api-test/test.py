import json
import uuid
import os
import requests
import time
import boto3
from dotenv import load_dotenv
from boto3.dynamodb.conditions import Key

client = boto3.client('dynamodb')

load_dotenv()
client_id = os.environ['CLIENT_ID']
client_secret = os.environ['CLIENT_SECRET']
i_id = os.environ['INSTALLATION_ID']
token_table=os.environ['TOKEN_STORE_TABLE_NAME']
def refresh_token(installation_id, rf_token):
    url = "https://api.ais.prod.vinewood.dubai.aws.dev/token"
    payload='grant_type=refresh_token&client_id={}&client_secret={}&refresh_token={}'.format(client_id, client_secret, rf_token)
    headers = {
        'Content-Type': 'application/x-www-form-urlencoded'
    }
    response = requests.request("POST", url, headers=headers, data=payload)
    print("Refresh request is completed")
    print(response.json()) # Don't remove it!!!
    json_response = response.json()
    ddb_response = client.put_item(TableName=token_table, Item={ 
                                                                'installation_id':{'S': installation_id}, 
                                                                'token': {'S': json_response['access_token']},  
                                                                'updated_at': {'N': str(time.time())}, 
                                                                'refresh_token': {'S': json_response['refresh_token']}})
    print("Dynamodb item created")
    print(ddb_response)
    return json_response['access_token']

def get_token(installation_id):
    table = boto3.resource('dynamodb').Table(token_table)
    response = table.query(KeyConditionExpression=Key('installation_id').eq(installation_id),
                          Limit=1, ScanIndexForward=False,  ConsistentRead=True)
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
    
query_api(i_id)