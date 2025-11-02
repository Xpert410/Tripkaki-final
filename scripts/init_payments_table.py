import boto3
import os
import sys
import time

def create_table_if_not_exists(dynamodb, table_name, schema_func):
    """Check if table exists, create if not"""
    try:
        existing_table = dynamodb.Table(table_name)
        existing_table.load()
        print(f"Table {table_name} already exists")
        return existing_table
    except:
        print(f"Creating table {table_name}...")
        return schema_func(dynamodb, table_name)

def create_payments_schema(dynamodb, table_name):
    """Create payments table for Stripe integration"""
    try:
        table = dynamodb.create_table(
            TableName=table_name,
            KeySchema=[
                {'AttributeName': 'payment_intent_id', 'KeyType': 'HASH'}
            ],
            AttributeDefinitions=[
                {'AttributeName': 'payment_intent_id', 'AttributeType': 'S'},
                {'AttributeName': 'user_id', 'AttributeType': 'S'},
                {'AttributeName': 'quote_id', 'AttributeType': 'S'},
                {'AttributeName': 'stripe_session_id', 'AttributeType': 'S'},
                {'AttributeName': 'policy_id', 'AttributeType': 'S'}
            ],
            GlobalSecondaryIndexes=[
                {
                    'IndexName': 'user_id-index',
                    'KeySchema': [{'AttributeName': 'user_id', 'KeyType': 'HASH'}],
                    'Projection': {'ProjectionType': 'ALL'},
                    'ProvisionedThroughput': {'ReadCapacityUnits': 5, 'WriteCapacityUnits': 5}
                },
                {
                    'IndexName': 'quote_id-index',
                    'KeySchema': [{'AttributeName': 'quote_id', 'KeyType': 'HASH'}],
                    'Projection': {'ProjectionType': 'ALL'},
                    'ProvisionedThroughput': {'ReadCapacityUnits': 5, 'WriteCapacityUnits': 5}
                },
                {
                    'IndexName': 'stripe_session_id-index',
                    'KeySchema': [{'AttributeName': 'stripe_session_id', 'KeyType': 'HASH'}],
                    'Projection': {'ProjectionType': 'ALL'},
                    'ProvisionedThroughput': {'ReadCapacityUnits': 5, 'WriteCapacityUnits': 5}
                },
                {
                    'IndexName': 'policy_id-index',
                    'KeySchema': [{'AttributeName': 'policy_id', 'KeyType': 'HASH'}],
                    'Projection': {'ProjectionType': 'ALL'},
                    'ProvisionedThroughput': {'ReadCapacityUnits': 5, 'WriteCapacityUnits': 5}
                }
            ],
            BillingMode='PAY_PER_REQUEST',
            StreamSpecification={
                'StreamEnabled': True,
                'StreamViewType': 'NEW_AND_OLD_IMAGES'
            }
        )
        
        table.wait_until_exists()
        print(f"Table {table_name} created successfully!")
        return table
        
    except Exception as e:
        print(f"Error creating payments table: {e}")
        raise

def create_quotes_schema(dynamodb, table_name):
    """Create insurance quotes table"""
    try:
        table = dynamodb.create_table(
            TableName=table_name,
            KeySchema=[
                {'AttributeName': 'quote_id', 'KeyType': 'HASH'}
            ],
            AttributeDefinitions=[
                {'AttributeName': 'quote_id', 'AttributeType': 'S'},
                {'AttributeName': 'user_id', 'AttributeType': 'S'},
                {'AttributeName': 'created_at', 'AttributeType': 'S'}
            ],
            GlobalSecondaryIndexes=[
                {
                    'IndexName': 'user_id-created_at-index',
                    'KeySchema': [
                        {'AttributeName': 'user_id', 'KeyType': 'HASH'},
                        {'AttributeName': 'created_at', 'KeyType': 'RANGE'}
                    ],
                    'Projection': {'ProjectionType': 'ALL'},
                    'ProvisionedThroughput': {'ReadCapacityUnits': 5, 'WriteCapacityUnits': 5}
                }
            ],
            BillingMode='PAY_PER_REQUEST'
        )
        
        table.wait_until_exists()
        print(f"Table {table_name} created successfully!")
        return table
        
    except Exception as e:
        print(f"Error creating quotes table: {e}")
        raise

def create_policies_schema(dynamodb, table_name):
    """Create insurance policies table"""
    try:
        table = dynamodb.create_table(
            TableName=table_name,
            KeySchema=[
                {'AttributeName': 'policy_id', 'KeyType': 'HASH'}
            ],
            AttributeDefinitions=[
                {'AttributeName': 'policy_id', 'AttributeType': 'S'},
                {'AttributeName': 'user_id', 'AttributeType': 'S'},
                {'AttributeName': 'quote_id', 'AttributeType': 'S'},
                {'AttributeName': 'policy_status', 'AttributeType': 'S'}
            ],
            GlobalSecondaryIndexes=[
                {
                    'IndexName': 'user_id-index',
                    'KeySchema': [{'AttributeName': 'user_id', 'KeyType': 'HASH'}],
                    'Projection': {'ProjectionType': 'ALL'},
                    'ProvisionedThroughput': {'ReadCapacityUnits': 5, 'WriteCapacityUnits': 5}
                },
                {
                    'IndexName': 'quote_id-index',
                    'KeySchema': [{'AttributeName': 'quote_id', 'KeyType': 'HASH'}],
                    'Projection': {'ProjectionType': 'ALL'},
                    'ProvisionedThroughput': {'ReadCapacityUnits': 5, 'WriteCapacityUnits': 5}
                },
                {
                    'IndexName': 'policy_status-index',
                    'KeySchema': [{'AttributeName': 'policy_status', 'KeyType': 'HASH'}],
                    'Projection': {'ProjectionType': 'ALL'},
                    'ProvisionedThroughput': {'ReadCapacityUnits': 5, 'WriteCapacityUnits': 5}
                }
            ],
            BillingMode='PAY_PER_REQUEST'
        )
        
        table.wait_until_exists()
        print(f"Table {table_name} created successfully!")
        return table
        
    except Exception as e:
        print(f"Error creating policies table: {e}")
        raise

def create_customers_schema(dynamodb, table_name):
    """Create customer profiles table"""
    try:
        table = dynamodb.create_table(
            TableName=table_name,
            KeySchema=[
                {'AttributeName': 'user_id', 'KeyType': 'HASH'}
            ],
            AttributeDefinitions=[
                {'AttributeName': 'user_id', 'AttributeType': 'S'},
                {'AttributeName': 'email', 'AttributeType': 'S'}
            ],
            GlobalSecondaryIndexes=[
                {
                    'IndexName': 'email-index',
                    'KeySchema': [{'AttributeName': 'email', 'KeyType': 'HASH'}],
                    'Projection': {'ProjectionType': 'ALL'},
                    'ProvisionedThroughput': {'ReadCapacityUnits': 5, 'WriteCapacityUnits': 5}
                }
            ],
            BillingMode='PAY_PER_REQUEST'
        )
        
        table.wait_until_exists()
        print(f"Table {table_name} created successfully!")
        return table
        
    except Exception as e:
        print(f"Error creating customers table: {e}")
        raise

def create_all_tables():
    """Initialize all required tables for the travel insurance payment system"""
    aws_region = os.getenv("AWS_REGION", "ap-southeast-1")
    ddb_endpoint = os.getenv("DDB_ENDPOINT", "http://localhost:8000")
    payments_table_name = os.getenv("DYNAMODB_PAYMENTS_TABLE", "lea-payments-local")
    
    dynamodb = boto3.resource(
        'dynamodb',
        region_name=aws_region,
        endpoint_url=ddb_endpoint,
        aws_access_key_id='dummy',
        aws_secret_access_key='dummy'
    )
    
    # Create all required tables
    tables_created = []
    
    try:
        # Payments table (existing Stripe integration)
        payments_table = create_table_if_not_exists(dynamodb, payments_table_name, create_payments_schema)
        tables_created.append(payments_table_name)
        
        # Insurance quotes table
        quotes_table = create_table_if_not_exists(dynamodb, "lea-insurance-quotes", create_quotes_schema)
        tables_created.append("lea-insurance-quotes")
        
        # Insurance policies table
        policies_table = create_table_if_not_exists(dynamodb, "lea-insurance-policies", create_policies_schema)
        tables_created.append("lea-insurance-policies")
        
        # Customer profiles table
        customers_table = create_table_if_not_exists(dynamodb, "lea-customer-profiles", create_customers_schema)
        tables_created.append("lea-customer-profiles")
        
        print(f"\n✅ Successfully initialized {len(tables_created)} tables:")
        for table_name in tables_created:
            print(f"   - {table_name}")
        
        print(f"\n🗄️  DynamoDB Admin UI: http://localhost:8010")
        print(f"🔗 DynamoDB Endpoint: {ddb_endpoint}")
        
    except Exception as e:
        print(f"❌ Error during table creation: {e}")
        sys.exit(1)

if __name__ == "__main__":
    create_all_tables()