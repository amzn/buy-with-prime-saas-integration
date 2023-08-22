export ACCOUNT_ID=$(aws sts get-caller-identity --query 'Account' --output text) 
# export AWS_REGION=$(curl -s 169.254.169.254/latest/dynamic/instance-identity/document | jq -r '.region') # for Cloud9
# export AWS_REGION='YOUR_REGION' # for local PC or cloudshell

echo "ACCOUNT_ID=${ACCOUNT_ID}" | tee -a ~/.bash_profile
echo "AWS_REGION=${AWS_REGION}" | tee -a ~/.bash_profile

cd ../codes/oauth
# aws ecr get-login-password --region $AWS_REGION --profile YOUR_PROFILE | docker login --username AWS --password-stdin $ACCOUNT_ID.dkr.ecr.$AWS_REGION.amazonaws.com 
aws ecr get-login-password --region $AWS_REGION | docker login --username AWS --password-stdin $ACCOUNT_ID.dkr.ecr.$AWS_REGION.amazonaws.com 
docker build -t bwp-saas-integration .
# docker build --platform linux/amd64 -t bwp-saas-integration . # for M1 Mac
docker tag bwp-saas-integration:latest $ACCOUNT_ID.dkr.ecr.$AWS_REGION.amazonaws.com/bwp-saas-integration:latest
docker push $ACCOUNT_ID.dkr.ecr.$AWS_REGION.amazonaws.com/bwp-saas-integration:latest
