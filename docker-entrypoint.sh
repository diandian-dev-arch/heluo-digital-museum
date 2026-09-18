#!/bin/sh
set -eu
if [ -r /app/pocketbay.properties ]; then
  umask 077
  cp /app/pocketbay.properties /tmp/pocketbay.properties
  chown museum:museum /tmp/pocketbay.properties
  export SPRING_CONFIG_IMPORT=optional:file:/tmp/pocketbay.properties
fi
chown -R museum:museum /data
exec setpriv --reuid=museum --regid=museum --init-groups java -jar /app/app.jar
