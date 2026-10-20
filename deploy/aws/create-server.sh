#!/usr/bin/env bash
# Creates the SplitSmart server on AWS with the AWS CLI. Safe to re-run: existing pieces are reused.
#
#   bash deploy/aws/create-server.sh you@example.com
#
# Creates: a credit-usage budget alert, a security group (80/443 only, no SSH), an IAM role for
# SSM, a network interface + Elastic IP, and one free-tier EC2 instance in the default VPC.
# Aborts if the instance type isn't free-tier eligible for this account.
set -euo pipefail
. "$(dirname "$0")/lib.sh"

EMAIL="${1:?usage: create-server.sh <email for billing alerts>}"
TYPE="${INSTANCE_TYPE:-t3.micro}"
ROLE="$NAME-ec2"
TAGS="{Key=Name,Value=$NAME},{Key=Project,Value=$NAME}"

log "AWS identity"
ARN=$(awsr sts get-caller-identity --query Arn)
ACCOUNT=$(awsr sts get-caller-identity --query Account)
echo "$ARN (region $REGION)"
case "$ARN" in *":root") die "Don't use the root user. Sign in as an IAM user (see README)." ;; esac

log "Free-tier check: $TYPE"
FREE=$(awsr ec2 describe-instance-types --instance-types "$TYPE" --query 'InstanceTypes[0].FreeTierEligible')
echo "FreeTierEligible = $FREE"
[ "$FREE" = "True" ] || die "$TYPE is not free-tier eligible in this account/region. Stopping so nothing is billed."

# On the AWS Free plan nothing is billed: usage is paid from credits ($100 for 6 months), so a normal
# budget would always show $0. This one ignores credits and warns when usage before credits passes
# $15/month, i.e. faster than the server's expected ~$13/month share of the credits.
BUDGET_USD="${BUDGET_USD:-15}"
log "Budget alert: email $EMAIL if usage (before credits) exceeds 80% of \$$BUDGET_USD this month"
if awsr budgets describe-budget --account-id "$ACCOUNT" --budget-name "$NAME-monthly" > /dev/null 2>&1; then
  echo "exists"
else
  sub="{\"SubscriptionType\":\"EMAIL\",\"Address\":\"$EMAIL\"}"
  awsr budgets create-budget --account-id "$ACCOUNT" \
    --budget "{\"BudgetName\":\"$NAME-monthly\",\"BudgetLimit\":{\"Amount\":\"$BUDGET_USD\",\"Unit\":\"USD\"},\"TimeUnit\":\"MONTHLY\",\"BudgetType\":\"COST\",\"CostTypes\":{\"IncludeCredit\":false,\"IncludeRefund\":false}}" \
    --notifications-with-subscribers "[
      {\"Notification\":{\"NotificationType\":\"ACTUAL\",\"ComparisonOperator\":\"GREATER_THAN\",\"Threshold\":80,\"ThresholdType\":\"PERCENTAGE\"},\"Subscribers\":[$sub]},
      {\"Notification\":{\"NotificationType\":\"FORECASTED\",\"ComparisonOperator\":\"GREATER_THAN\",\"Threshold\":100,\"ThresholdType\":\"PERCENTAGE\"},\"Subscribers\":[$sub]}]"
  echo "created"
fi

log "Network: default VPC and a subnet that offers $TYPE"
VPC=$(awsr ec2 describe-vpcs --filters Name=is-default,Values=true --query 'Vpcs[0].VpcId')
none "$VPC" && die "This region has no default VPC. Create one: aws ec2 create-default-vpc --region $REGION"
AZS=$(awsr ec2 describe-instance-type-offerings --location-type availability-zone \
  --filters "Name=instance-type,Values=$TYPE" --query 'InstanceTypeOfferings[].Location' | tr '\t' ',')
SUBNET=$(awsr ec2 describe-subnets --filters "Name=vpc-id,Values=$VPC" Name=default-for-az,Values=true \
  "Name=availability-zone,Values=$AZS" --query 'sort_by(Subnets,&AvailabilityZone)[0].SubnetId')
none "$SUBNET" && die "No default subnet offers $TYPE."
echo "vpc $VPC, subnet $SUBNET"

log "Security group: HTTP/HTTPS in, nothing else (no SSH)"
SG=$(awsr ec2 describe-security-groups --filters "Name=vpc-id,Values=$VPC" "Name=group-name,Values=$NAME-web" \
  --query 'SecurityGroups[0].GroupId')
if none "$SG"; then
  SG=$(awsr ec2 create-security-group --group-name "$NAME-web" --vpc-id "$VPC" \
    --description "SplitSmart: HTTP/HTTPS in, all out" \
    --tag-specifications "ResourceType=security-group,Tags=[$TAGS]" --query GroupId)
  awsr ec2 authorize-security-group-ingress --group-id "$SG" --ip-permissions \
    'IpProtocol=tcp,FromPort=80,ToPort=80,IpRanges=[{CidrIp=0.0.0.0/0,Description=HTTP}]' \
    'IpProtocol=tcp,FromPort=443,ToPort=443,IpRanges=[{CidrIp=0.0.0.0/0,Description=HTTPS}]' \
    'IpProtocol=udp,FromPort=443,ToPort=443,IpRanges=[{CidrIp=0.0.0.0/0,Description=HTTP3}]' > /dev/null
fi
echo "$SG"

log "IAM role $ROLE: SSM only (shell + deploys without SSH)"
if ! awsr iam get-role --role-name "$ROLE" > /dev/null 2>&1; then
  awsr iam create-role --role-name "$ROLE" --description "SplitSmart EC2: SSM Session Manager and Run Command" \
    --tags "Key=Project,Value=$NAME" \
    --assume-role-policy-document '{"Version":"2012-10-17","Statement":[{"Effect":"Allow","Principal":{"Service":"ec2.amazonaws.com"},"Action":"sts:AssumeRole"}]}' > /dev/null
  awsr iam attach-role-policy --role-name "$ROLE" --policy-arn arn:aws:iam::aws:policy/AmazonSSMManagedInstanceCore
  # The managed policy also allows reading every Parameter Store value in the account. The app
  # doesn't use Parameter Store, so take that away (an explicit Deny beats any Allow).
  awsr iam put-role-policy --role-name "$ROLE" --policy-name deny-parameter-store \
    --policy-document '{"Version":"2012-10-17","Statement":[{"Effect":"Deny","Action":["ssm:GetParameter","ssm:GetParameters","ssm:GetParametersByPath","ssm:GetParameterHistory"],"Resource":"*"}]}'
  awsr iam create-instance-profile --instance-profile-name "$ROLE" > /dev/null
  awsr iam add-role-to-instance-profile --instance-profile-name "$ROLE" --role-name "$ROLE"
  echo "created (IAM takes a few seconds to propagate)"
else
  echo "exists"
fi

log "Network interface + Elastic IP (the server has its public IP from first boot)"
ENI=$(awsr ec2 describe-network-interfaces --filters "Name=tag:Name,Values=$NAME" --query 'NetworkInterfaces[0].NetworkInterfaceId')
if none "$ENI"; then
  ENI=$(awsr ec2 create-network-interface --subnet-id "$SUBNET" --groups "$SG" --description "SplitSmart primary" \
    --tag-specifications "ResourceType=network-interface,Tags=[$TAGS]" --query NetworkInterface.NetworkInterfaceId)
fi
ALLOC=$(awsr ec2 describe-addresses --filters "Name=tag:Name,Values=$NAME" --query 'Addresses[0].AllocationId')
if none "$ALLOC"; then
  ALLOC=$(awsr ec2 allocate-address --domain vpc --tag-specifications "ResourceType=elastic-ip,Tags=[$TAGS]" --query AllocationId)
fi
awsr ec2 associate-address --allocation-id "$ALLOC" --network-interface-id "$ENI" --allow-reassociation > /dev/null
IP=$(awsr ec2 describe-addresses --allocation-ids "$ALLOC" --query 'Addresses[0].PublicIp')
echo "$ENI, $IP"

log "EC2 instance ($TYPE, Amazon Linux 2023)"
INSTANCE_ID=$(awsr ec2 describe-instances --filters "Name=tag:Name,Values=$NAME" \
  Name=instance-state-name,Values=pending,running,stopping,stopped --query 'Reservations[0].Instances[0].InstanceId')
if none "$INSTANCE_ID"; then
  AMI=$(awsr ssm get-parameter --name /aws/service/ami-amazon-linux-latest/al2023-ami-kernel-default-x86_64 --query Parameter.Value)
  echo "AMI $AMI"
  for attempt in 1 2 3 4 5 6; do
    # IMDSv2 only, hop limit 1: containers can't reach instance metadata or borrow the role.
    # CPU credits "standard": throttle under sustained load instead of billing for extra credits.
    if INSTANCE_ID=$(awsr ec2 run-instances --image-id "$AMI" --instance-type "$TYPE" \
      --network-interfaces "DeviceIndex=0,NetworkInterfaceId=$ENI" \
      --iam-instance-profile "Name=$ROLE" \
      --user-data "file://$(native_path "$HERE/bootstrap.sh")" \
      --metadata-options HttpTokens=required,HttpPutResponseHopLimit=1,HttpEndpoint=enabled \
      --credit-specification CpuCredits=standard \
      --block-device-mappings 'DeviceName=/dev/xvda,Ebs={VolumeSize=20,VolumeType=gp3,Encrypted=true,DeleteOnTermination=true}' \
      --tag-specifications "ResourceType=instance,Tags=[$TAGS]" "ResourceType=volume,Tags=[$TAGS]" \
      --query 'Instances[0].InstanceId' 2> "$HERE/.run-instances.err"); then
      break
    fi
    grep -q "Invalid IAM Instance Profile" "$HERE/.run-instances.err" || { cat "$HERE/.run-instances.err" >&2; exit 1; }
    echo "instance profile not visible yet, retrying in 10s ($attempt/6)"
    sleep 10
  done
  rm -f "$HERE/.run-instances.err"
  none "$INSTANCE_ID" && die "run-instances failed"
fi
echo "$INSTANCE_ID"
awsr ec2 wait instance-running --instance-ids "$INSTANCE_ID"

HOST="$(printf '%s' "$IP" | tr . -).sslip.io"
cat > "$STATE_FILE" <<EOF
# Written by create-server.sh. No secrets here.
REGION=$REGION
INSTANCE_ID=$INSTANCE_ID
PUBLIC_IP=$IP
SITE_HOST=$HOST
EOF

log "Waiting for the SSM agent to come online (1-3 minutes)"
for _ in $(seq 1 60); do
  PING=$(awsr ssm describe-instance-information --filters "Key=InstanceIds,Values=$INSTANCE_ID" \
    --query 'InstanceInformationList[0].PingStatus' 2> /dev/null || true)
  [ "$PING" = "Online" ] && break
  printf '.'
  sleep 5
done
echo
[ "$PING" = "Online" ] || die "SSM agent not online after 5 minutes. Check the instance in the EC2 console."

log "Done"
cat <<EOF
Instance : $INSTANCE_ID
IP       : $IP
Site     : https://$HOST   (after deploy.sh)
Shell    : aws ssm start-session --target $INSTANCE_ID --region $REGION
Next     : bash deploy/aws/deploy.sh
EOF
