#!/usr/bin/env bash
set -euo pipefail

INSTANCE_OCID="${INSTANCE_OCID:-ocid1.instance.oc1.ap-chuncheon-1.an4w4ljrsevdjkyclwfq7i3hm5whxk36gqmtu24r65fyiun3i2n3kezccyvq}"
REGION="${REGION:-${OCI_CLI_REGION:-ap-chuncheon-1}}"
BACKUP_PREFIX="${BACKUP_PREFIX:-coldwaterkim-pre-imac-boot}"
CREATE_BACKUP="${CREATE_BACKUP:-0}"

usage() {
  cat <<'USAGE'
Inspect the running Oracle VM boot volume and optionally create a FULL boot
volume backup without rebooting the production instance.

Usage:
  deploy/oracle/create-boot-volume-backup.sh
  CREATE_BACKUP=1 deploy/oracle/create-boot-volume-backup.sh

Environment:
  INSTANCE_OCID   target compute instance OCID
  REGION          OCI region, default ap-chuncheon-1
  BACKUP_PREFIX   backup display-name prefix
  CREATE_BACKUP   set to 1 to actually create the backup

Notes:
  - Run this in Oracle Cloud Shell or another OCI CLI session already signed in.
  - This is not a PocketBase logical backup. It is a recovery fallback for
    reading /home/pocketbase/pb_data from a restored/attached boot volume.
  - A live boot volume backup can be crash-consistent. Prefer PocketBase's own
    backup once superuser or shell access is recovered.
  - OCI backup storage can count toward billable storage. Check limits first.
USAGE
}

if [[ "${1:-}" == "-h" || "${1:-}" == "--help" ]]; then
  usage
  exit 0
fi

need() {
  if ! command -v "$1" >/dev/null 2>&1; then
    echo "Missing required command: $1" >&2
    exit 1
  fi
}

oci_query() {
  oci --region "$REGION" "$@" --raw-output
}

need oci

echo "Oracle boot volume backup inspector"
echo "region: $REGION"
echo "instance: $INSTANCE_OCID"
echo

COMPARTMENT_ID="$(oci_query compute instance get --instance-id "$INSTANCE_OCID" --query 'data."compartment-id"')"
AVAILABILITY_DOMAIN="$(oci_query compute instance get --instance-id "$INSTANCE_OCID" --query 'data."availability-domain"')"
DISPLAY_NAME="$(oci_query compute instance get --instance-id "$INSTANCE_OCID" --query 'data."display-name"')"
LIFECYCLE_STATE="$(oci_query compute instance get --instance-id "$INSTANCE_OCID" --query 'data."lifecycle-state"')"
SHAPE="$(oci_query compute instance get --instance-id "$INSTANCE_OCID" --query 'data.shape')"

echo "instanceName: $DISPLAY_NAME"
echo "lifecycleState: $LIFECYCLE_STATE"
echo "shape: $SHAPE"
echo "availabilityDomain: $AVAILABILITY_DOMAIN"
echo "compartmentId: $COMPARTMENT_ID"
echo

BOOT_VOLUME_ID="$(
  oci_query compute boot-volume-attachment list \
    --availability-domain "$AVAILABILITY_DOMAIN" \
    --compartment-id "$COMPARTMENT_ID" \
    --instance-id "$INSTANCE_OCID" \
    --query 'data[0]."boot-volume-id"'
)"

if [[ -z "$BOOT_VOLUME_ID" || "$BOOT_VOLUME_ID" == "null" ]]; then
  echo "Could not find a boot volume attachment for this instance." >&2
  exit 1
fi

BOOT_VOLUME_SIZE_GB="$(oci_query bv boot-volume get --boot-volume-id "$BOOT_VOLUME_ID" --query 'data."size-in-gbs"')"
BOOT_VOLUME_STATE="$(oci_query bv boot-volume get --boot-volume-id "$BOOT_VOLUME_ID" --query 'data."lifecycle-state"')"
BACKUP_NAME="${BACKUP_PREFIX}-$(date -u +%Y%m%d%H%M%S)"

echo "bootVolumeId: $BOOT_VOLUME_ID"
echo "bootVolumeState: $BOOT_VOLUME_STATE"
echo "bootVolumeSizeGB: $BOOT_VOLUME_SIZE_GB"
echo "plannedBackupName: $BACKUP_NAME"
echo

if [[ "$CREATE_BACKUP" != "1" ]]; then
  cat <<EOF
Dry run only. No OCI resource was created.

To create the FULL boot volume backup, rerun:

  CREATE_BACKUP=1 INSTANCE_OCID="$INSTANCE_OCID" REGION="$REGION" BACKUP_PREFIX="$BACKUP_PREFIX" "$0"

EOF
  exit 0
fi

cat <<EOF
About to create a FULL boot volume backup.

Instance remains running, but this is a storage-level fallback, not a logical
PocketBase backup. Type CREATE to continue.
EOF

printf "> "
read -r CONFIRM
if [[ "$CONFIRM" != "CREATE" ]]; then
  echo "Cancelled."
  exit 1
fi

BACKUP_ID="$(
  oci_query bv boot-volume-backup create \
    --boot-volume-id "$BOOT_VOLUME_ID" \
    --display-name "$BACKUP_NAME" \
    --type FULL \
    --wait-for-state AVAILABLE \
    --query 'data.id'
)"

echo
echo "Boot volume backup is AVAILABLE."
echo "backupId: $BACKUP_ID"
echo "backupName: $BACKUP_NAME"
echo
cat <<EOF
Next recovery path:
1. Restore this backup to a temporary boot volume in the same availability domain.
2. Attach the restored volume read-only or as a secondary volume to a helper VM.
3. Mount the Linux partition and copy /home/pocketbase/pb_data.
4. Verify the copied pb_data with:
   npm run pb:verify:data -- <copied-pb-data> --schema pb_schema.json

Keep the production instance running until the copied PocketBase data is verified.
EOF
