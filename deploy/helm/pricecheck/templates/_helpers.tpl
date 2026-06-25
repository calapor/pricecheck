{{/* Base name */}}
{{- define "pricecheck.name" -}}
{{- default .Chart.Name .Values.nameOverride | trunc 63 | trimSuffix "-" -}}
{{- end -}}

{{/* Fully qualified app name */}}
{{- define "pricecheck.fullname" -}}
{{- if .Values.fullnameOverride -}}
{{- .Values.fullnameOverride | trunc 63 | trimSuffix "-" -}}
{{- else -}}
{{- $name := default .Chart.Name .Values.nameOverride -}}
{{- if contains $name .Release.Name -}}
{{- .Release.Name | trunc 63 | trimSuffix "-" -}}
{{- else -}}
{{- printf "%s-%s" .Release.Name $name | trunc 63 | trimSuffix "-" -}}
{{- end -}}
{{- end -}}
{{- end -}}

{{/* Common labels */}}
{{- define "pricecheck.labels" -}}
helm.sh/chart: {{ printf "%s-%s" .Chart.Name .Chart.Version | replace "+" "_" | trunc 63 | trimSuffix "-" }}
app.kubernetes.io/managed-by: {{ .Release.Service }}
app.kubernetes.io/part-of: pricecheck
app.kubernetes.io/version: {{ .Chart.AppVersion | quote }}
{{- end -}}

{{/* Selector labels (component appended at call site) */}}
{{- define "pricecheck.selectorLabels" -}}
app.kubernetes.io/name: {{ include "pricecheck.name" . }}
app.kubernetes.io/instance: {{ .Release.Name }}
{{- end -}}

{{/* Name of the Secret holding DATABASE_URL + REDIS_URL */}}
{{- define "pricecheck.envSecretName" -}}
{{- if .Values.secrets.existingSecret -}}
{{- .Values.secrets.existingSecret -}}
{{- else -}}
{{- printf "%s-env" (include "pricecheck.fullname" .) -}}
{{- end -}}
{{- end -}}

{{/* DATABASE_URL — in-cluster Postgres service, or the supplied external URL */}}
{{- define "pricecheck.databaseUrl" -}}
{{- if .Values.postgres.enabled -}}
{{- printf "postgres://%s:%s@%s-postgres:5432/%s" .Values.postgres.username .Values.postgres.password (include "pricecheck.fullname" .) .Values.postgres.database -}}
{{- else -}}
{{- required "secrets.databaseUrl is required when postgres.enabled=false and secrets.create=true" .Values.secrets.databaseUrl -}}
{{- end -}}
{{- end -}}

{{/* REDIS_URL — in-cluster Redis service, or the supplied external URL */}}
{{- define "pricecheck.redisUrl" -}}
{{- if .Values.redis.enabled -}}
{{- printf "redis://%s-redis:6379" (include "pricecheck.fullname" .) -}}
{{- else -}}
{{- required "secrets.redisUrl is required when redis.enabled=false and secrets.create=true" .Values.secrets.redisUrl -}}
{{- end -}}
{{- end -}}

{{/* Web image reference */}}
{{- define "pricecheck.webImage" -}}
{{- printf "%s/%s/web:%s" .Values.image.registry .Values.image.repository (.Values.image.tag | toString) -}}
{{- end -}}

{{/* Worker image reference (also runs scheduler + migrations) */}}
{{- define "pricecheck.workerImage" -}}
{{- printf "%s/%s/worker:%s" .Values.image.registry .Values.image.repository (.Values.image.tag | toString) -}}
{{- end -}}

{{/* imagePullSecrets block */}}
{{- define "pricecheck.imagePullSecrets" -}}
{{- with .Values.imagePullSecrets }}
imagePullSecrets:
{{ toYaml . }}
{{- end }}
{{- end -}}
