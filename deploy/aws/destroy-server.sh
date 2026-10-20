#!/usr/bin/env bash
# Deletes everything create-server.sh made, including the server's disk and THE DATABASE.
# The budget alert is kept (it's free and still protects the account).
#
#   bash deploy/aws/destroy-server.sh
set -euo pipefail
. "$(dirname "$0")/lib.sh"
ROLE="$NAME-ec2"

read -r -p "This permanently deletes the SplitSmart server and its data. Type 'delete' to continue: " answer
[ "$answer" = "delete" ] || die "cancelled"

log "Instance"
IDS=$(awsr ec2 describe-instances --filters "Name=tag:Name,Values=$NAME" \
  Name=instance-state-name,Values=pending,running,stopping,stopped --query 'Reservations[].Instances[].InstanceId')
if ! none "$IDS"; then
  # shellcheck disable=SC2086
  awsr ec2 terminate-instances --instance-ids $IDS > /dev/null
  # shellcheck disable=SC2086
  awsr ec2 wait instance-terminated --instance-ids $IDS
  echo "terminated $IDS"
fi

log "Elastic IP (billed while it exists, even unattached)"
for alloc in $(awsr ec2 describe-addresses --filters "Name=tag:Name,Values=$NAME" --query 'Addresses[].AllocationId'); do
  assoc=$(awsr ec2 describe-addresses --allocation-ids "$alloc" --query 'Addresses[0].AssociationId')
  none "$assoc" || awsr ec2 disassociate-address --association-id "$assoc"
  awsr ec2 release-address --allocation-id "$alloc" && echo "released $alloc"
done

log "Network interface"
for eni in $(awsr ec2 describe-network-interfaces --filters "Name=tag:Name,Values=$NAME" --query 'NetworkInterfaces[].NetworkInterfaceId'); do
  awsr ec2 delete-network-interface --network-interface-id "$eni" && echo "deleted $eni"
done

log "Security group"
SG=$(awsr ec2 describe-security-groups --filters "Name=group-name,Values=$NAME-web" --query 'SecurityGroups[0].GroupId')
none "$SG" || { awsr ec2 delete-security-group --group-id "$SG" && echo "deleted $SG"; }

log "IAM role"
if awsr iam get-role --role-name "$ROLE" > /dev/null 2>&1; then
  awsr iam remove-role-from-instance-profile --instance-profile-name "$ROLE" --role-name "$ROLE" 2> /dev/null || true
  awsr iam delete-instance-profile --instance-profile-name "$ROLE" 2> /dev/null || true
  awsr iam detach-role-policy --role-name "$ROLE" --policy-arn arn:aws:iam::aws:policy/AmazonSSMManagedInstanceCore 2> /dev/null || true
  awsr iam delete-role-policy --role-name "$ROLE" --policy-name deny-parameter-store 2> /dev/null || true
  awsr iam delete-role --role-name "$ROLE" && echo "deleted $ROLE"
fi

rm -f "$STATE_FILE"
log "Done. Nothing billable from SplitSmart remains (budget alert kept)."
